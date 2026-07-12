# T0 Lane 4 — Worker Deliverable Report

**Task:** RC-7 per-bug registry + interactive harness scaffolding  
**Date:** 2026-07-12  
**Build under test:** harness synthetic server (engine b105 tree, no behavior fixes)

---

## 1. PER-BUG-REGISTRY.csv

**File:** `docs/tickets-overhaul/PER-BUG-REGISTRY.csv`  
**Generator:** `docs/tickets-overhaul/scripts/build-per-bug-registry.mjs`

| Metric | Value |
|---|---|
| Total rows | **936** |
| Hand-read threads | **9** → **133** bug rows |
| Auto-split (short threads, 1 bug/thread) | **803** rows |

### Breakdown by RC guess

| RC | Rows |
|---|---|
| RC-1 | 341 |
| RC-3 | 124 |
| RC-4 | 108 |
| RC-7 | 117 |
| RC-2 | 85 |
| RC-6 | 70 |
| RC-5 | 66 |
| RC-8 | 25 |

### Breakdown by symptom family (top)

| Family | Rows |
|---|---|
| slow-interaction | 394 |
| multichart-parity | 108 |
| label-mis-anchor | 65 |
| indicator-lifecycle | 65 |
| order-entry | 66 |
| drag-mis-anchor | 60 |
| quick-menu-defect | 44 |
| first-click-fails | 40 |
| stuck-until-click | 31 |
| replay-interaction | 25 |
| selection-menu-desync | 15 |
| visibility-toggle | 15 |
| ghost-after-delete | 8 |

**Hand-read threads:** TAL-00157 (24), TAL-00322 (17), TAL-00323 (15), TAL-00752 (22), TAL-00117 (13), TAL-00228 (11), TAL-00245 (12), TAL-00350 (11), TAL-00271 (10).

---

## 2. Harness helpers + scenarios

### New file: `interactive-helpers.mjs` (both trees, byte-identical)

Page-object helpers added per spec:

- `placeTool(page, panelId, toolType, points[])`
- `selectTool(page, ref, { click })`
- `openSettings(page, ref)`
- `deleteTool(page, ref)` + `deleteToolViaSettings(page, ref)` (settings-dialog delete path)
- `assertCanvasRepainted(checks, label, before, after)`
- `assertMenuState(checks, label, expected, actual)`
- `assertNoGhostAfterDelete(checks, label, ref, state)`

Supporting reads: `readInteractiveState`, `deselectAllViaCanvas`, `defaultTrendlinePoints`, `defaultRectanglePoints`.

### New scenarios (registered in `scenarioList()`)

**H-S32 — first-click-fails (TAL-00322 family)**  
Boot 1-panel host → place trendline → re-arm draw tool → single-click stroke once → assert `selectedIds` + `toolbarVisible` on **first** click.

**H-S33 — ghost-after-delete (TAL-00157 family)**  
Boot 1-panel host → place rectangle → open settings → delete via settings `onDelete` → assert drawing removed + no settings/toolbar/axis-highlight ghosts.

### known-failing.json

- `expectedTests`: 29 → **31** (added H-S32, H-S33)
- `knownFailing`: `{ "H-S32": "...", "H-S33": "..." }` (tracked RED)

**I9:** No existing scenario assertions were changed. H-S2…H-S31 untouched.

---

## 3. RED evidence (flake-stable ×3)

Command: `npm run test -- --only=H-S32,H-S33 --runs=3`  
Log: `chart v 1.4/chart/multichart-prod/harness/red-evidence-hs32-hs33-x3.txt`

| Scenario | Run 1 | Run 2 | Run 3 | Verdict |
|---|---|---|---|---|
| H-S32 | FAIL | FAIL | FAIL | FAIL-REAL-BUG |
| H-S33 | FAIL | FAIL | FAIL | FAIL-REAL-BUG |

**H-S32 stable failure (representative):**
```
[FAIL] H-S32 CORE: first click selects drawing + shows Quick Menu
  — selected=[] expected=["<id>"]; toolbarVisible=false expected=true
```
Mechanism: with draw tool re-armed (`setTool`), placement-mode guard causes first click on existing stroke to no-op (`selectDrawing` returns while `_isPlacementModeActive()`).

**H-S33 stable failure (representative):**
```
[FAIL] H-S33 CORE: drawing removed from store — drawingCount=1
[FAIL] H-S33 CORE: no ghost artifacts after delete — settingsOpen, settingsDrawingId
```

---

## 4. Gate GREEN (31 tracked, 0 regressions)

Command: `npm run gate`  
Log: `chart v 1.4/chart/multichart-prod/harness/gate-t0-evidence.txt`

```
[gate] PASS: no new regressions; 2 known-failing tracked.
Known-failing still red: H-S32, H-S33
Regressions: (none)
```

Tracked count: **29 → 31** scenarios; **2** known-failing; **0** regressions.

---

## 5. SHA256 harness pairs (I8)

| File | Match | SHA256 |
|---|---|---|
| interactive-helpers.mjs | MATCH | `f8024755e60ad8ada21a49e69d7a51d487da463794777c3789a8875083fb6d3b` |
| scenarios.mjs | MATCH | `da9d5b4802a3cba954788316090db7ab5f7607fafd7e8eb791f82a501c074c8f` |
| known-failing.json | MATCH | `220109fa88a153e53affb2a751e9df4a2cde68d395240419dc4ceb883a846204` |
| harness-lib.mjs | MATCH | `62917b3ee0fe817dfd7f29048702f28a1e3881f02b59ecdfdfd01b6ea29536a4` |
| run.mjs | MATCH | `533279bae874357a2d4fada2253872343ddf98f8f15d424786aa5597e3f0160c` |
| gate.mjs | MATCH | `864291e47dfc6a1eb404d453b31133b6c49cb545422caabd78f8281d3f5fd78e` |
| serve.mjs | MATCH | `6b2ca3ca3a01a289aa9066ddc7a3590c434e2fe205ca3cb8ea9c4d14e8e6551a` |

Canonical ↔ homepage paths:
- `chart v 1.4/chart/multichart-prod/harness/`
- `homepage/public/chart/multichart-prod/harness/`

---

## 6. Syntax / lint

```
node --check interactive-helpers.mjs  ✓
node --check scenarios.mjs            ✓
node --check gate.mjs                 ✓
```

No new npm dependencies. No security rule changes (I10).

---

## 7. Explicit invariant statements

- **I9:** Existing H-S2…H-S31 scenario assertions unchanged. Two new scenarios added as tracked known-failing only.
- **I10:** No changes to `.cursor/rules/security-and-supply-chain.mdc`; no new dependencies.
- **Kill-switch:** N/A (T0 scaffolding only; no `__TALARIA_*` flags).

---

## Files touched

| Path | Action |
|---|---|
| `docs/tickets-overhaul/PER-BUG-REGISTRY.csv` | created |
| `docs/tickets-overhaul/scripts/build-per-bug-registry.mjs` | created |
| `docs/tickets-overhaul/scripts/t0-stats.mjs` | created |
| `chart v 1.4/chart/multichart-prod/harness/interactive-helpers.mjs` | created |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | H-S32/H-S33 + imports |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | +H-S32/H-S33 |
| `homepage/public/chart/multichart-prod/harness/*` | mirrored (byte-identical) |
