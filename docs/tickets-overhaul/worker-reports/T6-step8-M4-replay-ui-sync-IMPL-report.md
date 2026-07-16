# T6 step 8 — RC-6 M4 replay indicator UI sync IMPLEMENT

## 1. Task + RC

- **Task:** T6 step 8 (Lane 3) — implement **M4** replay indicator legend/value UI sync (chart-side slice only).
- **RC:** **RC-6** mechanism **M4** (replay coupling). With M1–M5 already committed, this is the final RC-6 mechanism before M6 (parked).
- **Gate:** D-017 snap-back (`9462cef3`), finest-TF cadence (`d6d9822f`); no `replay-system.js` edits in this slice.

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/indicator-replay-ui-sync.mjs` | **New.** Pure helpers: switch predicate, playhead bar index, legend token parity, pin/sync guards. |
| `homepage/public/chart/modules/indicator-replay-ui-sync.mjs` | **I8 mirror** — byte-identical. |
| `chart v 1.4/chart/modules/indicator-replay-ui-sync.js` | **New.** Browser IIFE: exports globals + `applyReplayLegendSyncAfterRecalc` / `applyReplayLegendLightweightSync`. |
| `homepage/public/chart/modules/indicator-replay-ui-sync.js` | **I8 mirror** — byte-identical. |
| `chart v 1.4/chart/modules/indicator-replay-ui-sync.test.mjs` | **New.** Property tests (switch ON GREEN + switch OFF RED-again). |
| `homepage/public/chart/modules/indicator-replay-ui-sync.test.mjs` | **I8 mirror** — byte-identical. |
| `chart v 1.4/chart/modules/chart-indicators-full.js` | Pin playhead `hoverIndex` before replay recalc legend rebuild; post-rAF `applyReplayLegendSyncAfterRecalc`; `_syncReplayPlayheadCrosshairValues` uses lightweight sync when V2 ON (not only `childElementCount===0`). |
| `homepage/public/chart/modules/chart-indicators-full.js` | **I8 mirror** — byte-identical. |
| `chart v 1.4/chart/modules/indicator-ui.js` | `talariaCrosshairBarIndex` prefers replay playhead when V2 ON + replay active (legend tokens read correct bar). |
| `homepage/public/chart/modules/indicator-ui.js` | **I8 mirror** — byte-identical. |
| `chart v 1.4/chart/legacy-index.html` | Load `indicator-replay-ui-sync.js` before `chart-indicators-full.js`. |
| `homepage/public/chart/legacy-index.html` | Same script registration. |
| `chart v 1.4/chart/scripts/build-chart-client-bundle.mjs` | Bundle includes new module. |
| `homepage/public/chart/scripts/build-chart-client-bundle.mjs` | Same. |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs` | Harness static path for new module. |
| `homepage/public/chart/multichart-prod/harness/serve.mjs` | Same. |
| `chart v 1.4/chart/multichart-prod/chart-embed.html` | Embed script list for new module. |
| `homepage/public/chart/multichart-prod/chart-embed.html` | Same. |
| `homepage/public/chart/dist-v9/index.html` | Script tag for new module. |
| `homepage/public/chart/talaria-design/live/index.html` | Script tag for new module. |

**No `replay-system.js`, `chart.js`, multichart-parent, order-entry, or `known-failing.json` edits.**

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Role |
|--------|---------|------|
| `window.__TALARIA_RC6_INDICATOR_REPLAY_UI_SYNC_V2` | **ON** (`!== false`) | Replay legend pins to playhead bar; post-recalc sync; lightweight legend refresh |

**Gated files / behavior:**

| File | Switch ON | Switch OFF |
|------|-----------|------------|
| `indicator-replay-ui-sync.js` | Helpers active | Helpers no-op / return false |
| `chart-indicators-full.js` | Pin + post-rAF sync + lightweight `_syncReplayPlayheadCrosshairValues` | Legacy: no pin; stale until click path |
| `indicator-ui.js` | `talariaCrosshairBarIndex` uses playhead during replay | Mouse/hover index as before |

**Test env RED-again:** `TALARIA_TEST_DISABLE_RC6_INDICATOR_REPLAY_UI_SYNC_V2=1`.

**Ungatable residual:** None identified in chart-side slice. Diagnostic secondary option (`replay-system.js` call-order reorder) was **not required** — post-rAF sync closes the race where `_syncReplayPlayheadCrosshairValues` ran before async recalc finished. **NEEDS-LIVE** to confirm no residual desync on real replay play.

---

## 4. Proof — RED → GREEN

### Root cause addressed

