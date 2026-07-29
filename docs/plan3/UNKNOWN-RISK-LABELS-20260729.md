# Unknown Row Canary Risk Labels — 2026-07-29

Scope: remaining `unknown` rows in `docs/plan3/TICKET-STATUS-LEDGER-20260729.md` after the evidence-only sweep on `manager-d/trade-correctness` rebased onto `manager-b/reconcile-d-20260729`.

Counts: 97 unknown rows remain. 47 are canary-blocking. 50 are cosmetic / non-blocking disclosure items.

Rule: this label does not mark a row fixed. A row still needs a commit and a gate to move to `fixed`.

## Canary-Blocking

- Cluster B / trade ledger: `TAL-01911`.
- Cluster C / multichart replay correctness: `TAL-01717`, `TAL-01733`, `TAL-01887`, `TAL-01910`, `TAL-01939`, `Rayan #2`.
- Cluster D / session navigation correctness: `TAL-01677`, `TAL-01732`, `TAL-01893`, `TAL-01909`, `TAL-01929`.
- Cluster E / refresh state isolation: `TAL-01759`.
- Cluster G/M6 order-drag and order-marker leftovers: `TAL-01696`, `TAL-01698`, `TAL-01617`, `TAL-01756`, `TAL-01653`, `TAL-01692`, `TAL-01658`, `TAL-01691`, `TAL-01805`, `TAL-01795`, `TAL-01780`, `TAL-01781`, `TAL-01789`, `TAL-01791`, `TAL-01760`.
- Cluster H / trading reference overlays: `TAL-01913`, `TAL-01938`.
- Cluster I / candle, timeframe, and price data integrity: `TAL-01802`, `TAL-01864`, `TAL-01886`, `TAL-01898`, `TAL-01917`, `TAL-01922`, `TAL-01925`, `TAL-01936`.
- Cluster J / runaway chart control: `TAL-01735`.
- Cluster L / replay execution semantics: `TAL-01718`, `TAL-01899`, `TAL-01900`, `TAL-01902`, `TAL-01931`.
- Cluster N / memory and idle stability: `TAL-01891`, `TAL-01892`.
- M10 residual trade-marker projection: `TAL-01796`.

## Cosmetic / Non-Blocking Disclosure

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
