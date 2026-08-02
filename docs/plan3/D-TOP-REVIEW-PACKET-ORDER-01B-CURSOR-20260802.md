# TOP review packet — ORDER-01B global market-time cursor

Date: 2026-08-02  
Author lane: D  
Reviewer: TOP (`claude-opus-5-thinking-high`)

## Scope
- Global market-time cursor (`replay-system.js` + `panel-cmd-bridge.js`)
- `resolveBar` + bar-close transcripts (`order-manager.js`)
- Oracle 4: `order-01b-market-cursor.test.mjs` (ports DEF-04 equal-epoch / no parent index)
- Kill switch: `__TALARIA_DISABLE_GLOBAL_MARKET_TIME_CURSOR_V1` (absent ⇒ ON; `true` restores interim DEF-04/D-016)

## Verification
- `npm run test:order-01b-market-cursor` — 10/10
- `npm run test:def04-multitf-time-sync` — 5/5
- chart ↔ homepage mirrors byte-identical for `replay-system.js`, `panel-cmd-bridge.js`, `order-manager.js`

## DEF-04 transfer
DEF-04 remains the interim under ORDER-01B until the cursor is the sole owner in production use.
The DEF-04 oracle assertions transfer as **01-B oracle 4** (equal epoch across 1m/15m/1h/4h; parent `currentIndex` ignored).

## TOP verdict
**PASS_WITH_RESIDUALS** ([Review](362b9e52-6ad9-496b-b6d0-5f1931947d24)).

Cleared across passes:
- Publish / frame-detail cursor mutants KILLED by runtime oracle
- Bridge consume bound to product `applyMarketTimeCursorFromFrame` (body no-op REDs)
- resolveBar shape no longer breaks `order-lifecycle-event-ownership` (14/15; remaining failure pre-existing)

Residuals (non-blocking):
- Stage untracked oracle mirrors before commit (`order-01b-market-cursor.test.mjs`, homepage `def04` mirror)
- `applyReplayFrame` call-site is still text-anchored (function body is behavior-bound)
- Cursor `sequence` not enforced; finest-TF cadence kill inert while cursor ON
- Transcripts write-only / uncapped per bar; M20-Q6 work may share the replay-system diff