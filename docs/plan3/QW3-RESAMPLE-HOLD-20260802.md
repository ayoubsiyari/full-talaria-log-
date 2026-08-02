# QW-3 sealed re-sample — HOLD (not accepted)

Date: 2026-08-02

## Status
Stacks 2 and 3 remain **implemented, not accepted**.

## Baseline (sealed)
Pool of A's sealed 10 bars/s packets via `scripts/qw3-allocation-pool.mjs`:

| Stack | MB | % |
|---|---:|---:|
| Indicator worker result path (D stack 2) | 3.16 | 15.3% |
| MONSTER-2 `_resampleDataFull` (D stack 3) | 1.87 | 9.06% |

- packets=2
- sampled total ≈ 20.65 MB
- rateMean ≈ 10.025 bars/s
- dutyCycle 0.95 / 0.95
- evidence: `docs/plan3/evidence/qw3-allocation-pool.json`

## After-sample
No sealed after-sample packets are present in `docs/plan3/evidence/` for a before/after pool.

## Acceptance bar (unchanged)
D-owned stacks must show **≥80%** reduction on a sealed after-sample vs this baseline.
Directional improvement is insufficient. This hold does not soften that bar.
A's stack 1 at **79.7%** is not rounded up — fix-and-reland or a signed PO deferral naming the number.

## Consequence
Acceptance stays blocked until A (or the sealed sampler) lands after-packets and the pool clears ≥80% on stacks 2 and 3.