# Manager A — Critical Path · journal

Append-only. Corrections are **new entries**, never edits to old ones. Entry types: `OPEN`,
`DISPATCH`, `ASSUMPTION`, `VERDICT`, `PO-REQ`, `ANSWER`, `BLOCKED`, `CORRECTION`, `DECISION`.
Every `VERDICT` carries `surface=` and `coverage=`. Commit trailers: `Manager: A`, `Row:`,
`Packet:`, `Tier:`.

**Territory (exclusive write):** `chart v 1.4/chart/chart.js`,
`chart v 1.4/chart/modules/chart-data-pipeline.js`,
`chart v 1.4/chart/modules/replay-system.js`,
`chart v 1.4/chart/modules/indicator-performance.js`,
`chart v 1.4/chart/modules/chart-indicators-full.js`, every servable chart-shell HTML, and their
generated deploy mirrors under `homepage/public/chart/`.
**Deploy target:** TEST-1 only. **Not mine:** order/preference work (Manager B), verification
infrastructure (Manager C).

**Branch:** `manager-a/critical-path`, worktree `C:\Users\user\Desktop\talaria1\manager-a-critical-path`,
based on `634448817` (accepted loader/A4c packet head).

---

## 2026-07-27T23:50 · OPEN · territory accepted, queue registered

Read in full: `DIRECTOR-RULINGS-20260727.md` (including new §A4c, §A6, §A7, §A8, §A9, §A10, §A11,
§A12 and revised §A2/§A3), `FINDING-SESSION-CALENDAR-20260727.md`,
`FINDING-COMPLETED-BAR-CLOSE-MUTATION-20260727.md`, `PO-SWEEP-RESULTS-20260727.md`.

Queue as ordered by the work order:

| # | Row | Tier | State |
|---|---|---|---|
| 1 | Loader fix + §A4c presence assertions | 3 | committed, accepted, awaiting TEST-1 train |
| 2 | `_mcDiag.resamples` per-tick resample measurement | 2 (measurement) | dispatched |
| 3 | Session-calendar bucketing (canary blocker) | 3 | dispatched — RED first |
| 4 | Completed-bar immutability (canary blocker) | 3 | dispatched — unification investigated first |
| 5 | §A2 re-baseline, then surviving C3a shape | 3 | blocked on #2 by §A9.3 |
| 6 | Written answer: panel-side residency cap independence | — | dispatched |

Item 2 gates item 5 per §A9.3 ("measure before building"). Items 3 and 4 are both canary blockers
per §A3 and are investigated jointly per the work order, because the leading suspect in both is the
playhead trim writing into `ChartDataPipeline._resampleCache.result`.

---

## 2026-07-27T23:52 · ASSUMPTION · §Part 4 and §Part 6 are not in the workspace copy of the rulings

The dispatch cites "§Part 4" (model routing) and "§Part 6" (agent smoke sweep standard, referenced
from §A12.3). The workspace copy of `docs/plan3/DIRECTOR-RULINGS-20260727.md` contains Part A
(§A1–§A12) and Part B (§B1–§B6) only; there is no Part 4 or Part 6 in that file or elsewhere under
`docs/plan3/`.

Until those sections are available I operate on this reading, and will correct by new entry if the
text differs:

- **Model routing:** authors may run on mid tier; every independent review pass runs at top tier and
  is never downgraded; after two rejections of the same packet the next attempt and its review both
  run at top tier; no cheap-tier output is ever recorded as a verdict, an acceptance, or evidence.
- **Smoke sweep before any `PO-REQ`:** packet gates green, negative-control cell RED with the switch
  OFF, three repeats, one alternate-clock/host run, and a served-surface presence check on both host
  and panel.

Risk if wrong: a review could be run at the wrong tier. Mitigation: reviews are already pinned to
top tier, which is the conservative direction.

---

## 2026-07-27T23:54 · DECISION · no `PO-REQ` for D3 — it must be an assertion, not a PO reading

`PO-SWEEP-RESULTS-20260727.md` §D3 asks for 1H/4H/1D/1W price readings at one frozen playhead. Per
§A12.4 that is exactly the shape of request that "could have been an assertion," so emitting a
`PO-REQ` for it would be a defect in my gate system rather than a legitimate call on PO time.

Instead, the cross-timeframe agreement check is folded into the item 2/4 measurement harness: freeze
one playhead, read the containing bar's close on 1m/5m/15m/1H/4H/1D/1W from `chart.data`, and diff
against an independent clean full resample of `rawData` to the same playhead. That distinguishes the
two candidate causes the finding names — a few-pip divergence implicates the trim, a large
divergence implicates bucketing — without spending PO minutes. Outstanding `PO-REQ` count: **0**.

---

## 2026-07-28T00:05 · VERDICT · loader fix + §A4c presence enforcement — accepted locally, not yet verified on TEST-1

Packet head `634448817`, on this branch. Chain: `54edafa8a` (loader restored on the maintained design
source) → `90e0e0cf8` (module contracts, servable-shell inventory, build preflight, runtime ledger,
degraded telemetry/badge, bounded support passport, §A5 proof suite) → `d071c858f` (stale accidental
public shell removed per §A6) → `c52ab797b` (real Chromium host/panel execution proofs) →
`634448817` (canonical degraded-state token corrected to the exact Lane-5 consumer spelling).

Two independent reviews: security review found no medium-or-higher issues; the data-integrity review
BLOCKED twice and then ACCEPTED. Its first block was the wrong published token
(`__TALARIA_DEGRADED_STATE__`) versus the consumer's `window.__TALARIA_DEGRADED_STATE`, missing
servable-shell inventory coverage, and VM-only runtime proof. All three were closed; the suffixed
spelling is retained only as a compatibility alias, and an anti-drift test now reads the actual
consumer source so the two lanes cannot silently diverge again.

