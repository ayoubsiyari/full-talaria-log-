# H-A7b-R2 setup fail-closed correction

Lineage: diagnostic `299afe53a` on prepared source `6fe50178a`  
Date: 2026-07-27

## Scope

Harness-only. Product files and geometry thresholds are unchanged. The row now
classifies invalid setup as `SETUP_INVALID` and returns before reading axis
geometry.

Validated setup stages, in order:

1. load command acknowledged by API result or observed target identity;
2. host A remains file 25 and panel B is file 27;
3. panel-B chart identity is file 27 and has more than 50 ordered, finite-time bars;
4. exactly one finite in-range anchor exists;
5. anchored VP placement returns an id.

Each run prints all stage observations and the first invalid stage.

## Stable evidence

Pinned runtime: Node `24.15.0`, Puppeteer `24.43.1`, Chrome for Testing
`148.0.7778.97`, built `20260727b78` dist-v9.

- Corrected row, ordinary clock/server, `--runs=3`: **3/3 PASS**.
- Setup contract unit/A5 suite: **8/8 PASS**.
- Identity corruption: **SETUP_INVALID**, first stage `panel-identity`.
- Data corruption: **SETUP_INVALID**, first stage `panel-data`.
- Anchor corruption: **SETUP_INVALID**, first stage `anchor-input`.
- Product mechanism OFF, `--axis-margin-floor-off --runs=3`:
  **3/3 FAIL**, final `FAIL-REAL-BUG`; no `SETUP_INVALID`.
- Alternate clock/server: `TZ=Pacific/Auckland`, isolated browser, port `18972`:
  **1/1 PASS**.

## A5 and oracle

The deterministic suite proves broken setup fails, fixed setup passes,
deliberately corrupted input fails, and inversion flips the fixed assertion.
Permanent data, anchor, placement, and stale-oracle negative controls are also
present.

Oracle provenance is emitted on every browser run:

- oracle: `H-A7b-R2 setup contract v1`
- mechanism: D-029 R2 axis-margin floor after anchored VP
- authored against: `20260727b78`
- last proven RED: `20260727b78`
- staleness budget: three build ordinals

Unknown or stale build identity is `UNPROVEN` and fails closed before geometry.
