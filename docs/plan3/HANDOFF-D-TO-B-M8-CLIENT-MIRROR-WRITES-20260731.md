# Handoff D to B — M8 Client Mirror Writes

**Date:** 2026-07-31  
**From:** Manager D  
**To:** Manager B  
**Subject:** M8 wrote to `chart.js` and `order-manager.js` in both client mirrors

D changed the M8 client hydrate path in:

- `chart v 1.4/chart/chart.js`
- `chart v 1.4/chart/modules/order-manager.js`
- `homepage/public/chart/chart.js`
- `homepage/public/chart/modules/order-manager.js`

The change adds non-delete-authority handling for partial/heavy-slim `/api/sessions/{id}/state` journal hydrate payloads. `session-state-hydrate` is retained only for complete full payloads; partial or heavy-slim hydrate uses `partial-hydrate` provenance and cannot authorize durable replace/delete of omitted SQL rows or omitted screenshot-heavy fields.

Merge note for the train: these files overlap A's chart spine. Treat this as a D-owned safety guard on top of A's resolver/client mirror work, not as a product behavior refactor.

Mirror proof:

- `git diff --no-index --quiet "chart v 1.4/chart/chart.js" "homepage/public/chart/chart.js"` passed.
- `git diff --no-index --quiet "chart v 1.4/chart/modules/order-manager.js" "homepage/public/chart/modules/order-manager.js"` passed.
- `npm run test:m8-state-bound` now includes `M8 client mirrors are identical for chart and order-manager guards`.

## 2026-08-01 09:35 Addendum

Director ruling `RULING-FULL-ROSTER-BEFORE-SEAL-SOAK-01-QUIESCENCE-AND-KILL-04-20260801-0935.md`
puts M8 under E's PROC-3 sweep and names D's original one-mirror M8 miss as one of the defects PROC-3 exists
to catch. M8 must therefore prove both client mirrors byte-identical, not merely present.

Current D proof:

- `chart.js` mirror byte identity passed with `git diff --no-index --quiet`.
- `modules/order-manager.js` mirror byte identity passed with `git diff --no-index --quiet`.
- `npm run test:m8-state-bound` passed the mirror identity invariant.
- `npm run preflight:m8-state-bound` returned `M8-CLIENT-MIRRORS-IDENTICAL: GREEN`.

KILL-04 does not apply to LIFE-4/M8. This remains a journal/delete-authority money-path row: B reviews,
E PROC-3 sweeps present/bound/mirrored/discriminating, then seal.
