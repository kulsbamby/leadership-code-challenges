# Feature Specification: PSP Integration Design Note (Part B)

**Feature Branch**: `002-psp-integration-design` (no git branch created; spec directory only)

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Now make the spec for part B" (source: `../../readme.md`, Part B: "Design note: the 50th PSP")

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A junior engineer integrates a new PSP in one day (Priority: P1)

The platform integrates dozens of payment service providers (PSPs), and the list keeps growing. Each PSP has its own callback format, signature or verification scheme, status vocabulary, and quirks (amounts in minor units, aggressive retries, "success" arriving before "pending"). The design note must show a structure in which a junior engineer can add the next PSP in about a day, without touching the money-handling core and without being able to break it.

**Why this priority**: This is the question the brief asks (Part B) and the single reason the note exists. If a reader cannot see how a new PSP becomes a small, bounded task, the note has failed.

**Independent Test**: Hand the note to an engineer who has not seen the codebase and ask them to list, from the note alone, every file or config entry they would create or change to add a new PSP, and what they would not touch. Their list is short, specific, and excludes the money-handling core.

**Acceptance Scenarios**:

1. **Given** the note, **When** a reader looks for the integration steps for a new PSP, **Then** they find a short ordered checklist that fits a one-day task.
2. **Given** a PSP with a unique signature scheme, status vocabulary, and minor-unit amounts, **When** the reader follows the note, **Then** every one of those differences has an identified place to be handled that is outside the money-handling core.
3. **Given** the note, **When** a reader asks "what can a junior get wrong that causes money loss?", **Then** the note shows why the answer is "nothing in the integration code", because the core already guarantees correct crediting.

---

### User Story 2 - Reviewers can judge the design quickly (Priority: P1)

The people evaluating the submission read the note as one of the weighted deliverables. They need to find the four required topics (abstraction, where verification and normalization live, how configuration drives integrations, how an integration is tested without the real provider) and a sketch, within the stated length.

**Why this priority**: The note is evaluated on the design (per the brief) and reviewers stop reading at the length limit; a note that is complete but over length, or short but missing a required topic, loses credit.

**Independent Test**: Give the note to a reviewer with the brief's four required topics as a checklist. They can tick all four within a few minutes, and the note is no longer than about one page plus a sketch.

**Acceptance Scenarios**:

1. **Given** the note, **When** a reviewer scans its headings, **Then** each of the four required topics has its own clearly labeled section.
2. **Given** the note, **When** a reviewer checks its length, **Then** the prose is at most about one page and is accompanied by a sketch (diagram or interface/pseudo-code).
3. **Given** the note, **When** a reviewer reads the abstraction, **Then** it is concrete enough (named responsibilities, inputs and outputs) to be judged, not just "use an adapter pattern".

---

### User Story 3 - Integrations can be tested without the provider (Priority: P2)

A PSP's sandbox cannot be called reliably from automated builds. The note must give a testing approach so that every integration, including the 50th, is verified automatically, repeatably, and without calling the provider.

**Why this priority**: Without a credible testing story, "a junior can do it safely in a day" is only an assertion. It is P2 because the abstraction (US1) must exist first for the tests to attach to.

**Independent Test**: A reader can state, from the note, how a new integration is proven correct on a machine with no network access to the provider, and which checks every integration must pass.

**Acceptance Scenarios**:

1. **Given** the note, **When** a reader looks for how a verification (signature) failure is tested, **Then** it names a way to produce valid and invalid provider requests without the provider.
2. **Given** the note, **When** a reader looks for how duplicate, concurrent, and wrong-amount deliveries are tested for a new PSP, **Then** it explains how the existing money-safety tests are reused rather than rewritten per PSP.
3. **Given** a new integration, **When** it is added, **Then** the note makes clear which shared checks it must automatically inherit.

---

### User Story 4 - The note is consistent with the built system (Priority: P2)

The note describes how the platform *would* be structured, but Part A already implements the core it builds on (a normalized callback handled idempotently with a state machine and an append-only ledger). The note must not contradict that implementation, and must say clearly what exists today versus what is proposed.

**Why this priority**: Reviewers read Part A and Part B together; contradictions undermine the credibility of both.

**Independent Test**: A reader compares the note's description of the core with the Part A implementation and finds no conflict, and can tell which parts are existing and which are proposed.

**Acceptance Scenarios**:

1. **Given** the note and the Part A code, **When** a reader compares the callback shape, **Then** the normalized callback fields in the note match what the core accepts today.
2. **Given** the note, **When** a reader looks for scope boundaries, **Then** it states what is deliberately not designed (for example outbound calls to PSPs) and why.

### Edge Cases

