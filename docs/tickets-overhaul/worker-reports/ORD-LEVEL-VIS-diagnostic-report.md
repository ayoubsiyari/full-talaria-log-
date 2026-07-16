# ORD-LEVEL-VIS — order/pending level invisible until price reaches it (DIAGNOSTIC)

## 1. Task + RC

- **Task:** `ORD-LEVEL-VIS-diagnostic-lane3.md` — read-only diagnosis of PO live report: order/pending level visible in trades panel but not on chart until price reaches the level.
- **RC:** **RC-5** (order-entry / chart overlay). Registered in `RESOLUTION-TRACKER.csv` as `ORD-LEVEL-VIS`.
- **Outcome:** Root cause confirmed with file:line evidence; fix menu ranked; RED scenarios proposed. **No code edits.**

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `docs/tickets-overhaul/worker-reports/ORD-LEVEL-VIS-diagnostic-report.md` | **New.** This diagnostic report. |

**No product, harness, or registry files touched.**

---

## 3. Kill-switch (I3 + I13)

**N/A — diagnostic only.**

Proposed at implement time (see §8):

| Switch (proposed) | Default | Role |
|-------------------|---------|------|
| `window.__TALARIA_DISABLE_ORDER_OFFSCREEN_LEVEL_INDICATOR_V2` | ON (fix when unset) | Edge-marker / domain-expand behavior for off-plot order levels |

If fix spans `chart.js` domain expansion, I13 requires explicit OFF revert proof on autoscale + order overlay paths.

---

## 4. Proof — RED → GREEN

**N/A — no fix landed.**

### Diagnostic evidence (code trace)

**Placement → draw path (pending):**

```25924:25930:chart v 1.4/chart/modules/order-manager.js
        // Draw pending order line and targets
        this.drawPendingOrderLine(pendingOrder);
        this.drawPendingOrderTargets(pendingOrder);
        ...
        this.positionPendingOrderTargets();
```

**Elements created (pending):**

```33240:33245:chart v 1.4/chart/modules/order-manager.js
        const line = chart.svg.append('line')
            .attr('class', `pending-order-line pending-${pendingOrder.id}`)
            ...
```

**Log probe (PO / dev console):** `🎨 Drawing pending …` at line **33222** fires when `drawPendingOrderLine` runs.

**Position + visibility (every render):**

```39388:39419:chart v 1.4/chart/modules/order-manager.js
                const y = ch.scales.yScale(price);
                ...
                    line
                        .attr('x1', 0)
                        .attr('x2', ch.w)
                        .attr('y1', y)
                        .attr('y2', y)
                    ...
                    this._applyOrderRowMainPlotVisibility(ch, y, { line, hitLine: dragHitLine, ... }, plotClipUrl);
```

**Explicit off-plot hide:**

```39255:39271:chart v 1.4/chart/modules/order-manager.js
    /** Hide order row when its Y maps into the indicator stack; clip when inside main plot. */
    _applyOrderRowMainPlotVisibility(ch, y, parts, clipUrl) {
        ...
        const inPlot = this._isOrderYInMainPlot(ch, y);
        ...
            if (!inPlot) {
                sel.style('display', 'none');
                return;
            }
```

**Plot bounds check:**

```9819:9828:chart v 1.4/chart/modules/chart-indicators-full.js
Chart.prototype._isYInMainPricePlot = function(y) {
    ...
    return y >= m.t && y <= plotBottom;
};
```

**Y-domain source (candles only + last price line):**

```24020:24050:chart v 1.4/chart/chart.js
        for (let i = 0; i < priceVisible.length; i++) {
            ...
            if (Number.isFinite(h) && h > maxPrice) maxPrice = h;
            if (Number.isFinite(l) && l < minPrice) minPrice = l;
        }
        ...
            domainMin = minPrice - padding;
            domainMax = maxPrice + padding;
```

```24116:24126:chart v 1.4/chart/chart.js
        // Include effective last price in Y domain ...
        if (this.chartSettings.showPriceLine !== false && this.autoScale) {
            const linePrice = this.resolveEffectiveCurrentPrice(...);
            if (linePrice < domainMin) domainMin = linePrice - pad;
            if (linePrice > domainMax) domainMax = linePrice + pad;
        }
```

No reference to `orderManager.pendingOrders`, `orderLines`, or entry/SL/TP prices in `calculateScales()`.

---

## 5. Question answers

### Q1 — Is `drawPendingOrderLine` called? Are `<line>` elements created?

**Yes — created, not missing.**

