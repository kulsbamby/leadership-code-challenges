import { sequelize } from '../db/sequelize';
import { FundingTransaction } from '../db/models';
import {
  CallbackStatus,
  ErrorCode,
  FundingStatus,
  FundingType,
  HttpStatus,
  LedgerKind,
  Table,
} from '../lib/constants';
import { AmountMismatchError, AppError } from '../lib/errors';
import { dec, fmt } from '../lib/money';
import { Decision, decide, FundingTarget } from './fundingStateMachine';
import { lockWallet, postEntry } from './ledgerService';

export interface CallbackInput {
  pspRef: string;
  status: CallbackStatus;
  amount: string;
}

// Idempotent under duplicate and concurrent delivery:
//  1. lock the funding transaction row (FOR UPDATE): a concurrent duplicate waits here, then sees
//     the terminal state and becomes a no-op;
//  2. the state machine decides apply / noop / reject;
//  3. on the first `completed`, lock the wallet and credit it once (lock order: funding tx, wallet).
// The partial unique index on wallet_txs (funding_transaction_id, kind) backstops a double credit.
export async function handleCallback(input: CallbackInput) {
  try {
    return await sequelize.transaction(async (t) => {
      const deposit = await FundingTransaction.findOne({
        where: { pspRef: input.pspRef, type: FundingType.DEPOSIT },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!deposit) throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.PSP_REF_NOT_FOUND);

      const target: FundingTarget = input.status === CallbackStatus.COMPLETED ? FundingStatus.COMPLETED : FundingStatus.FAILED;
      if (decide(deposit.status, target) === Decision.NOOP) {
        return { status: deposit.status, applied: false };
      }

      if (target === FundingStatus.FAILED) {
        // No money moves on failure, so the callback amount is ignored.
        await deposit.update({ status: FundingStatus.FAILED }, { transaction: t });
        return { status: FundingStatus.FAILED, applied: true };
      }

      if (!dec(input.amount).isEqualTo(dec(deposit.amount))) {
        throw new AmountMismatchError(
          deposit.id,
          deposit.pspRef as string,
          fmt(dec(deposit.amount)),
          fmt(dec(input.amount)),
        );
      }

      await deposit.update({ status: FundingStatus.COMPLETED }, { transaction: t });
      const wallet = await lockWallet(t, { id: deposit.walletId });
      if (!wallet) throw new AppError(HttpStatus.INTERNAL_ERROR, ErrorCode.WALLET_MISSING);
      await postEntry(t, wallet, LedgerKind.DEPOSIT_CREDIT, dec(deposit.amount), {
        fundingTransactionId: deposit.id,
      });
      return { status: FundingStatus.COMPLETED, applied: true };
    });
  } catch (err) {
    if (err instanceof AmountMismatchError) {
      await recordMismatch(err);
      throw new AppError(HttpStatus.UNPROCESSABLE, ErrorCode.AMOUNT_MISMATCH, { expected: err.expected, received: err.received });
    }
    throw err;
  }
}

// Runs after the callback transaction rolled back, in its own transaction, so the evidence
// survives the rejection. One row per distinct (psp_ref, received_amount); repeats bump a counter.
async function recordMismatch(m: AmountMismatchError): Promise<void> {
  await sequelize.query(
    `INSERT INTO ${Table.CALLBACK_MISMATCHES}
       (psp_ref, funding_transaction_id, expected_amount, received_amount)
     VALUES (:pspRef, :fundingTransactionId, :expected, :received)
     ON CONFLICT (psp_ref, received_amount)
     DO UPDATE SET repeat_count = ${Table.CALLBACK_MISMATCHES}.repeat_count + 1, last_seen_at = now()`,
    {
      replacements: {
        pspRef: m.pspRef,
        fundingTransactionId: m.fundingTransactionId,
        expected: m.expected,
        received: m.received,
      },
    },
  );
}
