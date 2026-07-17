# CORE-1 — D-029 R2 axis-margin floor landing report

**Build:** `20260718b01` · **Checkpoint:** CKPT-004 · **Switch:** `__TALARIA_DISABLE_AXIS_MARGIN_FLOOR_AFTER_VP_FIX`

## Product
- `chart.js` (both trees): `PRICE_AXIS_MIN_R/L=60`, `PRICE_AXIS_MIN_B=24`, `_enforceAxisMarginFloor()` at `_syncAdaptivePriceAxisMargin` (incl. `ch<=0`) + post-sync in `drawAxes`.

## Harness
- `H-A7b-R2` in `react-parity-scenarios.mjs`; `--axis-margin-floor-off` → `REACT_PARITY_AXIS_MARGIN_FLOOR_OFF=1`.
- Multichart 2v, independent file25/27, anchored VP on panel B, resize stress amplifier.

## Proof (2026-07-17)
| Leg | Command | Result |
|-----|---------|--------|
| ON | `node react-run.mjs --only=H-A7b-R2 --runs=10` | 10/10 PASS |
| OFF | `… --axis-margin-floor-off` | 10/10 FAIL-REAL-BUG |
| D-026 | `node react-run.mjs --only=H-R04,H-R05 --runs=10` | 10/10 PASS each |

**Tickets:** TAL-01665, TAL-01666, TAL-01667 (scale-strip leg).
