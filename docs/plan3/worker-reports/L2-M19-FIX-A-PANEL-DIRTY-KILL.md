# L2-M19 — Fix A panel dirty (KILL)

**Verdict:** FIX-A-KILL-RED — kill reconstructs 5500 panel rebuilds; frame slope fail 3/3

**Persist:** n/a (kill discriminator)

**Scope:** Fix A product path + soak acceptance. UI-contract proofs: `m19-panel-dirty-runtime-contract.test.mjs`. Not a live I15 UI verdict. Mechanisms B–E untouched.

## Commands / runtime

```
node "chart v 1.4/chart/modules/m19-progressive-session-soak.test.mjs"
TALARIA_DISABLE_M19_PANEL_DIRTY_V1=1 node "chart v 1.4/chart/modules/m19-progressive-session-soak.test.mjs"
node --test "chart v 1.4/chart/modules/m19-panel-dirty-runtime-contract.test.mjs"
```

- startedAt (wall): 2026-07-22T22:59:01.361Z
- finishedAt (wall): 2026-07-22T23:03:27.642Z
- elapsedMs: 266140
- HEAD: `019e8c7304da3a8f877cac86adfa21e75ebf8ed4`
- SHA-256 order-manager.js: `8efd6e5fa451a3f5f6bc5f84fec98d7f0c658293d7ff07581ad3e557ef8f363b`
- SHA-256 replay-system.js: `e5bc68dc8fff190daf2186ca0b3e406199f9b0be511a5639d55809c0efd6c37c`
- SHA-256 chart.js: `c00ca02989bd5d1ddc87dab850fdf9d61fbded55ee0bc58b287214164a1e9e3e`

## Live symbol anchors (verified)

```json
{
  "order-manager.js:updatePositions": 29190,
  "order-manager.js:updatePositions→updatePositionsPanel": null,
  "order-manager.js:updatePositions→scheduleRuntimePanel": 30084,
  "order-manager.js:updatePositionsPanel": 42638,
  "order-manager.js:_updatePositionsPanelRuntimeOnly": 30246,
  "order-manager.js:_appendExcursionSnapshot": 3719,
  "order-manager.js:persistJournal": 4838,
  "order-manager.js:_buildRuntimeOrderPersistPatch": 5943,
  "order-manager.js:_redrawClosedJournalTradeMarkers": 36946,
  "order-manager.js:_redrawJournalMarkersForReplayPlayhead": 37014,
  "order-manager.js:hotpath-console-updatePositions": 30075,
  "order-manager.js:hotpath-console-updatePositionsPanel": 42653,
  "replay-system.js:updatePositions#1": [
    3805,
    5430,
    5873,
    7182,
    8354
  ],
  "chart.js:flushSessionStateSave": 12336
}
```

## Locked assertions (unchanged)

- Frame-cost final 20% median ≤ 1.25× first 20% median
- Normalized frame-cost slope ≤ +5% of first-window median per 1,000 ticks
- Final 1,000-tick steady phase: runtime & session growth each ≤ max(5%, 16 KiB)
- Final runtime patch ≤ 256 KiB
- Final session/journal patch ≤ 512 KiB

## 3-run metric summary

### Canonical repeat 1
- frame first/last median: 2.3283 → 11.6326 (ratio 4.996; limit ≤ 1.25)
- slope/1k: 2.0703 (frac of first 0.8892; limit ≤ 0.05)
- runtime bytes: 65901 → 706962 (abs limit 262144)
- session bytes: 65940 → 1752034 (abs limit 524288)
- steady growth runtime/session: 128081 / 337095
- paths a–e exercised: true
- panel invocations: 5500; Fix-A bounded=false reconstruct=true; marker redraws: 206; journal rows visited: 5150
- excursion end: [{"id":1,"bar_close_r":5500,"bar_high_r":5500,"bar_low_r":5500,"post_exit_bar_close_r":0},{"id":2,"bar_close_r":5500,"bar_high_r":5500,"bar_low_r":5500,"post_exit_bar_close_r":0}]
- console calls/bytes: 165000 / 4657887508
- base64 persist/innerHTML bytes: 125674200 / 0
- open/journal: 2/50
- frameSlopeFail=true persistFail=true

