# ESC015/D017 follow-up (Lane 2) — Part A: commit + reconcile · Part B: Phase 2 design prep (READ-ONLY)

Snap-back (D-017) is accepted (H-S82 PASS, honest A/B). Two things before Phase 1 can start, then freeze-safe prep.

## Part A — commit the snap-back slice + reconcile the working tree (file-scoped)
**This gates Lane 1 Phase 1** (Phase 1 edits `chart.js` 2349–2357; your snap-back is 2456–2526 / 17296–17357 — must land first so chart.js is clean).

1. Commit the **snap-back `chart.js` slice** (both trees) **file-scoped only** — `git add` the exact paths, NEVER `git add -A`. Include the build-id bump for **20260715b2** and the snap-back report. Report the commit hash + path list.
2. **Reconcile the +110 uncommitted lines in `replay-system.js`** (both trees) that M4's diagnostic flagged in the working tree:
   - If they're your finest-TF cadence / b1 / snap-back-adjacent work → commit them file-scoped (separate commit, report hash).
   - If they're orphaned / unknown origin → **do not commit**; document exactly what they are (diff summary + suspected source) in your report so we don't lose or wrongly ship them.
3. Re-confirm I8 SHA256 mirror match on every committed file. Do **not** stage anything from Lanes 1/3/4 (`known-failing.json`, `scenarios.mjs`, order-entry, indicator modules, `PER-BUG-REGISTRY.csv`).

## Part B — Phase 2 (Group B: React ownership + selection routing) DESIGN PREP — READ-ONLY
Per `T3-REMIGRATION-PLAN.md` Phase 2. **Design only — no product/React edits.** Phase 2 implements after Phase 1 lands GREEN.

1. Map the **parent React ⇄ iframe** selection-ownership + routing paths (H-R01 chrome leg, H-R04, and the rows Phase 0 assigns to P2). Which `MultichartGrid.jsx` / `TalariaV8bLive.jsx` handlers and which postMessage bridge messages must carry selection state (I14 — no parent globals/shared closures).
2. Design the **Phase 2 master slice switch** (own knob, D-018 #2) covering every file incl. React (I13).
3. Name the honest RED→GREEN targets + how the harness actuates/measures them (coordinate scenario needs with Lane 4).
4. Line-region map for the React files + any `panel-cmd-bridge.js` touch — and confirm it stays clear of the Phase-4 keyboard window (D-018 #3) and your replay regions.

## Report — WORKER-REPORT-STANDARD.md
Deliverable: `docs/tickets-overhaul/worker-reports/T3-remig-phase2-lane2-PREP-report.md` — Part A commit hashes + the replay-system.js reconcile verdict; Part B the ownership/routing map, master-slice-switch design, honest RED→GREEN spec, and file line-regions. State "ready to implement Phase 2 on Phase-1-GREEN go."
