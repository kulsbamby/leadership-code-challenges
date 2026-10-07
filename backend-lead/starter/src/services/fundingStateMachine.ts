import { ErrorCode, FundingStatus, HttpStatus } from '../lib/constants';
import { AppError } from '../lib/errors';

export type FundingTarget = typeof FundingStatus.COMPLETED | typeof FundingStatus.FAILED;

export const Decision = { APPLY: 'apply', NOOP: 'noop' } as const;
export type Decision = (typeof Decision)[keyof typeof Decision];

// The only place that knows the funding transaction rules:
//   Pending   -> Completed | Failed   apply
//   Completed -> Completed            noop (duplicate delivery)
//   Failed    -> Failed               noop (duplicate delivery)
//   anything else                     rejected (409), never silently applied
export function decide(current: FundingStatus, target: FundingTarget): Decision {
  if (current === FundingStatus.PENDING) return Decision.APPLY;
  if (current === target) return Decision.NOOP;
  throw new AppError(HttpStatus.CONFLICT, ErrorCode.INVALID_TRANSITION, { from: current, to: target });
}
