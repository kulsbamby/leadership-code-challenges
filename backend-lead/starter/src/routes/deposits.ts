import { Router } from 'express';
import { z } from 'zod';
import {
  DEFAULT_TURNOVER_MULTIPLIER,
  HttpStatus,
  IDEMPOTENCY_KEY_HEADER,
  MAX_TURNOVER_MULTIPLIER,
  MIN_TURNOVER_MULTIPLIER,
  RoutePath,
} from '../lib/constants';
import { amountString, idempotencyKeyHeader, uuid } from '../lib/schemas';
import * as depositService from '../services/depositService';

export const depositsRouter = Router();

const createDepositBody = z.object({
  memberId: uuid,
  amount: amountString,
  turnoverMultiplier: z
    .number()
    .int()
    .min(MIN_TURNOVER_MULTIPLIER)
    .max(MAX_TURNOVER_MULTIPLIER)
    .default(DEFAULT_TURNOVER_MULTIPLIER),
});

depositsRouter.post(RoutePath.ROOT, async (req, res, next) => {
  try {
    const body = createDepositBody.parse(req.body);
    const idempotencyKey = idempotencyKeyHeader.parse(req.header(IDEMPOTENCY_KEY_HEADER));
    const deposit = await depositService.createDeposit({ ...body, idempotencyKey });
    res.status(HttpStatus.CREATED).json(deposit);
  } catch (err) {
    next(err);
  }
});
