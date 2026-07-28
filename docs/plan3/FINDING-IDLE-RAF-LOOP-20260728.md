# FINDING — the constant overhead is an unconditional 60fps render loop

> ## ⚠️ CORRECTION 13:30 — mechanism confirmed, MAGNITUDE OVERSTATED BY ME
>
> A ran an ablation A/B (7 un-ablated samples across 3 sessions, min 14.00%; 3 ablated, max 8.49%) and **independently confirmed the mechanism**. It also refuted my magnitude claim, and A's evidence is better than mine because it measures what *removing* the loop buys rather than what the profiler *attributes* to it.
>
> **§2 below says "roughly half of all busy main-thread time is the rAF loop." That is true as profile attribution and I let it imply recoverable CPU. It does not.** Time attributed to `animate()` includes `render()` doing legitimate work that must still happen. **The share of a profile is not the size of the prize.** That distinction is mine to own; A drew it by experiment.
>
> **Citable range: 1.3 to 3.4 percentage points of one core.** A explicitly refuses a point estimate and **forbids "we halved idle CPU"** being carried up the chain — the 49% harness reduction is a fact about that harness at 142.5 fps and does not transfer. The range is a **ceiling twice over**: it is what deleting the loop entirely buys, and a behaviour-preserving guard must keep some frames.
>
> ### Three consequences the PO must hear, none comfortable
>
> 1. **The majority of the idle floor remains unexplained.** Against a ~12.3% clean idle baseline, this mechanism accounts for **11–28%** of it. We named a real culprit and it is not the main one.
> 2. **The spikes are completely untouched.** `spikeGroups` is empty in all six runs at a 50% threshold — **the harness never reproduced the PO's spikes-to-120% in either arm.** This finding addresses the floor and says *nothing* about the spike family, which is the PO's most alarming symptom. A raised this unprompted before being asked.
> 3. **The fix is substantially bigger than the loop.** See §5.1.
>
> ### Director resolves A's open unit question
>
> A asked, correctly and against its own interest, whether the PO's ~20% is whole-Chrome or the tab row alone, since Chrome's task manager reports per-process rows normalised to one core. **Answered from the PO's own screenshot:** the task manager shows discrete per-tab rows — `Tab Backtesting 0.1`, `Tab DevTools 2.2`, `Tab Talaria — V9 Live 18.2`. **The PO's figures are per-tab rows.** So the comparable harness figure is the **renderer 12.18%**, not whole-Chrome 16.37%, and **the correct framing is 11–28% of the floor, not 6–16%.** A raised the reading that flattered us least and it turns out to be the right one.
>
> ### §5.1 — the fix is an accessor, not a guard, and the naive version ships a starvation bug
>
> A's own sketched guard — arm only when work is pending, re-arm from `scheduleRender()` — **would have shipped a worse defect than the one it fixes.** `scheduleRender()` is one of many paths that set `renderPending`: **29 sites assign it, and 24 bypass `scheduleRender()` entirely** (`chart.js` ×4, `chart-main.js` ×1, `panel-cmd-bridge.js` ×3, `replay-system.js` ×11, `order-manager.js` ×10). Under a `scheduleRender`-only guard, **all 24 are silently starved** until something unrelated happens to arm a frame. **That is capability loss without failure — precisely the class C-1 exists to prevent, and C-1 caught it.**
>
> **The surviving shape:** all 29 writes are property writes on a chart instance, so converting `renderPending` into a **setter that arms the loop on write** catches every writer without editing any of them. Two consequences:
>
> - **The fix stays entirely inside `chart.js`, so it does not touch B's territory** despite 10 writers living in `order-manager.js`. No commit spans two territories and no slot contention with the hotfix train. **This is the deciding advantage.**
> - **A prototype accessor will not work.** The constructor assigns `this.renderPending = false` (`chart.js:1223`), an own data property that shadows any prototype accessor. It must be `Object.defineProperty(this, 'renderPending', …)` over a backing field. **In the brief now rather than discovered in review.**
>
> ### Confirmed beyond my read, and two author corrections worth keeping
>
> **`animateZoom()` is dead at runtime, not merely unused for wheel zoom:** `zoomAnimation.active` is never assigned `true` anywhere in the tree — zero hits. Wheel zoom runs through `_scheduleWheelBurstRender`, which has its own rAF and is untouched. **`_animateBound` reaches `requestAnimationFrame` from exactly one line.** Both narrow the blast radius usefully.
>
> A rejected two of its author's own passing tests: **the countdown smoke test proves nothing** — the harness runs replay active-but-paused, so `_getBarCloseCountdownText()` returns a frozen clock and the countdown path was never exercised, making the blast radius **untested, not tested-good** — and the `panBy` leg is vacuous because `panBy()` calls `this.render()` directly and passes with the loop dead. **Preserving the countdown costs ~0.7% of the recovered saving, so it is not a design constraint.**

