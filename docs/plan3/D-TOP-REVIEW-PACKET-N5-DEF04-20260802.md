# D TOP Review Packet: N5 and DEF-04

## N5 Money-Path Collisions

- Author: `tier=mid`, `model=gpt-5.5-medium-fast`
- Reviewer: `tier=top`, `model=claude-opus-5-thinking-high`
- TOP review required: full close and durable journal save both write money-path state.
- Product landing: `078ae7ba1`
- Oracle repair: `chart v 1.4/chart/modules/n5-money-path-collisions.test.mjs`

Corrected oracle shape:

- Drives the real `OrderManager.closePositionAtPrice` path with 100 scripted close collisions.
- Asserts exact journal row count, row values, closed-position count, and realized balance delta.
- Drives real `persistJournal` and inspects real `queueCriticalSessionStateSave` payloads.
- Includes product-mutant RED controls by disabling `__TALARIA_DISABLE_N5_MONEY_PATH_COLLISION_V1` coverage for close idempotency and durable snapshotting.

Verification:

- `node --test --test-concurrency=1 "chart v 1.4/chart/modules/n5-money-path-collisions.test.mjs"` PASS 7/7 after TOP review fixes.
- TOP-review fix: full-close latch is private-only, clears in `finally`, covers both `closePositionAtPrice` and `closePosition`, and the durable mutant discriminates at the production trim default via `journal_by_ticker`.

## DEF-04 Multi-Timeframe Time Sync

- Author: `tier=mid`, `model=gpt-5.5-medium-fast`
- Reviewer: `tier=top`, `model=claude-opus-5-thinking-high`
- TOP review required: cross-panel replay/playhead and viewport propagation can change trade execution timing and money-path review context.
- Product landing recorded on board: `50aac92b4`
- Oracle: `chart v 1.4/chart/modules/def04-multitf-time-sync.test.mjs`

Verification recorded on board:

- `node --test --test-concurrency=1 "chart v 1.4/chart/modules/def04-multitf-time-sync.test.mjs"` PASS 5/5 after TOP review fixes.
- Replay gates PASS 108/108.

TOP-review fix: source anchors now bind to the method definition, not call sites; model-only arithmetic cells are labeled as models; a runtime product-binding test drives real `ReplaySystem.applyMultichartMirrorFrame` with a bogus parent index and verifies local timestamp resolution.
