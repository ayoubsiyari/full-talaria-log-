# B75 indicator-performance anti-lying audit

Verdict: **RED. The prior automated “0 ms lag” GREEN is invalid as cure evidence.**

## Proven context

- Current audited HEAD: `e1bfedb85`.
- Cure provenance: `852420adcfa71eefe3a20fb388da2a6963b018ca`,
  `fix(chart): load indicator performance bridge before indicators`.
- The cure commit is not an ancestor of current HEAD. It exists only on side
  branches.
- The cure's browser test created its own local HTTP server. It served
  `indicator-performance.js` byte-real and explicitly observed only the two
  dependency requests. Its separate negative cell used `page.addScriptTag()` to
  load `chart.js` and `chart-indicators-full.js` directly. That is useful unit
  evidence, but it cannot attest that the deployed product host references the
  bridge.
- Current product navigation results:
  - `/chart/dist-v9/index.html`: bridge absent, unrequested, unexecuted.
  - `/chart/legacy-index.html`: bridge absent, unrequested, unexecuted.
  - `/chart/talaria-design/live/index.html`: bridge absent, unrequested,
    unexecuted.
  - `/chart/multichart-prod/chart-embed.html`: bridge referenced, requested,
    executed before `chart-indicators-full.js`, required APIs available.

The product host and iframe therefore ran different dependency graphs. A host
timing measurement can report zero while never exercising the cure.

## Measured contract

The permanent gate navigates the real product shell paths through Chromium and
records request order, response status, Resource Timing entries, the
`window.IndicatorPerf` execution witness, and these required APIs:

- `packBarsRangeCompact`
- `mergeIndicatorTailWindow`
- `estimateTailLookback`
- `hashIndicatorParams`

It also hashes each shell source and the module. It fails closed for an absent
file/reference, no execution witness, wrong request order, or unavailable API.
Unrelated scripts are made inert by the diagnostic server; the audited shell
markup and dependency files remain real. This is not a product fix.

## A5 proof

The gate runs the four states three times:

1. loader removed from product surface: RED;
2. explicit loader before indicators: GREEN;
3. loader response deliberately corrupted: RED;
4. assertion inverted: normal four-state truth flips to false.

It additionally proves wrong-order RED and repeats on an alternate monotonic
clock (`process.hrtime.bigint`). No fake cure kill switch is introduced. The
corrupted bridge response is equivalent fault injection for this ungated loader
contract: the real product path requests the dependency, but its execution/API
payload is malformed.

Oracle provenance is stamped against `852420adc`, mechanism row
`B75/M19-I(a)-INDICATOR-PERFORMANCE-LOADER`, with `lastProvenRedOn`,
module digest, deterministic assertion-payload declaration, and a 20-build
staleness limit.

## Artifacts

- Runner: `b75-indicator-performance-product-surface.gate.mjs`
- Evidence: `artifacts/b75-indicator-performance-product-surface.json`

Expected current exit status is non-zero because the three host surfaces are
RED. Do not turn this gate GREEN by relaxing its assertions; wire the product
loader in a separately reviewed Tier-3 product change.