- `placePendingOrder` → `drawPendingOrderLine` (25925).
- Appends `.pending-order-line` + hit line + label chrome to `chart.svg` (33240–33312).
- Pushes registry entry to `this.orderLines` (33547–33562).
- Triggers `chart.render()` when not suppressed (33566–33568).
- Console log at **33222** is the correct probe: if PO sees the log but no line, the defect is **position/visibility**, not draw skip.

Initial geometry is applied on the next `updateOrderLines` inside `chart.render()` (26393–26397), not inline in `drawPendingOrderLine`.

### Q2 — Computed Y vs plot height; clipping?

**Y is computed; off-domain Y is intentionally hidden (not merely clipped).**

| Stage | Behavior |
|-------|----------|
| `y = ch.scales.yScale(entryPrice)` | Maps entry price through candle-derived domain |
| Off-domain entry | `y < margin.t` or `y > plotBottom` (typical when limit is far from visible range) |
| `_applyOrderRowMainPlotVisibility` | Sets `display: none` on line + labels when `!_isOrderYInMainPlot(ch, y)` |
| In-plot rows | `clip-path: url(#chart-clip-path…)` via `_applyPlotClipToOrderOverlays` (39284–39317) |

**Verdict:** **Created-but-hidden** (display none), not never-created. Clip-path is secondary; the primary failure mode for far-off levels is **display:none before clip matters**.

When price moves into the visible domain, `y` enters `[m.t, plotBottom]` → display restored → PO sees the level (“appears when price reaches it”).

### Q3 — Where is Y-domain computed? Does it include order levels?

| Site | File:lines | Includes order levels? |
|------|------------|------------------------|
| Primary autoscale | `chart.js` `calculateScales()` ~23794–24145 | **No** — visible OHLC min/max + padding |
| Last-price extension | `chart.js` ~24116–24127 | **Only** `resolveEffectiveCurrentPrice` (current/last price line) |
| Order overlay sync | `order-manager.js` `updateOrderLines` ~39320+ | **Reads** domain; does not expand it |
| Plot bounds | `chart-indicators-full.js` `_isYInMainPricePlot` ~9819–9828 | N/A — pixel band check |

**Working hypothesis: CONFIRMED** — domain is candle-driven; order entry prices are not folded into autoscale.

### Q4 — Open (filled) orders vs pending only?

**Same mechanism for both.**

- Open: `drawOrderLine` (31703) → `updateOrderLines` uses `orderData.openPrice` (39385).
- Pending: uses `orderData.entryPrice` (39374).
- Same `_applyOrderRowMainPlotVisibility` gate (39408–39419).
- Y-axis pill: `drawYAxisPriceHighlight` also **returns null** when off-plot (24271–24274), so open positions get no axis hint either.

PO symptom may be reported more often on **pending** placements far from market, but **open** entry lines off the visible range behave identically.

### Q5 — Existing off-screen edge marker / arrow?

**No working affordance for off-plot orders.**

- Open-order **arrow** glyph (↑/↓) exists on-row (31769–31776) but is hidden with the rest when off-plot.
- `drawYAxisPriceHighlight` (24267) draws a price pill on the Y-axis **only when** `_isYInMainPricePlot(y)` — off-plot → `return null` (24272–24274).
- `updateOrderLines` only calls `drawYAxisPriceHighlight` when already in plot (39617–39618).

There is **no** edge-pinned arrow/price stub for off-screen levels today.

### Q6 — Multichart / panel B?

**Same per-chart logic; not main-only.**

| Layout | Path |
|--------|------|
| Legacy `panelManager` multi-panel | `drawPendingOrderLine` fans out via `_collectLayoutCharts()` (33202–33210); each matching chart gets its own SVG layers |
| React multichart iframe | `refreshPendingOrderGraphicsForChart` (33578) + `panel-cmd-bridge.js` `pending-updated` (~3536) rebuild graphics per iframe chart |

Each panel’s `calculateScales()` is independent (per iframe `window.chart`). If panel B’s visible candle range does not include the entry price, **panel B shows the same invisible-until-in-domain behavior**. Not isolated to host chart.

---

## 6. Root cause (confirmed)

**Primary:** Y-autoscale domain is derived from **visible candle OHLC** (plus optional last-price extension), **excluding** pending/open order entry prices and SL/TP levels.

**Secondary (explicit product logic):** `order-manager.js` **`_applyOrderRowMainPlotVisibility`** hides all order row SVG when mapped Y falls outside the main price pane (`_isYInMainPricePlot`). This was added to keep order chrome out of the indicator stack — it also suppresses legitimately far-away **price** levels.

**Net:** Lines are **created and positioned** at the true scaled Y, then **`display: none`** when that Y is off-plot. PO trades panel is unaffected (data model is correct). Chart appears empty until autoscale window includes the entry price.

