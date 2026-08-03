# E to C: Soak Readback Stall Handoff

Timestamp: 2026-08-03T13:51:00+01:00

## Verdict

`UNBOUNDED-READBACK-PARKS-NODE` is a proven mechanism, not proof of the lost V8 incident.

The no-browser V8 self-test reproduced the old shape: a hanging readback leaves node alive while no heartbeat or sample advances. The bounded version exits with a named state, `HEARTBEAT_KEEPALIVE_TIMEOUT`.

Self-test evidence: `node --test scripts/v8-monotone-heap-diff.selftest.mjs`, PASS 2/2 at 2026-08-03T12:48:49Z / 2026-08-03T13:48:49+01:00.

## E Call Shape

Old V8 heartbeat shape:

```js
await keepConf01Playing(page, SPEED);
await readPlayheadSnapshot(page);
save(report);
```

If either awaited call never resolves, the process remains alive and the artifact stops moving. That is exactly the failure class the self-test reproduces.

Current bounded pattern:

```js
const keepPlaying = await withTimeout(
  keepAlive(page, SPEED),
  keepTimeoutMs,
  'heartbeat.keepConf01Playing',
);

const playhead = await withTimeout(
  readPlayhead(page),
  playheadTimeoutMs,
  'heartbeat.readPlayheadSnapshot',
);
```

Named timeout states are written into the report before the run continues: `HEARTBEAT_KEEPALIVE_TIMEOUT` and `HEARTBEAT_PLAYHEAD_TIMEOUT`.

## C Soak Analogue

`scripts/sealed-two-arm-soak.mjs` has the same risk class in its ten-hour sample loop. The suspect calls are not wrong by themselves; the risk is that they are awaited without a deadline inside a long run:

- `readPanels(session.page)`
- `measureBlocking(session.page.mainFrame(), 20000)`
- `measureFrameRate(session.page.mainFrame(), 3000)`
- `readFootprint(session.browser)`
- `readArenaColumns(session.browser, ...)`
- `readEffectiveRateReadback(session.page)`
- `readLoafCensus(session.page)`
- `readOldestOpenPositionAge(session.page)`
- `forcedGcPauseProbe(...)`
- `offlineToggle(...)`

## Pattern to Carry

Wrap every per-sample readback/probe in a bounded timeout with a phase name, save a named sample/phase state before the await and on timeout, and keep emitting `PHASE_OVERDUE` for phases that exceed expected duration plus margin.

The soak should treat a timeout as a named instrument state, not as a silent hang and not as a clean pass. A parked node at hour four must be distinguishable from a healthy run before hour ten.
