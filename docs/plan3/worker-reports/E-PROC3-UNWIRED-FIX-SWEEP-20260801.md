# E PROC-3 Unwired Fix Sweep

**2026-08-01** · Manager E · packet `E-PROC3-UNWIRED-FIX-SWEEP-V1`

## Verdict

`SOAK-READY` for E / PROC-3. Command:

- `npm run preflight:proc3-unwired-fix-sweep`

The process exits `1` because calibration rows are intentionally RED. Every live
seal row is `GREEN`.

PROC-3 is SHA-aware and reads landed owner rows from the shared object store with
`git show <sha>:<path>`. The final integrated-tip re-sweep uses six axes:

- `present`
- `bound`
- `mirrored`
- `discriminating`
- `mutationArtifact` (no known mutation artifact in product files)
- `fileIntegrity` (parse checks, line-count sanity, and neutered-guard scans on
  committed product mirrors)

## File Integrity Axis

Added before the B integrated-tip run after the 14:55 truncation/mutation event.
The axis reads `PROC3_FILE_INTEGRITY_REF`, then `PROC3_INTEGRATED_REF`, then
`HEAD`; this keeps the final gate pointed at B's integrated tip rather than E's
branch when the release train is ready.

Committed product mirrors checked by the axis:

| Pair | Minimum line count per mirror |
| --- | --- |
| `chart.js` | 40,000 |
| `order-manager.js` | 48,000 |
| `chart-indicators-full.js` | 20,000 |
| `replay-system.js` | 9,000 |

The axis fails on missing files, parse failures, primary/mirror line-count
mismatches, line counts below the sanity floor, `if (false && ...)`, and obvious
`return true` short-circuit guard neuters. Focused check on committed E `HEAD`
reported `integrityFailureCount: 0`; only the intentional calibration rows
remained RED.

## Final Seal Table

`Y/N` means `present / bound / mirrored / discriminating / no mutation artifact`.
The table below is the prior five-axis seal table; the B integrated-tip re-sweep
will add `fileIntegrity` as the sixth axis.

| Row | Owner | Ref | Status | P | B | M | D | Mut | Return |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `LAG-1a` | D | `0cdb49acd` | `GREEN` | Y | Y | Y | Y | Y | - |
| `LAG-1b` | A | `13cc48890` | `GREEN` | Y | Y | Y | Y | Y | - |
| `LAG-2` | A | `7e7d244e3` | `GREEN` | Y | Y | Y | Y | Y | - |
| `LAG-3` | E | `HEAD` | `GREEN` | Y | Y | Y | Y | Y | - |
| `LAG-4` | A | `f8f333619` | `GREEN` | Y | Y | Y | Y | Y | - |
| `MEM-1a` | A | `50b5a3867` | `GREEN` | Y | Y | Y | Y | Y | - |
| `MEM-1b` | A | `0c458b1a1` | `GREEN` | Y | Y | Y | Y | Y | - |
| `MEM-1c` | A | `ca5b82b7b` | `GREEN` | Y | Y | Y | Y | Y | - |
| `MEM-1d` | A | `db8d57ae0` | `GREEN` | Y | Y | Y | Y | Y | - |
| `LIFE-1` | A | `b08b2e3ed` | `GREEN` | Y | Y | Y | Y | Y | - |
| `LIFE-2` | E | `HEAD` | `GREEN` | Y | Y | Y | Y | Y | - |
| `LIFE-3` | B | `9a8979586` | `GREEN` | Y | Y | Y | Y | Y | - |
| `LIFE-4-M8` | D | `dd0dc4445` | `GREEN` | Y | Y | Y | Y | Y | - |
| `HYG-1` | B | `9a8979586` | `GREEN` | Y | Y | Y | Y | Y | - |
| `HYG-2` | A | `f33874a12` | `GREEN` | Y | Y | Y | Y | Y | - |
| `PROC-2` | E | `HEAD` | `GREEN` | Y | Y | n/a | Y | Y | - |
| `PROC-3` | E | `HEAD` | `GREEN` | Y | Y | n/a | Y | Y | - |
| `ATTRIB-A-live` | A | `50b5a3867` | `GREEN` | Y | Y | Y | Y | Y | - |
| `KNOWN-A-resolver` | A | `4ff581301` | `RED` | Y | N | Y | Y | Y | calibration |
| `KNOWN-MEM-1a-mutant-artifact` | A | `41c34d1ea` | `RED` | Y | Y | Y | Y | N | calibration |
| `KNOWN-overlay-kill-switch-four-call-sites` | A | `a88f0551b` | `RED` | Y | Y | Y | N | Y | calibration |
| `KNOWN-E-first-attribution-oracle` | E | `HEAD` | `RED` | Y | Y | n/a | N | Y | calibration |

## Required Checks

- `LAG-1b`: `GREEN` at `13cc48890`. The discriminating axis is now satisfied by
  C13 in-memory neutering cells that keep the suite present while making the fix
  inert.
- `MEM-1d`: `GREEN` at `db8d57ae0`. The bound axis keys on
  `series-dedupe.test.mjs` R1, which re-runs the live product scan and includes
  positive controls for `fullData` reads.
- `ATTRIB-A-live`: `GREEN` at repaired tip `50b5a3867`.
- Mutation artifacts: `MEM-1a` is `GREEN` at `50b5a3867`, while the known bad
  `41c34d1ea` product commit is `RED` on `mutationArtifact` for the inverted
  kill-switch and removed slack threshold.

## Returns

No live row returns remain from PROC-3.

Calibration RED rows remain intentionally:

- `KNOWN-A-resolver`: historical present-but-unbound resolver.
- `KNOWN-MEM-1a-mutant-artifact`: historical product mutation artifact.
- `KNOWN-overlay-kill-switch-four-call-sites`: historical non-discriminating
  call-site coverage.
- `KNOWN-E-first-attribution-oracle`: historical model-only oracle coverage.

E declares `SOAK-READY`, pending C's release order.
