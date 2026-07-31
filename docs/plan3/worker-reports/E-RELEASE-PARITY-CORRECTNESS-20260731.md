# E release parity correctness assertions

**2026-07-31** · Manager E · packet `E-RELEASE-PARITY-CORRECTNESS-V1`

## Verdict

K2 and K3 were already landed before this packet:

- K2: `docs/plan3/worker-reports/E-WARMUP-WINDOWS-20260731.md` publishes reachable-range examples,
  including `SMA/EMA/WMA/DEMA/TEMA/HMA(200) -> 864`, `MACD slow=200 signal=9 -> 900`, and cap
  behavior at `maxIndicatorParam >= 1234`.
- K3: the same contract has a `Stated Exceptions` section. Seasonality is explicit: no backward bar
  window fixes it; it needs keyed day-of-year samples and may require updating every visible bar
  sharing that key.

Then E added the correctness half of D's parity scaffold as an E-owned companion oracle:

- Oracle: `docs/plan3/evidence/E-RELEASE-PARITY-CORRECTNESS-20260731/release-parity-correctness.red.mjs`
- Evidence: `docs/plan3/evidence/E-RELEASE-PARITY-CORRECTNESS-20260731/release-parity-correctness-red.json`

## Assertion Shape

The model uses the same CONF-01 shape as D's scaffold: four panels, four distinct symbols, four distinct
timeframes, with same-symbol panels carrying no acceptance weight.

It asserts owner identity across:

- indicator state (`smaTip`, `openingRange`) with owner panel and symbol checks;
- drawings with owner panel and symbol checks;
- overlay surfaces (`legendRows`, `axisTags`, `sessionLabels`) with owner panel and symbol checks.

## RED Controls

The normal scoped fixture is GREEN. The deliberate contamination fixtures all go RED with the expected
surface-specific reason:

| Control | Deliberate break | Expected RED reason | Result |
|---|---|---|---|
| `RP-INDICATOR-GLOBAL-SLOT` | Shared indicator slot assigned to every panel | `indicator-cross-contamination` | GREEN control |
| `RP-DRAWING-GLOBAL-LAYER` | One global drawing layer assigned to every panel | `drawing-cross-contamination` | GREEN control |
| `RP-OVERLAY-GLOBAL-LAYER` | One global overlay layer assigned to every panel | `overlay-cross-contamination` | GREEN control |

This is still a model oracle. It earns assertion-shape credit now and is ready to transplant into D's
real single-realm release parity gate when that build exists; it does not claim final release credit by
itself.
