# T3 Re-migration Phase 1 IMPLEMENTATION — engine selection substrate

**Task:** T3 remig Phase 1 Lane 1 IMPLEMENTATION (engine selection substrate).  
**Date:** 2026-07-16  
**RC:** RC-1 / RC-4 Group A — H-R02, H-R03 mechanism; unblocks H-R01 store leg (when actuation lands).

**Phase 1 engine substrate: LANDED. H-R02/H-R03 reactParity 10/10: BLOCKED on harness actuation (Lane 4). Phase 2: NOT cleared.**

---

## 1. Task + RC

| Field | Value |
|-------|-------|
| Task id | T3 remig Phase 1 IMPLEMENTATION |
| Goal | Iframe-default ON for tool lifecycle V2 + legacy selection retire V2 behind master slice switch |
| RC | **RC-1 / RC-4 Group A** |
| Step 0 | H-S18 redraw loop fixed (prior commit in `drawing-tools-manager.js`) |

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/tool-lifecycle-store.js` | Added `_isMcRemigrationPhase1EngineSliceActive()`; flipped `isEnabled()` iframe branch: Phase 1 ON → lifecycle default ON in embed |
| `homepage/public/chart/modules/tool-lifecycle-store.js` | Mirror (I8) |
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | Added `_isMcRemigrationPhase1EngineSliceActive()`; flipped `_isToolLifecycleV2Enabled()` iframe branch (includes Step 0 H-S18 guard) |
| `homepage/public/chart/modules/drawing-tools-manager.js` | Mirror (I8) |
| `chart v 1.4/chart/chart.js` | Added `_isMcRemigrationPhase1EngineSliceActive()`; flipped `_isLegacySelectionRetireV2Enabled()` iframe branch (~2349–2365 only; snap-back regions untouched) |
| `homepage/public/chart/chart.js` | Mirror (I8) |

**SHA256 (pairs match):**

| File | SHA256 |
|------|--------|
| `tool-lifecycle-store.js` | `6A644DEF60A0AAFD12C80F21BF6966EA938968BF24D715D9B4B48FCF4E329ECA` |
| `drawing-tools-manager.js` | `46F10B6F58519AE5C6A69747D002B5F3C416697DAF6D58238DC8D1FC8DB1D2F7` |
| `chart.js` | `994A59F3A3AB1506B69332A97BBC2142C1956015DFA6D144BB4EF6AF273C031B` |

No other files touched. No React, harness registry, or `known-failing.json` edits.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Effect |
|--------|---------|--------|
| `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` | **unset** (= Phase 1 ON) | Iframe: lifecycle + legacy-retire ON by default |
| `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` | `true` | One-knob revert to fallback-B iframe opt-in |
| `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` | — | Still forces OFF everywhere when `true` |
| `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` | — | Still forces OFF everywhere when `true` |

**Host A / single-chart:** unchanged — predicates ON when unset regardless of master switch.

**React:** no reads — N/A for I13 on JSX.

---

## 4. Proof — RED → GREEN

### A. Engine substrate proof (dev-only)

```bash
node t3-remig-phase1-engine-proof.mjs
```

| Leg | Actuation | Measures | Result |
|-----|-----------|----------|--------|
| **phase1Off A/B** | `bootReactMultichart({ phase1Off: true })` | iframe `lifecycle/legacy/storeEnabled` all `false` | **PASS** |
| **Phase 1 ON** | default boot | iframe predicates all `true` | **PASS** |
| **Single select** | programmatic `dm.selectDrawing(d)` | `selectedDrawings` contains id | **PASS** |
| **Ctrl multi** | programmatic `selectDrawing(d, true)` | both ids in `selectedDrawings` | **PASS** |

### B. reactParity H-R02 / H-R03 / H-R01 (built dist-v9, build `20260715b2`)

```bash
npm run test:react -- --only=H-R02,H-R03,H-R01 --runs=10
```

**Result: FAIL-REAL-BUG 0/10** — not a Phase 1 predicate failure.

**Root cause (harness actuation, not engine):** `drawingHitLocalPoint` returns off-viewport coordinates when the chart is panned (`offsetX ≈ -13576`). `elementFromPoint` returns `null`; real `page.mouse.click` never reaches `handleMouseDown` → `selectDrawing`. Orphan handles visible without store population.

Evidence:

| Panel | Hit coords | `elementFromPoint` | Programmatic `selectDrawing` |
|-------|------------|--------------------|------------------------------|
| Host A | `x=-61` | `null` | **works** (store populated) |
| Panel B | `x=-382` | `null` | **works** (store populated) |

`--migration-on` also fails H-R02 (same hit-coord bug; pre-dates Phase 1).

**Lane 4 action required:** fix `drawingHitLocalPoint` / `localToPagePoint` for panned React multichart surfaces before H-R02/H-R03 10/10 can discharge Phase 1.

### C. Master-switch A/B (predicate level — proven)

| Boot | Panel B `lifecycle` | Panel B `legacy` |
|------|---------------------|------------------|
| default (Phase 1 ON) | `true` | `true` |
| `--phase1-off` | `false` | `false` |

Harness `--phase1-off` wired in `react-parity-lib.mjs` (Lane 4).

### D. Manager gate regression

```bash
npm run test -- --only=H-S18 --runs=1
FINAL H-S18 PASS
```

Full manager `gate` not re-run (Lane 4 re-gate). H-S18 Step 0 fix holds.

### E. T2 local invalidation (no regression)

```bash
node t2-step4-local-invalidation-proof.mjs
FINAL T2-step4-local-invalidation PASS
```

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I3 | Master + child switches; default Phase 1 ON |
| I8/I9 | All three file pairs SHA256-identical |
| I13 | Engine files only; master gates all three predicates |
| I14 | No parent-global changes |
| I15 | Engine proof uses real built dist boot + store end-state; reactParity click path blocked on harness coords |
| Single-chart / host A | Predicate paths unchanged |
| chart.js snap-back | Regions 2456–2526 / 17296–17357 untouched |

---

## 6. What I did NOT do / limits

- **H-R02/H-R03/H-R01 10/10 not achieved** — harness `drawingHitLocalPoint` off-viewport on panned charts (Lane 4).
- Did not run full `gate:react` or manager `gate` (expect known-failing H-R rows unchanged until harness fix).
- Did not implement Phase 2 (React ownership / routing V3).
- Did not edit `known-failing.json` / remove H-R02/H-R03 from tracked-red.
- No build id bump / `build:live` (engine modules served live via harness `/chart/modules/*` mapping).
- No git commit (awaiting user request).

---

## 7. Live-verification handoff

PO on next staging build (after Manager bump):

1. Open 2v multichart; confirm build id inside panel B iframe.
2. Panel B: place rectangle → single-click on body → shape stays selected (resize handles + re-click does not orphan).
3. Two trendlines → Ctrl+click second → both highlighted.
4. **V9 quick bar on panel B may still fail** (Phase 2) — not a Phase 1 failure per D-010.
5. Revert test: `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE = true` in panel boot → panel B back to fallback-B (no store on click).

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

| Item | Status |
|------|--------|
| Phase 1 engine substrate | **LANDED** — predicates + programmatic select proven |
| Master-switch A/B | **Proven** at predicate level |
| H-R02/H-R03 10/10 | **BLOCKED** — harness actuation (Lane 4) |
| Phase 2 start | **NOT cleared** — need H-R02/H-R03 green on honest real-click path |

---

## Handoff

| Lane | Action |
|------|--------|
| **Lane 4** | Fix `drawingHitLocalPoint` for panned dist-v9 layout; re-run H-R02/H-R03 10/10; update `known-failing.json`; full manager re-gate |
| **Lane 2** | Phase 2 (ownership + routing V3) after H-R02/H-R03 green |
| **Manager** | Build bump when committing; file-scoped commit of 6 engine files + `t3-remig-phase1-engine-proof.mjs` |
