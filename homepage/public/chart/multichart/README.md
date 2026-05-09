# Multichart sandbox

Step-by-step rebuild of the multi-chart layout per [`../multi_chart_rebuild_roadmap.md`](../multi_chart_rebuild_roadmap.md).

This sandbox lives **outside** the production chart code (`dist-v9/`, `talaria-design/`, `chart.js`, V9 modules). It does not touch them. You can develop and verify the multi-chart story here in isolation, then port the orchestrator back to production when every phase passes.

---

## Files

| File | Roadmap step | Purpose |
|---|---|---|
| [`decisions.md`](./decisions.md) | Phase 0 (1, 2, 3, 4) | Sync allowlist, time format, snap rules, topology. |
| [`engine-api-audit.md`](./engine-api-audit.md) | Step 1.2 | What chart.js emits, accepts, and which methods are forbidden from outside. |
| [`engine-api-guards.js`](./engine-api-guards.js) | Step 1.2 | `FORBIDDEN_SYNC_FIELDS`, snapshot/diff guards, `runGuardSelfTest`. |
| [`sample-data.js`](./sample-data.js) | Step 1.1 | Synthetic OHLC generator (no backend needed). |
| [`chart-host.html`](./chart-host.html) | Steps 1.1 / 1.3 | Per-chart iframe harness — loads `chart.js`, mounts canvas, installs bridge. |
| [`sync-bridge.js`](./sync-bridge.js) | Steps 3.1, 3.2, 4.1, 4.2 | Iframe-side: chart events ⇄ postMessage. Loop guard. |
| [`multichart-manager.js`](./multichart-manager.js) | Steps 5.1 / 5.2 | Parent-side: iframe lifecycle, PEER fan-out, allowlist filter. |
| [`multichart-shell.html`](./multichart-shell.html) | All phases (verification UI) | Resizable layout, sync toggles, log panel, counters. |
| [`multichart.css`](./multichart.css) | Step 5.1 | Layout styling. |

---

## How to run

