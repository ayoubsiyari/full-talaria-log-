# Ticket Status Ledger — Plan 3 / Trade Correctness

| Ticket | Status | Commit | Gate | Review / Canary Note |
| --- | --- | --- | --- | --- |
| M17-DI2 / TAL-01918 | not-fixed | — | RED: `node --test "chart v 1.4/chart/modules/m17-di2-completed-bar-close-mutation.red.test.mjs"` fails today | Root cause doc: `docs/plan3/M17-DI2-TAL-01918-ROOT-CAUSE-20260729.md`; product carve-out required |
| M24 / TAL-01926 | not-fixed | — | Evidence: `docs/plan3/PATCH-REQUEST-B-M24-API-SERVER-20260729.md` | D helper landed in `95adb8285`; B `api_server.py` destructive PATCH path still owner-blocked |
| M14-FIB | fixed | `42d01a1dc` | GREEN: `m14-fibonacci-settings-levels-persist.test.mjs` canonical + homepage | Non-money-path |
| TAL-01908 | fixed | `b21d236d3`, `f1ddb2e64` | GREEN: `m24-order-id-allocator.test.mjs` canonical + homepage | TOP re-review ACCEPT in `docs/plan3/TOP-REVIEW-REQUEUE-D-20260729.md` |
| TAL-01919 | fixed | `b21d236d3`, `f1ddb2e64` | GREEN: `m24-order-id-allocator.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01924 | fixed | `b21d236d3`, `f1ddb2e64` | GREEN: `m24-order-id-allocator.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01904 | fixed | `b3f6cd6de` | GREEN: `order-type-one-tick-pending.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01897 | fixed | `5f3e68368`, `c0a0d7620` | GREEN: `order-entry-new-draft-reset.test.mjs`; `order-new-draft-constraint-reset.test.mjs` canonical + homepage | TOP re-review ACCEPT for `5f3e68368` and `c0a0d7620` |
| TAL-01933 | fixed | `a8d887db1` | GREEN: `order-single-tp-after-trail.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01809 | fixed | `7a2871f24` | GREEN: `order-balance-floor.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| SEL-01 | fixed | `864c2446c` | GREEN: `order-sel01-exact-teardown.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| Timezone EST-to-CST override | fixed | `ed2a183f3` | GREEN: `v9-theme-tz-honor-chart.test.mjs` canonical + homepage | Non-money-path; `chart.js` timezone follow-ups escalated |
| TAL-01861 | fixed | `c0a0d7620` | GREEN: `order-cancel-before-confirm.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01885 | fixed | `c0a0d7620` | GREEN: `order-line-edge-visibility.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01905 | fixed | `c0a0d7620` | GREEN: `order-lifecycle-event-ownership.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01932 | fixed | `c0a0d7620` | GREEN: `order-pending-close-netting.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01777 | fixed | `c0a0d7620` | GREEN: `order-pair-switch-draft-rebind.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01750 | fixed | `c0a0d7620` | GREEN: `order-split-entry-hover-stick.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01927 | fixed | `c0a0d7620`, `adaffe58e` | GREEN: `order-entry-screenshot-idempotent.test.mjs` canonical + homepage | TOP re-review ACCEPT for `adaffe58e`; `c0a0d7620` TOP re-review ACCEPT |
| TAL-01903 | fixed | `c0a0d7620` | GREEN: `order-pnl-refresh-stable.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01810 | fixed | `e9d9f7594` | GREEN: `order-exit-marker-spread-column.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01683 | fixed | `379394fc0` | GREEN: `order-risk-qty-on-sl-commit.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01751 | fixed | `b1196e79c` | GREEN: `order-be-place-anchor.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01697 | fixed | `231df7bb5` | GREEN: `order-preview-live-recalc.test.mjs` canonical + homepage; full `order-*.test.mjs` sweeps | TOP review ACCEPT recorded in `journal-D.md` |
| TAL-01696 | fixed | `095d718b1`, `6ba667b48`, `fbd0ee6c2` | GREEN: `order-risk-qty-live-preview-sl.test.mjs`; `order-block-place-during-preview-drag.test.mjs` canonical + homepage | TOP reviews ACCEPT recorded in `journal-D.md` |
| TAL-01699 | fixed | `28d808cb4` | GREEN: `order-multi-tp-coincident-stack.test.mjs` canonical + homepage; full `order-*.test.mjs` sweeps | TOP review ACCEPT recorded in `journal-D.md` |
| TAL-01698 | fixed | `c0a0d7620` | GREEN: `order-new-draft-constraint-reset.test.mjs` canonical + homepage | Prior rejected packet backed out; closed by hidden draft constraint reset path |
| TAL-01895 | fixed | `6ad9f48ec` | GREEN: `pins-user-preferences.test.mjs` canonical + homepage | Non-money-path; preferences writes disclosed to B |
| TAL-01792 | fixed | `6ad9f48ec` | GREEN: `pins-user-preferences.test.mjs` canonical + homepage | Non-money-path; preferences writes disclosed to B |
| TAL-01865 | not-fixed | — | Evidence: `docs/plan3/PATCH-REQUEST-A-SYMBOL-PERSIST-20260729.md` | Requires `chart.js` owner |
| TAL-01747 | not-fixed | — | Evidence: `docs/plan3/PATCH-REQUEST-A-SYMBOL-PERSIST-20260729.md` | Requires `chart.js` owner |
| TAL-01941 | unknown | `93c842bc8` | GREEN: `order-sl-trigger-diagnostics.test.mjs` canonical + homepage | Instrumentation only; TOP re-review ACCEPT confirms no execution fix |
| TAL-01896 | fixed | `3fae85648` | GREEN: `orderManagerTradeRows.test.mjs`; `b75-tal-01896-duration-oracle.test.mjs`; `node --check orderManagerTradeRows.js` | TOP review ACCEPT; PO cannot see until `dist-v9` rebuild |
| M20-A timezone sha pin | not-fixed | — | Evidence: `docs/plan3/PATCH-REQUEST-M20-A-TIMEZONE-PIN-REPIN-20260729.md` | Owner re-pin/re-review required |