### Canonical repeat 2
- frame first/last median: 2.2801 → 11.7148 (ratio 5.138; limit ≤ 1.25)
- slope/1k: 2.1600 (frac of first 0.9473; limit ≤ 0.05)
- runtime bytes: 65901 → 706962 (abs limit 262144)
- session bytes: 65940 → 1752034 (abs limit 524288)
- steady growth runtime/session: 128081 / 337095
- paths a–e exercised: true
- panel invocations: 5500; Fix-A bounded=false reconstruct=true; marker redraws: 206; journal rows visited: 5150
- excursion end: [{"id":1,"bar_close_r":5500,"bar_high_r":5500,"bar_low_r":5500,"post_exit_bar_close_r":0},{"id":2,"bar_close_r":5500,"bar_high_r":5500,"bar_low_r":5500,"post_exit_bar_close_r":0}]
- console calls/bytes: 165000 / 4657887508
- base64 persist/innerHTML bytes: 125674200 / 0
- open/journal: 2/50
- frameSlopeFail=true persistFail=true

### Canonical repeat 3
- frame first/last median: 5.4469 → 29.2496 (ratio 5.370; limit ≤ 1.25)
- slope/1k: 5.2543 (frac of first 0.9646; limit ≤ 0.05)
- runtime bytes: 65901 → 706962 (abs limit 262144)
- session bytes: 65940 → 1752034 (abs limit 524288)
- steady growth runtime/session: 128081 / 337095
- paths a–e exercised: true
- panel invocations: 5500; Fix-A bounded=false reconstruct=true; marker redraws: 206; journal rows visited: 5150
- excursion end: [{"id":1,"bar_close_r":5500,"bar_high_r":5500,"bar_low_r":5500,"post_exit_bar_close_r":0},{"id":2,"bar_close_r":5500,"bar_high_r":5500,"bar_low_r":5500,"post_exit_bar_close_r":0}]
- console calls/bytes: 165000 / 4657887508
- base64 persist/innerHTML bytes: 125674200 / 0
- open/journal: 2/50
- frameSlopeFail=true persistFail=true

## Neighbor state matrix

| Cell | Result |
|---|---|
| neighbor-single-playing | ratio=2.147 slopeFrac=0.298 persistFail=true |
| neighbor-single-paused | ratio=0.857 slopeFrac=-0.034 persistFail=true |
| neighbor-multichart-host+projected-playing | ratio=5.312 slopeFrac=0.994 persistFail=true |
| neighbor-multichart-host+projected-paused | ratio=1.092 slopeFrac=0.004 persistFail=true |
| session-restore-legacy-uncapped | RESTORE-PASS |
| multichart-restore-legacy-uncapped | RESTORE-PASS |

## Persisted-format hash (today)

`f97f31979c760260998bd9d45863ee071c67aee4fe14c65dbe0c1522de370976`

## Evidence

- JSON: `docs\plan3\evidence\L2-M19-fix-a-panel-dirty-kill.json`
- Report: `docs\plan3\worker-reports\L2-M19-FIX-A-PANEL-DIRTY-KILL.md`
- Fixture: `chart v 1.4/chart/modules/m19-legacy-uncapped-session.fixture.json`
- UI contract: `chart v 1.4/chart/modules/m19-panel-dirty-runtime-contract.test.mjs`

## Switches

(a) PANEL_DIRTY — Fix A (this run). (b)–(e) untouched / not claimed GREEN.

## Binding

I1/I2/I3/I5/I8/I10/I14/I16 · P1/P2/P3 · D-030 will bind (b)/(c).
