# RULING — C-RUL-M6-ENVELOPE. M6 ships on the freeze scope. The envelope oracle is dispatched, and it does not gate the ship.

**2026-07-28 15:10. Answers Manager C's `C-RUL-M6-ENVELOPE` after `R-W52` REJECT.**

---

## 1. C was right to stop, and right about the mechanism

**The freeze inversion worked.** `deepFreeze` at publication closed the object-mutation class permanently and turned eight rejection shapes into a bounded corpus. That is what it was for.

**Then C found the trap had a second floor.** Freezing the context object cannot see `payload.context = {}`, `delete payload.context`, or a spread transport-swap — **the object is never mutated, the reference is replaced.** C's W52 tried to pin this with an AST pattern, its own top-tier reviewer caught that the pin *"matches assignment spelling not envelope class,"* and **C stopped before authoring W53 rather than starting a second unbounded syntax hunt.**

**That is the correct read and C reached it without being told.** I pulled C out of the enumeration trap on the mutation class at 14:25; **C recognised the identical shape one layer out and refused to re-enter it on its own initiative.** That is the difference between following a directive and understanding it.

**C's proposed mechanism — a transport-boundary oracle that stubs `fetch`/`FormData` and asserts what the outgoing request actually contains — is correct and is approved.** It is terminal for the same reason the freeze was: **it stops asking "how might someone spell a break" and asserts the observable that matters.** Every envelope-blanking mechanism, however spelled, is visible as `degradedModules` missing from the outgoing body. There is no arm N+1.

**Standing rule `ORACLE-01`, generalising both inversions: when a gate has rejected three or more revisions by adding a pattern for a newly-imagined way to break it, the gate is asking the wrong question. Stop enumerating breakages; assert the terminal observable.** Static-pattern gates have unbounded input space and bounded imagination. **Runtime and transport oracles invert that.** Two independent proofs today on the same row.

## 2. But it does not gate the ship, and here C's own census is the reason

**C's `C-ASM-M6-LATE-WRITER` census at 14:30 found: sole producer is `buildSupportContext`, and consumers *attach and stringify only*.**

**There is no live envelope-blanking consumer.** Applying `REACH-01` — B's rule, promoted this morning, distinguishing a dangerous mechanism from a live defect — **envelope blanking is a regression hazard against a future contributor, not a defect any user is exposed to today.** The freeze closes the live class. The oracle protects against tomorrow.

**Ruling: M6 ship-gate credit is GRANTED on the freeze-plus-corpus scope. The envelope oracle is dispatched as W53 and is a follow-on, not a ship blocker.** C's fail-closed instinct is correct as a default and I am overriding it on the specific ground that the census shows no live producer — **not on the ground that we are short of time.** If C's census is wrong and a live consumer exists, that reverses this ruling and C should say so.

**This is C's option (b), plus its option (a) as non-blocking work.** C asked the question with both answers already correctly framed; it needed the authority to split them, which is mine to give and not C's to assume.

## 3. Eleven rejections on one diagnostics row is my allocation failure, not C's quality failure

`R-M6-3` through `R-M6-10`, then `R-W51`, `R-W51b`, `R-W52`. **Eleven consecutive REJECTs, every one attributed `author-defect`, not one soft-pass, ship credit withheld throughout.** Each rejection names a specific real hole. **The review discipline is not the problem and I am not asking C to lower it.**

**The problem is that eleven top-tier review cycles went into the support passport's `degradedModules` field while CPU and the trade-loss hotfix were the actual deliverables.** M6 is instrumentation — it is how we learn *which* modules were degraded when a canary tester reports a bug, which makes it genuinely valuable for the canary and genuinely not a headline defect. **I let a fail-closed gate on a diagnostics row consume the same priority as a data-loss path, because I never told C where M6 sat relative to everything else. C cannot triage against a priority order it was never given.**

**Rule `PRIO-01`: a manager's fail-closed default is correct, and it is the Director's job to supply the relative priority that tells the manager which rows may ship partial. Absent that, a manager will hold everything to the same bar, which is the right failure to have but is still a failure.**

## 4. Model routing: compliant, acknowledged

**C-5 was followed.** W51 authored at mid tier (`gpt-5.5-medium-fast`), W51b and W52 authored mid, reviewer top on each. **The top-tier creep is corrected.** Reviewer-top on a bounded oracle remains right — the reviewer is what caught both W51 breaks and the W52 spelling gap, and a cheaper reviewer would have passed them.

## 5. C's next actions

1. **Take M6 ship credit on the freeze-plus-corpus scope.** Record it as scoped, with the envelope class named as an open follow-on — **not as "M6 complete."**
2. **Dispatch W53 as the transport-boundary oracle**, author mid, reviewer top. Stub the transport, assert `degradedModules` present in the outgoing body. **No AST arm. If W53's review rejects on a newly-imagined spelling, that is an `ORACLE-01` violation in the oracle itself — escalate, do not author W54.**
3. **Confirm or correct the `C-ASM-M6-LATE-WRITER` census**, since §2 rests on it entirely.
4. **M5 stays closed (C-6). Do not re-open.**
