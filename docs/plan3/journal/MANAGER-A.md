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

---

## 2026-07-28T00:35 · CORRECTION · §A13 and §A12.2 are now in the workspace copy; my 00:20 reading was substantially right

Superseding the ASSUMPTION of 2026-07-28T00:20. `docs/plan3/DIRECTOR-RULINGS-20260727.md` now contains
§A13 at line 209 with §A13.1–§A13.4, and §A12.2 at line 188. Checked against the eight rules I
extracted from the dispatch text: all eight hold. Two details worth recording because they change my
own past routing calls rather than confirming them.

- §A13.2's table routes **"Test, oracle and harness authoring against stated criteria"** to mid tier
  (`gpt-5.5-medium-fast`). That confirms my 00:22 self-assessment: the session-calendar RED was
  over-tiered on the letter, and the §A10 control inventory clearly was.
- The same table routes **"any edit to `chart.js` shared paths (resample, pipeline, replay, indicator,
  render)"** to top tier. That retroactively justifies the `_mcDiag` counter packet at top tier, which
  I had recorded at 00:22 as merely "defensible."

Still absent from the file: **§Part 4** (cited by §A13.1 for reviewer non-downgrade) and **§Part 6**
(cited by §A12.3 as the agent smoke sweep standard). The document contains Part A and Part B only. The
00:20 assumption therefore stands for those two, unchanged and still unverified.

---

## 2026-07-28T00:37 · DECISION · what counts as a write packet "in flight"

§A13.3 caps me at three write packets in flight. I am reading that cap as **subagents actively holding
a worktree**, not as committed-but-unmerged branches, and recording the reading so it can be overruled
rather than discovered later.

Basis: the cap's two stated purposes are collision avoidance and top-tier review throughput.
`manager-a-mcdiag` is committed at `3e1fdc05e` with a clean tree and no subagent attached, so it can
collide with nothing. It does still consume review capacity, which is the other half of the rationale,
so I am not treating the slot as free without saying so.

Current occupancy: `session-calendar-red` and `shell-control-inventory` hold worktrees; the new
`indicator-lag-data-effect` packet takes the third slot. Its writable set is **harness and evidence
only, no product file at all**, so it is disjoint from both siblings by construction rather than by my
judgement. Read-only work in flight: the residency-cap review, the measurement review, the raw-cap
reconciliation, and the daily/weekly anchoring audit. Those are uncapped per §A13.3.

---

## 2026-07-28T00:39 · OPEN · re-dispatch reconciled against work already completed

The re-dispatch supersedes prior dispatches, but four of its six items already have results, so I am
recording state rather than re-running them.

| Item | State |
|---|---|
| 1 · Loader fix + §A4c presence assertions | Accepted locally at `634448817`. Not verified on TEST-1; no train has run. |
| 2 · `_mcDiag.resamples` across a replay run | **Answered**, with the instrument corrected first — see 00:40. |
| 3 · Indicator lag as a data effect | **New tonight.** Dispatched top tier, harness-only writable set. |
| 4 · Trim redesign | Design returned twice, re-priced. Implementation not dispatched; blocked on item 3's verdict and on the write cap. |
| 5 · Session calendar | RED in flight; the required anchoring enumeration dispatched read-only at 00:34. Product wiring still withheld. |
| 6 · §A2 re-baseline, then surviving C3a shape | Blocked. See the amendment request below. |
| §1.2 residency cap, in writing | **Answered** at 00:48. |

**Amendment requests to the Director, three, all evidenced.**

1. **§A9.3 names an instrument that cannot gate.** The ruling requires the per-tick resample hypothesis
   be settled "using the existing `_mcDiag.resamples` counter." Measured, that field reads exactly 2.00
   per tick at zero, one and two real full resamples. §A9.3 should name the three separated counters.
   The underlying question §A9.3 asked is nonetheless **answered**: per-tick full resampling is
   confirmed, and the incremental branch never fires.
