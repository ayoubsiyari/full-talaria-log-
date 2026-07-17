# ORD-DUP-DURATION — Trades panel duplication + wrong Duration (Lane 3 diagnostic)

## 1. Task + RC

- **Task:** ORD-DUP-DURATION diagnostic (read-only, freeze-safe).
- **Goal:** Classify Open Positions duplication (multichart + F5) and wrong Duration column; produce isolation matrix, root causes, and gated fix plan.
- **RC:** RC-5 / order-interaction follow-on (trades panel truthfulness). Diagnostic only — no RC discharged.

**PO evidence:** Multichart layout — tab shows **Open Positions 4** while list renders ~8–10 identical EUR/USD Long @ 1.10449 rows; Duration column shows inconsistent values (e.g. 5138h0m vs 90h51m) for apparently same session times.

---

## 2. Reproduction reasoning — what fires on multichart F5

### 2.1 Page-load sequence (host + N iframes)

1. **Host chart boots** → `OrderManager.init()` runs `_bootstrapRuntimeOrderPersistenceV1()` (`order-manager.js:5200-5201`, `5293-5318`).
2. **Bootstrap reads shared sessionStorage** key `chart_orders_runtime_session_v1:${sessionId}` (`order-manager.js:11-12`, `19-22`, `5260-5267`). Key is **session-scoped, not panel-scoped** — host and every iframe share one blob.
3. **`restoreRuntimeOrderStateFromSession`** assigns `this.openPositions` / `this.pendingOrders` and redraws visuals (`order-manager.js:4279-4383`). It does **not** rebuild `orders[]` and does **not** emit `order:opened`.
4. **Parallel restore:** `chart.js` session path may also call the same restore (`chart.js:10521-10522`, `10634`, `10766-10767`). Both paths **assign** arrays (no append) — safe unless the persisted blob already contains duplicates.
5. **Each iframe** loads its own chart + `orderManager`, runs the same bootstrap against the **same sessionStorage key**, and installs order forwarders (`panel-cmd-bridge.js:994-1008`).
6. **Multichart ready-panel effect** pushes host `openPositions` to newly-ready iframes via `grid.runCommand("addOrder", …)` (`MultichartGrid.jsx:3771-3800`).
7. **`addOrder` dedupe checks `om.orders` only** — not `openPositions` (`MultichartGrid.jsx:4713-4714`, `panel-cmd-bridge.js:3505-3511`). After restore, `orders[]` is typically **empty** while `openPositions` already holds restored rows (`order-manager.js:4320-4321` sets positions only).
8. **`registerOpenOrder` always pushes** into `openPositions` and `orders` with **no id dedupe** (`order-service.js:336-339`).
9. **On pagehide/beforeunload**, each context’s hook writes its local patch back to the **same sessionStorage key** (`order-manager.js:5321-5334`, `5250-5257`) — last writer wins and can persist duplicates created in step 6–8.

### 2.2 Node simulation (mechanism confirmed)

```text
after restore mimic: open=1 orders=0
after mirror addOrder:  open=2 orders=1
```

This matches the `orders[]`-only dedupe gap.

### 2.3 Why single-chart F5 is mostly clean

Single chart has **one** `orderManager`, no `addOrder` mirror fan-in, and no per-iframe pagehide stomp. Duplication risk is **LOW** unless the persisted blob already contains duplicate ids or a post-restore `registerOpenOrder` fires.

---

## 3. Isolation matrix (code-predicted — NEEDS-LIVE per cell)

|  | **Fresh load** | **After F5 refresh** |
|--|----------------|----------------------|
| **Single chart** | **LOW dup risk** — one store; restore assigns once; no mirror | **LOW–MED** — bootstrap + session restore both assign (no append); dup only if blob already corrupt |
| **Multichart (2+ panels, different tickers)** | **MED dup risk** — host→iframe `addOrder` on panel ready; iframe `order:opened` → `iframe-order` → host `addOrder` via `ensureHostInMirrorPeers` (`MultichartGrid.jsx:6330-6337`, `6388-6455`) | **HIGH dup risk** — steps 6–9 above; **persisted blob may already contain N× copies** before host even re-renders |

**Bisect switches (predicted):**

| Switch | Effect on dup |
|--------|----------------|
| `__TALARIA_DISABLE_ORDER_PERSISTENCE_V1` (`order-manager.js:15-17`, `order-runtime-persist.mjs:16-20`) | **Refresh column → LOW** — no sessionStorage rehydrate; mirror race may still dup iframes on fresh multi |
| Single-panel layout (no multichart) | **Removes mirror fan-in** — if dup vanishes, confirms multichart path |
| Disable multichart order-mirror effect (no host→iframe push) | Would reduce iframe-side dup + corrupt persist — **NEEDS-LIVE** |

