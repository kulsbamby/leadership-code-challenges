# Contract: PSP integration (adapter)

What `DESIGN-PSP.md` must specify for the integration interface (FR-003, FR-004, FR-009). Behavior is what a reviewer can check; the TypeScript in the note is the sketch.

## Responsibilities

| Concern | Owner | Never owned by |
|---|---|---|
| Authenticity (signature, HMAC, IP allow-list, timestamp window) | integration `verify` | the core |
| Provider payload shape, field names | integration `parse` | the core |
| Provider status vocabulary to platform statuses | integration `parse` via config `statusMap` | the core |
| Minor-unit to decimal-string conversion | one shared helper, called from `parse` | each integration's own arithmetic |
| Idempotency, state machine, locking, crediting, ledger | the money-handling core (exists) | any integration |

## Rules

1. `verify` runs first and uses the **raw request bytes** (re-encoding the body can invalidate a signature). A failure stops the request before `parse`.
2. `verify` and `parse` are pure: no database, no network, no clock except an injected one.
3. `parse` returns the normalized callback or `ignore`. `ignore` is dropped at the edge; the core is never called for it.
4. Amounts leave `parse` as decimal strings built with the platform's decimal arithmetic. A JavaScript `number` never carries money.
5. A provider status the config does not map is rejected (400) and logged, never silently treated as `completed`.
6. Retries, duplicates and out-of-order delivery need no integration code: the core is already idempotent and rejects invalid transitions.

## HTTP mapping at the edge

| Outcome | Status |
|---|---|
| unknown provider id | 404 |
| `verify` failed | 401 |
| `parse` failed (malformed) | 400 |
| `ignore` | 200, nothing applied |
| passed to the core | the core's existing responses (200 / 404 / 409 / 422) |

## PSP quirk to handling location (SC-004 table the note must include)

| Quirk named in the brief | Handled in |
|---|---|
| different callback formats | `parse` (and the generic adapter's `fields` config) |
| different verification schemes | `verify` |
| different status vocabularies | config `statusMap`, applied in `parse` |
| amounts in minor units | config `amountExponent` plus the shared conversion helper |
| aggressive retries | the core (already idempotent), no integration code |
| `success` before `pending` | `success` is applied by the core; the later `pending` maps to `ignore` |
