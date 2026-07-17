# Panel-B order lockout — PO live-repro checklist (read-only prep)

**Build under test:** **`20260717b37`** (A6-4 + interims landed, **not shipped**)  
**Symptom:** Intermittent “can’t add order on panel B” — Execute no-op, no open line, or order on wrong tile.  
**Mechanism family:** replay-enter race + focus routing + stuck provisional/draft-drag (parity diagnostic ranks 1–3).  
**A6-4 cure path:** Step 2 host-canonical place + Step 3 snapshot; interims replay gate + focus-loss cancel still active.

**I15:** Real pointer on built product (`npm run build:live` or homepage deploy mirror). DevTools open before step 1.

---

## A. Setup (all legs)

| # | Action | Pass criterion |
|---|--------|----------------|
| A1 | Hard refresh (Ctrl+Shift+R) on chart URL with cache bust `?v=20260717b37` | Console: `[Talaria] chart build 20260717b37` |
| A2 | Load or create a **backtest session** with replay-capable history | Replay button available |
| A3 | Layout picker → **2 vertical** (`2v`) | Tile A (host) + tile B (iframe) visible |
| A4 | Set **different tickers**: e.g. A = `GBP/USD` (or file25), B = `EUR/USD` (or file27) | Status/legend shows distinct symbols per tile |
| A5 | Enter **replay** from host controls (Play or Enter Replay) | Both tiles show replay chrome / playhead active |
| A6 | Confirm focus frame: **click inside panel B canvas** once | Blue focus ring on tile B (not A) |

**Console filters (parent document):**

- `[MultichartGrid] iframe placeOrder failed`
- `[MultichartGrid] iframe replay not active`
- `[MultichartGrid] host-canonical placeOrder failed`
- `multichartFocusChanged`

---

## B. Primary lockout repro — “fast Execute after split” (rank #1)

Reproduces replay-enter race: Execute before iframe B `replaySystem.isActive`.

| Step | Exact click sequence | RED (legacy / switches OFF) | GREEN (b37 default ON) |
|------|----------------------|----------------------------|-------------------------|
| B1 | Pause replay if playing | — | — |
| B2 | Layout **1 → 2v** (or fresh page already 2v) | — | — |
| B3 | Set B ticker (if not already) | — | — |
| B4 | Enter replay; **do not wait** | — | — |
| B5 | **Immediately** click panel B canvas (focus B) | — | Focus on B |
| B6 | Within **≤1 second**, rail **Execute** (parent `#placeOrderButton`) | Often **no order** on B; parent console may show `iframe replay not active` or `placeOrder failed` | Order appears on **B chart** (lines + entry marker); host store row with B `sourcePanelId` / correct ticker |
| B7 | Wait 3s; Execute again on B (same side/qty) | Second entry may also fail if race persists | **Second order places** (or clear toast if qty invalid) |

**Pass (cured):** B6 and B7 both produce visible order on **panel B** (not silently on A only).

**Fail (lockout still present):** B6 no-op with console error above; no open/pending line on B after 5s.

---

## C. Focus-routing repro — “stale focus after A entry” (rank #2)

| Step | Exact click sequence | RED | GREEN |
|------|----------------------|-----|-------|
| C1 | Focus **A** (click host canvas) | — | — |
| C2 | Execute → confirm order on **A** | Order on A | Order on A |
| C3 | **Without** clicking B canvas, click rail Execute again | Order may land on **A** again while user expects B | N/A if user didn’t focus B — **skip**; this leg tests mis-focus |
| C4 | Click **B canvas** (focus B) | Focus ring moves to B | Focus ring on B |
| C5 | Execute on B | Sometimes nothing on B (command still routed wrong) | Order on **B** only |
| C6 | Open Positions / trades rail | Row shows B symbol | Row tagged B ticker / panel attribution |

**Pass:** After C4→C5, new order is on **B symbol** only.

---

## D. Stuck-guard repro — “SL drag then next entry” (rank #3)

| Step | Exact click sequence | RED | GREEN |
|------|----------------------|-----|-------|
| D1 | Focus B; place one market/limit order on B (wait for fill line) | Order on B | Order on B |
| D2 | Drag **SL line** on B chart ~20 pips; **release** on chart | SL moves | SL moves |
| D3 | **Immediately** click parent Execute (do not change focus) | Entry swallowed — no new preview/line; draft may feel “dead” | New preview or pending line appears |
| D4 | Click **panel A** canvas (defocus B) | — | Focus on A |
| D5 | Click **panel B** canvas again | — | Focus back on B |
| D6 | Execute on B | Still blocked if provisional stuck | **Order places** |
| D7 | Parent console: no perpetual `multichartDraftDragBusy` | Busy flag stuck | After D4, draft drag cleared (`multichart-focus-loss-clear-draft`) |

**Pass:** D3 and D6 both accept new entry on B after SL drag + focus swap.

**Bisect:** set `__TALARIA_DISABLE_ORDER_PROVISIONAL_FOCUS_CANCEL_V1=true` → RED should return on D4–D6.

---

## E. Stress combo (optional, 5× repeat)

| Step | Action |
|------|--------|
| E1 | Loop 5×: focus A → Execute → focus B → Execute **within 1s of replay resume** |
| E2 | Record failures / console lines |

**Pass:** ≥4/5 B executes succeed on b37 default switches.

---

## F. Quick iframe sanity (when Execute fails)

In **panel B iframe** DevTools console (select B frame):

```javascript
chart.replaySystem?.isActive
chart.replaySystem?.replayTimestamp
chart.orderManager?.openPositions?.length
```

| Check | Healthy |
|-------|---------|
| `isActive` when parent replay on | `true` |
| Execute failed but `isActive === false` | Replay-enter race (rank #1) |
| `openPositions` grows after successful Execute | Store mutation OK |

On **b37** with A6-4 Step 2 ON, parent Execute on B uses **host-canonical place** — iframe `placeOrder` should **not** be called; filter instead for `host-canonical placeOrder`.

---

## G. Switch bisect (confirm cure mechanism)

Run legs **B** and **D** once with each switch OFF (refresh between):

| Switch OFF | Expected RED returns |
|------------|---------------------|
| `__TALARIA_DISABLE_ORDER_MC_PLACE_REPLAY_GATE_V1` | Leg B fast Execute |
| `__TALARIA_DISABLE_ORDER_PROVISIONAL_FOCUS_CANCEL_V1` | Leg D after focus swap |
| `__TALARIA_DISABLE_ORDER_MC_HOST_PLACE_V1` | Leg B/C may revert to iframe place + replay race |
| `__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX` | Full legacy clone path |

---

## H. Sign-off row (PO)

| Leg | b37 result | Tester | Date |
|-----|------------|--------|------|
| B — fast Execute | ☐ PASS ☐ FAIL | | |
| C — focus routing | ☐ PASS ☐ FAIL | | |
| D — SL drag + re-entry | ☐ PASS ☐ FAIL | | |
| E — 5× stress (optional) | ☐ PASS ☐ FAIL | | |

**Status:** ☐ **CURED on b37** ☐ **STILL FAILING** — attach console snippet + which leg.

**Note:** Lockout leg is **NEEDS-LIVE** on A6-4 impl report; does not substitute for Lane 4 D-026 gate or ship-gate.
