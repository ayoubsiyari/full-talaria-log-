# E PROC-3 Unwired Fix Sweep

**2026-08-01** · Manager E · packet `E-PROC3-UNWIRED-FIX-SWEEP-V1`

## Verdict

`RED`, as intended before seal. Command:

- `npm run preflight:proc3-unwired-fix-sweep`

The PROC-3 oracle is now SHA-aware. It reads landed owner rows directly from the
shared object store with `git show <sha>:<path>`, so the sweep is not limited to
E's current worktree. It verifies four axes for each row:

- `present`
- `bound`
- `mirrored`
- `discriminating`

## Non-Vacuity Controls

Known defective inputs still go RED:

- `KNOWN-A-resolver` at `4ff581301`: `RED` on `bound`; resolver is present but
  uncalled from the live product path.
- `KNOWN-overlay-kill-switch-four-call-sites` at `a88f0551b`: `RED` on
  `discriminating`; a static switch reference does not prove every live call
  site is bound.
- `KNOWN-E-first-attribution-oracle` at `HEAD`: `RED` on `discriminating`;
  the first model-only attribution oracle does not count as product binding.

Calibration limitation:

- The current `LIFE-4-M8` source row at `dd0dc4445` is `GREEN`. I did not find a
  clean reachable Git ref for the original one-mirror defective M8 blob during
  this pass, so that specific historical calibration is not proven by this run.

## Final Verdict Table

`Y/N` means `present / bound / mirrored / discriminating`.

| Row | Owner | Ref | Status | P | B | M | D | Return |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `LAG-1a` | D | `0cdb49acd` | `GREEN` | Y | Y | Y | Y | - |
| `LAG-1b` | A | `a88f0551b` | `RED` | Y | Y | Y | N | A |
| `LAG-2` | A | `7e7d244e3` | `GREEN` | Y | Y | Y | Y | - |
| `LAG-3` | E | `HEAD` | `GREEN` | Y | Y | Y | Y | - |
| `LAG-4` | A | `f8f333619` | `GREEN` | Y | Y | Y | Y | - |
| `MEM-1a` | A | `HEAD` | `RED` | N | N | Y | N | A |
| `MEM-1b` | A | `HEAD` | `RED` | N | N | Y | N | A |
| `MEM-1c` | A | `HEAD` | `RED` | N | N | Y | N | A |
| `MEM-1d` | A | `HEAD` | `RED` | N | N | Y | N | A |
| `LIFE-1` | A | `b08b2e3ed` | `GREEN` | Y | Y | Y | Y | - |
| `LIFE-2` | E | `HEAD` | `GREEN` | Y | Y | Y | Y | - |
| `LIFE-3` | B | `9a8979586` | `GREEN` | Y | Y | Y | Y | - |
| `LIFE-4-M8` | D | `dd0dc4445` | `GREEN` | Y | Y | Y | Y | - |
| `HYG-1` | B | `9a8979586` | `GREEN` | Y | Y | Y | Y | - |
| `HYG-2` | A | `f33874a12` | `GREEN` | Y | Y | Y | Y | - |
| `PROC-2` | E | `HEAD` | `GREEN` | Y | Y | n/a | Y | - |
| `PROC-3` | E | `HEAD` | `GREEN` | Y | Y | n/a | Y | - |
| `KNOWN-A-resolver` | A | `4ff581301` | `RED` | Y | N | Y | Y | A |
| `KNOWN-overlay-kill-switch-four-call-sites` | A | `a88f0551b` | `RED` | Y | Y | Y | N | A |
| `KNOWN-E-first-attribution-oracle` | E | `HEAD` | `RED` | Y | Y | n/a | N | E |

## Owner Returns

Return to A:

- `LAG-1b`: failed `discriminating`.
- `MEM-1a`, `MEM-1b`, `MEM-1c`, `MEM-1d`: failed `present`, `bound`, and
  `discriminating`.
- `KNOWN-A-resolver`: failed `bound`.
- `KNOWN-overlay-kill-switch-four-call-sites`: failed `discriminating`.

Return to E:

- `KNOWN-E-first-attribution-oracle`: failed `discriminating` by design; it
  remains a calibration row proving PROC-3 rejects model-only oracle coverage.

No current final-return rows for B or D after the SHA-aware correction:

- B's `LIFE-3` and `HYG-1` are `GREEN` at `9a8979586`.
- D's `LAG-1a` is `GREEN` at `0cdb49acd`; D's current `LIFE-4-M8` is `GREEN`
  at `dd0dc4445`.

## Superseded Raw Sweep

The first worktree-only/stale-sentinel run returned A, B, and D rows. Those
returns are preserved here because they existed in chat before the crash risk:

- A: `LAG-1b`, `LAG-2`, `LAG-4`, `MEM-1a`, `MEM-1b`, `MEM-1c`, `MEM-1d`,
  `LIFE-1`, `HYG-2`, `KNOWN-A-resolver`,
  `KNOWN-overlay-kill-switch-four-call-sites`.
- B: `LIFE-3`, `HYG-1`.
- D: `LAG-1a`, `LIFE-4-M8`.

That raw return set is superseded by the SHA-aware table above. The superseded B
and D failures were PROC-3 row-definition drift, not current owner returns.
