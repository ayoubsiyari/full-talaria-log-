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

---

## 2026-07-28T00:20 · ASSUMPTION · §A13 is not in the workspace copy either

`docs/plan3/DIRECTOR-RULINGS-20260727.md` in the workspace has no `A13` match. The section exists
only in the dispatch text I was given. This is the second recurrence tonight of the propagation defect
recorded at 00:14, and it now applies to the section that governs how I dispatch. I operate from the
dispatch text verbatim and will correct by new entry if the filed §A13 differs.

Operative rules I extracted, so they are checkable against the real text later:

1. I do not author. Decomposition, briefing, reservation, territory enforcement, review
   reconciliation, provenance, packaging, escalation. Read-only inspection to write a competent brief
   is permitted and is not authoring.
2. Default tier is composer / grok. Escalate only when an undetected error would be expensive **and**
   no automatic verifier catches it. Where a gate, oracle or tripwire converts a mistake into a
   rejected packet, stay cheap.
3. `gpt-5.5-medium-fast` or `claude-fable-5-thinking-medium` for implementing specced fixes and
   authoring tests/harnesses. `claude-opus-5-thinking-high` for adversarial review, architecture,
   root-cause triage of surprises, numeric correctness and tolerances, money-path and data-durability
   code, and any edit to `chart.js` shared paths.
4. There is no opus 4.7 and no substitute for it. `gpt-5.6-sol-low` is low reasoning effort — route on
   model-plus-effort, not version number.
5. Two rejections of a packet means re-authoring at top tier. No cheap-tier output enters the record
   as a classification, verdict or dossier fact.
6. Every packet gets a separate top-tier adversarial review subagent I did not author with, and I
   reconcile its findings. I am never the only judge of my own dispatched work.
7. Read-only subagents unlimited. Write subagents parallel only on disjoint file sets, never two on
   one file, and the partition is my accountability. Same-file work serialises. Cap of three write
   packets in flight.
8. Reserve every kill-switch, global, storage key, message name, oracle and fixture name before
   dispatch. A brief without an explicit writable file set is invalid.

---

## 2026-07-28T00:22 · CORRECTION · my five earlier dispatches predate §A13 and three were over-tiered

Stated plainly rather than quietly re-routed. The five workers now in flight were briefed before
§A13, at inherited top tier, and without an explicit writable file set in three of the five briefs.
Against §A13 as given:

- **Trim-overlay unification design** — correctly top tier (architecture + root-cause triage).
- **Residency-cap costing** — correctly top tier (architecture).
- **`_mcDiag.resamples` measurement** — defensible at top tier. It authors a harness, which §A13
  routes to `gpt-5.5-medium-fast`, but its *output is a classification that gates the entire C3a
  decision* and no verifier catches a wrong measurement, so the escalation trigger is met for the
  verdict even though the harness itself is cheap work. Recorded as a deliberate call, not an oversight.
- **Session-calendar RED** — over-tiered on the letter of §A13 (test authoring → `gpt-5.5-medium-fast`),
  though it also carries DST/numeric-correctness content that §A13 routes to opus. Mixed brief; I
  should have split the harness authoring from the boundary arithmetic.
- **§A10 control inventory** — clearly over-tiered. Mechanical enumeration with a diff as its own
  verifier; composer or grok was the correct route.

Not cancelling and re-dispatching: the wasted spend is already committed and restarting costs more
than it recovers. From here every brief states tier and the reason for that tier, and the writable
file set is mandatory. The freeze-triage brief dispatched at 00:19 is the first written to §A13 form
and carries `writable file set: NONE`.

---

## 2026-07-28T00:24 · DECISION · write-packet cap is full at three; partition is enforced by worktree, not by trust

In flight: three write packets (`mcdiag-resample-measurement`, `session-calendar-red`,
`shell-control-inventory`) and three read-only workers (trim-overlay design, residency-cap costing,
freeze triage). That is exactly the §A13 cap, so **no further write packet is dispatched until one
lands**. Read-only work continues uncapped, which is why the freeze triage went out read-only rather
than as an implementation packet.

The partition is physical, not conventional: every write packet has its own git worktree and its own
branch, so two subagents cannot hold the same file open even if their briefs overlap. Overlap
therefore surfaces at *merge* time, where I control the order, rather than as corruption.

One real overlap exists and is now owned: `scripts/module-contracts.json`. The session-calendar packet
must register its new module's §A4c contract there, and the control-inventory packet was briefed to
read the servable-shell inventory that the same file references. Ownership is assigned to
session-calendar; any change to that file in the control-inventory worktree is dropped in
reconciliation. Recorded in `MANAGER-A-RESERVATIONS.md` rather than left to merge-time judgement.

Names are now reserved up front in `MANAGER-A-RESERVATIONS.md`, including the session-calendar
kill-switch `__TALARIA_DISABLE_SESSION_CALENDAR_V1`, the trim-overlay switch
`__TALARIA_DISABLE_RENDER_TIME_PLAYHEAD_TRIM_V1`, the `SessionCalendar` global, both oracle
filenames, the fixture prefix, and `_mcDiag.incrementalResamples`. Two of those were dispatched before
the registry existed, so the workers chose their own names; reconciliation renames to the reserved
name rather than the registry bending to whatever was authored.

---

## 2026-07-28T00:26 · DECISION · adversarial review is a standing step, not a per-packet choice

Per §A13, each of the five write/design packets gets its own top-tier adversarial review subagent that
did not author the work, and I reconcile rather than ratify. Reviews are dispatched on packet
completion, not now, so the reviewer reads finished artefacts instead of a moving target.

This composes with the two-rejection rule: a packet rejected twice is re-authored at top tier
regardless of its original routing, which is what happened tonight to the Lane-5 degraded-audit packet
before it reached my territory. I keep the rejection count per packet in this journal so the trigger
cannot be lost between turns.

---

## 2026-07-28T00:40 · VERDICT · per-tick full resample CONFIRMED, and §A9''s named gate is degenerate

Packet `mcdiag-resample-measurement`, commit `3e1fdc05e`, worktree `manager-a-mcdiag`. Counters only,
mirrored byte-identically into `homepage/public/chart/`; `replay-system.js` untouched;
`m20-q9-prefix-slice.test.mjs` 19/19 after the edits. Adversarial review is dispatched and **not yet
returned**, so this verdict is provisional until reconciled.

Measured on the real product tick entry point, 300 ticks, 3 repeats, counts identical across repeats:

| cell | replayTicks | fullResamples | incrementalResamples |
|---|---|---|---|
| 1m fix ON / fix OFF | 300 / 300 | 300 / 300 | 0 / 0 |
| 1H fix ON / fix OFF | 300 / 300 | 300 / 300 | 0 / 0 |
| 1m or 1H, + one render frame | 300 | 600 | 0 |
| control, cache drop neutralised | 300 | 0 | **300** |
| control, neutralised + render frame | 300 | 600 | **0** |

`_tryIncrementalResample` was **called zero times** in every product cell — never attempted, not
merely failing. The controls prove the incremental counter can register, so the zeros are real absence
rather than a dead instrument.

`surface=` Node `vm` over the unmodified `chart.js`, `replay-system.js` and `chart-data-pipeline.js`,
driving the real `ReplaySystem.prototype.updateChartData`.
`coverage=` single chart, one panel, no indicators, no open trades, no browser run, fast mode not
driven, render frames modelled at one per tick, `syncPanelCharts` stubbed. **This does not close the
§A9 memory row and must not be cited as if it did.** Panel scaling is unmeasured; the product installs
a prefix per panel, so do not assume the count is panel-independent.

**Two corrections to the record.**

1. **§A9.3 names `_mcDiag.resamples` as the gating instrument. That field cannot gate anything.** It is
   not merely inverted as I reported at 00:20 — it is degenerate. Measured, it reads exactly 2.00 per
   tick at 0, 1 and 2 real full resamples per tick, because `resampleData()` increments even when the
   pipeline then serves the request incrementally, while `_resampleDataFull` reached via the
   pipeline-internal caller is not counted at all. Three different ground truths, one identical
   reading. The corrected instrument is three separate counters, now landed.
2. **The M20-Q9 cache drop is sufficient but NOT necessary.** A second independent mechanism defeats
   incrementality: the pipeline holds one cache slot, and the tick path writes it with
   `chart.rawData` while the render path writes it with `chart.data`, so each evicts the other every
   frame. Neutralising the cache drop and adding one render frame still gives 0 incremental hits and
   2.0 full resamples per tick. **Making the playhead trim non-destructive therefore does not, on its
   own, restore incrementality on a render-active product.** Named per §A4b.4 as
   *single-slot resample cache contention between the tick path and the render path*; it needs its own
   cross-linked row rather than an assertion inside the TAL-01918 row.

---

## 2026-07-28T00:44 · VERDICT · the unification splits, and TAL-01918 needs three changes not one

Design report from the read-only trim-overlay investigation, revised after the measurement landed.
Adversarial review of its de-scoping claims is dispatched and **not yet returned**; provisional.

`surface=` static source analysis of `chart.js`, `replay-system.js`, `chart-data-pipeline.js`,
`chart-indicators-full.js`, `compare-overlay.js`, `panel-cmd-bridge.js`, plus `order-manager.js`
read-only as Manager B territory.
`coverage=` source reasoning only; no execution, no browser, no multichart cell.

- **Does the overlay fix TAL-01918?** Partially. It closes S1 (the `this.data[lastIdx]` write) and
  neutralises the shared last-bucket object carried through `prevResampled.slice()`. It does **not**
  close the ticket: S3 corrupts the resample *input* — the synthetic `animatedCandle` is pushed onto
  the sliced raw array before any overlay is consulted, so an interpolated close is already inside a
  finalising coarse bucket — and S4''s four in-place mark writers survive, one of which sits in
  `panel-cmd-bridge.js`. Three changes, not one.
- **Does the overlay restore incrementality?** No. Corroborates the measurement independently.
- **The obvious second fix is the wrong one.** Giving the render path its own cache slot doubles
  retention (a second full-length bucketed array retained for the life of the chart, and on 1m
  display that is a second copy of the whole series) and removes no work. A source-keyed `WeakMap` is
  worse, because the live keys are long-lived and multiply per panel. The correct fix is to delete the
  render-path resample: `buildDisplaySeries` re-resamples `chart.data`, a series already produced by
  resampling at the same timeframe, so an O(1) identity guard returns it unchanged. Zero added
  retention, one of the two per-tick resamples gone, and the slot contention disappears because only
  one source ever writes it. Safety was argued consumer-by-consumer; the load-bearing premise is
  **bucketer idempotence**, which is a values-level claim, so it is an §A7 oracle item and must be
  re-proven under the session calendar rather than assumed.
- **Two changes do not reach O(1).** Two full-length array copies per tick remain —
  `prevResampled.slice()` in the incremental branch, and the copy-on-write overlay itself. Object
  churn drops to near zero, which is the real win, but frame time improves far less than "restored
  incrementality" implies. Reaching O(1) needs in-place append plus a patch-shaped rather than
  array-shaped overlay, and that depends on an unverified premise: that every active indicator family
  routes through the bounded tail path rather than recomputing full series per tick.

**Pricing.** (a) TAL-01918 correctness alone: 6 / 8–11 / 16 days. (b) (a) plus the render-path
identity guard: 7.5 / 10–13 / 19 — a marginal ~1.5–2.5 days that deletes one of the two measured
per-tick resamples, the best value-per-day in the set. (c) full set that actually restores incremental
per-tick work: 13 / 16–21 / 30.

**Decision:** (b) boards as one Tier-3 packet with two independent kill-switches, the guard enabled
only after the immutability oracle is green, because splitting it would build the same oracle twice.
(c) does not board — it is an architectural row and §A9.3 requires it be measured against C3a before
commitment.

---

## 2026-07-28T00:48 · ANSWER · panel-side residency cap — the Director''s written question

**No, and the framing should be re-scoped.** Three findings, in descending order of force.
Adversarial review dispatched; provisional.

1. **The panel side is already capped; the host side is not.** Embed panels are bounded at 2,000 raw
   bars, while the host in backtest is reported to reach up to 100,000 via the high-limit bulk history
   path, which explicitly excludes embed panels. A *panel-side* cap is therefore close to a no-op on
   mixed-4, and the residency lever is host-side — where a documented global already exists, making it
   a dial to turn and measure rather than a project to build. **Caveat, and it is material:** a second
   analysis reports the same backtest replay path bounded at ~5,000 bars by the pipeline raw cap.
   Those two claims cannot both be unqualifiedly true, and I have a top-tier verifier resolving the
   contradiction before either number enters a dossier.
2. **The two named modules are not usable components.** Both `visible-window-mirror.mjs` and
   `reusable-buffer-pool.mjs` carry headers marking them REFERENCE / TEST-ONLY with explicit
   instructions not to wire them into product runtime, and have zero product importers. The pool is
   genuinely working code; the mirror is a render/transfer mirror that reads an already-resident array
   of bar objects and writes a Float64 copy, so wiring it **adds** a visible-window copy per panel
   rather than reducing residency. §A1''s "not greenfield, already exist in-tree" is true of the files
   and not of the capability.
3. **Bar residency is not where the gigabytes are.** Modelled at ~120 B per bar object plus a
   same-length resampled copy, a host cap from 100k to ~5k saves on the order of 20–25 MB retained
   against a 2.5–2.7 GB mixed-4 working set — under 1%. That arithmetic is under adversarial review
   precisely because the conclusion rests on it.

Correctness floor a cap must respect, which is why it cannot simply be sized to the viewport: generic
indicator warm-up up to 5,000 bars; the weekly-map indicator needs ~36 weeks of 1h bars and cannot be
served by a 1m residency cap at all, so it would need a coarse-TF side store; the replay playhead
prefix from the session floor; and every bar referenced by a live drawing anchor, open-trade entry or
anchored-volume-profile anchor. That last one is the dangerous case — anchored VP clamps its range
silently and returns a *smaller total volume* when the anchor falls outside the resident window, which
is §A4c''s capability-loss-without-failure class in a money-adjacent display path.

**Cost if built anyway:** 7 / 11.5 / 20 engineering days, and it cannot run in parallel with the
session-calendar and completed-bar-immutability packets because all three land in the same three
files. It would also be built on a premise the immutability packet is about to change.

**Recommendation:** do not build it. Instead re-scope the row from panel-side to host-side and treat
it as a measurement. Confidence high, contingent on the 5,000-versus-100,000 reconciliation.

---

## 2026-07-28T00:52 · CORRECTION · a filed dossier claim is wrong and must be amended

`PO-SWEEP-RESULTS-20260727.md` states, in the leading-hypothesis section, that *"per-tick cost scales
with total history, not with the one new bar — so sustained replay burns CPU proportional to dataset
size,"* and derives from it that 1m is the worst case by a factor reflecting the 59× output-bar ratio.

Both derivations are contradicted by measurement and source:

- Per-tick resample cost is **bounded**, not proportional to dataset size, if the pipeline raw cap
  applies on the replay path — the pending verification above. Measured counts were identical at 3,000
  and 4,751 bars: only the cost of each resample varies, not the number of them.
