# T3 — panel-B parent-chrome readiness race diagnostic

## 1. Task + RC

- **Task:** `T3-panelB-chrome-readiness-race-DIAGNOSTIC-lane1` — read-only trace: is panel-B parent V9 toolbar/gear/settings readiness after selection **deterministic** or a **real product race**?
- **RC:** Tooling crossroads — blocks `gate:react` bless on build `20260716b10`. Rotating flakes in H-R01 (chrome-on-select), H-R04 (settings dbl-click), H-R05 (Esc), H-R12 (gear route) on panel B even after Lane 4 fresh-browser-per-scenario isolation.
- **Build traced:** `20260716b10` (P1 + H-R06 + H-R07 + I13 + H-R03 + harness `ba07584c`).

## 2. What I changed — file by file

**No files touched.** Read-only trace of:

| File | Role |
|------|------|
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | Iframe `selectDrawing` → sync `postMessage` + `_emitV9QuickBarGearReady` |
| `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` | Deferred `panel-focus` postMessage |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | Parent message handler, focus side-effects, settings guards |
| `chart v 1.4/chart/multichart-prod/multichart-manager.js` | Parallel `multichart-drawing-selected` handler |
| `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` | `onV9Sel` → quick bar mount, gear/settings handlers |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | `waitForV9QuickBarReady`, `clickV9QuickBarGear`, `readParentV9BarVisible` |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-scenarios.mjs` | H-R01/H-R04/H-R05/H-R12 panel-B flows |

## 3. Kill-switch (I3 + I13)

N/A — diagnostic only. Relevant existing switches for fix scoping:

| Switch | Gates |
|--------|-------|
| `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` | Gear-ready emit, iframe toolbar hide, settings bridge |
| `__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3` | `focusPanelById` on `multichart-drawing-selected` |
| `__TALARIA_DISABLE_MULTICHART_SETTINGS_FLASH_FIX_V1` | Settings open guard + `openDrawingSettingsForPanel` iframe path |
| `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1` | Peer clear timers on focus/selection |

## 4. Proof — trace evidence

### Lane 4 isolation baseline (`T0-lane4-gatereact-isolation-fix-plus-bless-report.md`, build `b10`)

| Row | Isolated ×10 | Interpretation |
|-----|--------------|----------------|
| H-R12 panel-B gear | 6/10 → **15/15** after gear-settle harness fix | **Harness signal gap** — not deterministic product bug |
| H-R04 panel-B dbl-click settings | **5/10** | Timing at settings-open boundary |
| H-R01 | Rotates in full suite (`final5-r2` FAIL) | Parent bar visibility check without chrome settle |
| H-R05 panel-B setup | `bless-gatereact-final5-r1` FAIL — settings never opened before Esc | Harness skips chrome wait; dbl-click raced peer-clear |

**No isolated row showed FAIL-REAL-BUG** (deterministic logic failure every run). Flakes are **rate-limited timing misses**, not wrong routing every time.

### End-to-end sequence (panel B single-click → parent chrome interactive)

```
[iframe B] selectDrawing
  ├─ SYNC parent.postMessage('multichart-drawing-selected')     drawing-tools-manager.js:178-186
  ├─ _emitV9QuickBarGearReady → parent.dispatchEvent(gear-ready) drawing-tools-manager.js:9215-9240
  └─ rAF: iframe-local talaria:v9-selected-drawing            drawing-tools-manager.js:196-200

[parent] message 'multichart-drawing-selected' (TWO handlers)
  ├─ MultichartGrid: arm guard +400ms, focusPanelById(B), dispatch parent talaria:v9-selected-drawing
  │                 MultichartGrid.jsx:6508-6541
  └─ multichart-manager: arm guard +300ms, clearDrawingUiOnOtherPanels (no skipV9Dismiss)
                      multichart-manager.js:1085-1095

[parent] deferred focus cascade
  ├─ setTimeout(0) panel-focus from bridge                          panel-cmd-bridge.js:3850-3858
  ├─ setTimeout(0) focus side-effects; +40ms retry if guard active    MultichartGrid.jsx:4043-4048
  ├─ setTimeout(32) peer deselect debounce                          MultichartGrid.jsx:5184+
  └─ setTimeout(60) viewport re-sync (if date sync on)                MultichartGrid.jsx:4076-4086

[parent React] TalariaV8bLive onV9Sel
  ├─ Resolve live drawing via grid.getChartForPanel(B)              TalariaV8bLive.jsx:21243-21280
  ├─ if (!live) return  ← bar never mounts                          TalariaV8bLive.jsx:21280
  ├─ setTlBarSelected(true)                                         TalariaV8bLive.jsx:21302-21303
  └─ tlBarShowQuickBar = tlBarSelected && tlBarLiveSelection && !settingsOpen
                                                                    TalariaV8bLive.jsx:16347-16348
  → #tl-sett mounts in fixed bar                                    TalariaV8bLive.jsx:31541-31584
