# E Loader/Cache Row Claim

**2026-08-01** · Manager E · packet `E-LOADER-CACHE-LATE-PICKS-V1`

## Claimed Rows

E claims these four rows so A and D do not collide:

| Row | Source commit | Product files | Predicted memory contribution before soak |
| --- | --- | --- | --- |
| `LEAK-G-BT-TF-PREFETCH` | `cdcb1baecd` | `chart.js` mirrors | Potentially high if multichart backtest timeframe prefetch would otherwise warm `6 fileIds x 8 TFs x 12k bars`; expected near-zero if the soak never schedules BT TF prefetch. |
| `LEAK-F-SMART-PREFETCH-OTHERS` | `77dcba876a` | `chart.js` mirrors | Potentially medium/high if smart prefetch-others would fetch peer symbols under multichart; expected near-zero if the soak path does not call smart prefetch-others. |
| `LEAK-I-HIGH-LIMIT-BULK` | `6e0d45ba87` | `chart.js` mirrors | Potentially very high when high-limit bulk/lazy 100k hydrate is active; expected near-zero in configurations that already stay on normal 2000-bar pages. |
| `LEAK-A-HOST-CACHES` | `fef4c1024a` | `chart.js` mirrors | Expected near-zero during a steady four-panel soak with no panel removal; potentially high on panel close/reload because only panels, not host charts, retain shared host cache fileIds. |

## Landing Plan

- Land only these four loader/cache rows.
- Keep each row reviewable; B reviews as they land, not as one large batch.
- After all managers finish their late picks, E reruns the full five-axis
  PROC-3 sweep, including `mutationArtifact`, on the final tip before B cuts.

## Landing Evidence

| Row | Landed commit | Focused evidence |
| --- | --- | --- |
| `LEAK-G-BT-TF-PREFETCH` | `d38fb088e` | `node "chart v 1.4/chart/modules/leak-g-bt-tf-prefetch.test.mjs"`: 8/8 pass; mirror byte-identical; mutants killed. |
| `LEAK-F-SMART-PREFETCH-OTHERS` | `19f26bcb8` | `node "chart v 1.4/chart/modules/leak-f-smart-prefetch-others.test.mjs"`: 7/7 pass; mirror byte-identical; mutants killed. |
| `LEAK-I-HIGH-LIMIT-BULK` | `54084939b` | `node "chart v 1.4/chart/modules/leak-i-high-limit-bulk.test.mjs"`: 6/6 pass; mirror byte-identical; mutants killed. |
| `LEAK-A-HOST-CACHES` | `5647e9ec6` | `node "chart v 1.4/chart/modules/leak-a-host-cache-release.test.mjs"`: 8/8 pass; mirror byte-identical; mutants killed. |

`ReadLints` on both mirrors and the four focused test files reported no linter errors after landing.