- The 1m-versus-1H ratio is **~1.97×, not 59×**. `_resampleDataFull` allocates one prepared object per
  *raw* bar and sorts them, and that cost is identical on both timeframes; only the output-bar count
  differs. So a change that reduces only output bars leaves a floor on 1m and barely helps 1H.

Consequence, and it is the important one: **this mechanism cannot be the dominant term in Rayan''s
3.5 GB single-layout 1m report.** The per-tick resample is real, worth fixing, and not the memory
story. The 1m single-layout memory term remains **unattributed**, which means C3a is still aimed at an
unmeasured target — exactly the misdiagnosis §A9.3 was written to prevent. The freeze-triage worker is
still running and is the current best hope of naming it.

I am not editing the finding myself; it is not my document. Escalated to the Director as an amendment
request with the measured numbers attached.

## 2026-07-30T11:52 · ACCEPTED · MC-CLONE-CUT — the 75% allocator is cut, and the author''s suite missed a real regression

`manager-a/mc-clone-cut-20260730` @ **8b6c90554** = 65164a11a (author, product) + d52d1d8b4 + 8b6c90554 (both MINE, test-only).
Based on the LIVE tip e675e5d1b, so it cherry-picks independently and does NOT ride with the P0 branch.

**The cut.** `_mcCopySamePairFullRawData(source, slotKey)` now copies once per destination slot and appends only
the new tail. Falls back to a full clone on: different source identity, source shorter, boundary-timestamp
mismatch, no slot key, or source above the 200k cap. Detachment preserved — every bar in the result is built by
`_mcScalarCloneRawBar`, so this is NOT the aliasing flag. Flag `__TALARIA_DISABLE_MC_INCREMENTAL_RAWDATA_COPY_V1`,
truthy semantics; the pre-existing `__TALARIA_DISABLE_MC_RAWDATA_COPY_V1` still takes precedence.
Removes 99.13% of cloned bar objects per destination (8,170,290 -> 71,103 over a simulated 30s).

**VERIFIED BY ME, not taken on report.** Clean tree, exactly one product commit, zero off-limits paths,
mirrors byte-identical EFB77272F367E576, flags 1/1 in both copies, bogus-flag control 0.
Ran EIGHT of my own mutants on disk in both mirrors, needle==1 enforced, negative control correctly NOT_APPLIED,
files restored to baseline sha. All killed by NAMED BEHAVIOURAL cells, none anchor-only.

**I ALSO READ THE CODE RATHER THAN THE TESTS, because the failure mode here is silent data corruption.**
The fast path returns the SAME array object every call, so the whole design rests on nobody mutating it
externally. Cleared with positive controls (50 `.push|splice` sites in replay-system.js prove the grep shape works):
`_mergeIntoPanelFullRawData` REASSIGNS (chart.js:7014/:7026), never mutates; `_installPlayheadPrefix` builds a
separate WeakMap-keyed buffer and only READS master. So the `out.length === cache.sourceLength` invariant holds.
It is not ENFORCED in code, though — see ROW below.
Also confirmed the append loop uses the identical malformed-bar filter as `_mcCloneRawDataBars`, so it cannot
diverge from legacy, and the >200k fallback is correct because a tail-append can never drop a sliding-window head.

**CAUGHT A REGRESSION THE AUTHOR DID NOT RUN INTO — leak-d, 8/0 -> 4/4.**
`leak-d-rawdata-copy.test.mjs` covers the exact function the cut rewrote and the author never ran it.
Classified properly instead of guessing: green at the parent e675e5d1b, red after the cut = genuine regression.
Cause was NOT behaviour: `TypeError: this._mcIncrementalRawDataCopyDisabled is not a function`. The harness
extracts a FIXED method list, so new collaborators break it — the EXTRACTION-LIST TRAP already on my board from
cover-loop-safety. Plus three mutants anchored on source text the cut rewrote. Repaired in 8b6c90554: six methods
+ Map into the vm context, three mutants re-anchored. **All nine leak-d mutants still killed**, including
`same-pair-helper-returns-alias`, `viewport-panel-site-aliased` and `sync-from-parent-master-site-aliased` — so
the aliasing teeth were RESTORED, not relaxed to make the suite pass. That is independent confirmation from a
suite I did not write that the cut preserves detachment at those call sites.

**SWEPT ALL 117 module suites rather than assuming leak-d was the only casualty.** 14 red — every one of them
red at the parent with IDENTICAL pass/fail counts, so all 14 are pre-existing debt on the live tip and leak-d was
the only regression. (Separately notable: the tip carries 14 red module suites, incl. p3-bar-store-realm 15/1
which I had already reported.)

**CLOSED MY OWN B7 SURVIVOR rather than filing it.** Deleting the over-200k-cap fallback left the author''s suite
fully green — the guard shipped untested, the fifth sighting today of the untested-branch/anchor family. Added a
behavioural cell driving a source past an overridden limit plus a matching `drop-over-limit-fallback` mutant;
suite 10 -> 11 cells and B7 now dies. Hit the cross-realm prototype trap doing it: the harness returns vm-context
arrays that fail `assert/strict` deep equality with identical-looking values — `Array.from` rebuilds in-realm.

**THE WIN IS REAL BUT NOT YET MEASURED LIVE, and I will not overstate it.** The fast path only pays off if the
SOURCE array identity is stable across ticks; if the host churned it the win would be ZERO and the simulation
would still look perfect. Checked in source: `this.fullRawData` is assigned only at init and replay start/reset
(replay-system.js:183/:2723/:3449), never per tick, and the host `_panelFullRawData` writers are all fetch/merge
paths. So identity is stable in steady-state playback and the fast path genuinely hits. That is a static argument,
not a measurement — the honest number still requires re-reading the allocation profile with the cut deployed,
which is already queued.

ROUTING unchanged and still deliberately NOT stacked: (1) ship-b105-countdown-tf @ 684e3e5cb, the P0 STILL LIVE
after b105/b106/b107; (2) cpu-cuts-b105 @ 612602877; (3) residency @ 9e0a8ad59; (4) this.

ROWS:
- The `out.length === cache.sourceLength` invariant is guaranteed today only by the ABSENCE of external mutators,
  which I verified — it is not enforced. Any future in-place trim of `_panelFullRawData` or `replay.fullRawData`
  silently corrupts the append offset and renders a continuous series across a hidden hole. A one-line length
  check would convert that into a full-clone fallback. Cheap insurance, not needed today.
- The cache retains a cross-realm ref to the host''s array. Adds no NEW class of retention (the same function
  already aliases `parent.rawData`/`parent.data`), and dies with the panel chart, but it is now explicit.
- `_reseedReplayFullRawFromLoadedData` remains queued as the next allocator; re-read the profile after this lands
  rather than assuming the 75% converts 1:1.


## 2026-07-30T12:30 · RULING 12:10 · four packets out, residency killed, and W91 re-aims the rest

Read the ruling (67df8a5c9, director worktree). KILL-02 accepted: nothing retires without a number.

**W91 LANDED AFTER THE RULING WAS WRITTEN AND CHANGES ITEMS 2, 4, 5 AND 6.** C''s CPU-PROCESS-CENSUS-V1
(adcce4bee): at four panels the renderer''s off-thread majority is **V8 background GC at 73.2% of a core**,
scavenger-dominated — young-generation collection, i.e. enormous numbers of SHORT-LIVED objects.
Raster is ABSENT from the renderer entirely, compositor 3.0%, GPU-main 5.0%, and
`LocalFrameView::performLayout` is 140.6 ms of ~9,800 ms busy = **1.4% of the main thread**.
C corrects its own W74/W78 raster attribution. Consequence: **allocation rate is a CPU defect as well as a
memory one**, and DOM/canvas work is not the lever.

Three things follow, and I am stating them rather than quietly re-scoping:
- **CUT 4, CANVAS PROMOTION, IS NOW DEAD WITH A NUMBER.** I recorded a disagreement rather than a refusal
  on 30 Jul: promotion pays for UNCHANGED content, our canvas is fully repainted every frame, so the cost
  is the drawing not the compositing. C''s census settles it — raster absent, compositing 3%. That is the
  measurement I said I would take. It should get a death-certificate row.
- **My allocation work is the main line, not a side quest.** The clone cut and the reseed cut target
  exactly the short-lived-object rate the census names.
- **The DOM cuts (item 2) are RETENTION fixes, not CPU fixes.** I have told both authors so and told the
  glow-filter author to expect ~0 on the paint measurement the advisor''s raster framing implies.

**DISPATCHED, tier=MID, writable sets disjoint per PAR-01, all four on their own worktrees:**
1. RESEED-CUT — `_reseedReplayFullRawFromLoadedData` (chart.js:6490), branch manager-a/reseed-cut-20260730
   off the clone-cut head 8b6c90554. Same incremental+flagged shape. I named the hazards: the destination
   identity check is MANDATORY because replay-system.js:2723/:3449 externally replace `fullRawData`; only
   the array copy may be optimised (the currentIndex re-sync and the tickPathCache resets must survive);
   `this.data` churns identity per tick so `fullData` will mostly fall back and must not be forced.
2. LABELTOOL handle growth — local to LabelTool by preference; shared `_clearGeometryChildren` may only be
   touched if every dependent tool is named (the name-the-dependent rule).
3. ORDER GLOW `<filter>` defs — dedupe on create + remove on teardown; must name what references a filter
   before removing it.
4. POINTER-SWEEP profile — read-only, product bytes byte-identical, positive control mandatory.

**ITEM 3 — RESIDENCY IS DEAD, and I killed my own packet.** ANSWER doc committed. Two empty branches:
during replay `_applyResidencyWindowV1` returns false at chart.js:9044-9045 (single caller at :10893 whose
own comment says so); outside replay C measured 2,011 resident of 6,097,452, so windowing already did it.
And it is aimed at the wrong array regardless — inside the whole residency block `_panelFullRawData` = 0
and `fullRawData` = 0 against a control of 17 `this.rawData`. It cannot reach the 70,989-bar master.
Remove from every plan document. The RAW-MASTER-during-replay trim is real, harder, and unowned — named,
not promised, because the replay guard protects scroll-back and indicator history.

**A DEATH CERTIFICATE IN THE RULING IS WRONG, and it is the same array confusion.** The columnar row prices
"2,011 bars resident of 6.1M; ~465 KB". W89 states its gauge as `chart.data.length` — the RESAMPLED DISPLAY
SERIES. The raw master I measured on the deployed build is 70,989 bars = ~16.4 MB/realm, ~66 MB at four.
The certificate understates resident bar mass ~35x. **I am NOT asking to reopen columnar** — the PO scaling
test (heap 1.52x across 100–1000x data) is the real killer and is untouched. Right conclusion, wrong number;
please amend the row to cite the scaling test. STANDING: "resident bars" is ambiguous here by 35x — any bar
count must name the ARRAY.

**ITEM 4 — the writer is already named and already cut.** `ensureTalariaIndLegendHoverCss`
indicator-ui.js:2621-2624 reassigns `<style>.textContent` per indicator pass, forcing a rule-set re-parse at
~62/sec. Fix built and verified at 612602877 (1 write vs 60). The 15:00 fallback — 35 `setProperty` sites
behind one flag — is unnecessary and aimed at an already-identified writer. What is owed is the A/B, not a
new cut. Predicted SMALL given W91''s 1.4% layout figure; recorded in advance.

**ITEM 7 — I OWN IT.** p3-bar-store-realm''s failing cell is "P3 mutants: neutered guards are killed by the
realm/refcount oracles" — the cell whose job is to prove the suite has teeth, so the P3 guards are
UNVERIFIED rather than broken. Bar-store realm guards are chart.js, which is mine; I am not routing it away.
Queued behind the four packets, test-only.

**ITEM 6 — re-baseline is right and I will not size the remaining cuts until the clone cut is deployed and
the profile is re-read.** Sizing against a superseded ceiling is how we got here.


## 2026-07-30T12:52 · ACCEPTED · LABELTOOL-HANDLE-GROWTH — and the author was right to refuse my instruction

`manager-a/labeltool-handles-20260730` @ **1cfcc08f5** = da5326655 (author, product) + 1cfcc08f5 (MINE, test-only),
based on the live tip e675e5d1b. Clean tree, one product commit, writable set respected,
mirrors byte-identical 688917F09B434838, flag 1/1 both copies, bogus control 0.

**THE NUMBER (KILL-02): +3 DOM nodes per reuse-render, exactly.** 6 nodes after 1 render, 153 after 50 with
the switch on; flat at 6 with the fix. Stranded `.resize-handle-group` count after 50 renders: 50 legacy, 1 fixed.

**I MUST CORRECT MY OWN ROW.** I recorded this as "~2,250 nodes/min per Label drawing during replay". The
author verified +3/render and REFUSED to endorse the per-minute figure, correctly: 2,250/min implies ~12.5
renders/sec, and the replay cadence comes from `getCandlePlaybackCadence()` and varies with user-selected
speed. So the rate is SPEED-DEPENDENT, not a constant. +3/render is the verified quantity; my per-minute
number was an unmeasured extrapolation and should not be quoted. Also, per W91 this is a RETENTION fix and
carries no CPU claim — layout is 1.4% of the main thread.

**THE AUTHOR DECLINED MY DESIGN AND WAS RIGHT.** I briefed wipe-and-reappend. It reused the preserved group
in place instead, because a recreated handle would be stranded: during an active resize the manager sets
`_skipHandleSetup = true` (manager :1087/:5931/:10815) which suppresses the `setupHandleDrag` rebind at
:8867, and the hover-bind path caches `_hoverHandleBoundGroupNode` keyed on the drawing group node
(:17082-17088), so for an unselected-but-hovered label a recreated handle would never be rebound at all.
Keeping node identity makes both moot. This is the behaviour I want from authors: refuse with evidence.

**IT ALSO FOUND A HAZARD MY BRIEF MISSED, which would have shipped silently.** `_clearGeometryChildren`
removes non-handle children and `render()` then re-appends the marker circle AFTER the preserved handle, so
the reused handle becomes the FIRST child, painted under a marker that has `pointer-events: all` — every
handle click would have been swallowed. Fixed with `handleGroup.raise()`. I positive-controlled that this is
the established idiom, not an invention: 6 `.raise()` sites across shapes+base, and base:2434 is literally
`this.group.selectAll('.resize-handle-group').raise()`.

**VERIFIED MYSELF, not taken on report:**
- Attribute-drift check, the likeliest silent bug in a reuse-in-place fix: every field the sync path skips
  (`r`, `fill`, `stroke`, `stroke-width`, `pointer-events`, `cursor`, class) is a CONSTANT; it refreshes
  exactly the state-dependent ones (cx, cy, both opacities, data-point-index) and matches `.attr` vs `.style`
  per property against the append path. No drift.
- `'label'` is absent from `_supportsLiveHandleGeometryPatch` (manager :1038-1043), so the new
  `_shouldCreateHandles` branch cannot strip a handle mid-resize. Author's claim confirmed.
- For a LOCKED label the new code now removes handles where legacy appended them. Behaviour change, and the
  correct one — it aligns LabelTool with every sibling and a locked drawing must not be resizable.
