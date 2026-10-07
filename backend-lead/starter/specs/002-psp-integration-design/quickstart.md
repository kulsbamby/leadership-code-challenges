# Quickstart: validating the PSP design note

The deliverable is `DESIGN-PSP.md` at `backend-lead/starter/`. There is nothing to run; validation is three checks that map to the spec's success criteria.

## 1. Length (SC-003, FR-010)

```bash
awk '/^```/{f=!f; next} !f' DESIGN-PSP.md | wc -w     # prose words, code blocks excluded; target 500-600
```

## 2. Requirement checklist (SC-001, SC-002, SC-004, SC-006)

Read the note once with [spec.md](spec.md) open and confirm:

- [ ] Four headings, one per required topic: abstraction, verification and normalization placement, config, testing without the provider. (SC-002)
- [ ] A sketch (diagram plus interface block) with **(exists)** and **(proposed)** tags. (FR-007, FR-011)
- [ ] A numbered checklist for adding a PSP, and "no change to the core" stated in it. (FR-008, FR-013)
- [ ] The quirk table covers all six quirks from the brief, each with a handling location. (SC-004, FR-009; see [contracts/adapter-contract.md](contracts/adapter-contract.md))
- [ ] Config section states what happens on a missing secret or unknown adapter, and on an unmapped status. (FR-005; see [contracts/config-contract.md](contracts/config-contract.md))
- [ ] Testing section names valid and invalid authenticity cases, normalization, and duplicate / concurrent / wrong-amount deliveries, and one check every new integration inherits. (FR-006, SC-006)
- [ ] Out-of-scope statement present (outbound calls). (FR-012)
- [ ] Amounts appear only as decimal strings. (FR-014)

## 3. Consistency with Part A (SC-005, FR-011)

```bash
grep -n "interface CallbackInput" -A4 src/services/pspCallbackService.ts   # pspRef, status, amount
grep -nE "pspRef|status|amount" DESIGN-PSP.md | head                      # the note's normalized callback
```

The note's normalized callback must carry the same three fields, with `status` limited to `completed | failed` once it reaches the core, and the route in the note must be labelled **(proposed)** because the built route is `POST /psp/callbacks`.

## Optional: the "one-day" read-through (SC-001, US1)

Give the note to someone who has not seen the code and ask for the list of files and config entries they would change to add a new PSP. It should be short, specific, and must not include any file in `src/services/`.
