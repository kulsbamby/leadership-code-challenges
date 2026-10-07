// Single home for every literal the application and tests share. Nothing here imports other
// project modules, so any file may import it without creating a cycle.
//
// Migrations (src/db/migrations/*.js) deliberately keep their own literals: a migration is a frozen
// snapshot of the schema at one point in time, and importing live constants would let a later code
// change silently rewrite history. Keep the values below in sync with the migrations by hand.

// ---- Service ---------------------------------------------------------------------------------
export const SERVICE_NAME = 'mini-wallet-service';
export const HEALTH_OK = 'ok';

// ---- Environment and database ----------------------------------------------------------------
export const Env = { DEVELOPMENT: 'development', TEST: 'test' } as const;
export const DEFAULT_PORT = 3000;
export const DEFAULT_DATABASE_URL = 'postgres://wallet:wallet@localhost:5439/wallet';
export const DEFAULT_DATABASE_URL_TEST = 'postgres://wallet:wallet@localhost:5439/wallet_test';
export const DB_DIALECT = 'postgres';

// Sequelize association keys and aliases.
export const ForeignKey = { MEMBER_ID: 'memberId', WALLET_ID: 'walletId' } as const;
export const Alias = { WALLET: 'wallet', MEMBER: 'member' } as const;

// ---- Money -----------------------------------------------------------------------------------
// DB type DECIMAL(36,18): 36 digits in total, 18 after the decimal point.
export const MONEY_PRECISION = 36;
export const MONEY_SCALE = 18;
export const MONEY_MAX_INTEGER_DIGITS = MONEY_PRECISION - MONEY_SCALE;

// ---- HTTP ------------------------------------------------------------------------------------
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  INTERNAL_ERROR: 500,
} as const;

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

// ---- Routes ----------------------------------------------------------------------------------
// Mount points (app.ts) ...
export const Routes = {
  HEALTH: '/health',
  MEMBERS: '/members',
  DEPOSITS: '/deposits',
  PSP: '/psp',
  WALLETS: '/wallets',
  WITHDRAWALS: '/withdrawals',
} as const;

// ... paths inside each router (relative to the mount point) ...
export const RoutePath = {
  ROOT: '/',
  PSP_CALLBACKS: '/callbacks',
  WAGERS: '/:walletId/wagers',
  MEMBER_WALLET: '/:memberId/wallet',
} as const;

export const WALLET_ID_PARAM = 'walletId';
export const MEMBER_ID_PARAM = 'memberId';

// ... and full paths, for clients and tests.
export const paths = {
  deposits: () => Routes.DEPOSITS,
  withdrawals: () => Routes.WITHDRAWALS,
  pspCallbacks: () => `${Routes.PSP}${RoutePath.PSP_CALLBACKS}`,
  wagers: (walletId: string) => `${Routes.WALLETS}/${walletId}/wagers`,
  memberWallet: (memberId: string) => `${Routes.MEMBERS}/${memberId}/wallet`,
};

// ---- Domain enums ----------------------------------------------------------------------------
export const FundingType = {
  DEPOSIT: 'deposit',
  WITHDRAWAL: 'withdrawal',
} as const;
export type FundingType = (typeof FundingType)[keyof typeof FundingType];

export const FundingStatus = {
  PENDING: 'Pending',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
} as const;
export type FundingStatus = (typeof FundingStatus)[keyof typeof FundingStatus];

// Status vocabulary of the PSP callback body (lowercase), as opposed to FundingStatus.
export const CallbackStatus = {
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;
export type CallbackStatus = (typeof CallbackStatus)[keyof typeof CallbackStatus];

export const LedgerKind = {
  DEPOSIT_CREDIT: 'deposit_credit',
  WAGER_DEBIT: 'wager_debit',
  WITHDRAWAL_DEBIT: 'withdrawal_debit',
} as const;
export type LedgerKind = (typeof LedgerKind)[keyof typeof LedgerKind];

// ---- Error codes (the `error` field of every non-2xx body) -----------------------------------
export const ErrorCode = {
  VALIDATION_ERROR: 'validation_error',
  INTERNAL_ERROR: 'internal_error',
  MEMBER_NOT_FOUND: 'member_not_found',
  WALLET_NOT_FOUND: 'wallet_not_found',
  WALLET_MISSING: 'wallet_missing',
  PSP_REF_NOT_FOUND: 'psp_ref_not_found',
  INVALID_TRANSITION: 'invalid_transition',
  AMOUNT_MISMATCH: 'amount_mismatch',
  INSUFFICIENT_BALANCE: 'insufficient_balance',
  TURNOVER_NOT_MET: 'turnover_not_met',
  IDEMPOTENCY_KEY_REUSE: 'idempotency_key_reuse',
  IDEMPOTENCY_KEY_IN_PROGRESS: 'idempotency_key_in_progress',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ---- Input limits and defaults ---------------------------------------------------------------
export const DEFAULT_TURNOVER_MULTIPLIER = 1;
export const WITHDRAWAL_TURNOVER_MULTIPLIER = 1; // unused for withdrawals; column is NOT NULL
export const MIN_TURNOVER_MULTIPLIER = 0;
// Far above any real multiplier, far below the INTEGER column limit (2^31 - 1).
export const MAX_TURNOVER_MULTIPLIER = 1_000_000;
export const MAX_PSP_REF_LENGTH = 255;
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
export const MIN_STRING_LENGTH = 1;
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 64;

export const ValidationMessage = {
  AMOUNT_FORMAT: `must be a decimal string with at most ${MONEY_MAX_INTEGER_DIGITS} integer and ${MONEY_SCALE} decimal digits`,
  AMOUNT_POSITIVE: 'must be positive',
} as const;

// ---- PSP references --------------------------------------------------------------------------
export const PSP_REF_PREFIX = 'psp_';

// ---- Idempotency -----------------------------------------------------------------------------
export const IdempotencyScope = {
  DEPOSITS: 'deposits',
  WAGERS: 'wagers',
  WITHDRAWALS: 'withdrawals',
} as const;
export const IDEMPOTENCY_HASH_ALGORITHM = 'sha256';
export const IDEMPOTENCY_HASH_ENCODING = 'hex';

export function idempotencyScope(scope: (typeof IdempotencyScope)[keyof typeof IdempotencyScope], ownerId: string): string {
  return `${scope}:${ownerId}`;
}

// ---- Tables ----------------------------------------------------------------------------------
export const Table = {
  MEMBERS: 'members',
  WALLETS: 'wallets',
  FUNDING_TRANSACTIONS: 'funding_transactions',
  WALLET_TXS: 'wallet_txs',
  WAGERS: 'wagers',
  CALLBACK_MISMATCHES: 'callback_mismatches',
  IDEMPOTENCY_KEYS: 'idempotency_keys',
} as const;
