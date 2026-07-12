# T4 step 6 order-type label live-refresh report

## Scope

Prompt: `docs/tickets-overhaul/worker-prompts/T4-step6-ordertype-label-live-refresh.md`

Follow-up to T4 step 5 / D-005. The order-type classifier remains unchanged; this step only decouples the cheap Entry label repaint from the heavy preview redraw throttle.

Kill-switch: `window.__TALARIA_DISABLE_ORDERTYPE_LIVE_LABEL_FIX` (default unset = fix ON).

No build bump was run.

Source behavior quote (P6), TAL-00752 message #17: *"When I add more than one entry and move the second entry, its location changes and it remains called a market order, even if it was a limit order."*

## Mechanism

Confirmed:

- `updatePreviewLines()` still intentionally returns while dragging at `chart v 1.4/chart/modules/order-manager.js` (`Skipping updatePreviewLines() - currently dragging`).
- Step 5 correctly reclassified order type, but the visible label could still depend on the skipped full preview redraw during active drag.

Fix:

- Added `_orderTypeLiveLabelFixEnabled()` with `window.__TALARIA_DISABLE_ORDERTYPE_LIVE_LABEL_FIX`.
- Added `_refreshOrderTypePreviewLabelLive(lineData, overrideY, chart)`, a rAF-coalesced lightweight invalidation that calls:
  - `renderPreviewLabel()`
  - `adjustPreviewLineForLabel()`
  - `_syncPendingLimitStopConnector()`
  - `_refreshLevelCtrlHoverIfNeeded()` when available
- Main entry drag and split-entry drag now call the helper after reclassification and before the throttled calculation block.
- The heavy `updatePreviewLines()` drag throttle was not removed.

Line references:

- Kill-switch helper: `chart v 1.4/chart/modules/order-manager.js` around `_orderTypeLiveLabelFixEnabled()`.
- Live label helper: `chart v 1.4/chart/modules/order-manager.js` around `_refreshOrderTypePreviewLabelLive()`.
- Drag throttle kept: `chart v 1.4/chart/modules/order-manager.js` around `Skipping updatePreviewLines() - currently dragging`.
- Main entry drag call: `chart v 1.4/chart/modules/order-manager.js` around `self._refreshOrderTypePreviewLabelLive(lineData, clampedY, ch);`.
- Split entry drag call: `chart v 1.4/chart/modules/order-manager.js` around the second `self._refreshOrderTypePreviewLabelLive(lineData, clampedY, ch);`.

## RED/GREEN/RED-again

Added focused regression:

- `chart v 1.4/chart/modules/order-type-live-label-refresh.test.mjs`
- `homepage/public/chart/modules/order-type-live-label-refresh.test.mjs`

RED first, before fix:

```powershell
node "chart v 1.4/chart/modules/order-type-live-label-refresh.test.mjs"
```

Result:

- Exit code `1`.
- Failed checks:
  - missing own kill-switch helper
  - missing `__TALARIA_DISABLE_ORDERTYPE_LIVE_LABEL_FIX`
  - missing drag-path live label invalidation
  - missing rAF coalescing

GREEN after fix:

```powershell
node "chart v 1.4/chart/modules/order-type-live-label-refresh.test.mjs"
```

Result:

- Exit code `0`.
- `GREEN — order-type live label refresh is decoupled from updatePreviewLines drag throttle`

RED-again with kill-switch:

```powershell
$env:TALARIA_TEST_DISABLE_ORDERTYPE_LIVE_LABEL_FIX='1'
node "chart v 1.4/chart/modules/order-type-live-label-refresh.test.mjs"
```

Result:

- Exit code `1`.
- Helper no-ops under the simulated window kill-switch, so render/adjust/connector assertions fail.

Step-5 classifier guard:

```powershell
$env:TALARIA_ORDER_AGGREGATES_V2='1'
node "chart v 1.4/chart/modules/order-entry-aggregates.property.test.mjs"
```

Result:

- Exit code `0`.
- Reclassification suite remains GREEN.

## State matrix

| Cell | Behavior change |
| --- | --- |
| Single chart, replay off | Changed: Entry label refreshes every drag frame via cheap rAF invalidation. |
| Single chart, replay paused | Changed: same label refresh path; market price still comes from step-5 replay-aware classifier. |
| Single chart, replay playing | Changed: same label refresh path; no replay bus or mirror-frame changes. |
| Multichart host | Changed only for local order-entry Entry label repaint during drag. |
| Multichart panel | Changed only for focused panel/order draft Entry label repaint during drag. |
| Sync on/off | No sync policy change; label repaint is local to dragged draft line. |
| Multi-entry | Changed: each `Entry#N:<type>` label refreshes live after that leg reclassifies. |
| Heavy preview recompute | Unchanged: `updatePreviewLines()` still skips while dragging. |
| Step-5 reclassification logic | Unchanged; this step only calls/repaints after it. |

## Diff summary

Worker-owned changes:

- `chart v 1.4/chart/modules/order-manager.js`
- `homepage/public/chart/modules/order-manager.js`
- `chart v 1.4/chart/modules/order-type-live-label-refresh.test.mjs`
- `homepage/public/chart/modules/order-type-live-label-refresh.test.mjs`
- `docs/tickets-overhaul/worker-reports/T4-step6-ordertype-label-live-refresh-report.md`

No build-id files were touched.

## Verification

Syntax:

```powershell
node --check "chart v 1.4/chart/modules/order-manager.js"
node --check "chart v 1.4/chart/modules/order-type-live-label-refresh.test.mjs"
```

Result: pass.

Lints:

- `ReadLints` on canonical/public touched files: no linter errors.

Byte identity:

- `order-manager.js`: `956338AE4F1C9F0AB324547A151CE9F8B715026CBA2BBDB8D439CD2B213345BD`
- `order-type-live-label-refresh.test.mjs`: `D0FF80412395D8C4FEF099BA7B299AAFD0712A58CD035B9E2B2030F0E85ABF57`

Each hash matched between `chart v 1.4/chart/**` and `homepage/public/chart/**`.

## PO spot-check

After Manager build bump:

1. Confirm the expected build ID on host and all panels.
2. Open a buy order draft.
3. Slowly drag the entry line below market, through market, and above market.
4. Confirm the label tracks continuously during movement: `LIMIT BUY` -> `MARKET BUY` -> `STOP BUY`.
5. Repeat with a multi-entry second leg and confirm the moved leg's label refreshes continuously, not only on pause/release.
6. Confirm console may still show `Skipping updatePreviewLines() - currently dragging`; that is expected because the heavy throttle remains.
