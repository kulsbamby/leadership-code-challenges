import { randomUUID } from 'crypto';
import { FundingTransaction, Wallet } from '../db/models';
import {
  ErrorCode,
  FundingStatus,
  FundingType,
  HttpStatus,
  IdempotencyScope,
  idempotencyScope,
  PSP_REF_PREFIX,
} from '../lib/constants';
import { AppError } from '../lib/errors';
import { runIdempotent } from '../lib/idempotency';
import { dec, fmt } from '../lib/money';

export interface DepositInput {
  memberId: string;
  amount: string;
  turnoverMultiplier: number;
  idempotencyKey?: string;
}

// Creates a Pending deposit. No money moves: the wallet is only credited by a completed PSP callback.
export async function createDeposit(input: DepositInput) {
  const amount = dec(input.amount);
  return runIdempotent({
    key: input.idempotencyKey,
    scope: idempotencyScope(IdempotencyScope.DEPOSITS, input.memberId),
    payload: {
      memberId: input.memberId,
      amount: fmt(amount),
      turnoverMultiplier: input.turnoverMultiplier,
    },
    work: async (t) => {
      const wallet = await Wallet.findOne({ where: { memberId: input.memberId }, transaction: t });
      if (!wallet) throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.MEMBER_NOT_FOUND);
      const deposit = await FundingTransaction.create(
        {
          memberId: input.memberId,
          walletId: wallet.id,
          type: FundingType.DEPOSIT,
          status: FundingStatus.PENDING,
          amount: fmt(amount),
          turnoverMultiplier: input.turnoverMultiplier,
          pspRef: `${PSP_REF_PREFIX}${randomUUID()}`,
        },
        { transaction: t },
      );
      return {
        id: deposit.id,
        pspRef: deposit.pspRef as string,
        status: deposit.status,
        amount: fmt(amount),
        turnoverMultiplier: deposit.turnoverMultiplier,
      };
    },
  });
}
