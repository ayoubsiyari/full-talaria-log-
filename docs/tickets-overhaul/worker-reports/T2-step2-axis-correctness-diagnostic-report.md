# T2 Step 2 — A1 axis label/gesture correctness (diagnostic)

## 1. Task + RC

- **Task:** T2 step 2 (Lane 1) — read-only diagnostic for four A1 axis defects (time label click-shift, custom-TF label drift, price-label drag leak, half-hour gridline tail errors). Report mechanism + proposed gated fix shapes; **no behavior changes**.
- **RC:** RC-2 (invalidation/render-contract in shared axis chrome — amendment A1). Defects 1–2 are primarily RC-2; defects 3–4 mix RC-2 with tick-math (see grouping below).
- **L1 build traced:** `CHART_ENGINE_BUILD = '20260712b1'` (`chart v 1.4/chart/chart.js:431`, mirrored in `homepage/public/chart/chart.js`).

---

## 2. What I changed — file by file

**No files touched.** Diagnostic-only bridge task while T1 step 12 deploys.

### Proposed fix shapes (not implemented)

| Fix group | Proposed switch (default ON = fix active) | Files to gate (both mirror trees unless noted) |
|-----------|-------------------------------------------|------------------------------------------------|
| **A — click time/day label shift** (TAL-01565 + TAL-01583) | `window.__TALARIA_DISABLE_AXIS_CLICK_TICK_INVALIDATION_FIX` | `chart v 1.4/chart/chart.js`, `homepage/public/chart/chart.js` — `render()` tick branch (`25908–25932`), pan mousedown/render (`31585–31606`, `31923–31927`), optionally `_stabilizeTimeLabelInterval` (`24161–24174`) extended to click/pan-idle |
| **B — half-hour tail gridlines** (TAL-01565 grid half) | `window.__TALARIA_DISABLE_AXIS_RIGHT_EDGE_TICK_ALIGN_FIX` | Same `chart.js` mirrors — `_fillTimeTicksToViewport` (`26507–26548`), `_fastTimeTickAlignStart` (`26470–26505`), shared with `_buildTimeTicksFast` (`26555–26594`) |
| **C — custom TF fixed axis** (TAL-01572) | `window.__TALARIA_DISABLE_CUSTOM_TF_TIME_ANCHOR_TICK_FIX` | Same `chart.js` mirrors — `_buildTimeTicks` else branch (`26667–26668`), `_getFastTimeLabelIntervalBars` else (`26444–26446`), `updateCrosshair` time-label positioning (`34408–34449`) if UX split needed |
| **D — price-label drag leak** (TAL-01566) | `window.__TALARIA_DISABLE_PRICE_LABEL_GESTURE_OWNERSHIP_FIX` | Same `chart.js` mirrors — `_detectCursorModeAt` (`17438–17477`), mousedown drag routing (`31544–31606`), `_applyChartPanStep` vertical branch (`25429–25447`), `_syncDomAxisCursorZones` (`17479–17502`) |

**Grouping:** A is one fix (shared RC-2 invalidation). B shares tick infrastructure with A but needs an independent right-edge align fix. C is largely tick-math + label-source clarity. D is independent gesture routing.

---

## 3. Kill-switch (I3 + I13) — proposed only

Each proposed switch above: **default ON** (unset/false = fix active), **OFF** reverts only the gated paths in `chart.js` (both mirrors byte-identical). No React/iframe files required for A1 (axis chrome is engine-only). T1-touched files (`drawing-tools-manager.js`, `drawing-toolbar.js`, `TalariaV8bLive.jsx`) are **out of scope** for these fixes.

---

## 4. Proof — mechanism trace (no code change)

### Method

Static trace of `chart v 1.4/chart/chart.js` (verified mirrored at `homepage/public/chart/chart.js`). No commits, no trace logging injected. Reproduction paths are code-order traces PO can confirm in browser DevTools or a future RED harness.

---

