# H-R09 — V9 quick-bar live-resolve hardening (contingency spec)

**Authority:** Lane 1 diagnostic (H-R09 panel-B `v9BarVisible=false` / `storeOk=true`) · D-024 class · D-026 proof family  
**Status:** **LANDED (dev only)** — build **`20260717b42`** · [`worker-reports/H-R09-LIVE-RESOLVE-LANDING-report.md`](worker-reports/H-R09-LIVE-RESOLVE-LANDING-report.md)  
**RC:** RC-4 (multichart parent chrome) · adjunct to D-024 (dom-ready) — **does not replace** Lane 4 harness barrier  
**Related rows:** H-R09 (panel B single-click leg) · H-R01 (panel B — same probe) · D-026 H-R04/H-R05 (must not regress)

**Diagnostic inputs (read before implementing):**

| Doc | Covers |
|-----|--------|
| Prior Lane 1 H-R09 diagnostic (conversation / `T3-panelB-chrome-readiness-race-diagnostic-report.md`) | Mechanism: `tlBarShowQuickBar` vs iframe store split-brain |
| `worker-reports/a6-4-shipgate-react-gate-b37.txt` | b37 fail: `storeOk=true; v9BarVisible=false` |
| `worker-reports/a6-4-hr09-classify-x10-b40-d024.txt` | 9/10 PASS; one fail: dom-ready timeout + bar miss |
| `chart v 1.4/chart/multichart-prod/harness/HARNESS-REFERENCE.md` | Switch registration pattern (D-024 / D-026) |

---

## 0. Contingency gate — when this runs (and when it must NOT)

| Rule | Detail |
|------|--------|
| **Prerequisite** | Lane 4 has **landed** the D-024 follow-on harness barrier (`waitForParentV9ChromeInteractive` or equivalent: parent bar rect + focus + matching `drawingId`, not cache-only dom-ready). |
| **Trigger (authorize implementation)** | After that barrier ships, **`H-R09` panel-B single-click leg still fails honest ×10** (`REACT_PARITY_ISOLATE_SESSION=1`) **and** failure logs show the **lag signature** (§1.2) on ≥2/10 runs, **or** full `gate:react` still regresses H-R09 with same signature. |
| **Do NOT implement if** | Lane 4 barrier alone achieves **H-R09 10/10** (+ D-026 H-R04/H-R05 10/10 unchanged). Archive this spec; no product diff. |
| **Bless blocker** | **NOT** on critical path until trigger fires. Own gated PR + dist bump; does **not** block combined-build bless while contingency-only. |
| **Freeze-safe scope** | **`TalariaV8bLive.jsx` + `dist-v9` rebuild only** for product hunks. Optional **one-line guard extension** in `MultichartGrid.jsx` (§3.6) gated by the **same switch**. **No `chart.js`**, **no A6-4 order store**, **no D-026 transport** edits. |
| **Independence** | Does **not** extend or replace `__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4` (D-024), `__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_V1` (D-026), or `__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3`. |

---

## 1. Problem statement

### 1.1 User-visible failure

On **panel B** (iframe tile), a **single-click select** commits in the iframe drawing store (handles visible, `dm.selectedDrawings` correct) but the **parent V9 quick bar** (`#v9-tl-bar` / `#tl-sett`) is **absent** at probe time. Harness reports:

```text
storeOk=true; v9BarVisible=false expected=true
```

Dbl-click → settings and Esc legs can still **PASS** on the same run (routing recovers on second beat).

### 1.2 Lag signature (what the RED row must pin)

**Split-brain at parent shell** — all must hold simultaneously:

| Probe | Source | Expected on lag fail |
|-------|--------|----------------------|
| Iframe store selected | `isDrawingSelected(page, 'B', drawId)` | `true` |
| Focused panel | `grid.getFocusedPanelId()` | `'B'` |
| Parent bar visible | `readParentV9BarVisible(page, 'B')` | `false` |
| Live resolver | `v9GetLiveSelectedDrawingForQuickBar()` (parent evaluate) | `null` **or** lags behind store |
| Render gate | `tlBarShowQuickBar` equivalent | `false` while store selected |

This is **not** “click missed” and **not** A6-4 order-path (`ORDER_MC` master OFF → H-R09 10/10 in `a6-4-hr09-ab-master-off-x10-b38.txt`).

### 1.3 Root mechanism (static trace)

