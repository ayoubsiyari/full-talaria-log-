# REMAINING PO TESTS — exactly two now, three checks later. Detailed steps.

**2026-07-28 17:26. Supersedes the test list in `PO-FINAL-TESTS-AND-CUTS-20260728.md`; Test B is redesigned around a suspect rather than a blind hunt.**

---

# TEST A — 4-panel replay profile. ~5 minutes.

**Purpose: this is the baseline. A is already building two lag fixes on suspicion, and without this recording we will only be able to ask "does it feel better."** This recording tells us what actually dominates the cost and gives us something to compare against afterwards.

**Do this one first. It is the shorter of the two.**

## Steps

1. **Fresh browser tab.** Open the chart on the test server.
2. **Build the exact conditions where you see the lag:**
   - Open the **4-panel multichart** layout
   - **Indicators loaded** — the same ones you normally use
   - **Place one order**
3. **Start replay running.** Let it run **about 10 seconds** so it settles into a steady rhythm. **Do not record during startup — startup cost is not what we are measuring.**
4. Open DevTools → **Performance** tab.
5. **Park your mouse pointer outside the chart area and leave it still.** Mouse movement generates its own work and will pollute the recording.
6. Click the **round record button**.
7. **Record for 20 seconds. Not longer.** This scenario is dense and 20 seconds is plenty.
8. Click **stop**.

## Send me these three things

1. **The Summary donut** — the pie chart in the bottom panel showing Scripting / Rendering / Painting / System / Idle. **Screenshot.**
2. **The Bottom-Up tab**, click the **Self Time** column to sort by it, **top ~15 rows**, expanded enough that function names are readable. **Screenshot.**
3. **The raw file** — right-click anywhere in the recording area → **Save profile** → send the `.json`.

**Ignore the absolute percentages.** The profiler itself adds overhead and inflates everything. **What matters is the relative breakdown and which functions sit at the top.**

---

# TEST B — Do the spikes come from the leak? ~30 minutes, mostly passive.

**Redesigned. You are no longer hunting blind.**

**The suspect: 17 orphaned replay engines with 1,098 live listeners still attached. Dead engines that still answer when something calls them is exactly what produces a sudden 120% CPU burst on an idle chart.** If that is right, **the memory fix already merging kills your spikes for free** — and this test proves it before we ship.

**The design is a clean before-and-after in one tab: watch for spikes on a session that has never opened multichart, then watch again after multichart has been used.**

## Setup

1. **Fresh browser tab.** Chart on the test server.
2. Add your **usual indicators** and **place one order**.
3. DevTools → three-dot menu → **More tools** → **Performance monitor**.
4. **The graph that matters is `CPU usage`.** Leave this panel open for the whole test.

## Phase 1 — CLEAN. 15 minutes. Do NOT open multichart.

5. **Start replay** and let it run.
6. **Use the chart normally — but never open multichart.** Draw things, change timeframes, adjust indicators, scroll around.
7. **Watch the CPU line for 15 minutes.** Every time it jumps and stays high, **write down the time and what you had just done.**
8. **If it never spikes in 15 minutes, write that down too — that is the result, not a failed test.**

## Phase 2 — DIRTY. Same tab, do not reload. 15 minutes.

9. **Do not refresh the page.** Same tab, same session.
10. **Open and close the multichart layout 5 times**, waiting for panels to fully draw each time. Return to the single chart.
11. **Start replay again** and use the chart the same way you did in Phase 1.
12. **Watch the CPU line for another 15 minutes.** Note every spike and what preceded it.
13. **Screenshot the Performance monitor** at the moment of any spike.

## Send me

- **Phase 1: how many spikes, and what preceded each.**
- **Phase 2: how many spikes, and what preceded each.**

## What the answer means — you can read it yourself

- **Spikes only in Phase 2, or clearly more of them** → **the orphaned engines cause your spikes, and the memory fix kills them.** Monster 4 dies for free.
- **Spikes in both phases equally** → the orphans are innocent and the spikes have a separate cause we have not found.
- **No spikes in either phase** → the spikes need conditions neither of us has identified. **We disclose them rather than me sending you after them again.**

**This test also re-checks the residue question for free**, since Phase 2 is the same single-chart-after-multichart state you tested earlier.

---

# LATER — the verification round, after the fixes land

**Listing these now so they are expected rather than sprung on you. This is everything, and it is the last thing asked of you before canary.**

## Check 1 — visual correctness. **The most important one.**

**A is changing when the chart redraws. The one way that can hurt us is by dropping something that should be on screen.**

**Look at, on both single chart and 4-panel multichart:** drawings still appear and stay put; open orders and their price lines render correctly; indicators draw and update; the replay toolbar and buttons still work; nothing flickers or fails to appear when you pan or zoom.

**If anything is missing or wrong, say so immediately — that is a stop, and there is a kill-switch for every change.**

## Check 2 — does replay feel better?

**4-panel replay, same conditions as Test A. Just tell me: better, the same, or worse.** Words are fine.

## Check 3 — one heap reading

**Single chart → DevTools → Memory → trash-can icon → snapshot → type `M20Q6ReplaySystem` in the filter box.** Then cycle multichart 5 times, garbage-collect, snapshot again, same filter.

**The number must be 1 both times.** That is the whole check.

---

## Commitment

**Test A and Test B now. Then nothing until we hand you a build for the three checks above. No further exploratory rounds.**

**If A's profile shows the lag cost is spread thin with no dominant cause, you get told that straight and we disclose it rather than starting a fourth round of tests.**
