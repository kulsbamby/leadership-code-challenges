import express, { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { healthRouter } from './routes/health';
import { membersRouter } from './routes/members';
import { depositsRouter } from './routes/deposits';
import { pspRouter } from './routes/psp';
import { walletsRouter } from './routes/wallets';
import { withdrawalsRouter } from './routes/withdrawals';
import { AppError } from './lib/errors';
import { ErrorCode, HttpStatus, Routes } from './lib/constants';

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.code, ...err.extra });
    return;
  }
  if (err instanceof ZodError) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: ErrorCode.VALIDATION_ERROR, details: err.issues });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(HttpStatus.INTERNAL_ERROR).json({ error: ErrorCode.INTERNAL_ERROR });
};

export function createApp() {
  const app = express();
  app.use(express.json());

  app.use(Routes.HEALTH, healthRouter);
  app.use(Routes.MEMBERS, membersRouter);
  app.use(Routes.DEPOSITS, depositsRouter);
  app.use(Routes.PSP, pspRouter);
  app.use(Routes.WALLETS, walletsRouter);
  app.use(Routes.WITHDRAWALS, withdrawalsRouter);

  app.use(errorHandler);
  return app;
}
