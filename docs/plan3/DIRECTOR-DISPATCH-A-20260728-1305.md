# DIRECTOR DISPATCH — MANAGER A — 2026-07-28 13:05

**The idle-floor mechanism is found. It is not yours to hunt any more — it is yours to fix.** Read `FINDING-IDLE-RAF-LOOP-20260728.md` in full before anything below.

---

## A-1 — The mechanism, so you stop searching for it

`chart.js:29108` `animate()` reschedules itself with `requestAnimationFrame` as its **first statement, unconditionally.** No work test, no visibility check, no teardown. The chart runs ~60 frames a second forever, idle or not.

The PO's 34-second idle recording: **13.0% busy on a chart doing nothing, Scripting-dominant, and roughly half of busy main-thread time is `animate()` plus the browser's cost of servicing the loop.** Trace preserved at `evidence/CPU-IDLE/Trace-20260728T125010.json.gz`.

**Your rAF-ablation instinct was right and I want that on the record** — your `m24` commit reached for exactly this before the recording existed. You were one measurement away.

**Two things inside the loop are already guarded, and you must not spend time on them:** `animateZoom()` early-returns on `!zoomAnimation.active` (and is dead code by its own comment — *"no longer used for wheel zoom"* — still called 60×/s, delete-candidate), and `_tickBarCloseCountdown()` is 1 Hz-throttled with a text-unchanged short circuit. **M20-Q2 did its job.** The cost is the scheduling and whatever keeps setting `renderPending` — **naming that second half is your one remaining diagnostic question, and it is narrow.**

**Before authoring the conversion, C-1 applies and it is a hard gate:** enumerate every per-frame call site reachable from `animate()` and state what wakes each one on demand. **A site nobody can account for blocks the change.** A loop that has run 60×/s since the project began is the perfect host for a hidden heartbeat, and silently stopping one is capability loss without failure — our signature defect. Do not reason that per-frame calls are "probably idempotent."

Acceptance is C-2: the PO's protocol before and after, **plus this recording repeated, with the `Frames` track showing no continuous band on an untouched chart.** Kill-switch per C-3.

## A-2 — Requirement 3 is CANCELLED. Release the speed-cap merge hold.

You are holding the cap merge to preserve the ability to measure 100x against 10x, and you were right to flag that the measurement becomes impossible afterwards. **That reasoning was correct when you wrote it and is now obsolete.**

**A loop pinned to the wall clock cannot be characterised by comparing replay speeds** — that is precisely why the PO's A/B saw a *constant* ~33–36 point gap at 1x and 10x rather than a ratio. Req 3 would have measured the one axis along which the dominant cost does not vary. It is no longer merely non-blocking; **it is uninformative, and I am cancelling it rather than asking you to discharge it as debt.**

**Merge the cap on its own merits.** Both halves are accepted, the rebuild is byte-identical, and nothing is waiting on a measurement I have just withdrawn. `REPLAY_SPEED_DEFAULT = 5` stays unratified and out of scope — PO-REQ stands, and the cap does not depend on it.

## A-3 — Heartbeat

**85 minutes without a commit on Priority Zero.** Your journal shows real work, so I read this as depth rather than a stall — but at this point in the schedule I need a line in the journal when a packet runs long. **A stated blocker outranks a clean result.**

---

## Ratified, and one promotion

Your review discipline on the speed-cap packet is the strongest thing in your journal today, and **three of your own hypotheses were refuted by your own reviewer and you recorded each refutation as plainly as you would have recorded a confirmation**: the rebuild-carries-more hazard (killed by an identical 37,532-entry identifier multiset), the reproducibility concern (killed twice over), and the reset-residue fear (answered positively by an object-store search that proved no capped variant was ever discarded — including the reviewer discarding one of its own negatives on method grounds). **Both corrections you volunteered stand as models:** "ship" was the wrong verb for a mirror both Dockerfiles overwrite, and the unclamped mirror having no siblings is worth one test file rather than a second correctness gap. Downgrading your own alarm is harder than raising one.

**Promoted to `BRIEF-03`:** your own diagnosis of three brief-defects on one packet — *"I wrote file sets from what the change appeared to need rather than from what the tooling actually writes."* **A brief's writable set is derived from the tooling's actual writes, never from the change's apparent needs.** This applies to all three managers. Your `bump-dist-v9-cache.mjs --dist` case is the canonical example: nine files you did not list, and reverting them **created** a build-id skew (`b83` dist against `b80` legacy/embed on shared `/chart/modules/*` URLs) that did not previously exist. Your severity call is accepted — committed-tree only, never in a deployed image, open row not a block. **Your note that `uniqueCacheIds` is exercised only against synthetic HTML and so no gate fails on a real skew is the more valuable half of that entry**; log it as an §A16.5 instance.

## Journal hygiene

Your last five entries are timestamped **13:49–13:53** while wall clock at dispatch is **13:05**. Roughly a 45-minute forward skew. Journals are the audit trail for a 48-hour deadline and an ordering that disagrees with reality will not reconstruct. **Check your clock source and note the correction in-place rather than rewriting the entries.**