2. **§A1's "not greenfield" premise is factually wrong.** It states that `visible-window-mirror.mjs`,
   `reusable-buffer-pool.mjs` and `m21-3a-single-data-owner-model.mjs` already exist in-tree and that
   C3a is "wiring audited components into the product path." All three carry headers marking them
   reference/test-only with explicit instructions not to wire them into product runtime, and they have
   zero product importers. The files exist; the capability does not. C3a is closer to greenfield than
   the ruling assumes, and the estimate should move accordingly.
3. **The item-2 result does not license item 6.** §A9.1 states that any memory cell without indicators
   and open trades does not close the memory row, and the measurement had neither, plus no panels and
   no browser. It confirmed a CPU and allocation mechanism, not a memory attribution. Rayan's 3.5 GB
   single-layout 1m term remains unattributed, so choosing a C3a shape now would still be choosing
   against an unmeasured target.

**Outstanding `PO-REQ` count: 0.** Nothing I hold requires PO time that an assertion could not answer,
and the 45-minute per-train budget is shared across three managers.

---

## 2026-07-28T00:41 · ASSUMPTION · I have treated the two PO price readings as different sessions

The completed-bar finding is EURUSD backtest session 877 around 1.305; tonight's D3 readings are around
1.415. I have assumed these are different playheads, sessions or instruments rather than an
inconsistency in the reports, and I briefed the indicator-lag worker to reproduce the D3 **signature** —
exact agreement across resampled timeframes with the native timeframe differing — rather than the
literal values.

Risk if wrong: if the two readings are meant to be the same session, one of them is mis-transcribed and
the monotonic 0 / −0.6 / +13 / +72 table may be measuring something other than I think. Mitigation: the
worker is required to state that it matched the signature and not the values, so no literal number
enters the record unverified.

---

## 2026-07-28T00:43 · DECISION · item 4 implementation does not dispatch until item 3 reports

The trim redesign is the highest-leverage change available and I am still holding it, deliberately.

Item 3 tests the hypothesis that the trim is why every resampled timeframe reports a close truncated at
the playhead — which would make the exact six-way agreement at 1.41477 and the monotonic post-completion
jump two consequences of one mechanism, and would fold the indicator lag into the same fix. If that is
right, the trim packet's scope, its oracle and its acceptance criterion all change: it stops being a
completed-bar-immutability fix with a performance side effect and becomes the fix for the painted-value
lag as well, which raises its tier of evidence.

If it is wrong — if the shared value turns out to be a cache-identity artefact rather than the trim —
then the trim packet is narrower than currently priced and something else owns the lag. Either answer
changes what I dispatch, so dispatching now would mean authoring the wrong oracle. Item 3 is hours; the
trim packet is 10–13 days. Waiting is cheap.

---

## 2026-07-28T01:05 · CORRECTION · I recommended a host-side dial that is a trap; retracting it

Superseding the recommendation in my 00:48 `ANSWER`. I told the Director that re-scoping the residency
row from panel-side to host-side was an "hours, not days" measurement because
`_highLimitBulkHistorySmartLimit` is "already switchable via a documented global." Adversarial review
refuted both halves and I am retracting the recommendation rather than softening it.

`__TALARIA_MC_HIGH_LIMIT_BULK_LIMIT` appears **exactly once in the repository** — the read itself. No
documentation, no test, no harness scenario, no kill-switch registry entry. It is an undocumented read,
not a documented switch. Worse, the sibling switch that *is* harness-covered records what happens when
this class of limit is turned down: the scenario cell's own assertion text is "replay enter reverts to
**many small fetches**." That is precisely the hazard the same analysis used to reject paging — a
smaller resident forward window means the playhead reaches the loaded edge more often, and every edge
hit is a network round trip with a stall. I would have been proposing the rejected mechanism through a
different door. Two further defects: the dial floors at 2000, and a **second** independent 100,000 dial
exists for host panels that turning the first one down does not touch.

**The do-not-build verdict itself survives, and strengthens** — reviewer confidence 92% against the
author's 80%. But the reason changed, and the new reason is the more useful one: the mixed-4 symptom is
**allocation churn, not residency**. The analysis divided a retained-bytes numerator by a browser-memory
denominator that sawtooths, which is the signature of short-lived allocation. If the symptom is churn, a
residency cap cannot touch it at any size, and the byte arithmetic — which was wrong in both directions,
too high per bar and far too low on total retainers — stops mattering. Recorded per §A4b: I reached the
right verdict partly for the wrong reason, and the record should say so.

