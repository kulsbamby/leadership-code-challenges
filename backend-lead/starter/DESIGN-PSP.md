# DESIGN-PSP: making the 50th PSP a one-day junior task

## Goal

A new PSP is one small adapter file (or only a config entry) plus one fixture folder. It never changes the money-handling core, and it cannot break it.

Tags: **(exists)** is built in Part A; **(proposed)** is introduced by this note.

## Where the line is

`POST /psp/callbacks` **(exists)** takes a *normalized* callback and calls `handleCallback` **(exists)**, which owns idempotency, the state machine, locking and the ledger. That is the **core**. Provider quirks must never cross into it, so everything provider-specific lives in an **adapter** **(proposed)** at the edge. Verification and normalization sit there so a new PSP can influence the core only through three fields.

```
POST /psp/:provider/callbacks   (proposed)  raw body kept as bytes, headers kept
   |
[registry]    provider -> adapter + config          unknown provider -> 404
   |
[verify(raw, headers, cfg)]                         signature / IP / timestamp; fail -> 401
   |
[parse(raw, cfg) -> NormalizedCallback]             format, statuses, units; malformed -> 400; 'ignore' -> 200, dropped
   |
handleCallback({ pspRef, status, amount })  (exists)   lock, state machine, credit once, ledger
```

What can a junior get wrong that loses money? Nothing in the integration code: idempotency, locking, the state machine and the ledger are not per-PSP.

## Interface

```ts
// (proposed) adapter output. Only completed | failed ever reach handleCallback (exists).
interface NormalizedCallback {
  pspRef: string;                        // our reference, echoed back by the PSP
  status: 'completed' | 'failed' | 'ignore';  // ignore = non-terminal event such as "pending"; dropped, never forwarded
  amount: string;                        // decimal string, major units, built with dec(); never a number
}
interface PspAdapter {
  id: string;
  verify(req: { rawBody: Buffer; headers: Headers }, cfg: PspConfig): void;            // throws on failure
  parse(req: { rawBody: Buffer; headers: Headers }, cfg: PspConfig): NormalizedCallback;
}
```

Both are pure: no database, no network. `verify` runs first, on the **raw bytes** (re-encoded JSON breaks signatures), using a shared constant-time HMAC helper. `parse` converts amounts through one shared `fromMinorUnits(value, exponent)` helper, so adapters never do money arithmetic.

## PSP quirks and where each is handled

| Quirk | Handled in |
|---|---|
| different callback formats | `parse` (generic adapter: config `fields`) |
| different verification schemes | `verify` |
| different status vocabularies | config `statusMap`, applied in `parse` |
| amounts in minor units | config `amountExponent` + shared helper |
| aggressive retries | the core (already idempotent); no adapter code |
| `success` before `pending` | `success` is applied by the core; the later `pending` maps to `ignore` |

## Config drives it

```yaml
acme-pay:                        # (proposed) secrets come from env, never committed
  adapter: json-hmac             # generic adapter: most PSPs need no code
  secret: ${ACME_PAY_SECRET}
  amountExponent: 2
  statusMap: { SUCCESS: completed, DECLINED: failed, PENDING: ignore }
  fields: { pspRef: data.reference, status: data.state, amount: data.amount }
```

The registry validates at startup and fails fast on an unknown adapter or a missing secret, naming the provider. Every provider status must be mapped; an unmapped one at runtime is rejected (400) and logged, and can never become `completed`.

## Testing without the provider

- **Recorded fixtures, never live calls.** `fixtures/<psp>/` holds the provider's documented payloads and headers, signed with a test secret: completed, failed, pending, bad signature, minor units.
- **One contract suite over every registered adapter.** A valid signature verifies; a tampered body or stale timestamp fails; `parse` yields a valid callback; the amount round-trips exactly (`"1050"` at exponent 2 is `"10.50"`); an unmapped status never becomes `completed`. A new adapter inherits all of it.
- **End to end through the real core** on a real database: the same fixtures delivered twice, concurrently, and with a wrong amount, reusing the Part A money tests.
- **Guardrail:** a lint rule forbids `parseFloat`, `Number(` and imports from `services/` or `db/` inside `adapters/`.

## Add a PSP, in order

1. Copy `adapters/_template.ts`, or add a config entry for the generic adapter.
2. Add `fixtures/<psp>/` with the provider's sample requests.
3. Run the tests; the shared contract suite picks the adapter up automatically.
4. Add the config entry and its secret.
5. Nothing else: no change to routes, services or schema.

## Not covered

Outbound calls (create payment, payouts, polling) need a second interface behind the same registry: a separate design. Auth and deployment are out of scope. If a PSP needs something the abstraction cannot express, extend `NormalizedCallback` or the config schema once for all PSPs; never add a per-PSP branch in the core.
