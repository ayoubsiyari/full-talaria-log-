# QW-3 Stack 2 Indicator Worker Transfer — 2026-08-02

## Verdict
IMPLEMENTED, RE-SAMPLE PENDING.

Stack 2 baseline from A's sealed packets is `Indicator worker result path`: 3.16 MB pooled, 15.3% of 20.65 MB sampled at 10.025 bars/s and 0.95/0.95 replay duty cycle.

## Change
`CALCULATE_TAIL` worker replies now pack numeric indicator result arrays into `Float64Array` buffers and transfer those buffers back to the main thread. `IndicatorPerf.mergeIndicatorTailWindow` consumes the packed series directly when patching existing indicator arrays, preserving the tail merge contract while avoiding structured-clone allocation for numeric result arrays.

This leaves indicator scheduling and formulas unchanged. It targets the allocation surface seen as `w.onmessage`, `mergeIndicatorTailWindow`, and `finishWorkerPass`.

## Verification
- `npm run test:qw3-indicator-worker-transfer` PASS 3/3.
- `node --check "chart v 1.4/chart/workers/indicator-worker.js"` PASS.
- `node --check "homepage/public/chart/workers/indicator-worker.js"` PASS.
- `node --check "chart v 1.4/chart/modules/indicator-performance.js"` PASS.
- `node --check "homepage/public/chart/modules/indicator-performance.js"` PASS.
- Worker and `IndicatorPerf` mirrors are byte-identical by oracle.

## Acceptance
Not accepted until A's sealed re-sample is pooled and D-owned stacks meet the >=80% reduction bar. Directional improvement is not enough.