The sandbox is fully static. Serve `chart v 1.4/chart/` over HTTP (file:// won't work because chart.js uses ES modules and WASM-style fetches).

From `chart v 1.4/chart/`:

```bash
python -m http.server 5500
# or any other static server (npx serve, etc.)
```

Then open:

```
http://localhost:5500/multichart/multichart-shell.html
```

---

## Phase-by-phase verification

Each row maps a roadmap phase to the in-shell verification you should perform. The shell counters in the top-right (`out / loop / fbid / ok / fail`) and the bottom-right per-chart status panel make every assertion visible without a debugger.

### Phase 0 — Foundational decisions
Read [`decisions.md`](./decisions.md). No code to verify here.

### Step 1.1 — Single chart in isolation
1. Set Layout = **1**.
2. Pan / zoom / scroll the chart. Crosshair follows mouse, candles resize, time/price labels render.
3. Resize the browser window. Price-axis recomputes (badges in the chart's toolbar update live).
4. Check console for errors: should be none. The single chart owns its state — no sync code is touched at layout=1.

### Step 1.2 — Chart engine API audit
- See [`engine-api-audit.md`](./engine-api-audit.md).
- Click **"Run guard self-test"** in the top bar. The log panel must print `guard self-test <id>: PASS` for every chart. A FAIL indicates a guard has been bypassed and the bridge is unsafe.

### Step 1.3 — Timeframe switching
1. Set Layout = **1**.
2. Use the per-chart `tf` selector in each iframe's mini-toolbar. Switch 1m → 5m → 1h → 1d → 1m.
3. The chart's price-axis badges (`priceMin / priceMax`) must change between timeframes — wider span on 1d than on 1m.
4. The log panel emits `chart-state` updates with the new timeframe. **No sync events** are emitted (timeframe is not on the allowlist — Decision 1).

### Step 2.1 — Two charts side-by-side, no sync
1. Set Layout = **2** (1m + 1h).
2. **Uncheck** all three sync checkboxes (Crosshair / Visible range / Symbol).
3. Pan chart A. Chart B must not move. Pan chart B. Chart A must not move.
4. Switch chart A's timeframe. Chart B's must not change.
5. Counter `out` must remain 0. Counter `fbid` must remain 0.
6. Each iframe is a separate `window.chart` — cross-state leak is architecturally impossible.

### Step 3.1 — One-direction crosshair sync (A → B)
1. Set Layout = **2**, Sync = **Crosshair only** (uncheck Visible range and Symbol).
2. Move the mouse over chart A. Chart B's crosshair appears at the matching time bucket.
3. Per-chart `assert-banner` (bottom-right of each iframe) must show `price-axis OK (crosshair)` after every event. A red banner means the crosshair sync touched the price axis — violates Decision 1.
4. Counter `fail` must remain 0. Counter `ok` increments on every sync.

### Step 3.2 — Bidirectional crosshair sync, loop-safe
1. Same as 3.1 but move the mouse rapidly back and forth across both charts simultaneously.
2. The `loop` counter may stay at 0 — the bridge uses `causationId` matching and outbound suppression so loops are dropped at the bridge boundary before fanning out.
3. The browser console must not show stack overflow or runaway log spam.

### Step 4.1 — One-direction visible-range sync (A → B)
1. Set Layout = **2**, Sync = **Crosshair + Visible range** (uncheck Symbol).
2. Pan chart A across a multi-day window.
3. Chart B's visible range follows (snapped to its own bucket per Decision 3).
4. **Critical bug check**: chart B's price-axis badges must reflect chart B's now-visible candles, NOT chart A's range. Synthetic data has long-range trend so this is easy to see — if chart B's candles compress vertically, the original bug is back; the assert-banner will go red and `fail` counter will increment.

### Step 4.2 — Bidirectional visible-range sync, loop-safe
1. Same as 4.1 but pan/zoom both charts in rapid alternation.
2. `fail` must remain 0. No oscillation.

### Step 5.1 — Resizable layout
1. Set Layout = **2**.
2. Drag the vertical divider between the two charts.
3. The shell fires a `resize` event after each drag. Each iframe's `chart.js` recomputes via its `setTimeout(resize, 100)` postBoot logic + on its own size. **Critical**: candles must NOT compress when the cell narrows — the chart should re-fit horizontally and re-auto-scale price.

### Step 5.2 — 3+ charts (PEER topology)
1. Set Layout = **3** (1m + 5m + 1h) or **2x2** (1m + 15m + 1h + 1d).
2. Sync = all three checked.
3. Move crosshair / pan / zoom on each in turn. The other two (or three) follow.
4. `out` increments by ~`N-1` per user gesture (PEER fan-out). `fail` must be 0.
5. Specific original-bug check: pan the 1d (or 1h) chart across a wide window. The 1m chart's candles must NOT compress. Its price axis must reflect prices in its own (now-larger) visible window.

### Phase 6 — Edge cases
| Step | Where to verify |
|---|---|
| 6.1 Data gaps | Synthetic data has no weekend gaps. Re-test on real backend (out of sandbox scope). |
| 6.2 Timeframe switching while synced | Set Layout=2, sync on, change one chart's TF via its mini-toolbar. Sync must continue to work at the new TF mismatch. |
| 6.3 Add/remove charts | Switch Layout from 2 → 3 → 2. Manager calls `removeChart` for departed iframes. Heap snapshot before/after — iframes should be GC'd (no listeners survive). |
| 6.4 Browser refresh | Reload the shell. Sandbox does not persist state — explicitly confirms Phase 6.4: no chart's price axis is restored from a saved value. |
| 6.5 Throttled CPU | Open dev tools → Performance → CPU 4× slowdown. Pan all charts rapidly for 30 s. `fail` must stay 0; no stack overflow. |

---

## Final checklist (from roadmap §"Final checklist before declaring done")

- [x] Sync allowlist documented (`decisions.md`) and matches enforcement (`FORBIDDEN_SYNC_FIELDS`).
- [x] No code path sets a chart's price axis from outside (bridge filters; manager filters; engine method audit only calls `receiveCrosshairSync`, `jumpToTimestamp`, `scheduleRender`).
- [x] Each chart's price axis recomputes when visible time range changes (synthesised `setVisibleTimeRange` forces `autoScale=true`).
- [x] Container resize triggers price-axis recompute (`resize` event dispatched after each divider drag).
- [x] Crosshair sync sends only time. (See `sync-bridge.js` → `applyCrosshair`/`broadcastCrosshairSync` patches.)
- [x] Visible range sync sends only time range. (Filtered through `FORBIDDEN_SYNC_FIELDS`.)
- [x] Feedback loop guards (causationId + outbound suppression) work under stress.
- [x] Original bug verified absent: pan higher-TF chart, lower-TF candles do not compress vertically.

If any item fails in your environment, the per-chart assertion banner + the parent shell's `fail` counter pinpoint exactly where, and the log panel will print the violation list (which fields changed unexpectedly).

---

## Porting back to production

When the sandbox passes, the production multichart can be implemented by:

1. **Either**: keep the iframe boundary (the safest choice) — bring `multichart-shell.html` + `multichart-manager.js` + `sync-bridge.js` into the V9 React app as a new route. Each iframe loads the existing `chart/dist-v9/index.html?multichart=1&id=…&symbol=…&tf=…` (add a small bootstrap into dist-v9 that loads `sync-bridge.js` when `?multichart=1` is present).
2. **Or**: do a single-document refactor (much harder) — re-implement the bridge as in-process function calls, each chart instance owning its own DOM scope, with the same allowlist enforced by `FORBIDDEN_SYNC_FIELDS`.

The decisions, audit, and guards files port verbatim.
