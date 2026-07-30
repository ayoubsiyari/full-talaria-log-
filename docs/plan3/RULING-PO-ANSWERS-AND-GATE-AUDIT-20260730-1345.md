# RULING — the PO's 23 answers, and a quarter of the fixed column has gates that cannot fail

**Director · 2026-07-30 13:45 · binding on A, B, C, D**

## Part 1 — D's fixed-column audit. Thirteen of fifty-one gates cannot go red.

D was asked whether its "fixed" gates exercise the path a user takes or only the path
the code takes, and whether reversing the fix turns them red. **Thirteen rows failed.**

| Rows | How the gate fails to fail |
|---|---|
| TAL-01937, Rayan #1/#3/#6b | M23 suite stays 14/14 GREEN under kill preload |
| TAL-01896 | duration suite stays GREEN under kill |
| TAL-01926 | pytest stays 14/14 with the guard set to 0 |
| TAL-01807b | visual-rebind has no reverse lever at all |
| TAL-01904, 01809, 01933, 01810 | code-path only — helpers and classifiers, never a place, refresh or fill |
| SEL-01 | selector strings only, no user teardown |
| TAL-01733 | H-S19's documented bug-switch stays GREEN |

Write-up: `docs/plan3/FIXED-COLUMN-AUDIT-20260730-1320.md`.

**Twenty-five percent of the column we have been reporting as done rests on gates that
pass whether the fix is present or not.** This is the same defect that let a trade ID
change from #5 to #942 while three order-ID rows sat green.

**Ruling.** Those thirteen rows leave `fixed` and become `gate-vacuous` — a state that is
neither fixed nor broken, because we do not know. D writes a gate for each that goes RED
with the fix reversed, then re-tests. Money path first: TAL-01904, 01809, 01933, 01810,
01926 and 01937 all touch fills, balance or trade state.

**This is exactly what the PO ordered and I want it recorded as such.** "No suspects, no
evidence left behind" applied to the fixed column, and it found that a quarter of our
claimed progress was unverified. D volunteered the number rather than defending the
column, which is the behaviour to reward.

## Part 2 — the PO's answers, folded in

### Feature requests: one is a canary blocker

`TAL-01850` **TradingView-style keyboard shortcuts — BLOCKER.** New canary scope,
needs an owner today.

AFTER: `TAL-01907` ATR bands, `TAL-01906` SMT compare, `TAL-01915` COT/OI,
`TAL-01852` hide-future-candles, `TAL-01851` settings-as-layout-template,
`TAL-01849` text/tool templates. NO: `TAL-01814` SMC webhook, `TAL-01784` time-only
presets. Eight rows off the board.

### TAL-01891 — 8 GB, and it invalidates a working assumption

PO: **YES, same as our current work.** And the detail that matters — *"the tester was
just running a normal session and taking trades on one pair and he reached this high
usage."*

**One pair. Normal session. Taking trades. Eight gigabytes.**

Every measurement in this plan has been minutes long: thirty seconds of playback, four
open/close cycles, a handful of session loads. **Nobody has ever soaked this application
for hours.** Our single-chart heap readings showed a sawtooth and I reported the leak as
multichart-specific on that basis. A tester on one pair reached 8 GB, which a sawtooth
does not do.

**Consequence, and it is a real gap rather than a correction:** the clone cut is named
`_mcCloneRawDataBars` and is multichart-shaped. It may not touch this at all. The reseed
cut might. We do not know, because the experiment has never been run.

**A multi-hour single-pair soak with trades being placed becomes a required freeze
gate.** C owns it, it runs unattended, and it costs no PO time. If memory climbs without
bound on one pair, that is the leak the PO's testers have been reporting all along and
everything we measured today was the wrong shape.

### TAL-01892 — idle then lag: PO will test after the build. Stays open.

### Go-To family

`TAL-01677` — PO: *"we already fix this."* D locates the commit and gate and closes it
with evidence, or reopens it. A close on memory alone is not a close.

`TAL-01893` — skips **forward**, timeframe unknown. D checks whether the other Go-To fix
covers it before spending anything on a new gate.

### TAL-01744 — closes cleanly, both halves working as intended

PO: the snapping is what TradingView does, so the tester's complaint is not a defect. And
crosshair customisation should **not** propagate across layouts. Both halves resolved as
intended behaviour. **Closed, no work.**

### TAL-01894 — not a bug at all

PO clarifies the tester meant *"in the settings menu with chart template there is no
label text colour option."* That is a **missing option, not invisible text.** Reclassified
from defect to feature request. **One question back to the PO: blocker, after, or no.**

### TAL-01941 — worse than the form suggested, and it cannot wait for a repro

PO: *"some testers have this problem sometimes the SL or TP not trigger, but I don't know
if it's resolved now."* The intake record is sharper: **"slippage with SL not triggering,
RECURRING across several testers, pair/TF undocumented — do not drop."**

**A stop that does not trigger is the worst defect class in this product.** It is money,
it is recurring, it has no reproduction, and it currently has no gate.

**Ruling: we do not wait for a reproduction.** D builds a randomised soak that places
orders across many pairs, timeframes, gap conditions and slippage scenarios and asserts
that every stop and target triggers at or beyond its level, then runs it long enough to
catch an intermittent. **A defect with no repro is not a defect we cannot test — it is a
defect we have to test differently.**

### Rayan #2 and #8 — two money-path bugs filed inside other clusters

The PO recognised both. The intake text explains why they matter more than their
placement suggests.

**Rayan #2** was filed under multichart lag: *"price stuck; closing the second chart
layout un-stuck it, but the order vanished."* The lag is Cluster C. **The vanished order
is money path** and has never been tracked as such. D takes it.

**Rayan #8**: *"random sell order self-opened + skipped ID #8."* Two defects in one line.
The **skipped ID** is plausibly the same allocator instability D found when a trade ID
went #5 → #942, so it may already be fixed and needs verifying rather than hunting. The
**order that opened by itself** is not explained by anything we hold and is the single
most serious unexplained row in the backlog. D takes it, gate first.

### Three reopens

`TAL-01920`, `Rayan #7`, `Rayan #10` — all reopened by the PO against my own reading that
01920 looked correctly scratched. Recorded: **the PO overruled me and the PO is
consistent with his own doctrine.** "Self-resolved" is not evidence of resolution.

**Interpretation, and the PO corrects me if wrong:** reopened means *positively verify it
is gone*, not *find the original reproduction*. Each becomes a verification row, not an
investigation.

## Part 3 — what changes on the board right now

**New canary scope:** TAL-01850 keyboard shortcuts.

**New required freeze gate:** multi-hour single-pair soak with order placement. C.

**New money-path rows:** Rayan #2's vanished order, Rayan #8's self-opening order,
TAL-01941's non-triggering stops. All D, all gate-first.

**Thirteen rows leave `fixed`.** The ledger's fixed count drops from 51 to 38 and that
number is more honest than the one it replaces.

**Eight rows leave the board** as AFTER or NO. `TAL-01744` closes. `TAL-01912` closes.

**One question outstanding to the PO:** TAL-01894 as a feature — blocker, after, or no.
