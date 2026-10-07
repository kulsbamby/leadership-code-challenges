import { Router } from 'express';
import { z } from 'zod';
import {
  CallbackStatus,
  HttpStatus,
  MAX_PSP_REF_LENGTH,
  MIN_STRING_LENGTH,
  RoutePath,
} from '../lib/constants';
import { amountString } from '../lib/schemas';
import * as pspCallbackService from '../services/pspCallbackService';

export const pspRouter = Router();

const callbackBody = z.object({
  pspRef: z.string().min(MIN_STRING_LENGTH).max(MAX_PSP_REF_LENGTH),
  status: z.nativeEnum(CallbackStatus),
  amount: amountString,
});

pspRouter.post(RoutePath.PSP_CALLBACKS, async (req, res, next) => {
  try {
    const body = callbackBody.parse(req.body);
    const result = await pspCallbackService.handleCallback(body);
    res.status(HttpStatus.OK).json(result);
  } catch (err) {
    next(err);
  }
});
