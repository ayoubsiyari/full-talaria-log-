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

## Follow-up inspection (13:55)

Two read-only inspections sharpen the next attempt but do not change acceptance:

- **Stack 2 — indicator worker result path:** dominant allocation is outbound structured-clone of full lookback-length worker results at `w.onmessage`. Lowest-risk ≥80% route is trimming or transfer-packing result series to the fresh `[fromIndex..)` tip before `postMessage`, while keeping inbound `packBarsRangeCompact` transfer intact. Validate with M19-I/B62 tail tests plus sealed QW-3 pool.
- **Stack 3 — MONSTER-2 `_resampleDataFull`:** dominant allocation is per-raw-bar `{t,o,h,l,c,v}` clones/sort in `_prepareBarsForResampling`, followed by bucket objects. ≥80% is primarily a call-elimination problem: prevent full resample re-entry via display identity / safe incremental retention. In-function prepare-skip alone is insufficient on 1m.

## Acceptance bar (unchanged)
D-owned stacks must show **≥80%** reduction on a sealed after-sample vs this baseline.
Directional improvement is insufficient. This hold does not soften that bar.
A's stack 1 at **79.7%** is not rounded up — fix-and-reland or a signed PO deferral naming the number.

## Consequence
Acceptance stays blocked until A (or the sealed sampler) lands after-packets and the pool clears ≥80% on stacks 2 and 3.