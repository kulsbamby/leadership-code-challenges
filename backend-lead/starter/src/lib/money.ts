import BigNumber from 'bignumber.js';
import { MONEY_SCALE } from './constants';

// Money invariants for this codebase:
// - Money is stored as DECIMAL(36,18) in Postgres and travels as strings in JS/JSON.
// - All arithmetic on money MUST go through BigNumber. Never use JS number math on money.
BigNumber.config({ DECIMAL_PLACES: MONEY_SCALE, ROUNDING_MODE: BigNumber.ROUND_DOWN });

export function dec(value: string | number | BigNumber): BigNumber {
  const bn = new BigNumber(value);
  if (!bn.isFinite()) {
    throw new Error(`Invalid money value: ${value}`);
  }
  return bn;
}

export const ZERO = dec(0);

// Serialize money for JSON/DB. toFixed never uses exponent notation (toString can: 1e-7).
export function fmt(value: BigNumber): string {
  return value.toFixed(MONEY_SCALE);
}
