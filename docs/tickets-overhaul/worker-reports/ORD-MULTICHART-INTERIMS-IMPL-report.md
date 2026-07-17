# ORD-MULTICHART-INTERIMS — freeze-safe multichart order parity interims (Lane 3)

## 1. Task + RC

- **Task:** ORD-MULTICHART-INTERIMS-IMPL — five switch-gated interim fixes ahead of A6-4 host-canonical rework.
- **RC:** RC-5 / multichart order ownership (A6-4 deferred). Interims only — no `chart.js`, no host-canonical inversion.

---

## 2. What I changed — file by file

### Hunk 1 — Duplication on refresh (`__TALARIA_DISABLE_ORDER_MC_RESTORE_DEDUPE_V1`, default ON)

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/order-service.js` | Id dedupe in `registerOpenOrder` / `registerPendingOrder` before push. |
| `chart v 1.4/chart/modules/order-manager.js` | Rebuild `orders[]` from restored pending+open (dedupe by id) in `restoreRuntimeOrderStateFromSession`. |
| `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` | `addOrder` dedupe checks `openPositions` + `pendingOrders`, not only `orders[]`. |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | Host `addOrder` uses same `orderIdExistsInOrderManager` helper. |
| `homepage/public/chart/...` | I8 mirrors for order-service, order-manager, panel-cmd-bridge. |

### Hunk 2 — Persistence panel-scoping (`__TALARIA_MC_ORDER_PERSIST_PANEL_SCOPE_V1`, default ON when unset)

| File | Change |
|------|--------|
| `order-manager.js` | `_runtimeOrderStorageKey(sessionId, panelScope)` → `:panel:host` / `:panel:{iframeId}`; iframe skips bootstrap restore + pagehide write; host read falls back to legacy unscoped key. |
| `order-runtime-persist.mjs` | Optional `panelScope` on `runtimeOrderStorageKey` (both trees). |

### Hunk 3 — Wrong duration (`__TALARIA_DISABLE_TRADE_DURATION_NORM_V1`, default ON)

| File | Change |
|------|--------|
| `talaria-design/src/orderManagerTradeRows.js` | Exported `normalizeEpochMs`; open/closed rows use normalized times; `rowNowMs` prefers `multiInstrumentSession.current_time` then replay ts (matches legacy dock). |

### Hunk 4 — Dual-replay PnL stall (`__TALARIA_MC_REPLAY_PNL_HOST_AGG_V1`, default ON when unset)

| File | Change |
|------|--------|
| `orderManagerTradeRows.js` | `mergeOrderManagerForMultichartTrades` dedupes host + iframe snapshots for trades rail rows. |
| `TalariaV8bLive.jsx` | Polls `getOrderTradeSnapshot` per iframe panel every 800ms; trades table uses merged OM. |
| `panel-cmd-bridge.js` + `MultichartGrid.jsx` | New `getOrderTradeSnapshot` cmd. |
| `order-manager.js` | `_markFromPanelDataLastClose` uses embed iframe's own `chart.data` when symbol matches (panelManager absent in multichart). |

### Hunk 5 — Panel-B lockout (default ON)

| Switch | File | Change |
|--------|------|--------|
| `__TALARIA_DISABLE_ORDER_MC_PLACE_REPLAY_GATE_V1` | `MultichartGrid.jsx` | Execute intercept waits for `getReplayReady.replayActive` (poll ≤4s) before `placeOrder` to iframe. |
| `__TALARIA_DISABLE_ORDER_PROVISIONAL_FOCUS_CANCEL_V1` | `order-manager.js` | Cancel provisional preview/open drag + clear draft-drag busy on `multichartFocusChanged` / iframe `blur`; postMessage clears parent `multichartDraftDragBusyRef`. |
| — | `panel-cmd-bridge.js` | `getReplayReady` cmd for gate. |
| — | `TalariaV8bLive.jsx` | Handles `multichart-focus-loss-clear-draft`. |

### Dist

| File | Change |
|------|--------|
| dist-v9 / live / SW / embed / harness serve (both trees) | Rebuilt — build id **`20260717b14`**. |

**No other files touched** for this task.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | OFF behavior | Gated files |
|--------|---------|--------------|-------------|
| `__TALARIA_DISABLE_ORDER_MC_RESTORE_DEDUPE_V1` | unset = ON | Mirror `addOrder` + restore dup returns; no id dedupe in register | order-service, order-manager, panel-cmd-bridge, MultichartGrid |
| `__TALARIA_MC_ORDER_PERSIST_PANEL_SCOPE_V1` | unset = ON; set `false` = OFF | Iframes restore/write shared key again | order-manager, order-runtime-persist.mjs |
| `__TALARIA_DISABLE_TRADE_DURATION_NORM_V1` | unset = ON | Legacy `openTime \|\| Date.now()` duration path | orderManagerTradeRows.js |
| `__TALARIA_MC_REPLAY_PNL_HOST_AGG_V1` | unset = ON; set `false` = OFF | Trades rail reads host OM only; no iframe snapshot poll | orderManagerTradeRows.js, TalariaV8bLive.jsx, order-manager mark path |
| `__TALARIA_DISABLE_ORDER_MC_PLACE_REPLAY_GATE_V1` | unset = ON | Immediate `placeOrder` to iframe (replay race returns) | MultichartGrid.jsx |
| `__TALARIA_DISABLE_ORDER_PROVISIONAL_FOCUS_CANCEL_V1` | unset = ON | No focus/blur provisional cancel | order-manager.js |

All switches are independently toggleable (I13).

---

## 4. Proof — RED → GREEN

### Node

```text
cd "chart v 1.4/chart/modules"
node order-interaction-guard.test.mjs
=== 36 passed, 0 failed ===
```

### Mechanism simulation (dedupe — Hunk 1)

```text
restore: open=1 orders=0 → mirror addOrder same id →
  OFF: open=2 orders=1 (RED discriminator)
  ON:  open=1 orders=1 (GREEN)
