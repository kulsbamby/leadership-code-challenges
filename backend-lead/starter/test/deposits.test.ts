import { Server } from 'http';
import request from 'supertest';
import { createApp } from '../src/app';
import { sequelize } from '../src/db/sequelize';
import '../src/db/models';
import { createMemberWithWallet, getBalance } from './helpers';
import { ErrorCode, FundingStatus, HttpStatus, paths } from '../src/lib/constants';
import { OVER_MAX_MULTIPLIER, SMALLEST_AMOUNT, TOO_MANY_DECIMALS, TOO_MANY_INTEGER_DIGITS, UNKNOWN_ID, ZERO_BALANCE } from './constants';

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

describe('POST /deposits', () => {
  it('creates a Pending deposit with a pspRef and moves no money', async () => {
    const { memberId, walletId } = await createMemberWithWallet('alice01');

    const res = await request(server).post(paths.deposits()).send({ memberId, amount: '100.50', turnoverMultiplier: 2 });

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.status).toBe(FundingStatus.PENDING);
    expect(res.body.pspRef).toEqual(expect.any(String));
    expect(res.body.amount).toBe('100.500000000000000000');
    expect(res.body.turnoverMultiplier).toBe(2);
    expect(await getBalance(walletId)).toBe(ZERO_BALANCE);
  });

  it('defaults turnoverMultiplier to 1 and accepts 0', async () => {
    const { memberId } = await createMemberWithWallet('alice01');

    const dflt = await request(server).post(paths.deposits()).send({ memberId, amount: '10' });
    const zero = await request(server).post(paths.deposits()).send({ memberId, amount: '10', turnoverMultiplier: 0 });

    expect(dflt.body.turnoverMultiplier).toBe(1);
    expect(zero.status).toBe(HttpStatus.CREATED);
    expect(zero.body.turnoverMultiplier).toBe(0);
    expect(zero.body.pspRef).not.toBe(dflt.body.pspRef);
  });

  it.each([
    ['zero', { amount: '0' }],
    ['negative', { amount: '-5' }],
    ['non-numeric', { amount: 'abc' }],
    ['a JSON number', { amount: 10.5 }],
    ['19 decimal places', { amount: TOO_MANY_DECIMALS }],
    ['19 integer digits', { amount: TOO_MANY_INTEGER_DIGITS }],
    ['negative multiplier', { amount: '10', turnoverMultiplier: -1 }],
    ['fractional multiplier', { amount: '10', turnoverMultiplier: 1.5 }],
    ['huge multiplier', { amount: '10', turnoverMultiplier: OVER_MAX_MULTIPLIER }],
  ])('rejects %s with 400', async (_name, body) => {
    const { memberId } = await createMemberWithWallet('alice01');
    const res = await request(server).post(paths.deposits()).send({ memberId, ...body });
    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('accepts 18 decimal places', async () => {
    const { memberId } = await createMemberWithWallet('alice01');
    const res = await request(server).post(paths.deposits()).send({ memberId, amount: SMALLEST_AMOUNT });
    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.amount).toBe(SMALLEST_AMOUNT);
  });

  it('returns 404 for an unknown member', async () => {
    const res = await request(server)
      .post(paths.deposits())
      .send({ memberId: UNKNOWN_ID, amount: '10' });
    expect(res.status).toBe(HttpStatus.NOT_FOUND);
    expect(res.body.error).toBe(ErrorCode.MEMBER_NOT_FOUND);
  });
});
