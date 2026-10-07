import BigNumber from 'bignumber.js';
import { Transaction, WhereOptions } from 'sequelize';
import { Wallet, WalletTx } from '../db/models';
import { ErrorCode, HttpStatus, LedgerKind } from '../lib/constants';
import { AppError } from '../lib/errors';
import { dec, fmt } from '../lib/money';

// Row-locks the wallet (SELECT ... FOR UPDATE). Every balance change starts here: the lock
// serializes concurrent wagers, withdrawals and credits on the same wallet.
export async function lockWallet(t: Transaction, where: WhereOptions): Promise<Wallet | null> {
  return Wallet.findOne({ where, transaction: t, lock: t.LOCK.UPDATE });
}

// The ONLY writer of wallets.balance. Updates the balance and appends the ledger row in the
// caller's transaction. `wallet` must have been loaded through lockWallet in that transaction.
export async function postEntry(
  t: Transaction,
  wallet: Wallet,
  kind: LedgerKind,
  signedAmount: BigNumber,
  refs: { fundingTransactionId?: string; wagerId?: string } = {},
): Promise<void> {
  const current = dec(wallet.balance);
  const next = current.plus(signedAmount);
  if (next.isNegative()) {
    throw new AppError(HttpStatus.UNPROCESSABLE, ErrorCode.INSUFFICIENT_BALANCE, {
      balance: fmt(current),
      requested: fmt(signedAmount.abs()),
    });
  }

  await Wallet.update({ balance: fmt(next) }, { where: { id: wallet.id }, transaction: t });
  await WalletTx.create(
    {
      walletId: wallet.id,
      kind,
      amount: fmt(signedAmount),
      balanceAfter: fmt(next),
      fundingTransactionId: refs.fundingTransactionId ?? null,
      wagerId: refs.wagerId ?? null,
    },
    { transaction: t },
  );
  wallet.balance = fmt(next);
}
