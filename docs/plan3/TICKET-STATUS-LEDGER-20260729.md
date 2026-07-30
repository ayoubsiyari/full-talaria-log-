# Ticket Status Ledger — Plan 3 / Trade Correctness

Open row disposition and unverified blast-radius order live in `docs/plan3/UNKNOWN-RISK-LABELS-20260729.md`.

| Ticket | Status | Commit | Gate | Review / Canary Note |
| --- | --- | --- | --- | --- |
| M17-DI2 / TAL-01918 | blocked-on-build | — | RED local: `m17-di2-completed-bar-close-mutation.red.test.mjs`; `m21-b-tal01918-red.test.mjs` | Fix/guard on `manager-a/m17-di2-completed-bar`; not on deployed stamp. 2026-07-30 closure pass |
| M24 / TAL-01926 | fixed | `95adb8285`, `56b773b90` | GREEN: `py -m pytest "chart v 1.4/chart/tests/test_session_journal_store.py"` | Node/pytest closed; PO Script 1 re-run for count survival on stamp |
| TAL-01930 | fixed | `42d01a1dc` | GREEN: `m14-fibonacci-settings-levels-persist.test.mjs` canonical + homepage | M14 Fibonacci settings thread; non-money-path |
| TAL-01888 | fixed | `42d01a1dc` | GREEN: `m14-fibonacci-settings-levels-persist.test.mjs` canonical + homepage | M14 Fibonacci settings thread; non-money-path |
| TAL-01813 | fixed | `42d01a1dc` | GREEN: `m14-fibonacci-settings-levels-persist.test.mjs` canonical + homepage | M14 Fibonacci settings thread; non-money-path |
| TAL-01758 | fixed | `42d01a1dc` | GREEN: `m14-fibonacci-settings-levels-persist.test.mjs` canonical + homepage | M14 Fibonacci settings thread; non-money-path |
| TAL-01908 | fixed | `2cc949399` | GREEN: `m24-order-id-restore-stability.test.mjs` ± homepage | Node-closed; PO Script 1 re-run against fix on next stamp |
| TAL-01919 | fixed | `2cc949399` | GREEN: `m24-order-id-restore-stability.test.mjs` ± homepage | Node-closed; PO Script 1 re-run against fix |
| TAL-01924 | fixed | `2cc949399` | GREEN: `m24-order-id-restore-stability.test.mjs` ± homepage | Node-closed; PO Script 1 re-run against fix |
| TAL-01904 | fixed | `b3f6cd6de` | GREEN: `order-type-one-tick-pending.test.mjs` ± homepage | TOP ACCEPT; PO Script 3 re-run on stamp |
| TAL-01897 | fixed | `5f3e68368`, `c0a0d7620` | GREEN: draft reset gates ± homepage | TOP ACCEPT; optional stamp confirm with order-line leftovers |
| TAL-01933 | fixed | `a8d887db1` | GREEN: `order-single-tp-after-trail.test.mjs` ± homepage | TOP ACCEPT; PO Script 3 re-run on stamp |
| TAL-01809 | fixed | `7a2871f24` | GREEN: `order-balance-floor.test.mjs` ± homepage | TOP ACCEPT; PO Script 3 re-run on stamp |
| SEL-01 | fixed | `864c2446c` | GREEN: `order-sel01-exact-teardown.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| Timezone EST-to-CST override | fixed | `ed2a183f3` | GREEN: `v9-theme-tz-honor-chart.test.mjs` canonical + homepage | Non-money-path; `chart.js` timezone follow-ups escalated |
| TAL-01861 | fixed | `c0a0d7620` | GREEN: `order-cancel-before-confirm.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01885 | fixed | `c0a0d7620` | GREEN: `order-line-edge-visibility.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01905 | fixed | `c0a0d7620` | GREEN: `order-lifecycle-event-ownership.test.mjs` ± homepage | TOP ACCEPT; PO Script 3 re-run on stamp |
| TAL-01932 | fixed | `c0a0d7620` | GREEN: `order-pending-close-netting.test.mjs` ± homepage | TOP ACCEPT; PO Script 3 re-run on stamp |
| TAL-01777 | fixed | `c0a0d7620` | GREEN: `order-pair-switch-draft-rebind.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01750 | fixed | `c0a0d7620` | GREEN: `order-split-entry-hover-stick.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01927 | fixed | `c0a0d7620`, `adaffe58e` | GREEN: `order-entry-screenshot-idempotent.test.mjs` ± homepage | Node-closed; PO Script 5 re-run against fix |
| TAL-01903 | fixed | `c0a0d7620` | GREEN: `order-pnl-refresh-stable.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01810 | fixed | `e9d9f7594` | GREEN: `order-exit-marker-spread-column.test.mjs` ± homepage | TOP ACCEPT; PO Script 3 re-run on stamp |
| TAL-01683 | fixed | `379394fc0` | GREEN: `order-risk-qty-on-sl-commit.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01751 | fixed | `b1196e79c` | GREEN: `order-be-place-anchor.test.mjs` canonical + homepage | TOP re-review ACCEPT |
| TAL-01697 | fixed | `231df7bb5` | GREEN: `order-preview-live-recalc.test.mjs` canonical + homepage; full `order-*.test.mjs` sweeps | TOP review ACCEPT recorded in `journal-D.md` |
| TAL-01696 | po-eyes | — | Evidence gap: no dedicated D-tip gate | Order-line leftover — PO confirmation cluster with 01698/01617 |
| TAL-01699 | fixed | `28d808cb4` | GREEN: `order-multi-tp-coincident-stack.test.mjs` canonical + homepage; full `order-*.test.mjs` sweeps | TOP review ACCEPT recorded in `journal-D.md` |
| TAL-01698 | po-eyes | — | Prior rejected packet backed out | Order-line leftover — PO confirmation |
| TAL-01617 | po-eyes | — | No D-tip gate | Order-line leftover — PO confirmation |
| TAL-01895 | fixed | `6ad9f48ec` | GREEN: `pins-user-preferences.test.mjs` canonical + homepage | Non-money-path; preferences writes disclosed to B |
| TAL-01792 | fixed | `6ad9f48ec` | GREEN: `pins-user-preferences.test.mjs` canonical + homepage | Non-money-path; preferences writes disclosed to B |
| TAL-01865 | owner-blocked | — | `docs/plan3/PATCH-REQUEST-A-SYMBOL-PERSIST-20260729.md` | Requires `chart.js` owner A |
| TAL-01747 | owner-blocked | — | `docs/plan3/PATCH-REQUEST-A-SYMBOL-PERSIST-20260729.md` | Requires `chart.js` owner A |
| TAL-01941 | needs-info | `93c842bc8` | GREEN diagnostics only: `order-sl-trigger-diagnostics.test.mjs` | Instrumentation; no execution fix; pair/TF/steps missing |
| TAL-01896 | fixed | `3fae85648` | GREEN: duration oracles | Node-closed; PO Script 4 re-run; needs dist-v9 |
| M20-A timezone sha pin | owner-blocked | — | `PATCH-REQUEST-M20-A-TIMEZONE-PIN-REPIN-20260729.md` | Owner re-pin/re-review; not a PO click script |
| M23 / TAL-01937 | fixed | `f127d25dd` | GREEN: `m23-rollback-trade-state.red.test.mjs` | Node-closed; PO Script 2 re-run against fix |
| TAL-01800 | fixed | `c0a0d7620` | GREEN: `order-lifecycle-event-ownership.test.mjs` ± homepage | Node-closed; PO Script 2 re-run against fix |
| TAL-01940 | po-eyes | — | No D-tip product gate | First look — PO Script 5 (journal side-effects) |
| TAL-01756 | superseded | `e9d9f7594` | Sibling gate: `order-exit-marker-spread-column.test.mjs` (TAL-01810) | Paired with TAL-01810 TOP ACCEPT; no independent row gate |
| Rayan #8 | needs-info | — | Intake unconfirmed/watch; no repro | Do not invent PO steps |
| TAL-01653 | superseded | — | Plan-2 / M6 drag-follow family shipped | Board leftover; no dedicated D-tip gate |
| TAL-01692 | superseded | — | M6 leftover / cluster G train | No dedicated D-tip gate |
| TAL-01658 | superseded | — | Plan-2-fixed recurrence family | Board leftover |
| TAL-01691 | superseded | — | M6 leftover | No dedicated D-tip gate |
| TAL-01805 | superseded | — | M6 leftover | No dedicated D-tip gate |
| TAL-01795 | superseded | — | M6 leftover | No dedicated D-tip gate |
| TAL-01780 | superseded | — | M6 leftover | No dedicated D-tip gate |
| TAL-01781 | superseded | — | M6 leftover | No dedicated D-tip gate |
| TAL-01789 | superseded | — | M6 leftover | No dedicated D-tip gate |
| TAL-01791 | superseded | — | M6 leftover | No dedicated D-tip gate |
| TAL-01760 | superseded | — | M6 leftover | No dedicated D-tip gate |
| TAL-01798 | fixed | `c0a0d7620` | GREEN: `order-lifecycle-event-ownership.test.mjs` canonical + homepage | Gate header names `TAL-01798` |
| TAL-01815 | fixed | `c0a0d7620` | GREEN: `order-lifecycle-event-ownership.test.mjs` canonical + homepage | Gate header names `TAL-01815` |
| TAL-01677 | needs-info | — | Cluster D Go To session | Needs reproducible session-boundary steps |
| TAL-01688 | superseded | — | Old-layout Cluster M | No current-surface gate |
| TAL-01700 | po-eyes | — | Cluster K crosshair replay | Data/UI PO cluster — not one of five money scripts |
| TAL-01709 | superseded | — | Old-layout Cluster M | No current-surface gate |
| TAL-01717 | po-eyes | — | Cluster C multichart | Data/replay PO — outside five money scripts |
| TAL-01718 | blocked-on-build | — | Gate `m25-tal-01718-tick-speed.red.test.mjs` absent | Only on `diagnostics/v3-qa123-soak-20260727` |
| TAL-01719 | superseded | — | Old-layout Cluster M | No current-surface gate |
| TAL-01723 | superseded | — | Recurrence stale-surface | PO-CHECK §16 disposition, not new engineering |
| TAL-01724 | po-eyes | — | Cluster J grid | UI/viewport PO |
| TAL-01725 | superseded | — | Old-layout Cluster M | No current-surface gate |
| TAL-01726 | superseded | — | Old-layout Cluster M | No current-surface gate |
| TAL-01728 | superseded | — | Old-layout Cluster M | No current-surface gate |
| TAL-01732 | superseded | — | PO clarification closed/already resolved | No commit+gate to reopen |
| TAL-01733 | fixed | `db849737f` | GREEN: `cd "chart v 1.4/chart/multichart-prod/harness" && node run.mjs --only=H-S19` and `--only=H-S83` | Closure pass bucket (a) |
| TAL-01734 | po-eyes | — | Cluster J custom TF grid | UI/viewport PO |
| TAL-01735 | po-eyes | — | Cluster J time-label drag | UI/viewport PO |
| TAL-01736 | superseded | — | Old-layout Cluster M | No current-surface gate |
| TAL-01737 | superseded | — | Old-layout Cluster M | No current-surface gate |
| TAL-01739 | superseded | — | Old-layout Cluster M | No current-surface gate |
| TAL-01740 | superseded | — | Old-layout Cluster M | No current-surface gate |
| TAL-01743 | superseded | — | Old-layout Cluster M | No current-surface gate |
| TAL-01744 | needs-info | — | Cluster K crosshair snap | Needs PO decision/spec, not deploy script |
| TAL-01755 | po-eyes | — | Cluster J | UI/viewport PO |
| TAL-01759 | owner-blocked | — | Cluster E session isolation | Layout/persistence owner lane |
| TAL-01768 | po-eyes | — | Cluster J price-scale | UI/viewport PO |
| TAL-01769 | superseded | — | Old-layout Cluster M | No current-surface gate |
| TAL-01784 | needs-info | — | Cluster O feature request | Not a bug gate |
| TAL-01796 | po-eyes | — | M10 residual marker | First look — PO Script 3 |
| TAL-01799 | owner-blocked | — | Multichart/layout shell | Cluster M / order on new layout |
| TAL-01802 | fixed | `ab57a5dac` | GREEN: `cross-timeframe-current-price-coherence.test.mjs` ± homepage | Closure pass bucket (b); Data Script 2 optional confirm |
| TAL-01814 | needs-info | — | Cluster O feature request | Not a bug gate |
| TAL-01821 | po-eyes | — | Cluster J | UI/viewport PO |
| TAL-01823 | po-eyes | — | Cluster J | UI/viewport PO |
| TAL-01824 | superseded | — | Old-layout Cluster M | No current-surface gate |
| TAL-01831 | superseded | — | Old-layout Cluster M | No current-surface gate |
| TAL-01838 | po-eyes | — | Cluster J | UI/viewport PO |
| TAL-01847 | superseded | — | Old-layout Cluster M | No current-surface gate |
| TAL-01849 | needs-info | — | Cluster O feature request | Not a bug gate |
| TAL-01850 | needs-info | — | Cluster O feature request | Not a bug gate |
| TAL-01851 | needs-info | — | Cluster O feature request | Not a bug gate |
| TAL-01852 | needs-info | — | Cluster O feature request | Not a bug gate |
| TAL-01854 | cosmetic-disclosed | — | PO scratched from M25 | No product gate |
| TAL-01862 | po-eyes | — | Cluster J | UI/viewport PO |
| TAL-01864 | owner-blocked | — | Cluster I history range | `chart.js` smart-window; Data Script 3 |
| TAL-01886 | fixed | `ab57a5dac` | GREEN: `cross-timeframe-current-price-coherence.test.mjs` ± homepage | Closure pass bucket (b) |
| TAL-01887 | fixed | `db849737f` | GREEN: harness `H-S18` + `H-S83` | Closure pass bucket (a) |
| TAL-01891 | needs-info | — | Cluster N memory lag | Soak undefined; no invented click path |
| TAL-01892 | needs-info | — | Cluster N idle lag | Soak/monitor lane |
| TAL-01893 | needs-info | — | Cluster D GoTo skip | Needs explicit repro on stamp |
| TAL-01894 | cosmetic-disclosed | — | PO scratched | Settings-label scratched |
| TAL-01898 | po-eyes | — | Cluster I weekly jump | Data/replay PO |
| TAL-01899 | blocked-on-build | — | Gate `m25-tal-01899-ohlc-order.red.test.mjs` absent | Only on `diagnostics/v3-qa123-soak-20260727` |
| TAL-01900 | blocked-on-build | — | Gate `m25-tal-01900-substep-stall.red.test.mjs` absent | Only on `diagnostics/v3-qa123-soak-20260727` |
| TAL-01902 | blocked-on-build | — | Gate `m25-tal-01902-session-calendar.red.test.mjs` absent | Only on `diagnostics/v3-qa123-soak-20260727` |
| TAL-01906 | needs-info | — | Cluster O feature request | Not a bug gate |
| TAL-01907 | needs-info | — | Cluster O feature request | Not a bug gate |
| TAL-01909 | po-eyes | — | Cluster D session resume | Data/replay PO |
| TAL-01910 | fixed | `db849737f` | GREEN: harness `H-S18` + `H-S83` | Closure pass bucket (a) |
| TAL-01911 | po-eyes | — | M24 journal registration residual | First look — PO Script 1 |
| TAL-01912 | cosmetic-disclosed | — | PO scratched / user confusion | No product gate |
| TAL-01913 | owner-blocked | — | Cluster H daily-open lines | Chart overlay owner |
| TAL-01914 | owner-blocked | — | Cluster H indicator labels | Chart overlay owner |
| TAL-01915 | needs-info | — | Cluster O feature request | Not a bug gate |
| TAL-01916 | po-eyes | — | Cluster J zoom | UI/viewport PO |
| TAL-01917 | po-eyes | — | Cluster I TF switch candles | Data/replay PO |
| TAL-01920 | cosmetic-disclosed | — | Intake scratched/withdrawn | Disposition-only |
| TAL-01921 | owner-blocked | — | Cluster H indicator labels | Chart overlay owner |
| TAL-01922 | blocked-on-build | — | RED: `m22-session-calendar-bucketing.red.test.mjs` (default broken) | Product not GREEN on tip; session-calendar ship required |
| TAL-01923 | po-eyes | — | Cluster L drawings lag | Data/replay PO |
| TAL-01925 | po-eyes | — | Cluster I weekly jump | Data/replay PO |
| TAL-01928 | po-eyes | — | Cluster J toolbar | UI/viewport PO |
| TAL-01929 | po-eyes | — | Cluster D session resume | Data/replay PO |
| TAL-01931 | owner-blocked | — | Cluster L step-forward | `replay-system.js` owner |
| TAL-01934 | po-eyes | — | Cluster K crosshair | Data/UI PO |
| TAL-01935 | owner-blocked | — | Cluster H indicator labels | Chart overlay owner |
| TAL-01936 | owner-blocked | — | Cluster I time alignment | `chart.js` owner |
| TAL-01938 | owner-blocked | — | Cluster H ORB size | Chart overlay / session calendar |
| TAL-01939 | fixed | `db849737f` | GREEN: harness `H-S18` + `H-S83` | Closure pass bucket (a) |
| Rayan #1 | fixed | `f127d25dd` | GREEN: `m23-rollback-trade-state.red.test.mjs` | Node-closed; PO Script 2 re-run against fix |
| Rayan #2 | needs-info | — | Cluster C multichart | Needs current-build repro before script |
| Rayan #3 | fixed | `f127d25dd` | GREEN: `m23-rollback-trade-state.red.test.mjs` | Node-closed; PO Script 2 re-run against fix |
| Rayan #4 | fixed | `b21d236d3`, `f1ddb2e64`, `2cc949399` | GREEN: allocator + `m24-order-id-restore-stability.test.mjs` | Node-closed; PO Script 1 re-run against fix (b103 class) |
| Rayan #5 | fixed | `b21d236d3`, `f1ddb2e64`, `2cc949399` | GREEN: allocator + restore stability | Node-closed; PO Script 1 re-run against fix |
| Rayan #6b | fixed | `f127d25dd` | GREEN: `m23-rollback-trade-state.red.test.mjs` | Node-closed; PO Script 2 re-run against fix |
| Rayan #7 | cosmetic-disclosed | — | Self-resolved settings/profile | Monitor-only |
| Rayan #9 | fixed | `b21d236d3`, `f1ddb2e64`, `2cc949399` | GREEN: allocator + restore stability | Node-closed; PO Script 1 re-run against fix |
| Rayan #10 | cosmetic-disclosed | — | Self-resolved monitor item | No product gate |
| Rayan #11 | fixed | `b21d236d3`, `f1ddb2e64`, `2cc949399` | GREEN: allocator + restore stability | Node-closed; PO Script 1 re-run against fix |
| TAL-01807b | fixed | `ab57a5dac` | GREEN: `order-pair-switch-visual-rebind.test.mjs` ± homepage; draft gate `order-pair-switch-draft-rebind.test.mjs` | Closure pass bucket (b); placed/pending visual rebind |
| PO value-box shaky | fixed | `2cc949399` | GREEN: `order-stable-label-hover-dom.test.mjs` ± homepage | Closure pass bucket (a) |
| PO hover one-by-one | fixed | `2cc949399` | GREEN: `order-stable-label-hover-dom.test.mjs` ± homepage | Closure pass bucket (a) |
| PO pending SL/TP resurrect | fixed | `2cc949399` | GREEN: `order-pending-protection-clear.test.mjs` ± homepage | TOP ACCEPT; redeploy before PO visual confirm |




## Closure pass status counts (2026-07-30 12:10)

| Status | Count |
| --- | --- |
| blocked-on-build | 6 |
| cosmetic-disclosed | 6 |
| fixed | 51 |
| needs-info | 17 |
| owner-blocked | 13 |
| po-eyes | 26 |
| superseded | 29 |

Bare `unverified` count: **0** (must be 0).