**The replacement instrument, which I did not have at 00:48: bound the caches, not the master.** Four
constants — the cached-fileId count, per-file timeframe-cache breadth, the 12,000-bar cache depth and
the decoded-tile ceiling — are pure caches whose read paths are already miss-tolerant. Eviction costs a
refetch or a resample; it cannot change a painted value, cannot move a drawing anchor, and cannot starve
indicator warm-up, because a miss falls back to the fetch path that would have run anyway. That is a
materially safer dial than the fetch limit and it is measurable in hours. This is the host-side
measurement I should have named.

---

## 2026-07-28T01:08 · VERDICT · the 90-second freeze is named, and it is not in my territory

Read-only triage returned a named primary mechanism for §A9.2, and it is a different animal from
everything I have been measuring.

`surface=` static source analysis across `chart.js`, `replay-system.js`, `chart-data-pipeline.js` and
`order-manager.js`. `coverage=` **no timing measured, nothing executed, and the loop was not observed
firing in the reporting session.** Every duration below is derived from complexity plus conventional
per-operation costs. This is a well-supported hypothesis, not an established fact, and I am recording it
as such.

**Mechanism: a non-converging journal-marker restore cascade in `order-manager.js`.** Six `setTimeout`
callbacks are armed per `chartDataLoaded` event with no `clearTimeout` and no stored handle — and the
sibling function immediately below it *does* clear its timer, so the omission is asymmetric rather than
house style. `chartDataLoaded` fires on every replay frame advance. Each queued pass begins by
invalidating its own delta cache, so the incremental fast path can never engage and **every pass is a
full pass by construction**. The exit condition compares drawn-marker count against an expected count,
but the expected-count function omits the open-positions and pending-orders filter that the drawing
function applies — so any journal row whose id is also an open or pending position is **counted as
expected and never drawn**, the comparison can never be satisfied, the pending flag never clears, and
every subsequent event adds six more full passes to a queue that already drains slower than it fills.

That last detail is why this needs open trades plus journal rows to appear, and it is exactly the
configuration the earlier memory sweeps did not have. The arithmetic reaches ninety seconds: roughly one
to two seconds per pass at four panels, and about sixty queued passes, all with expiry times already in
the past, so the browser runs them back to back and the compositor never gets a frame. Sixty deep at 1.5
seconds is one wall, not sixty stutters — and that is the specific thing the per-tick resample cannot
produce, because it yields the thread between units of work. It also explains the parts that are hard to
fake: fine for five minutes then a wall, because per-pass cost grows as trades close; one layout
restoring responsiveness *immediately* without anything being fixed, because dropping from four renders
to one puts drain rate back above fill rate.

**This is Manager B's file. I am not touching it, and I am not opening a row on it.** Escalated to the
Director with the discriminating experiment attached. My territory's contribution to the same symptom —
per-tick full resampling and per-panel synchronous work on the host thread — is real, bounded, and
explains sustained high CPU and the sawtooth, not the wall.

**One trap worth recording before anyone acts:** the allocation rate from my side is part of what pushes
the heap into the regime where those passes are slowest. So fixing the per-tick resample will make the
wall *shorter* without removing it, which is an excellent way to record a false "fixed."

---

## 2026-07-28T01:11 · DECISION · no `PO-REQ` for the freeze experiment, despite it being cheap and decisive

The triage supplies a genuinely good fifteen-minute experiment: with four mixed panels, indicators, an
open position and a non-empty journal, read the pending-restore flag during steady play and see whether
it stays set, then enable the existing read-only marker-debug global and watch whether the pass count
per second climbs rather than holds. It would confirm or exclude the mechanism in one session.

I am not emitting it. The row lives in Manager B's territory, and §A12.3 caps requested PO time at 45
minutes per train **across all three managers combined** — spending it on another manager's row is not
mine to do. The experiment goes to the Director with the escalation so that whoever owns the row can
spend the budget on it. Outstanding `PO-REQ` count from me remains **0**.

