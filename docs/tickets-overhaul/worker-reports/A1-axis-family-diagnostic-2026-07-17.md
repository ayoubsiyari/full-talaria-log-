# A1-axis family — read-only diagnostic (11 rows)

## 1. Task + RC

- **Task:** Lane 2 read-only diagnostic — group 11 A1-axis tickets by mechanism (gridline / price-time label / replay-time label), propose fix tranches + kill-switches. No code changes in this document.
- **RC:** RC-2 (render/interaction contract in shared axis chrome — amendment A1). Gridline rows mix tick-math; replay rows mix replay×zoom invalidation.
- **Build traced:** `CHART_ENGINE_BUILD = '20260718b01'` (`chart v 1.4/chart/chart.js:431`, mirrored in `homepage/public/chart/chart.js`).

---

## 2. What I changed — file by file

**No engine files touched for this diagnostic.** This report is mechanism + dispatch planning only.

| File | Change |
|------|--------|
| `docs/tickets-overhaul/worker-reports/A1-axis-family-diagnostic-2026-07-17.md` | **Added** — persisted diagnostic from Lane 2 intake |

**Prior art:** `docs/tickets-overhaul/worker-reports/T2-step2-axis-correctness-diagnostic-report.md` (original 4 defects A–D).

---

## 3. Kill-switch (I3 + I13) — proposed only

| Tranche | Switch (default ON = fix active) | Tickets |
|---------|----------------------------------|---------|
| **A** — click / lite-paint tick stability | `window.__TALARIA_DISABLE_AXIS_CLICK_TICK_INVALIDATION_FIX` | TAL-01565, TAL-01583, (TAL-01604 click) |
| **B** — right-edge grid align | `window.__TALARIA_DISABLE_AXIS_RIGHT_EDGE_TICK_ALIGN_FIX` | TAL-01565 grid, TAL-01618, TAL-01625, TAL-01639 grid |
| **C** — custom TF time anchor | `window.__TALARIA_DISABLE_CUSTOM_TF_TIME_ANCHOR_TICK_FIX` | TAL-01572, (TAL-01604 custom TF) |
| **E** — replay zoom axis anchor | `window.__TALARIA_DISABLE_REPLAY_TIME_AXIS_ZOOM_ANCHOR_FIX` *(new)* | TAL-01613, TAL-01639 axis |
| **F** — TF switch axis/data commit | `window.__TALARIA_DISABLE_TF_SWITCH_AXIS_DATA_COMMIT_FIX` *(new)* | TAL-01641 |
| **G** — indicator axis label anchor | `window.__TALARIA_DISABLE_INDICATOR_AXIS_LABEL_ANCHOR_FIX` *(new)* | TAL-01619 |
| ~~**D**~~ — price-label gesture | ~~`__TALARIA_DISABLE_PRICE_LABEL_GESTURE_OWNERSHIP_FIX`~~ | ~~TAL-01566~~ **CANCELLED (D-019)** |

All proposed A–F switches gate `chart.js` (both I8 trees). Tranche **G** gates `chart-indicators-full.js` only.

---

## 4. Proof — mechanism trace (no code change)

### Method

Static trace of `chart v 1.4/chart/chart.js` + `chart-indicators-full.js` (mirrored under `homepage/public/chart/`). Ticket quotes from `tickets/support-export-full-16-07-26/messages.csv`.

---

### Mechanism bucket A — Gridline

| Ticket | Quote | Mechanism | Owner |
|--------|-------|-----------|-------|
| **TAL-01565** (grid) | *"half-hour interval… last few lines contain errors"* | `_fillTimeTicksToViewport` extends by bar-index step without `isRound` → right-edge misalignment (`27210–27248`) | `chart.js` |
| **TAL-01618** | *"Grid line mismatch"* | Same tail-align / fast-vs-full builder divergence | `chart.js` |
| **TAL-01625** | *"There's a problem with the gridline"* | Intake sibling of 01618 | `chart.js` |
| **TAL-01639** (grid) | *"grid lines… move with the chart toward the right"* | Replay time-anchored cadence (`27652–27668`); possible desync vs labels | `chart.js` |

---

### Mechanism bucket B — Price / time label

