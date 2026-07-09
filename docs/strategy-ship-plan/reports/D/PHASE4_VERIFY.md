# PHASE 4 — Bank page — STATIC verification (Worker D bundle)

Recorded by Manager from the fresh verification worker's read-only trace. Browser/runtime
click-crawl DEFERRED to the final Docker pass.

Checks: homepage `tsc --noEmit` exit 0; ReadLints clean on checked v16 files.

| Item | Expected | Trace result | Verdict |
|---|---|---|---|
| D1 | `COMMUNITY_ENABLED=false` hides community/saved UI branches; community API/routes present but dormant; no dead "Use Strategy" controls | Confirmed | PASS |
| D3 | `SORT_OPTIONS` = Name + Net P&L only; bank uses `stratSortOpen` (not `sessSortOpen`); My Strategies badge = `stratBankRows.length` | Confirmed | PASS |
| D4 | No `stratStyleFilter` / `normalizeStrategyBankName` alias; template action "Hide", real strategy "Delete" + confirm; `STYLES` retained | Confirmed | PASS |
| merge contract | `mergeV16StrategyBankRows` semantics unchanged by D work | Confirmed | PASS |

Result: all items PASS static. No defects. Runtime → final Docker pass.
