# Research: PSP Integration Design Note (Part B)

No `NEEDS CLARIFICATION` remained after `/speckit-specify`. This file records the decisions about *how the note is produced and checked*, plus the gap analysis of the existing draft. (The design choices themselves live in `DESIGN-PSP.md`.) Format: Decision / Rationale / Alternatives.

## R1. One document, ASCII sketch plus interface code

- **Decision**: Deliver a single `DESIGN-PSP.md`. The sketch is one ASCII flow diagram plus a short TypeScript interface block (FR-007). Headings map 1:1 to the four required topics.
- **Rationale**: Renders in any viewer a reviewer uses (terminal, GitHub, editor), costs no tooling, and diffs cleanly. Headings that mirror the brief make SC-002 (find each topic in under a minute) trivially true.
- **Alternatives**: Mermaid or an image (not guaranteed to render everywhere, harder to review in a diff); UML (heavier than a one-page note warrants); a runnable prototype (the brief says a full implementation is not expected).

## R2. Existing versus proposed is marked inline

- **Decision**: Anything already built in Part A is tagged **(exists)** and anything the note proposes is tagged **(proposed)**, both in the diagram and in the interface block (FR-011, US4).
- **Rationale**: The callback endpoint today is `POST /psp/callbacks` taking `{ pspRef, status: completed|failed, amount }`, handled by `pspCallbackService.handleCallback`. The note proposes `POST /psp/:provider/callbacks` plus adapters in front of it. Without tags a reader would take the proposal for current behavior.
- **Alternatives**: a separate "current state" section (spends words the page limit cannot spare).

## R3. How "about one page" is measured

- **Decision**: Count words **outside fenced code blocks** and target **500 to 600** (spec assumption). Command: `awk '/^```/{f=!f; next} !f' DESIGN-PSP.md | wc -w`. Today: 353 prose words (528 total).
- **Rationale**: The brief's limit is "~1 page + a sketch"; code and diagram are the sketch, so they are excluded. A command makes SC-003 checkable instead of a judgement.
- **Alternatives**: counting lines (varies with wrapping); counting everything (penalises the sketch the brief asks for).

## R4. How the note is validated (it is a document, so the checks are review checks)

- **Decision**: Three checks, all in `quickstart.md`: (1) a requirement-by-requirement checklist against FR-001 to FR-014; (2) the word-count command; (3) a consistency check that the note's `NormalizedCallback` fields equal the core's `CallbackInput` (`pspRef`, `status`, `amount`) in `src/services/pspCallbackService.ts`.
- **Rationale**: Each success criterion (SC-001 to SC-006) maps to one of these, and check 3 is the only one that touches code, so it stays cheap.
- **Alternatives**: automated doc linting (disproportionate for one file); no validation (the spec would be unfalsifiable).

## R5. Gap analysis of the existing draft (528 words) against the spec

| Requirement | Status in draft | Fix needed |
|---|---|---|
| FR-001 file location | OK | none |
| FR-002 answers the question | OK | none |
| FR-003 interface with responsibilities, inputs, outputs | OK | none |
| FR-004 verification and normalization placement, with why | Placement OK; the *why* is implicit | add one sentence tying each placement to keeping provider differences out of the core |
| FR-005 config, secrets, invalid config | OK | none |
| FR-006 testing (auth valid/invalid, normalization, duplicate/concurrent/wrong-amount) | OK | none |
| FR-007 sketch | OK | add (exists)/(proposed) tags (R2) |
| FR-008 ordered step checklist | **Missing**: only a one-line summary at the end | add a short numbered checklist |
| FR-009 every brief quirk has a handling location | Partly: "success before pending" is **described wrongly** (draft says `ignore` covers "success arriving before pending") | add a quirk-to-location table; correct the wording: a `success` that arrives while we are `Pending` is applied by the core, and a `pending` that arrives after it is the event mapped to `ignore` |
| FR-010 length | OK (353 prose words) | stay at or under 600 after additions |
| FR-011 consistent with Part A, existing vs proposed | **Gap**: the route differs from the built one and is not labelled | R2 tags |
| FR-012 out of scope stated | OK (outbound calls) | keep |
| FR-013 no core change per PSP | OK | keep, make explicit in the checklist |
| FR-014 decimal-string amounts | OK | none |
| Edge: unknown provider status | **Gap**: not stated | say an unmapped status is rejected at startup config validation or at parse time, and can never become `completed` |
| Edge: abstraction cannot express a quirk | **Gap**: not stated | one sentence: extend `NormalizedCallback` or the config schema once, for all PSPs; never add a per-PSP branch in the core |

## R6. Why "success before pending" maps the way it does

- **Decision**: Describe it as two cases. (a) A `success` for a deposit we hold as `Pending` is a normal `completed`: the core applies it. (b) A later `pending` for a deposit already `Completed` is mapped to `ignore` by the adapter (and would be a 409 if it were ever sent through as a state change). The adapter never forwards a non-terminal status to the core.
- **Rationale**: The core's state machine (Part A, `fundingStateMachine.decide`) only knows terminal callbacks, so non-terminal provider events must be dropped at the edge, and the core's rejection of invalid transitions stays the safety net.