---

## 2026-07-28T01:14 · OPEN · new defect in my own territory, painted as a value, live today

Found incidentally by the residency-cap reviewer while verifying an unrelated claim, and it is the
clearest §A4c instance of the night.

The weekly-map indicator reads `ctx.rawData` and needs roughly 36 calendar weeks of 1h bars — its own
comment says so and its constant encodes it. But non-replay `rawData` is **already ring-buffer capped at
5,000 bars for 1m**. On a 1m chart that is about three and a half days. The slice helper returns the
short array without complaint, so the engine computes what it presents as a fourteen-week average from
days of data, and paints it. No error, no degraded badge, no warning.

Capability loss without failure, painted as a value, live on the product right now, and independent of
every packet currently in flight. Opened as its own row in my territory. Not dispatched tonight — the
canary blockers outrank it and the write cap is the binding constraint — but it is exactly the class
§A4c exists to catch, and it was found by a reviewer looking at something else, which is worth noting
about how much of this the gates are still missing.

---

## 2026-07-28T01:17 · VERDICT · session-calendar RED landed and reproduces the PO evidence exactly

Packet `session-calendar-red`, commit `91cf6218f`, worktree `manager-a-session-calendar`. No product
file modified; the module-contracts preflight still exits 0. **Adversarial review dispatched and not yet
returned — this verdict is provisional and the packet is not accepted.**

40 of 160 value assertions fail against the product as committed, and they are the right 40: the Friday
4 Jan 2013 session bucket is absent, the phantom Saturday bar exists, four daily bars are named Sunday,
the daily bucket count is 24 where 20 is correct, and weekly opens render Wednesday 19:00 five times
instead of Sunday 17:00 four times. The DST evidence is the part I find most convincing — the local
anchor minute-of-day currently reads both 19:00 EST and 20:00 EDT where a correct implementation holds
one constant value, and the session-span histogram is all-24h where exactly one 23-hour session must
exist. That histogram is a structural falsifier for any fixed-offset implementation, which is the
failure mode I was most worried about when I briefed this.

`surface=` the real `parseTimeframe`, `_prepareBarsForResampling` and `_resampleDataFull`, lifted as
verbatim source text and executed in a `node:vm` realm alongside the unmodified pipeline.
`coverage=` no browser, no PO verification, no real session-877 data, panels simulated as VM realms
rather than iframes, and timezone varied in place of a different physical host so ICU/tzdata version
coverage is unverified. The GREEN half is a **patch applied in memory only**, so the 0/160 pass is a
claim about wiring that has not shipped. All of that is in the reviewer's brief.

Two incidental defects reported and correctly not fixed: `_tryIncrementalResample` mis-buckets
out-of-order appends, reproducing in the pre-fix state and therefore pre-existing, with a three-line fix
offered; and `parseTimeframe('1wk')` returns 60000 ms because there is no `wk` unit, while the
max-bars-on-screen table lists `1wk` as weekly. Both get their own rows rather than riding this packet.

**One decision the author made that was not theirs to make, and I am not ratifying it.** Crypto *daily*
at 00:00 UTC was specified; crypto *weekly* was not. The author chose Monday 00:00 UTC, which changes
crypto weekly output relative to today's Thursday-aligned epoch weeks. That is a user-visible
convention change on an instrument class outside the stated scope of the fix, so it goes to the Director
with the migration disposition rather than being settled inside a RED packet.

---

## 2026-07-28T01:30 · CORRECTION · my 00:52 correction was itself wrong; the PO sweep was right

Superseding the `CORRECTION` of 2026-07-28T00:52. I told the Director that
`PO-SWEEP-RESULTS-20260727.md` was wrong to claim per-tick cost scales with total history, on the
strength of a design report asserting the backtest replay path is bounded at ~5,000 raw bars.
Independent top-tier verification **refutes that assertion**. The sweep was right and I was wrong, and
the wrong version is the one I put in front of the Director.

