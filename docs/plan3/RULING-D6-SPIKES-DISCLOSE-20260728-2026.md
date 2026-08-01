# PO DECISION D-6 — the CPU spikes are disclosed as observed-but-uncharacterised, and canary is not held for them. Gate 15 closes. Below is the exact M7 wording, because the decision is only real once it is written down honestly.

**2026-07-28 20:26.**

---

## 1. The decision

**PO ruling D-6: disclose the spikes honestly as observed but not characterised, and ship canary.** Canary is not held for a defect we cannot reproduce.

**Gate 15 of `CANARY-GATE-20260728-2020.md` is closed. Gate 14, M7, is unblocked** — its wording depended on this and now has it.

## 2. Why this is the right call and not the convenient one

**The temptation with an unreproduced defect is to leave it out, because writing it down invites questions we cannot answer.** That is the option I listed and it is the one I would have refused.

**Equally, holding canary for it would be theatre.** We have recorded twice, for 33 and 60 seconds, and caught nothing. **There is no reason to believe a third recording succeeds where two failed, and no reproduction steps to hand a fixer.** Holding would trade a real deadline for an imaginary plan.

**Disclosure is the only position consistent with what we actually know.**

## 3. The M7 text — verbatim, for the known-limitations document

> **Occasional CPU spikes (observed, not yet explained)**
>
> **What we have seen:** on a browser tab that has been in use for a while, CPU usage occasionally jumps well above its normal level — we have measured brief peaks around 120% of one core — and then settles again. It is not tied to any action we have been able to identify.
>
> **What we have not been able to do:** reproduce it on demand. We recorded two full performance profiles, of 33 and 60 seconds, on sessions where the behaviour had been observed, and neither captured a spike. **We therefore cannot tell you what causes it, and we will not claim to have fixed it.**
>
> **What we suspect, without proof:** this release fixes two separate leaks that left abandoned chart engines running in the background with their event listeners still attached. Those are a plausible source of unexplained bursts of work. **It is possible this release removes the spikes as a side effect. It is equally possible it does not.** We will know from real usage, not from our own testing.
>
> **What you can do:** reloading the tab clears it. If you see it, we would value knowing roughly how long the tab had been open and whether you had used the multi-chart view in that session, because both are on our list of suspects.
>
> **What we commit to:** we will not describe this as resolved until we have reproduced it, fixed it, and shown the fix working. If it survives this release, it stays on this list.

## 4. Standing constraint this creates

**No later report, release note or status update may describe the spikes as fixed on the strength of them not appearing.** Absence in a short observation window is what we already have twice, and it was not evidence either time.

**If they stop appearing after this release, the honest statement is that they have not been observed since, with the observation period named.** That is a different claim from *fixed* and it must be worded as the weaker one.

## 5. Consequence for the M7 document as a whole

**This is the second item in M7 that is disclosed rather than solved**, alongside the multichart performance ceiling. **A third would start to make the document read as a list of excuses rather than a list of limits, so it is worth saying where the line is:** items belong in M7 when we know their shape and have chosen not to fix them in this window, or when we cannot characterise them at all and say so. **Items do not belong in M7 as a substitute for work we simply did not get to** — those are schedule misses and should be reported to the PO as such, not laundered into a limitations page.
