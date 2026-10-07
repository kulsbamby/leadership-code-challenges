import { MAX_TURNOVER_MULTIPLIER, MONEY_MAX_INTEGER_DIGITS, MONEY_SCALE } from '../src/lib/constants';
import { fmt, ZERO } from '../src/lib/money';

// Shared test fixtures. Domain values (statuses, kinds, error codes, paths, HTTP statuses) come
// from src/lib/constants so tests and code cannot drift apart.

// A well-formed UUID that no row has.
export const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
export const MALFORMED_ID = 'not-a-uuid';
export const UNKNOWN_PSP_REF = 'psp_does_not_exist';

export const ZERO_BALANCE = fmt(ZERO);

// Amounts that sit exactly on, or just beyond, the limits derived from the money type.
export const SMALLEST_AMOUNT = `0.${'0'.repeat(MONEY_SCALE - 1)}1`;
export const TOO_MANY_DECIMALS = `0.${'0'.repeat(MONEY_SCALE)}1`;
export const TOO_MANY_INTEGER_DIGITS = '1'.repeat(MONEY_MAX_INTEGER_DIGITS + 1);
export const OVER_MAX_MULTIPLIER = MAX_TURNOVER_MULTIPLIER + 1;

// A callback status the service does not support (valid FundingStatus-like word, invalid for callbacks).
export const UNSUPPORTED_CALLBACK_STATUS = 'pending';

// How many requests race in each concurrency test.
export const Concurrency = {
  CALLBACK_DUPLICATES: 50,
  MISMATCH_DUPLICATES: 10,
  OVERDRAW_WAGERS: 5,
  AFFORDABLE_WAGER_RACERS: 8,
  SIMULTANEOUS_WAGERS: 20,
  WITHDRAWAL_RACERS: 5,
  KEY_DUPLICATES: 10,
} as const;

// Constraint and trigger names the database must enforce (see the migrations).
export const DbConstraint = {
  WALLET_BALANCE_NON_NEGATIVE: 'wallets_balance_non_negative',
  WALLET_TXS_FUNDING_KIND_UNIQUE: 'wallet_txs_funding_kind_unique',
} as const;
export const LEDGER_APPEND_ONLY_MESSAGE = /append-only/;
