# T7-prep (Lane 3) — order-entry + replay closure sweep (P5 prep)

**Cold-start:** read `INVARIANTS.md` (esp. P3/P5), `WORKER-REPORT-STANDARD.md`, `PER-BUG-REGISTRY.csv`, and the T4/A3 reports. Read-only/registry task — no product edits.

**Type:** closure/triage — feeds T7 (backlog sweep) and keeps Lane 3 productive now that T4 + A3 are essentially complete.

## Goal
Produce the disposition list for the order-entry (TAL-00752 family) and replay (A3: TAL-01581/01582, plus replay-interaction) tickets: for each registry row, mark **closed-by-landed-fix (name the switch/step)** / **needs-live-confirm (build id)** / **still-open (cite RC + why)**.

## Scope
1. **TAL-00752 sub-bugs** — map each of the 20 to the T4 step that discharged it (aggregate math, display/parse, order-type reclassify per D-005). Flag any not covered.
2. **A3 replay** — TAL-01581 (cadence) / TAL-01582 (mode) → covered by A3 step 3 (pending live confirm on the combined build); TAL-01581's sibling from the intake if any.
3. **Replay-interaction rows** (T4 step 3 family) — entry fills on wrong candle, TP flicker per candle: confirm dispositioned or still-open.
4. Anything found still-open gets an RC guess + one-line mechanism note (P3) — do NOT fix here.

## DELIVER
`worker-reports/T7-prep-orderentry-replay-closure-report.md` — a table (ticket → disposition → evidence/switch/step → build for live-confirm), and a short "still-open" list for the Manager to schedule. No code changes; state build id referenced.
