# D TOP Review Packet: N5 and DEF-04

## N5 Money-Path Collisions

- `tier=TOP`
- `model=GPT-5.5`
- TOP review required: full close and durable journal save both write money-path state.
- Product landing: `078ae7ba1`
- Oracle repair: `chart v 1.4/chart/modules/n5-money-path-collisions.test.mjs`

Corrected oracle shape:

- Drives the real `OrderManager.closePositionAtPrice` path with 100 scripted close collisions.
- Asserts exact journal row count, row values, closed-position count, and realized balance delta.
- Drives real `persistJournal` and inspects real `queueCriticalSessionStateSave` payloads.
- Includes product-mutant RED controls by disabling `__TALARIA_DISABLE_N5_MONEY_PATH_COLLISION_V1` coverage for close idempotency and durable snapshotting.

Verification:

- `node --test --test-concurrency=1 "chart v 1.4/chart/modules/n5-money-path-collisions.test.mjs"` PASS 5/5.

## DEF-04 Multi-Timeframe Time Sync

- `tier=TOP`
- `model=GPT-5.5`
- TOP review required: cross-panel replay/playhead and viewport propagation can change trade execution timing and money-path review context.
- Product landing recorded on board: `50aac92b4`
- Oracle: `chart v 1.4/chart/modules/def04-multitf-time-sync.test.mjs`

Verification recorded on board:

- `node --test --test-concurrency=1 "chart v 1.4/chart/modules/def04-multitf-time-sync.test.mjs"` PASS 4/4.
- Replay gates PASS 108/108.