- A PSP signs the raw request bytes, so re-encoding the body before verifying would break verification: the note must say where raw input is preserved.
- A PSP sends statuses the platform has no equivalent for, or sends "success" before "pending": the note must say what happens to an event that should not change state.
- A PSP reports amounts in minor units or with a different number of decimals: the note must say where conversion happens and that it never uses floating-point money.
- A PSP retries aggressively or delivers the same event minutes or hours late: the note must say why this needs no per-PSP code.
- A configuration entry is missing a secret or names an unknown integration: the note must say what happens at startup (not silently at the first live callback).
- A new PSP needs behavior the abstraction cannot express: the note must say how the abstraction grows without becoming a per-PSP special case.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The note MUST be delivered as `DESIGN-PSP.md` at the root of `backend-lead/starter/`.
- **FR-002**: The note MUST answer the brief's question: how to structure the codebase so that integrating a new PSP is a one-day task safely done by a junior engineer.
- **FR-003**: The note MUST define the interface or abstraction for a PSP integration, naming its responsibilities, its inputs, and its outputs.
- **FR-004**: The note MUST state where verification of a callback's authenticity lives and where normalization of the provider's format, statuses, and amount units lives, and MUST explain why each placement keeps provider differences out of the money-handling core.
- **FR-005**: The note MUST explain how configuration drives which PSPs exist and how each behaves, including how secrets are supplied and what happens when configuration is invalid or incomplete.
- **FR-006**: The note MUST explain how an integration is tested against a provider that cannot be reliably called from automated builds, covering at least: authenticity checks (valid and invalid), format and amount normalization, and duplicate, concurrent, and wrong-amount deliveries.
- **FR-007**: The note MUST include a sketch (a diagram, or interface and pseudo-code) of the structure.
- **FR-008**: The note MUST include a short ordered checklist of the steps to add a new PSP.
- **FR-009**: The note MUST address the PSP quirks named in the brief: differing callback formats, differing verification schemes, differing status vocabularies, amounts in minor units, aggressive retries, and "success" before "pending".
- **FR-010**: The note MUST keep to about one page of prose plus a sketch, so a reviewer can read it within the stated limit.
- **FR-011**: The note MUST be consistent with the Part A implementation: the normalized callback it describes MUST match what the money-handling core accepts, and it MUST distinguish what exists today from what is proposed.
- **FR-012**: The note MUST state what it deliberately does not cover and why.
- **FR-013**: The note MUST NOT require changes to the money-handling core to add a PSP; any proposed change to that core MUST be called out as out of the per-PSP path.
- **FR-014**: Money amounts in any interface or example in the note MUST be shown as decimal strings, never floating-point numbers, in line with the platform's money rules.

### Key Entities

- **PSP integration**: the provider-specific piece for one PSP: how its requests are authenticated and how its format becomes the platform's shared callback shape.
- **Normalized callback**: the provider-independent description of a payment event (our reference, a platform status, an amount as a decimal string) that the money-handling core accepts.
- **PSP configuration**: the per-PSP settings (credentials, status mapping, amount units, allowed sources) that select and tune an integration without code changes.
- **Test fixture**: a recorded or constructed provider request (valid or invalid) used to verify an integration with no live provider.
- **Money-handling core**: the existing, provider-independent part of the platform that decides, locks, and records money movement; shown for context, not redesigned here.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A reader who has not seen the codebase can list, from the note alone, the complete set of changes needed to add a new PSP, and that list fits within one working day of effort for a junior engineer.
- **SC-002**: 100% of the four required topics (abstraction, verification and normalization placement, configuration, testing without the provider) are each findable under their own heading in under one minute.
- **SC-003**: The prose is at most about one page and includes at least one sketch.
- **SC-004**: Every PSP quirk named in the brief (six items) maps to a stated handling location in the note.
- **SC-005**: A comparison of the note's described callback shape with the Part A implementation finds zero contradictions.
- **SC-006**: The note names, for the testing approach, at least one check that every new integration inherits automatically without being rewritten.

## Assumptions

- The audience is the take-home reviewers and, in the interview, the author defending the design; the note is also written as if it will guide a real junior engineer.
- Part A is the baseline: the money-handling core (idempotent callback handling, state machine, append-only ledger, row locking) already exists and is correct, so per-PSP work never needs to touch it.
- Outbound PSP calls (creating payments, payouts, status polling) are out of scope for this note and are mentioned only as a boundary.
- Authentication, deployment, and operations (secret stores, rollout) are out of scope beyond stating how configuration supplies secrets.
- A full implementation of the design is not expected (per the brief); interfaces and pseudo-code are enough.
- A first draft of `DESIGN-PSP.md` already exists from the Part A work; it will be reviewed against this spec and revised where it falls short (this spec does not assume the draft is correct).
- "About one page" is read as roughly 500 to 600 words of prose, excluding code or diagram blocks.