### Defect 1 — TAL-01565 + TAL-01583: click shifts time label / day

**Ticket quotes (P6):**

- TAL-01565: *"When I click on the chart, the time label changes. There is a half-hour interval between the vertical lines, but the last few lines contain errors."*
- TAL-01583: *"لما اضغط على الشارت بيتغير الوقت واليوم"* (clicking the chart changes the time and day)

**Owner:** `chart v 1.4/chart/chart.js`

| Symbol | Lines | Role |
|--------|-------|------|
| `mousedown` → `drag.type = 'pan'` | `31585–31606` | Chart-body click always arms pan + immediate `render()` |
| `render()` tick builder selection | `25908–25932` | Pan/lite paint picks `_buildTimeTicksFast()` vs `_buildTimeTicks()` |
| `_buildTimeTicksFast` / `_buildTimeTicks` | `26555–26594`, `26601+` | Different density, boundary, and `intradayCalendarMode` handling |
| `_stabilizeTimeLabelInterval` | `24161–24174` | Freezes interval only during **wheel burst**, not click/pan |
| `mouseup` click cleanup | `31923–31927` | Explicit comment: *"Mousedown starts pan/lite paint; without this, a click leaves mixed time-axis labels."* clears `_cachedInteractionTimeTicks` then full `render()` |

**Mechanism (RC-2):** A chart click is not a no-op — it starts a `pan` drag (`31585–31606`) and paints with interaction-lite tick path (`25913–25920` → `_buildTimeTicksFast`). On release, if movement &lt; 5px it is classified as click (`31899`) and forces another full `render()` after cache clear (`31925–31927`). The fast vs full builders can pick different `labelInterval`, `intradayCalendarMode` (day numbers vs clock times), and boundary labels (`24306–24319`, `26675–26699`). `_stabilizeTimeLabelInterval` does not freeze across this click transition. Net: axis labels and day strings **jump** even though `offsetX` did not meaningfully change.

**Repro trace:**

1. Load chart at 30m (or any intraday TF zoomed so calendar mode may toggle).
2. Note bottom time-axis label string at a fixed screen X.
3. Single left-click on plot (no drag) → `mousedown` sets `drag.type='pan'` → lite `render()` with `_buildTimeTicksFast`.
4. `mouseup` → `isChartClick=true` → `_cachedInteractionTimeTicks=null` → full `_buildTimeTicks()`.
5. Label at same bar index changes format (e.g. clock → day number, or different day).

**Classification:** RC-2 render-invalidation (not pure tick math).

---

### Defect 2 — TAL-01565 (gridline half-hour): last vertical lines wrong

**Ticket quote:** same TAL-01565 — *"half-hour interval between the vertical lines, but the last few lines contain errors."*

**Owner:** `chart v 1.4/chart/chart.js`

| Symbol | Lines | Role |
|--------|-------|------|
| 30m `labelInterval` | `26643–26646`, `26420–26423` | Half-hour cadence when TF=30m |
| `isRound` time alignment | `26776–26780` | `rem < 0.5` tolerance on `labelIntervalMs`; midnight align when `86400000 % labelIntervalMs === 0` (`26719–26724`) |
| `_buildTimeTicksFast` main loop | `26574–26593` | Time-aligned ticks via `_fastTimeTickAlignStart` |
| `_fillTimeTicksToViewport` | `26507–26548` | **Right-edge extension** adds ticks by **bar-index step** (`idx += step`) with `_formatTimeLabelForBarIndex`, not `isRound` filter |

**Mechanism (tick-math + RC-2 tail):** Main grid uses wall-clock-aligned `isRound` ticks. `_fillTimeTicksToViewport` appends index-stepped ticks to cover the viewport right edge. For 30m (`labelIntervalMs = 1800000`, divides day evenly), the last 1–3 filler ticks can land on bar indices that are **not** half-hour-aligned → wrong label strings or uneven spacing at the right edge. Worsens when click/pan toggles fast vs full builder (Defect 1).