```
[iframe B] selectDrawing → postMessage multichart-drawing-selected (sync)
                        → rAF talaria:v9-selected-drawing (iframe)

[parent] MultichartGrid.jsx:6853-6887
         __v9DrawingSelectionGuardUntil += 400ms
         focusPanelById(B)
         dispatch talaria:v9-selected-drawing

[parent] TalariaV8bLive onV9Sel:21419-21706
         resolve live via grid.getChartForPanel(B) + id scan
         if (!live) return;                    ← 21479: bar never armed
         setTlBarSelected(true)                ← 21501-21502

[render] tlBarLiveSelection = v9GetLiveSelectedDrawingForQuickBar()  ← 16463
         tlBarShowQuickBar = tlBarSelected && !!tlBarLiveSelection   ← 16499-16500
         bar mounts only when tlBarShowQuickBar                      ← 31283+

[stale]  useEffect pointerup sync:21363-21381
         if !live && v9AnyPanelHasPrimarySelection → keep tlBarSelected
         but tlBarLiveSelection still null → bar unmounted

[dom]    v9EmitQuickBarChromeDomReady:5104-5149 may cache domReady
         while bar later unmounts; v9ClearQuickBarDomReady only on !tlBarSelected ← 21397-21398
```

**Causal gap:** `onV9Sel` requires **`live`** object before arming the bar (`21479`), while **`tlBarShowQuickBar`** requires **`v9GetLiveSelectedDrawingForQuickBar()`** on every render (`16463`, `16499-16500`). Both depend on **`v9GetFocusedPanelDrawingManager()`** → `grid.getChartForPanel(focusedId).drawingManager` (`3869-3948`), which can **lag** the iframe store by one or more React/rAF turns after focus/selection. Anchor ref (`3970-4009`) exists but is **not populated** when `onV9Sel` returns early at `!live`.

---

## 2. Switch (I3 + I13)

| Property | Value |
|----------|--------|
| **Name** | `window.__TALARIA_DISABLE_V9_QUICKBAR_LIVE_RESOLVE_V1` |
| **Default** | **unset** = fix **ON** (post-contingency landing) |
| **OFF** | `= true` → revert to pre-fix behavior (`onV9Sel` `!live` early return; anchor panelId path inactive; dom-ready clear tied to `tlBarSelected` only) |
| **Gated files (I13 — every path)** | `TalariaV8bLive.jsx` only for product hunks; optional `MultichartGrid.jsx:6861` guard extension (§3.6) |
| **Independent switches** | D-024 V4 · D-026 transport V1/A · chrome routing V3 · peer deselect V1 — **unchanged** |

**Helper (place adjacent to `multichartChromeDomReadyV4Enabled`, ~5073):**

```javascript
/** H-R09 contingency: trust postMessage ids when focused-panel DM lags iframe store. Default ON when landed. */
function v9QuickbarLiveResolveV1Enabled() {
  try {
    return !(typeof window !== "undefined"
      && window.__TALARIA_DISABLE_V9_QUICKBAR_LIVE_RESOLVE_V1 === true);
  } catch (_) {
    return true;
  }
}
```

**Harness CLI / env (Lane 4 registers with scenario):**

| Hook | Maps to |
|------|---------|
| `--v9-quickbar-live-resolve-off` | pre-boot `__TALARIA_DISABLE_V9_QUICKBAR_LIVE_RESOLVE_V1 = true` |
| `REACT_PARITY_V9_QUICKBAR_LIVE_RESOLVE_OFF=1` | env alias |

Wire in `react-parity-lib.mjs` `installBuiltProductBoot` (~426-468) and `react-run.mjs` (mirror `--chrome-dom-ready-off` pattern).

---

## 3. Product implementation — hunks

### 3.1 Target files

| Path | Role |
|------|------|
| `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` | All causal hunks |
| `chart v 1.4/chart/dist-v9/` (+ homepage mirror if applicable) | Rebuilt via `build:live` — build id inside parent + iframe |

**No edits:** `drawing-tools-manager.js` (notify path correct), `multichart-manager.js`, D-026 transport sites, A6-4 order modules.

Bump `CHART_ENGINE_BUILD` / dist bundle id per existing workflow.

---

### 3.2 Hunk A — `onV9Sel`: arm bar from postMessage ids when `live` lags (CAUSAL)

**File:** `TalariaV8bLive.jsx` — `onV9Sel` handler inside `useEffect`, **~21419-21502**

**Today:** `if (!live) return;` at **~21479** exits before `setTlBarSelected(true)` (**~21501-21502**).

**Change (gated by `v9QuickbarLiveResolveV1Enabled()`):**

