# PO PROTOCOL ROUND 2 — after Test 1 confirmed the orphaned ReplaySystems

**2026-07-28 15:42. Test 1 is done and it landed the day's best finding. This re-ranks what is left.**

**Two answers I need from Test 1 before anything else, because the arithmetic depends on them:**

- **How many open/close cycles produced the 21,097 count, and how many produced 22,151?**
- **How many panels did the layout have?**

**Without those, I know the leak is real and monotonic but I cannot say whether it is ~1,100 divs per cycle or per panel.** Guessing would be a fifth unverified premise today.

---

## TEST 4 — Is the orphan count bounded or unbounded? (~5 minutes) — **DO THIS FIRST**

**What it decides: the severity of the finding, and it is a bigger question than it looks.** Snapshot 2 held four replay engines where one belongs.

- **If more cycles keep adding engines** — eight, twelve, twenty — **every multichart open/close permanently adds a live engine, and a long session accumulates them without limit.** That would make this the primary memory defect and would likely explain the lag getting progressively worse.
- **If it stays at four no matter how many cycles you run**, it is a bounded one-time cost per panel. **Still a real bug, much less severe.**

### Steps

1. Same tab and session you have now, or a fresh one — **either is fine, just tell me which.**
2. Open and close the multichart layout **five more times**, waiting for panels to fully draw each time. Return to single chart.
3. DevTools → **Memory** → click the **trash-can (collect garbage)** icon → wait 3 seconds → **Take heap snapshot**.
4. In the **Filter by class** box type: `M20Q6ReplaySystem`
5. **Screenshot the result.** I need the number of instances — either a `×N` next to one row, or a count of separate rows.

### While you are in that snapshot — two extra reads, ~1 minute

6. Clear the filter, type `Document` instead. **Screenshot whatever appears.** This closes the leaked-document question with evidence rather than with my retraction — I claimed it, then withdrew it, and it should be settled properly.
7. Clear again, type `Detached` and **record the `Detached <div>` count** so we have a fourth point on the curve.

---

## TEST 5 — Does the lag follow the orphans? (~10 minutes)

**What it decides: whether the memory monster and the lag monster are one monster or two.** I have treated them as separate all day. Three orphaned replay engines with live listeners is a strong candidate for the lag you have always described as depending on session history.

### Steps

1. **Fresh tab.** Load the chart, add a couple of indicators and an order — **the conditions under which you have always seen the lag**.
2. Run replay at a normal speed. **Write down how it feels: smooth, or lagging.** Rough words are fine, this is a felt comparison, not a measurement.
3. **Without reloading**, open and close the multichart layout **five times**. Return to single chart.
4. Run replay again, **same speed, same indicators, same order**.
5. **Write down how it feels now, and whether it is worse than step 2.**

### Send me

The two impressions, and whether the difference was obvious or marginal. **If replay is clearly worse in step 4 than step 2 on the same tab, the two monsters are one monster and the teardown fix addresses both.** If it feels identical, they are separate and the lag still needs its own hunt.

---

## TEST 2 — Catch the spike (unchanged, still needed, ~30 minutes)

**Still the only monster we have completely failed to find**, and still the only thing that changes its odds. Steps unchanged in `PO-PROTOCOL-MONSTER-KILL-20260728.md`: DevTools → More tools → **Performance monitor**, then **use the app actively for 20–30 minutes** and note what you did in the ten seconds before any CPU jump.

**One update from Test 1: if the spike turns out to need a session that has cycled through multichart, that is itself the answer** — it would tie the spikes to the orphans too. **So run this test on a session you have already been using, not a fresh tab.**

---

## TEST 3 — Real workload memory (**demoted**, ~10 minutes, do last)

Steps unchanged. **Demoted deliberately:** A's doubt about our harness was about byte totals, and Test 1 gave us reliable *object counts* instead, which are better evidence and immune to that doubt. **This test now only matters for one question — whether Rayan's 3.5 GB report is still reproducible at all** — and that question can wait until after the teardown fix lands, at which point it becomes the more useful measurement anyway.

---

## Coming after A ships the fix — the acceptance re-run

**You will need to repeat Test 1 once more on the fixed build.** That is the M-6 acceptance:

1. **Replay engine count must be exactly 1** in a single-chart state after multichart use.
2. **Detached `<div>` count must not grow** across an open/close cycle.

**I am telling you now so it is expected rather than sprung on you.** It is the same ten minutes as Test 1, and **it is the check that decides whether monster 2 dies before canary or gets disclosed.**

**Remember the caveat that will come up when you run it:** 19,852 detached divs existed *before* you ever opened multichart. **A flat per-cycle delta means the growth stopped, not that the leak is gone**, and I have written that down so nobody reports it as more than it is.
