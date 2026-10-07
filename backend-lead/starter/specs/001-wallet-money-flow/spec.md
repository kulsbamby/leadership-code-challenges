# Feature Specification: Wallet Money Flow (Deposit, Wager, Withdrawal)

**Feature Branch**: `001-wallet-money-flow` (no git branch created; spec directory only)

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Backend Lead take-home Part A: implement deposit -> wager -> withdrawal flow with idempotent PSP callbacks, append-only ledger, funding-transaction state machine, and a turnover lock on withdrawals. Source: ../../../readme.md"

## Clarifications

### Session 2026-10-07

- Q: When a `failed` callback arrives with an amount that differs from the deposit amount, should the system still mark the deposit `Failed`? → A: Yes. Mark `Failed` and ignore the amount (no money moves on failure).
- Q: If a client retries `POST /withdrawals` after a timeout, should the system protect against debiting twice? → A: Yes, via an idempotency key, applied to all client-facing writes (`POST /deposits`, `POST /wallets/:walletId/wagers`, `POST /withdrawals`).
- Q: What is the maximum number of decimal places an `amount` may have before a 400? → A: 18, matching the `DECIMAL(36,18)` column.
- Q: Should deposits and withdrawals be blocked for a suspended or closed member? → A: No. Out of scope; every existing member can transact. Documented as a gap in `DECISIONS.md`.
- Q: Should a rejected amount-mismatch callback keep one record per delivery or one per deposit? → A: One record per distinct `(pspRef, received amount)`, with a repeat counter.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deposit credited exactly once (Priority: P1)

A member starts a deposit, the payment provider (PSP) later notifies the platform that payment completed, and the member's wallet is credited once. The PSP is hostile infrastructure: it may repeat the notification, send two copies at the same instant, send it hours late, send an unknown reference, or send a different amount.

**Why this priority**: Crediting money twice (or not at all) is an incident. Everything else depends on a trustworthy balance.

**Independent Test**: Create a member, create a deposit, deliver the completed callback once, then again sequentially, then many times concurrently on a second deposit. The balance equals the deposit amount once, and the ledger has exactly one credit per deposit.

**Acceptance Scenarios**:

1. **Given** a member with a zero balance, **When** they create a deposit of 100.50, **Then** a `Pending` funding transaction with a `pspRef` is returned (201) and the balance is still 0.
2. **Given** a `Pending` deposit of 100.50, **When** a `completed` callback with amount 100.50 arrives, **Then** the deposit becomes `Completed`, the balance is 100.50, and one ledger entry records the credit.
3. **Given** a `Completed` deposit, **When** the same `completed` callback is delivered again, **Then** the response is a success no-op and the balance and ledger are unchanged.
4. **Given** a `Pending` deposit, **When** N identical `completed` callbacks arrive concurrently, **Then** the balance is credited exactly once and every request gets a non-error response.
5. **Given** a `Pending` deposit, **When** a `failed` callback arrives, **Then** the deposit becomes `Failed` and the balance is unchanged.
6. **Given** a `Completed` deposit, **When** a `failed` callback arrives (or a `Failed` deposit receives `completed`), **Then** the request is rejected as an invalid transition (409) and nothing changes.
7. **Given** a `Pending` deposit of 100.50, **When** a `completed` callback arrives with a different amount, **Then** it is rejected (422), no credit is made, the deposit stays `Pending`, and the mismatch is recorded for review.
8. **Given** no deposit with that reference, **When** a callback arrives, **Then** the response is 404 and nothing is written.

---

### User Story 2 - Wagers debit the wallet safely (Priority: P1)

A member places a wager; the wallet is debited and turnover accrues. Concurrent wagers can never overdraw the wallet.

**Why this priority**: Same money-correctness class as deposits; also feeds the turnover lock.

**Independent Test**: Fund a wallet with 10, fire several concurrent wagers of 10; exactly one succeeds, the rest are rejected for insufficient balance, and the balance is 0, never negative.

**Acceptance Scenarios**:

1. **Given** a balance of 100, **When** a wager of 10.00 is placed, **Then** the balance is 90 and a ledger debit exists.
2. **Given** a balance of 5, **When** a wager of 10 is placed, **Then** it is rejected (422) and nothing changes.
3. **Given** a balance of 10, **When** two wagers of 10 are placed concurrently, **Then** exactly one succeeds and the balance is 0.
4. **Given** an unknown wallet, **When** a wager is placed, **Then** the response is 404.