**A6-2 verdict:** A6-2 persistence is **not the sole root** — it **enables** the F5 trigger (shared sessionStorage rehydrate) and can **store** duplicates once the mirror path creates them. The mechanical bug is **`registerOpenOrder` without `openPositions` id dedupe** + **`restore` not rebuilding `orders[]`** + **shared non-panel-scoped storage key**. Pre-A6-2 multichart mirror could still dup without F5 (iframe-side); F5 makes host trades panel show the corrupted blob.

---

## 4. Multichart instance model

| Context | Order store | Trades panel reads |
|---------|-------------|-------------------|
| **Host** | `window.chart.orderManager` — canonical for trades panel | Yes — sole source |
| **Each iframe** | `iframe.contentWindow.chart.orderManager` — local clone for lines/PnL | No — host DOM only |

Host is explicitly documented as canonical (`MultichartGrid.jsx:6324-6328`). Trades panel does **not** aggregate Σ panels.

**sessionStorage:** One key per trading session, shared across host + all same-origin iframes (`order-manager.js:19-22`). Each panel’s `orderManager` can **overwrite** the blob on unload with its local (possibly duplicated) `open_positions`.

---

## 5. Defect 1 — duplication

### 5.1 Hypothesis results

| Hypothesis | Verdict | Evidence |
|------------|---------|----------|
| **H-A (per-panel aggregation in host panel)** | **Refuted** | Trades panel reads host `openPositions` only (`orderManagerTradeRows.js:1241`, `TalariaV8bLive.jsx:35896-35940`) |
| **H-B (render source ≠ count source)** | **Refuted at one instant** | Tab count and table both call `buildLiveTradeRowsFromOrderManager` (`TalariaV8bLive.jsx:35896-35899` vs `35940-35960`). PO **4 vs 8–10** may be timing (dupes arriving between renders), legacy `bottomOpenPositionsBody` (`order-manager.js:40967-41009`) overlapping React in some shells, or duplicate React keys (`key={r.id}` at `TalariaV8bLive.jsx:36200` where `r.id` is `#${o.id}`) — **NEEDS-LIVE** |
| **H-C (refresh restore multiplies)** | **Partially confirmed** | Restore **assigns**, does not append (`order-manager.js:4320-4321`); but **multiple callers** (bootstrap `5293-5312`, session `chart.js:10766-10767`) plus **post-restore mirror `addOrder`** re-enters positions; **persist can save dupes** for next F5 |

### 5.2 Primary root cause (rank 1): mirror re-register after restore

**Dedupe checks wrong array:**

```3505:3511:chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js
var existing = (om2.orders || []).some(function (o) {
    return o && o.id != null && o.id === ord.id;
});
if (existing) {
    return { skipped: true, reason: 'duplicate' };
}
```

Host-side mirror uses the same pattern (`MultichartGrid.jsx:4713-4714`).

**Register always appends:**

```336:339:chart v 1.4/chart/modules/order-service.js
this.openPositions.push(order);
this.orders.push(order);
this.recomputeSharedMarginState();
this.emit('order:opened', order);
```

**Restore does not rebuild `orders[]`:**

```4320:4321:chart v 1.4/chart/modules/order-manager.js
if (pendingOrders) this.pendingOrders = pendingOrders;
if (openPositions) this.openPositions = openPositions;
```

(`openPositions` is aliased to `orderService.openPositions` via getter/setter at `order-manager.js:341-350`.)

**Refresh-specific amplifier:** Host→iframe push on panel ready (`MultichartGrid.jsx:3771-3800`) + iframe→host echo via `ensureHostInMirrorPeers` (`6330-6337`) + shared sessionStorage last-writer (`5250-5257`, `5325-5331`).

### 5.3 Secondary factors

- Persisted `open_positions` may already contain duplicate ids from a prior session’s iframe flush.
- `restoreRuntimeOrderStateFromSession` called from multiple paths (bootstrap + session API) — replace-only, but cannot fix pre-corrupt blob.

### 5.4 Relationship to A6-4 (host-canonical order store)

| Question | Answer |
|----------|--------|
| Is this the A6-4 gap? | **Related but not identical.** A6-4 (TAL-01601, ratified/deferred) targets **ownership inversion**: one host store, panels as projections, `order:opened-updated` fan-out for open-leg edits (`T4-A6-ORDER-INTERACTION-CONTRACT.md`, `RESOLUTION-TRACKER.csv` A6-4 row). |
| Would A6-4 fix this? | **Likely yes long-term** — single writer, no per-iframe restore/mirror of full open lists. |
| Is full A6-4 required for fix? | **No.** This bug is a **smaller, freeze-safe** dedupe + restore hygiene + optional persist-namespacing problem. A6-4 remains the architectural follow-on for SL/TP cross-panel convergence. |
| Freeze-safe interim? | **Yes** — `order-service.js` / `order-manager.js` dedupe + restore rebuild; optional `MultichartGrid.jsx` guard to skip host mirror when id exists. |

