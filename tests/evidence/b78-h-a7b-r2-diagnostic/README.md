# H-A7b-R2 Tier-2 direct diagnostic

Date: 2026-07-27  
Prepared source: `6fe50178a946a750825bb8bfb1e71c3488625193`  
Accepted B75: `6880a603004b1c1957c3a398f3583eb20b590ca3`  
Exact B77: `6bd26ad93f3abe506f16737b787c4b1d17aa2b88`

## Pinned runtime

- Node `v24.15.0`
- Puppeteer `24.43.1`, resolved from the committed harness lockfile
- Chrome for Testing `148.0.7778.97`
- Browser executable: `%USERPROFILE%\.cache\puppeteer\chrome\win64-148.0.7778.97\chrome-win64\chrome.exe`
- Harness server: canonical worktree chart tree, `127.0.0.1:18971`
- Product surface: built `dist-v9`, `mode=backtest&mcLayout=2v`

## Reproduction matrix

The unchanged row was run from each commit with:

`node react-run.mjs --only=H-A7b-R2 --runs=3 --isolate-session`

| Source | Product build | Result |
|---|---|---|
| accepted B75 | `20260726b75` | 3/3 PASS |
| exact B77 | `20260727b77` | 3/3 PASS |
| prepared source | `20260727b78` | PASS, FAIL, PASS (`FAIL-FLAKE`) |

The prepared source was then run with the row's ordinary documented shape:

`node react-run.mjs --only=H-A7b-R2 --runs=10`

Result: 10/10 PASS.

The permanent mechanism negative control was run with:

`node react-run.mjs --only=H-A7b-R2 --runs=3 --axis-margin-floor-off`

Result: 3/3 FAIL, classified `FAIL-REAL-BUG`. `_enforceAxisMarginFloor()` returned `5` on every OFF run, proving that the named switch disabled the mechanism.

## Assertion and first divergence

No candidate-only product assertion failure reproduced. Successful runs on all three sources had the same first post-placement geometry:

`marginR=61, marginB=30, axisW=61, chPlot=829, crush=false, floorOk=true`

and the direct mechanism probe ended at `margin.r=60`.

The prepared-source isolated failures diverged before the geometry assertion:

1. Input/control divergence: after `reactPanelLoadFile(B, 27)` and the full file-id deadline, the first divergent value was `fileIds.B="25"` rather than `"27"`. Bar count remained `2011`, matching the pre-switch dataset. The row then placed the VP and observed healthy axis geometry. This is a setup/transport failure, not an axis regression.
2. Actuation divergence: anchor-point resolution returned, but `placeTool()` rejected the input with `need 1 points for anchored-volume-profile`. No drawing or first geometry frame existed in that run. This is another pre-assertion harness/input failure.

The row currently continues after the independent-pair setup assertion fails. That permits a healthy file-25 geometry frame to coexist with an overall FAIL and can be misclassified as `FAIL-REAL-BUG` when transport setup repeats.

## Candidate lineage

`6bd26ad93..6fe50178a` contains no H-A7b-R2 product mechanism change. The only scenario edit is in `7e9a12631`, scoped to H-A8-VP-2 stabilization. `341cc9fd3` repackages build identifiers/assets; `6fe50178a` is policy-only. Since B75, B77, and the prepared source share the same successful R2 values, F5/V1/V2/V5 and packaging bisect is not activated: the required candidate-only premise is false.

## A5 four-state proof

`h-a7b-r2-proof.test.mjs` deterministically proves:

1. broken mechanism (`enforceAfter=5`) fails;
2. fixed state passes;
3. corrupted input (`fileB=25`) fails at input;
4. assertion inversion flips the fixed state to fail.

It also retains a crushed-geometry negative control. The proof contains no clocks, UUIDs, frame ordering, or float equality.

## Classification and recommendation

Classification: **baseline-retained harness/setup susceptibility; no actual candidate regression demonstrated**. The reported `FAIL-REAL-BUG` must not block this train as a candidate regression without a trace that reaches the R2 core assertion on valid `A=25/B=27` input.

Responsible follow-up: **Tier 2, harness ownership**, because the shared React parity scenario must fail closed immediately when the panel-file switch or anchor input is invalid and should record the command/event acknowledgement before geometry. Do not change the R2 axis thresholds or bless a product failure. If a valid-input run first diverges at `marginR`, `marginB`, `axisW`, or `_enforceAxisMarginFloor`, re-open as a shared `chart.js` product-path Tier 2 regression and then bisect F5/V1/V2/V5.
