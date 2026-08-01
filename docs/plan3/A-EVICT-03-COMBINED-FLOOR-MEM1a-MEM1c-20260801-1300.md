# A: MEM-1a and MEM-1c are one floor, not two — combined behaviour and gate accuracy

Answering the Director's 12:52 question. I raised this myself and then left it in chat only,
which is the failure this document exists to correct.

## The short answer

MEM-1a and MEM-1c are **not independent rows**. They share one helper,
`_oldestOpenPositionTimestamp`, and MEM-1c (`ca5b82b7b`) changed it. So `50b5a3867` is not
the last word on EVICT-03, and the two must be reasoned about as a single floor.

MEM-1a's gate was **not** asserting a floor that MEM-1c moved. It was worse in one narrow
sense and better in another: it never covered the case that changed at all. It was green
against both builds because nothing in it exercised the difference. That is the vacuity
class — green for the wrong reason — so I have closed it rather than merely described it.
See "What I changed" below.

## What the eviction floor actually is with both rows in

Two trims fire at different moments, both floored by the same helper.

**At replay entry** — `_boundPreSessionResidency`, called from `enterReplayMode` after the
master is copied and before the replay timestamps are derived:

- trims the master to `sessionStartIndex - 1000`, retaining a 1,000-bar warm-up window
- trims **both** `fullRawData` and `chart.rawData`, because at that instant the former is a
  fresh copy of the latter and trimming only one would free array slots while every bar
  object stayed reachable through the other
- rebases `sessionStartIndex` and `currentIndex`, bumps `dataVersion`

**During replay advance** — `_evictBehindPlayhead`, called from
`_advanceReplayPlayheadOneStep`, which is reached from `animateTick` and `animateFastMode`:

- fires only once the playhead passes `EVICT_CONTEXT_BARS + EVICT_SLACK_BARS` = 7,048 bars
- trims the master back to `playhead - 5000`
- writes **only** `fullRawData`. It does not need to write `chart.rawData`, because that is
  rebuilt every tick as `fullRawData.slice(0, playhead + 1)` and therefore follows
  automatically. This is a real difference from the entry-time trim and it is not an
  inconsistency: at entry the two arrays are independent copies, during replay one is
  derived from the other.

**The shared floor, which is the part that changed.** Both trims call
`_oldestOpenPositionTimestamp` and both refuse to trim across the oldest open position's
entry bar. Both abstain entirely — no trim at all — if any element of `openPositions` is
unreadable.

Before MEM-1c, "unreadable" did not include a hole. `Number(position && position.openTime)`
evaluates to `Number(null)` for a null element, which is a finite **0**. Zero is a timestamp
that no bar precedes, so the binary search returned -1, the floor was silently discarded,
and eviction proceeded across the entry bar. A hole did not abstain; it read as an entry at
epoch zero. MEM-1c marks a hole unreadable explicitly.

**Net effect on EVICT-03 as shipped:** strictly more conservative than what landed at
`50b5a3867`. The only behavioural difference is that a null element in `openPositions` now
blocks eviction where it previously permitted it. No scenario evicts more than before.

## Steady state, since the two interact

`_boundPreSessionResidency` runs once, at entry. `_evictBehindPlayhead` runs continuously
and settles at a tighter bound (5,000–7,048 bars) than the entry trim leaves behind. So
**MEM-1c is subsumed by MEM-1a roughly 1.1 hours into a session** and contributes nothing to
a ten-hour residency figure. Its value is the boot moment and the first hour, which is
exactly where C measured it. This is stated again, with arithmetic, in the prediction
document.

## Whether MEM-1a's gate still describes the shipped build

It did not, and this is the actionable part.

`evict-behind-playhead.test.mjs` was 12/12 green against the amended helper. It asserted
nothing false. But its money-path cell, R5, exercised only `{ openTime: undefined }` — an
object with an unreadable field, never a hole in the array. The one case MEM-1c changed was
untested in the row that owns the behaviour.

The coverage did exist, but in the wrong file: `presession-residency.test.mjs` R13b pins the
old coercion as the defect. That is correct for MEM-1c and useless for EVICT-03, because a
reader auditing the eviction row would not find it.

The concrete consequence, which mattered while the two rows were separable: **if
`50b5a3867` had merged without `ca5b82b7b`, EVICT-03 would have shipped with the epoch-zero
hole live and no gate anywhere would have caught it.** B has now merged both, so the
ordering risk is closed. The coverage gap was not, until this change.

## What I changed

Two cells added to `scripts/sr04/evict-behind-playhead.test.mjs`, so the row's own gate
describes the build that ships:

- **R5b** — every falsy hole (`null`, `undefined`, `false`, `0`, `''`) blocks eviction, and
  a hole beside a readable position still taints the whole read. A readable sibling is not a
  floor for both.
- **R5c** — the epoch-zero coercion is absent from the source and the explicit unreadable
  marking is present, so a future revert of MEM-1c's helper change turns EVICT-03 red in its
  own file rather than only in MEM-1c's.

`evict-behind-playhead.test.mjs` is 14/14.

## For the record

Rows that share a helper are one row for gate purposes. The five landed rows were reviewed
as independent units and this pair was not; the sharing was introduced by me in MEM-1c and
should have been declared in that commit's own gate rather than a turn later in chat.