| Ticket | Quote | Mechanism | Owner |
|--------|-------|-----------|-------|
| **TAL-01565** (click) | *"When I click… time label changes"* | Click/pan/lite-paint toggles tick builders (`26586–26613`, `32511–32871`) | `chart.js` |
| **TAL-01583** | *"clicking the chart changes the time and day"* | Same as 01565 click path | `chart.js` |
| **TAL-01572** | *"3-minute… time label moves with the price"* | Custom TF sparse axis + DOM `.time-label` at crosshair X (`35351–35388`) | `chart.js` |
| **TAL-01604** | *"The label is not fixed it keeps moving"* | Umbrella — canvas axis vs crosshair DOM vs wheel invalidation (triage on live) | `chart.js` |
| **TAL-01619** | *"price label of indicator moves with crosshair"* | `_syncSeparatePanelCrosshairUi` hides static tags, live pill at crosshair value Y (`11206–11288`) | `chart-indicators-full.js` |
| **TAL-01566** | *"dragging price label pulls chart down"* | **CANCELLED (D-019)** — working-as-intended | N/A |

---

### Mechanism bucket C — Replay–time label

| Ticket | Quote | Mechanism | Owner |
|--------|-------|-----------|-------|
| **TAL-01613** | *"replay… zoom… time label moves with the chart"* | Replay wheel clears pan tick cache + full rebuild (`31945–31997`, `24611–24625`) | `chart.js` |
| **TAL-01639** (axis) | *"time axis, and date axis move with the chart"* | Same replay anchor branch; PO must confirm desync vs scroll expectation | `chart.js` |
| **TAL-01641** | *"changing the timeframe… axes display incorrect times"* | `_endTimeframeSwitching` axis-before-data (`21900–21954`) | `chart.js` |

---

### Ticket → bucket → tranche map

| Ticket | Gridline | Price/time label | Replay-time | Tranche | Status |
|--------|:--------:|:----------------:|:-----------:|---------|--------|
| TAL-01565 | ✓ | ✓ | | A + B | IN-TRACK |
| TAL-01583 | | ✓ | | A | IN-TRACK |
| TAL-01572 | | ✓ | | C | IN-TRACK |
| TAL-01566 | | ✓ | | ~~D~~ | **CLOSED** (D-019) |
| TAL-01604 | | ✓ | maybe | A/C | IN-TRACK |
| TAL-01618 | ✓ | | | B | IN-TRACK |
| TAL-01625 | ✓ | | | B | IN-TRACK |
| TAL-01619 | | ✓ | | **G** | IN-TRACK → **impl Lane 2** |
| TAL-01613 | | | ✓ | E | IN-TRACK |
| TAL-01639 | ✓ | | ✓ | B + E | IN-TRACK |
| TAL-01641 | | ✓ | ✓ | F | IN-TRACK |

**Effective surface:** 10 active tickets → **6 implementation tranches** (A, B, C, E, F, G).

---

### Recommended dispatch order

1. **B** — gridline align (4 tickets, tick-math)
2. **A** — click tick stability (01565/01583)
3. **F** — TF switch commit (01641)
4. **E** — replay zoom anchor (01613/01639)
5. **C** — custom TF (01572)
6. **G** — indicator axis pill (01619) — **dispatched separately (chart-indicators-full.js only)**

**Do not dispatch:** Tranche D / TAL-01566.

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| **I8** | Traced both `chart v 1.4/` and `homepage/public/chart/` paths |
| **I3/I13** | Proposed one switch per tranche; all paths engine-only except G → indicators module |
| **L1** | Build id traced on `20260718b01` |
| **P6** | Ticket quotes from support export |

---

## 6. What I did NOT do / limits

- No browser RED harness for A/B/C/E/F in this diagnostic pass (G implemented separately — see `A1-tranche-G-TAL01619-report.md`).
- TAL-01604 underspecified — needs live triage (canvas vs DOM crosshair).
- TAL-01639 vs code comment at `27657–27659` — PO must confirm desync vs fixed-viewport expectation.
- `chart.js` token held by Worker 4 for R2 — tranches A–F must not land in parallel without coordination.

---

## 7. Live-verification handoff

After each tranche lands, PO confirms on single chart + 2×2 embed:

| Tranche | PO steps |
|---------|----------|
| A | 30m/1h, single click plot — bottom axis label unchanged |
| B | 30m, rightmost 3 verticals — half-hour aligned |
| C | Custom 3m — fixed canvas axis labels visible |
| E | Replay ON, wheel zoom — labels don't slide vs grid |
| F | 1m → 4h switch — axis times match committed bars |
| G | RSI/MACD separate panel — axis pill stays at last-bar Y while crosshair moves |

---

## 8. Status

**DIAGNOSTIC-ONLY** — dispatch map ready. Tranche **G** implementation tracked in separate worker report (`A1-tranche-G-TAL01619-report.md`).
