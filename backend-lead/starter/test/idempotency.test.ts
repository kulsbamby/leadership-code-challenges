import { Server } from 'http';
import request from 'supertest';
import { createApp } from '../src/app';
import { sequelize } from '../src/db/sequelize';
import { FundingTransaction, Wager } from '../src/db/models';
import {
  assertLedgerMatchesBalance,
  createMemberWithWallet,
  getBalance,
  ledgerRows,
  seedCompletedDeposit,
} from './helpers';
import { ErrorCode, FundingType, HttpStatus, IDEMPOTENCY_KEY_HEADER, paths } from '../src/lib/constants';
import { Concurrency } from './constants';

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

const withdraw = (memberId: string, amount: string, key?: string) => {
  const req = request(server).post(paths.withdrawals());
  if (key) req.set(IDEMPOTENCY_KEY_HEADER, key);
  return req.send({ memberId, amount });
};

describe(IDEMPOTENCY_KEY_HEADER, () => {
  it('replays the original withdrawal response and debits once', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, '100', 0);

    const first = await withdraw(memberId, '30', 'key-1');
    const second = await withdraw(memberId, '30.00', 'key-1');

    expect(first.status).toBe(HttpStatus.CREATED);
    expect(second.status).toBe(HttpStatus.CREATED);
    expect(second.body).toEqual(first.body);
    expect(await getBalance(walletId)).toBe('70.000000000000000000');
    expect(await FundingTransaction.count({ where: { type: FundingType.WITHDRAWAL } })).toBe(1);
    expect(await ledgerRows(walletId)).toHaveLength(2);
    await assertLedgerMatchesBalance(walletId);
  });

  it('rejects the same key with a different payload (422) and changes nothing', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, '100', 0);
    await withdraw(memberId, '30', 'key-1');

    const res = await withdraw(memberId, '31', 'key-1');

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE);
    expect(res.body.error).toBe(ErrorCode.IDEMPOTENCY_KEY_REUSE);
    expect(await getBalance(walletId)).toBe('70.000000000000000000');
  });

  it('debits exactly once for 10 concurrent withdrawals sharing a key', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, '100', 0);

    const results = await Promise.all(Array.from({ length: Concurrency.KEY_DUPLICATES }, () => withdraw(memberId, '30', 'same-key')));

    expect(results.every((r) => r.status === HttpStatus.CREATED)).toBe(true);
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
    expect(await getBalance(walletId)).toBe('70.000000000000000000');
    expect(await FundingTransaction.count({ where: { type: FundingType.WITHDRAWAL } })).toBe(1);
    await assertLedgerMatchesBalance(walletId);
  });

  it('does not burn the key on a failed request: a retry after funding succeeds', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');

    const failed = await withdraw(memberId, '30', 'retry-key');
    expect(failed.status).toBe(HttpStatus.UNPROCESSABLE);

    await seedCompletedDeposit(memberId, '100', 0);
    const retried = await withdraw(memberId, '30', 'retry-key');

    expect(retried.status).toBe(HttpStatus.CREATED);
    expect(await getBalance(walletId)).toBe('70.000000000000000000');
  });

  it('scopes keys per member: the same key for two members is independent', async () => {
    const a = await createMemberWithWallet('alice01');
    const b = await createMemberWithWallet('bob0001');
    await seedCompletedDeposit(a.memberId, '100', 0);
    await seedCompletedDeposit(b.memberId, '100', 0);

    const ra = await withdraw(a.memberId, '10', 'shared');
    const rb = await withdraw(b.memberId, '10', 'shared');

    expect(ra.status).toBe(HttpStatus.CREATED);
    expect(rb.status).toBe(HttpStatus.CREATED);
    expect(ra.body.id).not.toBe(rb.body.id);
  });

  it('replays deposits and wagers too', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');

    const d1 = await request(server).post(paths.deposits()).set(IDEMPOTENCY_KEY_HEADER, 'dep-1').send({ memberId, amount: '10' });
    const d2 = await request(server).post(paths.deposits()).set(IDEMPOTENCY_KEY_HEADER, 'dep-1').send({ memberId, amount: '10' });
    expect(d2.body).toEqual(d1.body);
    expect(await FundingTransaction.count({ where: { type: FundingType.DEPOSIT } })).toBe(1);

    await seedCompletedDeposit(memberId, '50', 0);
    const w = () =>
      request(server).post(paths.wagers(walletId)).set(IDEMPOTENCY_KEY_HEADER, 'wag-1').send({ amount: '5' });
    const w1 = await w();
    const w2 = await w();
    expect(w2.status).toBe(HttpStatus.CREATED);
    expect(w2.body).toEqual(w1.body);
    expect(await Wager.count()).toBe(1);
    expect(await getBalance(walletId)).toBe('45.000000000000000000');
  });

  it('behaves as before without the header (two identical requests are two withdrawals)', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');
    await seedCompletedDeposit(memberId, '100', 0);

    await withdraw(memberId, '10');
    await withdraw(memberId, '10');

    expect(await getBalance(walletId)).toBe('80.000000000000000000');
  });
});
