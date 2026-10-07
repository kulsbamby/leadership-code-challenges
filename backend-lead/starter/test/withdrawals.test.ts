import { Server } from 'http';
import request from 'supertest';
import { createApp } from '../src/app';
import { sequelize } from '../src/db/sequelize';
import { FundingTransaction } from '../src/db/models';
import {
  assertLedgerMatchesBalance,
  createMemberWithWallet,
  getBalance,
  ledgerRows,
  seedCompletedDeposit,
} from './helpers';
import { ErrorCode, FundingStatus, FundingType, HttpStatus, LedgerKind, paths } from '../src/lib/constants';
import { Concurrency, SMALLEST_AMOUNT, UNKNOWN_ID, ZERO_BALANCE } from './constants';

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

const withdraw = (memberId: string, amount: string) =>
  request(server).post(paths.withdrawals()).send({ memberId, amount });
const wager = (walletId: string, amount: string) =>
  request(server).post(paths.wagers(walletId)).send({ amount });

describe('POST /withdrawals', () => {
  it('blocks the withdrawal until turnover is met, then unblocks it', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, '100', 1);

    const blocked = await withdraw(memberId, '50');
    expect(blocked.status).toBe(HttpStatus.UNPROCESSABLE);
    expect(blocked.body).toEqual({
      error: ErrorCode.TURNOVER_NOT_MET,
      required: '100.000000000000000000',
      accrued: ZERO_BALANCE,
      outstanding: '100.000000000000000000',
    });
    expect(await getBalance(walletId)).toBe('100.000000000000000000');

    // Partial turnover: 60 of 100.
    await wager(walletId, '60');
    const partial = await withdraw(memberId, '10');
    expect(partial.status).toBe(HttpStatus.UNPROCESSABLE);
    expect(partial.body.outstanding).toBe('40.000000000000000000');

    // Turnover met: 100 of 100.
    await wager(walletId, '40');
    await seedCompletedDeposit(memberId, '100', 0); // refill the balance, adds no requirement
    const ok = await withdraw(memberId, '50');

    expect(ok.status).toBe(HttpStatus.CREATED);
    expect(ok.body.status).toBe(FundingStatus.PENDING);
    expect(ok.body.balance).toBe('50.000000000000000000');
    const rows = await ledgerRows(walletId);
    expect(rows[rows.length - 1]).toMatchObject({
      kind: LedgerKind.WITHDRAWAL_DEBIT,
      amount: '-50.000000000000000000',
    });
    const created = await FundingTransaction.findOne({ where: { type: FundingType.WITHDRAWAL } });
    expect(created?.status).toBe(FundingStatus.PENDING);
    await assertLedgerMatchesBalance(walletId);
  });

  it('adds no requirement for multiplier 0', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, '100', 0);

    const res = await withdraw(memberId, '40');

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(await getBalance(walletId)).toBe('60.000000000000000000');
  });

  it('counts only Completed deposits toward the requirement', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, '100', 0);
    await FundingTransaction.create({
      memberId,
      walletId,
      type: FundingType.DEPOSIT,
      status: FundingStatus.PENDING,
      amount: '500',
      turnoverMultiplier: 10,
      pspRef: 'pending_one',
    });
    await FundingTransaction.create({
      memberId,
      walletId,
      type: FundingType.DEPOSIT,
      status: FundingStatus.FAILED,
      amount: '500',
      turnoverMultiplier: 10,
      pspRef: 'failed_one',
    });

    const res = await withdraw(memberId, '10');

    expect(res.status).toBe(HttpStatus.CREATED);
  });

  it('sums the requirement across completed deposits with different multipliers', async () => {
    const { memberId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, '100', 2); // 200
    await seedCompletedDeposit(memberId, '50', 3); // 150

    const res = await withdraw(memberId, '10');

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE);
    expect(res.body.required).toBe('350.000000000000000000');
    expect(res.body.outstanding).toBe('350.000000000000000000');
  });

  it('reports the outstanding turnover exactly, without exponent notation', async () => {
    const { memberId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, SMALLEST_AMOUNT, 1);

    const res = await withdraw(memberId, SMALLEST_AMOUNT);

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE);
    expect(res.body.outstanding).toBe(SMALLEST_AMOUNT);
  });

  it('rejects an insufficient balance with 422 even when the turnover lock is satisfied', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, '30', 0);

    const res = await withdraw(memberId, '50');

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE);
    expect(res.body.error).toBe(ErrorCode.INSUFFICIENT_BALANCE);
    expect(await getBalance(walletId)).toBe('30.000000000000000000');
    expect(await FundingTransaction.count({ where: { type: FundingType.WITHDRAWAL } })).toBe(0);
    expect(await ledgerRows(walletId)).toHaveLength(1);
  });

  it('cannot overdraw under concurrent withdrawals', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, '100', 0);

    const results = await Promise.all(Array.from({ length: Concurrency.WITHDRAWAL_RACERS }, () => withdraw(memberId, '40')));

    expect(results.filter((r) => r.status === HttpStatus.CREATED)).toHaveLength(2);
    expect(results.filter((r) => r.status === HttpStatus.UNPROCESSABLE)).toHaveLength(3);
    expect(await getBalance(walletId)).toBe('20.000000000000000000');
    expect(await FundingTransaction.count({ where: { type: FundingType.WITHDRAWAL } })).toBe(2);
    await assertLedgerMatchesBalance(walletId);
  });

  it('returns 404 for an unknown member and 400 for a bad amount', async () => {
    const missing = await withdraw(UNKNOWN_ID, '10');
    expect(missing.status).toBe(HttpStatus.NOT_FOUND);

    const { memberId } = await createMemberWithWallet('alice01');
    const bad = await withdraw(memberId, '-5');
    expect(bad.status).toBe(HttpStatus.BAD_REQUEST);
  });
});
