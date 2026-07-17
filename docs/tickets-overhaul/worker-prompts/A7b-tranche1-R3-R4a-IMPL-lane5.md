# Lane 5 — A7b implementation tranche 1: R3 (pan-block) + R4a (VP axis-highlight geometry) — FREEZE-SAFE

Diagnostic accepted (`A7b-volume-profile-diagnostic-report.md`). Per the engine/multichart split (§6), only the freeze-safe engine roots are yours this tranche. R1 (cross-layout preview leak) and R2 (chart.js axis-margin floor) are NOT yours — Manager routes them (R1 → Phase-5/RC-4 parked tranche; R2 → post-unfreeze chart.js batch). Do not touch `chart.js`, `MultichartGrid.jsx`, `TalariaV8bLive.jsx`, or the sync bridge.

## Implement (two independent, kill-switched hunks)

### R3 — Volume-profile body over-captures pointer; chart pan blocked
- Switch `window.__TALARIA_DISABLE_VP_BODY_PAN_BLOCK_FIX` (unset = fix ON).
- Narrow the `.volume-profile-hitbox` capture to the bar columns + boundary/POC handles; allow chart pan on the zone **background** (`drawing-tools-advanced-volume.js:1459-1467`). Adjust `isVolumeProfileChartPanBlockedAtPoint` so a hit on empty zone background does NOT abort pan (`drawing-tools-manager.js:15101-15107`); optionally pass-through entirely when the tool is not selected.
- Fixed-range uses the full inter-anchor zone — that's the worst offender; make sure background there pans.
- Discharges: TAL-01666, TAL-01667 (partial).

### R4a — VP axis price/time highlights use the computed profile span
- Switch `window.__TALARIA_DISABLE_VP_AXIS_HIGHLIGHT_GEOMETRY_FIX` (unset = fix ON).
- Override `showAxisHighlights` for `VolumeProfileTool` / `AnchoredVolumeProfileTool`: derive the price/time zones from the computed profile indices + `_profileTopY`/`_profileBottomY` rather than `this.points[].y` (`drawing-tools-base.js:2497-2520` guard fails for 1-point anchored). Single-point anchored → time range = anchor bar → latest bar; fixed-range → use `_profileTopY/_profileBottomY` so `zoneHeight !== 0`.
- Engine-side only. The V9 `avStyle` label-bridge gap (anchored labels never reaching the engine) is a FROZEN re-migration surface — do NOT fix here; note it in your report for the Manager's re-migration tranche.
- Discharges: TAL-01662, TAL-01664 (partial — engine geometry only).

### R4b (optional, if quick)
- Switch `window.__TALARIA_DISABLE_VP_AXIS_LABEL_DEFAULT_ON_FIX`. Add the VP types to `AXIS_LABEL_DEFAULT_LINE_TYPES` (`drawing-tools-base.js:680-696`) or default them on in the tool constructors. UX nicety for TAL-01662.

## Rules
- Both I8 trees byte-identical; rebuild dist; bump build id.
- Each switch OFF → honest RED reproducing the symptom (pan blocked on background / no axis labels). Name the discriminator per row (D-023).
- Honest actuation (I15): reproduce with the real VP tool on the real chart where possible; anything only dev-verified → mark NEEDS-LIVE for PO.
- File-scoped commits. **Never create a bless blocker** — if any hunk turns out to need a frozen surface to be correct, STOP that hunk and hand back.

## Deliverable
`docs/tickets-overhaul/worker-reports/A7b-tranche1-R3-R4a-IMPL-report.md`: per-hunk switch, files/lines, RED/GREEN discriminator evidence, build id, commit hashes, tickets discharged, NEEDS-LIVE list, and a note on the R4 V9-bridge gap for the re-migration tranche.
