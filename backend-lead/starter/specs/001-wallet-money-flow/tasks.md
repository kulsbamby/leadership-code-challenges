---

description: "Task list for Wallet Money Flow (deposit, wager, withdrawal)"
---

# Tasks: Wallet Money Flow (Deposit, Wager, Withdrawal)

**Input**: Design documents from `specs/001-wallet-money-flow/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**Tests**: REQUIRED. Constitution principle IV makes the money-risk tests non-negotiable, and they run against real PostgreSQL. In each story phase, write the tests first and see them fail before implementing.

**Organization**: Grouped by user story. All paths are relative to `backend-lead/starter/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 deposit credited exactly once, US2 wagers, US3 withdrawal turnover lock, US4 auditable ledger

## Conventions every task must respect (from the constitution)

- Money is never a JS `number`: strings at the boundary, `dec()` / `ZERO` from `src/lib/money.ts` in between. DB type `DECIMAL(36,18)`.
- Any operation writing more than one row runs in one `sequelize.transaction`, and **every query inside it passes `{ transaction: t }`** (there is no CLS).
- Routes: zod parse, call a service, `next(err)`. No business logic in routes.
- Migrations are JS files `YYYYMMDDHHMMSS-name.js` in `src/db/migrations/`, snake_case columns, `gen_random_uuid()` defaults, `created_at`/`updated_at` with `defaultValue: Sequelize.literal('now()')` like the existing ones. Never `sync()`.
- Never update or delete `wallet_txs` rows. Only `ledgerService.postEntry` writes `wallets.balance`.

---

## Phase 1: Setup

- [X] T001 Verify the baseline: `cp .env.example .env` (if missing), `npm install`, `npm run db:up`, `npm run db:migrate`, `npx tsc --noEmit`, `npm test`. All must pass before any change.
- [X] T002 Create `DECISIONS.md` skeleton with headings: Locking strategy, Schema, Idempotency, Amount mismatch and unknown pspRef, Turnover (lifetime totals, accepted loophole), Trade-offs, Known gaps (member account status, no withdrawal approval/refund), Next steps, AI-usage disclosure. Log each decision there as the task that makes it is finished (research.md R1-R9 is the source).

---

## Phase 2: Foundational (blocks all user stories)

**Checkpoint**: tables, models, error type, validation schemas, ledger writer, and test helpers exist; migrations run on dev and test DBs.

