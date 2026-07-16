# T0 step 17 (Lane 4) — close 3 loose items + honest reactParity RED audit

## Context
T0 step 16 landed a green gate (81 expected / 34 known-failing, 0 regressions) and preserved the honest actuation harness (reactParity: 13 expected, 12 known-failing, only H-R12A green). Three prompt items weren't confirmed in the report + one new real bug surfaced.

## Tasks — close the loose items (confirm status for each, don't skip)
1. **H-S40 / H-S41 probe honesty (I15):** step 16 didn't report this. These REDs measure `data[round(x)].t` (60s bar-open drift) not the anchored `timestampPoints`. Fix the probe to read `timestampPoints`, then re-evaluate against Lane 1's Phase-1 `__TALARIA_RC3_VOLUME_RENDER_RESOLVE`. Report: do they green with an honest probe, or are they a real residual? A dishonest RED may be masking a real Lane-1 green.
2. **H-S58 registration:** confirm the order-entry close/hit-target scenario is in `scenarioList()`/`expectedTests` and passes. If not present, register it.
3. **H-S83 (finest-TF cadence):** you reserved the id — confirm it is registered in TICKET-REGISTRY + `expectedTests` as **expected-pending-PO** (hard-green only after PO accepts staging b1 A/B).

## New real bug to track
4. **H-S30 = FAIL-REAL-BUG** (you cleared a step-5b false-green). Add/confirm its tracked reason and route: it's replay-path → tag **T8/replay** so I can route the fix. **H-S73** likewise stays tracked as B-FIX-C prepend compensation (T8/RC-3), NOT TAL-01579.

## Honest reactParity RED audit (the re-migration gate)
5. For the **12 known-failing reactParity rows**, confirm each is an **honest RED** (real cross-frame actuation + real end-state assertion, per I15) — NOT a false RED that would hide a real green. Produce a one-line-per-row table: row → what it actuates → what it measures → honest-RED vs suspect. This table becomes the acceptance baseline for the upcoming RC-1/RC-4 multichart re-migration.

## Guardrails
- Lane 4 sole owner of `known-failing.json` / scenario ids / `react-parity-lib.mjs`.
- I8/I9 mirrored; report SHA256 of edited harness files + final gate result.

## Report — WORKER-REPORT-STANDARD.md
Status line per item 1–4, the item-5 honest-RED audit table, and final gate PASS confirmation.