```

### Switch discriminators (D-023)

| Hunk | RED (switch OFF) | GREEN (switch ON / default) |
|------|------------------|-----------------------------|
| 1 | F5 multichart → duplicate open rows in trades panel | Same id appears once after host→iframe mirror |
| 2 | Iframe pagehide overwrites host sessionStorage blob | Host-only writer; iframe skip restore |
| 3 | Open row Duration uses wall `Date.now()` fallback → 1000h+ delta | Duration tracks replay/session `current_time` |
| 4 | Trades rail PnL frozen for panel B orders while iframe PnL moves | Merged snapshots show B open rows + updating PnL column |
| 5 | Execute on B before replayEnter → silent fail / stuck drag | Gate waits for replay active; focus change clears provisional |

### I15 actuation / measurement

| Hunk | Actuation | Measurement | Status |
|------|-----------|-------------|--------|
| 1–5 | **Not run** — no live 2-ticker multichart session this pass | Node + static mechanism | **NEEDS-LIVE** |

Gate harness not run for these interims (order-specific scenarios pending Lane 2 spec).

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I8 | order-manager, order-service, order-runtime-persist, panel-cmd-bridge mirrored; `fc /b` clean |
| I3 | Six independent switches |
| I13 | Each switch documented with OFF path |
| Freeze | No `chart.js` / `replay-system.js` edits |
| A6-4 boundary | No host-canonical inversion; interims only |
| TDZ + SL/TP v2 | Untouched (`splitOrderType` order, `_oiResolveOpenSltpDragDisplayPrice` present) |

---

## 6. What I did NOT do / limits

- **No live multichart repro** (2 panels, different tickers, F5, dual replay) — all five hunks NEEDS-LIVE PO confirm.
- **No new harness scenarios** (Lane 2 `ORD-MULTICHART-harness-scenarios` still pending).
- **PnL aggregation** merges open/pending lists for **trades rail display only** — not full account/equity canonical merge (A6-4).
- **Closed/history rows** remain host-journal canonical (by design for interim).
- **Panel-scoped persist keys** — host uses `:panel:host`; legacy unscoped blob still read on host bootstrap for backward compat.

---

## 7. Live-verification handoff

**Build id:** **`20260717b14`**

1. **Dup (Hunk 1):** 2v independent tickers → one open on A → F5 → Open Positions count stable (no 2× same id).
2. **Persist (Hunk 2):** F5 after orders on A only — B iframe does not inflate host blob (check sessionStorage single `:panel:host` writer).
3. **Duration (Hunk 3):** Replay active — open row Duration matches replay elapsed, not wall-clock thousands of hours.
4. **PnL (Hunk 4):** Open on B only, play replay — trades rail shows B row with moving PnL (not frozen at host-only value).
5. **Lockout (Hunk 5):** Focus B → Execute immediately after split — order places after replay ready; after SL drag + focus swap, next entry works.

**Bisect:** set each `__TALARIA_DISABLE_*` / `__TALARIA_MC_* = false` per table §3 and confirm RED returns.

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

Node guard tests GREEN; mechanism complete; PO must confirm on real multichart embed (I15).

### Commits (this task)

| Commit | Scope |
|--------|-------|
| `0529791b` | ORD-LEVEL-VIS revert (marker removal) — prior step |
| `0415cabe` | Engine interims: dedupe, persist scope, embed mark, focus cancel (I8) |
| `cf32a86d` | React interims: duration norm, PnL host agg, replay gate |
| `94a494b2` | dist **`20260717b14`** rebuild |
| *(pending)* | This report |

---

## 9. A6-4 pull-forward flags

None of the five hunks required host-canonical rework to compile. Full cross-panel SL/TP convergence and single `updatePositions` hub remain **post-unfreeze A6-4**.
