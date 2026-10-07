import { Server } from 'http';
import request from 'supertest';
import { createApp } from '../src/app';
import { sequelize } from '../src/db/sequelize';
import '../src/db/models';
import {
  assertLedgerMatchesBalance,
  createMemberWithWallet,
  ledgerRows,
} from './helpers';
import { CallbackStatus, LedgerKind, Table, paths } from '../src/lib/constants';
import { DbConstraint, LEDGER_APPEND_ONLY_MESSAGE } from './constants';

const app = createApp();
let server: Server;

beforeAll(async () => {
  await sequelize.authenticate();
  // One shared listening server: supertest's per-request ephemeral servers are flaky under
  // dozens of simultaneous requests (port reuse surfaces as an HTTP "Parse Error").
  server = app.listen(0);
});
beforeEach(async () => {
  await sequelize.truncate({ cascade: true });
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await sequelize.close();
});

async function fundThroughApi(memberId: string, amount: string, multiplier: number) {
  const dep = await request(server).post(paths.deposits()).send({ memberId, amount, turnoverMultiplier: multiplier });
  await request(server).post(paths.pspCallbacks()).send({ pspRef: dep.body.pspRef, status: CallbackStatus.COMPLETED, amount });
  return dep.body as { id: string; pspRef: string };
}

describe('ledger', () => {
  it('reconstructs the balance after a mixed flow, with no entries from rejected operations', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');

    await fundThroughApi(memberId, '100', 1);
    await request(server).post(paths.wagers(walletId)).send({ amount: '30' }); // ok
    await request(server).post(paths.wagers(walletId)).send({ amount: '500' }); // rejected
    await request(server).post(paths.withdrawals()).send({ memberId, amount: '10' }); // blocked by turnover
    await request(server).post(paths.wagers(walletId)).send({ amount: '70' }); // ok, balance 0
    await fundThroughApi(memberId, '40', 0);
    await request(server).post(paths.withdrawals()).send({ memberId, amount: '25' }); // ok
    await request(server).post(paths.withdrawals()).send({ memberId, amount: '25' }); // rejected: balance 15

    const rows = await ledgerRows(walletId);
    expect(rows.map((r) => r.kind)).toEqual([
      LedgerKind.DEPOSIT_CREDIT,
      LedgerKind.WAGER_DEBIT,
      LedgerKind.WAGER_DEBIT,
      LedgerKind.DEPOSIT_CREDIT,
      LedgerKind.WITHDRAWAL_DEBIT,
    ]);
    await assertLedgerMatchesBalance(walletId);
  });

  it('rejects UPDATE and DELETE on the ledger in the database', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    await fundThroughApi(memberId, '10', 1);

    await expect(sequelize.query(`UPDATE ${Table.WALLET_TXS} SET amount = amount`)).rejects.toThrow(LEDGER_APPEND_ONLY_MESSAGE);
    await expect(sequelize.query(`DELETE FROM ${Table.WALLET_TXS}`)).rejects.toThrow(LEDGER_APPEND_ONLY_MESSAGE);
    expect(await ledgerRows(walletId)).toHaveLength(1);
  });

  it('rejects a negative wallet balance in the database', async () => {
    const { walletId } = await createMemberWithWallet('alice01');
    await expect(
      sequelize.query(`UPDATE ${Table.WALLETS} SET balance = -1 WHERE id = :walletId`, { replacements: { walletId } }),
    ).rejects.toThrow(DbConstraint.WALLET_BALANCE_NON_NEGATIVE);
  });

  it('rejects a second deposit_credit for the same funding transaction in the database', async () => {
    const { memberId } = await createMemberWithWallet('alice01');
    const dep = await fundThroughApi(memberId, '10', 1);

    // Sequelize wraps unique violations as a generic "Validation error"; the constraint name is on `original`.
    const err = await sequelize
      .query(
        `INSERT INTO ${Table.WALLET_TXS} (wallet_id, kind, amount, balance_after, funding_transaction_id)
         SELECT wallet_id, kind, amount, balance_after, funding_transaction_id
           FROM ${Table.WALLET_TXS} WHERE funding_transaction_id = :id`,
        { replacements: { id: dep.id } },
      )
      .then(() => null, (e) => e);
    expect(err?.original?.constraint).toBe(DbConstraint.WALLET_TXS_FUNDING_KIND_UNIQUE);
  });
});