- SIX of my own mutants on disk in both mirrors, needle==1, negative control NOT_APPLIED, files restored.
  All killed by NAMED BEHAVIOURAL cells: drop-raise, STALE-HANDLE-POSITION (the reuse-specific bug),
  `=== true` polarity, drop-residue-collapse, drop-the-guard, reuse-malformed-group.
- Ran the two gates that would block B: sync-homepage-modules 2/2, territory-preflight 72/72.
- Regression duty: author ran drawing-tools suites pre- and post-edit and got the IDENTICAL 7 failing cells;
  all pre-existing, none in files it touched.

**CLOSED ANOTHER UNTESTED GUARD — sixth sighting today of the anchor/teeth family.** My mutant L6 survived:
deleting `if (glow.empty() || handle.empty()) return false;` left the suite green, so a preserved group
stripped of its circles would be reused and the label would keep a handle group with nothing clickable in it
— resize dead, silently. Unreachable today (`_isHandleNode`'s regex at base:973 preserves both circles too),
which is exactly why a reader's confidence is not enough. Added a behavioural cell; suite 26 -> 27 and L6
now dies. Same disposition as B7 on the clone cut: pin it, do not file it.

ROW (cosmetic, for B): the new test file exists only at the canonical path. That matches existing practice
(leak-d and mc-incremental are canonical-only too) and both mirror gates are green, so it is not a blocker.


---

## 2026-07-30 12:45Z - RESEED-CUT ACCEPTED 8587c9821 (allocation site #2 of the playback profile)

`manager-a/reseed-cut-20260730` @ `8587c9821`, one commit on `8b6c90554`. Tree clean, packet is exactly
3 paths (both chart.js mirrors + one new test file), zero off-set paths, mirrors identical
`951888C3CCA084D3`, flag `__TALARIA_DISABLE_REPLAY_RESEED_INCREMENTAL_V1` 2/2 in both copies, bogus-flag
control 0/0. Suite 16/16. Author ran 20 mutants on disk in both mirrors; negative control loud.

**THE NUMBER, and it is measured not modelled:** 30 reseeds against the 70,989-bar master with a new bar
before EVERY call (worst case, no free no-change calls). Legacy 2,129,235 element copies; incremental
71,048. 30.0x fewer, 96.7% of copies removed. Counted by handing the method a Proxy over the seed array
and counting numeric-index reads, so "appends only the tail" is OBSERVED, not asserted about source text.

**SEVEN OF MY OWN MUTANTS, independent of the author's 20**, on disk in both mirrors, needle==1 enforced,
negative control NOT_APPLIED, both files restored to `951888C3CCA084D3` after every one. ALL KILLED, every
one by a NAMED BEHAVIOURAL cell: R1 drop-destination-identity (the hazard I made mandatory) -> "destination
replaced externally forces a full copy"; R2 drop-seed-source-identity; R3 drop-shrink-check; R4
drop-boundary-timestamp (6 cells); R5 `=== true` polarity (6 cells); R7 do-not-advance-cached-length.

R6 alias-instead-of-copy is a kill of a different KIND and worth recording: it does not fail an assertion,
it HANGS the suite. Aliasing makes `out === seedSource`, so `out.push(seedSource[i])` pushes onto the array
it is iterating and the loop never terminates. I killed the run and restored by hand. Useful property, not
a gap: the aliasing hazard CANNOT ship silently - it would wedge the tab, not corrupt data quietly.

**MY BRIEF WAS WRONG AND THE AUTHOR WAS RIGHT: TEN call sites, not nine.** Counted dot-prefixed
invocations excluding the definition: chart.js 6328/6941/7608/7896/8056/11183/11227/11534 = eight, plus
`panel-cmd-bridge.js:630` and `embed-bridge.js:1106`. The two I missed are the BRIDGE entry points, i.e.
the cross-realm ones, which is the worst pair to undercount on a packet about per-realm copying.

**WHY THIS PAYS IS NOT WHAT I WROTE IN THE BRIEF, and the correction matters for routing.** I framed
tail-append as the primary win. In fact both seed sources are always REPLACED on growth, so tail-append
would be unreachable - except the sibling clone cut made it reachable: chart.js:4584/5523/7496 now assign
`_panelFullRawData = this._mcCopySamePairFullRawData(...)`, and that helper returns its own retained array
mutated in place. **This fix pays BECAUSE the clone cut shipped first.** On paths where the source is
genuinely replaced it costs legacy plus one extra index read.

ROUTING CONSEQUENCE, and it is a trap: `mc-clone-cut` IS an ancestor of `reseed-cut` (merge-base
`8b6c90554`), so the dependency is structural on the MERGE path. It is NOT protected on the CHERRY-PICK
path. If reseed is cherry-picked alone onto a ship head that lacks the clone cut, it is inert - green
suite, zero win, and nothing would say so. Clone cut travels first or they travel together.

**SIZING - the author refused to put one number on it and was right to.** It removes ~97% of the
`fullRawData` line. The site is 995 MB with cloning off; `seedSource` is the full ~71k 1m master while
`this.data` is sliced to the playhead and resampled (5-15x fewer bars above 1m), so the fullRawData line
should dominate at plausibly 50-90%. Exact needs a PER-LINE allocation split. I hold the profile, so that
ask is mine, not an open request to nobody.

RESIDUAL, measured and disclosed rather than papered over: `replay.fullData` stays legacy. `this.data` is
reassigned from `resampleData(...)` on essentially every tick (nine assignment sites in replay-system.js),
so identity churns - the `display-series-cannot-pay` cell measures **0/60 retained against the master's
59/60**. Two mutants pin that it still copies and still copies DEFENSIVELY. The honest fix there is to stop
copying a freshly-allocated array at all, which is a semantic change to who owns `this.data`: separate packet.

**SEVENTH SIGHTING of the anchor/teeth family, and I am correcting the author's severity DOWNWARD.** The
author reports it dodged a landmine: `mc-incremental-rawdata-copy.test.mjs` anchors four mutants on
single-line needles any faithful parallel implementation would reproduce verbatim
(`&& cache.source === source`, `cache.sourceLength = source.length;`,
`for (let i = prevLen; i < source.length; i += 1) {`, `return slotKey == null ? null : String(slotKey);`).
It avoided the collision by naming its parameter `seedSource` and fields `seedLength`/`copy`. I verified
the near-miss is real: all four are count=1 today, and the reseed impl's parallel lines are each count=1
alongside them - had it used the obvious names, all four go to 2.

But the author implied those rows would be silently skipped. **They would not - it FAILS LOUD.** The runner
does `assert.deepEqual(notApplied, [], 'all mutants must apply to both mirrors exactly once')`, so a
collision turns the suite RED. That is the NOT_APPLIED guard I added after the fabricated M3 escape, working
exactly as designed. So this is fail-safe BRITTLENESS, not a teeth gap. The real risk is second-order and
human: whoever hits that red is being told "your naming collided", and the tempting fix is to delete or
loosen the mutant rather than re-anchor it. That is how teeth actually get pulled.

Deliberately NOT fixing it tonight. The collision is not live (all four count=1), the failure mode is loud,
and the file sits on a branch queued for ship - I am not editing a ship-queued suite mid-flight to pre-empt
a hypothetical third implementation. Carried as a ROW for a test-only packet: re-anchor those four on
unique multi-line context.

Regression duty (author, and it is the good kind): 20 red cells across 37 module suites + 8 repo gates, ALL
pre-existing - proved by backing the three files out, restoring a pristine `8b6c90554`, and re-running to an
identical failure set cell for cell. Includes `p3-bar-store-realm` and `m21-b-tal01918-red`, both already
carried as unowned rows. `MODULE-CONTENT-STAMP-BASELINE` drift identical with and without the change. The
two suites the sibling cut touched are fully green: `leak-d-rawdata-copy` 8/8, `mc-incremental-rawdata-copy`
11/11.


---

## 2026-07-30 13:26Z - ORDER-GLOW-GC-V1 ACCEPTED 6afb8006a, with two teeth gaps I found and rowed

`manager-a/order-glow-filters-20260730` @ `6afb8006a`, base `e675e5d1b`. Tree clean, writable set exact
(3 paths, +1250/-0), 13/13 cells. Author ran 9 mutants on disk in both mirrors with two negative controls,
one of them the good kind (a NON-UNIQUE needle, ` }\n` x4,704, not just an absent one).

**THE LEAK IS REAL AND NOW BOUNDED, measured in real Blink over CDP, not modelled:** 120 closed round trips
plus 25 open orders leaves **530 `<filter>` nodes** (1,060 with their feDropShadow children) that a chart
strip does not reclaim; after the fix, 0. The kill-switch run is deep-equal to the legacy run across the
whole 120-element per-cycle series, which is the right way to prove a kill-switch restores legacy exactly.

**KILL-02 SECOND NUMBER: MY PREDICTION HELD, AND IT KILLS THE RASTER RATIONALE.** Four arms, 240 frames x5:
530 UNREFERENCED filters cost **+2.4 ms of raster across 240 frames (0.010 ms/frame)**, and 5,000 cost LESS
(+1.85 ms) - no dose response, both inside noise. The positive control proves the instrument is not blind:
REFERENCING those same 530 costs +447 ms raster, 10.1x the floor. An unreferenced `<filter>` is not
rendered so it is not rastered. The only dose-responsive phase is Layout (23.9 -> 30.1 -> 72.5 ms as nodes
go 405 -> 1,465 -> 10,405), +6.2 ms over 240 frames at realistic leak size. **This ships as a pure RETENTION
fix. Anyone re-arguing the raster rationale now has to beat a number.**

### Three corrections against my brief, all of which I confirmed

1. **"About eight creation sites" was WRONG - there is exactly ONE.** `defs.append('filter')` occurs once,
   at :41507 inside `_ensureMarkerGlowFilter`, and it ALREADY dedupes: :41505 `if (svg.select(`#${filterId}`)
   .empty())`. My "8" was 8 references to `_ensureMarkerGlowFilter` = 1 definition + 7 call sites; I counted
   references and wrote "creation sites". Half my proposed fix already existed at base. Note also that my
   first grep for the guard came back EMPTY because I searched the author's PARAPHRASE (`'#' + filterId`)
   rather than the real template literal - my own empty-grep rule caught it, and the guard is there.
2. **`selectAll(...).remove()` is 102 in that file, not my 98.** Drift; my ratio argument is unaffected.
3. My magnitude estimate held exactly: 4 filters/round trip x 2 nodes = 8 nodes/trade = 2,400 at 300 trades.

**The author also found something I did not know, and it is what makes removal safe:** the filters are
created EAGERLY at marker draw but referenced ONLY during hover, so at any resting moment essentially every
per-order filter in `<defs>` is already unreferenced. The code does not rely on that argument - it refuses
to remove anything a live `filter="url(#id)"` still names, scanning `ownerDocument` rather than the `<svg>`
because url(#) resolves document-wide and sibling panels duplicate marker ids.

### MIRROR DIVERGENCE: pre-existing, REAL, and the deployed side is the SAFE one

Author reported the two `order-manager.js` copies were already NOT byte-identical at base (4 ins / 60 del,
from merge `a07e35120` "reconcile manager-d/trade-correctness"), the homepage copy missing the B-W16/B-W18
durable-journal hydration guard, and refused to reconcile them inside a glow packet. **Confirmed at base:
B-W16 canon=5 mirror=0, B-W18 canon=2 mirror=0.** I also identified one of the two "older teardown
selectors" concretely: mirror :42620 is `[class*="multi-tp-avg-"][class*="-${oid}"]` where canonical has
`.multi-tp-avg-${oid}` - the mirror form is a substring match that can over-match across order ids.

**I then settled the thing that actually matters, on the LIVE BYTES rather than by inference:**
`http://31.97.192.82:3000/chart/modules/order-manager.js` has **B-W16 = 5 and B-W18 = 2**. So the DEPLOYED
copy is the CANONICAL one and the homepage mirror is the stale side. The guard is NOT missing from
production. Author's refusal was right and the risk is lower than its report reads - but the divergence is
a live ROW: it is why `orphan-l4-entry-marker-listeners.test.mjs` is red on its byte-identity cell, and it
belongs to whoever owns `a07e35120`, not to this packet.

### MY OWN MUTANTS - four killed, and TWO SURVIVORS THE AUTHOR'S TABLE HID

Five independent of the author's nine, on disk in both mirrors, needle==1, restored to
`5FFA7D09A78DE0F5 / 177FA647920C4D28` every time. A2 partial-leg-prefix-loses-hyphen (order 1 claiming
order 12's legs), A3 `=== true` polarity, A4 drop-only-the-fallback-exclusion (a PARTIAL break the author's
whole-line M5 would not catch) - all three KILLED by named behavioural cells.

**Then I discounted the author's own mutant-runner cell and two survivors appeared.** That cell mutates
chart source and hash-checks it, so it goes red for ANY edit of mine regardless of behaviour - counting it
as a killer inflates every result. This is exactly the defect I flagged on M17-DI2 and it is now confirmed
in a second suite. Excluding it and the teardown/mirror cells:

- **A5 reference-scan-svg-not-document SURVIVES all 12 behavioural cells.** Swapping
  `_referencedGlowFilterIds(root.ownerDocument || root)` for `(root)` produced exactly ONE red cell: the
  self-referential mutant cell. The cross-panel scan scope - which the author documents in a comment as
  load-bearing, and which is the difference between safe and removing a filter a sibling panel still
  references - has NO behavioural cell. `GLOW-GC ownership matchers and reference scan` does not vary scope.
- **A1 reclaim-BEFORE-the-marker-removes SURVIVES with ZERO red cells.** Moving the reclaim above the twelve
  `selectAll(...).remove()` calls in `_sweepOrphanedOrderLevelDom` leaves the entire suite green.

**A1 needs its severity stated precisely, because the obvious reading is wrong.** It is NOT a defect today
and the shipped order is correct. Because filters are referenced only during HOVER, at a resting teardown
nothing references them and reclaim-before-remove still works - which is exactly why the suite stays green.
The order becomes load-bearing only when an order is torn down WHILE its marker is hovered (closing from a
control next to the marker), where the guard would correctly refuse and the reclaim would silently no-op.
So: a real latent ordering hazard, no cell exercises teardown-while-hovered, and the property is untested
rather than broken. Same family as the five inert realm-teardown cuts - green suite, zero effect.

EIGHTH sighting of the anchor/teeth family. Rowed both; NOT fixing by hand, the cells are CDP/Blink and want
their own test-only packet, same disposition as FLAG-TRUTHY-TEETH and STASH-REFRESH-TEETH.

### Two other things worth carrying

**THE EXTRACTION-LIST TRAP HAS STARTED SHAPING PRODUCTION CODE, not just breaking harnesses.** The author
did not hang the reclaim on `_disposeEntryMarkerRecord` - the seam you would expect - because that method
is in the FIXED `METHOD_NAMES` list that `orphan-l4-entry-marker-listeners.test.mjs` extracts and executes,
so adding a call to a method outside that list would have broken it, and the writable set forbade extending
the harness. It used `_sweepOrphanedOrderLevelDom` instead. That is a defensible choice and it disclosed it,
but the escalation is the point: my standing row had this trap breaking TESTS. It is now steering where
production code is allowed to go. That is a much stronger argument for fixing the extraction lists.

