# DISPATCH A — Build both lag fixes NOW. Do not wait for the profile. Kill-switches are the safety net.

**2026-07-28 16:42. PO directive, accepted in full. Operating model changed.**

---

## 1. The rule that changes

**Old behaviour: hypothesise → ask the PO to measure → confirm → then fix. Eight of ten hypotheses wrong, and every one spent a PO test round.**

**New rule: when a cause is plausible and a kill-switch is available, BUILD THE FIX. Measure the fix, not the hypothesis.**

**The asymmetry that makes this correct, in the PO's terms:** a wrong fix behind a flag is reverted with one environment variable and costs us minutes. **A wrong hypothesis costs a PO test round, hours of wall clock, and the PO's attention — which is the scarcest resource on this project and the one I have been spending most freely.** I had the cost model backwards.

**This does not cancel measurement. It removes measurement from the critical path.** Profile and fix proceed in parallel; the profile then tells us which fix earned its place and which flag gets turned off permanently.

## 2. Build BOTH of these now, in parallel, each behind its own kill-switch

**Do not wait for the PO's 4-panel profile. Do not wait for each other. Do not sequence them behind a measurement.**

### FIX 1 — Background-panel render cadence

**During replay every panel renders synchronously on every tick.** Render the focused panel every tick; render non-focused panels at a reduced cadence.

**Why it is the strongest candidate:** it scales directly with panel count, which is exactly the shape of the PO's report — one chart fine, four charts 50% slower. **It needs no change to the synchronous render mechanism, only to how often it fires for panels the user is not looking at.**

**Kill-switch:** `__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1`. **Flag on restores current behaviour exactly.**

### FIX 2 — Per-tick allocation in the replay path

**15.9 MB/s aggregate churn is PO-measured.** Find the largest per-tick allocation in the replay update path and stop it allocating per tick — reuse buffers, hoist objects out of the tick, whatever the code shape allows.

**Kill-switch:** `__TALARIA_DISABLE_MC_TICK_ALLOC_REUSE_V1`.

**If the profile later shows the dominant cost is elsewhere, we turn one or both off and we have lost a flag, not a day.**

## 3. Non-negotiable constraints — these are what make shooting safe

1. **Kill-switch per fix, independently togglable, flag-on is byte-equivalent behaviour to today.**
2. **Change WHEN things draw, never WHAT is drawn.** No change to drawing, order or indicator rendering logic.
3. **PO visual verification before the train ships:** drawings, orders and indicators must render correctly. **A render-cadence bug that drops a drawing is worse than the lag and this is the one way these fixes can hurt us.**
4. **If a fix cannot be built behind a clean kill-switch, stop and say so** — that is the one condition where you come back to me instead of shipping.

## 4. The spikes may already be dead — and this needs no new test

**The PO's 120% idle CPU spikes have no identified mechanism and two recordings missed them. I have been treating them as unfound. On the evidence we already hold, there is an obvious candidate we have not connected.**

**Seventeen orphaned `M20Q6ReplaySystem` instances with live listeners, `RegisteredEventListener ×1,098`, and a `Pending activities` node retaining 5,541 kB.** Seventeen orphaned engines with registered async work and live listeners is **exactly** what produces sporadic CPU bursts on an idle chart: something fires, and seventeen dead engines all respond.

**So the memory fix already merging is also the leading candidate to kill the spikes.** No new hypothesis, no new test — it falls out of evidence collected an hour ago that I failed to join up.

**A: after the orphan fix lands, state whether any orphan retained a live timer, interval, listener or pending promise.** If yes, the spike mechanism is identified and closed by a fix that is already merged.

## 5. What stays cancelled, and this is a deliberate kill rather than caution

**M25 Packet 2, the rAF loop guard, stays cancelled even under the new rule.** Not from timidity — **the reward is below our measurement noise floor and the failure mode is a chart that silently stops repainting.** Shooting means taking good shots quickly, not taking every shot. **A bet you cannot prove you won, which can silently break rendering, is a bad bet with or without a flag.**

## 6. Priority order

1. **FIX 1 and FIX 2, in parallel, now.**
2. **Orphan fix merge** (already ruled) **plus the §4 live-handle answer.**
3. Profile when the PO's trace arrives — **to grade the fixes, not to authorise them.**
