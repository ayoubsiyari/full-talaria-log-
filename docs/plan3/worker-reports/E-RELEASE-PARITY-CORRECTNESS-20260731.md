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
timeframes. Same-symbol panels and matched-timeframe panels carry no contamination-fixture credit.

It asserts isolation across the forbidden fields from `multichart/decisions.md`, with the
price-axis fields first because that is the original shipped bug class:

- `priceMin`
- `priceMax`
- `autoScale`
- `priceZoom`
- `priceOffset`
- `timeframe`
- `indicators`
- `drawings`
- `chartType`
- `scaleMode`

It also keeps the overlay checks E had already added, because overlay labels/tags are in E territory even
though they are not part of the ten-field decision list.

Owner identity is asserted across:

- indicator state (`smaTip`, `openingRange`) with owner panel and symbol checks;
- drawings with owner panel and symbol checks;
- overlay surfaces (`legendRows`, `axisTags`, `sessionLabels`) with owner panel and symbol checks.

## RED Controls

The normal scoped fixture is GREEN. The deliberate contamination fixtures all go RED with the expected
surface-specific reason. Every RED control runs against mismatched timeframes only; matched-timeframe
fixtures are treated as unverified rather than passed.

| Control | Deliberate break | Expected RED reason | Result |
|---|---|---|---|
| `RP-PRICE-MIN-GLOBAL` | Shared `priceMin` assigned to every panel | `price-axis-cross-contamination` | GREEN control |
| `RP-PRICE-MAX-GLOBAL` | Shared `priceMax` assigned to every panel | `price-axis-cross-contamination` | GREEN control |
| `RP-AUTO-SCALE-GLOBAL` | Shared `autoScale` assigned to every panel | `price-axis-cross-contamination` | GREEN control |
| `RP-PRICE-ZOOM-GLOBAL` | Shared `priceZoom` assigned to every panel | `price-axis-cross-contamination` | GREEN control |
| `RP-PRICE-OFFSET-GLOBAL` | Shared `priceOffset` assigned to every panel | `price-axis-cross-contamination` | GREEN control |
| `RP-TIMEFRAME-GLOBAL` | Shared `timeframe` assigned to every panel | `timeframe-cross-contamination` | GREEN control |
| `RP-CHART-TYPE-GLOBAL` | Shared `chartType` assigned to every panel | `chart-type-cross-contamination` | GREEN control |
| `RP-SCALE-MODE-GLOBAL` | Shared `scaleMode` assigned to every panel | `scale-mode-cross-contamination` | GREEN control |
| `RP-INDICATOR-GLOBAL-SLOT` | Shared indicator slot assigned to every panel | `indicator-cross-contamination` | GREEN control |
| `RP-DRAWING-GLOBAL-LAYER` | One global drawing layer assigned to every panel | `drawing-cross-contamination` | GREEN control |
| `RP-OVERLAY-GLOBAL-LAYER` | One global overlay layer assigned to every panel | `overlay-cross-contamination` | GREEN control |

Validity control:

| Control | Deliberate invalid fixture | Expected RED reason | Result |
|---|---|---|---|
| `RP-MATCHED-TF-INVALID` | Four distinct symbols but every panel at `1m` | `matched-timeframes-unverified` | GREEN control |

This is still a model oracle. It earns assertion-shape credit now and is ready to transplant into D's
real single-realm release parity gate when that build exists; it does not claim final release credit by
itself.