---

### User Story 3 - Withdrawal blocked until turnover is met (Priority: P1)

Each completed deposit adds a required turnover of `amount x turnoverMultiplier`; each wager adds accrued turnover equal to its amount. A member can withdraw only when accrued turnover is at least the total required turnover. A valid withdrawal debits the wallet immediately and creates a `Pending` funding transaction.

**Why this priority**: It is an anti-abuse control and the one piece of real business logic in the flow.

**Independent Test**: Deposit 100 with multiplier 1, try to withdraw (blocked, 422 showing 100 outstanding), wager 100, withdraw again (accepted).

**Acceptance Scenarios**:

1. **Given** a completed deposit of 100 (multiplier 1) and no wagers, **When** the member withdraws 50, **Then** 422 with outstanding turnover 100.
2. **Given** accrued turnover of 60 of 100 required, **When** the member withdraws, **Then** 422 with outstanding turnover 40.
3. **Given** accrued turnover of at least the required amount and sufficient balance, **When** the member withdraws 50, **Then** the balance drops by 50 immediately, a ledger debit exists, and a `Pending` withdrawal funding transaction is returned.
4. **Given** multiplier 0, **When** the deposit completes, **Then** it adds no required turnover.
5. **Given** the turnover lock is satisfied but the balance is lower than the amount, **When** the member withdraws, **Then** it is rejected (422) for insufficient balance, with no state change.
6. **Given** two concurrent withdrawals that together exceed the balance, **Then** at most the affordable ones succeed and the balance never goes negative.

---

### User Story 4 - Auditable ledger (Priority: P2)

Every balance change writes an append-only ledger entry so the wallet balance can always be reconstructed from the ledger.

**Why this priority**: Underpins audit and reconciliation; verified as an invariant across the other stories.

**Independent Test**: After any mix of deposits, wagers, and withdrawals, summing signed ledger entries for a wallet equals its balance.

**Acceptance Scenarios**:

1. **Given** any sequence of operations, **When** ledger entries are summed per wallet, **Then** the sum equals the wallet balance.
2. **Given** an existing ledger entry, **When** any operation runs, **Then** that entry is never modified or deleted.

### Edge Cases

- Callback with a non-positive or malformed amount, or an unsupported status value (400 validation error).
- Deposit/wager/withdrawal with zero, negative, non-numeric, or more-than-18-decimal-place amounts (400).
- Unknown member on deposit or withdrawal (404).
- Late callback (hours later) on a `Completed` deposit: success no-op.
- Callback amount equal numerically but formatted differently ("100.5" vs "100.50"): treated as equal.
- Failed deposits contribute no required turnover; only `Completed` deposits count.
- A withdrawal funding transaction never triggers a PSP credit path (no callback applies to it in this scope).
- Client retry of a write with the same `Idempotency-Key`: original response returned, no second debit or record. Same key with a different payload: 422.
- Process crash mid-operation: no partial state (balance and ledger change together or not at all).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST create a `Pending` deposit (`POST /deposits`) for a member with a positive decimal-string `amount` and integer `turnoverMultiplier >= 0` (default 1), returning 201 with the transaction id and a generated opaque `pspRef`, and MUST NOT move money.
- **FR-002**: System MUST handle `POST /psp/callbacks` with `pspRef`, `status` (`completed` or `failed`), and `amount`.
- **FR-003**: A `completed` callback MUST credit the wallet exactly once regardless of repeats, concurrency, or lateness.
- **FR-004**: A repeated callback with the same status as the deposit's current terminal state MUST return success without changing state.
- **FR-005**: A callback requesting a transition that is not allowed (anything out of `Completed` or `Failed`) MUST be rejected with 409 and change nothing.
- **FR-006**: A `completed` callback whose amount differs from the deposit amount MUST be rejected (422), MUST NOT credit, MUST leave the deposit `Pending`, and the mismatch MUST be recorded. The record MUST persist even though the request is rejected, and MUST be unique per `(pspRef, received amount)`: a repeat delivery of the same mismatch increments a counter instead of adding a row, including under concurrent delivery.
- **FR-006a**: A `failed` callback MUST transition a `Pending` deposit to `Failed` regardless of the callback amount; the amount is ignored because no money moves.
- **FR-007**: A callback with an unknown `pspRef` MUST return 404 and write nothing.
- **FR-008**: Funding transactions MUST follow the explicit state machine `Pending -> Completed | Failed`, enforced in one place.
- **FR-009**: Every balance change MUST write an append-only ledger entry in the same atomic unit as the balance change; entries MUST NOT be updated or deleted.
- **FR-010**: Wallet balance MUST equal the signed sum of its ledger entries at all times.
- **FR-011**: System MUST record wagers (`POST /wallets/:walletId/wagers`): reject when balance is insufficient (422), otherwise debit and accrue turnover equal to the amount.
- **FR-012**: Concurrent wagers and withdrawals MUST NOT overdraw a wallet; the balance MUST NOT go negative.
- **FR-013**: System MUST process withdrawals (`POST /withdrawals`): allow only if accrued turnover >= total required turnover (lifetime totals; withdrawals do not consume turnover); otherwise return 422 with the outstanding turnover amount.
- **FR-014**: A valid withdrawal MUST debit the wallet immediately and create a `Pending` withdrawal funding transaction; approval is out of scope.
- **FR-015**: Required turnover MUST be derived only from `Completed` deposits as `amount x turnoverMultiplier`.
- **FR-016**: All money values MUST be decimal strings at the API boundary and be computed without floating-point arithmetic.
- **FR-017**: Invalid input MUST return 400 with a validation error body. An `amount` is invalid unless it is a positive decimal string with at most 18 decimal places (the `DECIMAL(36,18)` column precision); more than 18 decimal places is rejected, never rounded.
- **FR-018**: `POST /deposits`, `POST /wallets/:walletId/wagers`, and `POST /withdrawals` MUST accept an optional `Idempotency-Key` header. A repeat of the same key (per endpoint and caller scope) with the same payload MUST return the original response without creating another transaction, ledger entry, or debit, including when the repeats arrive concurrently. The same key with a different payload MUST be rejected (422) and change nothing. Uniqueness MUST be enforced by the database. Requests without the header behave as before.