`surface=` maintained host shell + panel shell under local Chromium, build/CI preflight, module
contract manifest.
`coverage=` module presence, load order before `chart-indicators-full.js`, degraded-state
publication before order placement, withholding-RED negative control, and cross-window isolation are
verified on host and panel **locally**. NOT covered: the deployed TEST-1 surface (no train has run);
4-panel multichart saturation; and §A7 numeric/painted parity between `IndicatorPerf` and the
fallback implementations, which is Manager C's oracle (§A11.2 item 3) and until it lands
`IndicatorPerf` remains a correctness-class dependency per §A4c.

Remaining for this row: board the next TEST-1 train and prove the tripwire symbol assertion on the
deployed host and panel. Not blocked on anyone.

---

## 2026-07-28T00:07 · DISPATCH · four workers, all inside Manager A territory, each in its own worktree

Dispatched in parallel; none shares a worktree, so no two can dirty the same file.

1. **`_mcDiag.resamples` measurement** — branch `manager-a/mcdiag-resample-measurement`. Must return
   raw counts and tick counts (not ratios) for 1m vs 1H, with the M20-Q9 switch in both states, the
   per-resample output-bar count, and a direct measurement of whether the pipeline incremental branch
   fires at all during replay. Instructed to report CONFIRMED / EXCLUDED / UNDETERMINED and to state
   explicitly if its harness does not exercise the product replay path, because a false confirmation
   here would aim an architecture project at the wrong target. **Gates item 5 per §A9.3.**
2. **Non-destructive-trim unification design** — read-only. Must answer whether making
   `_trimLastDataBarToReplayPlayhead()` a render-time overlay instead of a mutation of
   `ChartDataPipeline._resampleCache.result` genuinely resolves both TAL-01918 and the per-tick cache
   drop, or only one. Required to enumerate every consumer that needs the truncated bar versus the
   full bucket — including the money-path execution-candle selection in `order-manager.js`, which is
   Manager B territory and must be flagged as a cross-territory dependency rather than edited.
3. **Session-calendar RED** — branch `manager-a/session-calendar-red`. RED oracle plus the shared
   DST-aware session-calendar helper, kill-switched, correctness class. Product wiring deliberately
   withheld until the oracle is reviewed. Fidelity requirement stated explicitly: the oracle must
   execute the real `_resampleDataFull` / `_tryIncrementalResample` / `parseTimeframe`, because a
   test that reimplements the bucket formula and compares it to itself is a lying gate under §A5.
4. **Residency-cap independence answer** — read-only, produces the written answer the Director asked
   for before C3a-full is scheduled.

Merge order into `manager-a/critical-path` is not yet fixed: workers 2 and 3 both land in
`chart.js` / `chart-data-pipeline.js`, so their packets serialize. Worker 2's report names the shared
functions, and I will set the order from it rather than guessing.

---

## 2026-07-28T00:09 · ASSUMPTION · session-calendar target semantics treated as decided, not open

I dispatched worker 3 with FX 17:00 America/New_York DST-aware daily anchoring, weekly anchored to
Sunday 17:00 ET, and the label convention "a bucket opening Sunday 17:00 ET is named Monday", as
fixed requirements rather than open design questions.

Basis: the work order states the convention explicitly, and
`FINDING-SESSION-CALENDAR-20260727.md` §"Fix shape" requires the same. The finding also flags a
migration question as needing a Director call — what is anchored to daily/weekly bar timestamps —
and that call has not been made. Consequence, stated now: worker 3 authors the RED and the helper,
but **flipping the boundary on real user data is not authorized by this entry**. Drawings, journal
entries and saved analysis anchored to bar timestamps shift when the boundary moves, and that is a
cross-territory effect reaching Manager B. I will not merge the product wiring to a deploy candidate
until the migration disposition exists.

---

## 2026-07-28T00:14 · CORRECTION · the governing documents are gitignored and do not propagate to worktrees

Correcting the operating assumption implicit in my dispatches. `.gitignore:24` ignores `docs/` wholesale.
`PLAN3-BOARD.md` and 55 other files under `docs/plan3/` are tracked only because they were force-added
at some point; ignore rules do not apply to already-tracked files, which is why the board looks normal
in `git status`.

Tonight's four governing documents — `DIRECTOR-RULINGS-20260727.md`,
`FINDING-SESSION-CALENDAR-20260727.md`, `FINDING-COMPLETED-BAR-CLOSE-MUTATION-20260727.md` and
`PO-SWEEP-RESULTS-20260727.md` — were never added, so they existed **only** in the main worktree's
working directory. A fresh worktree created from any branch contains none of them. I verified this
directly: all four `Test-Path` checks returned False in `manager-a-critical-path` immediately after
creation.

This is the same class as tonight's loader finding — capability loss without failure. Nothing errors;
a worker simply reads no rules and proceeds. It also explains the earlier incident where the rulings
document was reported absent from the workspace, all worktrees and all fetched origin refs, and it is
about to hit Managers B and C for exactly the same reason.

Action taken: the four documents are force-added on this branch alongside this journal, so every
worktree cut from `manager-a/critical-path` carries the rules that bind it. This is a propagation
fix, not a claim of ownership — the documents remain the Director's. Escalated to the Director in the
same breath, because the durable fix is either un-ignoring `docs/plan3/` or a Manager C tooling step
that materialises governing documents into every worktree; a per-manager copy is a workaround and
will drift.
