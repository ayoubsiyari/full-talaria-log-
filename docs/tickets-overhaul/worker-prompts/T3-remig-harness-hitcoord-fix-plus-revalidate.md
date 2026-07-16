# RE-MIGRATION (Lane 4) — fix harness hit-coord on panned charts + re-validate the frozen matrix + re-measure Phase 1

**Critical path.** Phase 1's engine substrate is landed and correct (predicate A/B proven, programmatic `selectDrawing` populates the store on host A + panel B), but the honest real-click proof **cannot land** because the harness clicks the wrong place on panned charts. Phase 1 cannot be declared GREEN — and Phase 2 cannot start — until this is fixed and re-measured honestly.

## The bug (Lane 1 IMPL finding)
`drawingHitLocalPoint` / `localToPagePoint` returns **off-viewport page coords when the chart is panned** (observed offsetX ≈ −13576 → hit x ≈ −61 / −382). `elementFromPoint` returns `null`, so real `page.mouse.click` never reaches `handleMouseDown → selectDrawing`. This affects **both** default and `--migration-on`, and **pre-dates Phase 1** — so any reactParity row that clicks a drawing on a panned chart was RED partly because *the click missed*, not because selection is broken (I15 violation in the baseline).

## Tasks
1. **Fix the harness click-target computation** (`react-parity-lib.mjs` / the hit-coord helper) so a real click lands on the drawing's **actual current on-screen position** on panned dist-v9 multichart surfaces. Do NOT fake a hit or call `selectDrawing` programmatically — the click must be a real `page.mouse.click` at the true rendered pixel of the drawing (I15 honest actuation preserved).
2. **Re-validate the frozen 10-row matrix** with the corrected click: re-run all 10 authoritative rows on fallback-B default. **Which are genuinely RED now vs which flip GREEN** once the click actually lands? Record per-row (honest-RED / genuinely-green-on-fallback). Flag any row whose prior RED was a click-miss artifact.
3. **Re-measure Phase 1** against the corrected harness: H-R02/H-R03 with Phase 1 ON (engine files in working tree, served live) vs `--phase1-off`. Report whether Phase 1 discharges them **10/10 honestly** with the A/B revert.
4. **Full manager re-gate** (folds the pending Task 2): confirm H-S18 poison cleared, ~40 cascade regressions gone, H-S40/41/42 pass in-session; report the clean baseline.
5. Update `known-failing.json` / the frozen-matrix doc to reflect the re-validated set. If the authoritative row set **materially changes** from the D-018-ratified 10, say so explicitly (Manager will escalate to Director).

## Guardrails
- Lane 4 owns `react-parity-lib.mjs` / `known-failing.json` / scenario ids / gate baseline. No product engine/React edits.
- Keep actuation HONEST — real mouse at the true drawing pixel; no proxy, no programmatic shortcut (I15).
- I8/I9 mirrored; report SHA256 + gate result.

## Report — WORKER-REPORT-STANDARD.md
The hit-coord fix (how the true pixel is now computed), the re-validated 10-row matrix (per-row honest-RED vs flipped-green), the Phase 1 H-R02/H-R03 10/10 verdict + A/B, the clean manager re-gate baseline, and whether the frozen matrix materially changed. State "Phase 1 cleared to GREEN / Phase 2 may start" or "Phase 1 still blocked because …".
