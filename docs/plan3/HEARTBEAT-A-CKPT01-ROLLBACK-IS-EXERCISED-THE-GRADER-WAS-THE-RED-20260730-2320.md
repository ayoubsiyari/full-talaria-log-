# A: the CKPT-01 rollback IS exercised; two of the reds were the grader, not the product

Date: 2026-07-30 23:20
From: Manager A
Commit: `eb31ffaa7` on `manager-a/ckpt01-artifact-20260730` — zero product bytes touched

## Headline

I have been reporting CKPT-01 as "acceptance RED on multichart embed boot". That was the right
thing to report and the wrong thing to conclude from. Reading the first real rehearsal record
line by line, **the rollback is genuinely exercised with a working-product proof, and two of the
red signals are defects in my own grader.** CKPT-01 is much closer to satisfied than the verdict
line said. It is still **not** satisfied, and I am not claiming it is.

## What is actually proven, from the rehearsal record

| property | evidence |
|---|---|
| artifact matches its manifest before the run | 120 assets checked, `artifactMatchesManifest: true` |
| the browser loaded the RETAINED bytes | `chartServedLocal: 148`, `chartProxiedToLive: 0`, `chartRequestsToLiveOrigin: 0`, `mainDocumentSource: artifact`, `engineSource: artifact` |
| the product actually ran | replay index **2010 → 2384**, timestamp 1773222600000 → 1773245040000, both advanced |
| the proof is not a boolean | `isPlayingIsNotEvidence: true` — the assertion is a MOVED index, never an `isPlaying` flag |
| the rehearsal can fail | negative control corrupts the artifact, `wentRed: true`, `provesRehearsalCanFail: true`, `restoredToCapturedState: true` |
| the artifact survived being rehearsed | post-run integrity 120 checked, 0 mismatches |
| the residual hole is measured | 0 unanswered `/chart/**` requests; 83 of 120 retained assets exercised, 37 never requested — recorded as *unexercised coverage*, explicitly not as evidence they are unnecessary |

That is CKPT-01 point 2 done properly: a retained artifact plus a rollback somebody has actually
run, with the product demonstrably working on the restored bytes.

## The two reds were mine

**1. The multichart panel count could not fail honestly.** The grader polled
`document.querySelectorAll('iframe').length` through `page.evaluate(...).catch(() => 0)`. A
destroyed execution context and a genuinely empty grid produce the identical reading: zero. The
same record contradicts the verdict — `chart-embed.html` **was** served from the artifact, with
**72 chart requests and 0 misses** during that phase, and the harness's own comment states that a
single-panel boot never requests that file. So `iframes: 0` is a measurement I cannot trust in
either direction. It now counts attached embed **documents** via `page.frames()`, which survives
the navigation that kills an `evaluate`, and records whether the tag count was measurable
separately from its value.

I am **not** claiming the panels booted. I am claiming the instrument cannot tell us, and that
its own corroborating evidence points the other way.

**2. The assertion-control arm never booted, and the report called that a product finding.** The
verdict line read "the replay-advancement check did not go red with replay stopped", which
asserts the acceptance check is toothless. What actually happened is that the control arm
collapsed entirely — `hasChart: false`, and even *main document came from the artifact* failed.
It measured nothing. A dead control and a toothless check both leave `discriminates: false`, and
one sentence covered both.

The underlying predicate was written correctly and I want that on the record: it already required
`indexAdvanced === false` **and** a healthy boot, so it refused to accept a collapsed arm as
proof. The guard worked; the reporting did not. It is now a pure `classifyAssertionControl()`
carrying an explicit `inconclusive` flag plus the boot stage and failures, so the next reader can
see *why* the arm died.

## Teeth

11 → 18 cells. Four mutants applied **on disk** and each killed by a **named behavioural** cell;
the negative control reports `NOT_APPLIED`; the file restores byte-identical
(`c0432a0ea26be1a9`).

Worth recording because it is the same trap I keep finding in other people's suites:
**M3 initially SURVIVED.** Every one of my dead-arm cells set `hasChart: false`, so the `&&`
short-circuited and the data-length half of the predicate was never reached — I had written five
cells around a branch none of them entered. Killed by adding the realistic state it guards: the
shell boots, `window.chart` exists, and the series never loads. Replay cannot advance over an
empty series, so grading the control there would certify the check using a chart that could not
have moved either way.

## What remains before CKPT-01 can be called satisfied

1. Re-run the rehearsal so multichart is graded on the honest instrument.
2. Diagnose why the control arm did not boot. It is now recorded rather than swallowed, but it is
   not yet explained — the leading suspect is the second boot landing on the login shell, which is
   my own live row about `/chart/index.html` redirecting to `/login/`.
3. The manifest-coverage gap routed to B is unchanged: the newest repo manifest is `20260725b63`
   and production is b113, so a rollback on the newest manifest anyone can demonstrate from the
   repo lands ~50 builds back. That is B's to answer and it is not affected by tonight's work.

## Realm-eviction grade — still owed, and I am not inventing it

The read-only grading dispatch produced **no durable artifact**: there is no grading document and
nothing in `_evidence\manager-A\` for it. I would rather report that plainly than reconstruct a
verdict from memory of a chat summary. The five teardown kill-switches are confirmed live at b113
and b113 is the first build in which they can act, so the question is well posed and unanswered.
It needs a run that survives to an artifact, and the multichart boot path it depends on is the
same one CKPT-01 just found it cannot currently measure.
