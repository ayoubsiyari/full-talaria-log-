# REGRESSION — FIX 1 freezes never-focused panels on b88 (2026-07-29 14:40)

**Severity: canary blocker. Worse than the defect FIX 1 was built to cure.**

## PO report

Build confirmed from console: `chart.js?v=20260729b88`. Four-panel multichart, **no panel clicked**,
press play. **Only the host panel advances. The other three do not move at all.**

## This is BLOCK-1, incompletely remediated

A's own rejection of FIX 1 this morning named the mechanism exactly:

> `focusedPanelId` initialises to host `'A'` and is only written by a pointerdown. Every non-host
> tile is therefore backgrounded from birth.

The remediation fixed the *first paint* — panels are no longer blank, which was the symptom A
tested for. It did not fix the *ongoing cadence*: never-focused panels are still classified as
background for their entire life and their render cadence stays suppressed, so replay does not
visibly advance them.

**The remediation was graded against the wrong symptom.** A's blocking cell asserted that a cold
panel's first render paints. It does. Nobody asserted that a never-focused panel *keeps* painting
during replay. The fix passed its test and shipped the bug.

This is the second time today a FIX 1 test has certified the defect: the first suite asserted
`paints === 0` on a cold panel, codifying the blank grid. Same class of error twice on the same fix.

## Standing rule promoted — `VER-07`

**A cadence or suppression fix must be verified over time, not at a single instant.** An acceptance
cell that samples one frame cannot distinguish "painted once then froze" from "painting
continuously." Any fix that gates *how often* something happens must assert a count over a window,
under the condition the user actually experiences — for panels, that means never focused, during
live replay, for at least several seconds.

## Immediate action

PO instructed to flip the runtime switch, which requires no reload by FLAG-02:

```js
window.__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1 = true
```

This both confirms causation and restores a working chart. If panels still do not advance with the
switch on, the cause is not FIX 1 and the investigation reopens wider.

## Orders

- **B:** default `__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1` to **ON (feature disabled)** in
  the next build and ship it. Do not wait for A's fix. A frozen panel reaching a canary user is
  worse than the lag FIX 1 was built to remove. The rest of b86–b88 (LEAK-A/B/D, D's ticket fixes,
  the WS cleanup) stays in.
- **A:** FIX 1 does not ship again until `focusedPanelId` stops meaning "backgrounded from birth."
  The correct predicate is almost certainly *visibility*, not *focus* — a panel the user can see
  must paint whether or not it has ever been clicked. Rebuild the acceptance under `VER-07`: four
  panels, none ever clicked, live replay, assert paint counts continue to rise on all four over a
  multi-second window.
- **C:** this defect is a free calibration fixture for `GATE-01`. A gate that cannot catch "three of
  four panels stopped advancing during replay" is not measuring what users experience.

## Credit

Caught by PO manual testing within minutes of the build going live, on the first check of the
visual pass, which was ordered specifically because FIX 1 had already been rejected once for a
related regression. The check was placed first on the list for exactly this reason.
