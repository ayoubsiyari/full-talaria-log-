# T1 Step 13 — Duplicate toolbar + V9 quick-bar gear fix

## 1. Task + RC

- **Task:** T1 step 13 — step-12 regression: two toolbars on select (old engine floating + V9 quick-bar); only old gear opened settings. Fix = exactly one toolbar (V9 quick-bar), its gear opens parent settings; no legacy bar surfaced.
- **RC:** RC-1 (multichart selection / quick-settings routing).

### L1 / PO scope confirmation (b7 live-confirm context)

| Question | Answer |
|----------|--------|
| **Build** | Manager bumped **`20260712b7`** (from `20260713b6`) bundling **T1 step 12** + **TAL-01564** reload hygiene. PO live-confirm on b7 **failed** (duplicate toolbar — `evidence/b7-double-toolbar-gear.png`). |
| **Where double toolbar reproduces** | **Single chart** — evidence is full-screen **EURUSD 1m** (one chart, not a 2×2 grid). **Iframe panel** — step-12 `_invokeIframeToolbarOrigShow` path also surfaced legacy `#drawing-toolbar` there. **Host tile A** — same hooked `tb.show` + missing skip as single chart (no separate third mechanism). |

**TAL-01564 (reload prompt):** separate subsystem; **independently confirmable on b7**. Harness **H-S22 PASS** on current tree (`20260712b8` deployed id in stub) including dismiss + no re-nag sub-checks. PO live on b7: mismatch toast once → × → no re-nag same session; Reload → no immediate re-toast when versions match.

---

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | **Reverted step-12 surfacing:** removed `_invokeIframeToolbarOrigShow` / rAF `#tb-settings` rescue; selection uses hooked `toolbar.show` only. After show in iframe+fix-ON, force-hide legacy DOM (`visible=false`, `display=none`). Emit `talaria:v9-quickbar-gear-ready` for harness settle. Restored `deselectAll` toolbar hide. |
| `homepage/public/chart/modules/drawing-tools-manager.js` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/modules/drawing-toolbar.js` | `_shouldSuppressLegacyToolbarShow()` — never paint legacy bar when V9 owns UI (multichart grid, iframe embed, or `__v9OpenDrawingSettings`). Early return in `show()` keeps `#drawing-toolbar` hidden. |
| `homepage/public/chart/modules/drawing-toolbar.js` | Byte-identical mirror (I8). |
| `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` | **Root fix:** `v9ShouldSkipLegacyDrawingToolbarShow()` always skips `origShow` when parent has `__multichartGrid` or V9 chrome active (fixes step-12 `return !fixEnabled` bug). Removed `v9PreserveIframeEngineToolbarOnHide`. `v9OpenQuickBarSettingsViaEditDrawing` routes via `grid.openDrawingSettingsForPanel(panelId, …)` (correct panel, not cross-frame `dm.editDrawing`). Added `id` / `data-v9-tl-btn` on quick-bar gear; `id="v9-tl-bar"`. |
| `chart v 1.4/chart/multichart-prod/harness/t1-step13-duplicate-toolbar-gear-proof.mjs` | Proof: 10× iframe panel B + 10× single chart; one toolbar; parent `#tl-sett` gear → settings; settle on `talaria:v9-quickbar-gear-ready` / DOM poll. |

**No other files touched.** Build id not bumped (Manager coordinates).

### Root cause (why step 12 duplicated the bar)

Step 12 called `__v9OrigShow` (`_invokeIframeToolbarOrigShow`) to make `#tb-settings` clickable, and `v9ShouldSkipLegacyDrawingToolbarShow()` returned **`false` when fix ON** inside iframe (`return !v9QuickBarPanelSettingsFixEnabled()`), so hooked `tb.show` still invoked `origShow` → legacy engine toolbar painted **alongside** the V9 quick-bar. Step-12 proof asserted gear-opens-settings on `#tb-settings`, not “exactly one toolbar.”

