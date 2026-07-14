# T8 step 2 (Lane 2) — mirror-policy table design doc (READ-ONLY) — A5/TAL-01590 is the first mandatory input

## Authorization
D-013 ruling 1 step 2: policy-table design in parallel with step 1, **read-only** (no product edits). D-013 **folds the A5 diagnostic (TAL-01590 independent-symbol replay FREEZE) into this design as its first mandatory input** — this supersedes the standalone A5 prompt. The independent-symbol × playing cells must be specified from the TAL-01590 trace, because that is where the live P1 freeze happens.

## Cold-start context
- The over-fused replay mirror frame (data + X + Y in one broadcast) is compensated by ~20 scattered guards. T8 replaces them with one policy function. The guards **are** the spec — extract each guard's decision into a matrix cell.
- Key files (read-only): `sync-bridge.js`, `multichart-manager.js`, `replay-system.js`, `panel-cmd-bridge.js` (both trees are byte-identical; trace on `homepage/public/chart/modules/`).
- Read: `TRACKS.md` T8 §1 + §4, `ROOT-CAUSES.md` RC-8, `INVARIANTS.md`, `DIRECTOR-DECISIONS.md` D-013 (esp. rulings 1–3), the plan-1 journey report §7.
- Freeze-exempt: this is the data/replay path, not the interaction family.

## Task
Produce `docs/tickets-overhaul/T8-MIRROR-POLICY-TABLE.md`:

1. **The full matrix.** Rows = TF relation of panel to host {same, coarser, finer, **independent**} × replay state {playing, paused, off} × sync {on, off} per axis. Columns = adopt-data? / adopt-X? / adopt-Y?. Fill every cell from the CURRENT guard behavior, citing the guard (file:line) that dictates it.
2. **A5 / TAL-01590 FIRST (P1 freeze).** Before filling the rest, trace the independent-symbol replay freeze: reproduce (independent-symbol panel + host replay playing → freeze), find the guard/path that hangs or stalls the frame, and specify the `{independent × playing}` cells from that trace. Write one **RED scenario spec** (host harness) that captures the freeze — do NOT implement it here; hand the spec to step 1 / Lane 4 to add.
3. **Map the intake evidence rows to cells:** TAL-01560/01562/01563/01573/01575/01577/01578/01579 (2026-07-13) — each is an input to a cell, not a separate fix. Note which cell each lands in and whether current policy explains it.
4. **Conflicts/gaps → escalate.** Any cell where guards disagree, or where the correct policy differs from shipped behavior (TAL-01590's freeze cell almost certainly qualifies), is flagged as a **D-013 ruling-3 escalation candidate with its ticket as evidence** — never silently "corrected" in the doc. List these for the Manager.

## Guardrails
- READ-ONLY. No product or harness code edits (step 1 owns scenario files; you deliver specs).
- Do not touch `react-parity-lib.mjs` (Lane 4 exclusive).
- Zero-behavior-change is the T8 goal: the table documents CURRENT behavior; deviations are escalations, not edits.

## Report — WORKER-REPORT-STANDARD.md
Deliver the table doc, the TAL-01590 trace + root + RED scenario spec + which cells it fixes, the intake-row→cell map, and the list of escalation-candidate cells (conflicts, gaps, freeze-cell). Explicitly state which cells are still unknown/need Director approval.
