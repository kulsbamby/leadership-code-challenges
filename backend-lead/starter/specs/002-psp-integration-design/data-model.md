# Data Model: PSP Integration Design Note (Part B)

The deliverable is a document, so these are the *conceptual* entities the note defines and the constraints the note must respect. Nothing here is a new table: Part A's schema is unchanged (FR-013). Items marked (exists) are in the Part A code; (proposed) are introduced only by the note.

## Normalized callback (exists, as the core's input)

Source: `CallbackInput` in `src/services/pspCallbackService.ts`.

| Field | Type | Rule |
|---|---|---|
| `pspRef` | string | our own reference, echoed back by the PSP (generated at deposit creation) |
| `status` | `completed` \| `failed` | the only two states the core accepts |
| `amount` | decimal string | major units, at most 18 decimal digits; never a floating-point number (FR-014) |

(proposed) The adapter's output type additionally allows `status: 'ignore'` for non-terminal provider events. `ignore` is consumed at the edge and is never passed to the core, so the core's input stays exactly as built.

## PSP integration (proposed)

One per provider. Two pure operations and no I/O:

| Operation | Input | Output | Failure |
|---|---|---|---|
| verify | raw request bytes, headers, config | nothing | authenticity failure (maps to 401, nothing else runs) |
| parse | raw request bytes, headers, config | normalized callback (or `ignore`) | malformed payload (maps to 400) |

## PSP configuration (proposed)

One entry per provider, keyed by provider id.

| Field | Meaning | Rule |
|---|---|---|
| `adapter` | which integration handles it (a generic one, or a custom file) | must name a registered adapter, else fail at startup |
| `secret` | credential for verification | supplied from the environment, never committed; missing means fail at startup |
| `amountExponent` | decimal places of the provider's amounts (e.g. 2 for minor units) | non-negative integer |
| `statusMap` | provider status to platform status (`completed`, `failed`, `ignore`) | every provider status must be mapped; an unmapped status can never become `completed` |
| `fields` | where `pspRef`, status, amount live in the payload (generic adapter only) | all three required |

## Test fixture (proposed)

Folder per provider, `fixtures/<psp>/`, one file per scenario: `completed`, `failed`, `pending`, `bad-signature`, `minor-units`. Each holds the request body and headers, signed with a test secret. Fixtures are recorded or built from the provider's documentation, never fetched live.

## Relationships

```
config entry --selects--> PSP integration --produces--> normalized callback --> money-handling core (exists)
test fixture --exercises--> PSP integration, and the full path through the core
```