- [X] T003 Create migration `src/db/migrations/20261007000001-create-funding-transactions.js` for table `funding_transactions`: `id` UUID PK `gen_random_uuid()`; `member_id` UUID NOT NULL FK `members`; `wallet_id` UUID NOT NULL FK `wallets`; `type` VARCHAR NOT NULL CHECK in (`deposit`,`withdrawal`); `status` VARCHAR NOT NULL CHECK in (`Pending`,`Completed`,`Failed`); `amount` DECIMAL(36,18) NOT NULL CHECK `> 0`; `turnover_multiplier` INTEGER NOT NULL DEFAULT 1 CHECK `>= 0`; `psp_ref` VARCHAR NULL **UNIQUE**; CHECK `type <> 'deposit' OR psp_ref IS NOT NULL`; `created_at`, `updated_at`. Index `(member_id, type, status)`. Add checks with `queryInterface.sequelize.query` raw SQL after `createTable`.
- [X] T004 Create migration `src/db/migrations/20261007000002-create-wagers.js` for table `wagers`: `id` UUID PK; `wallet_id` UUID NOT NULL FK `wallets`; `amount` DECIMAL(36,18) NOT NULL CHECK `> 0`; `created_at`. Index `(wallet_id)`.
- [X] T005 Create migration `src/db/migrations/20261007000003-create-wallet-txs.js` for the ledger table `wallet_txs`: `id` UUID PK; `wallet_id` UUID NOT NULL FK `wallets`; `kind` VARCHAR NOT NULL CHECK in (`deposit_credit`,`wager_debit`,`withdrawal_debit`); `amount` DECIMAL(36,18) NOT NULL signed (credits positive, debits negative) CHECK `<> 0`; `balance_after` DECIMAL(36,18) NOT NULL; `funding_transaction_id` UUID NULL FK; `wager_id` UUID NULL FK; `created_at` only (no `updated_at`). Add the **unique partial index** `(funding_transaction_id, kind) WHERE funding_transaction_id IS NOT NULL`, and the append-only trigger: function `wallet_txs_append_only()` raising an exception, `BEFORE UPDATE OR DELETE ... FOR EACH ROW`. `down` drops trigger, function, then table. Depends on T003, T004.
- [X] T006 Create migration `src/db/migrations/20261007000004-add-wallet-balance-check.js`: `ALTER TABLE wallets ADD CONSTRAINT wallets_balance_non_negative CHECK (balance >= 0)`; `down` drops it. Do not edit the existing wallets migration.
- [X] T007 [P] Create model `src/db/models/fundingTransaction.ts` (`FundingTransaction`; money and `psp_ref` typed `string`, `turnoverMultiplier: number`, `type`/`status` as string unions, `tableName: 'funding_transactions'`, `underscored: true`, pattern from `wallet.ts`).
- [X] T008 [P] Create model `src/db/models/wager.ts` (`Wager`, `updatedAt: false`).
- [X] T009 [P] Create model `src/db/models/walletTx.ts` (`WalletTx`, `updatedAt: false`, `balanceAfter: string`).
- [X] T010 Register T007-T009 in `src/db/models/index.ts` (init calls; associations: `FundingTransaction.belongsTo(Member|Wallet)`, `Wager.belongsTo(Wallet)`, `WalletTx.belongsTo(Wallet)`; export them). Depends on T007-T009.
- [X] T011 [P] Create `src/lib/errors.ts`: `class AppError extends Error { constructor(public status: number, public code: string, public extra: Record<string, unknown> = {}) }`.
- [X] T012 Update `errorHandler` in `src/app.ts` to map `AppError` to `res.status(err.status).json({ error: err.code, ...err.extra })`, keeping the existing `ZodError` 400 and 500 branches. Depends on T011.
- [X] T013 [P] Create `src/lib/schemas.ts` with zod: `amountString` = string matching `^\d+(\.\d{1,18})?$` then refined `dec(v).gt(0)` (more than 18 decimals is a 400, never rounded); `uuid` = `z.string().uuid()`; `idempotencyKeyHeader` = optional string length 1-255.
- [X] T014 Create `src/services/ledgerService.ts`: `postEntry(t, wallet, kind, signedAmount: BigNumber, refs: { fundingTransactionId?, wagerId? })`. Precondition: `wallet` was loaded with `lock: t.LOCK.UPDATE` in the same transaction. Computes `newBalance = dec(wallet.balance).plus(signedAmount)`; rejects if negative with `AppError(422, 'insufficient_balance', ...)`; updates `wallets.balance` (string via `toFixed(18)`) and inserts the `WalletTx` with `balanceAfter`, all with `{ transaction: t }`. This is the only writer of `wallets.balance`. Depends on T010, T011.
- [X] T015 [P] Create `test/helpers.ts`: `createMemberWithWallet(username)` (via `memberService.createMember`); `seedCompletedDeposit(memberId, amount, turnoverMultiplier)` which, in one transaction, inserts a `Completed` deposit `FundingTransaction` (generated `psp_ref`) and posts a `deposit_credit` via `ledgerService.postEntry` so stories US2/US3 do not depend on US1 code; `assertLedgerMatchesBalance(walletId)` asserting `SUM(wallet_txs.amount) == wallets.balance` and the last `balance_after` equals the balance, using `dec()` for comparison. Depends on T014.
- [X] T016 Run `npm run db:migrate` and `npm run db:migrate:test`, then `npx tsc --noEmit`. Record schema decisions (CHECK constraints, unique index, trigger) in `DECISIONS.md`.

---

## Phase 3: User Story 1 - Deposit credited exactly once (Priority: P1) 🎯 MVP

**Goal**: `POST /deposits` creates a `Pending` deposit; `POST /psp/callbacks` credits exactly once, handles unknown ref, mismatch, invalid transitions.

**Independent Test**: create a member, create a deposit, deliver `completed` once, again sequentially, and 50 times concurrently on a second deposit: balance equals the deposit amount once, ledger has exactly one credit per deposit.

### Tests for User Story 1 (write first, confirm they fail)

