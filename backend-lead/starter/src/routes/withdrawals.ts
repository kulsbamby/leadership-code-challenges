import { Router } from 'express';
import { z } from 'zod';
import { HttpStatus, IDEMPOTENCY_KEY_HEADER, RoutePath } from '../lib/constants';
import { amountString, idempotencyKeyHeader, uuid } from '../lib/schemas';
import * as withdrawalService from '../services/withdrawalService';

export const withdrawalsRouter = Router();

const withdrawalBody = z.object({ memberId: uuid, amount: amountString });

withdrawalsRouter.post(RoutePath.ROOT, async (req, res, next) => {
  try {
    const body = withdrawalBody.parse(req.body);
    const idempotencyKey = idempotencyKeyHeader.parse(req.header(IDEMPOTENCY_KEY_HEADER));
    const withdrawal = await withdrawalService.requestWithdrawal({ ...body, idempotencyKey });
    res.status(HttpStatus.CREATED).json(withdrawal);
  } catch (err) {
    next(err);
  }
});