**Repro trace:**

1. 30m TF, zoom so ~8–12 vertical grid lines visible.
2. Inspect rightmost 2–3 lines vs interior lines — spacing or label time drifts.
3. Compare `_timeTicks` from `_buildTimeTicksFast` before/after `_fillTimeTicksToViewport` (last entries `idx % labelInterval !== 0` mod time).

**Classification:** Primarily tick-math; amplified by Defect 1 invalidation. **Independent fix** in `_fillTimeTicksToViewport` / shared align helper.

---

### Defect 3 — TAL-01572: custom TF (e.g. 3m) time label moves with crosshair

**Ticket quote:** *"When I add a timeframe… like a 3-minute timeframe, the time label moves with the price; it doesn't stay fixed like on a 1-minute timeframe… This only happens when I add new timeframes."*

**Owner:** `chart v 1.4/chart/chart.js`

| Symbol | Lines | Role |
|--------|-------|------|
| Custom TF density | `26667–26668`, `26444–26446` | `else` branch: `labelInterval = ceil(visibleBarsCount / 8)` — **not** native TF table |
| `useUniformIntradayTicks` + `isRound` | `26677–26684`, `26772–26783` | Time anchoring applies when uniform intraday — custom TFs still get sparse index-derived interval |
| `updateCrosshair` `.time-label` | `34408–34449` | DOM label at `lineX` (crosshair X), updates every pointer move — **not** canvas axis ticks |
| `drawAxes` time ticks | `26373–26377` | Fixed canvas axis from `_timeTicks` |

**Mechanism:** Native 1m/5m/… have tuned `labelInterval` tables producing dense, time-anchored axis ticks (`26405–26443`). Custom `3m` falls into the `else` branch → coarser index-based spacing → often **only** the crosshair `.time-label` is salient; it tracks `lineX` (`34445`) so it appears to "move with the price/crosshair." On 1m, fixed axis ticks dominate perception. Custom TF is not excluded from `useUniformIntradayTicks`, but the coarse `ceil(visible/8)` interval defeats fixed-grid feel.

**Repro trace:**

1. Add custom 3m TF, load data.
2. Hover — `.time-label` follows crosshair X; sparse or missing axis tick labels at bottom.
3. Switch to 1m — multiple fixed `drawAxes` labels; crosshair label less noticeable.
4. Compare `_getFastTimeLabelIntervalBars()` for `3m` vs `1m` at similar zoom.

**Classification:** Tick-math (custom TF cadence) + UX (crosshair DOM vs axis canvas). Not the same fix as Defect 1, though click invalidation can worsen sparse ticks.

---

### Defect 4 — TAL-01566: dragging price label pulls chart vertically

**Ticket quote:** *"لما تسحبو لفوق وتحت بينزل الشارت لتحت"* (when you drag it up/down, the chart goes down)

**Owner:** `chart v 1.4/chart/chart.js` (+ DOM zones in init `37650–37736`)

| Symbol | Lines | Role |
|--------|-------|------|
| `.price-label` CSS | `chart v 1.4/chart/styles.css:391–407` | `pointer-events: none` — not draggable itself |
| `drawCurrentPriceLabel` | `28084–28157` | Canvas live price pill on axis column — no hit target |
| `_detectCursorModeAt` | `17438–17477` | `priceAxis` only when `mx > w - m.r` |
| `drag.type = 'pan'` + `_applyChartPanStep` | `31585–31606`, `25429–25447` | Chart-mode vertical drag sets `priceOffset += effectiveDy * pricePerPixel` (vertical pan) |
| `drag.type = 'priceAxis'` | `31544–31564`, `31681–31698` | Axis drag zooms Y + adjusts `priceOffset` (zoom anchor) |
| `#priceAxisZone` forward | `37650–37736` | Forwards pointer to canvas with `cursor.mode = 'priceAxis'` |

