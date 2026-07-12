# T4 Lane 3 — Step 2 Display Threshold + Parsing Report

**Task:** T4 step 2 — order-entry display-threshold + parsing fixes  
**Worker prompt:** `docs/tickets-overhaul/worker-prompts/T4-step2-display-parsing.md`  
**RC:** RC-5 — order-entry state model/display-parsing defects  
**Date:** 2026-07-12  
**Build id:** `20260712b2`  

---

## Scope Confirmation

This step implements the two RC-5 sub-bugs explicitly deferred by T4 step 1:

1. **Fix A:** SL/TP values below `10` did not render as valid chart levels.
   - Kill-switch: `window.__TALARIA_DISABLE_SLTP_RENDER_FIX`
2. **Fix B:** partial decimal / trailing-zero SL/TP input states could recalculate the lot to `0`.
   - Kill-switch: `window.__TALARIA_DISABLE_SLTP_PARSE_FIX`

Confirmed untouched:

- `computeOrderEntryAggregates` / T4 step 1 aggregate math: **not touched**
- Replay bus / mirror-frame path: **not touched**
- Legacy `chart v 1.4/chart/multichart/` dev-shell: **not edited**
- No new dependencies

---

## Test File

Property/unit reproduction file:

- `chart v 1.4/chart/modules/order-sltp-display-parsing.test.mjs`
- `homepage/public/chart/modules/order-sltp-display-parsing.test.mjs`

The test imports `order-manager.js` in Node without running the browser constructor, then exercises the fixed helper methods directly:

- `_shouldRenderSltpPrice(price)`
- `_shouldDeferSltpInputRecalc(inputId, rawValue)`
- `_parseSltpInputPrice(rawValue, fallback)`

---

## Fix A — SL/TP Below 10 Render

### Mechanism + File:Line

`order-manager.js` now has a gated validity helper:

- `chart v 1.4/chart/modules/order-manager.js:12487` — `_isSltpRenderFixEnabled()`
- `chart v 1.4/chart/modules/order-manager.js:12495` — `_shouldRenderSltpPrice(price)`

Render integration:

- `chart v 1.4/chart/modules/order-manager.js:18032` — single-TP SL line render condition
- `chart v 1.4/chart/modules/order-manager.js:18044` — single-TP TP line render condition
- `chart v 1.4/chart/modules/order-manager.js:18059` — multi-TP-mode SL line render condition

Before this fix, the render decision did not have a single explicit “valid positive SL/TP price” predicate, so sub-10 price levels could be treated like unset/non-renderable levels in the order-entry preview flow. The new helper makes the unit explicit: **price value**, not pixels/bars.

### Diff Summary

- Added `_isSltpRenderFixEnabled()`.
- Added `_shouldRenderSltpPrice(price)`.
- Updated SL/TP preview-line branches so any finite positive SL/TP price renders when the fix is enabled.
- Kill-switch restores legacy threshold behavior for reproduction (`price >= 10` in the helper).

### RED Before Fix

Command:

```bash
node "chart v 1.4/chart/modules/order-sltp-display-parsing.test.mjs"
```

Initial RED after writing the reproduction first:

```text
AssertionError [ERR_ASSERTION]: _shouldRenderSltpPrice must exist
+ actual - expected

+ 'undefined'
- 'function'
```

This was the expected RED state before adding the render predicate and wiring.

### GREEN After Fix

Command:

```bash
node "chart v 1.4/chart/modules/order-sltp-display-parsing.test.mjs"
node "homepage/public/chart/modules/order-sltp-display-parsing.test.mjs"
```

Output:

```text
GREEN — SL/TP display threshold + parsing reproductions passed
GREEN — SL/TP display threshold + parsing reproductions passed
```

### RED Again With Kill-Switch

Command:

```bash
TALARIA_TEST_DISABLE_SLTP_RENDER_FIX=1 node "chart v 1.4/chart/modules/order-sltp-display-parsing.test.mjs"
```

Output excerpt:

```text
AssertionError [ERR_ASSERTION]: SL/TP price below 10 must be treated as renderable when positive

false !== true
```

Browser kill-switch equivalent:

```js
window.__TALARIA_DISABLE_SLTP_RENDER_FIX = true;
```

---

## Fix B — SL/TP Partial Decimal / Trailing-Zero Parse

