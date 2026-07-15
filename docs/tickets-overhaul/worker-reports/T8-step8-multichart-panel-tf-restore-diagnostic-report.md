# T8 step 8 — multichart panel TF-label desync on refresh (PLAN2-FOUND#6)

## 1. Task + RC

- **Task:** `T8-step8-lane2-multichart-panel-tf-restore-diagnostic.md` — READ-ONLY trace of PO staging **a4** multichart refresh (refined symptom): Panel A restores correctly; **Panel B data is correct 15m** but the **TF indicator/selector stays on `1m`** until Play (or similar resync). **Not a data-restore bug** — label/selector UI desync only.
- **RC:** **Tooling/diagnostic — no RC discharged.** Verdict: **pre-existing parent-shell TF-control hydration gap** — React topbar `tf` state and the focus-mirror path do not converge to the iframe engine’s applied TF on reload. Distinct from step-7 Track A (host replay playhead). Adjacent to **T3 row 13** (`chart_panel_state`) but row 13 owns **layout id only**, not TF-control sync.

---

## 2. What I changed — file by file

**No files touched.** READ-ONLY diagnostic per guardrails. `react-parity-lib.mjs` unchanged.

---

## 3. Kill-switch (I3 + I13)

N/A — diagnostic only, no product edits.

A future fix should gate the label-sync path (React parent shell), e.g. `window.__TALARIA_DISABLE_PANEL_TF_LABEL_SYNC_V2` (name TBD), default **ON**. No data-path kill-switch required if fix is label-only.

**I14 note:** if fix pushes TF via existing `runCommand('setTimeframe')` / `chart-state` mirror, stay on postMessage/panel-cmd surfaces only.

---

## 4. Proof — RED → GREEN

### Step 0 — Regression vs step-7 (mandatory)

| Check | Result |
|-------|--------|
| **PO refined symptom** | Data on B is **correct 15m** after refresh; only TF **control/label** stuck at `1m`. Play “snaps fully correct.” |
| **Step-7 scope** | `chart.js`, `replay-system.js`, harness only — **no** edits to `TalariaV8bLive.jsx` TF state, `MultichartGrid.jsx` focus mirror, or iframe `sync-bridge` `chart-state`. |
| **Consistency with PO** | Step-7 host playhead restore can make **Play** resync more visible; it does **not** explain label-only desync while data is already 15m. **Unrelated to root cause.** |
| **T3 row 13 (H-S51)** | Asserts **layout count** after refresh only — no TF-control assertion. |

**Verdict: PRE-EXISTING — not step-7 regression.** PO reported on a4 staging cut; mechanism predates step-7.

---

### TF-control state map (what drives the label)

Two UI surfaces can show TF; PO “selector” maps to the **parent V9 topbar pills** when a panel is focused.

| Surface | State source | Updated when |
|---------|--------------|--------------|
| **Parent V9 topbar TF pills** (`data-tf`, React `tf`) | `useState` default **`"1m"`** (or `"1D"` if URL `mode=backtest`) — `TalariaV8bLive.jsx:11452–11458` | `setTf()` from: (1) `chartDataLoaded` on **host only** (`:12235–12243`), (2) `timeframeChanged` on **host only** (`:12605–12623`), (3) **`multichartFocusChanged`** from focus mirror (`:12674–12684`) |
| **Iframe engine truth** | `chart.currentTimeframe` + resampled `chart.data` | `embed-bridge` boot / `loadMultichartPanelFromHost` / mirror (`embed-bridge.js:406–410`, `chart.js:4707`) |
| **Focus-mirror cache** | `MultichartManager.charts.get(id).state.timeframe` | Seeded at `addChart` from URL `cfg.tf` (`multichart-manager.js:362`, `:471`); merged from iframe `chart-state` postMessage (`sync-bridge.js:1507–1510`, `multichart-manager.js:986–990`) |
| **Iframe OHLC `#chartTimeframe`** | `chart.updateChartOHLCSymbol` → `currentTimeframe` (`chart.js:18350–18362`) | `ensureEmbedOhlcLegend` in `afterLoad` (`embed-bridge.js:901–902`) — secondary; PO symptom targets topbar selector |