**HYGIENE, and it will bite the next packet:** running the order-manager corpus MUTATES tracked evidence
under `docs/plan3/**`, `chart v 1.4/chart/multichart-prod/harness/m21-b-tal01918-evidence/` and
`tests/evidence/session-calendar-red/`, and creates an untracked `homepage/docs/plan3/`. The author cleaned
it before committing. Any packet that runs these suites will show a dirty tree unrelated to its own change -
so "dirty tree" is not by itself evidence of an uncommitted fix. Also `scripts/tests/m6-replay-leak-
reproduce.test.mjs` times out at 240s in both arms.

Regression duty (the good kind): 270 test files before and after, plus a re-run at base with the three files
reverted. 43 pre-existing reds, 43 after, identical set, zero caused, zero flipped green.


---

## 2026-07-30 13:54Z - POINTER-SWEEP PROBE: render-scope bug FOUND, and b112 closes two of my escalations

Read-only probe on `manager-a/pointer-sweep-probe-20260730`, base `e675e5d1b`, **nothing shipped** - I verified
that myself: `git diff e675e5d1b --name-only` = 0 files, and the blob OIDs of all seven named files are
identical to base. Only `.scratch-pointer-*` untracked.

### FIRST: the P0 IS ON THE WIRE, and so are the CPU cuts. I am closing both escalations.

I have escalated the countdown P0 twice and reported it missing through b105, b106 and b107. **On the live
bytes at build `20260730b112`, `__TALARIA_DISABLE_COUNTDOWN_NULL_GUARD_V1` is PRESENT.** So are
`__TALARIA_DISABLE_RAF_PAINT_COALESCE_V1`, `__TALARIA_DISABLE_TF_DOWNSHIFT_ANCHOR_FIX_V1`, and
`__TALARIA_DISABLE_IND_LEGEND_CSS_IDEMPOTENT_V1` in the deployed `indicator-ui.js`. The P0 ship branch and
the CPU-cuts branch both landed. **Escalation withdrawn; stop citing it.**

**AND MY GREP WAS BROKEN AGAIN - THIRD TIME TODAY.** My first pass read `__TALARIA_DISABLE_RAF_COALESCE`
and `__TALARIA_DISABLE_IND_LEGEND_CSS_IDEMPOTENT` and got 0/0, which I would have reported as "still not
shipped". Both real names carry a `_V1` suffix. I only caught it because my own empty-grep rule forced me
to pull the names from `612602877` instead of from memory. Had I trusted the first read I would have sent
the Director a THIRD false "not on the wire" escalation. The rule has now paid for itself three times in
one day; the failure mode is always the same, me reciting a flag name rather than reading it.

### The finding: the dashboard-shaped bug is REAL, on the legend, at about a third of the magnitude

Marginal main-thread ms per pointermove, real backtest session, 5 repeats, each 80-move sweep paired with a
duration-matched idle window and subtracted:

| surface | ms/move | style | layout | JS |
|---|---|---|---|---|
| **legend (separate-panel rows)** | **11.29** (sd 0.72) | 1.61 | 1.49 | 5.57 |
| **order panel rows** | **9.29** (sd 1.43) | 0.73 | 1.09 | 4.02 |
| legend (OHLC rows) | 6.43 | 0.97 | 0.67 | 1.72 |
| candle area | 5.39 | 0.33 | 0.79 | 1.91 |
| price axis | 4.41 | 0.20 | 0.58 | 1.75 |
| time axis | 2.63 | 0.10 | 0.39 | 1.22 |

**My census's deflationary prediction is HALF RIGHT and I should say so plainly.** On canvas and axes it
holds: 2.6-5.4 ms/move, style recalc 0.1-0.3 ms, nothing like 31.5 ms. But the census measured playback
with NO INTERACTION, so it could not see two DOM surfaces that only exist under a pointer. Hovering one
separate-panel legend row commits **160.7 of 161.3 DOM mutations (99.6%) OUTSIDE that row**, 8.8 of them
onto its own ancestors, and recalcs 93 elements where the hovered row's whole subtree is ~4. That is the
dashboard's shape exactly, at 11.3 ms rather than 31.5 ms.

### ROOT CAUSE: hovering a legend row runs FIVE full Chart.render() per move

`Chart.render -> redrawDrawings -> DrawingToolsManager.redrawAll (:12751) -> updateClipPath (:2333)`, and
`updateClipPath` writes the clip rect exactly once per call, so 5.00 clip-rect rewrites/move = **5 render()
invocations per pointermove**. OHLC legend hover does this 0.13x/move; candle hover does it ZERO times.
Every idle control arm returned zero chains, so it is pointer-caused, not background replay.

**THE RECONCILIATION THAT MATTERS, AND IT RE-PRICES A ROW OF MINE.** The probe ran on b111, which HAS the
rAF paint coalescer I shipped. The coalescer is deployed AND THE LEGEND HOVER PATH EVADES IT - 5 renders
per move would collapse to 1 per frame if they went through `scheduleRender`. So these are DIRECT
`this.render()` calls, i.e. exactly the residual I rowed: 60 direct `this.render()` sites still in chart.js
against 126 `scheduleRender`. My rAF-reachability answer said "we were ABLE to lose frames, no proof we
were losing them today." **There is now proof, with a number: 11.29 ms/move.**

### Verified by me, statically, all three

1. **The comment lies, and it is worth quoting.** `chart-indicators-full.js:20549` says "Update
   crosshair-driven values on separate-panel legend rows **without rebuilding DOM**". Its callee
   `_renderSeparatePanelLegendValue` opens at **:20522 with `el.innerHTML = '';`** and then recreates every
   span with createElement/appendChild. Confirmed both lines by reading them. Also fires 1.75x/move on plain
   candle hover via the cheap crosshair route, so it feeds the allocation rate the census measured.
2. **Axis 3x mousemove amplification is real and cleanly separable.** `chart.js:42642-42643` forwards BOTH
   `'mousemove'` AND `'pointermove'`, and `forwardEvent` maps `pointermove -> 'mousemove'` at **:42567**.
   Confirmed all three lines. 80 dispatched moves produced 240 events (80 trusted + 160 synthetic). One
   physical axis move runs the canvas mousemove pipeline three times - which is why the axes show 20 forced
   layout reads/move against the candle area's 7.
3. **`updateClipPath` is called unconditionally from `redrawAll`** - confirmed at :12751, 6 call sites total.

### Ownership, because two of the six fix items are NOT mine

Items 1-5 are mine (chart.js, chart-indicators-full.js, drawing-tools-manager.js, order-manager.js).
**Item 6 (memoize the React rail icon components) is B's** - `talaria-design`. And the alert-system wrapper
the probe flagged at `chart/dist-v9/index.html:1922-1929`, which re-wraps `ch.render` so every hover-driven
render also runs `renderAlertLines()`, is **BUILD OUTPUT** of `talaria-design/src` per my standing rule
(vite.config.live.js:142, emptyOutDir). Editing it in my tree would be erased by the next build. Both route
to B as intelligence, not as patches.

### Blind spots I am carrying forward rather than burying

- **Idle baseline is 462 ms/s of main-thread busy with NO pointer input at all** (420-500 across five 2s
  windows) = 46% of a core. Independently consistent with the GC/allocation census. Matched-window
  subtraction handles the mean but inflates variance, hence 5 repeats and quoted spread.
- **The inside/outside MILLISECOND split is apportioned, not measured.** Mutation and element counts are
  direct; invalidation tracking gives counts and reasons but not per-node timing. The author said so
  unprompted, which is the right instinct.
- **Mutation counts are FLOORS**: 14,751 records recorded, 14,351 dropped at the observer cap on the legend.
- **Order-panel write-site attribution is confounded** (idle window not duration-matched; every React icon
  site returned an exact 4.0x ratio = artifact). Its trustworthy numbers are the timing and scope passes.
- **Canvas inside/outside is ill-posed** - a canvas has no DOM subtree, so 100% of its DOM work is "outside"
  by construction. The meaningful canvas result is that hover does DOM work AT ALL.
- **Deployed chart.js line numbers do NOT match the worktree** (b111 vs base). The three module files match
  exactly and were verified; chart.js sites were resolved by symbol. Any author must work from the worktree.

Positive control: an injected handler doing a document-wide recalc plus getBoundingClientRect on every div
and span moved style-elements-recalculated 41.2 -> 1292.1 per move (31.4x) and forced sync layouts 80 ->
1041. The instrument resolves a deliberately planted render-scope escape across every channel reported, so
the cheap canvas numbers are a real null and not a blind one. Instrument overhead +1.52 ms/move (12%),
inside the run-to-run spread of either arm and an order of magnitude below the control's sensitivity.


## 14:26 - LEGEND-HOVER-RENDER-SCOPE ACCEPTED 5971c8c6b, and it cost me a retraction

Packet accepted. `manager-a/legend-hover-render-scope-20260730` @ `5971c8c6b`, parent `e675e5d1b`. Tree clean,
diff confined to the writable set, both mirrors byte-identical (indicators `559835D44872013D`, drawing-tools
`38082CC1EE6E9502`), flag present exactly once per file across all four copies, bogus control 0. 25/25 green.

### MY BRIEFING ERROR - I sent it to a tree that predates my own shipped cut

The author reported that `__TALARIA_DISABLE_RAF_PAINT_COALESCE_V1` "does not exist anywhere in the tree", and
that this voids the inference I built the packet on. **It is right, and the fault is mine.** Verified:

| ref | flag hits | control `_isWheelZoomBurst` |
|---|---|---|
| `e675e5d1b` (the base I specified) | **0** | 14 |
| `612602877` (my cpu-cuts commit) | 2 | 14 |
| deployed b113 | 2 | - |

`f282a5692`, which introduced the flag, is **not an ancestor of `e675e5d1b`**. I chose that base for
cherry-pick independence and then briefed a diagnosis that depends on a cut the base does not contain. The
author's grep was correct and its positive control was sound. This is the exact `row-audit-read-wrong-tree`
failure I carry as a standing rule - an audit's tree must be pinned to the DEPLOYED sha - and this time I am
the one who committed it. It does mean the author's refutation is scoped to a tree where my premise is
absent, so it does not by itself reach the inference; but I had no business making it check.

### RETRACTED: "five Chart.render() per pointermove" is not established

I put that number in the journal. Withdrawing it. The author challenged the proxy conversion; its stated
alternative (one render fanning across five `updateClipPath` call sites) is not the mechanism, but the
objection is right for a different reason I confirmed myself:

- `updateClipPath` has **5 call sites + 1 definition** - the author's count, not my 6.
- `redrawAll` calls `updateClipPath` **exactly once**, so that leg is 1:1 as I assumed.
- But `render()` can enter `redrawDrawings()` at **three** sites (chart.js:29769, :29858, :29937).

So 5.00 clip writes/move is a floor of **~2 renders/move**, not 5. The differential still holds - every idle
control arm returned zero chains, so the renders are hover-caused - but the count was inflated by a fan-out
I did not account for. What survives: hover causes renders, and 11.29 ms/move is measured directly.

**Reconciliation for the edge the author could not find, and it is testable.** It enumerated all 60 direct
`this.render()` sites and found none hover-reachable; I confirmed `updatePriceHoverLine` is dead code on the
deployed build too (1 occurrence = the definition, zero callers). But the alert-system wrapper at
`chart/dist-v9/index.html:1922-1929` **re-wraps `ch.render`** - a hover to render edge through a runtime
wrapper is invisible to a static grep of chart.js source, and the probe measured the deployed build which
carries the wrapper. That is B's build output per the dist-v9 ownership rule. Next probe counts `Chart.render`
ENTRIES directly instead of a downstream proxy; I should have specified that the first time.

### The author's reinterpretation is the better diagnosis

CUT 2 explains the whole evidence set with no render involved: `_syncSeparatePanelOverlayValues` rebuilt every
row on every move (the 99.6%-outside-the-hovered-row split), and `el.innerHTML = ''` destroys the node under
the cursor, forcing the browser to revalidate the whole `:hover` chain (the 93-element recalc against a
~4-node subtree). Its sharpest point: this is why legend hover costs 11.29 ms and candle hover 5.39 ms
*despite the candle running strictly more handlers* - on the candle the cursor is not inside the mutated
subtree. Measured result: 24.00 mutations/move and 7.00 elements/move both to **0.00** intra-bar; element
allocation to zero on every surface and pattern.

The `:20549` comment I quoted as false is now **true** rather than edited - the behaviour changed to match it.
The author describing that as "fixed the comment" is loose but not wrong in effect.

### My own 7 mutants: 2 killed, 4 survived, control NOT_APPLIED

Applied on disk to both mirrors, needle asserted `== 1` in each, restored and sha-verified (`559835D44872013D`
both, identical to baseline). Killer attribution excludes the suite's own mirror/runner cells per the standing
rule; the author had already excluded them by construction, which is the glow-packet lesson correctly applied.

| mutant | result |
|---|---|
| P1 signature constant (rows freeze forever) | KILLED - C05, C06, C01d |
| P3 single-tag text frozen | KILLED - C05, C01d |
| P2 multi-tag **colour** frozen | **SURVIVED** |
| P6 single-tag **colour** frozen | **SURVIVED** |
| P5 row transitioning to `hideValues` keeps stale spans | **SURVIVED** |
| P4 drop the childNodes-length shape check | **SURVIVED** (redundant guard) |
| CONTROL needle absent | NOT_APPLIED (loud) |

**Text staleness is fully covered. Colour staleness is not covered at all, on either path.** Root cause is one
line: test.mjs:307 `spec.colors.map((c, i) => ({ text: barValue(spec.id, bar, i), color: c }))` varies the
text by bar and takes the colour from a **fixed** `spec.colors`. So C06 - a cell named CHEAT-CATCH whose whole
job is to be uncheatable - asserts colours at every bar against an expectation that never changes, and C07
asserts a single-tag colour statically. Production varies exactly this: MACD histogram colour flips with the
sign of the histogram. A regression that froze colour would leave a stuck-green histogram and a green CI.

Eighth sighting of the anchor/teeth family, and the second today where the cell that fails is the one named
for catching cheats. No live defect - the shipped code updates colour correctly. Test-only.

P4 is knowingly redundant: the shape string is `'multi:' + tags.length`, so a count mismatch needs an external
writer. The author called it "a second line of defence" and that grading is fair; not counting it against.

### Left standing, both disclosed by the author unprompted

- `updateCrosshair` calls `getBoundingClientRect()` on every crosshair update to auto-detect stale dimensions
  = a forced synchronous layout per pointermove on all three surfaces. Real, in a writable file, outside the
  three named cuts. Changing resize detection to buy a hover win is not a trade to make unasked.
- `_syncSeparatePanelAxisTags` tears down and recreates every axis tag node per call - the same antipattern
  one level up, on the render path rather than the hover path. Obvious next packet.

Cherry-pick viability checked against the deployed surface: `_renderSeparatePanelLegendValue`,
`_syncSeparatePanelOverlayValues` and `_syncSeparatePanelAxisTags` are all still present in deployed
`chart-indicators-full.js` at b113, so the stale base does not block application.

