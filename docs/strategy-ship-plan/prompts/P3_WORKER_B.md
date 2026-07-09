# PROMPT — Worker B — Phase 3 (Builder polish) — B5

You are Worker B. Do B5 in ONE turn. You are SECOND in the Phase 3 serial order (C→B→D→A) —
only start once the manager confirms C has returned the file.

## Working rules
- Exclusive edit of `Sources Handoff/TalariaV16.jsx` while you hold it. DO NOT switch branches /
  stash / revert — all prior work is uncommitted and MUST be preserved. `git diff` before DONE.
- Zone: `StrategyBuilderModal` + `GeneralInfoStepContent` (~5680–8421, re-locate by name). No new
  deps. Keep visual language (colors `c`, font `F`, existing button styles). Do NOT touch
  saveBuilder/openBuilder/parent state (ICR only). Do NOT loosen any validation.

## B5 — Feedback & small caps
- **Missing-required-fields names:** the computed `generalInfoMissingLabels` is currently unused —
  render the missing field *names* when Next is blocked (a message, not just red borders).
- **Mobile cover images:** hide/disable the Add tile at the mobile limit (4) instead of showing it
  until 6 and erroring on tap.
- **Per-tag length cap:** add a per-tag length cap (24–32 chars) with input truncation/feedback.
- **If trivial in-zone:** make `mobileSymbolPicker` width check responsive to resize.

## Verify (static this turn; runtime → P4)
- Blocked Next shows the specific missing field names.
- Mobile at 4 images → no Add tile (not an error-on-tap).
- Overlong tag → blocked/truncated with feedback.
- `ReadLints` clean; `git diff` shows hunks in-zone.

## Report
`reports/B/B5.md`: symbols + line ranges, verification table, lint result, `git diff` presence,
any ICR filed. Status DONE.
