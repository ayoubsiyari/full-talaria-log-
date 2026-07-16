# T6 step 6 (Lane 3) — RC-6 M4 replay-recalc / UI-desync DIAGNOSTIC (READ-ONLY)

## Why read-only
M4 (indicator full-recalc + legend/UI desync during replay) touches the replay path (`replay-system.js` / chart.js replay), which **Lane 2 is actively editing** (D-017 snap-back + queued b1 replay). You **must not edit** those files now. This step is a **read-only diagnostic** so M4 is ready to implement the moment the replay lanes clear.

## Context
RC-6 landed: M1 store, M2 visibility, M3 settings-apply, M5 persist race (this batch). M4 is the remaining active mechanism (M6 parked with re-migration). Symptom class: on replay step/play, indicator values/legend go stale or full-recalc thrashes; hide/show or value labels desync from the store.

## Tasks (diagnostic only — no product/harness/known-failing edits)
1. **Trace the M4 mechanism:** where replay tick/seek triggers indicator recalc, and where the legend/value UI reads (store vs direct chart state). Identify the exact desync: does replay bypass `IndicatorLifecycleStore`? Does it full-recalc when an incremental update would do?
2. **Name the fix boundary:** which file(s) M4 will touch at implement time, and confirm the **overlap with `replay-system.js` / chart.js replay** (the reason it's gated on Lane 2).
3. **Propose the kill-switch** and the RED scenario spec (how it will be actuated / what it measures, I15) — spec only, not implemented.
4. **Map tickets** M4 discharges (e.g. TAL-00350 replay-recalc leg, indicator-disappears-during-replay class).
5. **Coordination note:** what must be true (Lane 2 replay-system committed / b1 landed) before M4 can implement without collision.

## Guardrails
- READ-ONLY. No edits to any product file, harness, or `known-failing.json`.
- Especially: do NOT touch `replay-system.js`, chart.js replay regions, multichart-parent, order-entry.

## Report — WORKER-REPORT-STANDARD.md
The M4 mechanism trace, fix boundary + replay-file overlap, kill-switch + RED spec, ticket map, and the exact unblock condition. State "M4 ready to implement when replay lanes clear."
