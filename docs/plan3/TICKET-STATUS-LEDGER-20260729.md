# Ticket Status Ledger — Plan 3 / Trade Correctness

Remaining open row risk labels live in `docs/plan3/UNKNOWN-RISK-LABELS-20260729.md`.

| Ticket | Status | Commit | Gate | Review / Canary Note |
| --- | --- | --- | --- | --- |
| M17-DI2 / TAL-01918 | not-fixed | — | RED: `node --test "chart v 1.4/chart/modules/m17-di2-completed-bar-close-mutation.red.test.mjs"` fails today | Root cause doc: `docs/plan3/M17-DI2-TAL-01918-ROOT-CAUSE-20260729.md`; product carve-out required |
| M24 / TAL-01926 | fixed | `95adb8285`, `56b773b90` | GREEN: `py -m pytest "chart v 1.4/chart/tests/test_session_journal_store.py"` | B train now wires D prune guard into `api_server.py` |
| TAL-01930 | fixed | `42d01a1dc` | GREEN: `m14-fibonacci-settings-levels-persist.test.mjs` canonical + homepage | M14 Fibonacci settings thread; non-money-path |
| TAL-01888 | fixed | `42d01a1dc` | GREEN: `m14-fibonacci-settings-levels-persist.test.mjs` canonical + homepage | M14 Fibonacci settings thread; non-money-path |
| TAL-01813 | fixed | `42d01a1dc` | GREEN: `m14-fibonacci-settings-levels-persist.test.mjs` canonical + homepage | M14 Fibonacci settings thread; non-money-path |
| TAL-01758 | fixed | `42d01a1dc` | GREEN: `m14-fibonacci-settings-levels-persist.test.mjs` canonical + homepage | M14 Fibonacci settings thread; non-money-path |
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
| TAL-01696 | not-fixed | — | Evidence gap: no dedicated D-tip journal packet or gate | Do not count adjacent drag residual gates as direct closure |
| TAL-01699 | fixed | `28d808cb4` | GREEN: `order-multi-tp-coincident-stack.test.mjs` canonical + homepage; full `order-*.test.mjs` sweeps | TOP review ACCEPT recorded in `journal-D.md` |
| TAL-01698 | not-fixed | — | Evidence gap: prior rejected packet backed out; no dedicated accepted D-tip gate | Hidden draft constraint reset may be adjacent, not enough for fixed row |
| TAL-01617 | not-fixed | — | Evidence gap: no D-tip journal packet or gate | Cluster G sibling still needs direct evidence |
| TAL-01895 | fixed | `6ad9f48ec` | GREEN: `pins-user-preferences.test.mjs` canonical + homepage | Non-money-path; preferences writes disclosed to B |
| TAL-01792 | fixed | `6ad9f48ec` | GREEN: `pins-user-preferences.test.mjs` canonical + homepage | Non-money-path; preferences writes disclosed to B |
| TAL-01865 | not-fixed | — | Evidence: `docs/plan3/PATCH-REQUEST-A-SYMBOL-PERSIST-20260729.md` | Requires `chart.js` owner |
| TAL-01747 | not-fixed | — | Evidence: `docs/plan3/PATCH-REQUEST-A-SYMBOL-PERSIST-20260729.md` | Requires `chart.js` owner |
| TAL-01941 | not-fixed | `93c842bc8` | GREEN: `order-sl-trigger-diagnostics.test.mjs` canonical + homepage | Instrumentation only; TOP re-review ACCEPT confirms no execution fix |
| TAL-01896 | fixed | `3fae85648` | GREEN: `orderManagerTradeRows.test.mjs`; `b75-tal-01896-duration-oracle.test.mjs`; `node --check orderManagerTradeRows.js` | TOP review ACCEPT; PO cannot see until `dist-v9` rebuild |
| M20-A timezone sha pin | not-fixed | — | Evidence: `docs/plan3/PATCH-REQUEST-M20-A-TIMEZONE-PIN-REPIN-20260729.md` | Owner re-pin/re-review required |
| M23 / TAL-01937 | fixed | `f127d25dd` | GREEN: `m23-rollback-trade-state.red.test.mjs` | Gate cross-links `TAL-01937` and Rayan rollback reports |
| TAL-01800 | fixed | `c0a0d7620` | GREEN: `order-lifecycle-event-ownership.test.mjs` canonical + homepage | Gate header names `TAL-01800`; not closed by M23 rollback gate |
| TAL-01940 | not-fixed | — | Evidence gap: no D-tip product commit or gate | Board M24 member still open |
| TAL-01756 | not-fixed | — | Evidence gap: `TAL-01810` gated only | Paired with `TAL-01810`, not independently closed |
| Rayan #8 | not-fixed | — | Evidence gap: intake marked unconfirmed/watch; no repro | No D-tip gate |
| TAL-01653 | not-fixed | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01692 | not-fixed | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01658 | not-fixed | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01691 | not-fixed | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01805 | not-fixed | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01795 | not-fixed | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01780 | not-fixed | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01781 | not-fixed | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01789 | not-fixed | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01791 | not-fixed | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01760 | not-fixed | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01798 | fixed | `c0a0d7620` | GREEN: `order-lifecycle-event-ownership.test.mjs` canonical + homepage | Gate header names `TAL-01798` |
| TAL-01815 | fixed | `c0a0d7620` | GREEN: `order-lifecycle-event-ownership.test.mjs` canonical + homepage | Gate header names `TAL-01815` |
| TAL-01677 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster D/session navigation |
| TAL-01688 | not-fixed | — | Evidence gap: old-layout item, no current-surface gate | Cluster M / old-layout system |
| TAL-01700 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster K/crosshair replay label |
| TAL-01709 | not-fixed | — | Evidence gap: old-layout recurrence, no current-surface gate | Cluster M / old-layout system |
| TAL-01717 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster C; recurrence stale-surface triage pending |
| TAL-01718 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster L; recurrence stale-surface triage pending |
| TAL-01719 | not-fixed | — | Evidence gap: old-layout recurrence, no current-surface gate | Cluster M; recurrence stale-surface triage pending |
| TAL-01723 | not-fixed | — | Evidence gap: recurrence stale-surface triage pending | Intake recurrence watch |
| TAL-01724 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/grid reset |
| TAL-01725 | not-fixed | — | Evidence gap: old-layout item, no current-surface gate | Cluster M / old-layout system |
| TAL-01726 | not-fixed | — | Evidence gap: old-layout item, no current-surface gate | Cluster M / old-layout system |
| TAL-01728 | not-fixed | — | Evidence gap: old-layout/first-click item, no current-surface gate | Cluster M / old-layout system |
| TAL-01732 | not-fixed | — | Evidence gap: PO clarification says closed/already resolved, but no commit+gate row | Cluster D/K split history |
| TAL-01733 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster C/multichart replay lag |
| TAL-01734 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/custom TF grid |
| TAL-01735 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/time-label drag runaway |
| TAL-01736 | not-fixed | — | Evidence gap: old-layout pointer-capture item, no current-surface gate | Cluster M / old-layout system |
| TAL-01737 | not-fixed | — | Evidence gap: old-layout sync item, no current-surface gate | Cluster M / old-layout system |
| TAL-01739 | not-fixed | — | Evidence gap: old-layout grid item, no current-surface gate | Cluster M / old-layout system |
| TAL-01740 | not-fixed | — | Evidence gap: old-layout render item, no current-surface gate | Cluster M / old-layout system |
| TAL-01743 | not-fixed | — | Evidence gap: old-layout sync item, no current-surface gate | Cluster M / old-layout system |
| TAL-01744 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster K; crosshair snap/settings sync needs PO decision |
| TAL-01755 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/custom TF grid |
| TAL-01759 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster E/session isolation |
| TAL-01768 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/price-scale rescale |
| TAL-01769 | not-fixed | — | Evidence gap: old-layout item, no current-surface gate | Cluster M / old-layout system |
| TAL-01784 | not-fixed | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01796 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | M10 residual marker check |
| TAL-01799 | not-fixed | — | Evidence gap: old-layout/order-symbol item, no D-tip gate | Cluster M / old-layout system |
| TAL-01802 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/cross-timeframe price |
| TAL-01814 | not-fixed | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01821 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/price-scale wheel |
| TAL-01823 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/scale artifact |
| TAL-01824 | not-fixed | — | Evidence gap: old-layout item, no current-surface gate | Cluster M / old-layout system |
| TAL-01831 | not-fixed | — | Evidence gap: old-layout item, no current-surface gate | Cluster M / old-layout system |
| TAL-01838 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/grid reset |
| TAL-01847 | not-fixed | — | Evidence gap: old-layout item, no current-surface gate | Cluster M / old-layout system |
| TAL-01849 | not-fixed | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01850 | not-fixed | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01851 | not-fixed | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01852 | not-fixed | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01854 | not-fixed | — | Evidence gap: PO scratched from M25; no product gate | Cluster L / replay controls |
| TAL-01862 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/news flag scale |
| TAL-01864 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/history range |
| TAL-01886 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/cross-timeframe price |
| TAL-01887 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster C/multichart replay lag |
| TAL-01891 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster N/memory lag |
| TAL-01892 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster N/idle lag |
| TAL-01893 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster D/GoTo session skip |
| TAL-01894 | not-fixed | — | Evidence gap: PO scratched; no product gate | Cluster H/settings-label item scratched |
| TAL-01898 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/weekly-to-lower-TF jump |
| TAL-01899 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster L/tick path draw order |
| TAL-01900 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster L/replay interval substeps |
| TAL-01902 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster L/weekend clock |
| TAL-01906 | not-fixed | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01907 | not-fixed | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01909 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster D/session resume |
| TAL-01910 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster C/multichart replay lag |
| TAL-01911 | not-fixed | — | Evidence gap: M24 journal registration, no direct fixed gate for this ticket | Cluster B / trade ledger |
| TAL-01912 | not-fixed | — | Evidence gap: PO scratched/user confusion; no product gate | Cluster D/navigation |
| TAL-01913 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster H/daily-open lines |
| TAL-01914 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster H/indicator labels |
| TAL-01915 | not-fixed | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01916 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/zoom direction |
| TAL-01917 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/TF switch candles |
| TAL-01920 | not-fixed | — | Evidence gap: PO scratched; no product gate | Intake scratched |
| TAL-01921 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster H/indicator labels |
| TAL-01922 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/session calendar/daily candle |
| TAL-01923 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster L/drawings lag replay |
| TAL-01925 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/weekly-to-lower-TF jump |
| TAL-01928 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/responsive toolbar overlap |
| TAL-01929 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster D/session resume |
| TAL-01931 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster L/step-forward batching |
| TAL-01934 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster K/crosshair replay label |
| TAL-01935 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster H/indicator labels |
| TAL-01936 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/time alignment |
| TAL-01938 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster H/ORB size across TF |
| TAL-01939 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster C/multichart replay lag |
| Rayan #1 | fixed | `f127d25dd` | GREEN: `m23-rollback-trade-state.red.test.mjs` | Gate cross-links Rayan #1/#3/#6b |
| Rayan #2 | not-fixed | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster C/multichart replay lag |
| Rayan #3 | fixed | `f127d25dd` | GREEN: `m23-rollback-trade-state.red.test.mjs` | Gate cross-links Rayan #1/#3/#6b |
| Rayan #4 | fixed | `b21d236d3`, `f1ddb2e64` | GREEN: `m24-order-id-allocator.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| Rayan #5 | fixed | `b21d236d3`, `f1ddb2e64` | GREEN: `m24-order-id-allocator.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| Rayan #6b | fixed | `f127d25dd` | GREEN: `m23-rollback-trade-state.red.test.mjs` | Gate cross-links Rayan #1/#3/#6b |
| Rayan #7 | not-fixed | — | Evidence gap: settings/profile server error self-resolved; monitor only | No D-tip gate |
| Rayan #9 | fixed | `b21d236d3`, `f1ddb2e64` | GREEN: `m24-order-id-allocator.test.mjs` canonical + homepage | TOP re-review ACCEPT; update to Rayan #4 |
| Rayan #10 | not-fixed | — | Evidence gap: self-resolved monitor item | No D-tip gate |
| Rayan #11 | fixed | `b21d236d3`, `f1ddb2e64` | GREEN: `m24-order-id-allocator.test.mjs` canonical + homepage | `journal-D.md` cross-links Rayan #11 to duplicate/skipped order id class |
