# E Loader/Cache Row Claim

**2026-08-01** · Manager E · packet `E-LOADER-CACHE-LATE-PICKS-V1`

## Claimed Rows

E claims these four rows so A and D do not collide:

| Row | Source commit | Product files | Predicted memory contribution before soak |
| --- | --- | --- | --- |
| `LEAK-G-BT-TF-PREFETCH` | `cdcb1baecd` | `chart.js` mirrors | Potentially high if multichart backtest timeframe prefetch would otherwise warm `6 fileIds x 8 TFs x 12k bars`; expected near-zero if the soak never schedules BT TF prefetch. |
| `LEAK-F-SMART-PREFETCH-OTHERS` | `77dcba876a` | `chart.js` mirrors | Potentially medium/high if smart prefetch-others would fetch peer symbols under multichart; expected near-zero if the soak path does not call smart prefetch-others. |
| `LEAK-I-HIGH-LIMIT-BULK` | `6e0d45ba87` | `chart.js` mirrors | Predicted large if the soak exercises host hydrate paths that previously selected high-limit bulk/lazy 100k windows: the row clamps those hydrates to the normal 2,000-bar page. Expected near-zero only if the integrated soak never enters the high-limit path. |
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

## Default-ON Confirmation

- `LEAK-G-BT-TF-PREFETCH`: default-ON; with `window.__TALARIA_DISABLE_MC_BT_TF_PREFETCH_V1` absent/false/0, multichart BT TF prefetch scheduling is suppressed, and only a truthy switch restores prefetch.
- `LEAK-F-SMART-PREFETCH-OTHERS`: default-ON; with `window.__TALARIA_DISABLE_MC_SMART_PREFETCH_OTHERS_V1` absent/false/0, multichart smart prefetch-others is suppressed, and only a truthy switch restores it.
- `LEAK-A-HOST-CACHES`: default-ON; with `window.__TALARIA_DISABLE_MC_HOST_CACHE_RELEASE_V1` absent/false/0, panel-owned host cache refs release on pagehide/teardown, and only a truthy switch disables release.
- `LEAK-I-HIGH-LIMIT-BULK`: default-ON; with `window.__TALARIA_DISABLE_MC_HIGH_LIMIT_BULK_V1` absent/false/0, 100k-bar high-limit/lazy hydrates are clamped to 2,000, and only a truthy switch restores the high-limit path.