## 14:45 - CONF-01 / DUR-01 adopted. One finding re-assigns credit inside the ruling.

Read `RULING-EVERY-MULTICHART-OPTIMISATION-IS-GATED-ON-SAME-PAIR-20260730-1430.md` and my
section of `DISPATCH-CONF01-20260730-1430.md`. Both rules adopted without argument. Answer to the
Director at `a08ac2767`.

### Verified the ruling's mechanism myself, on DEPLOYED bytes not a manager branch

Build `20260730b113`. `_mcRawDataCopyLimit()` literally `return 200000;` - the ruling is exactly
right that this is the absence of a cap rather than a cap. `_panelFullRawData` = 102 occurrences
deployed, 24 assignment sites in my base. Residency confirmed NOT shipped (`_residencyComputeSlice`
= 0). One count correction in the Director's favour: the ruling says sixteen
`_multichartSamePairAsHost` occurrences from reading `manager-a/critical-path`; deployed carries
**twenty**.

### FINDING: the clone cut and the reseed cut are INERT under CONF-01

All nine `_mcCopySamePairFullRawData(...)` call sites are unreachable on a different-symbol panel.
Six sit behind `if (!this._multichartSamePairAsHost(...)) return …` (guards L5482, L5759, L7559).
The other three - L4584/4586/4601 in `_multichartMirrorHostTfSwitchIfReady` - sit behind
`if (this._isIndependentMultichartPair()) return false;` at L4526-4529, which resolves through
`_shouldAnchorPairSwitchToHostPlayhead(this.currentFileId)`. Positive control: the guard identifier
resolves 20 times in the same file, so the absences are real.

Both cuts were ON THE WIRE when the PO measured (`__TALARIA_DISABLE_MC_INCREMENTAL_RAWDATA_COPY_V1`
and `__TALARIA_DISABLE_REPLAY_RESEED_INCREMENTAL_V1` both present on b113). So 586 MB / 107% is the
fully unoptimised path measured with both optimisations live and unreachable.

Two consequences. The −75% allocation figure is not "unverified for memory" as the ruling's table
says - under CONF-01 it is **zero by construction**. And the renderer CPU improvement belongs to the
configuration-independent cuts: I checked the rAF flag sites carry no same-pair or independent-pair
guard within 60 lines above either occurrence.

Ninth sighting of the family: green suite, real mechanism, zero effect because the path never runs
in the configuration that ships.

### CORRECTION to my own record: residency does NOT already cover A1

Before starting a second landing I checked whether `9e0a8ad59` already bounds `_panelFullRawData`,
because one of my rows claims it drops ~100k → 20.3k alongside `rawData` and derived data. It does
not - **zero** occurrences of `_panelFullRawData` in that entire diff, and `_applyResidencyWindowV1`
has one application site. The live writes on the different-symbol path come from `bars.slice()`,
`master.slice()`, `incoming.slice()`, `merged` and `replaySystem.fullRawData`, none of which the
trim passes through. My row overstated residency's reach; A1 is genuinely new work. My own earlier
census already named the live mechanism though: uncapped `_mergeIntoPanelFullRawData`, key=fileId.

### Dispatched

**A1 oracle**, oracle-first per the ordering, base `8587c9821` - chosen because I verified it matches
deployment for the data path rather than because it was convenient. That check exists precisely
because I made the opposite mistake this morning. Built to go RED first against eight faithful
corruptions (bar dropped mid/start/end, close altered in the last decimal, timestamp shifted one
cadence, two bars transposed, whole range shifted by one, bar duplicated) plus a negative control
that must stay GREEN. SAFE-01 written in as an observable - element copies counted through a Proxy
so a fix that allocates first and trims after is caught rather than silently accepted.

**CONF-01 retention census**, read-only, to size A1 against A2 before building either. It carries
the tension I want settled rather than argued: the PO's own scaling test moved heap only 1.52x
across a 100-1000x range change, and if data volume is not the mass then **bounding** it cannot pay
either - which would undercut A1 as much as A2. Either that test was confounded by being
single-dataset or both my assigned landings are mis-aimed. I told the census to say so plainly if
the latter, and not to shade toward the landings I was given. DUR-01 folded in: slopes over a run,
not two endpoint readings, because an array that is large but flat is a different problem from one
that climbs.

---

## 2026-07-30 15:10 — CKPT-01 accepted; taking the checkpoint now, not at 22:00

Read `AMENDMENT-DIRECTOR-RUNS-THE-MILES-20260730-1445.md`. AUTH-01 noted: I stop asking and
report by journal. CKPT-01 names A1 and A2 as requiring a checkpoint, so both are mine.

Point 4 is the only one of the four that is work rather than paperwork, and the amendment is right
that it is the one that gets skipped. I started it now rather than at the scheduled 22:00 slot,
because if the retained artifact turns out not to boot I would rather find that out with eight
hours of margin than one.

### MEAS-01 cannot be fully satisfied today — no commit exists on the wire

CKPT-01 point 1 wants the tag to record "the build ID **and commit** read from the running page".
The build ID is readable: `dist-v9/index.html` carries
`<script>window.__TALARIA_CHART_BUILD_ID='20260730b113';` and propagates it as the `?v=` cache
buster on all 60 module URLs — 60 of 60 versioned, zero unversioned, so the asset set is fully
pinned by the build ID alone. That part is in good shape.

The commit is not there at all. `CHART_ENGINE_COMMIT`, `__TALARIA_COMMIT`, `GIT_SHA` and
`BUILD_COMMIT` are all zero occurrences, and there is not a single 40-hex token in either
`dist-v9/index.html` or the deployed `chart.js`. Positive control on the same fetch:
`CHART_ENGINE_BUILD` resolves 4 times and `_mcRawDataCopyLimit` 3 times, so the scan is not blind.

So a tag that claims to record the running page's commit would be recording my inference, which is
exactly the b85 displacement the amendment cites as the reason for the rule. I am closing this by
**deriving** the commit instead of asking for it: hash the retained bytes, then find which commit
in the repo carries that exact blob at the corresponding path. That is a measured mapping from
deployed bytes to source rather than a self-reported stamp, and it has a second payoff — any
deployed file that matches **no** commit is a file not reproducible from source, which is
something we want to know before a risky landing rather than during a rollback. I will take the
annotated tag once that lookup has run, so it records a measured commit, not an assumed one.

Adding a commit stamp to the shell would be the durable fix, but `dist-v9` is build output of
`talaria-design/src` per the ownership rule, so that routes to B as intelligence, not a patch.

### CORRECTION owed to C: `/chart/index.html` is auth-gated, and my "same bytes" claim was inferred

When I cleared C's route blocker I wrote that I had "verified the serving code myself" —
`api_server.py:26967-26969` FileResponses `_DIST_V9_INDEX_PATH` — and concluded that
`/chart/index.html` and `/chart/dist-v9/index.html` are **the same bytes**, so C's surface "was
never wrong, its browser STATE was".

On the wire that is not what happens. `/chart/index.html` returns **307 → `/login/?next=...`**,
with or without `?mode=backtest&sessionId=`. Following the redirect lands on the Next.js login
shell: 29,406 bytes, 12 scripts, all `/_next/static/chunks/*` including `app/login/page` and
`app/not-found`, and it mentions neither `chart.js` nor `dist-v9`. `/chart/dist-v9/index.html` is
not gated: 200, 91,538 bytes, 60 scripts, title "Talaria — V9 Live". `/chart/` itself is 403.

Two things are true at once and I want the distinction on the record rather than rounded either
way. My *reading* of the serving code may well be right for an authenticated request — I have not
disproved it, because I fetched without a session. What I stated as verified was inferred from
source and was never measured, and the measurement I can make contradicts the plain reading of
what I told C.

It did not bite, and I checked rather than assumed that: C's own `scripts/lib/conf01-session.mjs`
already navigates to `${origin}/chart/dist-v9/index.html?mode=backtest` and re-logs-in if it finds
itself on `/login/`. So the CONF-01 instrument was already pointed at the ungated surface. The
exposure was to anything that took my sentence literally and pointed an unauthenticated harness at
`/chart/index.html`, which would measure a login page and could report it as a chart.

Same family as `row-audit-read-wrong-tree` and my stale-base briefing this morning: third time this
week I have handed someone a conclusion drawn from reading a tree instead of reading the wire.

### Dispatched

**CKPT-01 artifact + rollback rehearsal**, on `manager-a/ckpt01-artifact-20260730` @ `8587c9821`,
tooling-only and forbidden from touching product code. Four subcommands: capture the full deployed
asset set byte-exact with sha256s; derive provenance by blob lookup as above; serve the retained
bytes locally while proxying `/api/**` and `/login/**` through to live so the app has a real
backend; and rehearse — boot real Chrome against the retained bytes and require a **working-product
assertion**, not an HTTP 200 sweep. Bars loaded, and replay index/timestamp sampled twice and
required to have MOVED, because `isPlaying` lags `play()` by two frames and a flag is not evidence.
It must also prove the browser actually loaded my bytes rather than falling through to live, and it
must carry a negative control — corrupt one asset, show the rehearsal goes RED — because a
rehearsal that cannot fail proves nothing.

Stated up front so it is not discovered later: this proves the artifact is good and bootable. It
does **not** prove the production deploy mechanism can place it. That half is B's and remains
unexercised.

### A1 pre-work: the `_panelFullRawData` site map, measured by me before briefing anyone

I have twice this week handed a packet a call-site list that was wrong (the reseed brief said nine
sites; there were ten, and the two I missed were the cross-realm bridge entry points). So I built
the A1 map myself first.

**The base is deployment-faithful.** `8587c9821` against deployed b113, six mechanism identifiers,
all exact: `_panelFullRawData` 102/102, `_mergeIntoPanelFullRawData` 3/3, `_mcCopySamePairFullRawData`
11/11, `_multichartSamePairAsHost` 20/20, `_isIndependentMultichartPair` 26/26, `_mcRawDataCopyLimit`
3/3, positive control `currentFileId` 149/149. Both A1-relevant absences confirmed on both sides:
`_applyResidencyWindowV1` 0/0 (residency genuinely not shipped) and the A1 flag 0/0 (not built yet).
This is the check I skipped on the legend packet this morning; doing it first now.

**24 write sites, and only 6 of them are the ones I already cut.** L4584/4586, L5523/5525 and
L7584/7586 go through `_mcCopySamePairFullRawData` — the same-pair-guarded six, inert under CONF-01.
The other **18 are plain `.slice()`, spread, or merge results** and they are the live path in the
four-symbol configuration. That is the sharpest confirmation yet of the inertness finding, and it
tells A1 exactly where it has to act: the eighteen, not the six.

**Nothing mutates the array in place — it is only ever reassigned wholesale.** Genuine in-place
mutations of `_panelFullRawData`: zero. My first attempt at this claim does not count: my own
regex matched `length === 0` as `length =`, flagging L6907 as a mutation when it is a read, and my
first positive control returned zero as well, which under my own empty-result rule proves nothing.
Re-ran with a control that works — the same matcher finds 10 in-place mutations on `this.drawings`
in the same file and 0 on `_panelFullRawData`. The invariant is real, and the codebase states it
itself at L7442-7444.

That matters because it means A1 can bound at a **single choke point** — one
`_setPanelFullRawData(bars, reason)` accessor with all 24 assignments routed through it — rather
than chasing incremental appends. One place to apply the window, one place to hang the flag. It is
also the same seam A2 needs, so A1 builds the boundary and A2 changes the representation behind it.
Still separate packets and separate flags per the ruling; they just meet at a seam A1 creates.

**Growth is uncapped and I can now say so with a measurement rather than an assertion.**
`_mergeIntoPanelFullRawData` unions old and new bars into a `Map` keyed by timestamp and re-sorts:
zero `splice`, zero `length =`, zero `Math.min`, zero `limit`/`cap`/`MAX`/`trim` anywhere in its
body. Nothing bounds it.

### THE TRAP IN A1, found before it was briefed rather than after it shipped

At L7441-7445 `_tryExtendReplayMasterFromParent` assigns **the same array object** to both
`replay.fullRawData` and `this._panelFullRawData`, and the comment says so deliberately: "these
arrays are always reassigned wholesale (never mutated in place), so one allocation serves both.
Halves per-panel history memory."

So the obvious implementation of A1 fails in both directions:

- **Slice to trim** and the sharing breaks. `_panelFullRawData` gets a short new array while
  `replay.fullRawData` still holds the full one — peak memory goes *up*, not down, and the landing
  reports a smaller number for the array it measures while the heap is worse. That is a green
  instrument on a regression, which is the failure mode I have logged nine times.
- **Trim in place** and it silently truncates the replay master, which is a correctness fault on
  the price path — and the parity oracle's verdict is final there.

A1 must therefore bound the array while keeping the aliasing invariant explicit, and its oracle has
to assert on `replay.fullRawData` as well as on `_panelFullRawData`, or it cannot see either
failure. There is a second, smaller edge: L2744 tests `data === this._panelFullRawData` by identity,
so an accessor that hands back a different array changes that predicate's answer.

Four read-aliases to keep whole: L2744, L4246, L7255, L7377.

### CKPT-01: the apparatus already exists and is better than what I was building. The gap is that nothing has used it for five days.

I went looking for how a rollback would actually be *placed*, because I had flagged that as the
unproven half of my own checkpoint. The answer changes the shape of the work.

`scripts/deploy.sh` refuses to deploy without `--manifest=/secure/CKPT-N.provenance.json`, and
`scripts/vps-deploy-after-pull.sh` explicitly rejects `chart`, `homepage`, `full` and `all` as
targets that "can mutate chart/homepage without immutable provenance". Its own comment at line 10:
**"Rollback uses this same command with the previous accepted manifest."**

The manifest schema `talaria.checkpoint-provenance/v1` already carries every field CKPT-01 asks
for — `buildId`, `source.sha` with a source tag ref, chart and homepage images pinned by sha256
digest, a uniformity proof, and a full `rollback` block naming the previous build's digests.

**I executed the rollback path rather than reading it.** `checkpoint-provenance.mjs plan
--rollback` against CKPT-020 resolves and emits the exact two commands, digest-pinned, with
`"buildAllowed": false`:

```
docker compose pull trading-chart trading-chart-worker homepage
docker compose up -d --no-build --no-deps trading-chart trading-chart-worker homepage
```

That is CKPT-01 point 2 enforced by the tool: a redeploy of bytes that already ran, with rebuilding
structurally forbidden. So this is not a rule we need to invent machinery for. It is a rule we
already have machinery for.

**The problem is coverage.** Searching by the schema string rather than by filename, with the
positive control passing (9 files carry it), there are exactly **seven real manifests**, and the
newest is **20260725b63**. The eighth match is `scripts/fixtures/.../green-manifest.json`, a test
fixture stamped `20991231b99`, which I excluded.

```
b21 -> b57 -> b58 -> b59 -> b60 -> b61 -> b63        production today: b113
```

The chain was kept daily and then stops on 25 July. **Production is fifty builds and five days
past the last recorded checkpoint.** A rollback driven by the newest real manifest would land
production on **b61** — losing five days of work including the countdown P0 guard that only reached
the wire this week.