When `!live` **and** multichart grid present **and** `detail.panelId`, `detail.drawingId`, `detail.drawingType` all set:

1. Call new helper `v9RememberQuickBarSelectionFromPostMessage(detail)` (§3.3) — sets anchor **with `panelId`**, `dm` optional/null.
2. `grid.focusPanelById(detail.panelId)` if not already focused (mirror **~21482-21486**).
3. **`br.setTlBarSelected(true)`** and **`br.setTlBarSelectedType(t)`** — do **not** return early.
4. Schedule **`v9RetryHydrateQuickBarLiveFromAnchor(br, detail)`** — rAF loop (max **12** attempts, same budget as dom-ready `useLayoutEffect` **~21403-21411**) to replace anchor-only state with resolved `live` + `v9RememberQuickBarSelection(dm, live)`.

**Switch OFF:** preserve exact current early return at **~21479**.

**Load-bearing:** Without this hunk, anchor is never set when DM lookup fails on first tick — Hunk B alone cannot GREEN.

---

### 3.3 Hunk B — Anchor carries `panelId`; panel-first resolution

**File:** `TalariaV8bLive.jsx`

**B1 — Extend anchor shape** — `v9RememberQuickBarSelection` **~3970-3977** and new `v9RememberQuickBarSelectionFromPostMessage(detail)`:

```javascript
v9QuickBarSelectionAnchorRef.current = {
  drawingId: detail.drawingId != null ? detail.drawingId : null,
  type: detail.drawingType,
  panelId: detail.panelId != null ? String(detail.panelId) : null,
  dm: dm || null,
};
```

**B2 — `v9ResolveLiveDrawingFromQuickBarAnchor`** **~3983-4009**

When `v9QuickbarLiveResolveV1Enabled()` and `anchor.panelId`:

1. **First** `grid.getChartForPanel(anchor.panelId)?.drawingManager` → `resolveLiveDrawingInDmById`.
2. Accept hit when `onOwner.selected || v9DrawingIsPrimarySelection(pdm, onOwner)` **even if** `focusDm !== anchor.dm` (fixes focus/DM lag).
3. Fall through to existing focusDm / enumerate paths when switch OFF.

**Switch OFF:** byte-for-byte current anchor resolution order.

---

### 3.4 Hunk C — `v9GetLiveSelectedDrawingForQuickBar` prefers anchored panel

**File:** `TalariaV8bLive.jsx` **~4015-4037**

When fix ON and multichart:

```javascript
const onFocus = v9GetPrimarySelectedDrawingOnFocusedPanel();
if (onFocus) return onFocus;
const anchored = v9ResolveLiveDrawingFromQuickBarAnchor();
if (anchored) return anchored;
// ... existing hostDm / scanned / anchor retry paths unchanged
```

(Reorder is subtle: today anchor is already second; **Hunk B** makes anchor resolve panel-first — this hunk documents that **no regression** to hostDm fallback when switch OFF.)

**Optional tighten (fix ON only):** if `anchored` null but anchor has `panelId` + `drawingId`, call `v9RetryHydrateQuickBarLiveFromAnchor` synchronously once before return null — only inside render-safe path (use ref guard to avoid loops).

---

### 3.5 Hunk D — Stale-sync must not strip bar while anchor matches store

**File:** `TalariaV8bLive.jsx` **~21363-21381** (`useEffect` on `tlBarSelected`)

In `sync()` when `!v9GetLiveSelectedDrawingForQuickBar()`:

**Fix ON:** if `v9QuickBarSelectionAnchorRef.current?.drawingId` matches a primary selection on **any** panel (`v9AnyPanelHasPrimarySelection()` already returns early — extend):

```javascript
if (v9QuickbarLiveResolveV1Enabled()) {
  const anchor = v9QuickBarSelectionAnchorRef.current;
  if (anchor?.drawingId != null && v9AnyPanelHasPrimarySelection()) {
    const hydrated = v9ResolveLiveDrawingFromQuickBarAnchor();
    if (hydrated) return; // keep tlBarSelected; render gate will catch up
  }
}
```

**Switch OFF:** current behavior (clear `tlBarSelected` when live null and no any-panel guard).

---

### 3.6 Hunk E — Invalidate dom-ready cache when bar unmounts (anti false-GREEN)

**File:** `TalariaV8bLive.jsx`

**E1 — `v9ClearQuickBarDomReady`** **~5152-5158** — no change to signature.