**Persisted on refresh:** `chart_panel_state` row 13 carries **`layout` only** (`TalariaV8bLive.jsx:14230–14246`, `:14344–14356`). No per-panel TF is hydrated into React `tf` or the focus mirror on boot. Legacy `panels[].timeframe` exists in `panel-managerv2.js:2426` but is **not read** by V9 `MultichartGrid` iframe spawn.

---

### Divergence point — applied 15m vs label `1m`

```
reload
  ├─ React tf ← default "1m" (never restored from panel B)     :11452–11458
  ├─ focusedPanelId ← "A" (default)                            :13826
  ├─ MultichartGrid addChart: manager.state.timeframe ← cfg.tf
  │     (host TF at stagger time, or fallback "1m")            :2381–2438
  ├─ iframe embed-bridge: engine loads / mirrors 15m bars      :1028–1127, chart.js:4707
  │     chart.currentTimeframe ← 15m on engine
  ├─ sync-bridge chart-state → manager cache (async)           :1507–1510
  │
  └─ GAP: parent listeners ignore iframe engine events
        chartDataLoaded / timeframeChanged filtered to window.chart only
        :12235–12237, :12605–12607
        Topbar stays "1m" until multichartFocusChanged OR host-side event
```

**Host-only filter (primary mechanism):**

```12235:12243:chart v 1.4/talaria-design/src/TalariaV8bLive.jsx
      if (v9IsMultiPanelLayoutActive()) {
        const active = v9ActiveChartInstance();
        if (src && active && src !== active) return;
      }
      // ...
      if (mappedTf && mappedTf !== lastMappedTf) {
        setTf(mappedTf);
      }
```

`v9ActiveChartInstance()` is **`window.chart` (host tile A) only** (`:1097–1098`). When Panel B’s iframe finishes loading 15m, its `chartDataLoaded` / `timeframeChanged` events **do not** update React `tf`.

**Intended iframe path — focus mirror:**

```3975:3988:chart v 1.4/talaria-design/src/MultichartGrid.jsx
    function dispatchFocusChanged(panelId, opts) {
        // ...
        const state = readPanelState(panelId);
        window.dispatchEvent(new CustomEvent("multichartFocusChanged", {
            detail: {
                panelId:   panelId,
                timeframe: state ? state.timeframe : null,
                // ...
            },
        }));
    }
```

`readPanelState(B)` reads **manager cache**, not `iframe.contentWindow.chart.currentTimeframe` (`:3952–3959`). On refresh:

1. Cache may still hold **`1m`** from early `addChart` seed if stagger boot ran before host TF settled (`effTf || "1m"` — `:2385`).
2. `dispatchFocusChanged` runs on focus change or `onState` **only when `id === focusedPanelId`** (`:4100–4103`). If B’s `chart-state` arrives while focus is still **A**, topbar is not updated for B.
3. User focuses B → mirror may publish **stale `1m`** from cache even though iframe engine is already **15m**.

**Result:** engine/data = 15m, topbar selector = `1m`. No data-path bug required.

---

### Why Play “fixes” it (label resync, not data repair)

PO confirms data is already correct before Play. Play updates the **parent label** via **host-side** events that bypass the iframe filter:

1. Play starts host `replaySystem` → host `chartDataLoaded` / `_emitTimeframeChanged` on **`window.chart`** (`chart.js:22717–22724`).
2. Parent `handleDataLoaded` / `handleTfChanged` accept **host** events (`TalariaV8bLive.jsx:12235–12243`, `:12605–12623`) → `setTf("15m")` → topbar pills match engine.
3. Parallel `replayEnter` / `replayTick` to iframes (`MultichartGrid.jsx:3121+`) may also refresh `chart-state`, which updates manager cache; if B is focused, `onState` → `dispatchFocusChanged` can reinforce the label.

**Post-Play label state:** expected **15m** on topbar (PO: “fully correct”). Data unchanged — only UI control catches up.

**If label stays wrong after Play:** that would contradict PO; code path above is the documented resync. PO live-confirm should note whether **only** topbar changes or iframe `#chartTimeframe` too.

---

### RC + fix recommendation

