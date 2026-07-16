# ORD-DUP-DURATION — Trades panel duplication + wrong Duration (Lane 3 diagnostic)

## 1. Task + RC

- **Task:** ORD-DUP-DURATION diagnostic (read-only, freeze-safe).
- **Goal:** Classify Open Positions duplication (multichart + F5) and wrong Duration column; produce isolation matrix, root causes, and gated fix menu.
- **RC:** RC-5 / order-interaction follow-on (trades panel truthfulness). Tooling/diagnostic — no RC discharged.

**PO evidence:** Multichart layout — tab shows **Open Positions 4** while list renders ~8–10 identical EUR/USD Long @ 1.10449 rows; Duration column shows inconsistent values (e.g. 5138h0m vs 90h51m) for apparently same session times.

---

## 2. What I changed — file by file

**N/A — diagnostic only.** No product/engine/harness/React edits.

**Mechanism simulation (Node, session only):** restore leaves `orders=[]` while `openPositions=[1]`; mirror `addOrder` dedupe checks `orders` only → second push. Output: `open=1,orders=0` → `open=2,orders=1`.

---

## 3. Kill-switch (I3 + I13)

**N/A — diagnostic only.** Proposed switches in §11.

---

## 4. Proof — RED → GREEN

**N/A — no fix.** Code trace + Node dedupe simulation (§6.1). **I15:** Live multichart→F5 path not re-run in this session (deploy freeze + bless); isolation matrix is **code-predicted** with NEEDS-LIVE confirmation per cell.

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I8 | No edits |
| I15 | Simulation proves dedupe gap; PO screenshot not re-staged live |
| Freeze | No chart.js / replay-system.js / harness lib edits |

---

## 6. What I did NOT do / limits

- Did **not** run `build:live` multichart place-order → F5 reproduction (NEEDS-LIVE).
- Did **not** inspect persisted `sessionStorage` blob from PO session (would confirm duplicate entries in saved `open_positions`).
- Count **4** vs list **8–10** not re-measured live — see §7.4 for reconciliation.
- Line refs: canonical `chart v 1.4/chart/**`; mirror `homepage/public/chart/**` byte-identical (I8).

---

## 7. Isolation matrix (first — code-predicted, NEEDS-LIVE per cell)

|  | **Fresh load** | **After F5 refresh** |
|--|----------------|----------------------|
| **Single chart** | **LOW dup risk** — one `window.chart.orderManager`; restore assigns arrays once (`4248-4290`); no per-panel mirror fan-in | **LOW–MED** — `loadTradingSessionStateIfNeeded` (`chart.js:10766-10767`) + A6-2 bootstrap (`5278-5281`) both call restore (assign, not append); dup only if persisted blob already contains duplicates or a post-restore `registerOpenOrder` fires |
| **Multichart (2+ panels)** | **MED dup risk** — panel ready effect pushes host `openPositions` to peers via `addOrder` (`MultichartGrid.jsx:3761-3781`); iframe `order:opened` → `iframe-order` → `broadcastOrder` can include **host** (`6246-6251`, `6350-6371`) | **HIGH dup risk** — same as fresh **plus** each iframe may A6-2-restore from shared session key, then emit `order:opened` → host `addOrder` re-`registerOpenOrder` (`order-service.js:309-336`, dedupe checks `orders` only — `panel-cmd-bridge.js:3505-3510`) |

**Bisect switches (predicted):**

| Switch | Effect on dup |
|--------|----------------|
| `__TALARIA_DISABLE_ORDER_PERSISTENCE_V1` (`order-runtime-persist.mjs:18`) | **Refresh column → LOW** — no sessionStorage restore; multichart mirror race may still dup on fresh multi |
| Disable multichart (single panel) | **Removes host mirror fan-in** — if dup vanishes, confirms §8.1 |
| `__TALARIA_DISABLE_ORDER_RUNTIME_PERSIST_V2` (A6-2 alt) | Same class as persistence off for refresh |

**A6-2 verdict:** Not the sole root cause — persistence **enables** the refresh trigger and can **store** duplicates once created — but the mechanical dup is **`registerOpenOrder` without `openPositions` id dedupe** + **`restore` not rebuilding `orders[]`** (§8.1). Pre-A6-2 multichart mirror could still dup without F5.

---

## 8. Defect 1 — duplication

### 8.1 Root cause (primary): mirror re-register after restore

**Render source = count source (React V9):** Both use `buildLiveTradeRowsFromOrderManager(window.chart?.orderManager)`:

| UI element | File:line | Source |
|------------|-----------|--------|
| Tab count `Open Positions N` | `TalariaV8b.jsx:9964-9967` / `TalariaV8bLive.jsx:35840-35843` | `nOpen = rows.filter(r => r.status === "open").length` |
| Table rows | `TalariaV8b.jsx:9992-10012` / `TalariaV8bLive.jsx:35884+` | Same builder → `filtered` by `status === "open"` |

