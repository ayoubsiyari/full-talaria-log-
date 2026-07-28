# FINDING — Replay never stops when the tab is hidden. There is NO visibility handling anywhere in the replay engine. This is a single-chart leak, and it may be most of the "idle CPU floor" we chased all day.

**2026-07-28 17:35. PO report: single chart left in a background window grew to 1.24 GB with no interaction. Trace `Trace-20260728T173237.json.gz`.**

---

## 1. What the PO observed

**Single chart. No multichart. Tab in the background, untouched.**

| Measurement | Value |
|---|---|
| **Tab memory footprint** | **1,244,632 K ≈ 1.24 GB** |
| **Tab CPU while backgrounded** | **18.8%**, later 9.5% |
| **`Detached <div>`** | **81,423** — up from 65,036 with no multichart cycles |
| `(compiled code)` | ×498,323, 112,920 kB retained — **22% of heap** |
| Main-thread busy | **13.3%** of a 33.3 s window |
| **Main-thread time `[unattributed]`** | **3,875 ms of 4,442 ms busy — 87%** |

**Note: the 2.37 GB against "Tab: DevTools" is DevTools holding the heap snapshots. Not a product cost. Ignore it.**

## 2. The mechanism — and it is a two-line grep, not a theory

**`replay-system.js` contains ZERO occurrences of `visibilitychange`, `document.hidden` or `visibilityState`.**

**And replay playback is driven by a timer:** `replay-system.js:4548`, `this.playInterval = setInterval(() => {`.

**So when you background the tab, replay keeps running.** It keeps advancing candles, allocating per tick, and rendering into a canvas nobody can see. **Nothing anywhere tells it to stop, because nothing anywhere asks whether the page is visible.**

**That fully accounts for the PO's report:** CPU burning on a hidden tab, memory climbing to 1.24 GB, detached divs climbing 65,036 → 81,423 with no multichart involved at all.

## 3. This is a SECOND leak, independent of the orphans

**A's M26 orphan fix will not touch this.** The PO's session never opened multichart. **The detached-div growth from 65,036 to 81,423 happened on a single chart.**

**It also closes the item I flagged as unexplained and unowned at 15:54:** the 19,852 detached divs that existed *before* any multichart was opened. **That baseline was replay accumulating, not a mystery.**

## 4. The uncomfortable implication — our "idle" measurements may never have been idle

**We spent today measuring an "idle CPU floor" of roughly 13%, ablating an rAF loop for 1.3–3.4 points of it, and attributing 6.3 points to instrument overhead.** This trace shows **13.3% busy on a backgrounded tab with replay still running.**

**If replay was running during those earlier sessions — and the PO's screenshots show a replay speed of 60x and an active play button — then the "idle floor" was not idle. It was replay.**

**Corroborating detail in the trace:** the CPU strip shows **periodic humps every roughly 2–4 seconds**, which is the shape of a throttled background `setInterval`, not of a steady 60fps render loop. **And 87% of busy main-thread time is `[unattributed]`, which is where timer callbacks and GC land rather than named product functions.**

**Stated as a hypothesis, not a fact** — but it would mean a substantial part of the day's CPU archaeology was measuring replay, and that the rAF loop I cancelled was never the main term. **Cancelling it looks better in hindsight, for a reason I did not have at the time.**

## 5. A third finding in the same snapshot — the `rn` collections

**Four separate `rn` entries: ×63,966, ×63,281, ×63,139, ×62,997 — roughly 6.6 MB retained each, ~26 MB total.**

**The count is growing and the old ones persist.** Earlier snapshots held three, and **`×63,139` and `×62,997` appear unchanged across multiple snapshots taken hours apart.** So a new ~63,000-object collection is created periodically and the previous ones are never released.

**Unexplained. Assigned to A.** `rn` is a minified name; identify it and determine what creates one and why the old ones survive.

## 6. Dispatch — Manager A. Build this now, under the charter.

**FIX 3 — pause replay when the page is hidden.**

**On `visibilitychange`: if hidden, stop the `playInterval` at `replay-system.js:4548` and cease per-tick work. On visible, resume from where it stopped.**

**Kill-switch:** `__TALARIA_DISABLE_REPLAY_HIDDEN_PAUSE_V1`, flag-on restores today's run-forever behaviour.

**Why this ranks with FIX 1 and FIX 2 rather than behind them:**

- **It is small, well-bounded and needs no profiling** — the mechanism is a missing event listener, confirmed by grep.
- **It attacks CPU and memory simultaneously**, which nothing else we have does.
- **It fixes a single-chart defect**, and every other performance fix in flight only helps multichart.
- **It is almost certainly what users actually hit** — a chart left open in a background tab is the normal way this product gets used all day.

**Design points to get right:** resume must not double-advance or skip candles; the pause must not be observable as a data gap on return; and **`document.hidden` is true for a backgrounded window as well as a hidden tab**, which is precisely the PO's scenario.

**Also assigned:** identify `rn` per §5, and confirm whether the per-tick allocation of FIX 2 is the same allocation driving §1's growth — **if it is, FIX 2 and FIX 3 compound and should be measured together.**

## 7. Note for M7

**The "idle CPU" disclosure must not be written until §4 is settled.** If the floor is largely replay running unpaused, then the honest disclosure is a fixed defect rather than an architectural limitation — **and we would otherwise be disclosing a permanent limitation that we had actually fixed.**
