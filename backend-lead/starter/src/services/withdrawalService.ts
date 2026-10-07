import { FundingTransaction } from '../db/models';
import {
  ErrorCode,
  FundingStatus,
  FundingType,
  HttpStatus,
  IdempotencyScope,
  idempotencyScope,
  LedgerKind,
  WITHDRAWAL_TURNOVER_MULTIPLIER,
} from '../lib/constants';
import { AppError } from '../lib/errors';
import { runIdempotent } from '../lib/idempotency';
import { dec, fmt } from '../lib/money';
import { lockWallet, postEntry } from './ledgerService';
import { getTurnover } from './turnoverService';

export interface WithdrawalInput {
  memberId: string;
  amount: string;
  idempotencyKey?: string;
}

// Under the wallet lock: turnover lock first (422 with the outstanding amount), then balance
// (inside postEntry), then debit immediately and create a Pending withdrawal. Approval is out of scope.
export async function requestWithdrawal(input: WithdrawalInput) {
  const amount = dec(input.amount);
  return runIdempotent({
    key: input.idempotencyKey,
    scope: idempotencyScope(IdempotencyScope.WITHDRAWALS, input.memberId),
    payload: { memberId: input.memberId, amount: fmt(amount) },
    work: async (t) => {
      const wallet = await lockWallet(t, { memberId: input.memberId });
      if (!wallet) throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.MEMBER_NOT_FOUND);

      const turnover = await getTurnover(t, input.memberId, wallet.id);
      if (turnover.outstanding.gt(0)) {
        throw new AppError(HttpStatus.UNPROCESSABLE, ErrorCode.TURNOVER_NOT_MET, {
          required: fmt(turnover.required),
          accrued: fmt(turnover.accrued),
          outstanding: fmt(turnover.outstanding),
        });
      }

      const withdrawal = await FundingTransaction.create(
        {
          memberId: input.memberId,
          walletId: wallet.id,
          type: FundingType.WITHDRAWAL,
          status: FundingStatus.PENDING,
          amount: fmt(amount),
          turnoverMultiplier: WITHDRAWAL_TURNOVER_MULTIPLIER,
          pspRef: null,
        },
        { transaction: t },
      );
      await postEntry(t, wallet, LedgerKind.WITHDRAWAL_DEBIT, amount.negated(), {
        fundingTransactionId: withdrawal.id,
      });
      return {
        id: withdrawal.id,
        status: withdrawal.status,
        amount: fmt(amount),
        balance: wallet.balance,
      };
    },
  });
}
