# Lane 5 — P0 URGENT: Anchored Volume Profile freezes/crashes the chart (axis crush) — bisect + fix

**Supersedes the R3/R4a tranche-1 prompt for now.** PO live report: placing an **Anchored Volume Profile** now **freezes the entire chart** (unresponsive) and the **time/price axes crush/vanish**; recovery only by removing the tool. PO believes it regressed ("was working before"). This is P0.

## First: is it a regression or the pre-existing R2 defect? (bisect — do this before any fix)
The A7b diagnostic already documented a **pre-existing** anchored/fixed-range VP defect: R2 scale-vanish (`chart.js _syncAdaptivePriceAxisMargin` no floor on `margin.r`) + heavy `VolumeProfileTool.render` full-bin pass per frame. BUT two earlier commits touched the relevant code and may have regressed it further into a hard freeze:
- `6dc552a8` — re-migration Phase 1: **H-S18 redraw-guard in `chart.js`** (a guard mishandling VP's repaint pattern could cause a redraw stall/loop = freeze).
- `ce3b28d2` — RC-3 anchoring: **volume rendering + clamp** changes.

**Bisect honestly (I15, real anchored-VP placement on the real chart):**
1. Reproduce the freeze on current `b14`. Capture: is it a hang (infinite redraw / long synchronous render) or a crash (JS error)? Get the stack / console / a CPU profile of the freeze if possible.
2. Toggle the suspects via their kill-switches (find the exact switch names for the H-S18 redraw guard and the RC-3 anchoring/volume phase) — does OFF restore anchored VP? That isolates a regression to a named switch.
3. Test a pre-`6dc552a8` / pre-`ce3b28d2` build to confirm whether anchored VP worked before.
4. Verdict: **regression (name the commit + switch)** vs **pre-existing R2/render-perf** vs **both**.

## Then fix by class
- **If a redraw-guard / anchoring regression:** cure it causally, gated (extend or fix the responsible switch's logic so anchored VP repaints correctly). Freeze-safe if it's in a drawing/guard module.
- **If VP render is the freeze (heavy full-bin recompute per frame — cf. anchored-VWAP TAL-01659 / VWAP freeze TAL-01632):** this is a **freeze-safe engine** fix — throttle/memoize the bin recompute, only recompute on anchor/bar change not every frame. Switch-gated. Do this in `drawing-tools-advanced-volume.js` — no `chart.js`.
- **If R2 axis-margin (`chart.js`) is the crush:** that is FROZEN core — **STOP and hand back to Manager**; there is a proven dev-only clamp (`PRICE_AXIS_MIN_R=60`) in `chart-host.html` not ported to production. Manager escalates a pull-forward given P0 severity. Do NOT edit `chart.js` yourself.

## Rules
- Both I8 trees; rebuild dist; bump build id. Kill-switch per fix (I13), switch-OFF → honest RED (freeze returns). Honest actuation only.
- **Never create a bless blocker** — if the only correct fix is a frozen surface, stop and escalate.

## Deliverable
`docs/tickets-overhaul/worker-reports/A7b-P0-anchored-VP-freeze-report.md`: bisect verdict (regression vs pre-existing, with the freeze stack/profile evidence), the responsible commit/switch if a regression, the fix (or the escalation handoff if chart.js), build id, commit hashes, PO NEEDS-LIVE recovery steps.
