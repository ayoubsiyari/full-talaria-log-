# Manager Branch Absent Fix Triage

**Manager:** D  
**Date:** 2026-08-01  
**Base train:** `manager-b/kill-roster-round-one`  
**Scope:** local `manager-a/*`, `manager-b/*`, `manager-c/*`, `manager-d/*`, and `manager-e/*` refs.

## Method

Content absence was checked with:

`git log --cherry-pick --right-only --format=%H%x01%s manager-b/kill-roster-round-one...<branch>`

This excludes patch-equivalent commits already present in B's train, even when the branch name still looks
unmerged. Product divergence was checked with `git diff --name-only manager-b/kill-roster-round-one...<branch>`
against chart/homepage product paths. Gate status is a strict tracked-path heuristic: scratch, evidence, and
`notgate` paths are excluded.

Result:

- Manager refs scanned: 101 including B train; 100 compared.
- Product-diff branches found: 70.
- Branch rows with absent `fix`/`perf` content, tracked gate evidence, and memory-ranked relevance: 38.

Only rows confirmed absent and already gated are candidates for B cherry-pick into this seal. Everything else
is round two under SCOPE-02. B should cherry-pick by commit/content, not branch-tip wholesale, because several
manager branches are long-lived bundles.

## Seal-Candidate Rows

