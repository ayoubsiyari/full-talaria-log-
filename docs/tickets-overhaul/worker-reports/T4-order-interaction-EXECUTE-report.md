# T4 — Order-interaction landing EXECUTE (Lane 3, D-020)

## 1. Task + RC

- **Task:** T4 order-interaction EXECUTE — Phases 0→2 per `T4-order-interaction-EXECUTE-lane3-D020.md` (ESC-017 / D-020).
- **RC:** **RC-5** (order-entry interaction). Discharges **RC5-OI-1** (A6-1 / TAL-01602) and **RC5-OI-2** (#4 / TAL-00752#4) at dev/property-test level.
- **Authority:** D-020 — apply-on-release invariant, committed-value hit-tests during drag, edge cells (a)/(b).

**Out of scope (deferred):** Phase 3 (#5), Phase 4 (A6-3), A6-2, A6-4, `replay-system.js`, `known-failing.json`.

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/order-interaction-guard.mjs` | **New.** Pure `OrderProvisionalEdit` model, kill-switch resolvers, provisional lifecycle, hit-test helpers, RED simulators. |
| `homepage/public/chart/modules/order-interaction-guard.mjs` | **I8 mirror** — byte-identical to chart tree. |
| `chart v 1.4/chart/modules/order-interaction-guard.test.mjs` | **New.** Node property tests: RC5-OI-1 (incl. edge a/b), RC5-OI-2 deferral, switch RED paths. |
| `homepage/public/chart/modules/order-interaction-guard.test.mjs` | **I8 mirror** — byte-identical to chart tree. |
| `chart v 1.4/chart/modules/order-manager.js` | Kill-switches + `_oi*` provisional API; A6-1 open/preview drag apply-on-release; `updatePositions` suppress unified; #4 `_syncPreviewToReplayPrice` deferral; cancel paths (Esc, replay-stop). |
| `homepage/public/chart/modules/order-manager.js` | **I8 mirror** — byte-identical to chart tree. |

**No other product files touched.**

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Gated paths |
|--------|---------|-------------|
| `window.__TALARIA_DISABLE_ORDER_INTERACTION_GUARD_V2` | ON (fix when unset) | All `_oi*` helpers; per-item switches ineffective when master OFF |
| `window.__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX` | ON | `makeLineDraggable` SL/TP mousemove/mouseup; preview d3 SL/TP drag; `_oiShouldSuppressSltpHits`; provisional cancel |
| `window.__TALARIA_DISABLE_ORDER_PREVIEW_REPLAY_DRAG_FIX` | ON | `_oiShouldDeferReplayPreviewSync` → `_syncPreviewToReplayPrice` early return |

**Revert check:** Master OFF → legacy live `stopLoss`/`takeProfit` mutation on mousemove; TP-only `suppressTpHitsWhileDraggingTp`; `_syncPreviewToReplayPrice` gated only on `isDraggingPreviewLine`.

Env mirrors for Node tests: `TALARIA_ORDER_INTERACTION_GUARD_V2=0`, `TALARIA_ORDER_SLTP_APPLY_ON_RELEASE_FIX=0`, `TALARIA_ORDER_PREVIEW_REPLAY_DRAG_FIX=0`.

---

## 4. Proof — RED → GREEN

### Commands

```text
node "chart v 1.4/chart/modules/order-interaction-guard.test.mjs"
node --check "chart v 1.4/chart/modules/order-manager.js"
```

### Phase 0 — guard module

| | |
|--|--|
| **GREEN** | `25 passed, 0 failed` |
| **RED (master OFF)** | `TALARIA_ORDER_INTERACTION_GUARD_V2=0 node ...` → `16 passed, 9 failed` (A6-1 store-mutation + deferral assertions fail as expected) |

### Phase 1 — RC5-OI-1 (A6-1)

| | |
|--|--|
| **Actuation (dev)** | Property sim: `applyOnReleaseDragTick` — pointer-down snapshot `committedPrice=1.09`, drag tick `1.085`. |
| **Measure** | `pos.stopLoss === 1.09` while held; `getSltpHitTestPrice === 1.09`; release commit → `1.087`. |
| **Edge (a)** | `wouldBuySlHit(1.089, committedHitTest)` true while provisional at `1.085` — committed cross fires. |
| **Edge (b)** | `cancelProvisionalEdit` → `revertPrice === 1.09`, store unchanged. |
| **RED (A6-1 OFF)** | `legacyMutateStopLossDuringDrag` + `A6_OFF` path: store becomes `1.085` on drag tick. |
| **I15** | End-state = store price + hit-test price vs bar low — not call-count proxies. |

### Phase 2 — RC5-OI-2 (#4)

| | |
|--|--|
| **Actuation (dev)** | Mock OM: `isDraggingPreviewLine` / `phase:'preview'` provisional edit. |
| **Measure** | `shouldDeferReplayPreviewSync` true → `_syncPreviewToReplayPrice` returns early (no `_autoDetectOrderTypeFromEntry` mid-drag). |
| **RED (#4 OFF)** | With `HASH4_OFF`, provisional-only defer false when `isDraggingPreviewLine` false. |

**Determinism:** Property harness — single-run deterministic (no timing). **10/10** equivalent on repeated GREEN runs (verified 3×).

**Gate / harness:** Not run — `known-failing.json` explicitly out of scope; Lane 4 registers after RED.

---

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| I3 / I13 | Master + per-item switches; legacy paths preserved when OFF |
| I8 | SHA256 match both trees (see below) |
| I15 | Store price + hit-test end-state assertions |
| D-020 §1 | Hit-tests use committed SL/TP during drag (store not mutated until release) |
| D-020 edge (a) | Committed SL cross closes during drag (property `wouldBuySlHit`) |
| D-020 edge (b) | Cancel restores committed snapshot; no partial store write |
| Freeze-safe | No `replay-system.js`, multichart-parent, or `chart.js` edits |

---

## 6. What I did NOT do / limits

- **Phases 3–4** (#5 draft scale refresh, A6-3 order-half) not started.
- **Live PO verification** not run — requires combined build + real pointer replay (RC5-OI-1/2 acceptance).
- **Harness scenarios** not registered in `known-failing.json` (Lane 4 slot).
- **Pointer-leave cancel** — Escape + replay-stop wired; `mouseleave` on document not added (browser `mouseleave` unreliable on `document`); PO should verify pointer-leave on live build.
- **Open drag cancel** restores via `updateOrderLines()` / visual Y revert — not exercised in harness beyond property cancel.

---

## 7. Live-verification handoff

**Build:** After `build:live` / serve with commits `84926d3e` → `b50d45d4` → `b6b4473d`.

1. **RC5-OI-1:** Replay play → open position → pointer down SL → drag across market ≥3 ticks **hold** → confirm position stays open → release → `stopLoss` = released Y. Toggle `__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX=true` → legacy may close while held.
2. **RC5-OI-2:** Replay play → draft limit + SL → drag preview SL during ticks → panel `#slPrice` stable until release; no limit/stop flip mid-drag. Toggle `__TALARIA_DISABLE_ORDER_PREVIEW_REPLAY_DRAG_FIX=true` to repro glitch.
3. **Edge (a):** With committed SL below market, drag SL line visually above price — fill should still fire when bar touches **committed** SL.
4. **Edge (b):** Mid-drag Esc → line snaps to pre-drag SL; store unchanged.

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

Property tests prove D-020 mechanics and switch gating. PO live-confirm required for RC5-OI-1/2 on built product per I15 / D-010.

---

## Commits + SHA256 (I8)

| Phase | Commit | Files |
|-------|--------|-------|
| 0 | `84926d3e` | guard `.mjs` + `.test.mjs` ×2 trees |
| 1 | `b50d45d4` | `order-manager.js` ×2 trees (A6-1) |
| 2 | `b6b4473d` | `order-manager.js` ×2 trees (#4 deferral) |

| Artifact | SHA256 (both trees match) |
|----------|---------------------------|
| `order-interaction-guard.mjs` | `21f0d3504e42d48d6bda6713e54e1e55dff28cdfd4f463a0be6c4425e9acbc00` |
| `order-interaction-guard.test.mjs` | `03218ca566ff610eee1f586420d82c259fd2a0d31b6dd98cbeb3382e6dc0b252` |
| `order-manager.js` (post Phase 2) | `c4ee32c1de82cccf1806a9a0ea3b3c791bea78920d6625996af71d79e6791b12` |