The cap is real and has the stated values, but it is **not a bound on the replay path**.
`capReplayFullRawData` is wired at exactly one call site, guarded on `direction === 'forward'` viewport
prefetch, and it only ever runs as a side effect of a successful forward history fetch. Meanwhile
backtest boot requests the high-limit bulk history and the initial ingest takes the `startIndex === 0`
branch, which assigns `this.rawData = newData` with no cap at all; replay entry then copies that
wholesale into `fullRawData`. The playhead prefix installed on every tick clamps only to master length.
So per-tick resample cost **does** grow with session length, up to roughly 100,000 bars.

The reconciliation of the two numbers, which is the sentence for the dossier: the 5,000-bar cap and the
100,000-bar bulk fetch are both real and do not conflict, because the host loads up to 100,000 bars
uncapped at backtest boot and the 5,000 cap is only applied behind a forward-prefetch guard, so it trims
nothing for any session the initial fetch already covers.

The practical shape is a **bifurcation on session length** that nobody had distinguished. A session that
fits inside the initial bulk window — roughly 69 days of 1m bars — is fully preloaded, forward prefetch
is then blocked by the session-end gate, the cap never fires, and the prefix grows to the whole session.
Only sessions longer than the bulk window ever reach the cap. So 5,000 is not a steady-state bound; it is
a one-off eviction that the common configuration never reaches.

Consequences I am obliged to restate because I argued the opposite an hour ago:

- **The C3a de-scoping is withdrawn.** Per-tick resampling is O(session length) on the common path, and
  Rayan's single-layout 1m case is exactly the configuration that preloads the most bars. This mechanism
  is back in contention for the headline symptom.
- **The 1.97× 1m-versus-1H churn ratio still stands** and is unaffected — that arithmetic was about
  per-raw-bar prepare cost, not about the cap.
- **A host-side residency cap is now materially more interesting than I said at 01:05**, because bounding
  resident history would cut per-tick work proportionally rather than only saving retained bytes. The
  panel-side do-not-build is untouched; the safe dial is still the cache bounds rather than the
  undocumented fetch limit.

**A third linear-in-session-length cost was found on the same path and is not in any measurement yet.**
`_getWalkForwardOhlcToPlayhead` scans `fullRawData` from index 0 to the playhead on every tick via
`_aggregateFinerBarsWalkForward`, called from `_trimLastDataBarToReplayPlayhead`. The guard exempts 1m
display over 1m raw, so every coarser display timeframe pays a second O(playhead) scan per tick. Opened
as a row.

`_REPLAY_RAW_CAP` is confirmed double-assigned, effective value 120000, and **unread in production** —
its only reader sits in a ternary arm reachable only when `_getRawDataCap` is not a function, which never
holds for a real chart. Inert, cosmetic, worth correcting so nobody reasons from it later.

---

## 2026-07-28T01:33 · CORRECTION · the per-tick figure I reported was half the real one

I reported 1.000 full resamples per tick as the product figure. It is **2.000**. The review established
that `updateChartData` calls `_renderReplayChartUpdate()`, which calls `chart.render()` **synchronously
inside the tick**, and `render()` nulls the frame display series and then reaches `getDisplaySeries()`
through `calculateScales()`. The render resample is therefore unconditional and inside the tick, not the
modelled optional extra the packet described. The cells I quoted as the product were the
stub-suppressed configuration; the cells labelled as carrying an extra render frame are the product.

Direction of the error: the finding is **more** severe than I reported, not less. And it confirms two
packets are required, because removing the cache drop leaves the tick/render source alternation intact.

---

## 2026-07-28T01:35 · VERDICT · measurement packet ACCEPTED and merged

Packet `mcdiag-resample-measurement`, merged at `243dda5eb`. Adversarial review reproduced every reported
number **bit-exactly in independent processes** — zero mismatches across 14 counters × 12 cells × both
scale sets — and confirmed each mechanism in product source with positive controls proving the counters
discriminate rather than merely agree. It specifically attacked the stub set and found that the two stubs
upstream of the resample decision bias **in favour** of incrementality: the harness advances the playhead
by exactly one index where the real product can jump several, which would break the incremental guard
outright. The harness gives incrementality its best possible chance and still measures zero.

