# FINDING C — The B reconciliation: **we are at different bar spacing AND different bar ranges, and one panel holds 99% of the bars.** Plus the arena narrowed hard: **one renderer holds 1,968 of 2,032 MB**, canvas is 4.16 MB and decoded images are 5.75 MB, so ~1.5 GB of non-JS memory sits in a single process with the small candidates excluded.

**2026-07-31 19:35** · Manager C · `LIVE-LOD-AND-ARENA-20260731.json` (signature `LIVE-LOD-AND-ARENA-V1`, filename checked)
**Read-only attach to the running soak. No GC, no navigation, no `getContext()`.**
**bfcache: default/enabled — the running soak browser. Declared per `RESET-01`.**

## Item 2 — the zoom state, and it does not resolve cleanly either way

| | B | me |
| --- | --- | --- |
| Bar range | 1,930 → 6,242 | 6,700 → 36,104 |
| Bar spacing | **7.0 px** | **6.0 px host, 2.43 / 2.45 / 2.37 px panels** |
| `candleWidth` | 6 (implied: 6 + 1 gap) | **6 host**, 2.43 / 2.45 / 2.37 panels |
| Cost per event | **FLAT** | **RISING 2.24×** |

**The zoom states differ, so this is a real reconciliation candidate — but not in the way the numbers first suggest.** The product computes spacing as `candleWidth + candleGap` (`chart.js:583`, `3301`). **My host panel is at `candleWidth` 6, which is exactly B's 6**; the whole spacing difference for that panel is a 1 px gap. The three iframe panels are at 2.4 px, genuinely more zoomed out than anything B measured.

**And the panel that matters is the host.** Per-panel resident bars, read live:

| panel | timeframe | visible bars | **total resident** | spacing |
| --- | --- | --- | --- | --- |
| host | 1m | 75 | **40,105** | 6.0 px |
| iframe | 5m | 138 | 648 | 2.43 px |
| iframe | 15m | 139 | 269 | 2.45 px |
| iframe | 1h | 9 | **9** | 2.37 px |

**One panel holds 40,105 of 41,031 resident bars — 97.7%.** So my "36,104 resident bars" is very nearly a single-chart measurement, and it was taken at **B's own candle width of 6**. That removes zoom as the explanation for the panel carrying the load, and leaves the bar range: **B spans 1,930–6,242 and I span 6,700–40,105. Our ranges do not overlap at all.**

**Conclusion, and it is the harder of the two the Director offered: two mechanisms with different onsets.** Something is flat below roughly 6,000 resident bars and begins to bite above it. Neither measurement is wrong and neither generalises into the other's range. B's window is where users start a session; mine is where they spend it — R-1 put resident bars at **7,321 at first paint**, which is already above B's entire range.

**One thing I could not verify and will not guess at.** B reports `pixelLodActiveNow: false`. I searched every enumerable property of all four live chart objects for anything matching `lod`, `decim`, `stride`, `downsample`, `simplif`, `skipRender` or `coarse` and found **zero** on all four. So either that flag lives somewhere I did not look, or it is B's own derived label. **B should say where the field comes from before either of us reasons from it** — I am not going to infer a level-of-detail path exists from a field name in a sibling's artifact.

**Also worth recording for the 1h panel: 9 resident bars, 9 visible.** A 1h panel in a session this young has almost nothing in it, which is consistent with my earlier note that a bar-count advance test cannot see it moving.

## The arena question — narrowed to one process, with the cheap candidates excluded

Measured live, renderers **summed and also split** rather than maximised:

| | reading |
| --- | --- |
| **Largest renderer** | **1,968.2 MB private** |
| All four renderers | 2,032.3 MB — **96.8% is the one process** |
| Other three renderers | 23.2 / 20.6 / 20.3 MB (other pages, not panels) |
| GPU process | **303.1 MB** |
| Browser + network + storage + audio | 62.9 / 25.7 / 10.9 / 11.5 MB |
| **Canvas backing stores**, all 4 documents | **4.16 MB** across 4 canvases |
| **Decoded `<img>` content**, lower bound | **5.75 MB** |
| JS heap at that sample | ~476 MB |
| Worker heaps | **UNMEASURED by this route — not zero** |

**My Phase-4 escalation stands and hardens.** One renderer holds 96.8% of renderer memory, and the four chart documents were already proved same-process by `timeOrigin`. Four renderer processes exist in this browser but three of them are ~20 MB each and are not panels. **There are still not four heavy realms.**

**What is now excluded as the home of the growth:**

- **DOM nodes, event listeners, JS heap** — excluded by the collection at samples 4–5, which returned 206 MB of heap, 12,060 listeners and 25,891 nodes while footprint kept climbing.
- **Canvas backing stores** — 4.16 MB, and it exactly reproduces the census figure. It is not a rounding error away from mattering; it is three orders of magnitude away.
- **Decoded bitmaps** — at least 5.75 MB, and that is a lower bound on `<img>` content only. It cannot become 1.5 GB.
- **GPU process** — 303 MB, real but bounded, and it is not renderer memory.

**So roughly 1.5 GB of non-JS memory sits inside one renderer process** (1,968 total less ~476 heap), and the surviving candidates are **script and compiled-code residency** and **native allocator arenas holding bar data** — typed arrays, `PartitionAlloc`, `malloc`. The per-bar shape points the same way: the monotonic run measured 23.98 MB per thousand bars of which **only 4.26 is JS heap**, so ~82% of each bar's cost is already known to be non-JS.

**Honest limits.** This is a snapshot at one moment, not a growth attribution — it bounds the small candidates and does not prove where the growth lives. And the worker row says **unmeasured, not zero**: `browser.targets()` does not list dedicated workers, which is the `GATE-01` failure I already found and fixed in `sweep-gauges` with three read routes, and this probe used the naive route. A fixed pool of two workers exists whenever indicators are loaded and this arm loads eight instances, so a zero there would have been a fabrication.

**The instrument that closes it** is a `memory-infra` allocator dump, which splits `malloc`, `PartitionAlloc`, `v8` and external memory inside a single renderer. That needs a tracing session on a host that is not mid-soak, so it runs after arm 2. **It is the top memory question and it is mine.**

## Two defects in my own probe, both caught before publishing

**First: I reported 0 MB for every process type.** `SystemInfo.getProcessInfo` returns pids and types but its `memory` field reads 0 on this platform; the bytes come from the OS, via the `readOsFootprints` reader my own baseline gate already used. A confident zero for GPU and renderer memory would have been published if I had not cross-checked it against a number I already knew.

**Second: my first pass would have reported worker heaps as 0.00 MB** rather than unmeasured — the same class of error as the census row that said "unmeasured" without saying where the memory went, and worse, because a zero looks like an answer.

## Liveness

`pid 29112` **alive**, 1.13h elapsed, sample 22, footprint **2,500.1 MB** and climbing, heap 342.6 MB, CPU 114.8%, bars monotonic with zero re-seeks. That is **1,120 MB above the 1.38 GB I once called a hard ceiling.**
