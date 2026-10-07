# Implementation Plan: Wallet Money Flow (Deposit, Wager, Withdrawal)

**Branch**: `001-wallet-money-flow` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-wallet-money-flow/spec.md`

## Summary

Build the deposit -> wager -> withdrawal flow on the existing Express/Sequelize/Postgres starter. Correctness
comes from the database: one `SELECT ... FOR UPDATE` on the wallet row serializes every balance change, a
`CHECK (balance >= 0)` backstops overdraw, a unique `psp_ref` plus a row lock on the funding transaction makes
callbacks idempotent, a partial unique index on the ledger makes a double credit impossible, and a trigger
makes the ledger append-only. Turnover is derived from rows under the wallet lock. Client writes accept an
optional `Idempotency-Key`. Rationale and alternatives: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.5, Node 20+

**Primary Dependencies**: Express 4, Sequelize 6, zod, bignumber.js (all existing). **No new dependencies**
(hashing uses Node `crypto`).

**Storage**: PostgreSQL 16, `DECIMAL(36,18)` money, migrations only (never `sync()`)

**Testing**: Jest + supertest, `--runInBand`, real Postgres test DB (concurrency tests use `Promise.all` of
real HTTP requests)

**Target Platform**: Linux server / local Docker Postgres

**Project Type**: web-service (single project, existing layout)

**Performance Goals**: none stated; correctness over throughput. 50 concurrent duplicate callbacks must
resolve correctly.

**Constraints**: money never a JS `number`; multi-row writes in one `sequelize.transaction`; ledger append-only;
every query inside a business transaction passes `{ transaction: t }`.

**Scale/Scope**: take-home; ~4 endpoints, 5 new tables, ~6 test files. Time budget ~3h code.

## Constitution Check

*GATE: passed before research; re-checked after design.*

| Principle | Status | How the design satisfies it |
|---|---|---|
| I. Money correctness | PASS | strings + BigNumber; sums done in Postgres `NUMERIC`, wrapped with `dec()`; CHECK constraints, row locks, unique indexes |
| II. Append-only ledger | PASS | single `ledgerService.postEntry` writes balance + ledger row in one transaction; DB trigger blocks UPDATE/DELETE; test asserts sum = balance |
| III. Idempotency/concurrency | PASS | wallet lock + funding-tx lock, ordered (funding tx, then wallet); state machine in one module; strategy documented in `DECISIONS.md` |
| IV. Tests for the risks | PASS | the four mandated tests plus idempotency, mismatch, ledger invariant, all on real Postgres |
| V. Starter conventions | PASS | zod in routes, logic in services, migrations, models registered in `models/index.ts`, routers mounted in `app.ts` |
| Scope: no heavy deps | PASS | none added |

**Post-design re-check**: still PASS. Two items need a `DECISIONS.md` justification (not violations): the
idempotency-key feature goes beyond the brief (FR-018, clarified by the owner), and the `wallets` CHECK
constraint plus append-only trigger are extra DB guarantees.

## Project Structure

### Documentation (this feature)

```text
specs/001-wallet-money-flow/
├── spec.md
├── plan.md              # this file
├── research.md          # decisions R1-R9
├── data-model.md        # tables, constraints, state machine
├── quickstart.md        # run and validation guide
├── contracts/api.md     # endpoint contract
├── checklists/requirements.md
└── tasks.md             # created by /speckit-tasks
```

### Source Code (backend-lead/starter)

```text
src/
├── app.ts                         # mount new routers; errorHandler learns AppError
├── lib/
│   ├── money.ts                   # existing
│   ├── errors.ts                  # NEW AppError(status, code, extra)
│   ├── schemas.ts                 # NEW zod amountString (<=18 dp, > 0), uuid, key header
│   └── idempotency.ts             # NEW runIdempotent(key, scope, payload, work)
├── db/
│   ├── migrations/                # NEW 20261007…: funding_transactions, wallet_txs (+trigger, index),
│   │                              #   wagers, callback_mismatches, idempotency_keys, wallets CHECK
│   └── models/                    # NEW fundingTransaction, walletTx, wager, callbackMismatch,
│                                  #   idempotencyKey; register in index.ts
├── routes/                        # NEW deposits.ts, psp.ts, wallets.ts (wagers), withdrawals.ts
└── services/
    ├── fundingStateMachine.ts     # NEW pure transition table: noop | apply | throw 409
    ├── ledgerService.ts           # NEW postEntry: the only writer of wallets.balance
    ├── depositService.ts          # NEW create Pending deposit + pspRef
    ├── pspCallbackService.ts      # NEW lock funding tx -> state machine -> credit; mismatch path
    ├── wagerService.ts            # NEW lock wallet -> check -> debit -> wager row
    ├── turnoverService.ts         # NEW required/accrued/outstanding sums
    └── withdrawalService.ts       # NEW lock wallet -> turnover -> balance -> debit + Pending tx
test/
├── helpers.ts                     # NEW fund(member), assertLedgerMatchesBalance
├── deposits.test.ts  callbacks.test.ts  wagers.test.ts
├── withdrawals.test.ts  idempotency.test.ts  ledger.test.ts
DECISIONS.md  DESIGN-PSP.md        # deliverables, written alongside, finished last
```

**Structure Decision**: keep the starter's single-project layout; add files in the existing `routes/`,
`services/`, `db/` directories. No new top-level folders.

## Key flows (lock order is always funding tx, then wallet)

- **Callback**: `BEGIN` -> lock funding tx by `psp_ref` (404 if none) -> `fundingStateMachine.decide(current, requested)`
  -> `noop`: 200 `applied:false` | throw 409 | `apply`: if `completed` and amount differs -> `ROLLBACK`, upsert
  mismatch in its own transaction, 422; else set status; on `completed` lock wallet, `postEntry(deposit_credit)`
  -> `COMMIT`.
- **Wager**: `BEGIN` -> (idempotency begin) -> lock wallet (404) -> `balance >= amount` else 422 -> insert wager ->
  `postEntry(wager_debit)` -> store response -> `COMMIT`.
- **Withdrawal**: `BEGIN` -> (idempotency begin) -> lock wallet by `memberId` (404) -> turnover sums, 422 with
  outstanding -> balance check, 422 -> insert `Pending` withdrawal -> `postEntry(withdrawal_debit)` -> `COMMIT`.

## Build order (feeds /speckit-tasks)

1. Migrations + models + `errors`/`schemas`/`ledgerService` foundation.
2. Deposits and callbacks with their tests (sequential and concurrent duplicate), state machine.
3. Wagers with the overdraw test.
4. Turnover and withdrawals with the lock test.
5. Idempotency keys (cut line: keep withdrawals only if time is short).
6. Ledger invariant test, `DECISIONS.md`, `DESIGN-PSP.md`.

## Complexity Tracking

No constitution violations. Items to justify in `DECISIONS.md`: idempotency keys beyond the brief, DB trigger
and CHECK as extra guarantees, derived (not stored) turnover.
