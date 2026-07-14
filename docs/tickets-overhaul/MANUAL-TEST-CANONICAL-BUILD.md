# Manual test sheet — canonical build (PO self-serve)

**Purpose:** verify every landed fix with your own eyes. Mark each **PASS / FAIL / CHANGED**.

## Before you start (critical)
- These fixes are **not on the server until the canonical build is deployed.** If you test the current server build now, most multichart items will still show the OLD behavior — that is "not deployed yet", not "broken".
- **Build check:** open DevTools console on the host page → the build id (`__TALARIA_CHART_BUILD_ID` or the `?v=...` on scripts) must match the canonical build id Worker 4 reports. Then open a panel iframe context in the console dropdown and confirm the **same** id inside the iframe. If the ids differ or are old: unregister service workers → Clear site data → hard reload.
- Layout to use: multichart **2-panel** backtest (e.g. `...dist-v9/index.html?mode=backtest&mcLayout=2v`). "Panel A" = host tile, "Panel B" = the iframe panel.

---

## A. Multichart panel B (the iframe fixes)
Do each on **Panel B** (the iframe one), since Panel A mostly worked before.

| # | Action | PASS if | Result |
|---|--------|---------|--------|
| A1 | Place a trendline on Panel B, single-click its body | The top V9 quick-bar / selection chrome appears (drawing is selected) | ☐ |
| A2 | Double-click the drawing | Settings open **and stay open** (no flash-open-then-close) | ☐ |
| A3 | Ctrl+drag a box around 2 drawings | A **blue marquee** draws during the drag, and **both** get selected on release | ☐ |
| A4 | Select a drawing, press **Esc** | Drawing deselects AND the top selection bar disappears | ☐ |
| A5 | Select a drawing, press **Delete** | Drawing is removed, no ghost/leftover toolbar | ☐ |
| A6 | Look at the toolbar | **Exactly one** toolbar (the current V9 quick-bar) — not the old one stacked on top | ☐ |
| A7 | Select in Panel B, then select a drawing in Panel A | Panel B's selection **clears** when Panel A takes over (no double-selected panels) | ☐ |

## B. Single chart (make sure we didn't break what worked)
| # | Action | PASS if | Result |
|---|--------|---------|--------|
| B1 | On a single chart: select, Esc, Delete, double-click settings | All behave exactly as before (this is the I9 regression guard) | ☐ |

## C. Replay (A3)
| # | Action | PASS if | Result |
|---|--------|---------|--------|
| C1 | Set replay to **Tick** mode, interval **4h**, press play | Playback stays **tick** animation (does NOT silently switch to candle-by-candle); step cadence is steady; the UI shows **both** Tick + the interval | ☐ |

## D. Order-entry
| # | Action | PASS if | Result |
|---|--------|---------|--------|
| D1 | Place a multi-entry order, two legs 50/50, delete one leg | Footer shows 100% (not stuck at 50); average entry tracks; PNL sign correct after a partial TP | ☐ |
| D2 | Set SL/TP to a value **below 10** | The SL/TP lines render (not hidden) | ☐ |
| D3 | Type a trailing decimal like `0.` in a field | Lot size does NOT drop to zero | ☐ |
| D4 | Drag a buy entry through Limit → Market → Stop | The order-type label tracks continuously during the drag; no console error | ☐ |
| D5 | Two entry legs at the **same price**; click the ✕ on one | A single ✕ removes just that leg; you can drag each leg independently | ☐ |

## E. RC-3 volume anchoring (only if Worker 1's Phase 1 is in this build)
| # | Action | PASS if | Result |
|---|--------|---------|--------|
| E1 | Place an Anchored VWAP or Volume Profile, then change the timeframe | The tool stays anchored to the **same candle/time** (does not jump/strand to a different bar) | ☐ |

---

## How to read results
- **All A + B + C + D PASS** → the multichart + replay + order-entry batch is good; I close those tickets.
- Any **FAIL** → tell me the row id (e.g. "A4 FAIL") and what you saw; I route it to the owning lane immediately.
- Ignore E if Worker 1's Phase 1 isn't in the deployed build yet.

## Optional: test locally right now (without the server)
If you don't want to wait for the server deploy — but **only do this if Worker 4 is NOT mid-build**, or you'll collide:
1. `cd "chart v 1.4/talaria-design"; npm run build:live`
2. `cd "../chart/multichart-prod/harness"; node serve.mjs` (note the port it prints)
3. Open `http://127.0.0.1:<port>/chart/dist-v9/index.html?mode=backtest&mcLayout=2v`
4. Run sections A–E above.
