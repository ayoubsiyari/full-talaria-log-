# PO PROTOCOL — three tests, 2026-07-28

Ranked. **Test 1 first — it is the only one nobody but the PO can produce.** Each test is independent; a partial result is still useful. All three are also the acceptance protocol for the changes they inform.

## Universal rules — these are where wrong numbers come from

1. **Read the right row in the task manager.** Brave's task manager lists one row per tab. **Read only the row named for the Talaria tab.** Do not read whole-Chrome totals, and do not read the `DevTools` row — it has its own. *This exact ambiguity cost us a re-analysis today; A flagged it before we could publish a wrong comparison.*
2. **Values above 100 are normal and not a bug in the reading.** Chrome normalises CPU to one core, so 120% means "more than one core's worth," not "impossible."
3. **Hands off the mouse during any recording.** The crosshair follows the cursor, so moving the mouse over the chart creates genuine work and you end up measuring your hand. This is the single easiest way to void a result.
4. **While a Performance recording is running, the CPU number reads higher than normal.** That is the profiler's own cost and it is expected. **Never quote a number taken while recording as the official figure.**
5. **Performance panel settings, every time:** Screenshots **OFF**, Memory **OFF**, CPU **No throttling**, Network **No throttling**.
6. Brave task manager opens with **Shift+Esc**, or Menu → More tools → Task manager.

---

# TEST 1 — Catch a CPU spike in the act

**Goal:** name the cause of the spikes to ~120%. **A ran ten measurements today and never reproduced a spike once**, so this evidence does not exist and cannot be obtained without the PO.

### Setup

1. Close every other tab, including TradeZella. Keep one Talaria tab.
2. Load a **single chart** — not multichart. **No indicators. Replay STOPPED** (not paused). This matches the 12:50 baseline so the two are comparable.
3. Wait **30 seconds** after the chart finishes drawing. Boot work would swamp the window.
4. Open the task manager (**Shift+Esc**) and position it so the Talaria row is visible without moving the mouse later.
5. Open DevTools (**F12**) → **Performance** tab → apply the settings in Universal rule 5.

### Steps

6. Watch the Talaria row for ~30 seconds first and **note the resting value** (expected ~12–20).
7. Start the recording, then **take your hand off the mouse entirely.**
8. **Record for 60 seconds** — longer than last time, because the spikes are periodic and a 20-second window can miss one.
9. While recording, watch the task manager row without touching anything. **If you see the number jump, note roughly how many seconds into the recording it happened.**
10. Stop at ~60 seconds. **Do not stop during a spike** — that truncates the evidence. If a spike is in progress, let it finish.

### What to send

11. The **Summary** donut — all five values.
12. **Bottom-Up** tab, sorted by **Self Time** descending, top ~8 rows.
13. **The spike itself.** At the very top of the panel there is a CPU strip; a spike shows as a tall yellow band. **Zoom into it** (mouse-wheel over the timeline or drag-select the region) and screenshot the flame chart there. **This is the whole point of the test** — the tall block is the culprit, named.
14. The saved `.json` (right-click the timeline → Save profile).

### If no spike appears

**Retry up to three times.** If a fresh chart with no indicators never spikes, **that is itself a finding** — it means the spikes need an aged or loaded session, which points at the Hoarder rather than the render loop. Report the negative result; do not keep hunting.

---

# TEST 2 — Two heap snapshots, compared

**Goal:** find out what is actually filling memory. **This is currently 100% guesswork** — two theories have already died (bounded working set, then stored data). This is the memory equivalent of the recording that cracked the CPU problem in ten minutes.

### Setup

1. **Do NOT clear browser data. Use your normal, well-used profile.** ⚠️ **This is the opposite of Test 1** — the accumulated state *is* the thing being studied, so a clean profile would destroy the evidence. Easy habit to carry over by mistake.
2. Load the chart the way you normally work: **indicators on** if that is normal for you.
3. **Replay STOPPED** for both snapshots. A snapshot taken mid-replay measures a moving target.
4. DevTools (**F12**) → **Memory** tab (not Performance).

### Steps

5. Select **"Heap snapshot"** (the first radio option) → click **Take snapshot**. This is snapshot 1.
   - *A snapshot forces a garbage collection first. That is good: whatever remains afterwards is genuinely being held onto, not just waiting to be cleaned up. It is why these numbers can be trusted.*
6. **Now use the chart for 2–3 minutes the way that makes it slow:** run a replay, place two or three orders, add a few drawings. Let some orders close.
7. **Stop the replay.**
8. **Take snapshot 2.**
   - ⚠️ **Do not reload the page and do not close DevTools between the two snapshots** — either one destroys snapshot 1 and voids the test.
9. **Select snapshot 2** in the left-hand list.
10. Find the dropdown that reads **"Summary"** and change it to **"Comparison"**. Confirm the baseline next to it is **snapshot 1**.
11. Click the **"Size Delta"** column header to sort descending. ⚠️ **Sort by Size Delta, not by Size** — total size tells us what is big, delta tells us what *grew*, and only growth indicates a leak.

### What to send

12. **Screenshot the top ~10 rows of the Comparison view.** That list is "what piled up while you traded," ranked by how much it grew. This is the deliverable.
13. Optionally the `# Delta` column too — a count that grows without bound is a stronger leak signal than raw bytes.
14. Snapshot files are often hundreds of MB and may be unsendable. **The screenshot is what I need; the files are a bonus.**

---

# TEST 3 — Record after closing the multichart

**Goal:** test the residue theory — that closing a multichart leaves things running behind. This is the PO's own observation from the 5x test, where a single chart at 1x lagged worse *after* a multichart session than a 5x session had. **If confirmed, it explains the original complaint that started this whole project.**

### Setup

1. **Fresh browser window** — so the only difference from the 12:50 baseline is that a multichart happened.
2. **No indicators, no orders, no drawings anywhere in this test.** ⚠️ Keep it minimal on purpose: this isolates multichart alone. If we mix in indicators and something shows up, we will not know which caused it.

### Steps

3. Open **multichart with 2 panels**.
4. Run a replay for about **one minute**. Any speed.
5. **Stop the replay.**
6. **Close back to a single chart.**
7. ⚠️ **Do NOT reload the page.** A reload wipes the residue, which is precisely what we are trying to detect. This is the one step that voids the entire test.
8. Wait **30 seconds**.
9. Take a **20-second idle recording** — same settings as Universal rule 5, hands off the mouse. Same length as the baseline so the two are directly comparable.

### What to send

10. The **Summary** donut and the **Bottom-Up** top ~8 rows.
11. The saved `.json`.

### How this gets read

**The 12:50 baseline was 13.0% busy** (4,454 ms of 34,313 ms). I have that recording, so this is a true before-and-after.

- **Meaningfully above 13% busy** → residue confirmed. Something survived the teardown.
- **Extra animation loops visible in the flame chart** → residue confirmed and localised.
- **Same as baseline** → residue refuted for the bare case, and the next question becomes whether orders and drawings are what leave the mess. **A clean result here is valuable, not a wasted test.**

---

## Explicitly NOT wanted

**No further replay-speed comparisons.** That axis has been measured three independent ways — the 1x/10x A/B, the 1m-vs-1D equivalence, and a 1x session lagging where a 5x session did not. All three agree that speed is not the villain, and more data there cannot change a decision.