**Legacy DOM path (if visible):** `updatePositionsPanel` uses `this.openPositions` for both count (`40835-40837`) and `bottomOpenPositionsBody` (`40932-40974`) — also matched.

**H-B (render ≠ count):** **Refuted** for a single UI layer at one instant — same array, same length. PO **4 vs 8–10** likely one of: (a) **duplicate entries with duplicate `#id` keys** — React `key={r.id}` (`TalariaV8b.jsx:10159`) collapses/unstable rendering vs visual scroll ghosting; (b) **legacy `bottomOpenPositionsBody` + React grid both visible** in some shells; (c) count read at different refresh instant than screenshot list. **NEEDS-LIVE** to disambiguate.

**H-A (per-panel aggregation in host panel):** **Refuted** — host is canonical (`MultichartGrid.jsx:6240-6244`); trades panel reads **host only**, not Σ panels.

**H-C (refresh restore multiplies):** **Partially confirmed** — restore **assigns** (`4290`), does not append; but **`orders` is not restored** from `open_positions` (`4248-4363` — no `orders` rebuild). Panel `addOrder` dedupe:

```3505:3510:chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js
var existing = (om2.orders || []).some(function (o) {
    return o && o.id != null && o.id === ord.id;
});
if (existing) {
    return { skipped: true, reason: 'duplicate' };
}
```

`registerOpenOrder` always **pushes** (`order-service.js:336-337`) — no id check on `openPositions`.

**`openPositions` alias:** When `OrderService` exists, `om.openPositions` is a **getter/setter** to `orderService.openPositions` (`order-manager.js:336-345`) — dupes live in one canonical array.

**Restore call sites (host, same session):**

| Path | File:line |
|------|-----------|
| A6-2 bootstrap | `order-manager.js:5278-5286` (guarded by `storeCount`) |
| Session API load | `chart.js:10766-10767` |
| Local backup | `chart.js:10521-10522`, `10634` |
| `restoreRuntimeOrderStateFromSession` | assigns `this.openPositions` (`4290`) |

**Multichart instance model:** **One host** `orderManager` (trades panel) + **one `orderManager` per iframe** (visuals only). Fan-out: `broadcastOrder` / `mirrorTo` / `addOrder` (`MultichartGrid.jsx:6187-6371`, `3768-3781`).

**Node simulation (restore + mirror):**

```text
after restore mimic: open=1 orders=0
after mirror addOrder: open=2 orders=1
```

### 8.2 Defect 1 summary

| Item | Finding |
|------|---------|
| Primary trigger | **Multichart + post-restore iframe `order:opened` echo → host `addOrder`** |
| Secondary | Persisted `open_positions` may already contain dupes after prior session |
| Regression? | **A6-2 amplifies refresh**; mirror path is **pre-existing** multichart design |

---

## 9. Defect 2 — Duration

### 9.1 Formula site

| Layer | File:line | Formula |
|-------|-----------|---------|
| **React trades table (PO UI)** | `orderManagerTradeRows.js:21-27` | `v9TradeDuration(openMs, closeMs, nowMs)` → `ms = end - (openMs \|\| end)`; `end = closeMs ?? nowMs` |
| Open rows | `orderManagerTradeRows.js:1272-1295` | `tMs = o.openTime \|\| Date.now()`; `dur: v9TradeDuration(tMs, null, rowNowMs)` |
| **Clock for `now`** | `orderManagerTradeRows.js:1206-1209` | `rowNowMs = chart.replaySystem.replayTimestamp` if finite, else `Date.now()` |
| Legacy dock (not Duration column) | `order-manager.js:41648-41684` | `normalizeEpochMs` + replay/session `nowTs` — **has** seconds→ms guard |

### 9.2 Unit / base issues

- **`v9TradeDuration` / open row path:** **No** `normalizeEpochMs` (contrast dock `41648-41652`). `coalesceTimeMs` (`1119-1127`) used for **journal closed** rows only, not open positions.
- **`openTime` creation:** `order-service.js:375` — `openTime: request.timestamp || Date.now()` (ms expected).
- **5138h ≈ 214 days** → classic **`Date.now()` (wall) minus replay-session `openTime` (ms)** or **seconds stored where ms assumed** without breaking `v9FormatTradeTime` if copies disagree on field.
- **Same TIME column, different DUR:** Explained if duplicate rows are **different objects** with different `openTime` (or missing → `Date.now()` fallback at row build) while formatted time rounds to same bucket — **links to Defect 1 duplicates**.

### 9.3 Defect 2 summary

