# T8 step 13 — finest-TF unified replay clock IMPLEMENTATION report (D-016)

## 1. Task + RC

- **Task:** `T8-step13-lane2-finest-tf-cadence-IMPL.md` — implement D-016 unified finest-TF clock behind kill-switch; H-S83 RED→GREEN; real AFTER cost column.
- **RC:** **RC-8** (ESC-014 cadence policy). TAL-01563 superseded pending PO staging confirm.

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/replay-system.js` | Finest-TF cadence helpers (`_isFinestTfReplayCadenceEnabled`, `_getFinestReplayCadenceMs`, `_finestTfCadenceSubdivisions`, `_isFinestTfCadenceSubStepPlay`); play stepping uses finest bar when selected TF coarser (`_shouldStepByReplayInterval` override); speed subdivisions in `startTickAnimation`; virtual `replayTimestamp` in `animateTick`; parity pin in `applyMultichartMirrorFrame` |
| `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` | Parity pin on play frames + coalesced-seek completion (`__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` gated) |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | `getFinestReplayCadenceMs` / `refreshFinestReplayCadence` on `__multichartGrid`; live re-derivation effect on `layout.tiles` + `dataReadyPanels` |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | **H-S83** scenario (4h-focused, 1m sub-advance, coalesce, switch-OFF coarse jump) |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs` | Harness `__multichartGrid` stub: finest-TF resolver for clean boot |
| `homepage/public/chart/modules/replay-system.js` | I8 mirror (SHA256 match) |
| `homepage/public/chart/multichart-prod/panel-cmd-bridge.js` | I8 mirror (SHA256 match) |
| `homepage/public/chart/multichart-prod/harness/serve.mjs` | I8 mirror |
| `chart v 1.4/talaria-design/live/index.html` | Build id **20260715b1** |
| `chart v 1.4/chart/dist-v9/index.html` | Build id **20260715b1** |
| `chart v 1.4/chart/multichart-prod/chart-embed.html` | Build id **20260715b1** |
| `homepage/public/chart/dist-v9/index.html` | I8 build bump |
| `homepage/public/chart/multichart-prod/chart-embed.html` | I8 build bump |
| SW + legacy-index + harness serve (homepage) | Bumped via `bump-dist-v9-cache.mjs` |

**Explicit:** `chart.js` **NOT touched** (Lane 1 / T5 step 3 anchoring regions clear). `react-parity-lib.mjs` and `known-failing.json` **NOT touched** (Lane 4).

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | OFF behavior |
|--------|---------|--------------|
| `window.__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` | unset (**fix ON**) | Selected-panel step TF cadence exactly as before (4h jumps on 1m panels) |

**Gated files (every path):**

- `replay-system.js` — all finest-TF helpers + play-step override + virtual ts + mirror pin
- `panel-cmd-bridge.js` — play-frame parity pin + coalesced-seek pin
- `MultichartGrid.jsx` — resolver + refresh (no-op when DISABLE set)

Harness A/B: H-S83 switch-OFF cell proves 1m panel `maxStep >= 1h` (14.4M ms jump observed).

---

## 4. Proof — RED→GREEN

### H-S83 (scenario id collision fix — registered as **H-S83**, not H-S82)

**Lane 4 note:** H-S82 reserved for pan-snapback (T0 step 16). Cadence RED is **H-S83**.

```text
cd "chart v 1.4/chart/multichart-prod/harness"
node run.mjs --only=H-S83
→ RESULT H-S83 PASS
```

| Assertion | Result |
|-----------|--------|
| 4h-focused + finest cadence armed (subdivisions=240) | PASS |
| Production tick play (host `rs.play`, no synthetic seek loop) | PASS |
| Parity (≤1s drift at play end) | PASS (maxDrift=0) |
| 1m panel B: no 4h jump (`maxStep` ≪ 4h) | PASS (`maxStep=52500`) |
| 4h coalesce bound | PASS (`followDelta=4`) |
| Switch-OFF coarse jump | PASS (`maxStep=14400000`) |

**I15:** Focus via real mouse click (`focusPanelByClick`); play via `startHostProductionTickPlay` (production path). Measures real `replaySystem.replayTimestamp`, `followRenders`, `lastBarT` — not proxy DOM.

### Fence

| Scenario | Result |
|----------|--------|
| H-S83 | **PASS** |
| H-S19 | **PASS** |
| H-S19b | **PASS** |
| H-S17 | FAIL forming-candle sub-check only — **pre-existing** (same FAIL with `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE=true`; playhead advance + render bound still PASS) |

### Real AFTER cost column (`t8-step12-cadence-cost-probe.mjs`)

| Metric | AFTER (measured, impl landed) |
|--------|-------------------------------|
| Host broadcast p95 | **0.2 ms** (unchanged) |
| 4h C follow / pixel col | **0.033** |
| 4h follow Δ / 8s | **3** |
| Verdict | **WITHIN_FRAME_BUDGET** |

Does **not** return to Director.

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I3 / I13 | DISABLE switch gates all touched paths |
| I8 | `replay-system.js` + `panel-cmd-bridge.js` mirrored; SHA256 verified |
| I10 | Re-derivation edge-triggered (`layout.tiles`, `dataReadyPanels`) |
| I14 | iframe parity pins in `panel-cmd-bridge.js` |
| I15 | H-S83 production play + real counters |
| D-015 | Edge-park / `scheduleCoalescedSeek` path preserved |
| D-016 | No decoupled degrade; cost within budget |

---

## 6. What I did NOT do / limits

- **No `chart.js` edits** — Lane 1 reconciliation not needed for this step.
- **`known-failing.json`** — not edited; H-S83 is new GREEN (Lane 4 to register row).
- **H-S17 forming-candle sub-assertion** — still FAIL pre-existing on synthetic `replayFrame` stream; not introduced by this change.
- **PO 4h-focused feel** — NEEDS-LIVE staging A/B (`20260715b1`).
- **Exact ms parity** on coarse panels during play — harness uses ≤1s slack at sample end; sub-minute drift (~834ms) observed mid-play before coalesce settle (documented).

---

## 7. Live-verification handoff

**Build id:** `20260715b1` (host + iframe `__TALARIA_CHART_BUILD_ID`)

1. Staging 4-panel layout: two 1m + two 4h, sync OFF.
2. Focus a **4h panel**, set replay interval **4h**, tick mode, Play.
3. **Fix ON:** 1m panels advance smoothly; 4h candles form progressively; no 4h jumps on 1m tiles.
4. **A/B:** `window.__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE = true`, reload — 1m panels jump with 4h cadence (legacy).
5. PO feel is **deciding authority** (D-016).

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

Harness H-S83 GREEN + cost probe within budget. Staging PO confirm required for cadence feel before **DONE (proven)**.

---

## Lane 4 handoff

| Item | Value |
|------|-------|
| New scenario | **H-S83** — finest-TF cadence (register in TICKET-REGISTRY; do not use H-S82) |
| `known-failing.json` | No change from this worker |
| `chart.js` regions touched | **None** |