```

**Critical ordering bug (product, but deterministic):** `_emitV9QuickBarGearReady` fires on the **parent** synchronously from the iframe engine **before** `onV9Sel` runs and React commits `#tl-sett`. The harness treats gear-ready as “chrome ready,” but `clickV9QuickBarGear` requires a **non-zero `#tl-sett` rect** (`react-parity-lib.mjs:799-805`). That is the documented H-R12 failure mode.

### Async gaps (bounded, intentional)

| Delay | Location | Can affect |
|-------|----------|------------|
| 0ms | `panel-focus`, focus side-effects, `computeFocusedRect` | Focus mirror vs selection |
| 40ms | Focus side-effect retry while `__v9DrawingSelectionGuardUntil` active | Peer clear vs fresh select |
| 32ms | `schedulePeerDeselectPanel` debounce | Cross-panel UI |
| 60ms | Focus viewport re-sync | Bar anchor position (not mount) |
| 1× rAF | iframe `talaria:v9-selected-drawing`; stale bar cleanup | Event ordering |
| 200–400ms | Selection guard windows (iframe/parent/manager) | Cleanup suppression |

These gaps are **structurally fixed** (same pipeline every click). Wall-clock completion varies with Puppeteer scheduling, but the stages are not random branches.

### Chrome visible but not yet interactive

| Window | Mechanism | HR rows |
|--------|-----------|---------|
| Gear-ready event before DOM | `_emitV9QuickBarGearReady` precedes React paint | **H-R12**, H-R04 (if waiting gear-ready) |
| `onV9Sel` early exit | `live` drawing not resolved across iframe boundary yet | **H-R01** (no bar), H-R12 gear no-op |
| `tlBarShowQuickBar` false | `tlBarLiveSelection` null while store selected in iframe | **H-R01**, H-R12 |
| Settings flash | `clearDrawingUiOnOtherPanels` dispatches `multichart-dismiss-drawing-settings` unless guard armed | **H-R04**, **H-R05**, H-R09 |
| Manager dual handler | `clearDrawingUiOnOtherPanels` without `skipV9Dismiss` races Grid handler | H-R04/H-R05 settings open |

### Harness wait gaps today

| Scenario | Panel B waits | Gap |
|----------|---------------|-----|
| H-R01 | `waitForReactSelection` only; `readParentV9BarVisible` immediate | No gear/bar settle |
| H-R04 | `waitForV9QuickBarReady(8000)` then dbl-click | Gear-ready ≠ interactive; retry helps |
| H-R05 | **No** quick-bar wait; `waitForParentDrawingSettingsOpen(5000)` | Dbl-click can race before chrome/settings path armed |
| H-R12 | `awaitParentChromeAfterPanelSelect` + 3-attempt ladder | Correct intent; still accepts event-before-DOM |

## 5. Invariants checked

| Invariant | Finding |
|-----------|---------|
| I15 | Flakes are on **real end-states** (settings open, gear click, bar visible) — not proxy greens |
| I13 | Manager handler is an **ungated parallel path** on `multichart-drawing-selected` (debt) |
| Read-only scope | No product/harness edits |

## 6. What I did NOT do / limits

- Did not run new isolated ×10 probes (relied on Lane 4 `T0-lane4-gatereact-isolation-fix-plus-bless-report.md` + bless artifact grep).
- Did not trace host panel-A path in depth (host passes more often; panel B adds iframe postMessage + cross-frame live-resolution).
- Did not profile Puppeteer timing distributions.
- Overlay hold (`OVERLAY_SETTLE_HOLD_*`) on panel B data-ready may add first-interaction latency — not fully quantified here.

## 7. Verdict

### **HARNESS-TIMING (primary)**

Panel-B parent-chrome readiness is **structurally deterministic**: every selection walks the same multi-hop pipeline with **bounded** async delays (0/32/40/60ms + rAF + React commit). Lane 4 proof: H-R12 isolated **6/10 → 15/15** after waiting on the right chrome settle — same product build, harness-only change. Rotating full-suite flakes are **wrong or early wait signals**, not alternate product code paths.

The harness must **not** treat `talaria:v9-quickbar-gear-ready` alone as “interactive.” That event is intentionally fired from the iframe engine **before** parent React mounts `#tl-sett`.

### **REAL-RACE (secondary, bounded)**

Two product issues amplify harness timing pressure but are **not** random logic bugs:

1. **P2 routing — gear-ready precedes bar mount** (`drawing-tools-manager.js:9215-9240` vs `TalariaV8bLive.jsx:21231+`). Deterministic ordering defect.
2. **P3 settings — peer clear vs settings guard** (`MultichartGrid.jsx:5237-5264`; manager handler at `multichart-manager.js:1091-1094` lacks `skipV9Dismiss`). Can flash-close settings if dbl-click/gear beats guard arm.