| Item | Finding |
|------|---------|
| Root | **Missing epoch normalization + inconsistent `openTime` on duplicate/mirrored copies** |
| Clock | React uses **replay timestamp when available** for `now`; per-row `openTime` not normalized |
| Shared root with dup? | **Often yes** (duplicate entries); normalization fix still needed if single row |

---

## 10. Shared vs independent

| Question | Answer |
|----------|--------|
| Same root? | **Coupled in PO scenario** — mirror dupes → inconsistent `openTime` → wild Duration spread |
| Independent fixes? | **Yes** — dedupe by id (Defect 1) + `normalizeEpochMs` in row builder (Defect 2) are separate, complementary |

---

## 11. Ranked freeze-safe fix menu

### Defect 1 — duplication

| Rank | Fix | Scope | Switch | Cost | Freeze-safe? |
|------|-----|-------|--------|------|--------------|
| **1** | `registerOpenOrder`: skip if `openPositions.some(p => p.id === order.id)` | `order-service.js:309-336` | `__TALARIA_DISABLE_ORDER_OPEN_DEDUPE_V1` | Low | **Yes** |
| **2** | `restoreRuntimeOrderStateFromSession`: rebuild `orders` from pending+open | `order-manager.js:4289+` | `__TALARIA_DISABLE_ORDER_RESTORE_REBUILD_ORDERS_V1` | Low | **Yes** |
| **3** | `addOrder` dedupe: check `openPositions` not only `orders` | `panel-cmd-bridge.js:3505-3510` | same as #1 or dedicated | Low | **Yes** |
| **4** | Multichart: do not `mirrorTo(HOST)` for `opened` when host already has id | `MultichartGrid.jsx:6350-6371` | `__TALARIA_DISABLE_MC_HOST_ORDER_MIRROR_V1` | Med | **Yes** (React grid) |
| **5** | Persist: dedupe `open_positions` by id on save | `order-manager.js:5210-5216` | `__TALARIA_DISABLE_ORDER_PERSIST_DEDUPE_V1` | Low | **Yes** |

**Director scope:** Cross-panel canonical order authority consolidation (if host/iframe should never both restore same session blob).

### Defect 2 — Duration

| Rank | Fix | Scope | Switch | Cost | Freeze-safe? |
|------|-----|-------|--------|------|--------------|
| **1** | Shared `normalizeEpochMs` in `orderManagerTradeRows.js`; use for `tMs` + `v9TradeDuration` args | `orderManagerTradeRows.js:21-27, 1272-1295` | `__TALARIA_DISABLE_TRADE_DURATION_NORM_V1` | Low | **Yes** (design bundle) |
| **2** | Prefer `session_current_time` from `account_runtime` when replay ts missing | `orderManagerTradeRows.js:1206-1209` | same switch | Low | **Yes** |
| **3** | Align open-row TIME + DUR to same normalized `tMs` | `1272-1295` | — | Low | **Yes** |

**Director scope:** None for Duration-only.

---

## 12. Proposed RED harness ids

| ID | Scenario | Assert |
|----|----------|--------|
| **RC5-ORD-DUP-1** | Multichart 2 panels, place 1 market order, wait sync | Host `openPositions.length === 1`; unique ids |
| **RC5-ORD-DUP-2** | Above + F5 reload | Still `length === 1`; tab count === row count |
| **RC5-ORD-DUP-3** | Restore 1 open in store with `orders=[]`, then `addOrder` same id | Skipped / length stays 1 |
| **RC5-ORD-DURATION-1** | Replay active, open with known `openTime` ms | Duration within ±1m of `(replayTimestamp - openTime)` |
| **RC5-ORD-DURATION-2** | `openTime` in seconds in fixture | Normalized; duration not thousands of hours |

Lane 4 registers when bless path free. Until then: PO live on named build.

---

## 13. Live-verification handoff

1. **Multichart + F5:** 2–4 panels, same symbol, place **4** distinct orders (or PO repro: 4 showing as 8–10). Before F5: note tab count + `window.chart.orderManager.openPositions.length` in console. After F5: same check + `openPositions.map(p => p.id)`.
2. **Bisect:** `__TALARIA_DISABLE_ORDER_PERSISTENCE_V1 = true` → F5 — if dup disappears, refresh+persist path confirmed.
3. **Single chart F5:** if clean, multichart factor confirmed.
4. **Duration:** with replay playing, compare Duration to replay playhead delta; toggle wall clock (exit replay) — should not jump to thousands of hours.
5. **Console:** filter `[orders-restore]` / `[orders-persist]` logs for `open=` counts.

---

## 14. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started).**

**Primary mechanism:** multichart mirror `addOrder` re-enters positions after restore because dedupe checks `orders[]` only and `registerOpenOrder` does not dedupe `openPositions` by id. **Duration:** React path lacks `normalizeEpochMs` used elsewhere; wrong `openTime` on duplicate rows amplifies the symptom.