| Branch | Owner | Absent commit | Evidence content is absent from B train | Gate evidence | Seal disposition |
|---|---:|---|---|---|---|
| `manager-a/applyscaling-cap-20260731` | A | `0b6353fc6e` `fix(MA-SCALECAP): applyScaling honours the entry-level cap its sibling writer enforces` | `git log --cherry-pick --right-only` reports the commit vs B train | `chart v 1.4/chart/modules/flag03-kill-switch-product-on.test.mjs` | candidate |
| `manager-a/ckpt01-artifact-20260730` | A | `eb31ffaa76` `fix(ckpt01): the rehearsal grader could not tell an unmeasured panel count from zero` | same content-absence check | `chart v 1.4/chart/modules/leak-d-rawdata-copy.test.mjs` | candidate |
| `manager-a/cluster-c-nq-paint-starve` | A | `33290a1277` `fix(mc): CLUSTER-C-NQ-PAINT-STARVE remediation` | same content-absence check | `chart v 1.4/chart/modules/cpu-ceiling-60x-sc-paint-cadence.test.mjs` | candidate |
| `manager-a/conf01-a1-fix-20260730` | A | `512207d3a0` `A1 residency: fix null/epoch playhead anchoring the window on the epoch` | same content-absence check | `chart v 1.4/chart/modules/conf01-residency-parity-oracle.test.mjs` | candidate |
| `manager-a/countdown-empty-array` | A | `284f53e2d3` `fix(chart): COUNTDOWN-EMPTY-ARRAY` | same content-absence check | `chart v 1.4/chart/modules/countdown-null-guard.test.mjs` | candidate |
| `manager-a/countdown-null-guard` | A | `fbc7d181c7` `fix(chart): COUNTDOWN-NULL-GUARD` | same content-absence check | `chart v 1.4/chart/modules/countdown-null-guard.test.mjs` | candidate |
| `manager-a/countdown-suite-teeth` | A | `fee50610ea` `fix(chart): COUNTDOWN-EMPTY-ARRAY` | same content-absence check | `chart v 1.4/chart/modules/countdown-null-guard.test.mjs` | candidate |
| `manager-a/cover-inflight-wedge` | A | `fc7a80b958` `fix(A): COVER-INFLIGHT-WEDGE` | same content-absence check | `chart v 1.4/chart/modules/countdown-null-guard.test.mjs` | candidate |
| `manager-a/cover-loop-safety` | A | `1c7fe2d912` `fix(chart): COVER-LOOP-SAFETY remediation` | same content-absence check | `chart v 1.4/chart/modules/countdown-null-guard.test.mjs` | candidate |
| `manager-a/cpu-ceiling-60x` | A | `19445633da` `fix(chart): single-chart 60x paint cadence behind SC kill-switch` | same content-absence check | `chart v 1.4/chart/modules/cpu-ceiling-60x-sc-paint-cadence.test.mjs` | candidate |
| `manager-a/critical-path` | A | `498f0b5cb7` `docs(A): FIX 2 answered - _mcCloneRawDataBars is 75.55% of playback allocation` | same content-absence check | `chart v 1.4/chart/modules/countdown-null-guard.test.mjs` | candidate |
| `manager-a/dataset-cover-lag` | A | `a72cedd190` `fix(chart): COUNTDOWN-NULL-GUARD` | same content-absence check | `chart v 1.4/chart/modules/countdown-null-guard.test.mjs` | candidate |
| `manager-a/dataset-retention-census` | A | `a72cedd190` `fix(chart): COUNTDOWN-NULL-GUARD` | same content-absence check | `chart v 1.4/chart/modules/countdown-null-guard.test.mjs` | candidate |
| `manager-a/fix1-held` | A | `da961151ea` `feat(mc): FIX 1 background-panel render cadence - HELD, NOT MERGED` | same content-absence check | `chart v 1.4/chart/modules/fix1-mc-background-render-cadence.test.mjs` | candidate |
| `manager-a/fix1-rebased` | A | `5f2d137a89` `feat(mc): FIX 1 - paint-only background-panel render cadence` | same content-absence check | `chart v 1.4/chart/modules/fix1-mc-background-render-cadence.test.mjs` | candidate |
| `manager-a/fix1-visibility-cadence` | A | `4c2823d410` `fix(mc): FIX1 skip by visibility, not focus` | same content-absence check | `chart v 1.4/chart/modules/cpu-ceiling-60x-sc-paint-cadence.test.mjs` | candidate |
| `manager-a/lag-setinterval-tick` | A | `2e283b3ae7` `fix(replay): bound candle setInterval tick via rAF paint split` | same content-absence check | `chart v 1.4/chart/modules/cpu-ceiling-60x-sc-paint-cadence.test.mjs` | candidate |
| `manager-a/leak-bar-store-tight-cap` | A | `16cfcfc83b` `fix(chart): leak-h - co-update P3 suite for tight-cap defaults` | same content-absence check | `chart v 1.4/chart/modules/fix1-mc-background-render-cadence.test.mjs` | candidate |
| `manager-a/leak-bt-tf-prefetch` | A | `cdcb1baecd` `fix(chart): leak-g - gate BT TF prefetch schedule under multichart` | same content-absence check | `chart v 1.4/chart/modules/fix1-mc-background-render-cadence.test.mjs` | candidate |
| `manager-a/leak-clearfile-on-remove` | A | `a2a4438e29` `docs(A): FIX 1 REJECTED - blank grid on cold never-focused panels` | same content-absence check | `chart v 1.4/chart/modules/p3-bar-store-realm.test.mjs` | candidate |
| `manager-a/leak-high-limit-bulk` | A | `6e0d45ba87` `fix(chart): leak-i - default-off high-limit bulk / lazy 100k hydrate` | same content-absence check | `chart v 1.4/chart/modules/fix1-mc-background-render-cadence.test.mjs` | candidate |
| `manager-a/leak-host-caches` | A | `fef4c1024a` `fix(chart): leak-a - panel-only ownership on shared host caches` | same content-absence check | `chart v 1.4/chart/modules/leak-a-host-cache-release.test.mjs` | candidate |
| `manager-a/leak-raw-response-text` | A | `a2a4438e29` `docs(A): FIX 1 REJECTED - blank grid on cold never-focused panels` | same content-absence check | `chart v 1.4/chart/modules/leak-b-raw-response-text.test.mjs` | candidate |
| `manager-a/leak-rawdata-copy` | A | `a2a4438e29` `docs(A): FIX 1 REJECTED - blank grid on cold never-focused panels` | same content-absence check | `chart v 1.4/chart/modules/leak-d-rawdata-copy.test.mjs` | candidate |
| `manager-a/leak-smart-prefetch-others` | A | `77dcba876a` `fix(chart): leak-f - gate smart prefetch-others under MC` | same content-absence check | `chart v 1.4/chart/modules/fix1-mc-background-render-cadence.test.mjs` | candidate |
| `manager-a/leak-tile-cache-tighten` | A | `a7398e685e` `fix(chart): leak-j - suite teeth via production getTile/getMeta paths` | same content-absence check | `chart v 1.4/chart/modules/fix1-mc-background-render-cadence.test.mjs` | candidate |
| `manager-a/m17-di2-completed-bar` | A | `8cf6606c0c` `fix(A): M17-DI2 reject#1 remediation` | same content-absence check | `chart v 1.4/chart/modules/countdown-null-guard.test.mjs` | candidate |
| `manager-a/m23-rollback-trade-state` | A | `4327f8f5f2` `fix(chart): permanent cancel on replay rollback past executed trades` | same content-absence check | `chart v 1.4/chart/modules/cpu-ceiling-60x-sc-paint-cadence.test.mjs` | candidate |
| `manager-a/order-glow-filters-20260730` | A | `6afb8006a3` `fix(order-manager): reclaim per-order glow <filter> defs on teardown` | same content-absence check | `chart v 1.4/chart/modules/order-glow-filter-gc.test.mjs` | candidate |
| `manager-a/orphan-entry-marker-listeners` | A | `fe9ec13326` `fix(mc): FIX1 skip by visibility, not focus` | same content-absence check | `chart v 1.4/chart/modules/cpu-ceiling-60x-sc-paint-cadence.test.mjs` | candidate |
| `manager-a/orphan-finer-host-commit` | A | `fe9ec13326` `fix(mc): FIX1 skip by visibility, not focus` | same content-absence check | `chart v 1.4/chart/modules/cpu-ceiling-60x-sc-paint-cadence.test.mjs` | candidate |
| `manager-a/orphan-iframe-load-error` | A | `fe9ec13326` `fix(mc): FIX1 skip by visibility, not focus` | same content-absence check | `chart v 1.4/chart/modules/cpu-ceiling-60x-sc-paint-cadence.test.mjs` | candidate |
| `manager-a/realm-teardown-release` | A | `fc7a80b958` `fix(A): COVER-INFLIGHT-WEDGE` | same content-absence check | `chart v 1.4/chart/modules/countdown-null-guard.test.mjs` | candidate |
| `manager-a/residency-window-20260730` | A | `9e0a8ad591` `fix(chart): residency window ships inline` | same content-absence check | `chart v 1.4/chart/modules/countdown-null-guard.test.mjs` | candidate |
| `manager-a/splitter-borders-b90` | A | `fe9ec13326` `fix(mc): FIX1 skip by visibility, not focus` | same content-absence check | `chart v 1.4/chart/modules/cpu-ceiling-60x-sc-paint-cadence.test.mjs` | candidate |
| `manager-a/symbol-persist` | A | `abd0f9bc5c` `fix(A): key symbol-persist realm on chart identity` | same content-absence check | `chart v 1.4/chart/modules/cpu-ceiling-60x-sc-paint-cadence.test.mjs` | candidate |
| `manager-a/train-transplant-20260729` | A | `db3546e8ef` `fix(A): M17-DI2 / TAL-01918 completed-bar close guard` | same content-absence check | `chart v 1.4/chart/modules/m17-di2-completed-bar-guard.test.mjs` | candidate |
| `manager-a/v9-trade-row-window-20260731` | A | `083f25ddac` `fix(v9): virtualise the trade table so per-datum DOM is removed` | same content-absence check | `scripts/v9-virtual-mutants.mjs` | candidate |

## Round Two / Not Seal Candidate

All other product-diff manager branches from the scan were held for round two because at least one required
condition failed under the strict scan: no content-absent `fix`/`perf` commit, no tracked gate under the
allowed paths, or no memory-ranked relevance.
