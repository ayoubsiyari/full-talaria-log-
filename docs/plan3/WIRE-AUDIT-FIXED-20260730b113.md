# Wire audit — all 50 `fixed` rows vs deployed `20260730b113`

**Authority:** `RULING-THREE-STRIKES-ON-THE-WIRE-AND-THE-REAL-DENOMINATOR-20260730-1540.md` (`TEST-01`)  
**Instrument:** `node scripts/wire-audit-fixed.mjs --base http://31.97.192.82:3000 --stamp 20260730b113`  
**Artifact:** `docs/plan3/WIRE-AUDIT-FIXED-20260730b113.json` (`talaria.wire-audit-fixed.v1`)  
**Marker map (input vocabulary):** `docs/plan3/FIXED-WIRE-MARKERS-20260730.json` + `FIXED-WIRE-MARKERS-SUMMARY-20260730.md` (48/50 rows have needles; TAL-01941 + Rayan #2 have none)  
**MEAS-01:** shell `window.__TALARIA_CHART_BUILD_ID='20260730b113'` over HTTP  
**D tip at run:** `94dcfacc3` (marker map tip `147fa8e5f`)

## Headline

| Class | Count |
| --- | ---: |
| **on-wire (strict)** | **43** |
| on-wire-weak (structural markers only) | 3 |
| partial (some markers present, required kill/flag absent) | 1 |
| off-wire (required product marker absent from served JS) | 2 |
| backend-static-unverifiable (Python/API, not served JS) | 1 |
| **Total fixed** | **50** |

**Strict answer to “how many of the 50 are actually on the wire?” → 43.**  
Including weak structural hits → 46. The remaining 7 are not proven on b113.

## Not proven on b113 (must ship or drop from Saturday packs)

| Ticket | Verdict | Missing on wire |
| --- | --- | --- |
| **Rayan #8** | partial | `__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1`, `__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1`, `_assertExplicitPlaceAudit` (display-ID / allocator markers from related M24 work are present; CONF-01 #8 teeth are not) |
| **TAL-01807b** | off-wire | `__TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1` |
| **TAL-01896** | off-wire | `__TALARIA_DISABLE_TRADE_DURATION_NORM_V1` / `tradeDurationNormV1Enabled` — no servable module on the canary exposes these (SPA HTML trap on guessed paths; not in `chart.js` / `order-manager.js` either) |
| **M24 / TAL-01926** | backend-static-unverifiable | `should_prune_absent_journal_trades` lives in `session_journal_store.py` — not HTTP-auditable as static JS |
| TAL-01895 / TAL-01792 | on-wire-weak | pins preference path — only weak `pins` token in `chart.js` |
| Rayan #2 | on-wire-weak | teardown is a multichart-manager contract; no dedicated product flag (static `removeChart` / `openPositions` only) |

## Method (EVID-01)

1. Parse every ledger `fixed` row.  
2. Map gate → distinctive product needles (kill-switches / function names).  
3. Fetch served modules from the live stamp (`order-manager.js`, `chart.js`, `replay-system.js`, `drawing-tools-manager.js`, `multichart-manager.js`).  
4. Reject HTML login traps as modules.  
5. Classify each row. Prose counts are not used.

Generalises D3: the M24 display-ID case (`2cc949399` absent from b103, present on b113) is one cell; this audit runs the same shape across the whole fixed column.

## Action for B (not a D wait)

Ship a stamp that includes at least:

- Rayan #8 gap reconcile + explicit-place audit (D tip after `d5b790e56` / later)  
- TAL-01807b visual rebind  
- TAL-01896 `orderManagerTradeRows.js` duration norm (and a **real** static or bundled URL the audit can fetch)

Until then, TEST-01 forbids running PO packs that declare those commits against b113.
