# A6-4 b38 — PO live-confirm checklist (consolidated)

**Build under test:** **`20260717b38`** (A6-4 Steps 0–6 + interims + Step 3 ready-panels fan-out)  
**Verdict target:** All seven rows **PASS** on default switches (unset = ON) before Lane 4 bless / ship.  
**Scope:** Read-only PO procedure — no product edits.  
**Naming:** `__TALARIA_DISABLE_*` — **unset = fix ON**; set `window.__TALARIA_DISABLE_* = true` + hard refresh to bisect.

**Refs:** `worker-reports/A6-4-HOST-CANONICAL-ORDER-STORE-IMPL-report.md`, `worker-reports/A6-4-SWITCH-MAP.md`, `worker-reports/A6-4-PANEL-B-LOCKOUT-LIVE-REPRO-CHECKLIST.md`, `worker-reports/ORD-DUP-DURATION-diagnostic-report.md`.

---

## Global setup (run once before row 1)

| # | Action | Pass criterion |
|---|--------|----------------|
| S1 | Hard refresh (Ctrl+Shift+R) with cache bust | Console: `[Talaria] chart build 20260717b38` |
| S2 | Load or create a **backtest session** with replay-capable history | Replay controls available |
| S3 | Confirm default switches unset (optional) | No `__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX` in console overrides |
| S4 | DevTools open on **parent** document before first order | Console filters ready (see below) |

**Parent console filters:** `[MultichartGrid]`, `host-canonical placeOrder`, `iframe replay not active`, `multichartFocusChanged`, `[orders-restore]`, `[orders-persist]`.

**Useful parent probes:**

```javascript
window.chart?.orderManager?.openPositions?.map(p => ({ id: p.id, sym: p.symbol || p.ticker, panel: p.sourcePanelId }))
window.chart?.replaySystem?.replayTimestamp
window.chart?.getActiveTradingSessionId?.()
```

**Storage probe (rows 5–6):**

```javascript
const sid = window.chart?.getActiveTradingSessionId?.();
const k = 'chart_orders_runtime_session_v1:' + sid;
JSON.parse(sessionStorage.getItem(k) || '{}').open_positions?.map(p => p.id)
```

---

## Ordered verification rows

Run **in order**. Each row is independent for sign-off, but rows **5–7** reuse the same 2-up session from row **1** where noted.

