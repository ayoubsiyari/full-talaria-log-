# T4 — A6-2 order persistence across F5 (Lane 3)

## 1. Task + RC

- **Task:** A6-2 / TAL-01616 — pending + open orders survive page refresh (F5), session-scoped per D-019.
- **RC:** **RC-5** (order-entry interaction). Closes freeze-safe half of A6 order-interaction contract.
- **Authority:** D-019 — `sessionStorage` (not `localStorage`), both pending and open, SL/TP/splits preserved.

---

## 2. STEP 0 — region map + disjoint confirmation

### Where orders are constructed / restored today

| Stage | File | Lines (approx) | Role |
|-------|------|----------------|------|
| OrderManager boot | `order-manager.js` | constructor → `init()` ~4947 | Empty store; UI setup |
| **New A6-2 boot** | `order-manager.js` | `init()` end → `_bootstrapRuntimeOrderPersistenceV1()` | Restore from `sessionStorage` when store empty |
| Chart session restore | `chart.js` | `loadTradingSessionStateIfNeeded` ~10644 | API GET `/state` → `restoreRuntimeOrderStateFromSession` |
| No-session restore | `chart.js` | `loadLocalRuntimeOrdersIfNoSession` ~10591 | Legacy `localStorage` via `userStorage` |
| Replay init restore | `chart.js` | `initReplaySystem` microtask ~9830–9863 | Session load + local restore |
| Deferred restore | `chart.js` | `initOrderManager` setTimeout ~11580–11582 | Session + local restore |

### Contested chart.js regions (must stay disjoint)

| Region | Lines (approx) | Topic |
|--------|----------------|-------|
| Re-migration Phase-1 | ~2349–2365 | `_isMcRemigrationPhase1EngineSliceActive` |
| D-017 snap-back | ~2456–2526, ~17296–17357 | `_panReleaseAnchorHoldFixDisabled`, pan-release |
| T8 replay/cadence/TF | ~21157+ | Replay cadence / TF switch |

### Boot-hook touch assessment

Existing restore calls sit at **~9830–9863**, **~10591–10634**, **~10644–10767**, **~11580–11582** — all **disjoint** from contested ranges above.

### Decision: **PROCEED freeze-safe (no chart.js edit)**

A6-2 restore is implemented entirely in **`order-manager.js` `init()`**:

- `_bootstrapRuntimeOrderPersistenceV1()` — reads `sessionStorage`, calls existing `restoreRuntimeOrderStateFromSession`
- `_installRuntimeOrderPersistenceHooks()` — `pagehide` / `beforeunload` flush
- Existing `chart.js` restore paths remain as secondary/API layer; no merge hazard introduced.

**STOP escalation:** Not required.

---

## 3. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/order-runtime-persist.mjs` | **New.** Pure patch builder, serialize/deserialize, session key scoping, duplicate-id guard, store apply helper. |
| `homepage/public/chart/modules/order-runtime-persist.mjs` | **I8 mirror** — byte-identical. |
| `chart v 1.4/chart/modules/order-runtime-persist.test.mjs` | **New.** RC5-A6-2 property tests (roundtrip, F5 end-state, switch A/B). |
| `homepage/public/chart/modules/order-runtime-persist.test.mjs` | **I8 mirror** — byte-identical. |
| `chart v 1.4/chart/modules/order-manager.js` | Switch `__TALARIA_DISABLE_ORDER_PERSISTENCE_V1`; `sessionStorage` save on every `persistRuntimeOrderState`; boot restore; unload flush; critical persist after pending place; legacy path preserved when switch OFF. |
| `homepage/public/chart/modules/order-manager.js` | **I8 mirror** — byte-identical. |

**No other product files touched.**

---

## 4. Kill-switch (I3 + I13)

| Switch | Default | Behavior |
|--------|---------|----------|
| `window.__TALARIA_DISABLE_ORDER_PERSISTENCE_V1` | ON (fix when unset) | `sessionStorage` save + boot restore + unload flush |

**Switch OFF:** Reverts to `_persistRuntimeOrderStateLegacy` — `localStorage` fallback (no-session) + API `scheduleSessionStateSave` only; no `sessionStorage` write/restore.

