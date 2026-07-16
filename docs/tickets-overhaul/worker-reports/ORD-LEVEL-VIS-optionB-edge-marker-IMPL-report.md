# ORD-LEVEL-VIS Option B — off-screen order-level edge marker IMPLEMENT

## 1. Task + RC

- **Task:** `ORD-LEVEL-VIS-optionB-edge-marker-IMPL-lane3.md` — freeze-safe Option B edge marker when order levels map off the main price pane.
- **RC:** **RC-5** (order-entry chart overlay). Addresses `ORD-LEVEL-VIS` in `RESOLUTION-TRACKER.csv`.
- **Option A (chart.js Y-domain):** NOT implemented — escalated separately (ESC-022).

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/order-manager.js` | Switch `__TALARIA_DISABLE_ORDER_OFFSCREEN_MARKER_V1` (default ON); edge-marker helpers; `_syncOffscreenLevelMarker` + pass tracking; wired into `updateOrderLines`, `updateSLTPLines`, `positionPendingOrderTargets`, `updateBELines`. |
| `homepage/public/chart/modules/order-manager.js` | **I8 mirror** — byte-identical. |
| `chart v 1.4/chart/modules/order-offscreen-marker.mjs` | Pure edge/clamp/switch helpers for property tests. |
| `homepage/public/chart/modules/order-offscreen-marker.mjs` | **I8 mirror** — byte-identical. |
| `chart v 1.4/chart/modules/order-offscreen-marker.test.mjs` | Property tests GREEN + switch RED-again. |
| `homepage/public/chart/modules/order-offscreen-marker.test.mjs` | **I8 mirror** — byte-identical. |

**No `chart.js`, `replay-system.js`, or re-migration edits.**

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Behavior |
|--------|---------|----------|
| `window.__TALARIA_DISABLE_ORDER_OFFSCREEN_MARKER_V1` | **ON** (marker when unset) | Off-plot levels show compact edge marker at plot top/bottom |

**Switch `true`:** `_syncOffscreenLevelMarker` no-ops; `_finalizeOffscreenMarkersForChart` removes all `.om-offscreen-marker`; identical to pre-fix hide-only behavior.

**Gated surface:** `order-manager.js` only — entry, open SL/TP, pending SL/TP/BE, BE lines.

Test env: `TALARIA_TEST_DISABLE_ORDER_OFFSCREEN_MARKER_V1=1`.

---

## 4. Proof — RED → GREEN

### Commands

```bash
cd "chart v 1.4/chart/modules"
node order-offscreen-marker.test.mjs
TALARIA_TEST_DISABLE_ORDER_OFFSCREEN_MARKER_V1=1 node order-offscreen-marker.test.mjs
```

### GREEN (switch ON)

```text
GREEN — off-screen marker edge math + in-plot clamp passed
```

### RED-again (switch OFF)

```text
GREEN — helpers present; switch-OFF disables marker feature (RED-again)
```

### I15 honesty

| Scenario | Dev proof | Live proof |
|----------|-----------|------------|
| RC5-ORD-LEVEL-VIS-1 (pending entry off-screen) | Property: off-domain Y → clamped marker Y in `[plotTop, plotBottom]` | **NEEDS-LIVE** — place pending limit far from market, assert `.om-offscreen-marker` in DOM |
| RC5-ORD-LEVEL-VIS-2 (off-screen SL) | Same clamp math for `open-sl-*` marker id path | **NEEDS-LIVE** |
| RC5-ORD-LEVEL-VIS-3 (panel B) | Per-chart `updateOrderLines(ch)` + nested pass — no host-only branch | **NEEDS-LIVE** on panel B iframe |

**Actuation:** Property tests are synthetic geometry — not DOM placement. Harness `RC5-ORD-LEVEL-VIS-*` registration is Lane 4.

**Determinism:** Property tests deterministic; 2/2 pass paths above.

---

## 5. Mechanism summary

When `yScale(price)` maps outside `[margin.t, plotBottom]`:

1. Existing `_applyOrderRowMainPlotVisibility` still hides full line/labels (`display:none`).
2. **New:** `_syncOffscreenLevelMarker` renders `.om-offscreen-marker` at clamped edge Y (▲ above / ▼ below) with color + tag + `formatPrice(price)`; `pointer-events:none`.
3. When level re-enters plot, marker removed (not in active pass set) and normal line path shows.
4. Reposition rides `updateOrderLines` / `updateSLTPLines` / `positionPendingOrderTargets` / `updateBELines` — no new rAF loop.

### Key hunks

| Region | Lines (approx) | Role |
|--------|----------------|------|
| Switch + pure helpers | ~123–141 | `_orderOffscreenMarkerV1Enabled`, edge math |
| Marker API | ~39295–39405 | `_syncOffscreenLevelMarker`, finalize pass |
| Entry hook | ~39795–39810 | `updateOrderLines` per order |
| SL/TP hook | ~38568, ~38930 | `updateSLTPLines` |
| Pending targets | ~34107–34125 | `positionPendingOrderTargets` |
| BE hook | ~39045 | `updateBELines` |

---

## 6. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| **Freeze-safe** | `order-manager.js` only |
| **I3 / I13** | Dedicated switch; OFF removes markers and restores hide-only |
| **I8** | Homepage mirror SHA256 match |
| **I15** | Live DOM proof deferred — labeled NEEDS-LIVE |

---

## 7. What I did NOT do / limits

- No chart.js Y-domain expansion (Option A / ESC-022).
- No click-to-recenter on marker (`pointer-events:none` per spec).
- No Lane 4 harness DOM scenarios registered.
- Preview/draft lines unchanged (separate path).
- PO live confirm not run.

---

## 8. Live-verification handoff

1. Default build (switch unset).
2. Place **pending limit** well above visible range (BUY limit above market).
3. Expect compact pill at **top** of plot: `▲ LIMIT BUY <price>` in order color.
4. Pan/zoom until level enters view — full horizontal line replaces marker.
5. Console: `window.__TALARIA_DISABLE_ORDER_OFFSCREEN_MARKER_V1 = true` → reload → marker absent (line still hidden off-plot).
6. Repeat on **panel B** multichart iframe with same symbol.
7. Set off-screen **SL** on open position — marker at bottom/top with `SL` tag.

---

## 9. SHA256 (I8)

| File | SHA256 (both trees) |
|------|---------------------|
| `order-manager.js` | `9CBF3D021531A9E0E9AB7E2357F2274C40F719F7456FA1D7EBDFDA0C77602742` |

**Commit hash:** `6fe92e25`

---

## 10. Status

**DONE (dev only) — NEEDS-LIVE**

Option B landed freeze-safe; PO must confirm off-screen pending → edge marker on real built product.
