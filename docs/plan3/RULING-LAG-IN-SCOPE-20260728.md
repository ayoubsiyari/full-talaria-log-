# RULING — PO directs the multichart lag fix INTO scope before canary. Accepted, with one measurement first, because we have never profiled the slow scenario.

**2026-07-28 16:27. PO directive: the ~50% multichart slowdown is to be fixed before canary, not disclosed. Canary is 3–4 hours with testers on standby, so the gate is our readiness, not their availability.**

---

## 1. Accepted, and my "not in two days" answer was too pessimistic for the wrong reason

**I told the PO this was real engineering rather than a two-day job. That judgement was about the *general* churn problem, and the PO is not asking for the general problem.** With roughly 38 hours before a 3–4 hour canary, a bounded fix to a measured top cost is feasible. **In scope.**

## 2. The obvious lever is DEAD, and A's own journal is why

**I was about to direct A's blocked rAF-loop guard (Packet 2) at this, on the reasoning that four panels each running an unconditional 60fps render loop would be four times the waste. That reasoning is wrong**, and A had already recorded why:

> *"14 of the 17 `chart.js` clearing sites are `this.renderPending = false; this.render();` — **synchronous renders that deliberately bypass the rAF path**… **During replay playback, the dominant scenario on this entire row, `scheduleRender()` takes the synchronous branch and contributes nothing to the counter.**"*

**During replay, rendering does not go through the rAF loop at all. It is synchronous, per tick.** So the rAF guard is an *idle* CPU fix and would do **nothing** for the 50% replay slowdown.

**That is the sixth premise today that would have been wrong, and the only one caught before I acted on it — by reading a manager's journal instead of reasoning from my own model.**

## 3. The actual reason we have no lag fix: we have never profiled the slow scenario

**Every CPU measurement today — both PO traces, A's ablation, the 13.12% idle floor, the six React pumps — was taken on an IDLE, SINGLE chart.**

**The defect the PO cares about is a 4-panel multichart during replay. It has never been profiled. Not once.**

**That is the gap, and it is embarrassing rather than complicated.** We spent the day refining measurements of a scenario the PO never complained about, while the scenario they did complain about went unmeasured. **`PRIO-01` again: I never told anyone which scenario was the target, so everyone kept sharpening the instrument they already had.**

## 4. Dispatch — Manager A. Measure first, and it is one session.

**Requirement 1, immediately: a Chrome Performance recording of a 4-panel multichart during replay**, with indicators and an order present — the PO's exact reported conditions. **Report the Summary breakdown, the top Bottom-Up entries, GC frequency and total GC time, and the top allocation sites.**

**Do not fix anything before this exists.** Every wrong turn today came from acting on an unmeasured premise, and I have made six of them.

**Requirement 2, conditional on requirement 1:** fix the top cost if it is bounded and localised. **Candidates, ranked by my expectation and explicitly not by evidence:**

1. **Per-tick allocation churn** — 15.9 MB/s aggregate is PO-measured and GC pressure is the leading hypothesis. If the profile shows heavy GC, find the top allocation site and stop it allocating per tick.
2. **Background-panel render cadence** — during replay, every panel renders synchronously per tick. **Rendering non-focused panels at a lower cadence is bounded, needs no change to the synchronous-render mechanism, and scales directly with panel count.** Likely the best value-to-risk ratio available.
3. **Per-panel resample per tick** — A previously established the per-tick resample count is fixed rather than dataset-proportional, but four panels means four of them.

**Constraints, non-negotiable given this ships days before a canary:** kill-switch on any render-path change; **no change to what is drawn, only when or how often**; and drawings, orders and indicators must be visually verified by the PO before it ships, because a render-scheduling bug that drops a drawing is worse than the lag.

**Requirement 3: report honestly if the profile shows the cost is diffuse.** If the 50% is spread across many small costs with no dominant term, **say so and we disclose rather than thrash.** The PO gets that answer straight; they do not get a fix that does not work.

## 5. Dispatch — Manager C. Two items, and the second is why the PO will finally feel your work.

**Item 1 remains the automated M-6 leak gate.**

**Item 2, new and now ranked equal: a repeatable 4-panel replay performance benchmark on your live browser runner.** Fixed dataset, fixed indicator set, fixed panel count, fixed replay speed, reporting frame timing and GC. **Without it, A's lag fix cannot be proved and we are back to asking the PO whether it feels better.**

**This is the highest-leverage thing you can build right now**, because it is the acceptance instrument for the PO's top priority, and **the PO has spent today hand-running heap snapshots because we had no such instrument.**

## 6. The PO's challenge to C's value — answered honestly

**The PO reports having seen no value from C's work. That is a fair reading and it is substantially my fault.**

**What is true:** C's output is preventive, and prevention produces nothing visible until something is prevented. **And I spent eleven of C's top-tier review cycles on the support passport's `degradedModules` field — a diagnostics row — while the PO's actual pain was memory and lag.** That is `PRIO-01`, it is mine, and the PO's frustration is the correct response to it.

**What is also true — value already delivered, whether or not it was visible:**

**The cache-stamp gate was validated independently by Manager A within the hour, on a different row.** A wrote, about its own M25 work:

> *"The served page loads `/chart/chart.js?v=20260727b80` and this packet does not bump it… before anyone tries to read this counter off the deployed site, the token must move, or a cached response serves the pre-M25 engine and the counter is simply absent."*

**Two managers, independently, on unrelated work, hit the same hazard within an hour. B nearly shipped the trade-loss fix to zero users through it. C's gate is the thing that makes that class impossible.** Without it, the single most important fix of the day could have gone out and protected nobody.

**And the deploy-path preflight C wired today catches the missing-module class** — the exact failure that produced the indicator-lag regression that cost days: a module silently absent from a shell with no error raised.

**What the PO will directly feel, once C's current queue lands:** the M-6 gate replaces their manual heap-snapshot rounds, and the replay benchmark replaces "does it feel faster" with a number. **Both are C's work aimed at the PO's own priorities rather than at a diagnostics field, and that redirection is the correction to my error, not to C's.**
