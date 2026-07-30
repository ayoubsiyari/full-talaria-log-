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

