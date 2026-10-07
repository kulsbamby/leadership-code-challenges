# CLAUDE.md

Backend Lead take-home: a mini wallet service (deposit → wager → withdrawal) for a regulated, real-money platform. Work happens in this directory (`backend-lead/starter/`). The workflow is Spec Kit (`/speckit-*`).

## Reference docs (source of truth, read before acting)

- @../readme.md - the challenge brief: Part A (A1-A5), Part B, deliverables, rules, evaluation criteria
- @README.md - starter setup, layout, and the conventions that are part of the exercise
- @../readme2.md - root rules: time budget, AI-disclosure, assumptions, submission
- Package/tooling: @package.json, @tsconfig.json, @jest.config.js, @docker-compose.yml, @.env.example
- Existing patterns to copy: @src/app.ts, @src/services/memberService.ts, @src/routes/members.ts, @src/lib/money.ts, @src/db/models/wallet.ts, @test/members.test.ts

## Stack and commands

TypeScript, Express 4, Sequelize 6, PostgreSQL 16, Jest + supertest, zod, bignumber.js. Node 20+.

```bash
cp .env.example .env && npm install
npm run db:up           # Postgres on localhost:5439 (dev + test DBs)
npm run db:migrate      # dev DB
npm test                # migrates test DB, runs jest --runInBand
npm run dev             # API on :3000
npx tsc --noEmit        # type check
```

## What to build

- **A1** `POST /deposits` - creates a `Pending` funding transaction, returns 201 with id + generated `pspRef`. `amount` positive decimal string; `turnoverMultiplier` integer >= 0, default 1. No money moves.
- **A2** `POST /psp/callbacks` - `{pspRef, status: completed|failed, amount}`. Must be idempotent and safe under concurrent duplicate delivery; credits the wallet exactly once; handles unknown `pspRef` and amount mismatch (decide and document). Explicit state machine `Pending → Completed/Failed`; invalid transitions rejected, not silently applied.
- **A3** `POST /wallets/:walletId/wagers` - debit wallet (reject insufficient balance), accrue turnover, ledger entry. Concurrent wagers must not overdraw.
- **A4** `POST /withdrawals` - allowed only if accrued turnover >= required turnover (sum of `amount × turnoverMultiplier` over completed deposits); else 422 with outstanding turnover in the body. Valid withdrawal debits immediately and creates a `Pending` funding transaction. No approval flow needed.
- **A5** Tests: sequential duplicate callback, concurrent duplicate callbacks, concurrent wagers cannot overdraw, turnover lock blocks and unblocks.
- **Part B** `DESIGN-PSP.md` (~1 page + sketch): how to make the 50th PSP a one-day junior task (interface, verification/normalization placement, config-driven, testing without calling the provider).
- **Deliverables** (put at `backend-lead/starter/` root unless told otherwise): working code + tests with a readable commit history, `DECISIONS.md` (weighted heavily: locking strategy, schema, trade-offs, next steps, AI-usage disclosure), `DESIGN-PSP.md`.

## Non-negotiable conventions

- Money never touches JS `number`. Strings at API/JSON boundaries, `BigNumber` via `src/lib/money.ts` (`dec`, `ZERO`) in between. DB type `DECIMAL(36,18)`.
- Any operation writing more than one row runs in a single `sequelize.transaction` (pattern: `memberService.createMember`).
- Routes: parse input with zod, delegate to a service, `next(err)` on failure. Business logic lives in services, never routes.
- Schema changes are migrations in `src/db/migrations/` (JS, `YYYYMMDDHHMMSS-name.js`, snake_case columns, `gen_random_uuid()` defaults). Never `sync()`.
- Mount new routers in `src/app.ts`; add models in `src/db/models/` and register in `models/index.ts`.
- The wallet balance must always be reconstructible from an append-only ledger. Never update or delete ledger rows.
- Correctness of money movement outranks everything. Prefer DB-enforced guarantees (unique constraints, row locks `SELECT ... FOR UPDATE`, `CHECK (balance >= 0)`) over application-level checks alone.
- No heavy new dependencies (queues, ORMs, frameworks). A small library is fine if justified in `DECISIONS.md`.
- Deviating from a starter convention is allowed only if `DECISIONS.md` says why.

## Working rules

- Time budget is ~4h (3h code + 45min design). When scope is tight, stop and record what is next in `DECISIONS.md` rather than polishing.
- State assumptions inline and in `DECISIONS.md`; don't wait for answers on gaps in the brief.
- The owner must be able to defend every line in the interview. Keep code small and explainable, and log notable decisions as they are made so `DECISIONS.md` and the AI disclosure stay accurate.
- Commit in small, meaningful steps (history is read by reviewers). Do not commit unless asked.
- Do not open PRs or issues against the challenge repo.

## Spec Kit

Initialized in this directory (`.specify/`, `.claude/skills/speckit-*`). Flow: `/speckit-constitution` → `/speckit-specify` → `/speckit-clarify` (optional) → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` (optional) → `/speckit-implement`. The constitution should encode the conventions above. Specs live under `specs/`.

## graphify

This project has a graphify knowledge graph at .graphify/.

Rules:
- For codebase or architecture questions, when `.graphify/graph.json` exists, first run `graphify query "<question>"` (or `graphify path "<A>" "<B>"` / `graphify explain "<concept>"`); these return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output
- If .graphify/wiki/index.md exists, navigate it instead of reading raw files
- If .graphify/graph.json is missing but graphify-out/graph.json exists, run `graphify migrate-state --dry-run` first; if tracked legacy artifacts are reported, ask before using the recommended `git mv -f graphify-out .graphify` and commit message
- If .graphify/needs_update exists or .graphify/branch.json has stale=true, warn before relying on semantic results and run /graphify . --update when appropriate
- Before proposing or committing .graphify artifacts, run `graphify portable-check .graphify`; commit-safe graph artifacts must use repo-relative paths, and never commit .graphify/branch.json, .graphify/worktree.json, .graphify/needs_update, or .graphify/cache/. If a repo already tracks any of them, first add them to .gitignore, then propose `git rm --cached .graphify/branch.json .graphify/worktree.json .graphify/needs_update` and `git rm -r --cached .graphify/cache`; never mutate git state without asking
- Before deep graph traversal, prefer `graphify summary --graph .graphify/graph.json` for compact first-hop orientation
- For review impact on changed files, use `graphify review-delta --graph .graphify/graph.json` instead of generic traversal
- Read `.graphify/GRAPH_REPORT.md` only for broad architecture review or when `query` / `path` / `explain` do not surface enough context
- After modifying code files in this session, run `npx graphify hook-rebuild` to keep the graph current