These explain residual **5/10** H-R04 isolated rate; they are fixable without changing selection semantics.

## 8. Concrete ready-signal for Lane 4 (harness)

**Name:** `parentV9ChromeInteractive` (composite barrier)

Wait until **all** are true on the **parent page**:

1. `window.__multichartGrid.getFocusedPanelId() === 'B'`
2. Iframe store: `isDrawingSelected(page, 'B', drawingId)` (existing)
3. **DOM:** `#tl-sett` (or `[data-v9-tl-btn="tl-sett"]`) with `getBoundingClientRect().width > 0 && height > 0`
4. **DOM:** `[data-tlbar="1"]` visible rect (bar shell mounted)
5. **Optional strengthen:** parent `page.evaluate` confirms `v9GetLiveSelectedDrawingForQuickBar()` non-null (matches `tlBarShowQuickBar` gate at `TalariaV8bLive.jsx:16347-16348`)

**Do not** return early on `talaria:v9-quickbar-gear-ready` or `window.__talariaV9QuickBarGearReady` alone (iframe-local cache does not populate parent — `react-parity-lib.mjs:765-766`).

**For settings rows (H-R04/H-R05/H-R09):** after dbl-click, wait `waitForParentDrawingSettingsOpen` with `hasStyleSection && !quickBarShellOnly` (existing), optionally confirm `performance.now() < window.__v9DrawingSettingsOpenGuardUntil` after open.

**Suggested harness helper signature (Lane 4 implements):**

```js
await waitForParentV9ChromeInteractive(page, { panelId: 'B', drawingId, timeoutMs: 12_000 });
// returns { ok, signal: 'dom-gear+bar+focus' | 'timeout' }
```

## 9. Minimal product fix proposal (do NOT implement — Lane 1 if pursued)

**Problem:** Gear-ready signal fires too early; manager handler races Grid on selection.

**Fix A (P2 routing — highest leverage for H-R12/H-R01):**

- Move `_emitV9QuickBarGearReady` from iframe `_commitSelectedDrawingVisual` to parent `TalariaV8bLive` **after** `setTlBarSelected(true)` in a `useLayoutEffect` when `#tl-sett` is in DOM (or dispatch a new `talaria:v9-quickbar-dom-ready`).
- **Switch:** `window.__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4` (unset = emit after DOM commit).
- **Rows made deterministic:** H-R12, H-R01, H-R04 (gear-wait path).

**Fix B (P3 settings — H-R04/H-R05/H-R09):**

- Gate `multichart-manager.js` `multichart-drawing-selected` handler behind `multichartOwnershipV2Enabled()` or skip when `window.__multichartGrid` React handler already consumed message; pass `skipV9Dismiss: true` on peer clear during selection guard window.
- **Switch:** extend existing peer/ownership switches; no new behavior when OFF.
- **Rows made deterministic:** H-R04, H-R05, H-R09, H-R13 flash-close.

**Owning lane:** Fix A → Lane 1 engine/shell (`drawing-tools-manager.js` + `TalariaV8bLive.jsx`). Fix B → Lane 1 `multichart-manager.js` + `MultichartGrid.jsx`. Harness barrier → **Lane 4 only**.

## 10. HR row map

| Row | Failure mode | Primary cause | Owner |
|-----|--------------|---------------|-------|
| H-R01 panelB | Store selected, `v9BarVisible=false` | No chrome settle; `onV9Sel` `!live` or bar not painted | Lane 4 wait; Lane 1 Fix A if `!live` persists |
| H-R04 panelB | Settings not open after dbl-click | Dbl-click before bar/settings path; settings flash | Lane 4 composite wait + settings probe; Lane 1 Fix B |
| H-R05 panelB | Setup: settings not open before Esc | **No** `waitForV9QuickBarReady`; 5s settings timeout miss | Lane 4 — add chrome barrier before dbl-click |
| H-R12 panelB | Gear-ready ok, gear click fails | Event-before-DOM race | Lane 4 `#tl-sett` rect barrier; Lane 1 Fix A |

## 11. Live-verification handoff

On build **`20260716b10`**, 2v layout, panel B:

1. Place trendline → single-click select.
2. Confirm parent `#tl-sett` visible **and** clickable (not just selection handles in iframe).
3. Gear → settings with Style section.
4. Repeat ×5 after host activity (proves sync pollution does not block chrome).

## 12. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)**

**Summary for Manager:** Bless should proceed via **Lane 4 `parentV9ChromeInteractive` barrier** first. If H-R04 isolated stays &lt;10/10 after that, schedule **Lane 1 Fix A + Fix B** as bounded product hardening — not a rewrite of P2/P3 routing.
