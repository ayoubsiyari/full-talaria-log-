# Entry Levels Cap - Scaling Path

**Owner:** D  
**Switch:** `__TALARIA_ENTRY_LEVELS_CAP_V1`  
**Default:** ON  
**Verdict:** GREEN in D preflight; B review and E PROC-3 required before merge.

## What Changed

`applyScaling(order)` now uses the same four-entry cap as the explicit split-entry path before it pushes a
new order into `group.entries`. If a scaled group already has four entries, the new order is not added to
that group and a warning notification is emitted.

Changed mirrors:

- `chart v 1.4/chart/modules/order-manager.js`
- `homepage/public/chart/modules/order-manager.js`

## Evidence

Commands:

`npm run test:entry-levels-cap`

`npm run preflight:entry-levels-cap`

Result:

- `ENTRY-CAP-ZERO-TRADE-REGIME`: GREEN. First order creates a one-entry group.
- `ENTRY-CAP-TRADE-HEAVY-REGIME`: GREEN. Four real open orders on `orderManager`; fifth scaled entry is rejected, group remains at four.
- `ENTRY-CAP-BELOW-CAP-STILL-SCALES`: GREEN. Three-entry group accepts a fourth entry.
- `NC-ENTRY-CAP-BYPASS-PATH-RED`: RED-armed. With `__TALARIA_ENTRY_LEVELS_CAP_V1` disabled, the bypass path reaches five entries.

## PROC-3 Packet

- Present: `__TALARIA_ENTRY_LEVELS_CAP_V1` and `_canAddMoreScaledEntryLevels` exist in both mirrors.
- Bound: `applyScaling(order)` calls `_canAddMoreScaledEntryLevels` before `group.entries.push(order)`.
- Mirrored: the full `order-manager.js` mirrors are byte-identical.
- Discriminating: the gate exercises the scaling bypass path directly; it does not merely assert
  `MAX_ENTRY_LEVELS === 4`.

KILL-04 applies because this adds a bound and removes no copy. Money-path review still applies because it
touches orders: B review before merge, E PROC-3 before SOAK-READY.
