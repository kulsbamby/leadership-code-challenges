import { Server } from 'http';
import request from 'supertest';
import { createApp } from '../src/app';
import { placeWager } from '../src/services/wagerService';
import { sequelize } from '../src/db/sequelize';
import { Wager } from '../src/db/models';
import {
  assertLedgerMatchesBalance,
  createMemberWithWallet,
  getBalance,
  ledgerRows,
  seedCompletedDeposit,
} from './helpers';
import { ErrorCode, HttpStatus, LedgerKind, paths } from '../src/lib/constants';
import { Concurrency, MALFORMED_ID, TOO_MANY_DECIMALS, UNKNOWN_ID, ZERO_BALANCE } from './constants';

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

const wager = (walletId: string, amount: string) =>
  request(server).post(paths.wagers(walletId)).send({ amount });

describe('POST /wallets/:walletId/wagers', () => {
  it('debits the wallet, records the wager and writes a ledger debit', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, '100');

    const res = await wager(walletId, '10.00');

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.balance).toBe('90.000000000000000000');
    expect(await getBalance(walletId)).toBe('90.000000000000000000');
    const rows = await ledgerRows(walletId);
    expect(rows[rows.length - 1]).toMatchObject({ kind: LedgerKind.WAGER_DEBIT, amount: '-10.000000000000000000' });
    await assertLedgerMatchesBalance(walletId);
  });

  it('rejects an insufficient balance with 422 and changes nothing', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, '5');

    const res = await wager(walletId, '10');

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE);
    expect(res.body.error).toBe(ErrorCode.INSUFFICIENT_BALANCE);
    expect(await getBalance(walletId)).toBe('5.000000000000000000');
    expect(await Wager.count()).toBe(0);
    expect(await ledgerRows(walletId)).toHaveLength(1);
  });

  it('cannot overdraw under concurrent wagers: exactly one of five succeeds', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, '10');

    const results = await Promise.all(Array.from({ length: Concurrency.OVERDRAW_WAGERS }, () => wager(walletId, '10')));

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([HttpStatus.CREATED, HttpStatus.UNPROCESSABLE, HttpStatus.UNPROCESSABLE, HttpStatus.UNPROCESSABLE, HttpStatus.UNPROCESSABLE]);
    expect(await getBalance(walletId)).toBe(ZERO_BALANCE);
    expect(await Wager.count()).toBe(1);
    await assertLedgerMatchesBalance(walletId);
  });

  it('cannot overdraw under 20 truly simultaneous wagers (service level)', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, '30');

    const results = await Promise.allSettled(
      Array.from({ length: Concurrency.SIMULTANEOUS_WAGERS }, () => placeWager({ walletId, amount: '10' })),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(17);
    expect(await getBalance(walletId)).toBe(ZERO_BALANCE);
    expect(await Wager.count()).toBe(3);
    await assertLedgerMatchesBalance(walletId);
  });

  it('accepts as many concurrent wagers as the balance can afford', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, '30');

    const results = await Promise.all(Array.from({ length: Concurrency.AFFORDABLE_WAGER_RACERS }, () => wager(walletId, '10')));

    expect(results.filter((r) => r.status === HttpStatus.CREATED)).toHaveLength(3);
    expect(results.filter((r) => r.status === HttpStatus.UNPROCESSABLE)).toHaveLength(5);
    expect(await getBalance(walletId)).toBe(ZERO_BALANCE);
    await assertLedgerMatchesBalance(walletId);
  });

  it('returns 404 for an unknown wallet', async () => {
    const res = await wager(UNKNOWN_ID, '10');
    expect(res.status).toBe(HttpStatus.NOT_FOUND);
    expect(res.body.error).toBe(ErrorCode.WALLET_NOT_FOUND);
  });

  it.each(['0', '-1', 'abc', TOO_MANY_DECIMALS])('rejects amount %s with 400', async (amount) => {
    const { walletId } = await createMemberWithWallet('alice01');
    const res = await wager(walletId, amount);
    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('rejects a malformed walletId with 400', async () => {
    const res = await wager(MALFORMED_ID, '10');
    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
  });
});
