# RULING — PO grants **24 additional hours** and requires a leak-proof, bug-free chart for canary. Operating model changes to **simultaneous multi-kill behind per-suspect kill-switches, graded once and bisected by flag** — no sequential hypothesis testing, no PO test burden. Four workstreams close in parallel: the leak, FIX 1 smoothness, the unexplained single-chart CPU ceiling, and a ticket-backlog audit I owe and have not done.

**2026-07-29 12:35. PO: "I want everything solved, no goofing around, no unnecessary tests, kill all suspects… you suspect something, kill it on the spot."**

---

## 1. Why the previous model failed and what replaces it

**Four mechanism hypotheses were proposed and refuted in one night, each costing hours because they were tested serially and each required PO measurement to settle.** **The bottleneck was never the fixing — it was that only the PO could grade, so only one idea could be in flight at a time.**

**That constraint is gone.** C's census and heap-cycle gate grade automatically, and every suspect can carry its own runtime switch.

**New model: fire at every named suspect simultaneously, each behind its own flag, all defaulted on. Run the census once. If heap goes flat, bisect by toggling flags to find which shots mattered and retire the rest.** **Toggling a flag is seconds; writing a hypothesis is hours.** **We stop reasoning about which suspect is guilty and let the instrument tell us, after the fact, at no additional cost.**

**This is the correct use of the infrastructure built over the last two days, and it should have been the model from the moment C's gate landed.**

## 2. The leak — every named suspect dies at once

**A fires all of these in parallel, one flag each, default on:**

**The three host data caches — `_tfDataCache`, `_btTfDataCache`, `_smartPrefetchCache`** — reference-counted release on panel teardown. **Rank-1 suspect, and critically not covered by the bar-store flag the PO tested, so nothing has ever refuted them.**

**Raw response text retention.** The census's top A-list entry is `ExternalStringData` at ~22 MB/cycle — network response bodies and script source. **Anything holding raw JSON response text after parsing must drop it.** This is measurement-led rather than hypothesis-led and therefore ranks alongside the caches.

**`clearFile` from `removeChart`**, reference-counted. **`MC_BAR_STORE_REALM_V1`** is already landed and ships in b84. **Same-pair `fullRawData` aliasing versus distinct copies.**

**Grading: C's heap-cycle census across three cycles with distinct symbols. Flat heap is the target, not a reduction.** **Then bisect.**

## 3. FIX 1 — merges, and it outranks the leak

**Stated as a judgement rather than a preference: a canary user feels choppiness within seconds and it contaminates every other observation they make.** **A bounded memory climb is describable in one sentence; a chart that stutters is not.** **If exactly one of the two lands, it must be FIX 1.**

Two outstanding rejections on `manager-a/fix1-held`. C's `R-W64` instrument is ACCEPT on the FIX-1-critical smoothness vectors, so grading is ready and waiting.

## 4. The CPU ceiling — assigned, having previously had no owner

**A single chart at 60× draws ~111% CPU; four panels reach only ~141%.** **The dominant cost is one chart running replay hard, not multichart, and nothing in flight addresses it.**

**A's earlier profile makes the shape clear by elimination: replay logic totals ~2%, GC 0.258%, and `tickIntervalMs` floors near 250-300 ms.** **The work is therefore in the render path, and at 60× a focused chart redraws on every tick.** **FIX 1 exempts the focused panel by design, so it cannot help here.**

**C characterises where the time goes; A fixes what C names. Not a guess — the instrument exists.**

## 5. Ticket audit — mine

**The PO asked whether all tickets are resolved and I could not answer.** **I have run the memory and lag hunt for two days without auditing the backlog I was originally convened to close.** **I do the audit personally and report a real number, not an impression.**

## 6. Standing changes

**B ships on its own authority whenever A merges.** No per-deploy approval. Exceptions: anything touching `talaria-log.com`, and any deploy removing a route or changing a public URL.

**PO manual testing is opportunistic, never required.** **Anything the PO finds is killed on the spot rather than triaged** — the infrastructure now supports that, and the flag makes it safe.

**No shot waits for a hypothesis to be confirmed first.** **The only question asked before firing is whether the shot has a kill-switch and whether C can grade it.**
