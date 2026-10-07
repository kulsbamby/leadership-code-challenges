# Contract: PSP configuration

What `DESIGN-PSP.md` must specify for how configuration drives integrations (FR-005).

## Shape (one entry per provider id)

```yaml
<provider-id>:
  adapter: <registered adapter name>       # generic adapter, or a custom file
  secret: ${ENV_VAR}                       # from the environment, never committed
  amountExponent: <integer >= 0>
  statusMap: { <provider status>: completed | failed | ignore }
  fields: { pspRef: <path>, status: <path>, amount: <path> }   # generic adapter only
```

## Behavior to state in the note

| Situation | Required behavior |
|---|---|
| missing secret or env var | startup fails, naming the provider (not the first live callback) |
| unknown `adapter` | startup fails |
| status not in `statusMap` at runtime | the callback is rejected (400) and logged; it never becomes `completed` |
| adding a provider | a new entry (and, only if unusual, one adapter file); no change to routes, services, or schema |
