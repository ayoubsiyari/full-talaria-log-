# PO visual-check pack — all 26 `po-eyes` rows

**Stamp to test:** `20260730b113` only  
**Canary:** `http://31.97.192.82:3000`  
**Binding:** TEST-01 — every declared commit/marker below was verified on this stamp’s wire **before** this pack was offered.  
**Time target:** ~35–40 min · **one** CONF-01 multichart open · do not reopen 2×2 per row  
**Fill:** tick **PASS** or **FAIL** only — no prose required  
**Tip that built this pack:** see `git rev-parse --short HEAD` on `manager-d/trade-correctness`

---

## Preflight (D already ran — PO confirms stamp only)

| Check | Result on b113 |
|---|---|
| MEAS-01 stamp on page | write here: _______________ (must be `20260730b113`) |
| Chart shell served (`chart.js`) | YES |
| Order-line markers (stack / edge / stable-label) | ON-WIRE |
| M24 display-id + journal display helper | ON-WIRE |
| Screenshot idempotent + lifecycle ownership | ON-WIRE |
| Rows pulled for missing wire | **none** — all 26 stay in pack |

If the stamp on screen is **not** `20260730b113`, **stop**. Do not run this pack.

---

## One-time setup (do once)

1. New session on stamp `20260730b113`.
2. Multichart **2×2**.
3. Four symbols: EURUSD · GBPUSD · USDJPY · XAUUSD.
4. Four TFs: 1m · 5m · 15m · 1H (one per panel).
5. One indicator visible on each panel.
6. One small live / pending order visible on the host panel.
7. Write MEAS-01 stamp above.
8. Keep this layout open for the whole pack. Only change what a section asks.

---

## Scorecard (tick one box per row)

| # | Row | Setup section | PASS | FAIL |
|---|---|---|:---:|:---:|
| 1 | TAL-01724 | A Viewport | ☐ | ☐ |
| 2 | TAL-01734 | A Viewport | ☐ | ☐ |
| 3 | TAL-01735 | A Viewport | ☐ | ☐ |
| 4 | TAL-01755 | A Viewport | ☐ | ☐ |
| 5 | TAL-01768 | A Viewport | ☐ | ☐ |
| 6 | TAL-01821 | A Viewport | ☐ | ☐ |
| 7 | TAL-01823 | A Viewport | ☐ | ☐ |
| 8 | TAL-01838 | A Viewport | ☐ | ☐ |
| 9 | TAL-01862 | A Viewport | ☐ | ☐ |
| 10 | TAL-01916 | A Viewport | ☐ | ☐ |
| 11 | TAL-01928 | A Viewport | ☐ | ☐ |
| 12 | TAL-01898 | B TF / history | ☐ | ☐ |
| 13 | TAL-01925 | B TF / history | ☐ | ☐ |
| 14 | TAL-01917 | B TF / history | ☐ | ☐ |
| 15 | TAL-01909 | C Session | ☐ | ☐ |
| 16 | TAL-01929 | C Session | ☐ | ☐ |
| 17 | TAL-01923 | D Drawings | ☐ | ☐ |
| 18 | TAL-01700 | E Crosshair | ☐ | ☐ |
| 19 | TAL-01934 | E Crosshair | ☐ | ☐ |
| 20 | TAL-01717 | F Multichart | ☐ | ☐ |
| 21 | TAL-01696 | G Order lines | ☐ | ☐ |
| 22 | TAL-01698 | G Order lines | ☐ | ☐ |
| 23 | TAL-01617 | G Order lines | ☐ | ☐ |
| 24 | TAL-01911 | H History / journal | ☐ | ☐ |
| 25 | TAL-01796 | H Markers | ☐ | ☐ |
| 26 | TAL-01940 | H History / journal | ☐ | ☐ |

---

## Section A — Viewport / scale / toolbar (Cluster J) · rows 1–11

**Keep** the 2×2 from setup. Work on the host panel unless noted.  
**Declared wire (TEST-01):** chart shell on b113 (`chart_chart.js` served). No separate money-path kill-switch; these are first-look UI confirms on the deployed shell.

### Steps (run once; score each row from what you saw)

1. Narrow the browser or set browser zoom >100%. Look at the toolbar.
2. Scroll the **price scale** up, then down.
3. Switch host panel to a custom **3m** TF (or nearest custom), zoom out, watch grid / time labels.
4. Reset the chart (keyboard reset if you use it).
5. Drag the **time axis** label left, then right.
6. Toggle news flags if present; zoom in/out and watch flag size.
7. Zoom with wheel both directions on the chart body.

### Observables

| Row | Pass looks like (observable) |
|---|---|
| TAL-01724 | Gridlines stay evenly spaced; no day-scale gaps after zoom/reset. |
| TAL-01734 | Custom TF labels stay on the correct day/time ticks (not days apart). |
| TAL-01735 | Dragging the time label pans time; chart does **not** run away or blank. |
| TAL-01755 | Wheel / trackpad zoom direction matches expectation (in≠out reversed). |
| TAL-01768 | Price-scale scroll: up and down move price opposite ways (not both zoom). |
| TAL-01821 | After reset, dense per-candle grid clutter does **not** return. |
| TAL-01823 | News / event flags stay roughly constant size while zooming. |
| TAL-01838 | Toolbar controls remain separately clickable (no overlap pile). |
| TAL-01862 | At narrow width, toolbar remains usable (no clipped dead controls). |
| TAL-01916 | Zoom in/out changes bar width; playhead/content stays on screen. |
| TAL-01928 | Toolbar icons/labels remain readable at 100% and >100% browser zoom. |

---

## Section B — TF / history (Cluster I) · rows 12–14