Env mirror: `TALARIA_ORDER_PERSISTENCE_V1=0`.

---

## 5. Proof — RED → GREEN

### Commands

```text
node "chart v 1.4/chart/modules/order-runtime-persist.test.mjs"
node --check "chart v 1.4/chart/modules/order-manager.js"
TALARIA_ORDER_PERSISTENCE_V1=0 node "chart v 1.4/chart/modules/order-runtime-persist.test.mjs"
```

### GREEN (property harness)

```text
16 passed, 0 failed
```

- Pending limit + open position with SL/TP roundtrip through serialize/deserialize
- `applyRuntimeOrderPatchToStore` end-state: `pendingOrders[0].entryPrice === 1.095`, `openPositions[0].stopLoss === 1.08`, `takeProfit === 1.14`
- Session key scoped per `sessionId`

### RED (switch OFF)

```text
TALARIA_ORDER_PERSISTENCE_V1=0 → 15 passed, 1 failed
FAIL: persistence V1 default ON
```

Confirms switch gates the V1 default-ON assertion.

### I15 note

F5 reload actuation requires built product or harness navigation — **not run in this slot**. Property tests prove serialization + restore end-state; live F5 is NEEDS-LIVE.

---

## 6. Invariants checked

| Invariant | How |
|-----------|-----|
| D-019 session-scoped | `sessionStorage` key `chart_orders_runtime_session_v1:{sessionId\|no-session}` |
| Pending + open | Both arrays in patch |
| SL/TP preserved | Property test asserts `stopLoss` / `takeProfit` on restored open leg |
| No chart.js contest | STEP 0 disjoint map — boot hook in OM `init()` only |
| I8 | SHA256 match both trees |
| Replay interplay | Unchanged — existing P6 refresh spec; restore does not auto-play |

---

## 7. What I did NOT do / limits

- **Live F5 PO** not executed in dev harness this slot.
- **Harness `known-failing.json`** not updated (Lane 4 registers after RED).
- **Multichart iframe canonical store (A6-4)** out of scope — host session path only.
- **One-time legacy `localStorage` migration** read on boot if `sessionStorage` empty (backward compat); new writes go to `sessionStorage` only when V1 ON.
- `scheduleSessionStateSave` pre-hydrate drop race may still affect API path — `sessionStorage` is the fast authoritative F5 layer when V1 ON.

---

## 8. Live-verification handoff (PO — D-019)

**Build:** commit `258ba30f` atop order-interaction series `84926d3e` → `2f70df64`.

1. Place **1 pending limit** with SL/TP visible on chart.
2. Place **1 open market/limit fill** with SL/TP.
3. Note prices in panel + devtools `orderManager.pendingOrders` / `openPositions`.
4. **F5 reload** (same tab — sessionStorage survives).
5. Assert both orders restored at same prices; no duplicates/ghosts.
6. Toggle `window.__TALARIA_DISABLE_ORDER_PERSISTENCE_V1 = true` → repeat → orders gone after F5 (RED-again).
7. Close tab → reopen → orders cleared (session-scoped, not permanent).

Replay should restore **paused** at prior playhead (existing P6 behavior) — no auto-jump.

---

## 9. Status

**DONE (dev only) — NEEDS-LIVE**

Freeze-safe **A6 order-interaction contract (OM half) is complete** through A6-2. Remaining A6 items: **A6-4 host-canonical** (post-re-migration), **chart-half A6-3 flag** (separate PR).

---

## Commit + SHA256 (I8)

| Commit | `258ba30f` |
|--------|------------|

| Artifact | SHA256 (both trees match) |
|----------|---------------------------|
| `order-runtime-persist.mjs` | `e47b13cf8455b3e357cc9a7d44db754393df1b90e3ddd9d013a91989fda860c0` |
| `order-runtime-persist.test.mjs` | `142cdf1e7153ee4d178d63684874aad0a3ac90b82170de954f0557e2c6cf7a24` |
| `order-manager.js` | `2ad16b401e6266b87be950fa5166ac9fa162626a95f6ee72dc89b88b4f2e9409` |