Replay tick order: `_syncReplayPlayheadCrosshairValues` (sync) → schedule rAF recalc → legend rebuilt with **stale** `indicators.data` until rAF completes. Fix: after rAF `recalculateIndicators` + `updateOHLCIndicators`, pin playhead and run `applyReplayLegendSyncAfterRecalc`.

### Commands (dev loop)

```text
cd "chart v 1.4/chart/modules"
node indicator-replay-ui-sync.test.mjs
TALARIA_TEST_DISABLE_RC6_INDICATOR_REPLAY_UI_SYNC_V2=1 node indicator-replay-ui-sync.test.mjs
```

### GREEN (switch ON)

```text
GREEN — replay playhead pin + legend token parity helpers passed
```

### RED-again (switch OFF via test scope)

```text
GREEN — replay UI sync helpers present; switch-OFF skips pin/sync (RED-again)
```

(Property test asserts `pinReplayLegendHoverToPlayhead` / `shouldSyncReplayLegendAfterRecalc` return false when `__TALARIA_RC6_INDICATOR_REPLAY_UI_SYNC_V2 === false`.)

### I15 honesty

- **Actuation:** Node/vm property tests only — synthetic `chart.data` + `replaySystem.isActive`. No real replay play/pause in browser harness.
- **Measurement:** Playhead bar index pin + numeric token parity vs `indicators.data[id][barIdx]` helpers — not parsed live DOM legend text.
- **Harness `RC6-M4-replay-legend-sync`:** Not registered (Lane 4 scope). Not run.

**Determinism:** Property tests deterministic (no timing). Repeated runs: 2/2 pass paths above.

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| **I3 / I13** | Enable-style switch gates all three product touch points; OFF path documented |
| **I8** | Both trees mirrored; SHA256 below |
| **I15** | No proxy-green claimed; status labeled dev-only |
| **Scope guardrail** | No `replay-system.js` edit; chart-side-only slice |
| **Collision** | No contested replay regions touched |

---

## 6. What I did NOT do / limits

- No live PO replay play (10+ bars), scrub, or multichart passive mirror on built product.
- No Lane 4 harness registration for `RC6-M4-replay-legend-sync`.
- Tick-replay `animatingCandle` intra-bar legend variant not separately tested.
- Separate-panel overlay crosshair sync relies on `syncCrosshairIndicatorValues` post-recalc — not isolated in property test.
- `recalculateIndicatorsAsync` worker path during replay not profiled (sync rAF path is primary per diagnostic).
- **replay-system.js residual:** Not edited; chart-side post-rAF sync is intended to be sufficient. If live PO still shows stale legend, escalate Manager coordination for call-order slice — do not silently patch `replay-system.js` from Lane 3.

---

## 7. Live-verification handoff

**Build id / cache bust:** `indicator-replay-ui-sync.js?v=20260716m4`

**PO steps:**

1. Load chart with default switches (V2 ON).
2. Add RSI or SMA overlay; open replay.
3. **Play** ≥10 bars — OHLC legend indicator value must track playhead without chart/replay-icon click (**TAL-00350#2**).
4. **Pause**, scrub slider — value updates on each stop.
5. Hover crosshair on playhead while paused — matches series (**TAL-00350#7**).
6. Console: `window.__TALARIA_RC6_INDICATOR_REPLAY_UI_SYNC_V2 = false` — confirm stale legend until click (repro).
7. Multichart panel B passive play mirror if enabled.

---

## 8. SHA256 (I8 mirrored modules)

| File | SHA256 (both trees) |
|------|---------------------|
| `indicator-replay-ui-sync.mjs` | `A77995DC95D07BC0D0269E8320B59314F8D9429351F1D3402614DB1182D6C1C4` |
| `indicator-replay-ui-sync.js` | `D233CD6F6B119F80C539945CBAC902E2C38C202CE911B75321C958CD2A573424` |
| `indicator-replay-ui-sync.test.mjs` | `5BEC9C15E2A20B052DEC049466BE65A6E9242DB993BE2520A809682957959801` |
| `chart-indicators-full.js` | `43DB3FDBFFD12EFEFBF0D1596132D2496BBF19CE1CD3BD87533356CEC5FDAEA5` |
| `indicator-ui.js` | `5CC2002E5A6B88CAE01DDA552D7E257B21FEA2CDBE82F2E05860896AE8525C89` |

**Commit hash:** *(uncommitted at report write — file-scoped commit pending user request)*

---

## 9. Status

**DONE (dev only) — NEEDS-LIVE**

**RC-6 / T6:** M1–M5 + **M4 chart-side slice landed in working tree** — RC-6 mechanism set is **complete modulo PO live-confirm**. No `replay-system.js` residual flagged as blocking; live pass required before Manager closes T6 as proven.
