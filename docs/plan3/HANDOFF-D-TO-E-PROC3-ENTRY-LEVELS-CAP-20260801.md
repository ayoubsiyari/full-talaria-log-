# Handoff D to E - PROC-3 Sweep for Entry Levels Cap

**From:** Manager D  
**To:** Manager E  
**Date:** 2026-08-01  
**Row:** Entry levels cap on scaling path

KILL-04 applies because this adds a bound and removes no copy. The row still touches orders, so B review and
E PROC-3 remain required before merge/SOAK-READY.

## PROC-3 Axes

- Present: `__TALARIA_ENTRY_LEVELS_CAP_V1` and `_canAddMoreScaledEntryLevels` are in both `order-manager.js`
  mirrors.
- Bound: `applyScaling(order)` calls `_canAddMoreScaledEntryLevels` before `group.entries.push(order)`.
- Mirrored: `git diff --no-index --quiet "chart v 1.4/chart/modules/order-manager.js" "homepage/public/chart/modules/order-manager.js"` passed.
- Discriminating: `npm run preflight:entry-levels-cap` exercises the scaling bypass path directly. With the
  switch disabled, a four-entry group accepts a fifth entry and the negative control is RED-armed.

## Evidence

- `npm run test:entry-levels-cap`: PASS
- `npm run preflight:entry-levels-cap`: GREEN
- Zero-trade regime: first order creates a one-entry group.
- Trade-heavy regime: four real open orders on `orderManager`; fifth scaled entry is rejected.
- Below-cap control: three entries still scales to four.
- Bypass control: switch disabled reaches five entries.
