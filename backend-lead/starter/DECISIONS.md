# DECISIONS

Mini wallet service: deposit -> wager -> withdrawal. Stack unchanged (TypeScript, Express, Sequelize, Postgres 16, Jest). No new dependencies.

Working notes, in the order I'd want a reviewer to read them: how money is kept correct (locking, schema), the policy decisions the brief left open, trade-offs, gaps, next steps, AI disclosure.

## 1. Locking strategy

**One pessimistic row lock per wallet.** Every operation that changes a balance starts with `SELECT ... FOR UPDATE` on the wallet row (`lockWallet` in `ledgerService.ts`), inside its own transaction. Balance is read, checked, and written while the lock is held.

- Wagers, withdrawals and deposit credits all contend on the same row, so one lock serializes them. No retry loops, no lost updates.
- The withdrawal's turnover check runs under that same lock, so a wager or a deposit completion cannot change the turnover totals between the check and the debit.
- `CHECK (balance >= 0)` on `wallets` is the backstop: even a buggy code path cannot persist a negative balance.
- `ledgerService.postEntry` is the only writer of `wallets.balance`. It updates the balance and appends the ledger row together, in the caller's transaction.

**Callbacks lock the funding transaction first, then the wallet.** The callback transaction does `SELECT ... FOR UPDATE` on the deposit by `psp_ref`. A concurrent duplicate waits on that lock, then sees the terminal status and returns a success no-op. Only the first `completed` locks the wallet and credits it.

- Lock order is always funding transaction, then wallet. Wagers and withdrawals take only the wallet lock, so no code path takes them in the opposite order: no deadlock.
- Backstop: a partial unique index on `wallet_txs (funding_transaction_id, kind)` makes a second credit for one deposit impossible even if the application logic were wrong.

**Isolation level** stays at `READ COMMITTED`. Correctness comes from row locks and constraints, not snapshot reads.

**Rejected alternatives**
- *Optimistic locking (version column)*: needs retry loops and a retry-limit story, and degrades under contention, which is exactly the hot-wallet case.
- *`UPDATE ... SET balance = balance - x WHERE balance >= x`*: atomic, but the turnover check and the ledger's `balance_after` still need a consistent read, so the lock is simpler to reason about.
- *`SERIALIZABLE`*: correct, but every write path would need retry on `40001`.

**Connection pool.** Every query inside a business transaction passes `{ transaction: t }` (the starter has no CLS). A request waiting on a lock holds one pooled connection and the lock holder never needs a second one, so 50 concurrent requests against the default pool queue instead of deadlocking. The one place a request uses two connections is the mismatch record, and never at the same time (see 3).

## 2. Schema

New tables (all by migration, `src/db/migrations/20261007…`):

| Table | Purpose | DB-enforced guarantees |
|---|---|---|
| `funding_transactions` | deposits and withdrawals | `psp_ref` UNIQUE; CHECKs on `type`, `status`, `amount > 0`, `turnover_multiplier >= 0`; a deposit must have a `psp_ref` |
| `wallet_txs` | append-only ledger, signed amounts, `balance_after`, monotonic `seq` | UPDATE/DELETE blocked by trigger; unique `(funding_transaction_id, kind)` so one credit per deposit; CHECK `amount <> 0` |
| `wagers` | one row per wager (accrues turnover) | CHECK `amount > 0` |
| `callback_mismatches` | evidence of rejected amount mismatches | unique `(psp_ref, received_amount)` |
| `idempotency_keys` | client write replay | unique `(scope, key)` |

`wallets` gets `CHECK (balance >= 0)` through a new migration; existing migrations are untouched.

- **Money**: `DECIMAL(36,18)` everywhere, strings in JSON, `BigNumber` in between, as the starter requires. The one addition to `src/lib/money.ts` is `fmt()` (`toFixed(18)`): `BigNumber.toString()` can switch to exponent notation (`1e-7`), which would break "decimal string" on small amounts.
- **Status columns are `VARCHAR` plus CHECK, not PG enums**: adding a state later is an `ALTER ... CONSTRAINT`, not an enum migration.
- **Ledger ordering** uses a `seq BIGSERIAL`. Per wallet its order equals commit order because inserts run under the wallet lock; `created_at` timestamps could tie.
- **Invariant**: `wallets.balance = SUM(wallet_txs.amount)`. `test/helpers.ts#assertLedgerMatchesBalance` checks it (and that the last `balance_after` matches) at the end of every money test.
- **Turnover is derived, not stored.** Required = `SUM(amount * turnover_multiplier)` over the member's `Completed` deposits; accrued = `SUM(amount)` of the wallet's wagers; both computed in Postgres `NUMERIC` and read back as strings. One source of truth, nothing to drift, nothing extra to reconcile. Cost: two indexed sums per withdrawal. If that becomes hot, denormalize onto `wallets` under the same lock (next steps).

