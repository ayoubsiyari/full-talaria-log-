# A6-4 switch map (one page)

**Build:** `20260717b37` · **Baseline blessed:** `20260717b16` · **Naming:** `__TALARIA_DISABLE_*` — **unset = fix ON** (I13 bisect: set `true` to revert)

---

## Master

| Switch | When OFF (reverts to…) |
|--------|-------------------------|
| **`__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX`** | **Entire A6-4 package OFF** — all six steps below inert; legacy per-iframe clone + `iframe-order` echo + iframe `placeOrder` / `addOrder` register |

---

## Step 0 — Stopgap (bridge to A6-4; retires when clone bleed gone)

| Switch | When OFF (reverts to…) |
|--------|-------------------------|
| **`__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1`** | Mark/close uses **`getActiveChart()` / focused panel candle** on ambiguous ownership → **cross-ticker price bleed** (GBP exit @ EUR ~1.31315). Files: `order-manager.js` only. |

**Proof:** `order-owning-panel-price.test.mjs` — 20/20 GREEN when ON.

---

## Step 1 — Host-only persist

| Switch | When OFF (reverts to…) |
|--------|-------------------------|
| **`__TALARIA_DISABLE_ORDER_MC_HOST_PERSIST_ONLY_V1`** | Iframe embeds **restore + pagehide-write** shared sessionStorage again → F5 dup / blob collision risk. Files: `order-manager.js`. |

*(Interims overlap: `__TALARIA_MC_ORDER_PERSIST_PANEL_SCOPE_V1=false` also disables panel-scoped keys.)*

---

## Step 2 — Host-canonical place

| Switch | When OFF (reverts to…) |
|--------|-------------------------|
| **`__TALARIA_DISABLE_ORDER_MC_HOST_PLACE_V1`** | Parent Execute on focused iframe routes **`runCommand('placeOrder')` to iframe** `placeAdvancedOrder` → replay-enter race / panel-B lockout class. Files: `MultichartGrid.jsx`, `panel-cmd-bridge.js`. |

*(Interims overlap: `__TALARIA_DISABLE_ORDER_MC_PLACE_REPLAY_GATE_V1` — replay-ready poll before iframe place; still used when Step 2 OFF.)*

---

## Step 3 — Snapshot projection

| Switch | When OFF (reverts to…) |
|--------|-------------------------|
| **`__TALARIA_DISABLE_ORDER_MC_SNAPSHOT_PROJECTION_V1`** | **`broadcastOrder` → `addOrder` register** on peers again; iframe mutable clone store returns. Files: `MultichartGrid.jsx`, `panel-cmd-bridge.js`, `order-host-store.mjs`. |

---

## Step 4 — Open-leg patch to host

| Switch | When OFF (reverts to…) |
|--------|-------------------------|
| **`__TALARIA_DISABLE_ORDER_MC_OPEN_PATCH_V1`** | SL/TP drag **commit mutates iframe-local** `openPositions` only → host rail / tile A **≠ B** after open-leg edit. Files: `order-manager.js`, `MultichartGrid.jsx`. |

---

## Step 5 — PnL tick hub

| Switch | When OFF (reverts to…) |
|--------|-------------------------|
| **`__TALARIA_DISABLE_ORDER_MC_PNL_HUB_V1`** | Iframe `replayTick` **does not** ping host `updatePositions` → host marks for foreign tickers stall when host playhead paused. Files: `panel-cmd-bridge.js`, `MultichartGrid.jsx`. |

*(Interims overlap: `__TALARIA_MC_REPLAY_PNL_HOST_AGG_V1=false` — trades rail iframe snapshot poll only.)*

---

## Step 6 — Retire legacy clone bus

| Switch | When OFF (reverts to…) |
|--------|-------------------------|
| **`__TALARIA_DISABLE_ORDER_MC_LEGACY_IFRAME_ORDER_V1`** | Iframe **`postIframeOrder` echo** + parent **`iframe-order` opened/pending** mirror path **returns** (dual writer alongside snapshot). Files: `panel-cmd-bridge.js`, `MultichartGrid.jsx`. |

---

## Related (not A6-4 steps — interims / lockout)

| Switch | When OFF |
|--------|----------|
| `__TALARIA_DISABLE_ORDER_MC_PLACE_REPLAY_GATE_V1` | No replay-ready wait before iframe place |
| `__TALARIA_DISABLE_ORDER_PROVISIONAL_FOCUS_CANCEL_V1` | No provisional/draft cancel on focus loss |
| `__TALARIA_DISABLE_ORDER_MC_RESTORE_DEDUPE_V1` | Mirror dedupe off |
| `__TALARIA_MC_ORDER_PERSIST_PANEL_SCOPE_V1=false` | Shared persist key |

---

## Bisect order (recommended)

1. Master OFF → confirm full legacy RED.  
2. Master ON, Steps 6→1 OFF one at a time → isolate regression.  
3. Step 0 OFF alone → cross-ticker price RED (ship-gate).  
4. Re-run **D-026 H-R04/H-R05** after any MultichartGrid touch before bless.

---

## Commits (b37 series)

| Commit | Scope |
|--------|-------|
| `f0c1fdca` | Step 0 + engine hooks |
| `470e0f88` | Steps 1–6 bridge/React |
| `950aa486` | dist `20260717b37` |
| `bea25959` / `f3027e71` | Reports |

**Ship-gate:** owning-panel-price RED green (node) + PO live legs + Lane 4 gate + D-026 proof rows — **none = ship**.
