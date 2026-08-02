# QW-3 Allocation Pool Harness — 2026-08-02

## Verdict
READY.

`scripts/qw3-allocation-pool.mjs` pools A's V8 sampling allocation packets and ranks named stack clusters across runs. It is harness-only and makes no product change.

## Default Inputs
- `docs/plan3/evidence/speed01-allocation-sealed-10bps-baseline.json`
- `docs/plan3/evidence/speed01-allocation-sealed-10bps-r2.json`

The harness also accepts future A packets through `--input=a.json,b.json` and future top-stack rows through `--stack="label::regex|regex"`.

## Current Sealed Pool
Running the harness over A's two sealed 10 bars/s SPEED-01 packets:

- `Indicator worker result path`: 3.16 MB pooled, 15.3%.
- `MONSTER-2 _resampleDataFull`: 1.87 MB pooled, 9.06%.
- Pooled sample total: 20.65 MB.
- Mean effective rate: 10.025 bars/s.
- Replay duty cycle: 0.95 / 0.95, so packets are comparable.

Stack 1 (`M20-Q6 scheduler registry`) is intentionally not a D default because A owns that instrumentation-bound row.

## Verification
- `npm run test:qw3-allocation-pool` PASS 2/2.
- `node scripts/qw3-allocation-pool.mjs --out="docs/plan3/evidence/qw3-allocation-pool.json"` PASS, status `READY`.
