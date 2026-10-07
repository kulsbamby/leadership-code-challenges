import { Server } from 'http';
import request from 'supertest';
import { QueryTypes } from 'sequelize';
import { createApp } from '../src/app';
import { handleCallback } from '../src/services/pspCallbackService';
import { sequelize } from '../src/db/sequelize';
import '../src/db/models';
import { assertLedgerMatchesBalance, createMemberWithWallet, getBalance, ledgerRows } from './helpers';
import { CallbackStatus, ErrorCode, FundingStatus, HttpStatus, LedgerKind, Table, paths } from '../src/lib/constants';
import { Concurrency, UNKNOWN_PSP_REF, UNSUPPORTED_CALLBACK_STATUS, ZERO_BALANCE } from './constants';

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

async function newDeposit(amount = '100.50') {
  const { memberId, walletId } = await createMemberWithWallet(`user${Math.random().toString(36).slice(2, 10)}`);
  const res = await request(server).post(paths.deposits()).send({ memberId, amount });
  return { memberId, walletId, pspRef: res.body.pspRef as string, amount };
}

const callback = (pspRef: string, status: string, amount: string) =>
  request(server).post(paths.pspCallbacks()).send({ pspRef, status, amount });

async function mismatchRows() {
  return sequelize.query<{ repeat_count: number; received_amount: string }>(
    `SELECT repeat_count, received_amount::text AS received_amount FROM ${Table.CALLBACK_MISMATCHES}`,
    { type: QueryTypes.SELECT },
  );
}

