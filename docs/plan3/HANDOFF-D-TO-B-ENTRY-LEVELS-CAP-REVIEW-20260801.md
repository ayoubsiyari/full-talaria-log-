# Handoff D to B - Entry Levels Cap Review

**From:** Manager D  
**To:** Manager B  
**Date:** 2026-08-01  
**Reason:** money-path order review before merge.

## Review Scope

Changed:

- `chart v 1.4/chart/modules/order-manager.js`
- `homepage/public/chart/modules/order-manager.js`
- `scripts/entry-levels-cap-gate.mjs`
- `scripts/tests/entry-levels-cap-gate.test.mjs`
- `package.json` additive script registration only

The change adds `__TALARIA_ENTRY_LEVELS_CAP_V1` and caps `applyScaling(order)` before it pushes a new order
into `group.entries`. The explicit split-entry path already uses `MAX_ENTRY_LEVELS`; this closes the scaling
bypass path.

## Evidence For Review

Run:

`npm run test:entry-levels-cap`

`npm run preflight:entry-levels-cap`

Observed D preflight:

- zero-trade regime: GREEN, first order creates one-entry group.
- trade-heavy regime: GREEN, four real open orders on `orderManager`; fifth scaled entry rejected.
- below-cap control: GREEN, three entries still scales to four.
- bypass negative control: RED-armed, switch disabled reaches five entries.

Review ask:

- Confirm rejecting the fifth scaled entry from the group is the correct money-path behavior.
- Confirm `__TALARIA_ENTRY_LEVELS_CAP_V1` default ON is acceptable.
- Confirm the gate is discriminating against the bypass path rather than only checking the constant.