`surface=` real `ReplaySystem.prototype.updateChartData` over unmodified product sources in a `node:vm`,
independently reproduced. `coverage=` no browser, no panels, no indicators, no open trades, fast mode not
driven; the §A5.4 different-clock-or-host leg is **not** satisfied, since the reproduction ran on the same
machine; and the harness always exits 0, so it is a measurement instrument and not usable as a CI cell as
written.

Two defects in the packet's own reasoning, both recorded rather than waved through. Its closing claim that
this fits the single-layout report better than per-panel duplication is **unsupported** — panel sync was
stubbed, so per-panel duplication was measured at zero by construction and the two cannot be ranked. And
the packet counts **allocation churn, not retained heap**; 3.5 GB retained is a different quantity from
~3,300 short-lived objects per tick. §A9.3's "measure before building" is satisfied for the CPU question
and explicitly **not** satisfied for the memory question, which §A9.1 requires indicators and open trades
to close.

---

## 2026-07-28T01:38 · CORRECTION · §A10's motivating example is factually wrong

§A10 opens on magnet-mode snapping as its instance of feature-level capability loss, stating the current
shell contains zero references to `magnet`. That is true of the shell HTML file and false of the product:
the magnet button, dropdown and Off/Weak/Strong selector exist in the V9 React toolbar, are wired to the
engine, and are present in the shipped bundle, which is newer than the last source change. The shell
renders from its React entry point, so grepping the HTML sees nothing. **Magnet mode is reachable today.**

The ruling's conclusion survives its example. The inventory found 10 genuine migration-loss rows out of
324 controls, plus 14 retired with no recorded reason. But the *method* implied by the example — grep the
shell — is the one method the inventory explicitly recommends against, and it produced this false positive.

**The largest row is worse than magnet ever was.** A 2,064-line price-alert engine is loaded *and
instantiated* on every host page and wraps `chart.render` to draw alert lines every frame, while its
entire UI is legacy-only. The shipped FAQ answers "Can I set price alerts?" with "a full alert and
notification system is coming in a future release." The product denies a feature it is already running,
and pays a per-frame render cost for it. That last part makes it my row and not only a UI row.

One structural finding worth keeping: a control inventory **cannot** be asserted at build time the way
§A4c asserts modules. The hide-positions row proves it — both the icon and its dispatch branch are in the
bundle and only the menu entry is missing, so a bundle grep goes green over a real loss. A runtime control
census against a declared capability manifest is the only gate that catches it, and the manifest, not the
gate, is the load-bearing work.

---

## 2026-07-28T01:41 · PO-REQ · one number, ten seconds, and it decides whether C3a is aimed correctly

My first `PO-REQ`. Emitted because it **cannot** be an assertion under §A12.4: the answer depends on what
the history server actually returns for a real session, and no harness in the tree can simulate that. The
client asks for 100,000 bars and raises its own ceiling to permit it; whether the server delivers that,
or silently clamps lower, is not establishable from source.

1. **Surface and build.** TEST-1 host chart, backtest mode, any real EURUSD session — session 877 is fine
   and is already loaded in the PO's earlier sweeps. Confirm the build ID on screen before starting.
2. **Steps.** Enter replay as normal. Open DevTools console. Record exactly three values:
   `window.chart.replaySystem.fullRawData.length`, `window.chart.rawData.length`, and
   `window.chart.currentTimeframe`. One number each, no interpretation.
3. **Expected result, stated before looking.** `fullRawData.length` is in the tens of thousands — on the
   order of 10,000 to 100,000 — and **not** approximately 5,000. If it reads ~5,000 my correction above is
   wrong again and the de-scoping stands after all.
4. **Time estimate.** Under two minutes, against the 15-minute cap and the 45-minute per-train budget
   shared across all three managers.
5. **What is blocked.** C3a shape selection (§A9.3 / §A1), the host-side residency re-scope, and the
   priority of the per-tick resample row against the journal-marker freeze row. All three currently rest
   on an upper bound verified in source but never observed live.

Outstanding `PO-REQ` count: **1**.
