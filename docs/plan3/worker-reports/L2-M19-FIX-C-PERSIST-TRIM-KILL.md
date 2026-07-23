# L2-M19 — Fix C persist trim (KILL)

**Verdict:** FIX-C-KILL-RED — kill restores B-era hot payloads; persist bound fail 3/3; endSession=1123730

**Persist:** M19-PERSIST-KILL-RED

**Scope:** Fix C hot session/runtime trim on Fix B checkpoint `5c9d0fbd1`. Kill `__TALARIA_DISABLE_M19_PERSIST_TRIM_V1`. No D/E. Not a live I15 UI verdict.

## Commands / runtime

```
node "chart v 1.4/chart/modules/m19-progressive-session-soak.test.mjs"
TALARIA_DISABLE_M19_PERSIST_TRIM_V1=1 node "chart v 1.4/chart/modules/m19-progressive-session-soak.test.mjs"
node --test --test-concurrency=1 "chart v 1.4/chart/modules/m19-persist-trim-contract.test.mjs"
node --test --test-concurrency=1 "chart v 1.4/chart/modules/m19-excursion-tail-contract.test.mjs"
node "chart v 1.4/chart/modules/order-runtime-persist.test.mjs"
```

- startedAt (wall): 2026-07-23T08:55:02.307Z
- finishedAt (wall): 2026-07-23T08:55:07.893Z
- elapsedMs: 5434
- HEAD: `5c9d0fbd1a84ae5bb056700e5e3e5b7cf5b4776b`
- SHA-256 order-manager.js: `69b37910488947602f5157fcd80f2d9fa897f36864f0fb72081c0076db348617`
- SHA-256 replay-system.js: `075c89220377c01a2500dd24ebe08aea2a754d61a5720c11a4913a7a60da091e`
- SHA-256 chart.js: `f2a4c4de2aa9f3f32ae4afd57cea307560e43fc4b4e4315fde728e034fac353a`

## Live symbol anchors (verified)

