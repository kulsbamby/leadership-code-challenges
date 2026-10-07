import { Server } from 'http';
import request from 'supertest';
import { createApp } from '../src/app';
import { sequelize } from '../src/db/sequelize';
import '../src/db/models';
import { HttpStatus, Routes, paths } from '../src/lib/constants';
import { ZERO_BALANCE } from './constants';

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

describe('POST /members', () => {
  it('creates a member with a zero-balance wallet', async () => {
    const res = await request(server).post(Routes.MEMBERS).send({ username: 'alice01' });

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.member.username).toBe('alice01');
    expect(res.body.wallet.balance).toBe(ZERO_BALANCE);

    const walletRes = await request(server).get(paths.memberWallet(res.body.member.id));
    expect(walletRes.status).toBe(HttpStatus.OK);
    expect(walletRes.body.balance).toBe(ZERO_BALANCE);
  });

  it('rejects an invalid username', async () => {
    const res = await request(server).post(Routes.MEMBERS).send({ username: 'x' });
    expect(res.status).toBe(HttpStatus.BAD_REQUEST);
  });
});
