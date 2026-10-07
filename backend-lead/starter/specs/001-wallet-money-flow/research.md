# Research: Wallet Money Flow

No `NEEDS CLARIFICATION` remained after `/speckit-clarify`. This file records the design decisions that
`DECISIONS.md` will later cite. Format: Decision / Rationale / Alternatives.

## R1. Concurrency control: one wallet row lock

- **Decision**: Every operation that changes a balance first runs `SELECT ... FOR UPDATE` on the
  wallet row inside its transaction (`lock: t.LOCK.UPDATE`). Balance is then read, checked, and written
  while the lock is held. `CHECK (balance >= 0)` on `wallets` is the DB backstop.
- **Rationale**: Wagers, withdrawals, and credits all contend on the same row, so one pessimistic lock
  serializes them with no retry logic. The turnover check in a withdrawal also runs under that lock, so
  a wager or deposit completion cannot change the turnover totals mid-check.
- **Alternatives**: Optimistic version column (needs retry loops and a retry-limit story; worse under
  contention); `UPDATE ... SET balance = balance - x WHERE balance >= x` (atomic, but the turnover
  check and ledger `balance_after` still need a consistent read, so the lock is simpler); `SERIALIZABLE`
  isolation (needs retry on 40001, more moving parts).
- **Isolation level**: default `READ COMMITTED` is sufficient because correctness comes from row locks
  and constraints, not snapshot reads.

## R2. Callback idempotency: lock the funding transaction row, state machine decides

- **Decision**: The callback transaction first locks the funding transaction by `psp_ref`
  (`FOR UPDATE`), then applies the state machine, then (for a first `completed`) locks the wallet and
  credits it. A second concurrent delivery blocks on the first lock, then sees the terminal state and
  returns a success no-op.
- **Backstop**: a partial unique index on `wallet_txs (funding_transaction_id, kind)` makes a second
  credit for the same deposit impossible even if application logic were wrong.
- **Lock order**: funding transaction row, then wallet row. Wagers and withdrawals take only the wallet
  row, so no path takes them in the opposite order: no deadlock.
- **Alternatives**: unique "processed callbacks" table keyed by delivery id (PSP gives no delivery id in
  the brief, and the state machine already makes the status the idempotency record).

## R3. Amount mismatch record must survive the rejection

- **Decision**: On a `completed` amount mismatch, the callback transaction rolls back (no credit, deposit
  stays `Pending`), then a separate short transaction upserts `callback_mismatches` with
  `INSERT ... ON CONFLICT (psp_ref, received_amount) DO UPDATE SET repeat_count = repeat_count + 1,
  last_seen_at = now()`, then the 422 is returned.
- **Rationale**: Writing the record inside the rolled-back transaction would lose it. The upsert is atomic
  under concurrent delivery thanks to the unique index.
- Amounts compare numerically via `BigNumber.isEqualTo`; the DECIMAL column also normalizes `100.5` and
  `100.50`.

## R4. Turnover is derived, not stored

- **Decision**: Required = `SUM(amount * turnover_multiplier)` over the member's `Completed` deposits.
  Accrued = `SUM(amount)` over the member's wagers. Both computed in Postgres `NUMERIC` (exact), returned
  as strings, wrapped with `dec()`, and compared in BigNumber. Computed while the wallet lock is held.
- **Rationale**: One source of truth, no counter that can drift from the rows, and nothing extra to
  reconcile. Both sums are index-backed per wallet/member and fine at this scale.
- **Alternatives**: denormalized `required_turnover` / `accrued_turnover` columns on `wallets` (O(1) check,
  but a second invariant to maintain). Recorded as a next step if the sums become hot.

## R5. Idempotency keys for client writes (FR-018)

- **Decision**: Optional `Idempotency-Key` header. A helper `runIdempotent` opens the transaction and, when a
  key is present, does `INSERT INTO idempotency_keys ... ON CONFLICT (scope, key) DO NOTHING`.
  - Inserted: run the business logic in the same transaction, store the response body, commit.
  - Not inserted (the row exists, or a concurrent request is mid-flight and Postgres made the insert wait
    for its commit): load the stored row. Same `request_hash`: replay the stored body with 201. Different
    hash: 422 `idempotency_key_reuse`.
- **Scope** = `<endpoint>:<owner id>` (member id for deposits and withdrawals, wallet id for wagers).
- **Failures**: a failed request rolls back its key row too, so a retry re-executes. Only successful
  results are replayed. Acceptable: a failed request changed nothing.
- **Hash**: sha256 over canonical JSON of the normalized payload (`amount` via `dec().toFixed()`), using Node
  `crypto`. No new dependency.
- **Cut line if time runs out**: keep withdrawals, drop deposits and wagers (record in `DECISIONS.md`).

## R6. Append-only ledger enforced by the DB

- **Decision**: A `BEFORE UPDATE OR DELETE` trigger on `wallet_txs` raises an exception. Application code
  has no update/delete path either. Test `TRUNCATE` does not fire row triggers, so test resets still work.
- **Single mutation point**: one `ledgerService.postEntry(t, wallet, kind, signedAmount, refs)` updates the
  balance and inserts the ledger row with `balance_after`. Nothing else writes `wallets.balance`.

## R7. Connection pool under concurrent tests

- **Decision**: Every query inside a business transaction passes `{ transaction: t }` (no CLS). Lock waiters
  hold one pool connection each, and the lock holder never needs a second connection, so 50 concurrent
  requests against the default pool queue safely instead of deadlocking. The mismatch upsert runs after the
  rolled-back transaction has released its connection.
- The mismatch path is the one place two connections are used by one request, and never at the same time.

## R8. Error model

- **Decision**: `AppError(status, code, extra)` in `src/lib/errors.ts`; the existing `errorHandler` in
  `app.ts` maps it to `{ error: code, ...extra }`. Zod errors stay 400. Statuses: 404 unknown
  member/wallet/`pspRef`, 409 invalid transition, 422 mismatch / insufficient balance / turnover locked /
  key reuse.

## R9. Amount validation

- **Decision**: One zod schema `amountString`: regex `^\d+(\.\d{1,18})?$`, then `dec(v).gt(0)`. More than 18
  decimals is a 400, never rounded (the starter configures `ROUND_DOWN`, which would otherwise silently
  truncate).