| # | Verification | Setup & exact steps | Pass criteria (GREEN) | Bisect switch (set `true` → expect RED) |
|---|--------------|---------------------|------------------------|-------------------------------------------|
| **1** | **Cross-ticker — GBP exit never in EUR band** (ORD-XPNL-RED-1) | **Layout:** 2v. **A** = GBP/USD (e.g. file25). **B** = EUR/USD (e.g. file27). Enter replay; place **one market BUY on A** (GBP). Advance replay until **SL or TP hits** (or manual close on GBP position). Watch exit price / PnL band on trades rail and chart. | Exit fill price stays in **GBP plausible range** (~1.25–1.35 band for typical fixture — **not** EUR ~1.05–1.15). No close attributed at focused B’s EUR candle when position is GBP-owned. Trades rail shows GBP symbol on that row. | **`__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1`** — exit may print at EUR-ish price when B focused. Secondary: **`__TALARIA_DISABLE_ORDER_MC_PNL_HUB_V1`** — foreign marks stall (may blur symptom; use Step 0 bisect first). |
| **2** | **Panel-B place / lockout** | **Layout:** 2v, distinct tickers (reuse row 1 or fresh session). Enter replay. **Leg A — fast Execute:** split 1→2v (or fresh 2v); focus **B** canvas; within **≤1 s** of replay start, parent **Execute**. **Leg B — focus routing:** focus A → Execute → focus B → Execute. **Leg C — SL drag re-entry (optional):** place on B; drag SL ~20 pips; release; Execute again on B; if blocked, defocus A then refocus B → Execute. | **Leg A:** order lines + host row on **B** (not silent no-op). Console: no persistent `iframe replay not active` / `host-canonical placeOrder failed`. **Leg B:** post-focus-B Execute lands on **B symbol only**. **Leg C:** new entry accepted after SL drag + focus swap. | **`__TALARIA_DISABLE_ORDER_MC_HOST_PLACE_V1`** — iframe place + replay race (Leg A). **`__TALARIA_DISABLE_ORDER_MC_PLACE_REPLAY_GATE_V1`** — fast Execute fails. **`__TALARIA_DISABLE_ORDER_PROVISIONAL_FOCUS_CANCEL_V1`** — Leg C stuck after SL drag. Master: **`__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX`** — full legacy path. |
| **3** | **SL drag on B → host + tile A converge on release** | **Layout:** 2v, same or different tickers. Focus **B**; place one open order on B. Drag **SL** on **B chart** ~20–30 pips; **release** on chart (commit, not mid-drag). Compare: host trades rail / `openPositions` SL, **tile A** projected line (if same dataset/ticker rules apply), **tile B** line. | After release: **host store SL** updated. **Tile B** matches dragged level. **Tile A** (peer showing same order via projection) **matches B** within tick tolerance. No iframe-only SL that host rail contradicts. | **`__TALARIA_DISABLE_ORDER_MC_OPEN_PATCH_V1`** — SL commit stays iframe-local; host ≠ B after release. **`__TALARIA_DISABLE_ORDER_MC_SNAPSHOT_PROJECTION_V1`** — peers may not redraw from host snapshot. |
| **4** | **Dual replay — both tickers' PnL move** | **Layout:** 2v, **GBP on A**, **EUR on B**. Enter replay; place **one open on each** panel. **Play** replay (both panels advancing). Watch **trades rail floating PnL** (or unrealized column) for **both** rows while playhead moves. Pause; step forward a few bars; confirm both rows update again. | While replay running: **both** open rows show **changing unrealized PnL** (not frozen at 0 or stale). Each row’s PnL moves with its **own** symbol’s replay path. No “host ticker only moves” stall. | **`__TALARIA_DISABLE_ORDER_MC_PNL_HUB_V1`** — foreign-ticker row stalls when host playhead drives. **`__TALARIA_MC_REPLAY_PNL_HOST_AGG_V1=false`** — trades rail reads host OM only; B row stale. Secondary: **`__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1`** — wrong mark source (may look like frozen/wrong PnL). |
| **5** | **F5 — single host restore, no dup rows, iframe order lines on B/C** | **Layout:** 2v (or 2h). Place **≥2 open orders** across A/B (different tickers OK). **Before F5:** record `openPositions.length`, id list, trades **tab count** vs **visible row count**. Confirm **order level lines on B** (and C if 3-up). **F5** hard reload. **After F5:** wait for both panels bridge-ready + data-ready. Re-check host `openPositions`, tab count, row count, **iframe chart lines on B** (not just host rail). | **Single host restore:** `openPositions.length` same as pre-F5 (±0 if session changed). **No duplicate ids** in host list. Trades **tab count === visible row count**. **Iframe panels B/C show order level lines** matching host rows (entry/SL/TP visible on chart canvas — not empty while rail shows orders). | **`__TALARIA_DISABLE_ORDER_MC_READY_PANELS_SNAPSHOT_V1`** — B/C lines **missing after F5** while host rail OK (b37-class silent fail). **`__TALARIA_DISABLE_ORDER_MC_SNAPSHOT_PROJECTION_V1`** — projection off; iframe lines may absent. **`__TALARIA_DISABLE_ORDER_MC_HOST_PERSIST_ONLY_V1`** — iframe re-writes shared blob / dup risk. **`__TALARIA_DISABLE_ORDER_MC_LEGACY_IFRAME_ORDER_V1`** — dual writer + dup echo returns. **`__TALARIA_DISABLE_ORDER_MC_RESTORE_DEDUPE_V1`** — dup rows after F5. **`__TALARIA_MC_ORDER_PERSIST_PANEL_SCOPE_V1=false`** — shared key collision. **`ORDER_PERSIST_DEDUPE_V1`** — **not landed**; only chase if storage blob still has dup ids after row 5 GREEN. |
| **6** | **RC5-ORD-DUP-2** (4 orders → F5 → 4 unique ids) | **Layout:** 2v or 4-up. **Different tickers** across panels where possible. Place **exactly 4** distinct market/limit orders (one per panel or split across A/B). Wait for sync (~3 s). Record ids. **F5** reload. | **Before F5:** host `openPositions.length === 4`; ids all unique. **After F5:** length **=== 4**; `openPositions.map(p => p.id)` **all unique**; trades **tab count === row count === 4**; **no duplicate ids** in `sessionStorage` `open_positions` blob (storage probe above). Iframe lines visible per row 5. | **`__TALARIA_DISABLE_ORDER_MC_RESTORE_DEDUPE_V1`** — primary dup bisect. **`__TALARIA_DISABLE_ORDER_MC_HOST_PERSIST_ONLY_V1`** + **`__TALARIA_MC_ORDER_PERSIST_PANEL_SCOPE_V1=false`** — blob inflation. **`__TALARIA_DISABLE_ORDER_MC_LEGACY_IFRAME_ORDER_V1`** — echo re-register. **`__TALARIA_DISABLE_ORDER_MC_READY_PANELS_SNAPSHOT_V1`** — lines missing (symptom overlap with row 5, not id dup). |
| **7** | **RC5-ORD-DURATION-1 / RC5-ORD-DURATION-2** | **Setup:** replay **active** with known playhead. At least **one open row** (from row 6 session OK). Note replay timestamp: `chart.replaySystem.replayTimestamp`. Note row **Duration** in trades panel. **RC5-ORD-DURATION-1:** compare Duration to `(replayTimestamp - openTime)` — expect **±1 minute**. Advance replay ~5 min; Duration should track (not stuck). **RC5-ORD-DURATION-2:** inspect `openTime` in console for open rows — values must be **epoch ms** (13-digit), not seconds; **no 1000h+** Duration rows. | **RC5-ORD-DURATION-1:** every open row Duration within **±1 m** of replay delta from normalized `openTime`. **RC5-ORD-DURATION-2:** no row shows **1000h+** or absurd multi-day duration on fresh opens; seconds-only `openTime` normalized to ms. Dup rows (if any) often show divergent Duration — row 6 must pass first. | **`__TALARIA_DISABLE_TRADE_DURATION_NORM_V1`** — legacy `openTime \|\| Date.now()` path; 1000h+ / wrong Duration returns. |