---

## 7. Ranked fix menu

| Option | Description | Touch surface | Cost | Freeze-risk | Kill-switch (proposed) |
|--------|-------------|---------------|------|-------------|------------------------|
| **(A)** | Expand Y-domain in `calculateScales` to include active `pendingOrders` + open position entry/SL/TP prices (mirror last-price extension block) | `chart.js` ~24116 region | Medium | **HIGH** — contested chart core / D-017 / TF cadence bands | `__TALARIA_DISABLE_ORDER_LEVEL_Y_DOMAIN_V2` |
| **(B)** | Off-screen edge indicator: when `!_isOrderYInMainPlot`, pin a compact marker at `y = m.t` or `y = plotBottom` with direction arrow + formatted price; keep full line when in-plot | `order-manager.js` `_applyOrderRowMainPlotVisibility` / new helper | Low–medium | **LOW** — Lane 3 freeze-safe | `__TALARIA_DISABLE_ORDER_OFFSCREEN_LEVEL_INDICATOR_V2` |
| **(C)** | Both A + B | `chart.js` + `order-manager.js` | High | **HIGH** (chart half) | Combined or per-leg switches |

### Recommendation

**Implement (B) first** — freeze-safe, localized to `order-manager.js`, matches TradingView-style “level exists above/below screen” without changing autoscale semantics for all users.

**(A) optional / separate** — improves “scroll to see full line” but changes Y-axis framing globally (may shrink candle detail when many far levels exist). **Recommend Director/Manager scope call** before `chart.js` domain edits during deploy freeze.

**Verdict class:** **Product parity gap** (intentional hide + missing edge affordance), not a broken place-order pipeline. Straight bug-fix for **(B)**; **(A)** is a scope decision.

---

## 8. Proposed RED scenarios (implement + Lane 4 harness)

| Id | Setup | Actuation (I15) | End-state assertion (not proxy) |
|----|-------|-----------------|--------------------------------|
| **RC5-ORD-LEVEL-VIS-1** | Live/replay chart, auto-scale on, place **pending limit** entry ≥5% outside visible candle high (BUY) or low (SELL) | Real order panel place (same path as PO) | Within 1s of place: either (a) `.pending-order-line` has `display≠none` and `y1` within `[m.t, plotBottom]`, **or** (b) edge marker visible at plot top/bottom with parsed price === `entryPrice` |
| **RC5-ORD-LEVEL-VIS-2** | Market order filled; manually set SL far off visible range | Real SL drag/place | `.sl-line` or edge marker visible with price token matching store SL |
| **RC5-ORD-LEVEL-VIS-3** | Multichart panel B, same symbol | Place pending on panel B | Same assertion inside **panel B iframe** `window.chart` (build id + store) |
| **RC5-ORD-LEVEL-VIS-OFF** | Switch OFF | Repeat VIS-1 | Restores current hide behavior (regression guard) |

**Fast-loop property (dev):** mock `chart.scales.yScale` with domain `[100,110]`, entry `125` → `y > plotBottom` → assert current code sets `display:none`; after fix assert edge marker on.

---

## 9. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| **Read-only guardrail** | No edits to `chart.js`, `replay-system.js`, re-migration files |
| **I15** | Trace follows real place → draw → render → updateOrderLines path |
| **Freeze-safe** | Diagnosis only; fix recommendation defaults to `order-manager.js` |

---

## 10. What I did NOT do / limits

- No live PO reproduction or console log capture on built product.
- Did not trace SL/TP-only off-plot cases separately (same visibility gate in `updateSLTPLines`).
- Did not profile manual Y-pan/zoom (`autoScale=false`) — manual mode still uses fixed `manualCenterPrice/manualRange`; off-plot hide remains.
- Preview/draft lines (`isPreview: true`) not fully compared — may differ in axis highlight timing only.
- Harness scenarios not registered (Lane 4).

---

## 11. Live-verification handoff (for implement)

1. Open chart with auto-scale; note visible price range.
2. Place pending limit **above** visible high (e.g. BUY limit +2–5% above last).
3. Console: confirm `🎨 Drawing pending` log (33222).
4. Inspect DOM: `.pending-order-line` exists; check `style.display` and `y1` vs chart height.
5. Pan/zoom or wait for price to approach level — line should appear (confirms hide-until-in-domain).
6. Repeat on multichart panel B if available.

---

## 12. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)**

**Root cause:** Created-but-hidden — Y-domain excludes order prices; `_applyOrderRowMainPlotVisibility` sets `display:none` when scaled Y is outside main plot. **Recommend fix (B) edge marker in `order-manager.js`; defer (A) domain expansion pending scope approval.**