| Question | Answer |
|----------|--------|
| **Data-path change needed?** | **No** — PO confirmed 15m data is correct. Fix is **label/selector-state sync** only. |
| **Single bug?** | **Yes** — parent TF control not hydrated from iframe applied TF on reload. |
| **Track owner** | **T8 refresh-persistence (PLAN2-FOUND#6)** — TF-control hydration on multichart refresh. |
| **T3 row 13** | **Does not own this fix** (layout-only, TAL-01571). Optional: persist per-panel TF in `chart_panel_state` later; **not required** for label-only sync if mirror reads live engine TF. |
| **Low-risk fix sketch** | (1) When iframe `chart-state` carries `timeframe`, if that panel is focused → `dispatchFocusChanged` (already partial — ensure cache cannot stay below engine: compare `iframe.chart.currentTimeframe` on mismatch). (2) On multichart layout boot settle, if `focusedPanelId !== A`, force one focus mirror read from **live engine** via panel-cmd `getState` or post-boot `chart-state`. (3) Do **not** widen `chartDataLoaded` host filter blindly — use existing `multichartFocusChanged` contract. (4) Optional: hydrate React `tf` from `chart_panel_state.panels[]` on mount (persistence — separate scope). |
| **Director call?** | **Not required** for label-only sync scoped to T8. Blob extension is optional hardening. |

---

### Proposed RED scenario

**H-S80 (new) — `multichart-panel-tf-label-restore` (PLAN2-FOUND#6, label-only)**

| Step | Action |
|------|--------|
| Setup | 2v, same pair, interval sync **OFF**, set **B** to **15m** via real panel focus + `setTimeframe` panel-cmd. |
| Act | Full page reload (built dist-v9; build id in Panel B iframe). |
| Assert pre-Play | (1) B iframe `chart.currentTimeframe === '15m'`. (2) B bar spacing / `parseTimeframe` effective period === 15m (data proxy). (3) Parent topbar active `[data-tf]` **=== `15m`** when B focused. **FAIL today** on (3) with (1–2) passing. |
| Assert post-Play (optional cell) | After host Play, topbar still `15m` (confirms resync path). |
| Switch-OFF | `__TALARIA_DISABLE_PANEL_TF_LABEL_SYNC_V2` (TBD) → post-refresh label RED, engine GREEN. |

**I15:** assert engine TF via iframe `chart.currentTimeframe`; assert label via parent DOM `[data-tf].tc-pill-act` (or equivalent active pill) — **not** toolbar shell presence alone.

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| READ-ONLY guardrail | No product/harness edits. |
| I14 | Mechanism uses existing `chart-state` / `multichartFocusChanged` / panel-cmd — no new bridge type proposed. |
| D-008 row 13 | Confirmed out of scope for TF-label fix. |
| D-010 | Diagnostic only — no proven/green claims. |

---

## 6. What I did NOT do / limits

- No live repro on staging a4 (code-path trace only).
- Did not verify whether PO meant iframe `#chartTimeframe` vs parent topbar (mechanism covers both; primary selector = parent pills).
- Did not confirm exact post-Play label state in DevTools (PO verbal confirm relied on).
- Initial PO “wrong data window” report **superseded** by refined follow-up — removed from this scoped diagnostic.
- No harness run — RED proposed only.

---

## 7. Live-verification handoff

**Build:** `20260715a4` (`window.__TALARIA_CHART_BUILD_ID` in host and Panel B iframe).

1. 2v, same symbol, both **15m**, interval sync **OFF**.
2. Hard refresh.
3. Click **Panel B**.
4. **Before Play:** confirm candles are 15m (spacing); check parent topbar TF pill — expect **`1m` stuck** (bug).
5. DevTools: B iframe `chart.currentTimeframe` → expect **`15m`**; parent `document.querySelector('[data-tf].tc-pill-act')` or topbar label → expect **`1m`** mismatch.
6. Press **Play** — expect topbar snaps to **`15m`** while data unchanged.

---

## 8. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)**

**Track verdict:** **T8 refresh-persistence (PLAN2-FOUND#6)** — label/selector hydration on multichart reload. **T3 row 13 / TAL-01571** does not own this (layout-only). **No data-path change required.**