**E2 — New `useLayoutEffect`** (after **~21415**, gated by `multichartChromeDomReadyV4Enabled()` && `v9QuickbarLiveResolveV1Enabled()`):

Watch derived **`tlBarShowQuickBar`** (same predicate as **~16499-16500**). When **`tlBarSelected && !tlBarShowQuickBar`** (split-brain: armed but not rendering), call **`v9ClearQuickBarDomReady()`**.

**Switch OFF:** only existing clear on `!tlBarSelected` (**~21397-21398**).

**Purpose:** prevents harness `waitForParentV9ChromeDomReady` from passing on stale `__talariaV9QuickBarDomReady` after bar tear-down (classify run false-GREEN path).

---

### 3.7 Hunk F — Optional guard extension (MultichartGrid, same switch)

**File:** `MultichartGrid.jsx` **~6860-6861**

When `v9QuickbarLiveResolveV1Enabled()` (read switch inline — grid bundle includes no Talaria helper; duplicate one-line check):

```javascript
window.__v9DrawingSelectionGuardUntil = performance.now()
  + (window.__TALARIA_DISABLE_V9_QUICKBAR_LIVE_RESOLVE_V1 === true ? 400 : 600);
```

**Default when fix landed:** **600ms** on iframe `multichart-drawing-selected`. **Switch OFF:** **400ms** (current).

**Scope note:** implement **only if** Hunks A–E GREEN H-R09-LR but pointerup stale-sync still flakes 1/10. Prefer A–E first.

---

### 3.8 Out of scope

| Item | Reason |
|------|--------|
| Lane 4 harness barrier implementation | Prerequisite / primary fix surface |
| D-026 settings transport | Separate causal chain; must regression-test unchanged |
| `onV9Sel` D-026 early return **~21425-21434** | Settings-session guard — do not weaken |
| Iframe `_emitV9QuickBarGearReady` | D-024 already suppressed iframe emit; parent owns dom-ready |
| Fault-injection switches in production | Harness lag pin uses **read-only evaluate** (§4.2), not prod delays |

---

## 4. Harness — RED that pins the lag

Lane 4 adds scenario family **`H-R09-LR`** (live-resolve lag pin). Product worker may add **`__talariaDebugQuickBarLagSnapshot`** (dev/harness only, behind `process.env.NODE_ENV !== 'production'` or omitted in dist prod strip) — **optional**; evaluate-based probe is sufficient.

### 4.1 `readParentQuickBarLagSignature(page, panelId, drawId)` (Lane 4)

**File:** `react-parity-lib.mjs` (new export)

Parent `page.evaluate`:

```javascript
// Returns { lagClass, storeSelected, focusedOk, barVisible, liveNull, tlBarSelected, anchorId, domReadyCached }
```

**`lagClass === true`** iff:

- iframe `dm` has `drawId` selected, **and**
- `grid.getFocusedPanelId() === panelId`, **and**
- `#v9-tl-bar` / `#tl-sett` rect not visible, **and**
- parent cannot resolve live selection (implement via reading `window.__talariaV9QuickBarDomReady` + optional debug hook).

**I15:** real mouse single-click actuation (`singleClickDrawing`); **no** `dm.selectDrawing` shortcut.

### 4.2 Scenario `H-R09-LR` — lag pin + bar assert

**File:** `react-parity-scenarios.mjs` (register in `reactScenarioList`)

| Step | Detail |
|------|--------|
| Layout | `mcLayout=2v`, built dist-v9, isolate session |
| Setup | Seed trendline panel B; disarm draw tool |
| Act | `singleClickDrawing(page, 'B', tool.id)` |
| Wait | **`waitForReactSelection`** → **`waitForParentV9ChromeInteractive`** (Lane 4 barrier — **must exist before contingency proof**) |
| **LAG-PIN probe** | `readParentQuickBarLagSignature` — record `lagClass` in check output (diagnostic, not sole pass/fail pre-fix) |
| **CORE** | `assertReactMenuState`: `toolbarVisible: true`, `selectedIds: [tool.id]` |

**RED (pre product fix, barrier ON):** CORE fails with `lagClass=true` on ≥2/10 runs **or** intermittent `v9BarVisible=false` with `storeOk=true`.

**GREEN (post fix, switch default ON):** **10/10** CORE pass; **LAG-PIN** reports `lagClass=false` on all 10.

### 4.3 Scenario `H-R09-LR-OFF` — switch discriminator (I13)

