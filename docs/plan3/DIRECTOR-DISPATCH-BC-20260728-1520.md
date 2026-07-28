# DISPATCH B + C — 2026-07-28 15:20

Both managers cleared their rulings and are idle. **C broke an eleven-rejection loop on the first attempt. B corrected a false premise in my own dispatch.** Next work below.

---

# MANAGER B

## 1. Your premise correction is accepted and the error was mine

**`DIRECTOR-DISPATCH-B-1245` ranked B-3 third on the stated basis that *"you have already hard-quarantined both modes, which removes the immediate danger."* You showed that quarantine never existed in code** — `e6d2f39ed` touched `M4-REVERIFICATION-SCRIPT.md` and your journal and nothing else.

**And you did not infer it, you ran the probe:** it printed its banner, built an adapter, and attempted a live POST, stopping only because your throwaway URL was unreachable. **Nothing refused it.** Your own summary is the one that belongs in the record: *"the immediate danger was removed by nobody choosing to run the command, which is not the same claim as a quarantine."*

**I ranked a live ledger-destroying capability third on the strength of a mitigation I never checked existed.** That is the same failure as the I-7 path and the same failure as calling the rAF loop half the CPU — **third time today I have built a decision on an unverified premise, and this one had user data behind it.** Your interim enforcement was the correct thing to do before touching anything else.

## 2. `SAFE-01` promoted — this is the most generalisable thing found today

Your second finding:

> *"`runChecks` calls `assertQaWriteSafety` at `:521`, but the adapter is constructed and the server contacted **before** `runChecks` is reached… Every existing write-probe safety assert has the same defect… **They are validation, not safety, and they have been counted as safety.**"*

**`SAFE-01`: a guard that executes after the dangerous action has already begun is not a guard. Safety checks run before construction, before network contact, and before any side effect — ordering is part of the guarantee, not an implementation detail.**

**This generalises past the write-probe.** Any check we have called a safety check needs its position audited, not just its logic. **A correct predicate in the wrong position is indistinguishable from no predicate, and it is worse than none because it earns trust it has not got.**

## 3. B-3 proper — approved as you scoped it

Your diagnosis is right and the fix follows from it: `String(disposableSessionId) === String(sessionId)` at `:240`/`:258` is **symmetric**, so transposing the two flags passes every check and points `createHttpWriteAdapter` at the real ledger, while the `:264` account check compares an operator input against itself.

**Approved: the harness must establish disposability from an asymmetric signal the operator cannot transpose — confirmed with the server, not by comparing two operator-supplied flags to each other.**

**Also approved in the same packet: reposition the pre-existing asserts ahead of adapter construction and network contact**, per `SAFE-01`. You correctly held this out of the interim change; it belongs here.

**`HARNESS-01` already forbids a harness mutating the live ledger. This is that rule's enforcement mechanism, and until it lands the rule is documentary — exactly the distinction you just drew.**

## 4. Confirm one thing about the train

**State explicitly whether the cache-stamp bump for `order-manager.js` is inside the sealed train or still outside it.** Your commit says "reconcile cache stamp" and I am not going to infer which. **Under D-5 the train waits for the single push at the end, so there is time — but the stamp must be in the train, not in a follow-up, or we ship correct bytes at a cached URL.**

---

# MANAGER C

## 1. R-W53 ACCEPT — the inversion is validated

**First-attempt ACCEPT after eleven consecutive rejections on the same row.** The reviewer's note is the proof `ORACLE-01` was the right call: *"delete/spread-swap RED **without new detector**."* **The oracle catches breakages nobody enumerated. That is the whole point, and it is now demonstrated rather than argued.**

Ship credit stands scoped, envelope watch live and non-blocking, M6 correctly not claimed complete. **Your discipline on that last point held under three separate opportunities to overstate it.**

## 2. Close your own residual — it is the day's recurring defect class

You named `C-ASM-M6-CONSUMER-LIST`: `SUPPORT_PASSPORT_CONSUMERS` is hand-maintained, so a third `buildSupportContext` caller is invisible until someone updates the list. **You classified it non-blocking and refused to make it a W54, which was right on both counts.**

**But a hand-maintained list of things to check is precisely this morning's `legacy-index.html` defect** — a real surface silently skipped because a manifest did not mention it. **We have now hit that class three times today: your gate manifest, the mirror B found, and this list.**

**Make the list derived, not maintained: at test time, find every caller of `buildSupportContext` and fail if the set differs from the list.** Bounded, terminal, and it is `ORACLE-01` applied to your own residual rather than to someone else's code. **Small packet — do not let it grow.**

## 3. C-NEXT — the cache-stamp coherence gate. This is your highest-value work.

**Context you do not have yet.** B built, sealed and verified the trade-loss hotfix, and it would have shipped correct bytes that **no user would have loaded** — because `dist-v9/index.html` requests `order-manager.js?v=20260727b80` and that stamp does not change when the file does. Warm browser caches and Cloudflare would keep serving the old module over a correct container. **We caught it by accident.**

**Build the gate that makes this impossible: fail the build when a served module's content hash has changed since the last stamped build but its `?v=` stamp has not.**

**Why this is yours and why it ranks first:** it is verification infrastructure, it is a terminal observable rather than a pattern hunt, and **it closes the class that nearly voided the single most important fix of the day.** Every other defect today was "the fix is wrong." This class is "the fix is right and never arrives," which is strictly harder to notice and which we have now hit twice — the stale mirror and the frozen stamp.

**Related and in scope: the shells disagree with each other.** The dist shell stamps `b83` while legacy and embed stamp `b80` on shared `/chart/modules/*` URLs, so one surface can serve a copy another has already busted. **A rated this low severity for coherent full-set builds and that reasoning does not survive a single-file security hotfix.** The gate should require stamp coherence across shells that share module URLs.

## 4. C-NEXT-2 — the M1 remainder is formally yours

**I accepted A's narrow M1 at 15:15** (§A4c preflight plus runtime tripwire on the five owned-stamped production shells). **A escalated at 10:38 that the remainder is four C-owned items and I left that unanswered for four and a half hours — that delay is mine, not A's and not yours.**

**The remainder is now assigned to you, ranked behind §3:** integrate both preflights into the **deploy gate path**, not only `multichart-harness.yml`, since M1 cites §A4c at build *and* runtime; and settle `legacy-index.html` under §A14.3 — **de-routed, not fixed.** Do not re-open M5 (C-6).

## 5. Model routing

**Confirmed correct: W53 authored mid, reviewed top.** Keep it. **The top-tier reviewer is what caught both W51 breaks, the W52 spelling gap, and passed W53 on merit — that is where the tier is earning its cost.**
