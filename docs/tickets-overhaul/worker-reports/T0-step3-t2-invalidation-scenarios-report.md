# T0 Step 3 / T2 Invalidation Scenarios Report

## Scope

Built two RC-2 tracked-RED harness scenarios for the "stuck until click / missing invalidation" family. I used the next free IDs, `H-S38` and `H-S39`, because `H-S36` and `H-S37` already existed in the local working tree from another lane and were preserved.

## Deliverables

- Added `H-S38`: commits a trendline style color change and asserts the chart repaint counter advances by the next animation frame without any follow-up click.
- Added `H-S39`: commits a horizontal line style width change and asserts the chart repaint counter advances by the next animation frame without any follow-up click.
- Registered `H-S38` and `H-S39` in `known-failing.json` as T0 step 3 tracked-RED scenarios.
- Mirrored the harness files under both byte-identical trees:
  - `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs`
  - `homepage/public/chart/multichart-prod/harness/scenarios.mjs`
  - `chart v 1.4/chart/multichart-prod/harness/known-failing.json`
  - `homepage/public/chart/multichart-prod/harness/known-failing.json`

## RED Evidence

Command:

```powershell
npm run test -- --only=H-S38,H-S39 --runs=3
```

Result:

- `FINAL H-S38 FAIL-REAL-BUG`
- `FINAL H-S39 FAIL-REAL-BUG`
- Each failed `3/3` runs with `renders before=11 after=11` at the next-frame checkpoint.

The captured output was saved at `chart v 1.4/chart/multichart-prod/harness/red-evidence-hs38-hs39-x3.txt`.

## Gate / Verification

Commands run:

```powershell
node --check scenarios.mjs
node --check interactive-helpers.mjs
node --check gate.mjs
npm run gate
```

Gate result:

- `GATE H-S38 FAIL (known-failing)`
- `GATE H-S39 FAIL (known-failing)`
- `Regressions (not in baseline but failed): (none)`
- `[gate] PASS: no new regressions; 4 known-failing tracked.`

Lint check: no linter errors found for the edited harness files.

## Byte-Identical Evidence

SHA256 hashes:

- `scenarios.mjs`: `CD3FBC3CB88E0091526F59A28EE9E97EF7C01319D917A5545E7E289A2B60D5D8` in both harness trees.
- `known-failing.json`: `05526B816B30CB9BEFB65735F4B55CC769A7D87E628EE2E0F83D59AACBF50758` in both harness trees.

No chart engine files were edited for this task.
