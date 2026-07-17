# A6-4 — Host-canonical order store IMPLEMENTATION (D-030)

**Baseline:** blessed `20260717b16`  
**Verdict:** **DONE (dev only) — NEEDS-LIVE** (+ D-026 proof-row re-run pending)

---

## Step 0 — Stopgap (owning-panel price)

| Switch | Default | Files |
|--------|---------|-------|
| `__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1` | unset = ON | `order-manager.js` (both I8) |

**Mechanism:** `_positionBelongsOnLocalChart`, `_resolveOwningPanelMidMarkPrice`, `_positionNeedsBackgroundBar`; patches `updatePositions`, `_resolveMidMarkPrice`, `closePosition`. Never uses `getActiveChart()` for mark/close paths when ON.

**Proof:** `order-owning-panel-price.test.mjs` — **20/20 PASS**; switch-OFF RED simulated.

**Retire:** Subsumed by A6-4 snapshot package (Step 6 removes clone bleed class); stopgap remains until PO blesses full package.

---

## Step 1 — Host-only persist

| Switch | Default | Files |
|--------|---------|-------|
| `__TALARIA_DISABLE_ORDER_MC_HOST_PERSIST_ONLY_V1` | unset = ON (under master) | `order-manager.js` |

Extends `_shouldSkipMcIframeRuntimePersist()` — iframe skip restore/write (aligns with INT-3 / interims panel scope).

---

## Step 2 — Command place (host canonical)

| Switch | Default | Files |
|--------|---------|-------|
| `__TALARIA_DISABLE_ORDER_MC_HOST_PLACE_V1` | unset = ON | `MultichartGrid.jsx`, `panel-cmd-bridge.js` |

**ON:** iframe `#placeOrderButton` intercept → `hostPlaceOrderFromPanel(panelId, args)` on host OM; tags `sourcePanelId` / `sourceFileId` / ticker from owning panel. Iframe `placeOrder` cmd throws.

---

## Step 3 — Snapshot projection

| Switch | Default | Files |
|--------|---------|-------|
| `__TALARIA_DISABLE_ORDER_MC_SNAPSHOT_PROJECTION_V1` | unset = ON | `MultichartGrid.jsx`, `panel-cmd-bridge.js`, `order-host-store.mjs` |
| `__TALARIA_DISABLE_ORDER_MC_READY_PANELS_SNAPSHOT_V1` | unset = ON (requires Step 3) | `MultichartGrid.jsx`, `order-host-store.mjs` |

**ON:** `broadcastOrder` → `fanOutOrderSnapshot` (`applyOrderSnapshot` cmd); iframe `addOrder` register blocked; read-only projection + redraw.

**Step 3 completion (b38):** `readyPanels` effect no longer calls per-order `addOrder` (silent fail after F5). Newly bridge-ready B/C panels receive `applyOrderSnapshot` via `primeReadyPanelsWithHostOrders` → `fanOutHostOrderSnapshotToIframes`.

**Proof (RED-first):** `order-host-store.test.mjs` — **16/16 PASS**; `__TALARIA_DISABLE_ORDER_MC_READY_PANELS_SNAPSHOT_V1` → RED `addOrder` path; live leg: 2-up, place orders, F5 → iframe order lines visible on B/C (not just host rail count).

**Not landed:** `ORDER_PERSIST_DEDUPE_V1` — only if PO still sees duplicate ids in sessionStorage after this fix.

---

## Step 4 — Open-leg patch commands

| Switch | Default | Files |
|--------|---------|-------|
| `__TALARIA_DISABLE_ORDER_MC_OPEN_PATCH_V1` | unset = ON | `order-manager.js`, `MultichartGrid.jsx` |

**ON:** iframe `_oiCommitOpenSltpToStore` → `postMessage order-command:patch-open-leg`; host applies + snapshot fan-out.

---

## Step 5 — PnL tick hub

| Switch | Default | Files |
|--------|---------|-------|
| `__TALARIA_DISABLE_ORDER_MC_PNL_HUB_V1` | unset = ON | `panel-cmd-bridge.js`, `MultichartGrid.jsx` |

**ON:** iframe `replayTick` posts `order-pnl-tick`; host runs `updatePositions()` for cross-panel marks.

---

## Step 6 — Retire legacy iframe-order echo

| Switch | Default | Files |
|--------|---------|-------|
| `__TALARIA_DISABLE_ORDER_MC_LEGACY_IFRAME_ORDER_V1` | unset = ON | `panel-cmd-bridge.js`, `MultichartGrid.jsx` |

**ON:** `postIframeOrder` no-op; host ignores `iframe-order` opened/pending echo (snapshot-only).

**Master:** `__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX` — unset = entire A6-4 package ON.

---

## Proof bar (D-030)

| Row | Status |
|-----|--------|
| Cross-ticker RED (multichart topology) | **GREEN (node)** — `order-owning-panel-price.test.mjs` |
| Store-level property (one feed / lifecycle) | **GREEN (node)** |
| Panel-B lockout leg (same RED set) | **NEEDS-LIVE** |
| Full gate + D-026 H-R04/H-R05 re-run vs b16 | **NOT RUN** (touches re-migration files — required before ship) |
| ORD-DUP F5 iframe order lines (ready-panels prime) | **GREEN (node)** — `order-host-store.test.mjs`; **NEEDS-LIVE** (2-up F5 B/C lines) |

**Also run:** `order-interaction-guard.test.mjs` — **36/36 PASS**; `order-host-store.test.mjs` — **16/16 PASS**

---

## Build

| Item | Value |
|------|-------|
| Build id | **`20260717b38`** (Lane 4 gate / PO live-confirm candidate) |
| Prior | `20260717b37` (Steps 0–6 initial land) |
| I8 | `order-manager.js`, `panel-cmd-bridge.js`, new `.mjs` helpers mirrored |

---

## Commits

| Commit | Scope |
|--------|-------|
| `f0c1fdca` | Step 0 stopgap + engine hooks (order-manager, owning-panel-price.mjs, test) |
| `470e0f88` | Steps 1–6 (MultichartGrid, panel-cmd-bridge, order-host-store.mjs) |
| `950aa486` | dist **`20260717b37`** rebuild |
| `bea25959` | Diagnostic + this report |
| *(pending)* | Step 3 ready-panels fan-out + dist **`20260717b38`** |

---

## PO handoff

1. 2-up GBP+EUR — verify GBP exit never in EUR band (ORD-XPNL-RED-1).
2. Place on panel B with A6-4 ON — host store row + iframe projection lines only.
3. SL drag on B — host store updates; tile A matches after release.
4. Dual replay — trades rail PnL moves for both tickers (PnL hub).
5. F5 — single host restore; no dup rows (persist + snapshot); **iframe order level lines on B/C** (ready-panels snapshot prime).
6. Bisect each `__TALARIA_DISABLE_ORDER_MC_*` + stopgap switch per step table.

**Lane 4 handoff:** Build **`20260717b38`** — D-026 H-R04/H-R05 re-run + PO live-confirm (panel-B lockout, ORD-DUP F5 legs, cross-ticker RED).