This is the CKPT-01 blocker for A1, and it is not something I can clear: `deploy.sh` reads its
manifest from `/secure/` on the VPS, which I cannot see. So I am **not** claiming no manifest
exists for b113 — my own empty-result rule forbids that, and the bound is real. What is established
is that no repo-visible manifest covers the build we would have to roll back *to*, and that nobody
can demonstrate otherwise from the repository alone.

**Routed to B**, who holds VPS and registry access. Two questions, both answerable in minutes:
does a retained manifest exist for b113, and is the image digest it names still pullable from ghcr?
If either answer is no, then CKPT-01 point 2 is unsatisfied for A1 and the honest thing is to say
so rather than tag a landing and call it checkpointed.

**This also promotes the artifact capture I dispatched.** I briefed it as an independent byte-level
cross-check, aimed at the wrong artifact — the real deployable unit is a digest-pinned image, not a
folder of JS. But if b113's image digest turns out not to be retained, that raw capture becomes the
only retained copy of the bytes now running, which moves it from complement to fallback. It also
derives the commit from blob hashes, which is exactly the cross-check on a manifest's `source.sha`.
Fourth time this week I have briefed against a premise I had not checked; this one improved the
packet by accident rather than damaging it, which is luck and not method.

I am holding the annotated tag until the commit is derived, so it records a measured mapping rather
than my inference.

## 2026-07-30 15:30 — Three packets in. One of them overturned a row of mine.

### GLOW-GC teeth `fdda39a3b` — ACCEPTED, and my GAP 1 was wrong

Verified before grading: clean tree, exactly one commit, diff is the single test file,
`order-manager.js` byte-identical in both copies, 16/16 green (was 13/13).

**The author refused my GAP 1 and it was right to.** I had recorded that hoisting the reclaim above
the twelve `selectAll(...).remove()` calls in `_sweepOrphanedOrderLevelDom` leaves the suite green
with zero red cells, and called that a teeth gap. It is not a gap — it is an **equivalent mutant**,
and the cell I specified would have gone RED on shipped code.

I checked this myself rather than taking it. The twelve removes are level, badge and connector
selectors. None of them can match `entry-marker-N`, `exit-marker-N` or `partial-close-marker-N-*`,
which are the only nodes carrying an order-keyed `url(#…)`. The only substring matchers are
`[class*="open-tp-pct"][class*="tp-${oid}"]` and the two helper-returned pending-TP selectors
`[class*="pending-tp-pct"][class*="pending-tp-${oid}"]` and
`[class*="pending-tp-delete"][class*="pending-tp-${oid}"]` — each requires a class pair no marker
group carries. Positive control that my extraction sees real content: the **strip** seam references
`entry-marker` 4x, `exit-marker` 2x and `partial-close-marker` 2x. So the reference set is identical
either side of the removes, and position cannot matter. The author's measured table agrees exactly:
shipped and A1-applied produce byte-identical defs before and after.

Where the ordering *is* load-bearing is `_stripOrderDrawingLayersFromChart`, whose removes delete
the marker groups and whose own comment says so. That is where the tooth went, as M10, and it kills
via a named behavioural cell. A hoist there leaks all three defs permanently.

So my row is corrected, not merely closed: a hovered order genuinely keeps its glows through its own
per-order sweep, by design, and the chart strip is what reclaims them.

**GAP 2 was real** and A5 now dies to a named cell. The author disclosed unprompted that it had to
construct the configuration deliberately, because every live reference in production today has a
same-svg copy — so the document-wide scan is defence-in-depth on a documented invariant rather than
a shield against a reachable bug. I would rather have that stated than discovered later.

**Two counting failures of my own in one hour, same shape.** My re-extraction found ten removes, not
twelve, because two use helper-returned selectors my regex could not see; and my first grep for those
helpers returned empty because I guessed the parameter name `oid` when it is `orderId`. Both caught
only because my own empty-result rule made me run a control. The author's twelve was right and my ten
was not.

### Legend colour teeth `90ff7d95a` — ACCEPTED

Clean tree, one commit, single test file, all four product copies untouched, 25 → 28 cells, green.

Three of four survivors dead. The one that matters: **S1 was killed by the EXISTING C06**, the cell
already named "CHEAT-CATCH: multi-tag row text and colour both follow the bar". It needed no new
assertion — only a harness that varies what it claims to check. That is the cleanest possible proof
of the diagnosis I filed: the cell was not missing, it was toothless, asserting colours at every bar
against an expectation that never changed. Colour now derives from the bar through one shared
function, modelling MACD histogram sign flips and RSI threshold bands, with `atr-1` held fixed as a
control and `created === 0` asserted so the kill is proven to come from the span-reuse path.

Survivor 4 refused, correctly. The shape marker is `'multi:' + tags.length` and every write path that
changes the child count sets it in the same block, so the guard is unreachable from production and
the only available kill is a test reaching in to corrupt children directly. Left as knowing
defence-in-depth.

**It corrected my standing rule, and narrowed it.** I have been recording that an in-suite mutant cell
inflates every kill. The mirror **byte-identity** cell does *not*: a mutant is applied identically to
both copies, so they stay identical and that cell stays green. Only the in-suite mutant-**runner**
cell trips, and only on needle collision. The attribution rule stands; it protects against a narrower
inflation than I claimed. Also my item 3 said C07 probes only `adx-1` — it probes `rsi-1` too, which
contradicted my own correct description two paragraphs earlier in the same brief.

### A1 parity oracle `eb8cf3164` — ACCEPTED, with a gap I caused

Clean tree, one commit, two added files and nothing else, zero product modifications, 11/11 green,
and the 18-row corruption table all RED with named checks. Three negative controls green, including
a detached deep clone — value-equal, identity-different — which matters because the real fix will
likely clone and must not be flagged for it. Allocate-before-trim is a genuine independent observable:
492 element reads compute-then-copy versus 1440 allocate-then-trim, and `TRIM_AFTER_ALLOCATE` returns
bar-for-bar correct data while firing that check and nothing else.

Two of its own findings are worth keeping. A **transposition is invisible to the painted series**
because the resampler re-sorts by `t` first, so only retained parity catches it — which is the
concrete justification for checking stored and painted separately rather than treating one as a proxy.
And it found a blind spot in its own oracle by attacking it: stringified numeric values survive every
value comparison through coercion, so `CHK_RETAINED_NUMERIC_TYPE` now exists and is the only check
that fires for that case. Its anti-vacuity guard also failed on the first run and caught a check that
fired for nothing — the same CHEAT-CATCH pathology as the legend cell, found by the author on itself.

**It corrected my brief and the correction is real: my base is BEHIND deployment.**
`__TALARIA_DISABLE_RAF_PAINT_COALESCE_V1` and `__TALARIA_DISABLE_COUNTDOWN_NULL_GUARD_V1` are zero
occurrences at `8587c9821` and present on b113, proven with a positive control on the same pattern.
Both are paint/tooltip path, and the number that governs A1 is identical either side — 24
`_panelFullRawData` assignment sites on both — so the base still stands for this packet. But this is
the same stale-base failure I logged against myself this morning, arriving from the other direction,
and I only learned it because the author checked instead of assuming.

**The gap is mine, not the author's.** I found the `replay.fullRawData` aliasing trap *after*
dispatching, and the oracle does not cover it: `_tryExtendReplayMasterFromParent` appears zero times,
`alias` zero times, and the two arrays are never compared by identity. So a fix that slices
`_panelFullRawData` while `replay.fullRawData` still holds the full master passes the oracle silently
while per-panel memory goes **up**. Follow-up dispatched for a `CHK_TOTAL_RETAINED` that counts bar
objects across both arrays de-duplicated by identity, an explicit aliasing-invariant assertion that
permits breaking the share only if total retention falls, and an in-place-truncation corruption.

**Host topology answered.** The author asked rather than assuming, correctly. Tile A is the host
reusing `#chartWrapper`, so production at four panels is 1 host + 3 independent iframe peers, not 4
independent peers. Its fifth-symbol scene is a strict superset and stays, but must be labelled so
nobody reads it as the shipping topology — and the host is itself a `Chart` with its own
`_panelFullRawData`, so A1 applies to it and it is not exempt.

## 2026-07-30 15:42 — Scope narrowed to A1 and A2. Everything else parked.

Ruling: the base-series residency landing and the compact-storage landing are my only jobs until C
has graded them. None of the twenty owner-blocked rows are mine tonight. The six engine-internal
correctness rows queue behind. The visual overlay cluster is routed away.

**Accepted without argument, and it is the right cut.** I have been carrying a ledger that grew
faster than I could close it, and the honest reading is that breadth has been costing me depth on
the one landing that has a measured number behind it — 586 MB and 107% CPU in the reference
configuration, with `_panelFullRawData` named as the mass.

**Routed away (evidence preserved, not deleted):** axis-tag rebuild, crosshair forced layout, the
triple `mousemove` forward on the axes, LabelTool handle growth, and my 60-second node-count
prediction. Each row keeps its measurement and its file/line so the next owner starts where I
stopped rather than re-deriving it. One correction attached on the way out: the node-count
prediction is now partly stale, because the legend rebuild it was reasoning about was fixed by
`5971c8c6b`, so the sawtooth it predicts should be much smaller than when I wrote it.

**Queued behind A1/A2:** the four bare-`fullRawData` deref rows, the Go-To stale-index row, the
`endMs - 1` dead precision, the double-predicate fragility, the display-timeframe cover margin, and
the `replay.play()` cover question. One of these is not merely deferred but *coupled*: A1 changes
who owns the very array the deref rows dereference and how long it is kept, so when that triage
resumes it must be re-read against the new ownership rather than the old. I have written that onto
the row so it is not lost.

### What I did with the narrowed scope

Rather than wait on three in-flight prerequisites, I dispatched the A1 fix. Checked first: the
oracle amendment has not committed yet and the CKPT-01 rehearsal branch is still at base, so both
are genuinely still running.

The fix goes on `manager-a/conf01-a1-fix-20260730` at `eb8cf3164` in **its own worktree**,
deliberately not the oracle author's — two agents in one worktree is a collision I can avoid for the
cost of one `git worktree add`.

The brief leads with the aliasing trap rather than the design, because that is what makes this
landing hard: the quantity to reduce is **bar objects retained across `_panelFullRawData` and
`replay.fullRawData` de-duplicated by identity**, never the length of one array. Slicing shrinks one
and leaves the other holding the full master, which sends peak memory up while the naive instrument
reports a win. I told the author to build that accounting itself rather than lean on the oracle,
since the oracle is being amended for exactly this gap concurrently.

I also told it plainly not to shade the answer. The retention census may conclude A1 cannot pay —
the product owner's scaling test moved heap only 1.52x across a 100-1000x data range change — and if
bounding the base series does not beat viewport windowing, I want that sentence with a number, not a
landing that measures well on its own instrument and moves nothing in production.

A2 does not start until A1 is measured and graded, and never batches with it.

## 2026-07-30 16:00 — The alias trap I made the headline of the A1 brief is inert under CONF-01

### Oracle amendment `ae992af95` — ACCEPTED

Verified myself: clean tree, two commits from base, diff is still only the two added oracle files,
**zero** product bytes touched in either `chart.js` or either `replay-system.js`, mirrors identical
`8DC917ABEE51B4B3`, 16/16 green. The three new rows behave as claimed on my own run, not on report:

- `SHRINK_PANEL_LEAVE_REPLAY_FULL` → RED via `CHK_TOTAL_RETAINED` **and nothing else**
- `chk-total-retained` → CONF-01 bars **1440 → 1440**; aliased slots **1440 → 1920**
- `chk-alias-invariant` → wide window RED (slots 1440→1800 while bars 1440→900), narrow GREEN

### My row was wrong, and I verified the correction rather than accepting it

I have been carrying, and put at the top of the A1 fix brief, that
`_tryExtendReplayMasterFromParent` L7441-7445 assigns one array to both slots and therefore slicing
sends peak memory up. **That site cannot execute on a different-symbol panel.** The method opens at
L7395 and its *first* statement-level guard is:

```js
L7401  if (!this._multichartSamePairAsHost(this.currentFileId)) return false;
```

Same for the other two aliasing sites — L4922 behind `_multichartFinerSamePairPanelSelfOwns` at
L4899, L6364 inside `if (finerPanelSelfOwner)` at L6362 where `finerPanelSelfOwner = samePairAsHost
&& …`. The CONF-01-reachable path is instead **L6943, `replay.fullRawData = [...this._panelFullRawData]`**,
in `_independentPanelTimeframeSwitch` — a method whose name is literal and which contains **zero**
same-pair predicates between its open at L6904 and that line. A shallow copy, not an alias.

**My own re-check was the sloppy one.** It reported the guard as L7402 rather than L7401 because it
walked backwards and took the *nearest* match, stopping one line early. That is the fourth
take-the-nearest-match failure I have caught in myself today, and the second where my own tooling
disagreed with an author who turned out to be right.

### The severity inverts, and it makes A1 harder rather than easier

Under CONF-01 the two slots are two separate **pointer arrays over the same bar objects**. The only
path that deep-clones bars is `_mcCloneRawDataBars`, which lives in the same-pair family and is
inert here. So:

> **Bounding `_panelFullRawData` alone recovers nothing.** Retained bar objects go 1440 → 1440,
> measured. The window keeps the very objects `replay.fullRawData` still pins in full. The saving is
> one pointer array — about 8 bytes per bar — and zero bar objects.

That is the same pathology I warned about, arriving by a different route and with a worse ending:
not a regression that a careful instrument would catch, but a **complete no-op that a length-based
instrument reports as a large win**. My own brief, followed faithfully, would have produced exactly
that fix. Eleventh sighting of the family, and the first where I authored the trap myself.

The memory-goes-up version is real, but only in the **host-symbol** topology, where the slots do
alias: slots 1440 → 1920, measured. That topology is production too — tile A is the host and holds
one of the four symbols — which is why the amendment carries a second scene rather than only
hardening the first. Both must be covered and now are.

### Correction queued for the fix author, deliberately not interrupted

The fix packet is mid-flight. I chose not to interrupt it because the safety net is already in place
and I checked that rather than assuming: my original brief required retention accounting across both
arrays de-duplicated by identity, and required pulling the amended oracle before reporting — and
`SHRINK_PANEL_LEAVE_REPLAY_FULL` fails precisely the one-slot fix. The correction goes the moment it
reports, before any grading.

### Two things the author did that I want to keep

`CHK_ALIAS_INVARIANT` **nearly failed to earn its place** and the author said so unprompted: at the
default 421-bar window it is arithmetically implied by `CHK_TOTAL_RETAINED` and cannot be killed
independently, because the retention ceiling (2 × window = 842) is already below the 1440-bar master.
It only becomes independently killable at a wide window, so a 900-bar variant was added where it
fires alone. Same shape as the glow equivalent-mutant finding this afternoon: a check that cannot
fire on its own is not a check.

