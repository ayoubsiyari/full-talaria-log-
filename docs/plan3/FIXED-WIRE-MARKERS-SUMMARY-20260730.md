# Fixed wire markers summary - 2026-07-30

Tip: `147fa8e5f45a639b1fa2719557791904b2b4bb8a`

Machine-readable map: `docs/plan3/FIXED-WIRE-MARKERS-20260730.json`

- Fixed ledger rows: **50**
- Rows with >=1 wire-check marker: **48**
- Rows with ZERO markers (cannot wire-check): **2**

## Tickets with ZERO markers (cannot wire-check)

- **TAL-01941** — Commit column names soak gate `order-sl-tp-trigger-soak.test.mjs` only; RED kill is test-env `TALARIA_TEST_DISABLE_ORDER_SL_TP_TRIGGER_SOAK` with no product `__TALARIA_DISABLE_*` / ON-path needle in chart modules.
- **Rayan #2** — Gate `order-mc-layout-teardown-retains-host-orders.test.mjs` is a source-absence check (MultichartGrid / multichart-manager must not clear host `openPositions` on peer teardown). No positive deployed product flag/string proves the fix.

## Tickets with markers

See JSON `rows[].markers` for full `{pathHint, needle, fromCommit}` tuples. High-signal examples:

| Ticket | pathHint | needle |
| --- | --- | --- |
| M24 / TAL-01926 | session_journal_store.py | `SESSION_JOURNAL_PATCH_DELETE_GUARD` |
| TAL-01908 / 01919 / 01924 | order-manager.js | `__TALARIA_DISABLE_M24_DISPLAY_ID_STABILITY_V1` |
| TAL-01904 | order-entry-aggregates.mjs | `__TALARIA_DISABLE_ORDER_TYPE_ONE_TICK_PENDING_V1` |
| TAL-01933 | order-manager.js | `__TALARIA_DISABLE_ORDER_SINGLE_TP_AFTER_TRAIL_V1` |
| TAL-01809 | order-manager.js | `__TALARIA_DISABLE_ORDER_BALANCE_FLOOR_V1` |
| SEL-01 | order-manager.js | `__TALARIA_DISABLE_ORDER_SEL01_EXACT_TEARDOWN_V1` |
| TAL-01810 | chart.js | `__TALARIA_DISABLE_TRADE_MARKER_CANONICAL_PROJECTION_V1` |
| TAL-01896 | orderManagerTradeRows.js | `__TALARIA_DISABLE_TRADE_DURATION_NORM_V1` |
| M23 / Rayan #1/#3/#6b | order-manager.js | `__TALARIA_DISABLE_M23_ROLLBACK_TRADE_CANCEL_V1` |
| Rayan #8 | order-manager.js | `__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1` |
| TAL-01802 / 01886 | chart.js | `__TALARIA_MC_DISABLE_CANONICAL_REPLAY_MARK_V1` |
| TAL-01807b | order-manager.js | `__TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1` |
