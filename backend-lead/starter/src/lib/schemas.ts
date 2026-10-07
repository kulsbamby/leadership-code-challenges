import { z } from 'zod';
import {
  MAX_IDEMPOTENCY_KEY_LENGTH,
  MIN_STRING_LENGTH,
  MONEY_MAX_INTEGER_DIGITS,
  MONEY_SCALE,
  ValidationMessage,
} from './constants';

const AMOUNT_FORMAT = new RegExp(`^\\d{1,${MONEY_MAX_INTEGER_DIGITS}}(\\.\\d{1,${MONEY_SCALE}})?$`);
const ALL_ZEROS = /^0+(\.0+)?$/;

// Positive decimal string. At most MONEY_MAX_INTEGER_DIGITS integer and MONEY_SCALE decimal digits so
// it always fits DECIMAL(36,18); more precision is rejected, never rounded.
export const amountString = z
  .string()
  .regex(AMOUNT_FORMAT, ValidationMessage.AMOUNT_FORMAT)
  // String check, not dec(): zod runs refinements even after a format failure.
  .refine((v) => !ALL_ZEROS.test(v), ValidationMessage.AMOUNT_POSITIVE);

export const uuid = z.string().uuid();

export const idempotencyKeyHeader = z
  .string()
  .min(MIN_STRING_LENGTH)
  .max(MAX_IDEMPOTENCY_KEY_LENGTH)
  .optional();
