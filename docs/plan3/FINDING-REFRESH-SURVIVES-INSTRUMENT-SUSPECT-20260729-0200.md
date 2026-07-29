# FINDING — A page refresh did not lower memory. **A refresh destroys the entire JS heap, so anything surviving it is not live retention** — it is almost certainly allocator pages the browser has not returned to the OS. This makes Task Manager's footprint, the instrument behind **every absolute memory figure in this project**, unsound for sizing a leak. The differential findings survive; the absolute ones do not. One line settles it.

**2026-07-29 02:00. PO: "I also had a single chart and the usage was 670 and I refreshed the page and it didn't go down."**

---

## 1. Why this outranks the leak hunt

**A page refresh tears down the document, the DOM, every iframe, and the entire V8 heap.** **Nothing in application code can survive it.** So a figure that does not move across a refresh is not measuring application memory.

**What does survive is the renderer process itself.** Same-origin navigation reuses the process, and **freed pages are not promptly returned to the operating system** — the allocator keeps its high-water mark. **Task Manager's "Memory footprint" column reports that high-water mark, not live data.**

**I flagged this exact hazard at 01:25 and did not enforce it. That was a mistake, and the cost is that some portion of tonight's numbers cannot be interpreted.**

**Corroborating detail already in the PO's earlier screenshots, which I noted and did not pursue:** Brave's task manager listed a second row, **`Private Back/Forward Cached Page: http://31.97.192.82/`**, alongside the live tab. **The back/forward cache retains a complete document and heap by design.** That is a second body of memory attributed to the same session that no application fix can release.

## 2. What survives this correction and what does not

**Survives — the differentials.** The residue comparison of ~67 MB for four identical panels against ~367 MB for four distinct symbol/timeframe panels was taken **in one session, on one instrument, minutes apart.** **A systematic offset cannot manufacture a fivefold difference between two readings that share it.** So the symbol/timeframe conditioning stands, and with it the amended kill order's target.

**Survives — the structural findings.** Exactly three panel iframes with no duplicates, all `b82`: no iframe accumulation, panels running current code. Independent of any memory instrument.

**Does not survive — every absolute figure.** 233 MB, 300, 436, 506, 600, 670, 986, 1.1 GB, 1.4 GB. **Each is process footprint including unreturned pages, so each is an upper bound of unknown looseness rather than a measurement of retention.** **The TradeZella comparison of 490 MB is contaminated the same way and in the same direction, which is the one mercy here** — both sides of that comparison were read from the same column, so the relative verdict is probably fair even though neither number is literal.

## 3. The measurement that resolves it

**Immediately after a refresh, with the page idle, read both numbers.** `performance.memory.usedJSHeapSize` reports the live JS heap.

- **Heap small — say under 150 MB — while footprint reads 670**: the gap is unreturned pages. **Task Manager is retired as the memory instrument for this project**, all sizing is redone against heap, and the leak is materially smaller than every figure tonight suggested.
- **Heap also near 670 after a refresh**: something is genuinely reconstructing that much memory on every load, which would be a far more serious and quite different defect than the panel residue we have been hunting.

**Binding, replacing the softer wording at 01:25: no memory figure enters the record on footprint alone.** Heap number, or it is not a measurement. **This applies retroactively — the canary disclosure must not quote tonight's absolute figures.**

## 4. Consequence for the kill order

**The amended kill order stands and is not weakened**, because it was justified by a differential rather than an absolute. **But its acceptance criterion must change**: the `GATE-01` requirement that distinct-symbol recovery approach identical-symbol recovery must be graded **on heap, not footprint.** A fix that frees real memory could easily show no footprint change at all, and A would then correctly conclude its own fix did nothing — **exactly the trap that produced M26's `effect not demonstrated` label.**

**That connection is worth stating plainly: M26 may in fact have worked, and been graded against an instrument incapable of showing it.** **We do not currently know that M26 failed. We know only that footprint did not move.**
