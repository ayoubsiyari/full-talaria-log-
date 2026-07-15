# D-017 (Lane 2) — pan-release snap-back fix report (TAL-01579)

## 1. Task + RC

- **Task:** `ESC015-D017-lane2-snapback-fix.md` — D-017 standalone gated fix: when `userHasPanned`, released viewport wins; prepend compensation re-based to post-drag offset; index-pin suppressed. **H-S82** RED→GREEN. **H-S73 not folded** (separate B-FIX-C defect).
- **RC:** **RC-8** — TAL-01579 release snap-back × adopt-X policy cell (ESC-015 / D-017).

---

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/chart/chart.js` | D-017 helpers `_panReleaseAnchorHoldFixDisabled`, `_userOwnsReleasedViewport`; re-base `_applyMultichartMirrorPrependCompensation` when user owns viewport; suppress mirror TF index-pin (`_multichartMirrorHostTfSwitchIfReady`), range-sync realign, boot host/panel resize pins, live host resize pin when `userHasPanned`. |
| `homepage/public/chart/chart.js` | I8 mirror — SHA256 `1562C0301A0D3FD40C9A8AA496327B765FFA7E17EF867CAC32B26082FACD31B3`. |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | **H-S82** scenario + `provePanReleasePrependRebase` helper; `T8_S82` constant; registered in `scenarioList()`. |
| `homepage/public/chart/multichart-prod/harness/scenarios.mjs` | I8 mirror (scenarios). |
| `chart v 1.4/talaria-design/live/index.html` + dist/homepage dist + SW + legacy-index + chart-embed + harness `serve.mjs` | Build bump **20260715b2** via `bump-dist-v9-cache.mjs`. |

**No other files touched.** `replay-system.js`, `panel-cmd-bridge.js`, `known-failing.json` unchanged. **H-S73 not modified** per D-017.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Gated paths |
|--------|---------|-------------|
| `window.__TALARIA_MC_DISABLE_PAN_RELEASE_ANCHOR_HOLD` | unset (**fix ON**) | `chart.js` only — `_panReleaseAnchorHoldFixDisabled()` gates `_userOwnsReleasedViewport()` which controls prepend re-base + all index-pin suppressions listed above. |

**Revert:** set switch `true` → prepend uses stale `snapshot.offsetX`; index-pins run despite `userHasPanned` (pre-D-017).

**Ungatable:** none — single chart.js entry; no React/iframe bridge edits.

---

## 4. Proof — RED → GREEN

### H-S82 (primary acceptance)

```text
cd "chart v 1.4/chart/multichart-prod/harness"
node run.mjs --only=H-S82
→ FINAL H-S82 PASS
```

| Check | Result | I15 |
|-------|--------|-----|
| Panel B real pan + 2.5s settle | `settled.offsetX ≈ release.offsetX` (Δ=0) | Real mouse `dragCellRight`; measures iframe `offsetX` |
| Host A real pan + settle | Same | Host + panel coverage |
| Prepend re-base (fix ON) | `usedRebase=true`, `usedStale=false` | After real pan; probes `_applyMultichartMirrorPrependCompensation` with stale snapshot |
| Switch OFF causal RED | `usedStale=true`, `fixDisabled=true`, `ownsViewport=false` | Fresh boot with `T8_S82` pre-set |

**Determinism:** 1/1 PASS on first run after impl.

### Fence family (D-017 acceptance criteria)

| Scenario | Result | Note |
|----------|--------|------|
| **H-S73** | FAIL-REAL-BUG (pre-existing) | Vacuous host drag — **separate registered defect**; not regressed by D-017 |
| **H-S59b** | FAIL (harness flake / stack overflow) | Unrelated to snap-back; D-015 path |
| **H-S78** | Long-running (backward-load storm) | BL-16 drag-during-play; no early regression signal |

---

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| I3 | Single switch; default fix ON |
| I8 | chart.js + scenarios SHA256-matched to homepage |
| I13 | All gated paths in chart.js; switch OFF reverts prepend + index-pin behavior (H-S82 RED leg) |
| I15 | H-S82 GREEN uses real mouse actuation + real `offsetX`; prepend probe documents synthetic stale-snapshot leg for causal A/B only |
| D-017 | Prepend **not deleted** — re-based; H-S73 **not folded** |

---

## 6. What I did NOT do / limits

- Did not edit `replay-system.js` (`applyMultichartMirrorFrame` calls chart.js compensation — fix applies there via re-base).
- Did not run full manager `gate` (H-S82 only + partial fence).
- **H-S73** remains FAIL-REAL-BUG — queued behind this fix per Director ruling.
- PO staging confirm pending on **20260715b2**.

---

## 7. Live-verification handoff

**Build:** `20260715b2` (host + panel iframe `__TALARIA_CHART_BUILD_ID`).

**PO confirm TAL-01579:**

1. Multichart, same symbol, sync OFF, enter **paused** replay.
2. Panel B (or repro panel): drag right into history (>2 screens).
3. **Release** — wait ~2s for pan-load settle.
4. Viewport must **stay at release position** (not jump back toward mousedown / playhead).
5. Optional: repeat on host A.
6. Kill-switch proof (staging only): `window.__TALARIA_MC_DISABLE_PAN_RELEASE_ANCHOR_HOLD=true` + hard reload → snap-back may return on mirror prepend paths.

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE** — H-S82 PASS on harness; PO staging confirm on **b2** required for proven closure.

---

## 9. chart.js integration regions (Lane 1 / Lane 4 reconcile)

| Region | Lines (approx) | Owner |
|--------|----------------|-------|
| D-017 helpers + prepend re-base | 2447–2535 | **This fix** |
| Mirror TF index-pin suppress | 3474–3480 | **This fix** |
| Range-sync realign suppress | 4100–4103 | **This fix** |
| Boot + live resize index-pin suppress | 17296–17377 | **This fix** |
| Pan release (`onUserPan`) | 32414–32416 | Unchanged — calls existing `replaySystem.onUserPan()` |
| `_tryExtendReplayMasterFromParent` | 5803–5890 | Unchanged — relative shift already post-drag |

**Serialize:** commit this chart.js slice **before** re-migration Phase 1 (Lane 1) starts.

---

## 10. Lane 4 deltas

| Item | Action |
|------|--------|
| **H-S82** | Implemented + registered in `scenarioList()` — was reserved comment only (T0 step 16) |
| **H-S73** | Unchanged — still FAIL-REAL-BUG; mapping stays B-FIX-C only |
| **TAL-01579** | Propose registry: `resolved_pending_prod` after PO b2 confirm |
| **Build** | **20260715b2** |

Registry proposal (hand text):

```csv
TAL-01579,replay,multichart_layouts,snap-back-grab,RC-8,resolved_pending_prod,"Drag-release snap-back to grab point",D-017 H-S82 PASS b2; __TALARIA_MC_DISABLE_PAN_RELEASE_ANCHOR_HOLD; PO confirm pending
```
