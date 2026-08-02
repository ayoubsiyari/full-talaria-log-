# QW-3 Stack 3 Resample Cache Keep — 2026-08-02

## Verdict
IMPLEMENTED, RE-SAMPLE PENDING.

Stack 3 baseline from A's sealed packets is `MONSTER-2 _resampleDataFull`: 1.87 MB pooled, 9.06% of 20.65 MB sampled at 10.025 bars/s and 0.95/0.95 replay duty cycle.

## Change
Replay prefix reuse keeps `ChartDataPipeline`'s resample cache warm by default instead of invalidating it on every `_installPlayheadPrefix` call. That lets the existing same-reference append and forming-bucket branches run, avoiding full `_resampleDataFull` rebuilds on steady replay ticks.

Kill switch: `__TALARIA_DISABLE_QW3_RESAMPLE_CACHE_KEEP_V1=true` restores legacy cache invalidation.

## Verification
- `npm run test:qw3-resample-cache-keep` PASS 2/2.
- `node --check "chart v 1.4/chart/modules/replay-system.js"` PASS.
- `node --check "homepage/public/chart/modules/replay-system.js"` PASS.
- `chart v 1.4/chart/modules/replay-system.js` and `homepage/public/chart/modules/replay-system.js` are byte-identical by oracle.

## Acceptance
Not accepted until A's sealed re-sample is pooled and D-owned stacks meet the >=80% reduction bar. Directional improvement is not enough.