---

## 6. Defect 2 — wrong Duration

### 6.1 Formula site (PO UI = React V9 trades table)

| Layer | File:line | Formula |
|-------|-----------|---------|
| **Duration helper** | `orderManagerTradeRows.js:21-27` | `ms = end - (openMs \|\| end)` where `end = closeMs ?? nowMs` |
| **Open rows** | `orderManagerTradeRows.js:1272-1295` | `tMs = o.openTime \|\| Date.now()`; `dur: v9TradeDuration(tMs, null, rowNowMs)` |
| **Clock for `now`** | `orderManagerTradeRows.js:1206-1209` | `rowNowMs = chart.replaySystem.replayTimestamp` if finite, else `Date.now()` |
| **TIME column** | `orderManagerTradeRows.js:5-12`, `1283` | `v9FormatTradeTime(tMs)` — no seconds→ms normalization |
| **Legacy cross-instrument dock** (not PO Duration column) | `order-manager.js:41650-41686` | Uses `normalizeEpochMs` + prefers `multiInstrumentSession.current_time` — **has** unit guard |

### 6.2 Why durations diverge

1. **Missing normalization in React path:** No `normalizeEpochMs` (contrast dock `order-manager.js:41650-41654`). Journal closed rows use `coalesceTimeMs` (`orderManagerTradeRows.js:1119-1144`) — **open rows do not**.
2. **Clock mix:** `rowNowMs` prefers replay timestamp; `openTime` is replay-bar ms when set correctly at fill (`order-manager.js:24816+`). If `openTime` is missing, row builder uses `Date.now()` (`1273`) while `rowNowMs` may still be replay → **5138h-class** wall-minus-replay deltas.
3. **Tied to Defect 1:** Duplicate `openPositions` entries can carry **different** `openTime` values (mirror copies, fallback `Date.now()` at row build, or corrupted persist). Same formatted TIME bucket with wildly different DUR is consistent with duplicate objects.

### 6.3 Shared vs independent root

| Question | Answer |
|----------|--------|
| Same root as duplication? | **Often yes in PO scenario** — dup rows → inconsistent `openTime` → Duration spread |
| Independent fix needed? | **Yes** — even with dedupe, open-row path should normalize epoch ms and align `now` with `account_runtime.session_current_time` when replay ts absent (`order-manager.js:4328-4334` restores this field) |

---

## 7. Ranked root causes (summary)

| Rank | Cause | Symptoms | A6-4? |
|------|-------|----------|-------|
| **1** | `addOrder` dedupe checks `orders[]` only; restore leaves `orders[]` empty | Dup after multichart mirror + F5 | Smaller than A6-4; same clone model |
| **2** | `registerOpenOrder` no id dedupe on `openPositions` | Any mirror re-entry duplicates | Same |
| **3** | Shared sessionStorage key; iframes persist local duped lists | F5 restores corrupt blob to host | Persistence design gap |
| **4** | React duration path lacks `normalizeEpochMs`; `openTime \|\| Date.now()` fallback | Wrong / inconsistent Duration | Independent |
| **5** | Double restore paths (bootstrap + session) | Usually replace-only; not primary dup | A6-2 interaction |

---

## 8. Proposed fix plan (switch-gated, freeze-safe preferred)

### 8.1 One-knob primary (Defect 1) — freeze-safe

| Switch | Behavior |
|--------|----------|
| **`__TALARIA_DISABLE_ORDER_MC_RESTORE_DEDUPE_V1`** (default ON when unset) | Single gate for: (a) `registerOpenOrder` skip when `openPositions.some(p => p.id === order.id)`; (b) `restoreRuntimeOrderStateFromSession` rebuild `orders` from pending+open; (c) `addOrder` dedupe checks `openPositions` in host + iframe bridge |

**Scope:** `order-service.js:309-339`, `order-manager.js:4279+`, `panel-cmd-bridge.js:3505-3510`, `MultichartGrid.jsx:4713-4714` — **no chart.js**.

### 8.2 Defect 1 — ranked menu

