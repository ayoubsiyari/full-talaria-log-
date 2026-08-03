# A Packet §1.5 — Attribution Instrument Checklist

Timestamp: 2026-08-03 23:18+01:00

Audience: A, for the packet. This is a delivered-state checklist for the attribution instrument before the sealed soak. It documents what exists now; it does not add new instrument work.

PO framing: the soak is this instrument's first mission and it must not fire half-blind. Rows below are either GREEN, or named RED with the one-line reason.

## §1.5 Checklist

| Row | State | Evidence |
|---|---|---|
| Arena columns wired into the sampler | GREEN | `scripts/sealed-two-arm-soak.mjs` imports `arenaColumns`, reads allocator roots with `collectMemoryDump`, carries `footprintTotalMB`, and spreads `...arenas` into the sample row. `scripts/instrument-checklist.selftest.mjs` proves flat scalar arena columns and TOTAL-01 refusal shapes. |
| Detailed-dump capture at four scheduled moments | GREEN | `scripts/sealed-two-arm-soak.mjs` calls `captureDetailedDump(...)` through `captureArmMoment('start')` and `captureArmMoment('end')`; across `zerotrade` and `trades` those are the four scheduled moments: `zerotrade:start`, `zerotrade:end`, `trades:start`, `trades:end`. The artifact directory is `<arm output dir>/detailed-dumps/`. |
| Forced-GC settle probe | GREEN | `scripts/sealed-two-arm-soak.mjs` imports `forcedGcPauseProbe` and runs it at the R3 checkpoint and end-of-arm, bounded by `SOAK_PHASE_BUDGETS_MS['probe.forcedGcPauseProbe']`. `scripts/tests/bounded-phase.test.mjs` pins the budget above the healthy ~11 minute probe span. |
| Coverage calibration | RED — `COV01_LIVE_FOUR_MOMENT_CALIBRATION_NOT_YET_GREEN` | The corrected calibration exists in `scripts/lib/detailed-dump-capture.mjs` as all-process `coverageAcrossProcesses(...)`, and `scripts/canonical-floor-retake.mjs` consumes corrected `detailedCoverage` before falling back to old single-pid arena coverage. But no four-moment soak detailed-dump set has yet produced a live >=95% COV-01 calibration; the old pass3 figure remains `NOT_QUOTABLE_COVERAGE` at 59.84% / 271.05 MB on the rejected single-pid-over-all-Chrome basis. |
| Capability proof re-detected a known change | GREEN | `_evidence/manager-E/combined-canvas-fix-settle-20260802.json` re-detected the known indicator-layer + linked-pane release change under forced GC with settle: total private 500.36 -> 449.58 MB, reclaim 50.78 MB, `verdict=MEASURED`. The no-release control exists at `_evidence/manager-C/combined-canvas-fix-control-no-release-20260802.json`. |

## Fire Interpretation

The instrument is not blind on roots, four-moment dump wiring, forced-GC settle separation, or known-change capability. The one named red is live coverage calibration: the code path is present and basis-corrected, but the soak/smoke still owes the actual four-dump COV-01 result before any floor number is quoted as >=95% covered.

If the first mission emits roots-only or missing detailed dump rows, classify that as `DETAILED_DUMP_WIRING_ROOTS_ONLY` or `DETAILED_DUMP_WIRING_ABSENT`, not as a memory result.