### Mechanism + File:Line

`order-manager.js` now has gated parse helpers:

- `chart v 1.4/chart/modules/order-manager.js:12491` — `_isSltpParseFixEnabled()`
- `chart v 1.4/chart/modules/order-manager.js:12504` — `_parseSltpInputPrice(rawValue, fallback)`
- `chart v 1.4/chart/modules/order-manager.js:12514` — `_shouldDeferSltpInputRecalc(inputId, rawValue)`

Input integration:

- `chart v 1.4/chart/modules/order-manager.js:15086` — computes `deferSltpRecalc`
- `chart v 1.4/chart/modules/order-manager.js:15094` — parses `tpPrice` via helper
- `chart v 1.4/chart/modules/order-manager.js:15103` — parses `slPrice` via helper
- `chart v 1.4/chart/modules/order-manager.js:15111` — skips `calculatePositionFromRisk()` while SL/TP input is an in-progress decimal scaffold
- `chart v 1.4/chart/modules/order-manager.js:15116` — returns early after place-button/panel sync while deferred

Preview integration:

- `chart v 1.4/chart/modules/order-manager.js:15618` — TP price read uses `_parseSltpInputPrice`
- `chart v 1.4/chart/modules/order-manager.js:17889` — SL price read uses `_parseSltpInputPrice`

### Diff Summary

- Added `_isSltpParseFixEnabled()`.
- Added `_parseSltpInputPrice()` to parse valid trailing-zero prices like `9.1000` as `9.1`.
- Added `_shouldDeferSltpInputRecalc()` to detect in-progress decimal scaffolds such as `.`, `0.`, and `0.0`.
- SL/TP `oninput` now avoids risk/lot recalculation while the user is still typing a zero-only decimal scaffold, preserving the prior computed lot instead of transiently zeroing it.

### RED Before Fix

Same RED-first test file; before implementation the parse helpers were absent.

Output excerpt:

```text
AssertionError [ERR_ASSERTION]: _shouldRenderSltpPrice must exist
+ actual - expected

+ 'undefined'
- 'function'
```

After the helpers existed, the kill-switch RED below proves the parse reproduction is non-vacuous against legacy behavior.

### GREEN After Fix

Command:

```bash
node "chart v 1.4/chart/modules/order-sltp-display-parsing.test.mjs"
node "homepage/public/chart/modules/order-sltp-display-parsing.test.mjs"
```

Output:

```text
GREEN — SL/TP display threshold + parsing reproductions passed
GREEN — SL/TP display threshold + parsing reproductions passed
```

Assertions covered:

- `slPrice = "0."` defers recalculation.
- `slPrice = "0.0"` defers recalculation.
- `tpPrice = "."` defers recalculation.
- `slPrice = "9.000"` does **not** defer; it is a valid trailing-zero price.
- `9.1000` parses to `9.1`, not `0`.
- A simulated prior lot of `1.23` remains `1.23` while `slPrice` is an in-progress `0.` scaffold.

### RED Again With Kill-Switch

Command:

```bash
TALARIA_TEST_DISABLE_SLTP_PARSE_FIX=1 node "chart v 1.4/chart/modules/order-sltp-display-parsing.test.mjs"
```

Output excerpt:

```text
AssertionError [ERR_ASSERTION]: partial decimal scaffold must not recalculate lot size to zero

false !== true
```

Browser kill-switch equivalent:

```js
window.__TALARIA_DISABLE_SLTP_PARSE_FIX = true;
```

---

## State Matrix (I5)

### Fix A — SL/TP Render

| Cell | Replay bus touched? | Changed? |
|------|---------------------|----------|
| Single chart, replay off | No | Yes — order-entry preview SL/TP line visibility |
| Single chart, replay playing | No | Yes — same preview rendering only |
| Single chart, replay paused | No | Yes — same preview rendering only |
| Multichart host order rail | No | Yes — same `order-manager.js` |
| Multichart panel iframe | No | Yes — mirrored module |
| Replay mirror frame / `applyReplayFrame` | No | No |
| Filled order / journal rendering | No | No |

### Fix B — SL/TP Parse

