# FINAL PO TEST SET — two tests, then nothing until we hand back a build. Plus three cancellations to stop the circling.

**2026-07-28 16:34. PO is out of patience with diagnosis and is right to be. This is the last thing asked of them before a fixed build.**

---

## 1. Cancellations — decided now, not deferred

**The PO's complaint is that we circle a problem we already understand. Three items are the circling, and they are cut.**

### CUT 1 — A's rAF loop guard (M25 Packet 2). CANCELLED before canary.

**A has held this blocked pending "a countdown wake mechanism chosen and specified with teardown." I am not going to specify it. I am cancelling the packet.**

**Reasoning:** the reward is 1.3–3.4 CPU points on an **idle** chart, against a measurement noise floor of 4.5 points. The risk, in A's own words, is *"a chart that silently stops repainting"* — a starvation bug that is indistinguishable in the field from an accessor bug. **And per §2 of the 16:27 ruling it does nothing whatsoever for the PO's actual complaint, because replay renders synchronously and bypasses the loop.**

**A win smaller than our ability to measure it, with a catastrophic failure mode, on a scenario nobody complained about, days before showing real users. Cancelled.** The idle CPU floor goes into M7 as a disclosed limitation. **A's blocked packet is now closed rather than pending — it should not consume further attention.**

### CUT 2 — SURF-1 and all remaining M25 work. DEFERRED past canary.

**SURF-1 asks whether measurements on two different shells are comparable. It gated the trustworthiness of CPU claims — and we are no longer making CPU claims, because CUT 1 removes the only CPU fix.** Nothing downstream depends on it. **M25's remaining value was instrumenting the loop we just cancelled.**

### CUT 3 — all further diagnosis of the idle single-chart scenario.

**Every CPU measurement today was on an idle single chart, and the PO never complained about an idle single chart.** No further idle profiling, no further ablations, no further React-pump attribution. **That entire line is closed.**

**Everything A has is now on exactly two things: the memory leak and the 4-panel replay lag.**

---

## 2. TEST A — the 4-panel replay profile. ~5 minutes. This is the one that matters.

**This is the measurement that does not exist and that blocks the lag fix.** Every profile taken today was of an idle single chart. **The scenario the PO actually complains about has never been recorded once.**

### Steps

1. Open the chart on the test server. **Set up exactly the conditions where you see the lag: 4-panel multichart, your indicators, an order placed.**
2. DevTools → **Performance** tab.
3. **Start replay running.** Let it run a few seconds so it is in steady state.
4. Click the **record** button (circle). **Record for 20 seconds only** — short is fine, this scenario is dense.
5. Stop. **Then send three things:**
   - **The Summary donut** (bottom panel) — Scripting / Rendering / Painting / System / Idle
   - **The Bottom-Up tab**, sorted by Self Time, top ~15 rows, expanded enough to read function names
   - **The saved `.json` file** — right-click in the recording area → Save profile

**That is the whole test. 20 seconds of recording.**

**Why you and not A:** your machine is where the 50% is observed, and every profile you have produced today has been better evidence than anything the team generated. **This is the last profiling I will ask of you.**

## 3. TEST B — the spike. ~30 minutes, mostly passive. Only you can do this one.

**The 120% idle CPU spike is the only monster with no identified mechanism, and you are the only person who has ever seen it.** Two attempts missed it because both sat idle in a fresh tab.

### Steps

1. **Use a browser tab you have already had open for a while** — not a fresh one. This matters; the previous two attempts failed on fresh tabs.
2. DevTools → three-dot menu → **More tools** → **Performance monitor**. Watch the **CPU usage** graph.
3. **Use the app normally for 20–30 minutes.** Replay, indicators, drawings, open and close multichart, place orders. **Do not sit still.**
4. **When CPU jumps and stays high, write down what you did in the previous ten seconds** and screenshot the monitor.
5. **If it never spikes in 30 minutes, tell me that** — it is a real finding and it means the spike needs conditions we have not identified.

**If Test B produces nothing, the spike is disclosed rather than fixed. I am not going to keep sending you after it.**

---

## 4. What the team does WITHOUT the PO from here

**Everything else. Explicitly removed from the PO's plate:**

| Work | Owner | Replaces |
|---|---|---|
| Memory leak fix — retaining `Map`, release `fullData` | A | — |
| **Automated M-6 leak gate** | C | **PO's manual heap snapshots** |
| **4-panel replay benchmark** | C | **"does it feel faster?"** |
| Lag fix from Test A's profile | A | — |
| Live-surface probe | B | PO checking served bytes |
| Trade-loss hotfix train | B — done, awaiting push | — |

**The PO has hand-run four rounds of heap snapshots today because we had no instrument. C's two items exist so that never happens again.**

## 5. Commitment

**After Test A and Test B, nothing further is asked of the PO until we hand back a build to verify.**

**That verification will be two things and no more:** confirm drawings, orders and indicators still render correctly after the render-path change, and confirm the replay lag is better or is not. **Both are "look at it and tell us," not measurement.**

**If A's profile shows the lag cost is diffuse with no dominant term, the PO is told that straight and we disclose.** No thrashing, no fifth round of exploratory tests.
