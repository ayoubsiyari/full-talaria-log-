# CORRECTION — the canonical floor, and why 633 and 532.6 were never rivals

**Owner:** C · **Date:** 2026-08-03 · **Build:** `20260803b126` (served source `5dceb6368`)
**Evidence:** `_evidence/manager-C/canonical-floor-retake-b126-pass3.json`
**Instrument:** `scripts/canonical-floor-retake.mjs` — INSTRUMENT-01 `CITABLE`, committed and clean with all 14 local dependencies at the time of the run.

This corrects figures quoted in
`ADVISOR-REPORT-THE-MEMORY-WAS-NEVER-IN-JAVASCRIPT-20260802-2050.md`.
That report is **not** rewritten. It was true to what was known when it was written, and rewriting a
dated report under a certified build is the habit that retired b124.

---

## 1 · The finding in one line

**The 633-versus-532.6 discrepancy was not a disagreement about memory. It was a disagreement about
when to read the gauge, and it is smaller than the error that reading early introduces.**

| Quantity | MB |
| --- | --- |
| The disputed gap (633.0 − 532.6) | **100.4** |
| The gap between the two reading methods, same session, same build, same gauge | **108.2** |

Measured on one session, so no cross-run comparison is involved in that second row.

## 2 · The canonical post-play floor

`FLOOR_FOUND` — **674.9 MB**. Four panels, same-symbol, speed 10, 342 bars played on the host panel,
no panels destroyed. Forced collection at every rung.

| Cumulative settle | Total private MB | This is |
| --- | --- | --- |
| 0 s | **783.1** | the published ~1 s method |
| 20 s | **684.2** | A's method |
| 150 s | 684.0 | |
| 300 s | 676.2 | |
| 600 s | **674.9** | **the floor** — 1.3 MB across the last 300 s |

**The ~1 s method over-reads the settled floor by 108.2 MB (16%). A's 20 s stop over-reads by
9.3 MB.** The 0 s and 20 s rungs are recorded with `protocolCompliant: false`; they exist to
reproduce the old methods on this session, not to be quoted.

**633.0 is retired.** It was an unsettled post-play reading taken after destroying three of four
panels — a different session shape *and* a different point on the curve. It was never comparable to
a four-panel boot figure.

## 3 · The boot floor is refused, so 532.6 is NOT retired

Boot curve: **682.5 → 634.2 → 640.7 → 640.8 → 628.2 MB**. Graded **`NOT_IDLE`**.

It falls 48 MB, climbs back 6.6, holds flat for 150 s, then drops a further 12.6. That is not a decay
curve, so the instrument refused **both** a floor and an upper bound. That refusal is deliberate: a
bound only means something on a curve monotonically approaching a limit, and quoting the last rung of
a wobble as a bound repeats the defect being retired in a quieter voice.

Something allocates and releases in a session where all four panels are paused. Until it is named,
**the cold-boot floor on b126 is not measured.** What can be said: on b126 the boot reads
**682.5 MB** by E's method and **634.2 MB** by A's, against 532.6 and 531.84 on an older build.

## 4 · Where the 108.2 MB went — and the coverage gap that is now the blocker

Named arenas, heaviest renderer, across the post-play settle:

| Arena | Before → after MB | Move |
| --- | --- | --- |
| `partition_alloc` | 68.40 → 47.05 | **−21.35** |
| `v8` | 47.75 → 47.75 | 0.00 |
| `blink_gc` | 74.82 → 74.82 | 0.00 |
| `cc` | 26.48 → 26.48 | 0.00 |
| `shared_memory` | 41.70 → 41.70 | 0.00 |

`partition_alloc` is the only named arena that answers to forced collection plus settle. The
remaining ~87 MB is **outside the named set**: the GPU process fell 243.5 → 193.6 (−49.9) and
renderer-private fell 393.7 → 332.8 (−60.9).

**The flat rows were checked before being reported.** The same code path moves `v8` 48.99 → 46.73 →
40.98 on the boot curve, so flatness at the post-play floor is a property of the session, not a stuck
dump.

**COV-01 remains unmet and is now the blocking row.** Coverage runs **55.5% → 59.8%** against a ≥95%
target, and `arenaGpuMB` reads 37.19 at all ten rungs of both curves while the GPU process moves
50 MB — the known basis defect, one renderer's arenas divided by all-process private, visible in the
data rather than argued about.

## 5 · Instrument defects found in this run, recorded not hidden

1. **CONF01's runway half is unbound in this instrument.** `requiredRunwayMs: 0`, so
   `wrapsExpected: null`. The common-window check itself is bound and passed
   (`COMMON_WINDOW_OK`, all four panels hold the host session start, 4.8-day shared window), but the
   runway computation wired into the soak is dead code here because this caller never passes it.
   **Same gate, two callers, one bound and one not** — the reason gate audits must run per call site.
2. **`resumeAll` self-reports `after: false` while the session is playing.** It reads `isPlaying` in
   the same tick as `play()`. The 8-second `playCheck` is the binding evidence and it worked. The
   misleading field stays in the artifact until fixed rather than being edited out.
3. **Two earlier passes were killed mid-curve and pass 2 lost three real readings**, because the
   artifact was written only at the end. Fixed at `b7625259c`: every rung checkpoints to disk, and
   fragments carry `partial: true` / `verdict: INCOMPLETE_RUNNING` so a kill cannot leave anything
   that reads as a floor.

## 6 · What is quotable from this

- **Quotable:** the post-play settled floor of **674.9 MB on b126**, the **108.2 MB** method gap, and
  the **21.35 MB** `partition_alloc` release — each with its total row, per TOTAL-01.
- **Not quotable:** any boot floor on b126; any attributed breakdown of the 108.2 MB, because
  coverage is 59.8% and the majority of the move is unattributed.
- **Retired:** 633.0.
- **Still open:** 532.6, pending a boot curve that reaches idle.