## 2a. Constants, no magic values

Every shared literal lives in `src/lib/constants.ts`: statuses, ledger kinds, error codes, HTTP statuses, route paths, table names, money precision and scale, input limits, the idempotency header and scope names, env defaults. Code and tests import from it, so a rename or a limit change is one edit. Test-only fixtures (unknown id, zero balance, boundary amounts, concurrency counts) are in `test/constants.ts`, and the amount boundaries there are derived from `MONEY_SCALE` and `MONEY_MAX_INTEGER_DIGITS`.

Deliberate exceptions: **migrations and `cli-config.js` keep their own literals** (they run as plain JS in the sequelize CLI, and a migration must stay a frozen snapshot of the schema, not follow later code changes), so the constraint names, enum lists and `DECIMAL(36,18)` in them must be kept in sync with `constants.ts` by hand. Test amounts such as `'100.50'` stay inline: they are the scenario data a reader needs next to the assertion.

## 3. Policy decisions the brief left open

| Question | Decision | Why |
|---|---|---|
| `completed` callback, amount differs from the deposit | **422**, no credit, deposit stays `Pending`, mismatch recorded | A different amount is a PSP or reconciliation problem a human must look at; crediting either number silently is worse. Staying `Pending` lets the correct callback still complete it. |
| Where the mismatch record lives | Written in a **separate transaction after the callback transaction rolls back** | Writing it inside the rolled-back transaction would lose the evidence. One row per distinct `(psp_ref, received_amount)` with a `repeat_count`, via `ON CONFLICT DO UPDATE`, so a hostile or retrying PSP cannot grow the table without bound. |
| `failed` callback with a different amount | Mark `Failed`, **ignore the amount** | No money moves on a failure; rejecting would leave a payment the PSP says failed stuck in `Pending`. |
| Repeat `completed` with a different amount on an already `Completed` deposit | **200 no-op** | The state machine decides first. The deposit is settled; the amount cannot change it. |
| Unknown `pspRef` | **404**, nothing written | |
| Invalid transition (`Completed` then `failed`, `Failed` then `completed`) | **409**, nothing changes | Rejected, never silently applied. The rules live in one function (`fundingStateMachine.decide`). |
| Duplicate terminal callback | **200** with `applied: false` | PSPs retry on non-2xx; a duplicate must not look like an error. |
| Turnover accounting | **Lifetime totals** (withdrawals do not consume turnover) | Matches the brief literally. Accepted loophole: surplus turnover carries forward. A member who wagers 500 against a 100 requirement (funded by a multiplier-0 deposit) keeps 400 of surplus, so a later 400 deposit at multiplier 1 is already "covered" and can be withdrawn without wagering. Fixing it means consuming turnover per deposit (next steps). |
| Check order in a withdrawal | Turnover first, then balance | A member who is locked should learn the lock, not an irrelevant balance error. |
| Amount format | Positive decimal string, at most 18 integer and 18 decimal digits, otherwise **400**, never rounded | The starter's `ROUND_DOWN` config would otherwise silently truncate. The 18-digit integer cap keeps values inside `DECIMAL(36,18)` (otherwise Postgres overflows into a 500). `turnoverMultiplier` is capped at 1,000,000 for the same reason. |

## 4. Idempotency keys (beyond the brief)

The brief requires idempotency only for PSP callbacks. I added an optional `Idempotency-Key` header on `POST /deposits`, `POST /wallets/:walletId/wagers` and `POST /withdrawals`, because a client retrying a timed-out withdrawal would otherwise debit twice, and this is a real-money platform.

- Implemented once in `src/lib/idempotency.ts#runIdempotent`; the key row is inserted in the same transaction as the business write. The unique `(scope, key)` index makes a concurrent duplicate wait for the first request to commit, then replay its stored body.
- Scope is `<endpoint>:<owner id>`, so the same key from two members does not collide. The payload is hashed after normalization (`"30"` and `"30.00"` are the same request).
- Same key, different payload: **422** `idempotency_key_reuse`.
- Only successful responses are stored: a failed request rolls its key back too, so a retry after the member is funded can succeed.
- Cost and cut line: one table, one helper, one test file. If the time budget had been tighter I would have kept withdrawals only.

## 5. Tests (A5), all against real Postgres

`npm test` migrates the test DB and runs `jest --runInBand`: 7 suites.