| Step | Detail |
|------|--------|
| Boot | `--v9-quickbar-live-resolve-off` |
| Runs | **10/10** **`H-R09-LR` CORE must FAIL** (non-vacuous) after fix is landed |
| Expected | Restores `onV9Sel` early return + pre-fix flake class |

Mirror D-024 record: H-R04 ON 10/10 / `--chrome-dom-ready-off` honest FAIL.

### 4.4 Binding proof matrix (post-implementation)

| Command | Expected |
|---------|----------|
| `node react-run.mjs --only=H-R09-LR --runs=10` (fix ON, barrier ON) | **10/10 PASS** |
| `node react-run.mjs --only=H-R09 --runs=10` (fix ON, barrier ON) | **10/10 PASS** |
| `node react-run.mjs --only=H-R01 --runs=10` (fix ON) | **10/10 PASS** (panel B first leg) |
| `node react-run.mjs --only=H-R09-LR --runs=10 --v9-quickbar-live-resolve-off` | **10/10 FAIL** (discriminator) |
| D-026 regression | `H-R04` + `H-R05` **10/10 ON** unchanged |
| `node react-gate.mjs` | **0 NEW regressions** vs blessed baseline |

**Determinism rule:** no fixed `sleep()` in product or harness; barrier waits on **bar rect + focus + drawingId** (Lane 4) and/or **`talaria:v9-quickbar-dom-ready`** with invalidated cache (Hunk E).

---

## 5. Proof — RED → GREEN (worker report template)

When trigger §0 fires and worker implements:

### 5.1 RED evidence (attach before fix)

- `a6-4-shipgate-react-gate-b37.txt` line: `H-R09 CORE (panelB): … v9BarVisible=false`
- Post-barrier fail log: `H-R09-LR` with `lagClass=true` sample JSON from `readParentQuickBarLagSignature`
- Optional: `a6-4-hr09-classify-x10-b40-d024.txt` run 3 (dom-ready timeout + bar miss)

### 5.2 GREEN evidence (after fix)

- `hr09-lr-on-x10.txt` — 10/10 PASS
- `hr09-lr-off-x10.txt` — 10/10 FAIL discriminator
- `d026-hr04-hr05-regression.txt` — unchanged 10/10
- Build id in parent + panel B iframe (I8)

### 5.3 Status label

**DONE (dev only) — NEEDS-LIVE** until PO confirms panel B single-click → parent quick bar on combined build (same handoff as D-026).

---

## 6. Invariants

| Invariant | How satisfied |
|-----------|----------------|
| **I3 / I13** | Single switch; OFF reverts every hunk; `--v9-quickbar-live-resolve-off` discriminator |
| **I8** | dist-v9 rebuild both trees; build id match host + iframe |
| **I15** | Real mouse actuation; assert parent bar rect + store — not gear-ready alone |
| **Freeze** | No `chart.js` / order / transport edits |
| **D-026** | Explicit regression row in §4.4 |

---

## 7. Live-verification handoff

On combined build with fix ON (after contingency landing):

1. Open **2v multichart** backtest; confirm build id in panel B iframe.
2. Place trendline on **panel B**; single-click body.
3. **Pass:** parent **V9 quick bar** visible (`#tl-sett` gear clickable) within one beat; no second click required.
4. Repeat ×5 after host settings activity (H-R09 host leg order).
5. **Fail signature:** handles selected in iframe, no parent bar until dbl-click.

---

## 8. Registry / tracker (on landing only)

Update **`RESOLUTION-TRACKER.csv`** row:

```csv
H-R09,remig-row,Panel-B single-click V9 bar live-resolve lag,H-R09 live-resolve V1 (contingency),__TALARIA_DISABLE_V9_QUICKBAR_LIVE_RESOLVE_V1,<build-id>,RESOLVED-DEV,H-R09-LR 10/10 ON; switch-OFF FAIL,no,Contingency; after Lane 4 barrier insufficient
```

Add **`HARNESS-REFERENCE.md`** row for `H-R09-LR` + switch hook.

---

## 9. Status

**CONTINGENCY-SPEC-ONLY (not authorized for implementation until §0 trigger)**

**Summary for Manager:** Lane 4 owns the harness barrier first. If H-R09/D-026 still miss after barrier stabilization, implement **Hunks A–E** in `TalariaV8bLive.jsx` behind **`__TALARIA_DISABLE_V9_QUICKBAR_LIVE_RESOLVE_V1`**, prove with new **`H-R09-LR`** lag-pin row + switch-OFF discriminator. Do not touch D-026 transport or A6-4 order paths.
