# Reset Gates — M8 Load Toll and Destroy Heap

**Date:** 2026-07-31  
**Manager:** D  
**Gate:** `scripts/reset-gates.mjs`  
**Report:** `docs/plan3/RESET-GATES-20260731.json`

## Verdict

`RED`

Reset now depends on two gates:

- `RESET-M8-LOAD-TOLL-BUDGET`: RED until a navigation-start load-toll sample from a deployed M8 build is within budget.
- `RESET-DESTROY-HEAP-README-6-3`: ALLOWED_RED today. R3/`Chart.destroy()` fails by construction, so the README 6.3 heap/listener gate gets a free honest RED before it matters.

## Evidence

- B stamp at measurement: 6,242 bars, 182 trades, 395 screenshots on b120 session 936 / file 677.
- The M8 client guard is already ported to both mirrors and mirror identity is enforced by `npm run test:m8-state-bound`.
- The M8 load-toll budget gate rejects app-ready lower-bound samples as acceptance evidence.
- The destroy heap gate remains RED using A's measured teardown figures: 147 live listeners per instance, 357 page-wide registered, 0 removed, 1 rAF loop per instance, 2 timeout handles at rest.

## Commands

```
npm run test:m8-load-toll-budget
npm run preflight:m8-load-toll-budget
npm run test:reset-gates
npm run preflight:reset-gates
```
