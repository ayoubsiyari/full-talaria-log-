# L2-M19 — Fix B excursion tail (KILL)

**Verdict:** FIX-B-KILL-RED — kill reconstructs unbounded open excursion max=5500 (tailMax=256)

**Persist:** n/a (kill discriminator)

**Scope:** Fix B product path on Fix A base `250086d7c`. D-030/I16 contract: `m19-excursion-tail-contract.test.mjs`. No D/E or Fix C edits. Not a live I15 UI verdict.

## Commands / runtime

```
node "chart v 1.4/chart/modules/m19-progressive-session-soak.test.mjs"
TALARIA_DISABLE_M19_EXCURSION_TAIL_V1=1 node "chart v 1.4/chart/modules/m19-progressive-session-soak.test.mjs"
node --test --test-concurrency=1 "chart v 1.4/chart/modules/m19-excursion-tail-contract.test.mjs"
node "chart v 1.4/chart/modules/order-runtime-persist.test.mjs"
```

- startedAt (wall): 2026-07-23T00:25:40.926Z
- finishedAt (wall): 2026-07-23T00:25:45.172Z
- elapsedMs: 4101
- HEAD: `250086d7c0e0bb4bedd8441e8038da3f4d971681`
- SHA-256 order-manager.js: `a54d54d2189495b9d0339cb26888d82f0c70048e11a7b2200d1359ab615684b0`
- SHA-256 replay-system.js: `e5bc68dc8fff190daf2186ca0b3e406199f9b0be511a5639d55809c0efd6c37c`
- SHA-256 chart.js: `c00ca02989bd5d1ddc87dab850fdf9d61fbded55ee0bc58b287214164a1e9e3e`

## Live symbol anchors (verified)

```json
{
  "order-manager.js:updatePositions": 29489,
  "order-manager.js:updatePositions→updatePositionsPanel": null,
  "order-manager.js:updatePositions→scheduleRuntimePanel": 30383,
  "order-manager.js:updatePositionsPanel": 42937,
  "order-manager.js:_updatePositionsPanelRuntimeOnly": 30545,
  "order-manager.js:_appendExcursionSnapshot": 3956,
  "order-manager.js:persistJournal": 5139,
  "order-manager.js:_buildRuntimeOrderPersistPatch": 6222,
  "order-manager.js:_redrawClosedJournalTradeMarkers": 37245,
  "order-manager.js:_redrawJournalMarkersForReplayPlayhead": 37313,
  "order-manager.js:hotpath-console-updatePositions": 30374,
  "order-manager.js:hotpath-console-updatePositionsPanel": 42952,
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
- frame first/last median: 0.0144 → 0.0116 (ratio 0.806; limit ≤ 1.25)
- slope/1k: -0.0007 (frac of first -0.0458; limit ≤ 0.05)
- runtime bytes: 65901 → 706962 (abs limit 262144)
- session bytes: 65940 → 1752034 (abs limit 524288)
- steady growth runtime/session: 128081 / 337095
- paths a–e exercised: true
- panel invocations: 0; Fix-A bounded=true reconstruct=false; marker redraws: 206; journal rows visited: 5150
- Fix-B excursion max=5500 bounded=false unbounded=true (tailMax=256)
- excursion end: [{"id":1,"bar_close_r":5500,"bar_high_r":5500,"bar_low_r":5500,"post_exit_bar_close_r":0},{"id":2,"bar_close_r":5500,"bar_high_r":5500,"bar_low_r":5500,"post_exit_bar_close_r":0}]
- console calls/bytes: 16500 / 1219656
- base64 persist/innerHTML bytes: 125674200 / 0
- open/journal: 2/50
- frameSlopeFail=false persistFail=true

### Canonical repeat 2
- frame first/last median: 0.0127 → 0.0133 (ratio 1.055; limit ≤ 1.25)
- slope/1k: 0.0000 (frac of first 0.0008; limit ≤ 0.05)
- runtime bytes: 65901 → 706962 (abs limit 262144)
- session bytes: 65940 → 1752034 (abs limit 524288)
- steady growth runtime/session: 128081 / 337095
- paths a–e exercised: true
- panel invocations: 0; Fix-A bounded=true reconstruct=false; marker redraws: 206; journal rows visited: 5150
- Fix-B excursion max=5500 bounded=false unbounded=true (tailMax=256)
- excursion end: [{"id":1,"bar_close_r":5500,"bar_high_r":5500,"bar_low_r":5500,"post_exit_bar_close_r":0},{"id":2,"bar_close_r":5500,"bar_high_r":5500,"bar_low_r":5500,"post_exit_bar_close_r":0}]
- console calls/bytes: 16500 / 1219656
- base64 persist/innerHTML bytes: 125674200 / 0
- open/journal: 2/50
- frameSlopeFail=false persistFail=true

### Canonical repeat 3
- frame first/last median: 0.0125 → 0.0107 (ratio 0.849; limit ≤ 1.25)
- slope/1k: -0.0007 (frac of first -0.0526; limit ≤ 0.05)
- runtime bytes: 65901 → 706962 (abs limit 262144)
- session bytes: 65940 → 1752034 (abs limit 524288)
- steady growth runtime/session: 128081 / 337095
- paths a–e exercised: true
- panel invocations: 0; Fix-A bounded=true reconstruct=false; marker redraws: 206; journal rows visited: 5150
- Fix-B excursion max=5500 bounded=false unbounded=true (tailMax=256)
- excursion end: [{"id":1,"bar_close_r":5500,"bar_high_r":5500,"bar_low_r":5500,"post_exit_bar_close_r":0},{"id":2,"bar_close_r":5500,"bar_high_r":5500,"bar_low_r":5500,"post_exit_bar_close_r":0}]
- console calls/bytes: 16500 / 1219656
- base64 persist/innerHTML bytes: 125674200 / 0
- open/journal: 2/50
- frameSlopeFail=false persistFail=true

## Neighbor state matrix

| Cell | Result |
|---|---|
| neighbor-single-playing | ratio=0.929 slopeFrac=0.018 persistFail=true |
| neighbor-single-paused | ratio=1.011 slopeFrac=0.072 persistFail=true |
| neighbor-multichart-host+projected-playing | ratio=0.870 slopeFrac=-0.010 persistFail=true |
| neighbor-multichart-host+projected-paused | ratio=0.846 slopeFrac=-0.041 persistFail=true |
| session-restore-legacy-uncapped | RESTORE-PASS |
| multichart-restore-legacy-uncapped | RESTORE-PASS |

## Persisted-format hash (today)

`f97f31979c760260998bd9d45863ee071c67aee4fe14c65dbe0c1522de370976`

## Evidence

- JSON: `docs\plan3\evidence\L2-M19-fix-b-excursion-tail-kill.json`
- Report: `docs\plan3\worker-reports\L2-M19-FIX-B-EXCURSION-TAIL-KILL.md`
- Fixture: `chart v 1.4/chart/modules/m19-legacy-uncapped-session.fixture.json`
- Fix B contract: `chart v 1.4/chart/modules/m19-excursion-tail-contract.test.mjs`

## Switches

(a) PANEL_DIRTY — held from Fix A. (b) EXCURSION_TAIL — this run. (c)–(e) untouched / not claimed GREEN.

## Binding

I1/I2/I3/I5/I8/I10/I14/I16 · P1/P2/P3 · D-030 binds (b)/(c).
