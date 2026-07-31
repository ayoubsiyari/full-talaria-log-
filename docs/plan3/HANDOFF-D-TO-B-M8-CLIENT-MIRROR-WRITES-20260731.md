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