| Cell | Replay bus touched? | Changed? |
|------|---------------------|----------|
| Single chart, replay off | No | Yes — SL/TP input event parsing and preview recalculation |
| Single chart, replay playing | No | Yes — same order-entry input path |
| Single chart, replay paused | No | Yes — same order-entry input path |
| Multichart host order rail | No | Yes — same `order-manager.js` |
| Multichart panel iframe | No | Yes — mirrored module |
| Replay mirror frame / `applyReplayFrame` | No | No |
| Aggregate model / `computeOrderEntryAggregates` | No | No |

---

## SHA256 (I8)

| File pair | SHA256 |
|-----------|--------|
| `chart v 1.4/chart/modules/order-manager.js` | `12F2D8896E28F9881637E641A9A399C19D870298CA260A0C4FD3EBAF4CF4629C` |
| `homepage/public/chart/modules/order-manager.js` | `12F2D8896E28F9881637E641A9A399C19D870298CA260A0C4FD3EBAF4CF4629C` |
| `chart v 1.4/chart/modules/order-sltp-display-parsing.test.mjs` | `EA09E77C3805470206B88B069E4C794EEAE55998639A20DF030637981E3C8783` |
| `homepage/public/chart/modules/order-sltp-display-parsing.test.mjs` | `EA09E77C3805470206B88B069E4C794EEAE55998639A20DF030637981E3C8783` |

Both touched pairs are byte-identical.

---

## Build + Checks

Build id bumped from `20260712b1` to:

- **`20260712b2`**

Command used:

```bash
BUILD_ID=20260712b2 node "chart v 1.4/talaria-design/scripts/bump-dist-v9-cache.mjs" --live
BUILD_ID=20260712b2 node "chart v 1.4/talaria-design/scripts/bump-dist-v9-cache.mjs" --dist
```

Checks:

```bash
node --check "chart v 1.4/chart/modules/order-manager.js"
node --check "homepage/public/chart/modules/order-manager.js"
node --check "chart v 1.4/chart/modules/order-sltp-display-parsing.test.mjs"
node --check "homepage/public/chart/modules/order-sltp-display-parsing.test.mjs"
```

Result: all clean.

IDE lints: no linter errors found for changed files.

---

## TAL-00752 Disposition

### Closed by this step

| TAL-00752 family | Fix |
|------------------|-----|
| SL/TP below `10` not rendered on chart | Closed by `__TALARIA_DISABLE_SLTP_RENDER_FIX` gated render predicate and preview-line wiring |
| Trailing-zero / partial-decimal SL/TP input zeroes lot | Closed by `__TALARIA_DISABLE_SLTP_PARSE_FIX` gated parse/defer path |

### Still deferred / not in scope

| TAL-00752 family | Reason |
|------------------|--------|
| Aggregate averaging / risk split / type mutation / PNL sign | Already handled in T4 step 1; aggregate code not touched here |
| Replay-interaction rows (fills wrong candle, TP flicker) | Replay bus/harness work; explicitly out of scope for this step |
| Ghost artifacts after delete | RC-1/RC-2 lifecycle/invalidation family, not RC-5 display/parsing |

---

## Manager Re-run Checklist

```bash
# RED/legacy evidence already captured before implementation:
# _shouldRenderSltpPrice missing before helper implementation.

# GREEN
node "chart v 1.4/chart/modules/order-sltp-display-parsing.test.mjs"

# RED again — render kill-switch
TALARIA_TEST_DISABLE_SLTP_RENDER_FIX=1 node "chart v 1.4/chart/modules/order-sltp-display-parsing.test.mjs"

# RED again — parse kill-switch
TALARIA_TEST_DISABLE_SLTP_PARSE_FIX=1 node "chart v 1.4/chart/modules/order-sltp-display-parsing.test.mjs"
```

For browser manual verification:

1. Confirm build id `20260712b2` in host and any active panels.
2. Enter an SL and TP below `10` (for a low-priced instrument) and confirm chart line/label renders.
3. Enter `0.`, `0.0`, then complete a valid decimal SL/TP; confirm lot size does not transiently zero while the decimal scaffold is incomplete.
4. Set `window.__TALARIA_DISABLE_SLTP_RENDER_FIX = true` and confirm the sub-10 render reproduction returns.
5. Set `window.__TALARIA_DISABLE_SLTP_PARSE_FIX = true` and confirm partial decimal input can again drive the legacy zero-lot path.
