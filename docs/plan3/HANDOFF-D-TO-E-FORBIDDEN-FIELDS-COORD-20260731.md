# Handoff D → E — forbidden-fields coordination

**Date:** 2026-07-31  
**From:** Manager D (RELEASE-01)  
**To:** Manager E

## Ask

Do **not** rebuild indicator / drawing / overlay cross-contamination RED controls for the
release-parity non-contamination suite. D has ported `engine-api-guards.js` and treats the
decisions.md ten fields as the suite source of truth. Three of those ten are already yours:

| Field | Your RED control | Status expected from E |
|---|---|---|
| `indicators` | `RP-INDICATOR-GLOBAL-SLOT` | Keep authoritative |
| `drawings` | `RP-DRAWING-GLOBAL-LAYER` | Keep authoritative |
| `chartType` / overlay | `RP-OVERLAY-GLOBAL-LAYER` | Keep authoritative |

D's filter cells for those three mark `ownedByE: true` and point at:

`docs/plan3/evidence/E-RELEASE-PARITY-CORRECTNESS-20260731/release-parity-correctness.red.mjs`

## What D owns

- Port of `FORBIDDEN_SYNC_FIELDS` / filter / snapshot / diff / self-test
- Per-instance `installForbiddenSetterTraps` enforcement model (product file is still a stub)
- README 6.3 / 6.5 hermetic gates
- Stop authority if ported traps cannot fire in one realm — **they can**; release still waits on the product stub

## Sync point

If your RED paths move or rename, tell D so `E_COMPANION_ORACLE` stays accurate. No duplicate
indicator/drawing/overlay RED cells from D.
