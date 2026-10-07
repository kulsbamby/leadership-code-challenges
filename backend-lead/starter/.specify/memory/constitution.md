# Mini Wallet Service Constitution

## Core Principles

### I. Money Correctness Over Everything
Money movement correctness outranks speed, elegance, and scope. A money bug is an incident.
- Money MUST NOT touch a JS `number`. It travels as strings at API/JSON boundaries and as
  `BigNumber` (via `src/lib/money.ts`) in between. DB type is `DECIMAL(36,18)`.
- Invariants MUST be enforced by the database where possible (unique constraints, `CHECK`
  constraints, row locks), not by application checks alone.

### II. Append-Only Ledger
Every balance change MUST write an append-only ledger entry in the same DB transaction as the
balance update. Ledger rows MUST NOT be updated or deleted. The wallet balance MUST always equal
the sum of its ledger entries, and a test MUST assert this.

### III. Idempotency and Concurrency by Construction
Inbound PSP callbacks are hostile: duplicates, concurrent duplicates, late retries, unknown
references, mismatched amounts. A completed deposit MUST credit exactly once. Concurrent wagers
MUST NOT overdraw. Locking strategy (row lock, optimistic, unique key) MUST be explicit and
justified in `DECISIONS.md`. Funding transactions MUST follow an explicit state machine; invalid
transitions MUST be rejected, never silently applied.

### IV. Test the Risks That Matter (NON-NEGOTIABLE)
Tests for the money risks are written with or before the code that handles them: sequential
duplicate callback, concurrent duplicate callbacks, concurrent wagers vs. overdraw, turnover lock
blocks and unblocks. Concurrency tests MUST run against real PostgreSQL (no mocks of the DB).
Coverage of trivial code is not a goal.

### V. Keep the Starter's Conventions
- Routes parse input with zod and delegate to services; business logic lives in services.
- Any operation writing more than one row runs in a single `sequelize.transaction`.
- Schema changes are migrations in `src/db/migrations/`, never `sync()`.
- No heavy dependencies (queues, ORMs, frameworks). A small library requires justification in
  `DECISIONS.md`. Any deviation from a convention MUST be explained in `DECISIONS.md`.

## Scope and Delivery Constraints

- Time budget is about 4 hours (about 3h code, 45 min design note). When time runs out, stop and
  record next steps in `DECISIONS.md`; unfinished with clear reasoning beats polished and late.
- Out of scope: auth, deployment, Docker hardening, UI, approval workflow for withdrawals.
- Assumptions MUST be stated inline and in `DECISIONS.md` rather than blocked on.
- Required deliverables: working code and tests with readable commit history, `DECISIONS.md`
  (trade-offs, locking strategy, schema choices, next steps, AI-usage disclosure) and
  `DESIGN-PSP.md` (Part B).
- AI use is allowed and MUST be disclosed (at the end of the submission and in `DECISIONS.md`).
  The owner MUST be able to defend every line.
- Every part of the challenge MUST be minimally attempted, even if incomplete.
- Reviewers stop reading at a stated page or word limit: keep `DESIGN-PSP.md` to ~1 page + sketch.
- Submission: a link to an online repository, or an attached zip with `.git` included, so the
  commit history is readable without pain. Work from a template copy or clone, never a fork.
  Do NOT open a pull request or issue against the challenge repository.

## Development Workflow

- Spec Kit flow: specify, (clarify), plan, tasks, (analyze), implement. Plans MUST pass the
  Constitution Check against the principles above.
- Commits are small and meaningful. Quality gates before a task is done: `npx tsc --noEmit`
  clean and `npm test` green against the test database.
- Notable decisions are logged to `DECISIONS.md` as they are made, not reconstructed afterward.

## Governance

This constitution supersedes other practices for this project. Amendments require editing this
file with a version bump (MAJOR: principle removed or redefined; MINOR: principle or section
added or materially expanded; PATCH: wording). Every plan and implementation review MUST verify
compliance with the principles; unavoidable complexity MUST be justified in `DECISIONS.md`.
Runtime guidance lives in `CLAUDE.md`.

**Version**: 1.1.0 | **Ratified**: 2026-10-07 | **Last Amended**: 2026-10-07