And it corrected its own first implementation of the in-place truncation, which used `splice(0, n)`
and therefore also tripped `CHK_ALLOC_BEFORE_TRIM` — misleading coverage, since that check is a
read-count proxy for allocation order and was firing incidentally. Switching to `copyWithin` +
`length =` gives the cheapest correct in-place truncation, which now fires only the mutation check.
That is the difference between a tooth and a coincidence.

It also independently confirmed **zero in-place mutations on the alias side** across all receivers,
which I re-ran: 0 in `chart.js` against a positive control of 8 on `this.drawings`.

---

## 16:20 — A1 measured: it does not pay, and the same number impeaches A2

The A1 fix reported. **Bounding `_panelFullRawData` frees ZERO bar objects** — at 1,440, 10,000,
50,000 and 200,000 bars per panel. 23.7 KB of array spine across four panels, 0.004% of 586 MB.
Bounding both slots, which the amended oracle demands, recovers ~324 KB, 0.05%.

This is the answer I told the author not to shade, and it came back against the task it was given.

**It also caps A2, which is the part that matters.** A2 compacts bar storage, so A2 can only recover
a fraction of whatever bar data weighs. Two independent methods now say bar data is not the mass:
my direct measurement (586 MB of `_panelFullRawData` would need 6.4 M bar objects = 3.04 years of 1m
data per panel), and the PO's own 1.52x-across-100-1000x scaling test, which implies a
data-proportional share of 0.05–0.53% = **0.3 to 3.1 MB of 586 MB**. Both my assigned landings are
aimed at the same sub-1% term. Sent as FINDING-A-A1-MEASURED-DOES-NOT-PAY-AND-CAPS-A2.

Best explanation for `_panelFullRawData` being named the dominant retained structure: a
**shared-retention artifact**. Both slots point at the same bars, so the bars are attributed to the
nearest common dominator rather than to either array — exactly what a retainer census does when two
arrays alias one object graph.

**I OVERTURNED MY OWN AUTHOR, by reading guard bodies instead of guard names.** It reported L4922 and
L6364 as NOT same-pair gated and used that as its reason to refuse truncation. Verified false:
`_multichartFinerSamePairPanelSelfOwns` L4739 requires `_multichartSamePairAsHost` at L4743 and
excludes `_isIndependentMultichartPair` at L4744-4747, and L6364 is doubly gated —
`const finerPanelSelfOwner = samePairAsHost && this._multichartFinerSamePairPanelSelfOwns({...})`.
The name does not lie. The oracle author and my 16:00 entry stand. Headline is unaffected: the zero
result rests on the reachable shallow copy, not on those sites. Note the symmetry — this morning I
was the one taking guard NAMES on trust; today my author did it and I caught it because I had already
been burned. My own grep for the guard also came back matching `_mcFinerPanelSelfOwner`, a different
instance field, and empty-result-is-unproven is what made me re-read rather than report.

Three of its four corrections HOLD, and one is load-bearing against the ruling's premise:
`_buildIndependentHybridInitialMaster` (L6112-6114, gated `independentPair && displayTf !== '1m'`)
already builds coarse native history spliced with 1m only from the playhead bucket, fetches capped at
2,000 bars. Under CONF-01 that covers three of four panels. **Viewport windowing already took most of
what A1 was dispatched to take** — the direct answer to "does A1 remove anything beyond existing
windowing". Site count is 25 not 24 (`panel-cmd-bridge.js` L1761, inert same-pair family).

**Landed but HELD, not routed.** `62b6afcc9` routes all 24 assignments through
`_setPanelFullRawData(bars, reason)`; verified by me, exactly ONE bare write left per mirror (the
accessor's own, L7219) and 24 routed sites, both mirrors identical. 26/26 (oracle 16/16 with the seam
swapped onto the real implementation, residency 10/10), 8/8 mutants on disk both mirrors, 0
NOT_APPLIED. The choke point deliberately does not truncate. I am not routing it: shipping a
behaviour-preserving refactor with zero measured benefit spends a CKPT-01 checkpoint to buy nothing,
on a data path, at 107% CPU. Its only value is as the A2 seam and A2 is what is now in question.

Unmeasured cost if anyone forces the bound: `_independentMasterCoversReplayTimestamp` (L7386) uses
master depth to avoid a refetch that "would wipe the chart and show loading". Bounding both slots to
480 bars pushes it false and trades 0.05% of heap for refetch churn.

Not starting A2. The retention census, dispatched before either landing was built precisely to settle
this, is still running and will name where the mass actually is.

---

## 16:50 — the board moved under me; two of the Director's five mechanisms are mine and measured at 0.05%

Checked the tree before starting anything and found my scope had changed at 16:20, twelve
minutes before my A1 finding landed. PLAN-FULL-EVICTION-CANARY-SUNDAY-1800 §4 now gives me
THREE mechanisms — A1, A2, and **multichart eviction on close + a capped warm room** — and §6
budgets Fri 02:00-08:00 for "the first two duration grades, A's landings".

Those two landings are the two I have just measured at **0.05% combined**. So the plan spends
six hours of C — the resource the Director himself named the critical path — grading nothing,
and puts two inert mechanisms into a five-way integration risk class he correctly flagged as a
different risk class from anything we have shipped. Sent ANSWER-A-TWO-OF-YOUR-FIVE-MECHANISMS-
ARE-MEASURED-AT-0.05-PERCENT under his own §7 rule that bad news travels at the speed of good.

**THIRD INDEPENDENT LINE ARRIVED WITHOUT ME.** The Director's own 15:55 finding names per-order
base64 screenshots and O(all orders ever opened) per-tick sampling. That is the same conclusion
as mine from the opposite direction: the mass is not bar data. Three methods now agree — my
direct measurement, the PO's 1.52x scaling test, and his screenshot/order term. I am no longer
asking anyone to take my number alone, which matters because my number contradicts the ruling
that assigned me the work.

CONF-02 STRENGTHENS the result rather than qualifying it, and I want that on the record before
someone uses it to dismiss the measurement: accumulating 30+ closed positions adds screenshots
and order state to the DENOMINATOR, so bar data's share shrinks. A1's result is structural —
shared bar objects — so it does not move with trade count.

**The new third assignment is the one worth having, and the arithmetic is already in hand.** A
panel realm is ~10.476 MB UTF-8 / ~20.95 MB UTF-16 of script source alone (C's 10.469 MB/realm
and mine agree within 0.4%), so ONE retained dead realm is 30-65x what A1 and A2 recover
together, before its ~12.8k-node document and its data. Right unit, right order of magnitude.

**BOUND I PUT ON MY OWN CLAIM IN THE ANSWER, because I have been burned by exactly this shape:**
I retracted the "six realms retained" inference earlier today (clean ratio, wrong baseline), so
I am NOT asserting closed panels are retained today. That is what EVICT-01's bytes-down proof
has to establish and it is the first thing I measure rather than assume. If closed panels
already release cleanly the mechanism does not exist, and I will say so as fast as I said it
about A1.

On the capped room I agree with his resolution and sharpened one thing: a CI-asserted cap is
necessary, not sufficient. Eleven sightings today of green-suite-zero-effect all had passing
tests. The cap needs a cell proving eviction HAPPENED UNDER PRESSURE, not that a constant is
<= another constant. ACQUIT-01 on a number nobody exercises is the exact failure mode I keep
finding.

CKPT-01 for the lane is in flight, not graded: manager-a/ckpt01-artifact-20260730 committed
2500c0331 at 16:35 with a retained b113 manifest (1,615 lines), scripts/ckpt01-artifact.mjs and
a test file. It has NOT reported to me. Standing rule cuts both ways — a commit is not a
completion signal any more than a completion signal is a commit — so I am leaving it mid-flight
rather than grading a packet that may still be exercising its rollback.

Not starting A2. Taking the eviction lane and measuring the retention question first, because
it decides whether the mechanism exists at all.

---

## 17:00 — the eviction lane's mechanism is already deployed and has never been graded

Took the new lane by asking its existence question first: does closing a panel release its
realm? Before dispatching anything I read the five realm-teardown flags rather than reciting
them, and NEARLY MADE A FALSE ESCALATION doing it.

**First read said the five cuts were NOT on the wire.** I scanned deployed `chart.js` for
`MC_RELEASE_*`, got zero against 45 distinct kill-switches present, and that is exactly the
shape of the twelfth accepted-fix-never-shipped escalation. **It was a false negative.** The
cuts live in `multichart-prod/multichart-manager.js`, not `chart.js`. Scanning the file that
should carry the symbol, all five are LIVE at b113 with src=2 / wire=2 exact:
MC_RELEASE_BLOB_WORKER_V1, MC_RELEASE_DRAG_GUARD_V1, MC_RELEASE_INDICATOR_WORKER_V1,
MC_RELEASE_ORDER_REGISTRY_V1, MC_RELEASE_TF_ABORT_V1. Fifth time today the wrong-tree/wrong-file
family has come for me and the first time the guard fired BEFORE the escalation left the room.

Disclosing a real weakness in that check: my three chosen controls all returned 0/0 because
they live in files the packet never touched, so they were never fetched — the control was
badly scoped and proved nothing. The result stands on a better property than my control did:
five independent flags each matching src=2/wire=2 exactly demonstrates the scan can see them.

**The reachability blocker is also gone.** `__TALARIA_DISABLE_MC_STASHED_PANEL_HANDLE_V1`=2 and
`mcStashPanelHandles`=5 on the wire. The audit that found all five cuts inert blamed React
nulling `contentWindow` before `removeChart`; the stash fix shipped for exactly that. So b113
is the first build where the five can act — and nobody has ever measured whether they do. That
grading has been OWED all day and is now also the EVICT-01 existence proof for my lane.

