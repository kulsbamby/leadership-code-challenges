import { Router } from 'express';
import { z } from 'zod';
import {
  HttpStatus,
  IDEMPOTENCY_KEY_HEADER,
  RoutePath,
  WALLET_ID_PARAM,
} from '../lib/constants';
import { amountString, idempotencyKeyHeader, uuid } from '../lib/schemas';
import * as wagerService from '../services/wagerService';

export const walletsRouter = Router();

const wagerBody = z.object({ amount: amountString });

walletsRouter.post(RoutePath.WAGERS, async (req, res, next) => {
  try {
    const walletId = uuid.parse(req.params[WALLET_ID_PARAM]);
    const body = wagerBody.parse(req.body);
    const idempotencyKey = idempotencyKeyHeader.parse(req.header(IDEMPOTENCY_KEY_HEADER));
    const wager = await wagerService.placeWager({ walletId, amount: body.amount, idempotencyKey });
    res.status(HttpStatus.CREATED).json(wager);
  } catch (err) {
    next(err);
  }
});
