# Ticket Status Ledger — Plan 3 / Trade Correctness

| Ticket | Status | Commit | Gate | Review / Canary Note |
| --- | --- | --- | --- | --- |
| M17-DI2 / TAL-01918 | not-fixed | — | RED: `node --test "chart v 1.4/chart/modules/m17-di2-completed-bar-close-mutation.red.test.mjs"` fails today | Root cause doc: `docs/plan3/M17-DI2-TAL-01918-ROOT-CAUSE-20260729.md`; product carve-out required |
| M24 / TAL-01926 | not-fixed | — | Evidence: `docs/plan3/PATCH-REQUEST-B-M24-API-SERVER-20260729.md` | D helper landed in `95adb8285`; B `api_server.py` destructive PATCH path still owner-blocked |
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
| TAL-01696 | unknown | — | Evidence gap: no dedicated D-tip journal packet or gate | Do not count adjacent drag residual gates as direct closure |
| TAL-01699 | fixed | `28d808cb4` | GREEN: `order-multi-tp-coincident-stack.test.mjs` canonical + homepage; full `order-*.test.mjs` sweeps | TOP review ACCEPT recorded in `journal-D.md` |
| TAL-01698 | unknown | — | Evidence gap: prior rejected packet backed out; no dedicated accepted D-tip gate | Hidden draft constraint reset may be adjacent, not enough for fixed row |
| TAL-01617 | unknown | — | Evidence gap: no D-tip journal packet or gate | Cluster G sibling still needs direct evidence |
| TAL-01895 | fixed | `6ad9f48ec` | GREEN: `pins-user-preferences.test.mjs` canonical + homepage | Non-money-path; preferences writes disclosed to B |
| TAL-01792 | fixed | `6ad9f48ec` | GREEN: `pins-user-preferences.test.mjs` canonical + homepage | Non-money-path; preferences writes disclosed to B |
| TAL-01865 | not-fixed | — | Evidence: `docs/plan3/PATCH-REQUEST-A-SYMBOL-PERSIST-20260729.md` | Requires `chart.js` owner |
| TAL-01747 | not-fixed | — | Evidence: `docs/plan3/PATCH-REQUEST-A-SYMBOL-PERSIST-20260729.md` | Requires `chart.js` owner |
| TAL-01941 | not-fixed | `93c842bc8` | GREEN: `order-sl-trigger-diagnostics.test.mjs` canonical + homepage | Instrumentation only; TOP re-review ACCEPT confirms no execution fix |
| TAL-01896 | fixed | `3fae85648` | GREEN: `orderManagerTradeRows.test.mjs`; `b75-tal-01896-duration-oracle.test.mjs`; `node --check orderManagerTradeRows.js` | TOP review ACCEPT; PO cannot see until `dist-v9` rebuild |
| M20-A timezone sha pin | not-fixed | — | Evidence: `docs/plan3/PATCH-REQUEST-M20-A-TIMEZONE-PIN-REPIN-20260729.md` | Owner re-pin/re-review required |
| M23 / TAL-01937 | not-fixed | — | Evidence gap: no D-tip product commit or gate | Related product work exists off-branch only |
| TAL-01800 | unknown | — | Evidence gap: no D-tip closure; M23 cross-link remains parked | Requires board owner confirmation |
| TAL-01940 | not-fixed | — | Evidence gap: no D-tip product commit or gate | Board M24 member still open |
| TAL-01756 | unknown | — | Evidence gap: `TAL-01810` gated only | Paired with `TAL-01810`, not independently closed |
| Rayan #8 | unknown | — | Evidence gap: intake marked unconfirmed/watch; no repro | No D-tip gate |
| TAL-01653 | unknown | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01692 | unknown | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01658 | unknown | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01691 | unknown | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01805 | unknown | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01795 | unknown | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01780 | unknown | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01781 | unknown | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01789 | unknown | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01791 | unknown | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01760 | unknown | — | Evidence gap: board M6 leftover, no D-tip closure | No D-tip gate |
| TAL-01798 | unknown | — | Evidence gap: prior parked/PO-verified status not re-audited in D wave | No fresh D-tip gate |
| TAL-01815 | unknown | — | Evidence gap: prior parked/PO-verified status not re-audited in D wave | No fresh D-tip gate |
| TAL-01677 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster D/session navigation |
| TAL-01688 | unknown | — | Evidence gap: old-layout item, no current-surface gate | Cluster M / old-layout system |
| TAL-01700 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster K/crosshair replay label |
| TAL-01709 | unknown | — | Evidence gap: old-layout recurrence, no current-surface gate | Cluster M / old-layout system |
| TAL-01717 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster C; recurrence stale-surface triage pending |
| TAL-01718 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster L; recurrence stale-surface triage pending |
| TAL-01719 | unknown | — | Evidence gap: old-layout recurrence, no current-surface gate | Cluster M; recurrence stale-surface triage pending |
| TAL-01723 | unknown | — | Evidence gap: recurrence stale-surface triage pending | Intake recurrence watch |
| TAL-01724 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/grid reset |
| TAL-01725 | unknown | — | Evidence gap: old-layout item, no current-surface gate | Cluster M / old-layout system |
| TAL-01726 | unknown | — | Evidence gap: old-layout item, no current-surface gate | Cluster M / old-layout system |
| TAL-01728 | unknown | — | Evidence gap: old-layout/first-click item, no current-surface gate | Cluster M / old-layout system |
| TAL-01732 | unknown | — | Evidence gap: PO clarification says closed/already resolved, but no commit+gate row | Cluster D/K split history |
| TAL-01733 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster C/multichart replay lag |
| TAL-01734 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/custom TF grid |
| TAL-01735 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/time-label drag runaway |
| TAL-01736 | unknown | — | Evidence gap: old-layout pointer-capture item, no current-surface gate | Cluster M / old-layout system |
| TAL-01737 | unknown | — | Evidence gap: old-layout sync item, no current-surface gate | Cluster M / old-layout system |
| TAL-01739 | unknown | — | Evidence gap: old-layout grid item, no current-surface gate | Cluster M / old-layout system |
| TAL-01740 | unknown | — | Evidence gap: old-layout render item, no current-surface gate | Cluster M / old-layout system |
| TAL-01743 | unknown | — | Evidence gap: old-layout sync item, no current-surface gate | Cluster M / old-layout system |
| TAL-01744 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster K; crosshair snap/settings sync needs PO decision |
| TAL-01755 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/custom TF grid |
| TAL-01759 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster E/session isolation |
| TAL-01768 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/price-scale rescale |
| TAL-01769 | unknown | — | Evidence gap: old-layout item, no current-surface gate | Cluster M / old-layout system |
| TAL-01784 | unknown | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01796 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | M10 residual marker check |
| TAL-01799 | unknown | — | Evidence gap: old-layout/order-symbol item, no D-tip gate | Cluster M / old-layout system |
| TAL-01802 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/cross-timeframe price |
| TAL-01814 | unknown | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01821 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/price-scale wheel |
| TAL-01823 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/scale artifact |
| TAL-01824 | unknown | — | Evidence gap: old-layout item, no current-surface gate | Cluster M / old-layout system |
| TAL-01831 | unknown | — | Evidence gap: old-layout item, no current-surface gate | Cluster M / old-layout system |
| TAL-01838 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/grid reset |
| TAL-01847 | unknown | — | Evidence gap: old-layout item, no current-surface gate | Cluster M / old-layout system |
| TAL-01849 | unknown | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01850 | unknown | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01851 | unknown | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01852 | unknown | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01854 | unknown | — | Evidence gap: PO scratched from M25; no product gate | Cluster L / replay controls |
| TAL-01862 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/news flag scale |
| TAL-01864 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/history range |
| TAL-01886 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/cross-timeframe price |
| TAL-01887 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster C/multichart replay lag |
| TAL-01891 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster N/memory lag |
| TAL-01892 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster N/idle lag |
| TAL-01893 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster D/GoTo session skip |
| TAL-01894 | unknown | — | Evidence gap: PO scratched; no product gate | Cluster H/settings-label item scratched |
| TAL-01898 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/weekly-to-lower-TF jump |
| TAL-01899 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster L/tick path draw order |
| TAL-01900 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster L/replay interval substeps |
| TAL-01902 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster L/weekend clock |
| TAL-01906 | unknown | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01907 | unknown | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01909 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster D/session resume |
| TAL-01910 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster C/multichart replay lag |
| TAL-01911 | unknown | — | Evidence gap: M24 journal registration, no direct fixed gate for this ticket | Cluster B / trade ledger |
| TAL-01912 | unknown | — | Evidence gap: PO scratched/user confusion; no product gate | Cluster D/navigation |
| TAL-01913 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster H/daily-open lines |
| TAL-01914 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster H/indicator labels |
| TAL-01915 | unknown | — | Evidence gap: feature request, no bug gate | Cluster O / feature request |
| TAL-01916 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/zoom direction |
| TAL-01917 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/TF switch candles |
| TAL-01920 | unknown | — | Evidence gap: PO scratched; no product gate | Intake scratched |
| TAL-01921 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster H/indicator labels |
| TAL-01922 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/session calendar/daily candle |
| TAL-01923 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster L/drawings lag replay |
| TAL-01925 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/weekly-to-lower-TF jump |
| TAL-01928 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster J/responsive toolbar overlap |
| TAL-01929 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster D/session resume |
| TAL-01931 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster L/step-forward batching |
| TAL-01934 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster K/crosshair replay label |
| TAL-01935 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster H/indicator labels |
| TAL-01936 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster I/time alignment |
| TAL-01938 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster H/ORB size across TF |
| TAL-01939 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster C/multichart replay lag |
| Rayan #1 | not-fixed | — | Evidence gap: M23 rollback cleanup not fixed on D tip | Cluster A / trade rollback |
| Rayan #2 | unknown | — | PO check: `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` | Cluster C/multichart replay lag |
| Rayan #3 | not-fixed | — | Evidence gap: M23 rollback cleanup not fixed on D tip | Cluster A / trade rollback |
| Rayan #4 | fixed | `b21d236d3`, `f1ddb2e64` | GREEN: `m24-order-id-allocator.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| Rayan #5 | fixed | `b21d236d3`, `f1ddb2e64` | GREEN: `m24-order-id-allocator.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| Rayan #6b | not-fixed | — | Evidence gap: M23 rollback cleanup not fixed on D tip | Cluster A / trade rollback |
| Rayan #7 | unknown | — | Evidence gap: settings/profile server error self-resolved; monitor only | No D-tip gate |
| Rayan #9 | fixed | `b21d236d3`, `f1ddb2e64` | GREEN: `m24-order-id-allocator.test.mjs` canonical + homepage | TOP re-review ACCEPT; update to Rayan #4 |
| Rayan #10 | unknown | — | Evidence gap: self-resolved monitor item | No D-tip gate |
| Rayan #11 | unknown | — | Evidence gap: executed trade absent from history not directly proven by D-tip fixed gate | Cluster B / trade ledger |