**One of my own rows is dead and I am retiring it, not carrying it:** I recorded
`custom-indicators-runtime.js` as creating a worker blob URL with no `revokeObjectURL`, and
proposed unrevoked blob URLs as the cheapest retained-realm fingerprint. On b113 that file has
revokeObjectURL=1, createObjectURL=1, terminate(=2. The leak is fixed and my proposed
fingerprint is probably dead. Told the probe to verify before using it rather than inheriting it.

DISPATCHED 0a401b21, read-only, to grade it: five-flags-OFF ablation against default, fitted
slopes per DUR-01, under CONF-01 AND CONF-02. Briefed with the false-negative trap by name so it
does not repeat my chart.js mistake, with the stale blob row flagged as stale, and with the sizing
that makes the answer interpretable — one realm is ~10.5 MB UTF-8 / ~21 MB UTF-16 of script source
(two independent censuses agreeing within 0.4%), so a retained dead realm is worth 10-21 MB and a
per-cycle retention much smaller than that means the realm IS being released and something else
leaks. Told it plainly that "already released, nothing to build" is a fully acceptable result and
not to shade toward the landing existing — the same instruction that got me the honest A1 answer.

Also carried in: EVICT-01 needs TWO numbers not one, working-product assertion by MOVED replay
index never an isPlaying flag, a negative control that must go RED, de-duplicate by identity
rather than counting lengths (the A1 trap), and subtract a duration-matched idle window from any
CPU figure against the 462 ms/s baseline.

Three packets now in flight: retention census, CKPT-01 artifact (committed 2500c0331, unreported),
and this grading.

---

## 17:15 — A1 REOPENED, and the correction is against me

Director ordered A1 built. My instinct was that I had already answered it at 0.05% and the
order rested on a false premise. I checked before arguing, and **the check went against me.**

**MY CEILING WAS A SNAPSHOT, NOT A SLOPE.** I measured A1's recoverable at FIXED master sizes
(1,440 / 10,000 / 50,000 / 200,000 bars) and quoted the result as a ceiling. DUR-01 says an
acceptance is a slope over time. I have spent the entire day enforcing that rule on other
people's numbers and broke it inside my own headline finding. The structural half survives; the
0.05% does not.

**THE GROWTH PATH IS REAL AND IT IS ON THE CONF-01 PLAY PATH.** Verified: 
_mergeIntoPanelFullRawData (L7096, 21 lines) has ZERO capping constructs - 0 splice, 0 length=,
0 Math.min, 0 limit/cap/MAX/trim/shift. Callers are _ensureIndependentPanelCoversPlayhead (L7385)
and ensureReplayDataCoversTimestamp (L8054): both playhead-cover paths that run AS THE PLAYHEAD
ADVANCES, and the first is specifically the INDEPENDENT / different-symbol path = CONF-01 by
construction. So the base series has an uncapped growth path during play on exactly the config
the PO measured.

**THE DIRECTOR'S DATUM DID THE WORK MY MEASUREMENT DID NOT.** "Their heap falls when playing
while ours triples" is the signature of a growth path, not of static retention. A static
retention problem does not triple during playback. That one sentence reopened A1 more
effectively than anything I measured, and I did not have it when I wrote the finding.

WHAT STILL HOLDS, and it SHAPES the fix rather than opposing it: bounding _panelFullRawData
ALONE frees zero bar objects at every master size, structurally, because both slots are pointer
arrays over the same objects. A1 bounds BOTH slots, one shared allocation, accounted in bar
objects de-duplicated by identity. The 62b6afcc9 choke point deliberately does not truncate -
that is the work now dispatched, not a missing feature.

**CORRECTED HIS RATIONALE, and it points at a BETTER argument than the one he gave.**
_mcRawDataCopyLimit() returning 200,000 is true, but it has exactly TWO consumers -
_mcCloneRawDataBars L3545 and _mcIncrementalCloneRawDataBars L3574 - both reached only via
_mcCopySamePairFullRawData, whose nine call sites are same-pair gated and unreachable at four
different symbols. Under his own CONF-01 rule that 200,000 is NOT the missing cap. The missing
cap is _mergeIntoPanelFullRawData: uncapped AND on the play path AND on the independent path.
Strictly stronger, and it survives CONF-01 where the copy-limit argument does not.

**TRADEZELLA COSTS ME MY OWN FAVOURITE HYPOTHESIS, recorded before it can survive as an
assumption:** their script cache is 2x ours while their heap is 1/5 of ours for the same four
instruments. That rules out per-realm script source as the differentiator - which was my leading
candidate for the eviction lane at ~10.5 MB UTF-8 / ~21 MB UTF-16 per realm from two independent
censuses. If they ship MORE code in LESS heap, code is not the gap.

**CKPT-01 CHASED AND IT IS HALF DONE - this gates A1's landing.** Capture is sound: 120 assets,
14,424,642 bytes of b113, captured 14:29:31Z, honest limitations, commit evidence with a PASSING
positive control (74 text assets scanned, one 40-hex hit in favorites-manager.js, control ok).
But THE ROLLBACK WAS NEVER EXERCISED - I searched the manifest myself: rollback=0, exercised=0,
workingProduct=0, replayIndex=0, negativeControl=0; only 'rehearsal' appears, once, inside a
LIMITATIONS note describing what the subcommand WOULD measure. A retained artifact plus an
unexercised rollback plan is precisely the failure mode CKPT-01 exists to prevent. Sent back to
execute it with a MOVED-replay-index working-product assertion, proof the browser loaded the
retained bytes not live, and a negative control that must go RED. Treating it as the gate.

DISPATCHED 8b211837 for the A1 truncation on the existing worktree: both slots, paging outward,
SAFE-01 before allocation, GATE-01 red-before-green, truthy kill-switch, the
_independentMasterCoversReplayTimestamp refetch cost PRICED rather than waved at, and the growth
slope as a REQUIRED deliverable rather than an estimate. Told it to contradict me with numbers,
including about this packet's own ceiling, since I have now been wrong about exactly that.

A2 not started, not batched. Withdrawn without spending a packet: the 35-site setProperty flag
and the post-exit sampling cut. The twenty owner-blocked rows untouched.

## 19:35 — A1 PAYS 9.5% AT THE MASTER I ACTUALLY MEASURED. Both my earlier ceilings were wrong.

**The number, finally sized properly.** A1's recoverable is entirely a function of how far
the base master has grown. Using the shipped arithmetic across the four CONF-01 panels:

| master/panel | bars evicted | MB | share of 586 MB |
|---|---|---|---|
| 2,000 (fresh boot) | 0 | 0.00 | 0.00% |
| 20,000 | 36,918 | 8.53 | 1.46% |
| **70,989 — measured on deployed** | **240,398** | **55.53** | **9.48%** |
| 200,000 | 756,398 | 174.73 | 29.82% |

**70,989 is not a hypothetical — it is the master size my own playback allocation profile
measured on the deployed build.** So A1 is worth ~55 MB / 9.5%, roughly 170x the 0.05% I
reported at 16:20. My snapshot error was worse than the retraction I already issued: I
measured at 1,440 bars, which is BELOW the size at which any bar is evictable, so I was
measuring a structural zero and publishing it as a ceiling. Third time today I have had to
move my own number on this packet, and every move has been in the same direction.

**The binding constraint, priced.** _independentMasterCoversReplayTimestamp returns false
unless the master reaches playhead + 6000*tfMs, and false means a refetch its own comment
says "would wipe the chart and show loading". So 6,000 base bars must stay resident =
**1.39 MB/panel, 5.54 MB across four that A1 CANNOT evict** without changing that predicate,
which is a separate packet. Consequence: the **coarse** panel needs a master above **20,520
bars** before it evicts anything at all, because at 1h each display bucket costs 60 base bars.
This is why cell 13 (predicate preserved) is green and cell 14, the deliberate reversal
control, correctly goes RED — GATE-01 satisfied.

**Suite: 19/24, five RED, ALL test-side, none a price divergence.**
- Cell 7 was a bar COUNT disagreement (6,242 actual vs 8,241 expected), and 6,242 is exactly
  the 1m panel's correct retained figure (242 window + 6,000 runway). The cell assumed the
  window runs to the END of the master; the window is bounded at BOTH ends and evicts the
  future tail beyond the runway too. Cell 8, the field-exactness cell, was GREEN throughout.
- Cells 11/12/21 failed on **the same root cause and it is the scene, not the fix**: all three
  failed their own POSITIVE CONTROL on USDJPY, the 1h panel. Head eviction requires
  PLAYHEAD_INDEX > windowBars, and 12,000 sat 2,520 under the 1h panel's 14,520. Nothing was
  evicted because nothing COULD be. **The controls did their job** — they refused to let three
  cells pass vacuously on a panel where the mechanism never ran. That is the opposite of the
  green-suite-zero-effect family I have been finding all day, and the first time today a
  control caught a vacuity before I did.
- Cell 19 was a real harness defect: Array buffer allocation failed.

**Fixed, test-side only, product bytes untouched.** Re-derived the scene from the arithmetic
(PLAYHEAD_INDEX 20,000 > 14,520; BASE_BAR_COUNT 30,000 > 20,000 + 6,000 runway), corrected
cell 7 to compare over the retained range at both ends, and added an **ANTI-VACUITY guard
cell** that pins the derivation so the scene cannot silently drift back to a size where the
bound cannot fire. Also found the OOM and the runtime share one cause: makePanel re-created
a vm context AND re-compiled extracted chart.js/replay-system.js method bodies on every call,
~50 times across the file. Now compiled once into a cached m.Script run into each fresh
context — realm isolation per cell preserved, parse cost paid once.

**MECHANISM IS SOUND where it counts:** both slots bound with ONE allocation (cell 9),
retained bar objects fall de-duplicated BY IDENTITY (cell 10), master never mutated in place
(cell 6), window computed before allocating (cells 5/6), kill-switch truthy-disables and read
per call (cells 15/16), and _mergeIntoPanelFullRawData routes through the choke point (17).

**Corrections against myself:** (1) I called the suite a HANG. It terminates in 114 seconds;
the earlier 17- and 81-minute observations were both suites running at once. (2) Four
dispatched packets stalled without reporting; I am doing this directly rather than
re-dispatching. (3) The A1 truncation work was sitting uncommitted through the crash —
secured byte-identical as `c97b06421` and labelled unverified at the time.

Sent as HEARTBEAT-A-A1-PAYS-9.5-PERCENT-AT-THE-OBSERVED-MASTER-20260730-1935.md.

## 21:15 — A1 IS DEAD (fourth correction, terminal). A third of the element climb is a fix that never shipped.

**A1 IS NOT ON THE WIRE and I must correct the Director's compliment before anyone builds on
it.** He credited my residency bound for panelFullRawBars holding constant at 3595/3910/2494.
Verified on deployed bytes with a passing control (_panelFullRawData 102, _mergeIntoPanel 3,
currentFileId 149, _mcRawDataCopyLimit 3): all six A1 markers are ZERO, and so is
_applyResidencyWindowV1 from the older residency packet. What holds that array flat is the
pre-existing _buildIndependentHybridInitialMaster (4) + _independentMasterCoversReplayTimestamp
(2). His empirical conclusion SURVIVES AND IS STRONGER than he stated: base-series retention is
not the climb, established on a build with no residency bound at all.

**THIS KILLS A1, AND A2 WITH IT.** The gate's masters are 2,494-3,910 bars. My own arithmetic:
the finest panel needs 6,242 bars before it evicts ONE bar; every panel needs 20,520. Evictable
at the observed sizes: zero, zero, zero. And the array is FLAT across ten samples, so there is
no growth to catch either. My 9.5% came from a 70,989-bar master measured in the allocation
profile - a 60x SAME-PAIR run, 21x larger than CONF-01 exhibits. Recommended shelving A1 rather
than landing it: a behaviour-preserving refactor with a measured zero would spend a CKPT-01
checkpoint on a 107%-CPU data path to buy nothing. Preserved at 512207d3a, 25/25.

**THIRD WRONG SIZE FOR A1 IN ONE DAY - 0.05%, then 9.5%, now zero - AND ALWAYS THE SAME ERROR:**
sizing a bound against a master I had not measured IN THE CONFIGURATION UNDER TEST. Recording
the pattern, not just the number: I keep computing ceilings from whatever master figure is
nearest to hand. The bound was never the problem; the instrument was.

**RULED MYSELF OUT ON THE REWIND.** A1 is absent from the wire, so _residencyRepointReplayMaster
- which does adjust sessionStartIndex and currentIndex - cannot have moved replayIndex 2508 ->
2011. Not mine. Not yet identified.

**THE ELEMENT CLIMB NAMES ITS OWN CADENCE.** +1333.5 elements/h against 40 trades in 45 min:
per tick = 0.093 elements, per bar close = 0.370 - both IMPOSSIBLE, a writer cannot emit a
fractional element. Per CLOSED TRADE = 25.0, a whole number. So the writer is order-lifecycle,
not paint-loop.

**AND 35% OF IT IS ALREADY FIXED AND SITTING UNSHIPPED.** My own CDP measurement in a real
Blink DOM: 120 closed round trips + 25 open orders leave 530 unreclaimed <filter> nodes (1,060
with feDropShadow children); after the fix, zero. That is 4.42 filters = 8.83 elements per
closed trade = 8.83/25.0 = 35% of the climb, MEASURED not estimated. The order-glow GC
(6afb8006a/fdda39a3b, 16/16, nine author mutants + five of mine) has flag=0 and method=0 on the
wire against a control of 8. It needs to SHIP, not to be re-found. Legend hover render scope is
also absent (flag=0) but it is a per-hover cost and an unattended gate has no pointer input, so
I am NOT claiming it contributes to the 1333/h. LabelTool IS deployed (flag=1, method=2).

**NOT ATTRIBUTED, AND I AM NOT GUESSING:** ~16.2 elements/trade remain. Candidate families read
from deployed bytes: entry-glow-\, exit-glow-\, partial-glow-\, multi-tp-avg-\,
pending-tp-\, tp-\. order-manager.js is removal-HEAVY overall (213 creates vs 357
.remove() + 99 selectAll().remove()), so this is a specific family whose teardown selector
misses, not a naive append-only path. Instrument: live element census grouped by tag/class/data-
attribute, differenced across a run - 8 minutes yields ~178 new elements, well above noise. On
the test host per EVID-02.

**FOURTH FLAG-NAME-FROM-MEMORY FAILURE TODAY, and this time two of three were wrong.** I checked
the wire with invented names for the legend and LabelTool flags; the real ones are
__TALARIA_DISABLE_LEGEND_HOVER_RENDER_SCOPE_V1 and __TALARIA_DISABLE_LABEL_HANDLE_WIPE_V1, read
from the commits. Had my empty-grep-is-unproven rule not forced me to pull names from source, I
would have reported LabelTool as unshipped and the glow GC verdict would have been luck.

**A1 SUITE, before shelving: 25/25 in 1.6s (was 5 RED in 114s), and it found a REAL PRODUCT BUG.**
_resolveMultichartReplayPlayheadMs() returns null; Number(null) is 0 which IS finite, so the
isFinite-only guard let a missing playhead through and windowed the master against the EPOCH,
retaining bars 0..runway and evicting the entire real series. Same Number(null)===0 trap that got
the earlier residency module rejected - second sighting in the same code area. Fixed in both
mirrors. My mutants: M1 restore-the-bug KILLED, M2 allow-epoch-0 KILLED by a cell I had to ADD
(it survived first), M4 kill-switch-strict-true KILLED by six named cells, M5 drop-the-runway
KILLED, negative control NOT_APPLIED. M3 bound-one-slot-only UNRESOLVED - emits no TAP totals,
consistent with the non-termination my reseed row predicts when the slots stop sharing one
allocation; I am NOT counting it as a kill.

**I CALLED THE SUITE A HANG AND IT WAS NOT.** The 114 seconds was assert's failure-diff
machinery on 30,000-element arrays - one cell spent 64.8s building a diff before throwing
'Array buffer allocation failed', which HID which assertion was failing. assert.ok(a === b)
instead of assert.equal took the suite to 1.6s. Also: makePanel recompiled extracted chart.js
and replay-system.js method bodies into a fresh vm context ~50 times per run; now one cached
vm.Script.

**HOUSEKEEPING DONE:** worktrees 34 mine -> 4, all 30 removals verified branch-intact by SHA
(git worktree remove keeps the branch). Repo total was 81. _evidence\manager-A\ created; no
heap snapshots or >2MB artifacts in the workspace root.

Sent as ANSWER-A-A-THIRD-OF-THE-ELEMENT-CLIMB-IS-A-FIX-THAT-NEVER-SHIPPED-20260730-2115.md.

## 22:10 — Element climb attributed: ~22 history markers + 8.83 unshipped glow. A1 stays shelved.

Director re-issued the duration-gate dispatch; C's 21:30 regrade already reframed it
(per-trade 31.7, rewind ruled out as the writer, verdict UNRESOLVED pending 2.2h). I closed
the residual from my 21:15 answer.

**Attribution (source-verified on tip order-manager.js):** after open→close, order-line/SL-TP
chrome is removed. What remains: entry marker ~10 (removeEntryMarker is a misnomer — strips
price kids only), exit marker ~10 (kept as history), trade-connector 1–2 (existingMarker
path re-appends with no dedupe), glow filters 8.83 (measured CDP, unshipped). Subtotal
≈29.8–30.8 matches C's 31.7 inside CI.

**Shipping implication:** glow GC at manager-a/order-glow-filters-20260730 @ fdda39a3b
removes ~28% of the element climb and is the only pure leak in the set. The ~22 history-marker
nodes/trade are CONF-02-by-design and belong to D's trade-eviction lane, not a missing
.remove() on close. Shipping glow alone will not flatten the slope under CONF-02.

**A1/A2:** stand on the shelve. Gate masters 2494–3910 < every eviction threshold.
**CKPT-01:** capture+replay-advance proven on retained bytes; acceptance still RED on
multichart embed boot (iframes: 0). **Realm-eviction grade:** still owed, not inventing.
**Housekeeping:** EVID-02 dir ensured; pruned detached temp/cursor/stale worktrees; other
managers' checkouts left alone. Answer:
ANSWER-A-ELEMENT-CLIMB-IS-HISTORY-MARKERS-PLUS-UNSHIPPED-GLOW-20260730-2210.md.

## 22:45 — glow GC routed for ship, and the transplant I nearly shipped would have reverted a live fix

**Routed:** manager-a/order-glow-filters-20260730 @ fdda39a3b, flag
__TALARIA_DISABLE_ORDER_GLOW_FILTER_GC_V1 (2x in each of the two order-manager.js copies).
16/16 at that head, 124 s; mutants applied ON DISK to BOTH mirrors with needle==1 asserted and
each killed by a NAMED behavioural cell; both negative controls (nonexistent needle, ambiguous
4,704x needle) reported NOT_APPLIED loudly; disk restored 5ffa7d09a78de0f5. Log at
_evidence\manager-A\glow-gc-fdda39a3b.txt per EVID-02. Route doc:
ROUTE-A-TO-B-GLOW-GC-SHIPS-FROM-ITS-OWN-BASE-20260730-2245.md.

**THE NEAR-MISS, and it is the row worth keeping.** I first tried to transplant the two glow
commits onto the tip so B would get a modern base. Exactly one conflict, in the per-order
teardown: tip has the SUBSTRING matcher [class*="multi-tp-avg-"][class*="-${oid}"], the glow
base has the EXACT .multi-tp-avg-${oid} from cluster-g's ORDER-SEL-01. I resolved it by keeping
the tip's line and adding the reclaim beside it — correct policy, do not smuggle an unrelated
fix through a conflict resolution — and it was WRONG, because the tip is the one that is behind.
ORDER-SEL-01 is ON THE WIRE (3 occurrences at b113) and ZERO at tip 3ba0d41d4, with controls
B-W16=5 and _disposeEntryMarkerRecord=6 on the same fetch proving the scan sees real content.
So my resolution would have shipped a revert to the over-matching selector I had myself logged
as a hazard — arriving from the direction I was not watching. Deleted the transplant branch and
worktree; nothing routed. Caught only because the glow suite's fixed extraction list refuses to
start without _orderSel01ExactTeardownV1Enabled: the extraction-list trap I have been escalating
all day did the catching this time. I am not withdrawing the escalation — a harness that fails
because a method is missing is fail-loud, which is the tolerable half of that trap.

**Row for C, independent of this packet:** manager-c/verification-infra is behind deployment on
order-manager.js. Anything measured on it that touches order teardown is measuring a tree the
users do not have.

**Still owed:** realm-eviction grade (not inventing it), CKPT-01 acceptance RED on multichart
embed boot (iframes: 0). A1/A2 remain shelved at CONF-01 scale.