**Mechanism:** Users drag the visible price pill (canvas `drawCurrentPriceLabel` or crosshair `.price-label` overlay). Labels are non-interactive; the pointer hits plot or a narrow axis edge. If `_detectCursorModeAt` returns `chart` (even 1–2px inside plot), `drag.type='pan'` and `_applyChartPanStep` applies **vertical** `priceOffset` change (`25441–25446`) — chart body slides. If `priceAxis` is detected, vertical drag runs price-axis **zoom** (`31681–31696`), also shifting `priceOffset` — still feels like "chart moved" rather than label-only interaction. No dedicated gesture owns "price label drag."

**Repro trace:**

1. Enable crosshair; position over live price label on right axis.
2. Drag vertically starting on label visual — observe `drag.type` in console (`pan` vs `priceAxis`).
3. `priceOffset` changes; candles shift vertically.
4. Repeat starting 5px left of axis column — almost always `pan`.

**Classification:** Gesture ownership / hit-test (RC-2 interaction contract), independent of tick builders.

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| **I8** (mirrors) | Traced both `chart v 1.4/chart/chart.js` and `homepage/public/chart/chart.js`; proposed fixes must touch both. |
| **I3/I13** (kill-switch) | Proposed one switch per independent fix group; all gate engine-only paths. |
| **L1** (build id) | Traced on `CHART_ENGINE_BUILD = '20260712b1'`. |
| **T1 isolation** | Did not read or modify `drawing-tools-manager.js`, `drawing-toolbar.js`, `TalariaV8bLive.jsx`. |
| **P6** (ticket quotes) | All four defects quoted verbatim from `tickets/support-export-full-14-07-26/messages.csv`. |

---

## 6. What I did NOT do / limits

- **No browser RED harness run** for A1 symptoms in this session (read-only bridge; no new proof scripts committed).
- **No ticket screenshot pixel analysis** — mechanism inferred from code + ticket text.
- **Did not verify** timezone edge cases (UTC vs user TZ) for half-hour alignment; traced `convertToTimezone` usage in tick path only.
- **TAL-01572** may combine user confusion (crosshair label vs axis label); live confirm should record whether bottom **canvas** axis labels are missing or only DOM crosshair label moves.
- **Multichart / iframe embed** — defects traced on main `Chart` class; panel embed uses same `chart.js` but PO should confirm on single-chart and 2×2 embed.
- **Gate scenarios** (H-S21 axis geometry, etc.) not re-run; existing harness `readAxis21` is reference for future A1 RED tests, not proof of these four tickets.

---

## 7. Live-verification handoff

After T1 step 12 live-confirms and Manager dispatches A1 fixes:

1. **Build:** Engine `CHART_ENGINE_BUILD` bump expected; look for new id in chart embed `?v=` param.
2. **TAL-01565 / TAL-01583 (click):** 30m or 1h intraday, zoom ~50–100 bars. Single-click plot center; **before fix** bottom label/day changes without horizontal scroll. **After fix A:** label string stable across click.
3. **TAL-01565 (grid tail):** 30m, inspect rightmost 3 vertical grid lines — times should stay half-hour aligned. **After fix B:** equal spacing + correct labels at right edge.
4. **TAL-01572:** Add custom 3m; compare axis tick count vs 1m at similar zoom. **After fix C:** fixed bottom axis labels visible; crosshair label may still track X (expected) but axis grid no longer sparse-only.
5. **TAL-01566:** Drag live price pill / crosshair price label vertically. **Before fix:** `priceOffset` changes, candles slide. **After fix D:** vertical drag on label band triggers price-axis zoom only OR is ignored for pan — chart body does not pan.

Optional DevTools: `window.chart.drag.type`, `window.chart.priceOffset`, `window.chart._timeTicks.slice(-3)` across click.

---

## 8. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)**

Ready for Manager dispatch: four defects → **three implementation tracks** (A, B+C partial overlap, D) with separate kill-switches. Implement RED-first per symptom after T1 step 12 NEEDS-LIVE-CONFIRM clears.