| Rank | Fix | Scope | Switch | Freeze-safe? |
|------|-----|-------|--------|--------------|
| **1** | Id dedupe in `registerOpenOrder` | `order-service.js:309-339` | `__TALARIA_DISABLE_ORDER_MC_RESTORE_DEDUPE_V1` | **Yes** |
| **2** | Rebuild `orders[]` on restore | `order-manager.js:4320+` | same | **Yes** |
| **3** | `addOrder` check `openPositions` | bridge + MultichartGrid | same | **Yes** |
| **4** | Dedupe `open_positions` by id on persist | `order-manager.js:5241-5247` | `__TALARIA_DISABLE_ORDER_PERSIST_DEDUPE_V1` | **Yes** |
| **5** | Skip `mirrorTo(HOST)` for `opened` when host already has id | `MultichartGrid.jsx:6330-6455` | `__TALARIA_DISABLE_MC_HOST_ORDER_MIRROR_V1` | **Yes** (React) |

### 8.3 Defect 2 — ranked menu

| Rank | Fix | Scope | Switch | Freeze-safe? |
|------|-----|-------|--------|--------------|
| **1** | Shared `normalizeEpochMs` in row builder; apply to open `tMs` + duration args | `orderManagerTradeRows.js:21-27, 1272-1295` | `__TALARIA_DISABLE_TRADE_DURATION_NORM_V1` | **Yes** (design bundle) |
| **2** | Prefer `orderService.multiInstrumentSession.current_time` when replay ts missing | `orderManagerTradeRows.js:1206-1209` | same | **Yes** |
| **3** | Remove `Date.now()` fallback for open rows — use replay/session clock | `1273` | same | **Yes** |

### 8.4 If host-canonical rework chosen (A6-4 — post-re-migration)

- **Not freeze-safe today** — requires `MultichartGrid.jsx` + `panel-cmd-bridge.js` ownership inversion (Director-ratified, dispatch gated per `DIRECTOR-DECISIONS.md` D-020).
- **Interim:** §8.1 one-knob dedupe + §8.3 duration normalization restores PO parity without A6-4.

---

## 9. Proposed RED harness ids

| ID | Scenario | Assert |
|----|----------|--------|
| **RC5-ORD-DUP-1** | Multichart 2 panels, different tickers, place 1 market order each, wait sync | Host `openPositions.length === 2`; unique ids |
| **RC5-ORD-DUP-2** | Above + F5 reload | Same length; tab count === row count; `openPositions.map(p => p.id)` all unique |
| **RC5-ORD-DUP-3** | Restore 1 open with `orders=[]`, then `addOrder` same id | Skipped / length stays 1 |
| **RC5-ORD-DURATION-1** | Replay active, open with known `openTime` ms | Duration within ±1m of `(replayTimestamp - openTime)` |
| **RC5-ORD-DURATION-2** | Fixture with `openTime` in seconds | Normalized; not thousands of hours |

Lane 4 registers when bless path free. Until then: PO live on named build.

---

## 10. Live-verification handoff

1. **Multichart + F5:** 2–4 panels, different tickers, place **4** distinct orders. Before F5: `window.chart.orderManager.openPositions.length` and `.map(p => p.id)`. After F5: repeat + compare tab count vs visible rows.
2. **Bisect:** `window.__TALARIA_DISABLE_ORDER_PERSISTENCE_V1 = true` → reload → F5. If dup disappears, refresh+persist path confirmed.
3. **Single chart F5:** if clean, multichart factor confirmed.
4. **Duration:** with replay playing, compare Duration to replay playhead delta; dup rows should show divergent `openTime` in console.
5. **Storage:** inspect `sessionStorage['chart_orders_runtime_session_v1:' + sessionId]` — check for duplicate ids in `open_positions`.
6. **Console:** filter `[orders-restore]` / `[orders-persist]` for `open=` counts.

---

## 11. What was NOT done / limits

- Did **not** run live multichart place-order → F5 on built product (NEEDS-LIVE).
- Did **not** inspect PO session’s actual sessionStorage blob.
- PO **4 vs 8–10** count/list mismatch not re-measured live — see §5.1 H-B.
- Line refs verified against canonical `chart v 1.4/chart/**` and `chart v 1.4/talaria-design/src/**`; mirror `homepage/public/chart/**` byte-identical (I8).
- **No product code edits** in this task.

---

## 12. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started).**

**Primary mechanism:** Multichart mirror `addOrder` re-enters positions after A6-2 restore because dedupe checks `orders[]` only, `registerOpenOrder` does not dedupe `openPositions` by id, and shared sessionStorage can persist iframe-side duplicates back to the host on F5. **Duration:** React `orderManagerTradeRows.js` path lacks epoch normalization used elsewhere; wrong/missing `openTime` on duplicate rows amplifies the symptom. **A6-4** is the long-term ownership fix but **not required** for a freeze-safe interim patch.
