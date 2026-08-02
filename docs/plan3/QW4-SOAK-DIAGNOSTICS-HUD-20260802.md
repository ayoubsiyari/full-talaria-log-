# QW-4 Soak Diagnostics HUD — 2026-08-02

## Verdict
PASSED.

QW-4 adds a default-off soak diagnostics HUD behind `window.__TALARIA_QW4_SOAK_HUD_V1 === true`. When the switch is absent or false, the constructor returns before creating DOM, timers, or rAF sampling.

## Visible Metrics
- Effective bars/s from `window.__talariaEffectiveRate`.
- Target bars/s and governor detail from `window.__talariaSpeedGov`.
- Rate-hold drift from the first non-zero effective rate baseline, with the STOPWATCH-01 5% boundary exposed live.
- Renderer footprint via `performance.memory.usedJSHeapSize` when available.
- Frame interval from a bounded rAF sampler active only while the HUD switch remains true.
- Replay restore-catch counts from `window.__talariaReplayRestoreCatchCounts`.

The same data is also published as `window.__talariaQw4SoakHudSnapshot` for harness read-back.

## Mirror Proof
`chart v 1.4/chart/chart.js` and `homepage/public/chart/chart.js` are byte-identical after the QW-4 change.

## Verification
- `npm run test:qw4-soak-diagnostics-hud` PASS 4/4.
- `node --check "chart v 1.4/chart/chart.js"` PASS.
- `node --check "homepage/public/chart/chart.js"` PASS.
