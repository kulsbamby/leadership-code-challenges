import { ErrorCode } from './constants';

// Business errors carry their HTTP status and a stable machine-readable code.
// The error handler in app.ts turns them into `{ error: code, ...extra }`.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

// Thrown inside the callback transaction so it rolls back; the mismatch is then
// recorded in a separate transaction (see pspCallbackService).
export class AmountMismatchError extends Error {
  constructor(
    public readonly fundingTransactionId: string,
    public readonly pspRef: string,
    public readonly expected: string,
    public readonly received: string,
  ) {
    super(ErrorCode.AMOUNT_MISMATCH);
  }
}
