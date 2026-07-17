# ORD-LEVEL-VIS Option B revert — off-screen order edge markers removed

## 1. Task + RC

- **Task:** ORD-LEVEL-VIS-REVERT (Lane 3) — PO request to remove Option B off-screen edge markers (▲/▼ pills); restore hide-until-in-range behavior.
- **RC:** D-025 / ORD-LEVEL-VIS — Option B pulled at PO request; Option A (keep-in-view) remains post-unfreeze.

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/order-manager.js` | Removed `_orderOffscreenMarkerV1Enabled`, edge helpers, `_getMainPlotLayoutForMarker`, `_begin/_track/_finalizeOffscreenMarkerPass`, `_syncOffscreenLevelMarker`; removed all call sites in `positionPendingOrderTargets`, `updateOrderLines`, `updateSLTPLines`, `updateBELines`; pending off-plot levels hide unconditionally (no marker). **Untouched:** `_oiResolveOpenSltpDragDisplayPrice` (b2 v2), `splitOrderType`/`splitColor` order in `updatePreviewLines` (b11 TDZ). |
| `homepage/public/chart/modules/order-manager.js` | **I8 mirror** — byte-identical to chart v 1.4 copy (`fc /b` — no differences). |
| `chart v 1.4/chart/modules/order-offscreen-marker.mjs` | **Deleted** |
| `chart v 1.4/chart/modules/order-offscreen-marker.test.mjs` | **Deleted** |
| `homepage/public/chart/modules/order-offscreen-marker.mjs` | **Deleted** |
| `homepage/public/chart/modules/order-offscreen-marker.test.mjs` | **Deleted** |
| dist-v9 / live / SW / legacy / embed / harness (both trees) | Rebuilt via `node scripts/bump-dist-v9-cache.mjs --dist` → build id **`20260717b4`**. |

**No other product files touched** for this revert (pre-existing unstaged workspace files outside this scope were not modified).

### Removed hunks (summary)

- Top-level switch + pure fns (~123–145 pre-edit)
- Pending pass begin/finalize + `_syncOffscreenLevelMarker` (~33925–34188, ~34150–34166)
- SL/TP/BE marker sync (~38601–38607, ~38981–38987, ~39082–39088)
- Marker method block (~39397–39572)
- `updateOrderLines` marker pass (~39558–39559, ~39864–39870, ~39894–39895)

---

## 3. Kill-switch (I3 + I13)

| Switch | Status |
|--------|--------|
| `window.__TALARIA_DISABLE_ORDER_OFFSCREEN_MARKER_V1` | **Removed** — feature deleted; prior OFF behavior is now the only behavior |

**Ungatable:** N/A — revert is total removal, not a feature flag.

Preserved switches (unchanged):

- `__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1` (SL/TP drag v2)
- `__TALARIA_DISABLE_ORDER_INTERACTION_GUARD_V2` / A6-1 sub-leg

---

## 4. Proof — RED → GREEN

### Grep-clean (product code)

```text
rg "om-offscreen-marker|OFFSCREEN_MARKER|_syncOffscreenLevelMarker|order-offscreen-marker" chart\ v\ 1.4/chart homepage/public/chart
→ 0 hits in .js/.mjs (docs-only references remain in tickets-overhaul/)
```

### Node tests

```text
cd "chart v 1.4/chart/modules"
node order-interaction-guard.test.mjs
=== 36 passed, 0 failed ===
```

Confirms A6-1 guard paths used by SL/TP drag v2 still GREEN.

### TDZ + SL/TP drag preservation (static)

| Fix | Anchor | Present after revert |
|-----|--------|----------------------|
| Multi-entry TDZ (b11) | `updatePreviewLines` ~18718–18719: `splitOrderType` before `splitColor` | **Yes** |
| SL/TP drag v2 (b2) | `_oiResolveOpenSltpDragDisplayPrice` ~732; used in SL/TP loops ~38521, ~38756 | **Yes** |

### I15 actuation / measurement

| Claim | Actuation | Measurement | Status |
|-------|-----------|-------------|--------|
| No edge markers off-plot | **Not run** — no live chart drag/zoom | — | **NEEDS-LIVE** |
| Multi-entry preview | Node guard tests only | TDZ lines intact in source | **NEEDS-LIVE** |
| Open SL/TP drag | Node guard tests only | v2 helper intact in source | **NEEDS-LIVE** |

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I8 | Both `order-manager.js` trees byte-identical; marker `.mjs` deleted both trees |
| I3 | Removed switch with feature (not left dangling) |
| Surgical revert | TDZ + SL/TP v2 hunks verified by grep + static read |
| Scope | No blind `git revert 6fe92e25` |

---

## 6. What I did NOT do / limits

- **No live PO confirm** that ▲/▼ markers are gone off-plot (NEEDS-LIVE).
- Did not re-run full multichart harness gate (unrelated to marker removal).
- `order-offscreen-marker.test.mjs` deleted — no replacement test (feature removed).

---

## 7. Live-verification handoff

**Build id:** **`20260717b4`** (confirm inside panel iframe: `document.querySelector('script[src*="talaria-v9-live"]')?.src`).

1. Enter replay; place limit/SL/TP **far off visible range** → **no** `.om-offscreen-marker` / ▲▼ pill at chart edge; level **hidden** until price scrolls into view.
2. Multi-entry preview: add second entry — **no** `splitOrderType` TDZ console error.
3. Fill order; drag open SL or TP — **full-width line follows** cursor (b2 v2).
4. Console clean.

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

Grep-clean + guard tests GREEN; PO must confirm markers gone on real built product (I15).

**Commit:** pending user request (workspace changes uncommitted at report time).

**Supersedes:** ORD-LEVEL-VIS Option B impl (`6fe92e25`); reopens hide-until-in-range per original ORD-LEVEL-VIS diagnostic.
