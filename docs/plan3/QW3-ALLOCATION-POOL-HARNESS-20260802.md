# QW-3 Allocation Pool Harness — 2026-08-02

## Verdict
READY.

`scripts/qw3-allocation-pool.mjs` pools A's V8 sampling allocation packets and ranks named stack clusters across runs. It is harness-only and makes no product change.

## Default Inputs
- `docs/plan3/evidence/speed01-allocation-10bps.json`
- `docs/plan3/evidence/speed01-allocation-10bps-r2.json`

The harness also accepts future A packets through `--input=a.json,b.json` and future top-stack rows through `--stack="label::regex|regex"`.

## Current Pool
Running the harness over A's two existing SPEED-01 packets:

- `M20-Q6 scheduler registry`: 7.59 MB pooled, 33.51%.
- `MONSTER-2 _resampleDataFull`: 4.30 MB pooled, 18.98%.
- Pooled sample total: 22.65 MB.
- Mean effective rate: 9.823 bars/s.

## Verification
- `npm run test:qw3-allocation-pool` PASS 2/2.
- `node scripts/qw3-allocation-pool.mjs --out="docs/plan3/evidence/qw3-allocation-pool.json"` PASS, status `READY`.
