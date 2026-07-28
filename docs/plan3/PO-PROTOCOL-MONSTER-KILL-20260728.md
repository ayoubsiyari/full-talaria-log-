# PO PROTOCOL — the three tests that decide whether the monsters die before canary

**2026-07-28 15:16. Ordered by how much each one changes the outcome, not by how easy it is.**

**Do them in order. Test 1 is worth more than the other two combined.** Stop and send results after each rather than batching — Test 1's answer changes what engineering does next, and holding it until all three are done wastes that.

**Do NOT do:** any further TradeZella comparison, or any further replay-speed sweep. **Both questions are closed and more data on them has zero value.**

---

## TEST 1 — Does closing a multichart leak a whole page? (~10 minutes)

**What it decides: whether the 1.6 GB memory monster is a three-line fix that lands before canary, or a defect we disclose and live with.** Nothing else you can do today is worth as much.

**Why you and not a manager:** the leak needs a real session with real panels, which is exactly what a harness has been failing to reproduce.

### Steps

1. Open the chart on the **test server** in a **fresh tab**. Load a normal chart and let it settle.
2. Open DevTools (F12) → **Memory** tab.
3. **Click the trash-can icon (Collect garbage) first.** Wait 3 seconds. **Do not skip this — without it you will count objects that were about to be thrown away anyway, and the numbers will be meaningless.**
4. Select **Heap snapshot** → **Take snapshot**.
5. In the filter box at the top of the results, type `Detached`.
6. **Find the row `Detached HTMLDocument` and write down the number in its count column.** If the row is absent, write **0**. **`HTMLDocument`, not `<div>` — the div count is noisy and we ruled the document count is the metric.**
7. Now open a multichart layout. **Wait until every panel has fully drawn.** Then close it and return to the single chart.
8. **Repeat step 7 five times.** Same layout each time. Note how many panels the layout has.
9. Click the trash-can icon again. Wait 3 seconds.
10. Take a second heap snapshot, filter `Detached` again, and **write down the new `Detached HTMLDocument` count.**

### Send me

Both counts, and the number of panels in the layout. **A screenshot of each filtered snapshot is better than typed numbers.**

### What the answer means — so you can read it yourself

- **Count climbed by roughly one per panel per cycle** (4-panel layout × 5 cycles ≈ 20 more) → **monster 2 is confirmed and it is small. It dies before canary.**
- **Count stayed flat** → my reasoning is wrong, the leak is somewhere else entirely, and the deferral stands. **This outcome is as valuable as the other one — it stops us fixing the wrong thing.**

---

## TEST 2 — Catch the spike in the act (~30 minutes, mostly unattended)

**What it decides: whether the idle-CPU spikes to 120% can be killed at all.** You are the only person who has ever seen them; two performance recordings both missed them. **We cannot fix what we cannot reproduce, so this is the difference between killing this monster and disclosing it.**

**Different instrument this time, deliberately.** The last two attempts used a *recording*, which is heavy and only covers a short window. This uses the live monitor, which is cheap and can run for half an hour.

### Steps

1. Open the chart on the test server.
2. DevTools → press **Escape**, or the three-dot menu → **More tools** → **Performance monitor**.
3. You will see live graphs. **The one that matters is `CPU usage`.**
4. **Now use the app normally for 20–30 minutes.** Open things, close things, replay, add indicators, open and close multichart. **Do not try to sit still — the previous two tests failed precisely because they were idle-only.**
5. **Watch the CPU line. When it jumps and stays high, immediately write down what you had just done in the previous ten seconds.** That last action is what we are missing.
6. If it spikes, **screenshot the Performance monitor at that moment.**

### Send me

The action that preceded each spike, and screenshots. **If it never spikes in 30 minutes, tell me that too** — it means the spike needs a longer or older session to appear, which is itself a finding and points back at the leak.

---

## TEST 3 — Reproduce the real memory workload (~10 minutes)

**What it decides: whether our memory measurements describe the actual bug.** Manager A flagged that our test harness reports a 33 MiB heap for a workload that supposedly reached multiple gigabytes, and refused to guess whether the build got better or **the harness is measuring a smaller scenario than the real one.** A was right to refuse. You have the real scenario; the harness apparently does not.

### Steps

1. Fresh tab, chart on the test server.
2. **Recreate the condition from Rayan's report as closely as you can: single layout, 1-minute timeframe, and let it run the way a real user would.**
3. Open **Chrome Task Manager** (`Shift+Esc`, or three-dot menu → More tools → Task manager).
4. **Write down the `Memory footprint` for the chart tab at the start.**
5. Work normally for about 10 minutes on that 1-minute chart.
6. **Write down the `Memory footprint` again.**

### Send me

Both numbers and roughly what you did between them. **If it climbs into the gigabytes, the harness is measuring the wrong scenario and A's doubt is confirmed. If it stays in the hundreds of megabytes, then something already fixed it and we need to find out what — because we would currently be disclosing a limitation that no longer exists.**

---

## Where this leaves "all monsters dead before canary"

**Straight answer: three of four are plausible, one is at risk, and I would rather say so now than at hour 47.**

| Monster | Honest odds before canary |
|---|---|
| **Trade Eater** (deletes trade history) | **Dies.** Fix built, sealed, verified. Needs the cache stamp bumped and a push. This is the one that actually mattered |
| **Hoarder** (memory) | **Test 1 decides it.** If panels leak, it dies cheaply. If not, it is disclosed |
| **Treadmill** (idle CPU) | **Wounded, not dead.** The mechanism is real but measured at 1–3 points against a 4.5-point noise floor. Expect an honest small gain, not a fix |
| **Spikes** (120% idle) | **At risk.** Never reproduced in two attempts. **Test 2 is the only thing that changes this** |

**The Treadmill is the one I do not think dies, and you should hear the reason rather than a percentage:** the noise between two of your own idle recordings was larger than the entire effect we measured from the mechanism we found. **That means the remaining idle cost is spread across many small sources rather than sitting in one fixable place, and finding them is weeks of work, not hours.** M7 already commits us to not claiming any CPU improvement smaller than 4.5 points, so we will not be able to dress this up — which is the correct outcome even though it is not the one you want.