**Still** on the same 2×2. Focus host panel.

**Declared wire:** `chart.js` + `replay-system.js` on b113 (shell). Kin markers for cross-TF work already on-wire for related fixed rows (`TAL-01802` / `TAL-01886`); this section is visual confirm only.

### Steps

1. On host, note a recognizable area on **1W**.
2. Switch **1W → 1h → 5m → 1W**. Watch whether the date area stays near the same region and candles actually change per TF.
3. Freeze / pause at a playhead. Glance whether the visible price is sane across panels (no obvious wrong decade).

### Observables

| Row | Pass looks like |
|---|---|
| TAL-01898 | Weekly → lower TF does **not** jump to an unrelated year/region. |
| TAL-01925 | Same as 01898 on a second try from a different weekly candle. |
| TAL-01917 | Each TF switch redraws candles for that TF (not a frozen previous TF). |

---

## Section C — Session resume (Cluster D) · rows 15–16

**Declared wire:** chart shell on b113.

### Steps

1. Note host symbol + approximate playhead time.
2. Refresh the browser; re-enter the **same** session.
3. Confirm layout returns; playhead/session position is usable (not error dialog).

### Observables

| Row | Pass looks like |
|---|---|
| TAL-01909 | Same session reopens without an error toast/dialog. |
| TAL-01929 | After resume, you are not silently dumped on a wrong future/past day. |

---

## Section D — Drawings lag (Cluster L) · row 17

**Declared wire:** chart shell on b113.

### Steps

1. Draw one line + text label on host.
2. Press Play ~10 seconds; watch the drawing vs candles.
3. Pause.

### Observables

| Row | Pass looks like |
|---|---|
| TAL-01923 | Drawing/label stays attached to its price/time; does not visibly trail the candles. |

---

## Section E — Crosshair (Cluster K) · rows 18–19

**Declared wire:** chart shell on b113.

### Steps

1. Start replay on host.
2. Hold crosshair still over the chart for ~10 advancing candles.
3. Watch the crosshair **time** readout.

### Observables

| Row | Pass looks like |
|---|---|
| TAL-01700 | Crosshair time label **updates** as candles advance (not frozen). |
| TAL-01934 | Crosshair remains usable while replay runs (no stuck/ghost cursor). |

---

## Section F — Multichart peers (Cluster C) · row 20

**Declared wire:** `multichart-manager.js` on b113. (Rayan #2 money retain is separately on-wire by runtime probe — this row is visual peer motion.)

### Steps

1. With all four panels playing, watch non-host panels for ~15 seconds.
2. Pause host only if the UI allows; otherwise just observe peers.

### Observables

| Row | Pass looks like |
|---|---|
| TAL-01717 | Peer panels keep advancing with host (not frozen/stale while host moves). |

---

## Section G — Order lines (Cluster G leftovers) · rows 21–23

**Declared commits / markers (TEST-01 — verified on b113 wire):**

| Marker | Introducing commit |
|---|---|
| `__TALARIA_DISABLE_ORDER_MULTI_TP_COINCIDENT_STACK_V1` | `28d808cb4` |
| `__TALARIA_DISABLE_ORDER_LINE_EDGE_VISIBILITY_V1` | `c0a0d7620` |
| `__TALARIA_DISABLE_ORDER_STABLE_LABEL_HOVER_DOM_V1` | `2cc949399` |

### Steps

1. On host, open order panel; draft entry + SL + **two** TPs.
2. Drag entry slowly; drag SL; drag each TP (put TP1/TP2 close, pan/zoom, grab each).
3. Escape cancel the draft; start a fresh draft — confirm no ghost SL/TP.
4. Place a small pending; cancel it; confirm markers clear.

### Observables

| Row | Pass looks like |
|---|---|
| TAL-01696 | Entry/SL/TP lines stay **visible** while dragging. |
| TAL-01698 | Panel numbers / RR move **with** the drag (not only on mouse-up). |
| TAL-01617 | After Escape/cancel, **no** old SL/TP/entry ghost returns on the next draft. |

---

## Section H — History / markers / journal side-effects · rows 24–26

**Declared commits / markers (TEST-01 — verified on b113 wire):**

| Marker | Introducing commit |
|---|---|
| `_resolveJournalDisplayTradeId` | `2cc949399` (with M24 display stability) |
| `__TALARIA_DISABLE_M24_DISPLAY_ID_STABILITY_V1` | `2cc949399` |
| `__TALARIA_DISABLE_ORDER_ENTRY_SCREENSHOT_IDEMPOTENT_V1` | `c0a0d7620` |

### Steps

1. Place one small market/limit trade on host; close it (or let it close).
2. Open All Trades / history — note the new row + trade id shown.
3. Switch host TF away from 1m and back; watch the entry/exit marker on chart.
4. Refresh; re-enter session; open history again.
5. Open the trade card once — confirm screenshot count looks like one capture, not a growing stack from re-open.

### Observables

| Row | Pass looks like |
|---|---|
| TAL-01911 | Closed trade is in history after refresh; chart marker matches that row. |
| TAL-01796 | Marker stays on the **same** candle/time across TF change and back. |
| TAL-01940 | Re-opening the trade card does **not** add a second screenshot / duplicate side-effect. |

---

## After the pack

- Send the scorecard (this file or a photo of the ticks).
- Any **FAIL** → that row becomes `broken` on b113 and blocks canary for that family.
- All **PASS** → D flips those 26 from `po-eyes` to `fixed` (PO-eyes close) with this pack as evidence.

**Not in this pack (intentionally):** Rayan #8, TAL-01896, TAL-01807b — **build-blocked → B**. Do not test them on b113.
