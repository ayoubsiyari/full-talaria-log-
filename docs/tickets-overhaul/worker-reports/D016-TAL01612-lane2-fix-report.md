# Lane 2 — D-016 cadence + TAL-01612 residual fix report

## 1. Task + RC

- **Task:** Lane 2 on baseline `20260717b16` — complete D-016 finest-TF candle cadence + TAL-01612 interval-owner residual (RED-first per D-023).
- **RC:** D-016 coarse-main replay cadence (H-S83 / MC-STEPFWD family) + TAL-01612 stale `#replayTimeframe` driving `calculateNextIndex()`.

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/replay-system.js` | Fix 1: finest-TF candle cadence V1 (`__TALARIA_DISABLE_FINEST_TF_CANDLE_CADENCE_V1`), step-forward V1 (`__TALARIA_DISABLE_FINEST_TF_STEP_FORWARD_CADENCE_V1`), `_advanceCoarseLegacyCandleBucket()`, sub-bar bypass, `_getLocalRawBarPeriodMs()`, time-anchored `calculateNextIndex()`. Fix 2: interval owner V1 (`__TALARIA_DISABLE_REPLAY_INTERVAL_OWNER_V1`) in `_resolveReplayStepTimeframe()`. |
| `homepage/public/chart/modules/replay-system.js` | Mirror of replay-system changes (P-invariant). |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | Added **H-S83b** (host A=4h, peer B=1m, tick+candle ON, candle V1 switch-OFF bucket A/B) and **H-S84** (stale hidden `1w`, owner fix ON/OFF). Host before/after play ts for switch-OFF play leg. |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs` | Build id → **20260717b42**. |
| `chart v 1.4/chart/multichart-prod/chart-embed.html` | Cache bust → **20260717b42**. |
| `homepage/public/chart/multichart-prod/harness/serve.mjs` | Build id mirror → **20260717b42**. |
| `homepage/public/chart/multichart-prod/chart-embed.html` | Cache bust mirror → **20260717b42**. |

**Deferred (A6-4 one-phase-per-PR):** `MultichartGrid.jsx` step-forward hunk (~5572, ~3573) — replay-system path only in this lane.

No other files touched.

## 3. Kill-switch (I3 + I13)

| Switch | Default | Fix | Gated in |
|--------|---------|-----|----------|
| `__TALARIA_DISABLE_FINEST_TF_CANDLE_CADENCE_V1` | ON (unset/false) | Candle PLAY finest sub-step on coarse main | `replay-system.js` both trees |
| `__TALARIA_DISABLE_FINEST_TF_STEP_FORWARD_CADENCE_V1` | ON | Manual `stepForward()` finest sub-step (MC-STEPFWD) | `replay-system.js` both trees |
| `__TALARIA_DISABLE_REPLAY_INTERVAL_OWNER_V1` | ON | Auto/sync ignores stale hidden `#replayTimeframe` | `replay-system.js` both trees |

Switch OFF reverts each path to legacy behavior in both I8 trees. MultichartGrid step-forward routing not changed in this PR.

## 4. Proof — RED → GREEN

**Build:** `20260717b42`

**Commands:**
```bash
node "chart v 1.4/chart/multichart-prod/harness/run.mjs" --only=H-S83b,H-S84 --runs=3
```

**H-S83b RED (before):** switch-OFF candle V1 — `stepBars:1`, `delta:60000` (~1m), play `maxStep≈180000` (finest cadence leaked).

**H-S83b GREEN (after, 3/3):**
- Fix ON tick+candle legs: 1m peer sub-advance, no 4h jump.
- Switch-OFF bucket probe: `bucketOk:true`, `delta:14400000`, `idxDelta:240`.
- Switch-OFF play: `hostPlayTotal:47940000` (coarse multi-hour host advance).

**H-S84 RED (before):** stale hidden `1w` ignored when owner fix ON → single step multi-day when OFF.

**H-S84 GREEN (after, 3/3):**
- Fix ON: `delta:60000`, `resolved:1m`.
- Switch-OFF: `delta:47940000`, `resolved:1w`, `stepBars:10080`.

**Determinism:** H-S83b + H-S84 **3/3 PASS**.

**I15 actuation:** Production `rs.play()` + `replayPlay` broadcast; host replay enter via harness helpers; switch-OFF bucket probe uses host `replaySystem` directly (dev harness — measures host `replayTimestamp`, not toolbar proxy). Panel B iframe `replayTs` during coarse candle play may lag host until MultichartGrid step-forward ships — play leg asserts host `hostPlayTotal` coarse jump.

## 5. Invariants checked

- **I3/I13:** Each fix has its own kill-switch; OFF reverts in both replay-system mirrors.
- **I8:** Both `chart v 1.4` and `homepage/public/chart` replay-system updated.
- **D-023 RED-first:** H-S83b/H-S84 pinned before fix; GREEN after.
- **I15:** Host replay ts + production play actuation documented; peer B coarse play sync deferred to MultichartGrid phase.

## 6. What I did NOT do / limits

- **MultichartGrid.jsx** step-forward routing (A6-4 ship-gate) — staged for follow-on PR.
- Peer panel B `replayTs` during coarse candle **production play** may not mirror host until grid sync lands; harness uses host before/after ts for switch-OFF play attribution.
- Full default harness gate not re-run in this report cycle (lane-scoped `--only=H-S83b,H-S84 --runs=3`).

## 7. Live-verification handoff

1. Confirm build **20260717b42** in panel iframe (`window.__TALARIA_CHART_BUILD_ID`).
2. Multichart: host A display **4h**, peer B **1m**, replay enter, candle PLAY.
3. Fix ON (switches unset): B advances ~1m cadence during play.
4. Set `window.__TALARIA_DISABLE_FINEST_TF_CANDLE_CADENCE_V1 = true`, refresh cadence, candle PLAY: host steps ~4h buckets (legacy).
5. TAL-01612: hidden `#replayTimeframe` = `1w`, Auto interval, single step forward — should step ~1m with owner fix ON; multi-day leap with `__TALARIA_DISABLE_REPLAY_INTERVAL_OWNER_V1 = true`.

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

Harness proves replay-system fixes (H-S83b bucket + H-S84 owner). PO live confirm required for built-product multichart peer parity on coarse candle play after MultichartGrid step-forward lands.
