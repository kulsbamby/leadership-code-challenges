---

description: "Task list for the PSP Integration Design Note (Part B)"
---

# Tasks: PSP Integration Design Note (Part B)

**Input**: Design documents from `specs/002-psp-integration-design/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md) (R5 is the gap analysis these tasks close), [data-model.md](data-model.md), [contracts/adapter-contract.md](contracts/adapter-contract.md), [contracts/config-contract.md](contracts/config-contract.md), [quickstart.md](quickstart.md)

**Tests**: This feature is a document, so there are no automated tests. "Test" tasks are the review checks from `quickstart.md`, run before and after the edits. No source, schema, or dependency change is allowed (FR-013).

**Organization**: grouped by user story. All paths are relative to `backend-lead/starter/`. Every edit task changes the same file, `DESIGN-PSP.md`, so **none of them are marked [P]**; each story edits different sections, and they are ordered top to bottom to avoid conflicts.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 junior integrates a PSP in a day, US2 reviewers judge quickly, US3 testing without the provider, US4 consistency with Part A

## Rules for every edit

- Keep the whole note to about one page: **500 to 600 words of prose outside fenced code blocks** (currently 353).
- Money in any example is a decimal **string** (for instance `"10.50"`), never a number (FR-014).
- Do not edit anything under `src/`. The core's input is `CallbackInput` in `src/services/pspCallbackService.ts`: `pspRef`, `status` (`completed | failed`), `amount`.
- Mark every element as **(exists)** (built in Part A) or **(proposed)** (introduced by the note).

---

## Phase 1: Setup (baseline)

- [X] T001 Record the baseline: run the three checks from `specs/002-psp-integration-design/quickstart.md` against the current `DESIGN-PSP.md` (prose word count with `awk '/^```/{f=!f; next} !f' DESIGN-PSP.md | wc -w`, the requirement checklist, the consistency grep against `src/services/pspCallbackService.ts`). Expected today: 353 prose words, and failures on FR-008, FR-009, FR-011 as listed in `research.md` R5.

---

## Phase 2: Foundational (blocks all stories)

**Purpose**: put the note into the planned skeleton so each story edits its own section without reshuffling.

- [X] T002 Restructure `DESIGN-PSP.md` into these headings, in this order, moving the existing text under them without rewriting it yet: `Goal`, `Where the line is`, `Interface`, `PSP quirks and where each is handled`, `Config drives it`, `Testing without the provider`, `Add a PSP, in order`, `Not covered`. The four topics the brief requires must each be a heading or a clearly labelled subsection: abstraction (`Interface`), verification and normalization placement (`Where the line is` and `Interface`), configuration (`Config drives it`), testing without the provider (`Testing without the provider`).

**Checkpoint**: skeleton in place; the file still reads as before.

---

## Phase 3: User Story 1 - A junior engineer integrates a new PSP in one day (Priority: P1) 🎯 MVP

**Goal**: a reader can list, from the note alone, everything needed to add a new PSP, and sees why a junior cannot break money handling.

**Independent Test**: someone who has not seen the code lists the files and config entries they would change to add a PSP; the list is short and contains nothing under `src/services/`.

- [X] T003 [US1] In `DESIGN-PSP.md` under `Goal`, state in at most two lines what "one-day, junior-safe" means: one adapter file (or only a config entry) plus one fixture folder, and no change to the money-handling core (FR-002, FR-013).
- [X] T004 [US1] In `DESIGN-PSP.md` under `PSP quirks and where each is handled`, add a table with exactly these six rows (quirk, handled in), using the wording from `contracts/adapter-contract.md`: different callback formats -> `parse` (and the generic adapter's `fields` config); different verification schemes -> `verify`; different status vocabularies -> config `statusMap`, applied in `parse`; amounts in minor units -> config `amountExponent` plus one shared conversion helper; aggressive retries -> the core (already idempotent), no integration code; `success` before `pending` -> the `success` is applied by the core and the later `pending` maps to `ignore` (FR-009, SC-004).
- [X] T005 [US1] In `DESIGN-PSP.md`, correct the wrong wording about "success before pending": remove the claim that `ignore` covers "success arriving before pending" (in the `NormalizedCallback` code comment and anywhere in the prose). The status comment must say `ignore` = a non-terminal provider event such as `pending`, which the adapter drops and never forwards to the core (`research.md` R6).
- [X] T006 [US1] In `DESIGN-PSP.md` under `Add a PSP, in order`, write a numbered checklist of 4 to 5 steps: (1) copy `adapters/_template.ts` or add a config entry for the generic adapter; (2) add fixtures under `fixtures/<psp>/`; (3) run the test suite (the shared contract suite runs against the new adapter automatically); (4) add the config entry and secret; (5) state explicitly: no change to routes, services, or schema (FR-008, FR-013).
- [X] T007 [US1] In `DESIGN-PSP.md` under `Where the line is`, add one sentence answering "what can a junior get wrong that loses money?": nothing in the integration code, because idempotency, locking, the state machine, and the ledger are in the core and are not per-PSP (US1 scenario 3).

**Checkpoint**: US1 is reviewable on its own: goal, quirk table, corrected wording, ordered checklist.

---

## Phase 4: User Story 2 - Reviewers can judge the design quickly (Priority: P1)

**Goal**: the four required topics are easy to find and the note stays within the length limit, with a concrete abstraction.

**Independent Test**: a reviewer ticks the brief's four topics from the headings in a few minutes, and the prose is at most about one page plus a sketch.

- [X] T008 [US2] In `DESIGN-PSP.md` under `Interface`, make the abstraction concrete: the code block defines `NormalizedCallback` and `PspAdapter` (`id`, `verify(req, cfg)`, `parse(req, cfg)`) and the prose names each responsibility, input, and output. Include the rule that verification runs first on the **raw bytes** and that both operations are pure (no database, no network) (FR-003, FR-004, `contracts/adapter-contract.md` rules 1 and 2).
- [X] T009 [US2] In `DESIGN-PSP.md` under `Where the line is`, add one sentence of *why* for the placement: verification and normalization sit at the edge so provider differences never reach the core, and a new PSP can only influence the core through the three-field normalized callback (FR-004, `research.md` R5).
- [X] T010 [US2] In `DESIGN-PSP.md` under `Config drives it`, state quoted constraints from `data-model.md`: `adapter` "must name a registered adapter, else fail at startup"; `secret` "supplied from the environment, never committed; missing means fail at startup"; `amountExponent` "non-negative integer"; `statusMap` "every provider status must be mapped; an unmapped status can never become `completed`"; and add the runtime rule from `contracts/config-contract.md`: an unmapped provider status at runtime is rejected (400) and logged (FR-005).
- [X] T011 [US2] Trim the note to the length budget: run the prose word count and cut repetition until it is between 500 and 600 words outside code blocks (cut from `Testing without the provider` and `Config drives it` first, never from the quirk table or the checklist). Re-run the count and record it in `quickstart.md`'s validation notes if you keep one (FR-010, SC-003).

**Checkpoint**: US2 reviewable: headings map to the four topics; length within budget.

---

## Phase 5: User Story 3 - Integrations can be tested without the provider (Priority: P2)

**Goal**: a credible, provider-free testing approach, with checks every new integration inherits.

**Independent Test**: a reader can state how a new integration is proven on a machine with no access to the provider, and which checks it inherits.

- [X] T012 [US3] In `DESIGN-PSP.md` under `Testing without the provider`, make sure the section covers, in this order, with one line each: recorded fixtures under `fixtures/<psp>/` (`completed`, `failed`, `pending`, `bad-signature`, `minor-units`, signed with a test secret, never fetched live); one **contract suite parameterized over every registered adapter** (valid signature verifies; tampered body or stale timestamp fails; `parse` returns a valid normalized callback; amount round-trips exactly, for example `"1050"` at exponent 2 becomes `"10.50"`; an unknown or unmapped status never becomes `completed`); and end-to-end runs of the same fixtures through the real core on a real database (delivered twice, delivered concurrently, delivered with a wrong amount), reusing the existing Part A money tests rather than rewriting them (FR-006, SC-006).
- [X] T013 [US3] In `DESIGN-PSP.md` under `Testing without the provider`, add the guardrail line: a lint rule forbids `parseFloat`, `Number(`, and imports from `services/` or `db/` inside `adapters/`, so an adapter cannot reach the money path (FR-013, FR-014).

**Checkpoint**: US3 reviewable: the testing section covers authenticity, normalization, and duplicate/concurrent/wrong-amount, with an inherited suite.

---

## Phase 6: User Story 4 - The note is consistent with the built system (Priority: P2)

**Goal**: no contradiction with Part A, and a clear line between what exists and what is proposed.

**Independent Test**: comparing the note with `src/services/pspCallbackService.ts` finds no conflict, and a reader can tell existing from proposed.

- [X] T014 [US4] In `DESIGN-PSP.md`, tag the flow diagram and the interface block: the core call `handleCallback(normalized)` and the built route `POST /psp/callbacks` are **(exists)**; the registry, `POST /psp/:provider/callbacks`, `verify`/`parse`, and the config are **(proposed)**. Note that the proposed route sits in front of the existing one (FR-011, `research.md` R2).
- [X] T015 [US4] In `DESIGN-PSP.md`, make the core's input match the built one: after parsing, what reaches `handleCallback` is exactly `{ pspRef, status: 'completed' | 'failed', amount }` with `amount` a decimal string; `ignore` is allowed only in the adapter's output and is dropped at the edge (`data-model.md`, SC-005).
- [X] T016 [US4] In `DESIGN-PSP.md` under `Not covered`, state what is deliberately out of scope and why: outbound calls (create payment, payouts, status polling) need a second interface behind the same registry and are a separate design; auth and deployment are out of scope; and one sentence on how the abstraction grows when a PSP needs something it cannot express: extend `NormalizedCallback` or the config schema once for all PSPs, never add a per-PSP branch in the core (FR-012, spec edge cases).

**Checkpoint**: all four stories are reviewable; the note is complete.

---

## Phase 7: Polish and validation

- [X] T017 Run all three checks from `specs/002-psp-integration-design/quickstart.md` again and confirm: prose words between 500 and 600 (SC-003); every item in the requirement checklist ticked (SC-001, SC-002, SC-004, SC-006); the consistency grep shows the note's normalized callback fields equal `CallbackInput` (`pspRef`, `status`, `amount`) with no contradiction (SC-005). If any fail, fix `DESIGN-PSP.md` and re-run.
- [X] T018 [P] Update `DECISIONS.md` section 9 or the Part B reference so it points to `specs/002-psp-integration-design/` and records that the first draft was revised after a gap analysis against the spec (what changed: checklist, quirk table, exists/proposed tags, corrected "success before pending" wording).
- [X] T019 [P] Tick the items in `specs/002-psp-integration-design/checklists/requirements.md` only if they still hold after the edits (they should; this checklist is about the spec, not the note), and add a one-line note of the final word count.
- [X] T020 Confirm `git status` shows no changes under `src/`, `test/`, or `package.json` (FR-013), and that `npm test` and `npx tsc --noEmit` are still green (nothing should have changed them).

---

## Dependencies & Execution Order

- **Phase 1** (T001), then **Phase 2** (T002, which restructures the file and blocks every edit).
- **Phases 3 to 6** all edit `DESIGN-PSP.md`, so they run **sequentially**. Recommended order is by priority: US1, US2, US3, US4. Within a story, tasks go in the listed order. Stories touch different sections, so they are independent in content, only serialized by the shared file.
- **T011** (trim to length) should run after the content tasks that add words (T003 to T010, T012 to T016) or be repeated after them; the final length check is T017.
- **Phase 7**: T017 depends on everything above; T018 and T019 are [P] (different files) and can run together after T017; T020 last.

### Parallel opportunities

Very little, because the deliverable is one file. The only [P] tasks are T018 and T019 (different files). If two people work on it, split by section ownership and merge by hand: one takes US1 and US4 (top of the note: goal, line, quirks, checklist, tags), the other takes US2/US3 (interface, config, testing).

```bash
# Example: the two independent finishing tasks
Task: "Update DECISIONS.md Part B reference (T018)"
Task: "Tick specs/002-psp-integration-design/checklists/requirements.md (T019)"
```

## Implementation Strategy

### MVP first (User Story 1 only)

Complete T001, T002, then US1 (T003 to T007). That alone gives the note its core promise (a short, ordered "add a PSP" path plus the quirk table) and removes the factual error about "success before pending". Stop and run the checks.

### Incremental delivery

US1, then US2 (concreteness and length), then US3 (testing), then US4 (consistency and scope), then Phase 7. After each story, re-run the word count: the budget is the constraint most likely to be broken.

### Time guard

This should take well under an hour (the draft already exists). `DESIGN-PSP.md` is a required deliverable and the part of the brief most worth getting right; if time is short, finish US1, US2 and the length check first. Do not commit unless asked (project rule); a readable history is a deliverable, so propose a commit message after each story checkpoint.

## Notes

- Every edit task names its section in `DESIGN-PSP.md` and quotes the constraint it implements, so none is left to discretion.
- No code, schema, or dependency changes. `graphify hook-rebuild` is not needed because no code file changes.
- The note's AI-usage disclosure already lives in `DECISIONS.md` section 9; keep the owner placeholder there until you have written it yourself.