```json
{
  "order-manager.js:updatePositions": 29769,
  "order-manager.js:updatePositions→updatePositionsPanel": null,
  "order-manager.js:updatePositions→scheduleRuntimePanel": 30663,
  "order-manager.js:updatePositionsPanel": 43217,
  "order-manager.js:_updatePositionsPanelRuntimeOnly": 30825,
  "order-manager.js:_appendExcursionSnapshot": 4167,
  "order-manager.js:persistJournal": 5350,
  "order-manager.js:_buildRuntimeOrderPersistPatch": 6468,
  "order-manager.js:_redrawClosedJournalTradeMarkers": 37525,
  "order-manager.js:_redrawJournalMarkersForReplayPlayhead": 37593,
  "order-manager.js:hotpath-console-updatePositions": 30654,
  "order-manager.js:hotpath-console-updatePositionsPanel": 43232,
  "replay-system.js:updatePositions#1": [
    3805,
    5430,
    5873,
    7197,
    8369
  ],
  "chart.js:flushSessionStateSave": 12603
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
- frame first/last median: 0.0313 → 0.0276 (ratio 0.882; limit ≤ 1.25)
- slope/1k: -0.0011 (frac of first -0.0367; limit ≤ 0.05)
- runtime bytes: 66279 → 67810 (abs limit 262144)
- session bytes: 66318 → 1123730 (abs limit 524288)
- steady growth runtime/session: -15 / 211177
- paths a–e exercised: true
- panel invocations: 0; Fix-A bounded=true reconstruct=false; marker redraws: 206; journal rows visited: 5150
- Fix-B excursion max=256 bounded=true unbounded=false (tailMax=256)
- excursion end: [{"id":1,"bar_close_r":256,"bar_high_r":256,"bar_low_r":256,"post_exit_bar_close_r":0},{"id":2,"bar_close_r":256,"bar_high_r":256,"bar_low_r":256,"post_exit_bar_close_r":0}]
- console calls/bytes: 16500 / 1219656
- base64 persist/innerHTML bytes: 125674200 / 0
- open/journal: 2/50
- frameSlopeFail=false persistFail=true

### Canonical repeat 2
- frame first/last median: 0.0277 → 0.0259 (ratio 0.937; limit ≤ 1.25)
- slope/1k: -0.0009 (frac of first -0.0336; limit ≤ 0.05)
- runtime bytes: 66279 → 67810 (abs limit 262144)
- session bytes: 66318 → 1123730 (abs limit 524288)
- steady growth runtime/session: -15 / 211177
- paths a–e exercised: true
- panel invocations: 0; Fix-A bounded=true reconstruct=false; marker redraws: 206; journal rows visited: 5150
- Fix-B excursion max=256 bounded=true unbounded=false (tailMax=256)
- excursion end: [{"id":1,"bar_close_r":256,"bar_high_r":256,"bar_low_r":256,"post_exit_bar_close_r":0},{"id":2,"bar_close_r":256,"bar_high_r":256,"bar_low_r":256,"post_exit_bar_close_r":0}]
- console calls/bytes: 16500 / 1219656
- base64 persist/innerHTML bytes: 125674200 / 0
- open/journal: 2/50
- frameSlopeFail=false persistFail=true

### Canonical repeat 3
- frame first/last median: 0.0255 → 0.0268 (ratio 1.051; limit ≤ 1.25)
- slope/1k: 0.0023 (frac of first 0.0910; limit ≤ 0.05)
- runtime bytes: 66279 → 67810 (abs limit 262144)
- session bytes: 66318 → 1123730 (abs limit 524288)
- steady growth runtime/session: -15 / 211177
- paths a–e exercised: true
- panel invocations: 0; Fix-A bounded=true reconstruct=false; marker redraws: 206; journal rows visited: 5150
- Fix-B excursion max=256 bounded=true unbounded=false (tailMax=256)
- excursion end: [{"id":1,"bar_close_r":256,"bar_high_r":256,"bar_low_r":256,"post_exit_bar_close_r":0},{"id":2,"bar_close_r":256,"bar_high_r":256,"bar_low_r":256,"post_exit_bar_close_r":0}]
- console calls/bytes: 16500 / 1219656
- base64 persist/innerHTML bytes: 125674200 / 0
- open/journal: 2/50
- frameSlopeFail=true persistFail=true

## Neighbor state matrix

| Cell | Result |
|---|---|
| neighbor-single-playing | ratio=1.535 slopeFrac=0.070 persistFail=true |
| neighbor-single-paused | ratio=0.617 slopeFrac=-0.015 persistFail=true |
| neighbor-multichart-host+projected-playing | ratio=0.987 slopeFrac=0.001 persistFail=true |
| neighbor-multichart-host+projected-paused | ratio=0.914 slopeFrac=-0.037 persistFail=true |
| session-restore-legacy-uncapped | RESTORE-PASS |
| multichart-restore-legacy-uncapped | RESTORE-PASS |

## Persisted-format hash (today)

`f97f31979c760260998bd9d45863ee071c67aee4fe14c65dbe0c1522de370976`

## Evidence

- JSON: `docs\plan3\evidence\L2-M19-fix-c-persist-trim-kill.json`
- Report: `docs\plan3\worker-reports\L2-M19-FIX-C-PERSIST-TRIM-KILL.md`
- Fixture: `chart v 1.4/chart/modules/m19-legacy-uncapped-session.fixture.json`
- Fix B contract: `chart v 1.4/chart/modules/m19-excursion-tail-contract.test.mjs`

## Switches

(a) PANEL_DIRTY — held from Fix A. (b) EXCURSION_TAIL — held from Fix B. (c) PERSIST_TRIM — this run. (d)–(e) untouched.

## Binding

I1/I2/I3/I5/I8/I10/I14/I16 · P1/P2/P3 · D-030 binds (b)/(c).