| Required test | Where |
|---|---|
| Sequential duplicate callback | `callbacks.test.ts` |
| Concurrent duplicate callbacks | `callbacks.test.ts` (50 HTTP requests, and 50 simultaneous service calls) |
| Concurrent wagers cannot overdraw | `wagers.test.ts` (HTTP and 20 simultaneous service calls) |
| Turnover lock blocks and unblocks | `withdrawals.test.ts` |

Also covered: state machine rejections, unknown ref, mismatch recording and its counter under concurrency, all idempotency cases, and the database guarantees themselves (trigger, CHECK, unique credit index) in `ledger.test.ts`.

**Do the concurrency tests have teeth?** I checked by mutation: with the `FOR UPDATE` locks removed, the HTTP-level concurrency tests alone did **not** reliably fail (supertest's per-request server startup spreads requests out in time). That is why the service-level tests exist: they start all calls in the same tick. With the locks removed they fail on every run; with the locks in place they pass on every run.

## 6. Trade-offs and honest limits

- **Pessimistic locking serializes all activity on one wallet.** Fine for a member's own wallet (low per-wallet rate); it would not suit a shared hot wallet.
- **Derived turnover** trades two sums per withdrawal for zero drift risk.
- **Idempotency replay returns the stored body with a fixed 201**; the brief's endpoints all return 201 on success so the status is not stored.
- **`CHECK` and trigger are belt-and-braces**, not a replacement for the application logic. The trigger does not stop a superuser or `TRUNCATE`; tests rely on `TRUNCATE` for cleanup.
- **No signature verification on callbacks** in Part A (the brief calls the PSP mock). Part B (`DESIGN-PSP.md`) covers where it lives.
- A crash after commit but before the HTTP response is exactly the case idempotent callbacks and keys exist for; I did not add anything beyond that.

## 7. Known gaps and assumptions

- **Member account status** (suspended, closed, KYC) is not modeled: every existing member can transact. Out of scope per the brief (no auth); on a regulated platform this is the first thing to add.
- **No withdrawal approval or refund path.** Withdrawals stay `Pending`; if one is later rejected, returning the money must be a new ledger entry (a credit), never an edit.
- Single currency, one wallet per member (starter schema).
- `GET` endpoints beyond the starter's wallet read were not built; the brief did not ask for them.
- `GET /members/:id/wallet` (starter code) still returns 500 for a malformed UUID; I left the starter route's logic alone. Its 404 body changed from `{ error: 'wallet not found' }` to `{ error: 'wallet_not_found' }` when its literals moved to `ErrorCode`, to match every other error code.

## 8. What I would do next

1. **Consume turnover per deposit** (a per-deposit turnover ledger) to close the surplus-carry-forward loophole, and denormalized turnover counters on `wallets` (updated under the same lock) if the sums get hot.
2. **Account status** gate on deposits and withdrawals.
3. **Withdrawal lifecycle**: approve/reject with a compensating ledger credit, and PSP payout callbacks reusing the same state machine.
4. **Reconciliation job**: assert `balance = SUM(ledger)` for every wallet on a schedule and alert; review `callback_mismatches`.
5. **Callback signature verification** and the PSP adapter layer from `DESIGN-PSP.md`.
6. **Observability**: structured logs with `pspRef` / `walletId`, metrics on lock wait time and mismatch counts.
7. Idempotency key expiry (TTL cleanup job).

## 9. AI-usage disclosure

I used **Claude Code (Claude Sonnet 5.5)**, driven through the Spec Kit workflow (`/speckit-constitution`, `specify`, `clarify`, `plan`, `tasks`, `analyze`, `implement`) in this repository.

- **What it produced**: first drafts of the spec, plan, research notes, task list, migrations, models, services, routes, tests, and the first draft of this file and `DESIGN-PSP.md`.
- **What I decided** (answers given to the clarification questions and earlier choices): amount mismatch rejects with no credit; unknown `pspRef` returns 404; turnover compares lifetime totals; `failed` callbacks ignore the amount; idempotency keys on all three client writes; amounts allow 18 decimal places; account status is out of scope; mismatch records are one per distinct `(pspRef, amount)`.
- **What it caught and I verified**: running the suite found a real bug (zod ran the positivity check after a failed format check, so `"abc"` produced a 500 instead of a 400); the mutation test above found that my first concurrency tests were too weak.
- **Part B revision**: the first draft of `DESIGN-PSP.md` was reviewed against its own spec (`specs/002-psp-integration-design/`) and revised. Gaps found and fixed: no ordered "add a PSP" checklist; existing versus proposed was not labelled (the proposed route differs from the built `POST /psp/callbacks`); the "success before pending" quirk was described wrongly (the `success` is applied by the core, the later `pending` is what maps to `ignore`) and there was no quirk-to-location table; unmapped provider statuses and "what if the abstraction cannot express a quirk" were unstated. Prose is 548 words outside code blocks.
