# Implementation Plan: PSP Integration Design Note (Part B)

**Branch**: `002-psp-integration-design` (spec directory only) | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-psp-integration-design/spec.md`

## Summary

Part B is a written deliverable, `DESIGN-PSP.md`, not code. A first draft already exists from the Part A work (528 words, 353 of prose). This plan does not design a new system; it reviews the draft against FR-001 to FR-014, closes the gaps found (see [research.md](research.md) R5), and defines how the result is validated. No source or schema change is planned (FR-013).

The four gaps to close: (1) the ordered "add a PSP" checklist is missing; (2) existing versus proposed is not labelled and the proposed route differs from the built one; (3) the "success before pending" quirk is described wrongly and there is no quirk-to-location table; (4) two edge cases are unstated (unmapped provider status, abstraction that cannot express a quirk), plus one sentence of *why* for the verification/normalization placement.

## Technical Context

**Language/Version**: Markdown (the note); TypeScript snippets as the sketch only, not compiled

**Primary Dependencies**: none (no code, no new packages)

**Storage**: N/A (no schema change; Part A's schema is untouched)

**Testing**: review checks, not automated tests: requirement checklist, a word-count command, and a consistency check against `CallbackInput` in `src/services/pspCallbackService.ts` (see [quickstart.md](quickstart.md))

**Target Platform**: any Markdown viewer (terminal, GitHub, editor)

**Project Type**: documentation deliverable inside the existing web-service repository

**Performance Goals**: N/A

**Constraints**: about one page of prose plus a sketch (target 500 to 600 words outside code blocks); amounts only as decimal strings; no change to the money-handling core

**Scale/Scope**: one file, about 6 short sections, one diagram, one interface block, one quirk table, one numbered checklist

## Constitution Check

*GATE: passed before research; re-checked after design.*

| Principle / rule | Status | How |
|---|---|---|
| I. Money correctness | PASS | FR-014: every amount in the note is a decimal string; conversion goes through the platform's decimal arithmetic; no floating-point money in any example |
| II. Append-only ledger | PASS (n/a) | The note does not touch balances; it states the core owns crediting and the ledger |
| III. Idempotency and concurrency | PASS | The note keeps all idempotency, locking and the state machine in the existing core and adds none per PSP (FR-013) |
| IV. Tests for the risks | PASS | The note's testing section reuses the existing money-risk tests (duplicate, concurrent, wrong-amount) for every PSP rather than rewriting them; no code is added here, so no new tests are required |
| V. Starter conventions | PASS | No code, schema or dependency change; any later implementation would follow routes-parse-with-zod, services-hold-logic, migrations-only |
| Delivery: `DESIGN-PSP.md` required, about 1 page plus sketch, AI use disclosed | PASS | FR-001, FR-010; the AI-usage disclosure for this note is already in `DECISIONS.md` section 9 |
| Scope: out of scope items | PASS | Outbound PSP calls, auth, deployment stated as out of scope (FR-012) |

**Post-design re-check**: still PASS. No complexity needing justification.

## Project Structure

### Documentation (this feature)

```text
specs/002-psp-integration-design/
├── spec.md
├── plan.md                  # this file
├── research.md              # decisions R1-R6 and the gap analysis of the draft
├── data-model.md            # conceptual entities: normalized callback, integration, config, fixture
├── quickstart.md            # how the note is validated (3 checks)
├── contracts/
│   ├── adapter-contract.md  # responsibilities, rules, HTTP mapping, quirk-to-location table
│   └── config-contract.md   # config shape and required behavior
├── checklists/requirements.md
└── tasks.md                 # created by /speckit-tasks
```

### Source Code (backend-lead/starter)

```text
DESIGN-PSP.md                # the only file this feature changes (revise the existing draft)
src/                         # unchanged; read-only reference: src/services/pspCallbackService.ts (CallbackInput)
```

**Structure Decision**: single deliverable file at the starter root, per the brief and FR-001. No new directories, no code.

## Planned structure of the note (target about 600 prose words)

1. **Goal** (2 lines): what "one-day, junior-safe" means.
2. **Where the line is**: core (exists) versus adapter (proposed), with the ASCII flow tagged exists/proposed and one sentence on why this placement keeps provider differences out of the core.
3. **Interface**: `NormalizedCallback` and `PspAdapter` (code block); verification on raw bytes; normalization in `parse`; shared amount helper.
4. **Quirk table**: the six brief quirks, each mapped to its handling location (from [contracts/adapter-contract.md](contracts/adapter-contract.md)), with the corrected "success before pending" wording.
5. **Config drives it**: the YAML sketch, fail-fast on missing secret or unknown adapter, runtime handling of an unmapped status.
6. **Testing without the provider**: fixtures, one contract suite over every adapter, end-to-end through the real core, guardrail lint.
7. **Add a PSP, in order** (numbered, 4 to 5 steps, "no change to the core") and **what is not covered** (outbound calls, how the abstraction grows).

## Complexity Tracking

No constitution violations. Nothing to justify.