**Opened:** 2026-07-28 13:05 by Director, on the PO's idle Chrome Performance recording.
**Status:** mechanism **NAMED**. Owner: **A**. This closes the "mechanism UNKNOWN" row that has been open since the idle floor was first measured.
**Evidence:** `evidence/CPU-IDLE/Trace-20260728T125010.json.gz` (8.19 MB, 34.31 s, single chart, no indicators, replay stopped).

---

## 1. The mechanism

`chart v 1.4/chart/chart.js:29108` — deployed as `chart.js?v=20260726b75:28647`:

```js
animate() {
    requestAnimationFrame(this._animateBound);   // ← first statement, no condition
    this.animateZoom();
    if (this.renderPending) { this.render(); ... }
    ...
    this._tickBarCloseCountdown(performance.now());
    ... FPS accounting ...
}
```

**The reschedule is the first statement and it is unconditional.** There is no "is there work to do" test, no visibility check, and no teardown. Once started, this loop runs ~60 times a second for the lifetime of the page whether or not anything has changed.

**That is, exactly and structurally, a fixed cost per unit of wall-clock time** — which is the shape the PO's A/B measured independently: a constant ~33–36 CPU points regardless of replay speed. **The two findings arrived from opposite directions and agree.** A loop pinned to wall clock cannot scale with replay speed, so it cannot show up as a ratio; it shows up as a constant, and it dominates at 1x because there is no real work to hide it.

## 2. What the recording says

Busy main-thread time is **4,454 ms of 34,313 ms = 13.0%** on a chart doing nothing. **Scripting-dominant** (2,365 ms Scripting against 581 ms Rendering and 460 ms Painting).

| Activity | Self | Total | Note |
|---|---|---|---|
| `animate` / `Function call` @ `:28647:12` | 510.9 + 150.3 ms | **1,752.9 ms (48.7%)** | the loop body |
| `requestAnimationFrame` | 617.4 ms (17.2%) | — | browser cost of servicing it |
| `Animation frame fired` | 315.7 ms | 1,131.2 ms (31.4%) | dispatch container |
| `talaria-v9-live.js` (`W5`, `f7`, `M3`, `A1`, `xA`, `j2`, `I8`, `Qs`) + `Timer fired` | — | ~600–700 ms (~15%) | React-side pumps |
| Layout / Layerize / Pre-paint / Paint / Commit / Recalculate style | ~1,030 ms | — | pipeline, largely downstream |
| `removeChild`, `createElementNS`, `appendChild`, `replaceChildren`, `setAttribute` | ~200 ms | — | **DOM churn on an idle chart** |
| `Profiling overhead` | 191.5 ms (5.3% of busy) | — | instrument ≈ 0.56% of wall clock |

**Roughly half of all busy main-thread time is the rAF loop and the browser's cost of servicing it.** Self and total overlap, so these do not sum cleanly and no exact partition is claimed — but the dominant single cause is not in doubt.

