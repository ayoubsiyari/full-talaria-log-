# M8 — Load-Toll Budget Gate

**Date:** 2026-07-31  
**Manager:** D  
**Gate:** `scripts/m8-load-toll-budget-gate.mjs`  
**Report:** `docs/plan3/M8-LOAD-TOLL-BUDGET-20260731.json`

## Verdict

`RED`

M8 acceptance requires a load-toll sample that starts at navigation start. B's b120 host artifact remains valid lower-bound evidence, but it starts at app-ready after image decoding began, so it cannot be used as the acceptance number.

## Budget

- Budget: 50 MB decoded pixel floor
- Required sample window: navigation start
- B stamp at measurement: 6,242 bars, 182 trades, 395 screenshots
- Known b120 lower bound: 141.57 MB at app-ready
- Known journal supply line: 182 trades, 395 screenshots

## Controls

- `GREEN-M8-LOAD-TOLL-UNDER-BUDGET` proves a navigation-start sample under budget can pass.
- `RED-M8-LOAD-TOLL-OVER-BUDGET` proves an over-budget navigation-start sample fails.
- `M8-LOAD-TOLL-B120-B-HOST-LOWER-BOUND` is RED because the B artifact begins at app-ready, not navigation start.

## Next Acceptance Step

Run `npm run preflight:m8-load-toll-budget -- --live` against a deployed build containing the M8 bounded state hydrate. M8 can only go GREEN when that live navigation-start sample is within budget.