- [X] T017 [P] [US1] Create `test/deposits.test.ts`: 201 with `id`, `pspRef`, `status: "Pending"`, balance still 0; `turnoverMultiplier` defaults to 1 and 0 is accepted; 400 for amount zero, negative, non-numeric, more than 18 decimals, multiplier negative or non-integer; 404 for unknown member.
- [X] T018 [P] [US1] Create `test/callbacks.test.ts` covering spec scenarios: completed credits once and writes one ledger entry; **sequential duplicate** completed returns 200 `applied:false` and balance unchanged; **concurrent duplicates** (`Promise.all` of 50 identical requests on one deposit) all 200, balance credited once, exactly one `deposit_credit` row; failed marks `Failed`, balance unchanged; failed with a different amount still marks `Failed`; completed after failed and failed after completed return 409 with no change; unknown `pspRef` returns 404 and writes nothing; completed with a different amount returns 422, no credit, deposit stays `Pending`; the mismatch row exists with `repeat_count` 1 and, after the same bad callback is sent twice (and concurrently), one row with the right counter; `"100.5"` equals `"100.50"`; call `assertLedgerMatchesBalance` at the end of each money test.

### Implementation for User Story 1

- [X] T019 [US1] Create migration `src/db/migrations/20261007000005-create-callback-mismatches.js`: `id` UUID PK; `psp_ref` VARCHAR NOT NULL; `funding_transaction_id` UUID NOT NULL FK; `expected_amount` and `received_amount` DECIMAL(36,18) NOT NULL; `repeat_count` INTEGER NOT NULL DEFAULT 1; `first_seen_at`, `last_seen_at` TIMESTAMPTZ NOT NULL DEFAULT now(); **UNIQUE `(psp_ref, received_amount)`**. Then run `npm run db:migrate:test`.
- [X] T020 [P] [US1] Create model `src/db/models/callbackMismatch.ts` and register it in `src/db/models/index.ts`.
- [X] T021 [P] [US1] Create `src/services/fundingStateMachine.ts`: pure `decide(current, requested): 'apply' | 'noop'` over statuses `Pending|Completed|Failed` and requests `completed|failed`; `Pending` to either is `apply`; same terminal state is `noop`; anything else throws `AppError(409, 'invalid_transition', { from, to })`. Single place for the rules (FR-008).
- [X] T022 [US1] Create `src/services/depositService.ts` `createDeposit({ memberId, amount, turnoverMultiplier })`: find wallet by member (404 `member_not_found`), insert a `Pending` deposit with `pspRef = 'psp_' + crypto.randomUUID()` (Node `crypto`), return the contract body. No ledger, no balance change.
- [X] T023 [US1] Create `src/services/pspCallbackService.ts` `handleCallback({ pspRef, status, amount })`: transaction; lock the funding transaction by `psp_ref` with `lock: t.LOCK.UPDATE` (404 `psp_ref_not_found`, nothing written); `fundingStateMachine.decide`; on `noop` return `{ status, applied: false }`; on `failed` set `Failed` and ignore the amount; on `completed` compare `dec(amount).isEqualTo(dec(deposit.amount))`, and on mismatch throw a `MismatchError` carrying expected/received so the transaction rolls back; otherwise set `Completed`, lock the wallet (`lock: t.LOCK.UPDATE`), `ledgerService.postEntry(deposit_credit)`. Outside the transaction, catch `MismatchError`, upsert into `callback_mismatches` in its own short transaction with `INSERT ... ON CONFLICT (psp_ref, received_amount) DO UPDATE SET repeat_count = callback_mismatches.repeat_count + 1, last_seen_at = now()` (raw query with replacements), then throw `AppError(422, 'amount_mismatch', { expected, received })`. Lock order: funding tx, then wallet. Depends on T014, T019-T021.
- [X] T024 [P] [US1] Create `src/routes/deposits.ts` (zod body: `memberId` uuid, `amount` `amountString`, `turnoverMultiplier` `z.number().int().min(0).default(1)`; 201 with body; `next(err)` on failure).
- [X] T025 [P] [US1] Create `src/routes/psp.ts` (`POST /callbacks`; zod body: `pspRef` non-empty string, `status` enum `completed|failed`, `amount` `amountString`; 200 with the service result).
- [X] T026 [US1] Mount `/deposits` and `/psp` routers in `src/app.ts`. Depends on T024, T025.
- [X] T027 [US1] Run `npx tsc --noEmit` and `npm test`; T017-T018 must pass. Log in `DECISIONS.md`: callback locking and lock order, state machine, mismatch policy (422, no credit, record kept via separate transaction), unknown ref 404, `failed` ignores amount.