**Two corroborating details.** `Cumulative Layout Shift 0.01` is fine, but its worst cluster reports **109 layout shifts** on a page nobody is touching, and the DOM-mutation row above is the cause. **This instrument cost is small** (0.56% of wall clock) — unlike A's earlier attribution attempt where the profiler was 6.3 of 13.12 points — so the 13.0% figure is close to real.

## 3. What is *not* the cost, so A does not chase it

Both obvious suspects inside the loop are already guarded, and **this matters because it means the fix is the scheduling, not the body**:

- **`animateZoom()`** early-returns on `!this.zoomAnimation.active`. It is also **dead code by its own comment** — *"no longer used for wheel zoom"* — and is still called 60 times a second. Delete-candidate, but not the cost.
- **`_tickBarCloseCountdown()`** is throttled to 1 Hz, returns on `document.hidden`, and short-circuits when the countdown string is unchanged. **M20-Q2 did its job.** Not the cost.

So the expense is the **loop itself plus whatever keeps setting `renderPending`**, not the two things a reader would suspect first. Naming that gap is A's next step, and it is narrow.

## 4. The detail that shows we already knew, in one place only

`chart.js:29129-29135`, inside this same function:

> *"Multichart embed panels are PASSIVE mirrors of host tile A ... Running an independent once-a-second countdown re-render here makes a same-pair panel constantly re-render (and visibly jump) while idle, unlike the smooth main chart."*

**Someone diagnosed idle re-rendering precisely, and fixed it for embed panels via M20-Q2 while leaving the host loop unconditional.** The phrase *"unlike the smooth main chart"* is the reason it was never pursued further: the main chart looked smooth, so the always-on loop read as the *healthy* case and the panel as the anomaly. **It was the other way round.** This is worth recording as a reasoning failure, not a coding one — the loop was load-bearing for how we judged everything else.

## 5. The fix shape, and its one real hazard

**On-demand rendering.** Schedule a frame only when work exists — a data commit, user input, an active zoom animation — and stop scheduling when the queue drains. The 1 Hz countdown becomes a 1 Hz timer rather than a 60 Hz poll that discards 59 of every 60 calls. **This is what lightweight-charts does, and we already have a prototype of it in this repo from earlier in the project**, so the target design is not speculative.

**The hazard, and it is the whole risk of this change:** anything currently relying on the loop as a **hidden heartbeat** breaks silently when the loop stops. A per-frame call site that happens to keep some state fresh will simply stop being called, and nothing will report an error — **this is the project's signature failure class, capability loss without failure.** So:

**Ruling C-1: no on-demand conversion is authored before a census of what depends on being called every frame.** Enumerate every per-frame call site reachable from `animate()`, and for each one state what wakes it under the new scheme. A site nobody can account for blocks the change rather than being assumed idempotent.

**Ruling C-2: acceptance is the PO's protocol, before and after, plus this recording repeated.** Target: idle busy time from 13.0% to near zero, and `Frames` showing **no** continuous band on an untouched chart. A synthetic frame counter does not satisfy this.

**Ruling C-3: kill-switch required**, per standing policy, defaulting to the new behaviour with the always-on loop restorable by flag.

## 6. Consequences for other open rows

- **The "mechanism UNKNOWN" row on the ~7.79% untraced idle floor is CLOSED.** This is the mechanism.
- **A's six-React-pumps line is re-sized, not revived.** The `talaria-v9-live.js` timer work reads ~15% of busy time here — real, second place, and worth its own pass after the loop.
- **`_mcDiag.resamples` at 1x vs 10x is no longer the highest-yield measurement.** It was a proxy for finding a time-scaled cost; we now have the cost directly. Keep it as confirmation, not as the lead.
- **Recording caveat:** the PO left **Screenshots enabled**, which inflates Painting. Painting is 460 ms of 4,454 ms, so it cannot change the Scripting-dominant conclusion. Repeat runs should disable it.
