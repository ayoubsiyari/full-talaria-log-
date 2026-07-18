# Lane 4 — A8 + A8-VP unified drawing checkpoint (CKPT-005)

**Build:** `20260718b05`  
**Date:** 2026-07-18

## Assembly

Merged Worker 5 A8-1…4 tranches and Worker 1 A8-VP-1/2 into one drawing build on `drawing-tools-manager.js` (+ `TalariaV8bLive.jsx` VP bridge). Fresh monotonic id **b05** (not b44).

## Product fixes (gate blockers)

1. **A8-3 commit path:** `effectivePoints.length` (was `pointsOverride.length` on null commit → dropped `timestampPoints`).
2. **Multichart live-sync gate:** `_isCrossPanelDrawingSyncEnabled()` now recognizes `__harnessHostBridge` / `__harnessManager.syncMode` (finalize-add synced; drag updates did not).
3. **Receive path:** `_applySyncedDrawingPayloadToExisting` honors inbound `drawingData.timestampPoints` (mixed-TF peers).
4. **Commit broadcast:** prefer `drawing.timestampPoints` after `_refreshDrawingTimestampAnchors` on mouseup.

## Scope integrity (b50 lesson)

- `drawing-tools-manager.js`: 388 methods, **0 duplicate defs**; `_broadcastLiveEditUpdate`, `_syncHorizontalAnchorToolPointY`, A8 switch helpers present.

## Harness proof (all ON, ×10)

| Scenario | Result |
|----------|--------|
| H-A8-1…4 | 10/10 PASS |
| H-A8-VP-1/VP-2 | 10/10 PASS |
| D-026 H-R04 / H-R05 | 10/10 PASS on **b05** |

## Deploy

Push + `./scripts/vps-deploy-after-pull.sh homepage`; PO confirms `__TALARIA_CHART_BUILD_ID === 20260718b05` on host + panel-B iframe.