describe('POST /psp/callbacks', () => {
  it('credits the wallet once on a completed callback', async () => {
    const d = await newDeposit();

    const res = await callback(d.pspRef, CallbackStatus.COMPLETED, d.amount);

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body).toEqual({ status: FundingStatus.COMPLETED, applied: true });
    expect(await getBalance(d.walletId)).toBe('100.500000000000000000');
    const rows = await ledgerRows(d.walletId);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe(LedgerKind.DEPOSIT_CREDIT);
    await assertLedgerMatchesBalance(d.walletId);
  });

  it('does not double-credit a sequential duplicate callback', async () => {
    const d = await newDeposit();

    const first = await callback(d.pspRef, CallbackStatus.COMPLETED, d.amount);
    const second = await callback(d.pspRef, CallbackStatus.COMPLETED, d.amount);

    expect(first.body.applied).toBe(true);
    expect(second.status).toBe(HttpStatus.OK);
    expect(second.body).toEqual({ status: FundingStatus.COMPLETED, applied: false });
    expect(await getBalance(d.walletId)).toBe('100.500000000000000000');
    expect(await ledgerRows(d.walletId)).toHaveLength(1);
    await assertLedgerMatchesBalance(d.walletId);
  });

  it('does not double-credit 50 concurrent duplicate callbacks', async () => {
    const d = await newDeposit();

    const results = await Promise.all(
      Array.from({ length: Concurrency.CALLBACK_DUPLICATES }, () => callback(d.pspRef, CallbackStatus.COMPLETED, d.amount)),
    );

    expect(results.every((r) => r.status === HttpStatus.OK)).toBe(true);
    expect(results.filter((r) => r.body.applied === true)).toHaveLength(1);
    expect(await getBalance(d.walletId)).toBe('100.500000000000000000');
    expect(await ledgerRows(d.walletId)).toHaveLength(1);
    await assertLedgerMatchesBalance(d.walletId);
  });

  // Same scenario without HTTP: all 50 calls start in the same tick, so they genuinely overlap
  // (HTTP startup cost spreads requests out and can hide a race).
  it('does not double-credit 50 truly simultaneous duplicate deliveries (service level)', async () => {
    const d = await newDeposit();

    const results = await Promise.all(
      Array.from({ length: Concurrency.CALLBACK_DUPLICATES }, () =>
        handleCallback({ pspRef: d.pspRef, status: CallbackStatus.COMPLETED, amount: d.amount }),
      ),
    );

    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect(await getBalance(d.walletId)).toBe('100.500000000000000000');
    expect(await ledgerRows(d.walletId)).toHaveLength(1);
    await assertLedgerMatchesBalance(d.walletId);
  });

  it('marks a deposit Failed without moving money, and a repeat is a no-op', async () => {
    const d = await newDeposit();

    const res = await callback(d.pspRef, CallbackStatus.FAILED, d.amount);
    const again = await callback(d.pspRef, CallbackStatus.FAILED, d.amount);

    expect(res.body).toEqual({ status: FundingStatus.FAILED, applied: true });
    expect(again.body).toEqual({ status: FundingStatus.FAILED, applied: false });
    expect(await getBalance(d.walletId)).toBe(ZERO_BALANCE);
    expect(await ledgerRows(d.walletId)).toHaveLength(0);
  });

  it('marks Failed even when the callback amount differs', async () => {
    const d = await newDeposit();
    const res = await callback(d.pspRef, CallbackStatus.FAILED, '999');
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.status).toBe(FundingStatus.FAILED);
    expect(await mismatchRows()).toHaveLength(0);
  });

  it('rejects failed after completed with 409 and changes nothing', async () => {
    const d = await newDeposit();
    await callback(d.pspRef, CallbackStatus.COMPLETED, d.amount);

    const res = await callback(d.pspRef, CallbackStatus.FAILED, d.amount);

    expect(res.status).toBe(HttpStatus.CONFLICT);
    expect(res.body).toMatchObject({ error: ErrorCode.INVALID_TRANSITION, from: FundingStatus.COMPLETED, to: FundingStatus.FAILED });
    expect(await getBalance(d.walletId)).toBe('100.500000000000000000');
  });

  it('rejects completed after failed with 409 and does not credit', async () => {
    const d = await newDeposit();
    await callback(d.pspRef, CallbackStatus.FAILED, d.amount);

    const res = await callback(d.pspRef, CallbackStatus.COMPLETED, d.amount);

    expect(res.status).toBe(HttpStatus.CONFLICT);
    expect(await getBalance(d.walletId)).toBe(ZERO_BALANCE);
    expect(await ledgerRows(d.walletId)).toHaveLength(0);
  });

  it('returns 404 for an unknown pspRef and writes nothing', async () => {
    const res = await callback(UNKNOWN_PSP_REF, CallbackStatus.COMPLETED, '10');
    expect(res.status).toBe(HttpStatus.NOT_FOUND);
    expect(res.body.error).toBe(ErrorCode.PSP_REF_NOT_FOUND);
    expect(await mismatchRows()).toHaveLength(0);
  });

  it('rejects an amount mismatch with 422, no credit, deposit stays Pending, mismatch recorded', async () => {
    const d = await newDeposit('100.50');

    const res = await callback(d.pspRef, CallbackStatus.COMPLETED, '90');

    expect(res.status).toBe(HttpStatus.UNPROCESSABLE);
    expect(res.body).toEqual({
      error: ErrorCode.AMOUNT_MISMATCH,
      expected: '100.500000000000000000',
      received: '90.000000000000000000',
    });
    expect(await getBalance(d.walletId)).toBe(ZERO_BALANCE);
    expect(await ledgerRows(d.walletId)).toHaveLength(0);
    expect(await mismatchRows()).toEqual([{ repeat_count: 1, received_amount: '90.000000000000000000' }]);

    // Still Pending: the correct callback now completes it.
    const ok = await callback(d.pspRef, CallbackStatus.COMPLETED, '100.50');
    expect(ok.body).toEqual({ status: FundingStatus.COMPLETED, applied: true });
    await assertLedgerMatchesBalance(d.walletId);
  });

  it('keeps one mismatch row per distinct received amount and counts repeats, even concurrently', async () => {
    const d = await newDeposit('100.50');

    await Promise.all(Array.from({ length: Concurrency.MISMATCH_DUPLICATES }, () => callback(d.pspRef, CallbackStatus.COMPLETED, '90')));
    await callback(d.pspRef, CallbackStatus.COMPLETED, '91');

    const rows = await mismatchRows();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.received_amount === '90.000000000000000000')?.repeat_count).toBe(10);
    expect(rows.find((r) => r.received_amount === '91.000000000000000000')?.repeat_count).toBe(1);
    expect(await getBalance(d.walletId)).toBe(ZERO_BALANCE);
  });

  it('treats numerically equal amounts as equal ("100.5" vs "100.50")', async () => {
    const d = await newDeposit('100.50');
    const res = await callback(d.pspRef, CallbackStatus.COMPLETED, '100.5');
    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.applied).toBe(true);
  });

  it('treats a repeat completed with a different amount on a settled deposit as a no-op', async () => {
    const d = await newDeposit('100.50');
    await callback(d.pspRef, CallbackStatus.COMPLETED, '100.50');

    const res = await callback(d.pspRef, CallbackStatus.COMPLETED, '5');

    expect(res.status).toBe(HttpStatus.OK);
    expect(res.body.applied).toBe(false);
    expect(await getBalance(d.walletId)).toBe('100.500000000000000000');
    expect(await mismatchRows()).toHaveLength(0);
  });

  it.each([
    ['unsupported status', { pspRef: 'x', status: UNSUPPORTED_CALLBACK_STATUS, amount: '1' }],
    ['zero amount', { pspRef: 'x', status: CallbackStatus.COMPLETED, amount: '0' }],
    ['negative amount', { pspRef: 'x', status: CallbackStatus.COMPLETED, amount: '-1' }],
    ['malformed amount', { pspRef: 'x', status: CallbackStatus.COMPLETED, amount: '1,5' }],
    ['missing pspRef', { status: CallbackStatus.COMPLETED, amount: '1' }],
  ])('rejects %s with 400', async (_name, body) => {
    const res = await request(server).post(paths.pspCallbacks()).send(body);
    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
  });
});
