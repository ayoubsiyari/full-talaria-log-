# T0 Step 4 / T5 Anchoring Scenarios Report

## Scope

Built three RC-3 anchoring tracked-RED scenarios using the next free IDs after the current harness max (`H-S39`): `H-S40`, `H-S41`, and `H-S42`.

The deterministic RED subset is the timeframe-basis path (`1m -> 5m`) across the known index-anchored volume tool family. I also probed the requested prepend/replay paths. Replay drag can prepend older history, but anchored VWAP currently compensates its stored index to preserve the timestamp in that path. Simple replay advance does not shift the loaded-window left basis, so it did not produce a deterministic anchoring RED. Per the stop condition, I did not force a flaky scenario for those two paths.

## New Scenarios

- `H-S40`: anchored VWAP captures its 1m anchor timestamp+price, switches the host chart to 5m, and asserts the live anchor still resolves to the original timestamp+price. It is RED because the stored index is reinterpreted on the 5m basis.
- `H-S41`: fixed range volume profile captures both endpoint timestamp+price anchors, switches the host chart to 5m, and asserts both endpoints still resolve to their original timestamps+prices. It is RED because both endpoint indices shift to 5m bucket timestamps.
- `H-S42`: anchored volume profile captures its 1m anchor timestamp+price, switches the host chart to 5m, and asserts the live anchor still resolves to the original timestamp+price. It is RED for the same index-basis reason.

Registry rows covered include:

- `TAL-00322#11`, `TAL-00322#12`, `TAL-00322#13`, `TAL-00322#17` - anchored VWAP price/time label and drag anchoring failures.
- `TAL-00323#2`, `TAL-00323#9`, `TAL-00323#10`, `TAL-00323#13`, `TAL-00323#15` - volume profile repositioning/anchoring/label placement failures.
- `TAL-00271#9`, `TAL-00271#10`, `TAL-01293#1` - related RC-3 level/volume-profile drift rows.

## RED Evidence

Command:

```powershell
npm run test -- --only=H-S40,H-S41,H-S42 --runs=3
```

Result:

- `FINAL H-S40 FAIL-REAL-BUG`
- `FINAL H-S41 FAIL-REAL-BUG`
- `FINAL H-S42 FAIL-REAL-BUG`
- Each failed `3/3` runs after the anchor picker was tightened to choose non-5m-boundary source candles.

Evidence file: `chart v 1.4/chart/multichart-prod/harness/red-evidence-hs40-hs42-x3.txt`.

## Gate / Verification

Commands run:

```powershell
node --check scenarios.mjs
node --check interactive-helpers.mjs
node --check gate.mjs
npm run gate
```

Gate result:

- `GATE H-S40 FAIL (known-failing)`
- `GATE H-S41 FAIL (known-failing)`
- `GATE H-S42 FAIL (known-failing)`
- `Regressions (not in baseline but failed): (none)`
- `Newly fixed (remove from known-failing): (none)`
- `[gate] PASS: no new regressions; 7 known-failing tracked.`

Full gate output was saved at `chart v 1.4/chart/multichart-prod/harness/gate-t0-step4-evidence.txt`.

Lint check: no linter errors found for the edited harness files.

## `known-failing.json`

Added:

- `H-S40`: `T0 step 4 tracked-red: RC-3 anchored VWAP shifts timestamp anchor across timeframe switch`
- `H-S41`: `T0 step 4 tracked-red: RC-3 fixed range volume profile shifts endpoint anchors across timeframe switch`
- `H-S42`: `T0 step 4 tracked-red: RC-3 anchored volume profile shifts timestamp anchor across timeframe switch`

## Invariant Checks

- I9 intact: existing passing scenarios remained passing; gate reported no untracked regressions.
- No engine edits were made for this task.
- Legacy `multichart/` tree untouched.
- Harness trees are byte-identical.

SHA256:

- `scenarios.mjs`: `46D6127CCFB2C0EBE9FE303738D87B8C11244F9690C7CE5F9D453F2A90E634F1` in both harness trees.
- `known-failing.json`: `A66C71365BE4F169D678EB914C4BF984E2AEF3F84BAB3BE2C329B62C94314CF9` in both harness trees.