**Checkpoint**: US1 works and is demoable on its own (MVP).

---

## Phase 4: User Story 2 - Wagers debit the wallet safely (Priority: P1)

**Goal**: `POST /wallets/:walletId/wagers` debits, records the wager, never overdraws.

**Independent Test**: fund a wallet with 10 (via `seedCompletedDeposit`), fire concurrent wagers of 10: exactly one succeeds, the rest get 422, balance 0.

- [X] T028 [P] [US2] Create `test/wagers.test.ts`: balance 100, wager `10.00` gives 201 with balance 90 and a `wager_debit` ledger row with amount `-10`; balance 5, wager 10 gives 422 `insufficient_balance` with nothing changed (no wager row, no ledger row); **concurrent** `Promise.all` of 5 wagers of 10 on a balance of 10: exactly one 201, four 422, balance 0 and never negative; unknown wallet gives 404; invalid amounts give 400; `assertLedgerMatchesBalance` at the end.
- [X] T029 [US2] Create `src/services/wagerService.ts` `placeWager({ walletId, amount })`: transaction; lock the wallet by id (`lock: t.LOCK.UPDATE`, 404 `wallet_not_found`); reject if `dec(balance).lt(amount)` with `AppError(422, 'insufficient_balance', { balance, requested })`; insert the `Wager`; `ledgerService.postEntry(wager_debit, -amount, { wagerId })`; return `{ id, walletId, amount, balance }`. Depends on T014.
- [X] T030 [US2] Create `src/routes/wallets.ts` (`POST /:walletId/wagers`; zod `walletId` uuid, body `amount`; 201) and mount it as `/wallets` in `src/app.ts`.
- [X] T031 [US2] Run `npx tsc --noEmit` and `npm test`; T028 must pass. Log the wager locking decision in `DECISIONS.md` (wallet row lock plus CHECK backstop).

**Checkpoint**: US1 and US2 each work independently.

---

## Phase 5: User Story 3 - Withdrawal blocked until turnover is met (Priority: P1)

**Goal**: `POST /withdrawals` allowed only when accrued turnover >= required turnover; debits immediately and creates a `Pending` withdrawal.

**Independent Test**: seed a completed deposit of 100 (multiplier 1), withdraw gives 422 with outstanding 100, wager 100, withdraw 50 gives 201.

- [X] T032 [P] [US3] Create `test/withdrawals.test.ts`: deposit 100 mult 1 and no wagers gives 422 `turnover_not_met` with `required` 100, `accrued` 0, `outstanding` 100; after a wager of 60, outstanding is 40; after wagers reach 100 the withdrawal of 50 gives 201, status `Pending`, balance drops by 50 and a `withdrawal_debit` ledger row exists (**lock blocks then unblocks**); multiplier 0 adds no requirement; a `Failed` or `Pending` deposit adds no requirement; lock satisfied but balance lower than the amount gives 422 `insufficient_balance` with no state change; concurrent withdrawals that together exceed the balance: only the affordable ones succeed and balance never goes negative; unknown member gives 404; `assertLedgerMatchesBalance` at the end.
- [X] T033 [P] [US3] Create `src/services/turnoverService.ts` `getTurnover(t, memberId, walletId)` returning `{ required, accrued, outstanding }` as `BigNumber`: `required` from raw SQL `SELECT COALESCE(SUM(amount * turnover_multiplier), 0)::text FROM funding_transactions WHERE member_id = :m AND type = 'deposit' AND status = 'Completed'`; `accrued` from `SELECT COALESCE(SUM(amount), 0)::text FROM wagers WHERE wallet_id = :w`; both wrapped in `dec()`; `outstanding = BigNumber.max(required.minus(accrued), ZERO)`. Pass `{ transaction: t }`. Sums run in Postgres `NUMERIC`, never JS `number`.
- [X] T034 [US3] Create `src/services/withdrawalService.ts` `requestWithdrawal({ memberId, amount })`: transaction; lock the wallet by `memberId` (`lock: t.LOCK.UPDATE`, 404 `member_not_found`); `getTurnover`; if `outstanding.gt(0)` throw `AppError(422, 'turnover_not_met', { required, accrued, outstanding })`; then if `dec(balance).lt(amount)` throw `insufficient_balance`; insert a `Pending` withdrawal `FundingTransaction` (`psp_ref` null, multiplier 1); `ledgerService.postEntry(withdrawal_debit, -amount, { fundingTransactionId })`; return `{ id, status: 'Pending', amount, balance }`. Turnover is checked before balance. Depends on T014, T033.
- [X] T035 [US3] Create `src/routes/withdrawals.ts` (zod body `memberId` uuid, `amount` `amountString`; 201) and mount `/withdrawals` in `src/app.ts`.
- [X] T036 [US3] Run `npx tsc --noEmit` and `npm test`; T032 must pass. Log in `DECISIONS.md`: derived (not stored) turnover under the wallet lock, lifetime totals and the accepted "withdraw then keep the satisfied lock" loophole, turnover-before-balance order.

