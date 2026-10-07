import { Wager } from '../db/models';
import {
  ErrorCode,
  HttpStatus,
  IdempotencyScope,
  idempotencyScope,
  LedgerKind,
} from '../lib/constants';
import { AppError } from '../lib/errors';
import { runIdempotent } from '../lib/idempotency';
import { dec, fmt } from '../lib/money';
import { lockWallet, postEntry } from './ledgerService';

export interface WagerInput {
  walletId: string;
  amount: string;
  idempotencyKey?: string;
}

// Debits the wallet and records the wager (which accrues turnover). The wallet row lock makes
// concurrent wagers take turns; postEntry rejects a debit that would go below zero.
export async function placeWager(input: WagerInput) {
  const amount = dec(input.amount);
  return runIdempotent({
    key: input.idempotencyKey,
    scope: idempotencyScope(IdempotencyScope.WAGERS, input.walletId),
    payload: { walletId: input.walletId, amount: fmt(amount) },
    work: async (t) => {
      const wallet = await lockWallet(t, { id: input.walletId });
      if (!wallet) throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.WALLET_NOT_FOUND);
      const wager = await Wager.create(
        { walletId: wallet.id, amount: fmt(amount) },
        { transaction: t },
      );
      await postEntry(t, wallet, LedgerKind.WAGER_DEBIT, amount.negated(), { wagerId: wager.id });
      return {
        id: wager.id,
        walletId: wallet.id,
        amount: fmt(amount),
        balance: wallet.balance,
      };
    },
  });
}
