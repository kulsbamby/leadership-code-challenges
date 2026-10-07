# API Contract: Wallet Money Flow

JSON over HTTP. Money is always a decimal **string** (positive, at most 18 decimal places). Validation errors
return `400 { "error": "validation_error", "details": [...] }`. All other errors return
`{ "error": "<code>", ... }`. Amounts in responses come back as stored (`"100.500000000000000000"`).

Writes that accept `Idempotency-Key` (optional header, 1-255 chars): a repeat with the same key and payload
returns the original `201` body; same key with a different payload returns
`422 { "error": "idempotency_key_reuse" }`.

## POST /deposits  (idempotency key supported)

Request: `{ "memberId": "<uuid>", "amount": "100.50", "turnoverMultiplier": 1 }`  (`turnoverMultiplier`
integer >= 0, default 1)

| Status | Body |
|---|---|
| 201 | `{ "id", "pspRef", "status": "Pending", "amount", "turnoverMultiplier" }` |
| 400 | validation error |
| 404 | `{ "error": "member_not_found" }` |

No money moves.

## POST /psp/callbacks

Request: `{ "pspRef": "<ref>", "status": "completed" | "failed", "amount": "100.50" }`

| Status | When | Effect |
|---|---|---|
| 200 `{ "status": "Completed" \| "Failed", "applied": true }` | first valid delivery | transition applied (credit on `completed`) |
| 200 `{ "status": ..., "applied": false }` | repeat of the terminal state | no-op |
| 400 | bad body | none |
| 404 `{ "error": "psp_ref_not_found" }` | unknown `pspRef` | none |
| 409 `{ "error": "invalid_transition", "from", "to" }` | `Completed` receives `failed`, `Failed` receives `completed` | none |
| 422 `{ "error": "amount_mismatch", "expected", "received" }` | `completed` with a different amount | none; mismatch recorded; deposit stays `Pending` |

`failed` callbacks ignore `amount`.

## POST /wallets/:walletId/wagers  (idempotency key supported)

Request: `{ "amount": "10.00" }`

| Status | Body |
|---|---|
| 201 | `{ "id", "walletId", "amount", "balance" }` (`balance` after the debit) |
| 400 | validation error |
| 404 | `{ "error": "wallet_not_found" }` |
| 422 | `{ "error": "insufficient_balance", "balance", "requested" }` |

## POST /withdrawals  (idempotency key supported)

Request: `{ "memberId": "<uuid>", "amount": "50.00" }`

| Status | Body |
|---|---|
| 201 | `{ "id", "status": "Pending", "amount", "balance" }` |
| 400 | validation error |
| 404 | `{ "error": "member_not_found" }` |
| 422 | `{ "error": "turnover_not_met", "required", "accrued", "outstanding" }` |
| 422 | `{ "error": "insufficient_balance", "balance", "requested" }` |

Turnover is checked before balance.

## Existing

`POST /members`, `GET /members/:memberId/wallet`, `GET /health` are unchanged.