---

## Bisect discipline

1. One switch OFF per attempt; hard refresh between attempts.  
2. Re-run **only the affected row** after each bisect (plus row **5** if F5/storage touched).  
3. **`__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX`** — nuclear OFF; confirms full legacy RED before stepwise ON.  
4. **`ORDER_PERSIST_DEDUPE_V1`** — **do not enable preemptively**; escalate only if row **5/6** PASS on counts but storage probe still shows duplicate ids in `open_positions`.

---

## Sign-off (PO)

| Row | Description | Result | Tester | Date | Notes |
|-----|-------------|--------|--------|------|-------|
| 1 | Cross-ticker GBP exit | ☐ PASS ☐ FAIL | | | |
| 2 | Panel-B place / lockout | ☐ PASS ☐ FAIL | | | Leg A / B / C |
| 3 | SL drag B → host + A converge | ☐ PASS ☐ FAIL | | | |
| 4 | Dual replay PnL both tickers | ☐ PASS ☐ FAIL | | | |
| 5 | F5 restore + iframe B/C lines | ☐ PASS ☐ FAIL | | | |
| 6 | RC5-ORD-DUP-2 (4→F5→4 unique) | ☐ PASS ☐ FAIL | | | ids: |
| 7 | RC5-ORD-DURATION-1/2 | ☐ PASS ☐ FAIL | | | |

**Overall:** ☐ **b38 LIVE-CONFIRM PASS** (all 7 rows) ☐ **FAIL** — attach build id, failing row(s), console snippet, bisect switch if used.

**Lane 4 gate (after PO PASS):** D-026 H-R04/H-R05 10/10 ON vs blessed baseline — required before ship; PO PASS does not substitute for gate.

---

## Node proof already GREEN (not substitute for live)

| Suite | Result |
|-------|--------|
| `order-owning-panel-price.test.mjs` | 20/20 — row 1 mechanism |
| `order-interaction-guard.test.mjs` | 36/36 — row 3 drag/commit |
| `order-host-store.test.mjs` | 16/16 — row 5 ready-panels snapshot fan-out |

**Status:** READ-ONLY checklist · build **`20260717b38`** · **NEEDS-LIVE** until sign-off complete.