### Key Entities

- **Member / Wallet** (existing): a member has one wallet holding a balance.
- **Funding Transaction**: a deposit or withdrawal with type, amount, status (`Pending`, `Completed`, `Failed`), PSP reference (deposits), turnover multiplier (deposits), and timestamps.
- **Ledger Entry**: immutable record of one balance change (wallet, signed amount, kind, related transaction or wager, resulting balance, timestamp).
- **Wager**: a recorded bet of an amount against a wallet; accrues turnover.
- **Turnover position**: derived from completed deposits (required) and wagers (accrued) per member.
- **Callback mismatch record**: evidence of a rejected amount-mismatch callback for review; one per distinct `(pspRef, received amount)` with a repeat counter and first/last seen timestamps.
- **Idempotency record**: the key, endpoint, request fingerprint, and stored response of a client write, unique per key and scope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Under 50 concurrent identical completed callbacks, the member is credited exactly once in 100% of repeated test runs.
- **SC-002**: Under concurrent wagers totalling more than the balance, the balance is never negative and the number of accepted wagers equals the number the balance can afford, in 100% of runs.
- **SC-003**: After any test sequence, the ledger sum equals the wallet balance for every wallet (zero discrepancy).
- **SC-004**: A withdrawal is rejected while outstanding turnover is above zero and accepted once it reaches zero, with the outstanding amount reported exactly, to the full 18 decimal places of precision.
- **SC-005**: Every one of the four mandated risk tests (sequential duplicate, concurrent duplicate, concurrent overdraw, turnover lock) exists and passes.
- **SC-006**: Under concurrent withdrawals sharing one `Idempotency-Key`, the wallet is debited exactly once in 100% of repeated test runs.

## Assumptions

- Auth, deployment, UI, and withdrawal approval are out of scope.
- Member account status (suspended, closed, KYC) is out of scope: every existing member can transact. This is a known gap to record in `DECISIONS.md` as a next step.
- Members and wallets already exist via the starter `POST /members`; one wallet per member.
- Single currency; no FX.
- `pspRef` is generated by this service and echoed by the mock PSP; callback signature verification is out of scope for Part A (covered conceptually in Part B).
- Amount comparison is numeric, not textual.
- A failed or rejected operation leaves no ledger entry.
- Turnover uses lifetime totals per the brief; the "withdraw, then keep the satisfied lock" loophole is accepted and documented in `DECISIONS.md`.
- Withdrawal funding transactions stay `Pending`; no rejection/refund path is built.
- Decisions confirmed by the owner on 2026-10-07: amount mismatch rejects with no credit; unknown `pspRef` returns 404; turnover compares lifetime totals.