**Checkpoint**: the full deposit, wager, withdrawal flow works.

---

## Phase 6: User Story 4 - Auditable ledger (Priority: P2)

**Goal**: prove the ledger invariant and the database guarantees behind it.

**Independent Test**: after a mixed sequence, ledger sum equals balance; direct UPDATE/DELETE on `wallet_txs` is rejected by the database.

- [X] T037 [US4] Create `test/ledger.test.ts`: run a mixed flow (deposit completes, wagers, withdrawal, one rejected wager, one rejected withdrawal) and assert `SUM(wallet_txs.amount) == wallets.balance` and the last `balance_after` equals the balance, with no ledger row from rejected operations; raw `UPDATE wallet_txs` and raw `DELETE FROM wallet_txs` each throw (trigger); raw `UPDATE wallets SET balance = -1` throws (CHECK `wallets_balance_non_negative`); a raw second `deposit_credit` insert for the same `funding_transaction_id` throws (unique partial index).
- [X] T038 [US4] Run `npm test`; T037 must pass. Log the append-only trigger and the unique credit index in `DECISIONS.md`.

---

## Phase 7: Client idempotency keys (FR-018, cross-cutting)

**Goal**: optional `Idempotency-Key` on `POST /deposits`, `POST /wallets/:walletId/wagers`, `POST /withdrawals`. **Cut line**: if time is short, do only the withdrawal integration (T044) and record the rest as a next step in `DECISIONS.md`.

- [X] T039 Create migration `src/db/migrations/20261007000006-create-idempotency-keys.js`: `id` UUID PK; `scope` VARCHAR NOT NULL; `key` VARCHAR NOT NULL (max 255); `request_hash` VARCHAR NOT NULL; `response_body` JSONB NULL; `created_at`; **UNIQUE `(scope, key)`**. Then run `npm run db:migrate:test`.
- [X] T040 [P] Create model `src/db/models/idempotencyKey.ts` and register it in `src/db/models/index.ts`.
- [X] T041 Create `src/lib/idempotency.ts` `runIdempotent({ key, scope, payload, work })` where `work(t)` returns the response body: without a key, just `sequelize.transaction(work)`. With a key: transaction; `INSERT ... ON CONFLICT (scope, key) DO NOTHING RETURNING id` with `request_hash = sha256(canonical JSON of the normalized payload)` (Node `crypto`); if inserted, run `work(t)`, store `response_body`, return `{ replayed: false, body }`; if not inserted, load the row, compare hashes: equal returns `{ replayed: true, body: stored }`, different throws `AppError(422, 'idempotency_key_reuse')`. A failed `work` rolls the key row back too. Depends on T039, T040.
- [X] T042 [P] Create `test/idempotency.test.ts`: same key and payload twice on `POST /withdrawals` gives the same 201 body and one debit and one ledger row; same key with a different amount gives 422 `idempotency_key_reuse`; **concurrent** `Promise.all` of 10 withdrawals with one key debits exactly once; a failed (422) request does not burn the key; deposits and wagers replay the same way; no header behaves as before.
- [X] T043 [P] Pass the optional key through `src/routes/deposits.ts` (read the `Idempotency-Key` header) into `depositService.createDeposit`, wrapping its body in `runIdempotent` (scope `deposits:<memberId>`). Depends on T041.
- [X] T044 [P] Same for `src/routes/withdrawals.ts` and `withdrawalService.requestWithdrawal` (scope `withdrawals:<memberId>`). Depends on T041.
- [X] T045 [P] Same for `src/routes/wallets.ts` and `wagerService.placeWager` (scope `wagers:<walletId>`). Depends on T041.
- [X] T046 Run `npx tsc --noEmit` and `npm test`; T042 must pass. Log in `DECISIONS.md`: why keys were added beyond the brief, scope, hash, only-success replay.

