# Open Row Disposition And Unverified Blast-Radius Order — 2026-07-29

Scope: every non-fixed row in `docs/plan3/TICKET-STATUS-LEDGER-20260729.md` after restoring the three ledger states: `fixed`, `broken`, `unverified`.

Counts: 41 fixed, 1 broken, 102 unverified. Zero rows remain `unknown`.

Rule: `broken` requires a RED gate or current-stamp PO failure. `unverified` means no evidence either way. A row still needs a commit and a gate to move to `fixed`.

## Broken

- M17-DI2 / completed-bar mutation: `M17-DI2 / TAL-01918`.

## Unverified Order 1 — Money Path / Trade State

These go first because a miss can alter order state, trade history, risk values, or trade-marker truth.

- M24 residual board member: `TAL-01940`.
- Cluster B / trade ledger: `TAL-01911`.
- Cluster G/M6 order-drag and order-marker leftovers: `TAL-01696`, `TAL-01698`, `TAL-01617`, `TAL-01756`, `TAL-01653`, `TAL-01692`, `TAL-01658`, `TAL-01691`, `TAL-01805`, `TAL-01795`, `TAL-01780`, `TAL-01781`, `TAL-01789`, `TAL-01791`, `TAL-01760`.
- M10 residual trade-marker projection: `TAL-01796`.

## Unverified Order 2 — Data Integrity / Wrong Chart State

These are second because a miss can put the user on the wrong symbol, wrong candle, wrong price, wrong timeframe, or stale validation gate.

- Symbol persistence: `TAL-01865`, `TAL-01747`.
- M20-A timezone sha pin: `M20-A timezone sha pin`.
- Cluster I / candle, timeframe, and price data integrity: `TAL-01802`, `TAL-01864`, `TAL-01886`, `TAL-01898`, `TAL-01917`, `TAL-01922`, `TAL-01925`, `TAL-01936`.

## Unverified Order 3 — Replay / Session / Stability

These are third because a miss can stop the dominant workflow, lose session position, or make the browser unusable.

- Cluster C / multichart replay correctness: `TAL-01717`, `TAL-01733`, `TAL-01887`, `TAL-01910`, `TAL-01939`, `Rayan #2`.
- Cluster D / session navigation correctness: `TAL-01677`, `TAL-01732`, `TAL-01893`, `TAL-01909`, `TAL-01929`.
- Cluster E / refresh state isolation: `TAL-01759`.
- Cluster L / replay execution semantics: `TAL-01718`, `TAL-01899`, `TAL-01900`, `TAL-01902`, `TAL-01931`.
- Cluster N / memory and idle stability: `TAL-01891`, `TAL-01892`.

## Unverified Order 4 — Trading Reference / Severe Interaction

These are fourth because a miss can mislead visual analysis or make the chart run away, but does not by itself prove order/history corruption.

- Cluster H / trading reference overlays: `TAL-01913`, `TAL-01938`.
- Cluster J / runaway chart control: `TAL-01735`.

## Unverified Order 5 — Visual / Cosmetic / Current-Surface Disclosure

These go last because the user mostly looks at them, they are old-surface reports, feature requests, scratched rows, or self-resolved monitors.

- Instrumentation-only row: `TAL-01941`.
- Cluster D / scratched or user-confusion navigation row: `TAL-01912`.
- Cluster H / labels and scratched settings-label row: `TAL-01894`, `TAL-01914`, `TAL-01921`, `TAL-01935`.
- Cluster J / zoom, scale, grid, news flag, and toolbar polish: `TAL-01724`, `TAL-01734`, `TAL-01755`, `TAL-01768`, `TAL-01821`, `TAL-01823`, `TAL-01838`, `TAL-01862`, `TAL-01916`, `TAL-01928`.
- Cluster K / crosshair label and setting behavior: `TAL-01700`, `TAL-01744`, `TAL-01934`.
- Cluster L / replay control polish and drawing lag: `TAL-01854`, `TAL-01923`.
- Cluster M / old-layout or stale-surface reports: `TAL-01688`, `TAL-01709`, `TAL-01719`, `TAL-01725`, `TAL-01726`, `TAL-01728`, `TAL-01736`, `TAL-01737`, `TAL-01739`, `TAL-01740`, `TAL-01743`, `TAL-01769`, `TAL-01799`, `TAL-01824`, `TAL-01831`, `TAL-01847`.
- Cluster O / feature requests: `TAL-01784`, `TAL-01814`, `TAL-01849`, `TAL-01850`, `TAL-01851`, `TAL-01852`, `TAL-01906`, `TAL-01907`, `TAL-01915`.
- Rayan monitor / self-resolved rows: `Rayan #7`, `Rayan #8`, `Rayan #10`.
- Recurrence watch: `TAL-01723`.
- Scratched intake row: `TAL-01920`.