---

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` — **default ON** (unset/false = fix active).
- **Gated files (switch OFF reverts in each):**
  - `drawing-tools-manager.js` (both trees): no iframe force-hide, no `talaria:v9-quickbar-gear-ready`; legacy show path returns.
  - `drawing-toolbar.js` (both trees): `_shouldSuppressLegacyToolbarShow()` returns false when switch set; `show()` paints legacy bar again.
  - `TalariaV8bLive.jsx`: `v9QuickBarPanelSettingsFixEnabled()` false → old skip/gear routing; `v9OpenQuickBarSettingsViaEditDrawing` no-op.

---

## 4. Proof — RED → GREEN

### Commands

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
$env:T1_STEP13_MC_URL='http://127.0.0.1:5175/pricing/?devMultichart=2v&mode=backtest'
$env:T1_STEP13_SINGLE_URL='http://127.0.0.1:5175/pricing/?mode=backtest'
$env:T1_STEP13_RUNS='10'
node t1-step13-duplicate-toolbar-gear-proof.mjs
```

### GREEN — default ON, 20/20 determinism

```
iframe run 1/10: PASS (signal=dom-poll)
...
iframe run 10/10: PASS (signal=dom-poll)
single run 1/10: PASS (signal=cached)
...
single run 10/10: PASS (signal=cached)
T1 step13 duplicate-toolbar gear: 20/20 (default ON, modes=iframe,single)
```

- **One toolbar:** iframe legacy `#drawing-toolbar` not visible; parent `[data-tlbar="1"]` + `#tl-sett` visible.
- **Gear:** parent V9 `#tl-sett` click → parent settings open (probe + style/trend line text).
- **Settle:** `talaria:v9-quickbar-gear-ready` / DOM poll — no fixed sleep.

### RED again — switch OFF

```powershell
node t1-step13-duplicate-toolbar-gear-proof.mjs --mode=iframe --switch-off  # 0/3 — legacy toolbar visible (expected prior behavior)
```

### Gate (focused)

```
npm run test -- --only=H-S32,H-S33,H-S43,H-S44,H-S22 --runs=1
```

- PASS: H-S32, H-S33, H-S43, **H-S22** (TAL-01564 dismiss sub-checks)
- H-S44: **FAIL-REAL-BUG** (pre-existing tracked red; unchanged)

### TAL-01564 harness (independent of toolbar fix)

```
H-S22 TAL-01564: dismiss suppresses re-nag on second check() — returned=false dom=false
RESULT H-S22 PASS
```

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I1 RC-1 | V9 quick-bar gear → `openDrawingSettingsForPanel` / settings stay-open path |
| I2 RED first | Switch OFF shows legacy bar again; default ON 20/20 |
| I3 / I13 | All touched paths gated on same switch |
| I5 single chart | 10/10 single-chart mode — no legacy bar leak |
| I8 | SHA256 match both engine trees (below) |
| I9 gate | H-S44 tracked red unchanged |

---

## 6. What I did NOT do / limits

- Did not bump build id.
- Did not run full 29-scenario gate (focused subset only).
- Live PO re-test on deployed b7+step-13 bundle not executed here.
- Esc-after-open on panel-B settings still H-S44 tracked red.
- `build:live` + Docker PO path not run in this session (dev:live fast loop used; Manager workflow still applies for production React acceptance).

---

## 7. Live-verification handoff

After Manager deploys next build (step 13 + prior TAL-01564):

1. Hard-reload; confirm build id on host + every iframe (L1). Unregister SW if stale.
2. **Single chart:** place + select trendline → **one** floating bar (V9, blue accent) → gear opens settings → stays → Esc closes.
3. **2v multichart, panel B iframe:** same — no top legacy engine bar; bottom/parent-portaled V9 bar gear works.
4. **TAL-01564:** version mismatch toast → × → no re-nag; Reload → no loop when versions match.
5. Switch OFF smoke: legacy iframe behavior returns; multichart gear may be inert (step-12 prior).

---

## 8. Status

**DONE (proven)** — fast-loop 20/20 (10 iframe + 10 single); switch OFF RED; H-S22 TAL-01564 PASS; H-S44 tracked red unchanged. **NEEDS-LIVE-CONFIRM** on next deployed build id.

---

## SHA256 (engine trees)

| File | SHA256 |
|------|--------|
| `drawing-tools-manager.js` (both trees) | `18901167634475313cf42339da8d51ec59138b0496803b5fe1c4a117cd8a572e` |
| `drawing-toolbar.js` (both trees) | `6ceab350e4804dc0a1681fd84940b928e769bd992119c32c04d421fca1a81df1` |
