# T8 step 4 (Lane 2) — mixed-TF replay-master diagnostic (READ-ONLY)

## Why
PO staging feedback on `20260715a1` (TAL-01590 freeze fix): with **same-symbol panels on different TFs** during replay —
- **coarse panel (e.g. 4h): the whole chart re-renders and the viewport jumps *back*** each advance;
- **fine panel (e.g. 1min): keeps jumping.**
PO proposal: **drive the replay clock off the finest-TF panel** (not the selected panel), so all panels advance on fine ticks.

This is the reopen D-014 ruling 3 anticipated for TAL-01563 (group-advance cadence — "documented-intentional, reopen if PO flags after the freeze fix"). Now flagged → reopened. It also overlaps TAL-01575 (replay-start viewport shift) and TAL-01573 (full re-render — the RC-2 cross-cut). This is a **T8 policy-cell question**, coarse/finer × playing.

## KEY REPRO CLUE (PO, 2026-07-15) — prioritize this
The stuck behavior is **intermittent and TF-dependent**: with mixed-TF panels during play, **sometimes one panel stops advancing while the others continue**, sometimes it plays normally, and when it sticks **it stays stuck until the TF is changed again — then it resumes.** This "TF change unsticks it" strongly implicates the panel parking at its loaded edge / the catch-up breaker tripping (`panel-cmd-bridge.js:1135–1143`), with a TF switch forcing a fresh master re-acquire that clears the breaker. This is likely the **same freeze mechanism as TAL-01590** surfacing in the mixed-TF same-symbol path — so the step-3 fix (`__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE`, gated to `!isSameSymbolAsHost`) probably does **not** cover it. Trace whether the coarse/finer same-symbol PLAY path hits the same breaker/park, and whether the step-3 own-master advance should extend to the coarse/finer cells (not just independent-symbol).

## Task — DIAGNOSTIC ONLY (no fix, no product edits)
1. **Identify the current replay-master / cadence owner** across mixed-TF panels during PLAY: what timestamp/interval drives the fan-out (`replay-system.js` host tick → `multichart-manager.js` broadcast → `panel-cmd-bridge.js` per-panel apply). Is the master the host/selected panel's TF, and how do coarse and finer panels derive their advance from it? Cite file:line and map to the policy-table cells (`T8-MIRROR-POLICY-TABLE.md` §2 coarse/finer × playing).
2. **Coarse-panel full re-render + viewport-move-back:** trace why the 4h panel re-renders the complete chart and the viewport resets/moves back per advance. Is it BL-13 sub-candle follow, a rescale/`calculateScales` full invalidation (RC-2 flavor), a recenter guard (BL-6), or the mirror-frame reapplying a stale viewport? Separate the **RC-2 re-render** part from the **mirror-policy cadence** part.
3. **Fine-panel jumping:** trace the 1min panel's per-advance jump — cadence mismatch vs the master, or a follow/seek re-engage.
4. **Assess the PO's finest-TF-master proposal against current guards:** what breaks if the replay master becomes the finest-TF panel? Which existing guards/cells assume the selected/host panel is master? Which of the reopened symptoms would it fix vs not? Is it a bounded policy-cell change or a broad re-architecture? Flag conflicts.
5. **Deliverable:** mechanism report + a recommendation on whether the fix is (a) a T8 policy-cell change (finest-TF master), (b) an RC-2 invalidation fix (the re-render), or (c) both — with the escalation-candidate cells named for the Director (this changes shipped behavior → escalation, not silent correction, per D-013/D-014).

## Guardrails
- READ-ONLY: no product/harness edits. Do NOT touch `react-parity-lib.mjs`.
- Freeze-exempt (data/replay path).
- Do not propose adding guard #21 — a mixed-TF cadence defect belongs in the policy table (Lane-2 standing rule), not a new mirror-frame guard.

## Report — WORKER-REPORT-STANDARD.md
Mechanism trace (both symptoms), the replay-master ownership map, the finest-TF-master feasibility assessment, cell mapping, and the escalation-candidate list for the Director.
