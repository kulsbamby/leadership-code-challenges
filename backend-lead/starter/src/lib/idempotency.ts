import { createHash } from 'crypto';
import { Transaction } from 'sequelize';
import { sequelize } from '../db/sequelize';
import { IdempotencyKey } from '../db/models';
import {
  ErrorCode,
  HttpStatus,
  IDEMPOTENCY_HASH_ALGORITHM,
  IDEMPOTENCY_HASH_ENCODING,
  Table,
} from './constants';
import { AppError } from './errors';

function hashPayload(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash(IDEMPOTENCY_HASH_ALGORITHM).update(canonical).digest(IDEMPOTENCY_HASH_ENCODING);
}

// Runs `work` in one transaction. With an Idempotency-Key, the key row is inserted in that same
// transaction: the unique (scope, key) index makes a concurrent duplicate wait for the first
// request to commit, then replay its stored response. A failed request rolls the key back too,
// so only successful results are replayed.
export async function runIdempotent<T extends object>(opts: {
  key?: string;
  scope: string;
  payload: Record<string, unknown>;
  work: (t: Transaction) => Promise<T>;
}): Promise<T> {
  const { key, scope, payload, work } = opts;
  return sequelize.transaction(async (t) => {
    if (!key) return work(t);

    const requestHash = hashPayload(payload);
    const [inserted] = await sequelize.query(
      `INSERT INTO ${Table.IDEMPOTENCY_KEYS} (scope, key, request_hash)
       VALUES (:scope, :key, :requestHash)
       ON CONFLICT (scope, key) DO NOTHING
       RETURNING id`,
      { replacements: { scope, key, requestHash }, transaction: t },
    );

    if ((inserted as unknown[]).length === 0) {
      const existing = await IdempotencyKey.findOne({ where: { scope, key }, transaction: t });
      if (!existing || existing.responseBody === null) {
        throw new AppError(HttpStatus.CONFLICT, ErrorCode.IDEMPOTENCY_KEY_IN_PROGRESS);
      }
      if (existing.requestHash !== requestHash) {
        throw new AppError(HttpStatus.UNPROCESSABLE, ErrorCode.IDEMPOTENCY_KEY_REUSE);
      }
      return existing.responseBody as T;
    }

    const body = await work(t);
    await IdempotencyKey.update({ responseBody: body }, { where: { scope, key }, transaction: t });
    return body;
  });
}
