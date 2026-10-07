import { randomUUID } from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../src/db/sequelize';
import { FundingTransaction } from '../src/db/models';
import { dec } from '../src/lib/money';
import { lockWallet, postEntry } from '../src/services/ledgerService';
import * as memberService from '../src/services/memberService';
import { FundingStatus, FundingType, LedgerKind, Table } from '../src/lib/constants';

export async function createMemberWithWallet(username: string) {
  const { member, wallet } = await memberService.createMember(username);
  return { memberId: member.id, walletId: wallet.id };
}

// Puts money in a wallet without going through the HTTP deposit/callback flow, so wager and
// withdrawal tests do not depend on the callback code. Writes the ledger like a real credit.
export async function seedCompletedDeposit(memberId: string, amount: string, turnoverMultiplier = 1) {
  return sequelize.transaction(async (t) => {
    const wallet = await lockWallet(t, { memberId });
    if (!wallet) throw new Error('wallet not found');
    const deposit = await FundingTransaction.create(
      {
        memberId,
        walletId: wallet.id,
        type: FundingType.DEPOSIT,
        status: FundingStatus.COMPLETED,
        amount,
        turnoverMultiplier,
        pspRef: `seed_${randomUUID()}`,
      },
      { transaction: t },
    );
    await postEntry(t, wallet, LedgerKind.DEPOSIT_CREDIT, dec(amount), { fundingTransactionId: deposit.id });
    return deposit;
  });
}

export async function getBalance(walletId: string): Promise<string> {
  const [row] = await sequelize.query<{ balance: string }>(
    `SELECT balance::text AS balance FROM ${Table.WALLETS} WHERE id = :walletId`,
    { replacements: { walletId }, type: QueryTypes.SELECT },
  );
  return row.balance;
}

export async function ledgerRows(walletId: string) {
  return sequelize.query<{ kind: string; amount: string; balance_after: string }>(
    `SELECT kind, amount::text AS amount, balance_after::text AS balance_after
       FROM ${Table.WALLET_TXS} WHERE wallet_id = :walletId ORDER BY seq`,
    { replacements: { walletId }, type: QueryTypes.SELECT },
  );
}

// The core invariant: balance is reconstructible from the append-only ledger.
export async function assertLedgerMatchesBalance(walletId: string) {
  const balance = dec(await getBalance(walletId));
  const [sum] = await sequelize.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount), 0)::text AS total FROM ${Table.WALLET_TXS} WHERE wallet_id = :walletId`,
    { replacements: { walletId }, type: QueryTypes.SELECT },
  );
  expect(dec(sum.total).toFixed(18)).toBe(balance.toFixed(18));

  const [last] = await sequelize.query<{ balance_after: string }>(
    `SELECT balance_after::text AS balance_after FROM ${Table.WALLET_TXS}
      WHERE wallet_id = :walletId ORDER BY seq DESC LIMIT 1`,
    { replacements: { walletId }, type: QueryTypes.SELECT },
  );
  if (last) expect(dec(last.balance_after).toFixed(18)).toBe(balance.toFixed(18));
}