---

## Phase 8: Polish and deliverables

- [X] T047 Complete `DECISIONS.md` (weighted heavily): locking strategy with lock order, schema and constraints, trade-offs and rejected alternatives (optimistic locking, stored turnover, SERIALIZABLE), assumptions (single currency, 18 decimals, one wallet per member), known gaps (member account status, no approval or refund path, no signature verification in Part A), next steps, and the AI-usage disclosure (what AI was used for; owner defends every line).
- [X] T048 [P] Write `DESIGN-PSP.md` (~1 page plus a sketch): `PspAdapter` interface (verify, parse/normalize to `{ pspRef, status, amountMinorUnits to decimal string }`), where verification and normalization live (adapter at the edge, core stays provider-agnostic), config-driven registry (per-PSP secrets, status map, amount scale), idempotent core reused unchanged, and testing without the provider (recorded payload fixtures, contract test suite every adapter must pass, local fake PSP).
- [X] T049 Run `specs/001-wallet-money-flow/quickstart.md` end to end against `npm run dev`; fix any drift between the doc and behavior.
- [X] T050 Final gates: `npx tsc --noEmit` clean; `npm test` green three times in a row (flakiness check on the concurrency tests); run `npx graphify hook-rebuild` as `CLAUDE.md` requires after code changes.

---

## Dependencies & Execution Order

- **Phase 1** then **Phase 2** (blocks everything). Inside Phase 2: T003, T004 then T005; T006 independent; T007-T009 then T010; T011 then T012; T014 needs T010 and T011; T015 needs T014.
- **US1 (Phase 3)**, **US2 (Phase 4)**, **US3 (Phase 5)** each depend only on Phase 2 (tests seed money through `seedCompletedDeposit`, not through US1 code). Recommended order is sequential P1: US1, US2, US3.
- **US4 (Phase 6)** needs the flows from US1-US3 to exercise a mixed sequence.
- **Phase 7** needs the three services and routes from US1-US3.
- **Phase 8** last.
- Mounting tasks T026, T030, T035 all edit `src/app.ts`: do them sequentially.

### Parallel opportunities

- Phase 2: T007, T008, T009, T011, T013 together; T015 once T014 exists.
- US1: T017 with T018; T020 with T021; T024 with T025.
- US2/US3 tests (T028, T032) and `turnoverService` (T033) can be written while US1 is in progress, since they touch different files.
- Phase 7: T043, T044, T045 together after T041.

```bash
# Example: foundational parallel batch
Task: "Create model src/db/models/fundingTransaction.ts"
Task: "Create model src/db/models/wager.ts"
Task: "Create model src/db/models/walletTx.ts"
Task: "Create src/lib/errors.ts"
Task: "Create src/lib/schemas.ts"
```

## Implementation Strategy

### MVP first

Phases 1, 2, and 3 (US1) deliver a credited-once deposit with callbacks, the riskiest piece. Stop and validate with `npm test` before continuing.

### Incremental delivery

US1, then US2, then US3 (the full flow), then US4 (ledger proof), then idempotency keys (apply the cut line if time is short), then the written deliverables. Commit after each task or small group with a readable message (history is reviewed). Do not commit unless asked.

### Time guard (~3h code, 45 min design)

If the budget is tight: stop at the end of Phase 6, do the withdrawal-only slice of Phase 7 if there is time, and write what remains under Next steps in `DECISIONS.md` rather than polishing. `DESIGN-PSP.md` is a required deliverable and must not be skipped.

## Notes

- [P] tasks touch different files and have no unfinished dependency.
- Tests must fail before the implementation and pass after.
- Every money test ends with `assertLedgerMatchesBalance`.
