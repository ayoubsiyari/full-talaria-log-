# FINDING C — The soak is **NOT void**: four advancing charts verified live in **four distinct documents** by `performance.timeOrigin`. The documents that vanished were not panels — and footprint kept climbing while DOM, listeners and heap were all handed back, so **the growth is not DOM-resident**.

**2026-07-31 18:55** · Manager C · `LIVE-DOCUMENT-IDENTITY-20260731.json` (signature `LIVE-DOCUMENT-IDENTITY-V1`, filename checked)
**Answered during the run, at 40 minutes of 600, not after.**
**bfcache: default/enabled — this is the running soak browser. Declared per `RESET-01`.**

## The dichotomy, and the answer is the second branch

The Director found this between samples 3 and 4 of the live arm:

| | #3 | #4 | #5 |
| --- | --- | --- | --- |
| documents | 7 | **4** | 4 |
| listeners | 14,942 | 11,339 | **2,882** |
| nodes | 51,081 | 37,006 | **25,190** |
| footprint | 1,674.2 | **1,711.9** | **1,787.1** |
| charts / advancing | 4 / 4 | 4 / 4 | 4 / 4 |

Either the panel gauge was reporting charts that no longer had documents — the eviction-mimics-a-freeze failure, and the run void — or the documents genuinely went and memory still climbed.

**It is the second, and it is verified rather than inferred.** I attached read-only to the running browser and read identity from inside each realm:

| check | reading |
| --- | --- |
| Frames carrying a live `window.chart` | **4** |
| **Distinct `performance.timeOrigin` values among them** | **4** |
| Host document also carries a chart | **yes** |
| Attached iframes in the host | **3** |
| Live documents expected: host + 3 iframes | **4** |
| `Documents` metric at the same moment | **4** |
| **Detached documents pending collection** | **0** |
| Panels advancing on the simulated clock | **4 of 4** |

`performance.timeOrigin` is minted per document and cannot be shared across realms, so **four distinct origins is positive proof of four distinct documents.** Frame URLs would not have proved it and a host-side registry could have lied about all of it.

**Why four is the correct number, not five:** the host document *is* a chart. `CONF-01` is one host chart plus three panel iframes, so a full four-panel configuration has exactly four documents. The gauge reading 4 is the healthy state, and my own instinct that four was one too few was wrong.

**So the 7 included three documents that were never panels** — navigation leftovers from the login flow, detached and awaiting collection, which the collection at sample 4 reclaimed along with 12,000 listeners, 26,000 nodes and 206 MB of heap. The panel documents never went anywhere.

## The instrument that would have got this wrong

My first pass judged advancement by bar count and returned **1 of 4 advancing**, which read exactly like three evicted panels. That is the trap my own `conf01-session.mjs` documents in a comment: at 5 candles/s a 1h-timeframe panel closes a bar roughly every twelve seconds, so a short bar-count window cannot separate a slow panel from a stalled one. Reading the continuous replay playhead instead returns **4 of 4**.

**One instrument, one window, two opposite verdicts about whether ten hours are void.** The bar-count read would have produced a false VOID; a `charts:4` read alone would have produced a false PASS. Only the per-realm identity plus the simulated clock answers it.

## The real finding: footprint does not care about the DOM

The collection at samples 4–5 handed back, in one event:

- **206 MB of JS heap** (515.01 → 308.61 MB)
- **12,060 event listeners** (14,942 → 2,882)
- **25,891 DOM nodes** (51,081 → 25,190)
- **3 documents** (7 → 4)

**And footprint rose across it: 1,674.2 → 1,787.1 MB.** Growth continued at full rate through the largest reclamation in the run.

This narrows attribution sharply and it agrees with the baseline census, which found **72% of the renderer is not JS**. The climb is not retained DOM, not retained listeners, and not retained JS heap, because all three were returned and it did not flinch. Combined with the monotonic-bars result — **24.9 MB per thousand resident bars here, 23.98 on an independent zero-trade run** — the growth tracks *bars resident*, and bar data lives in typed arrays and native allocators rather than in nodes.

**What this does not license:** it does not name the allocator. `nonJsRendererMB` was 730.1 MB in the baseline gate and remains unattributed to a specific arena. That is still open and it is now the most valuable open question I have, because three of the four candidate homes for the growth have just been eliminated by a natural experiment I did not have to run.

## Liveness, stated rather than assumed

`pid 29112` **alive**, started 18:15:16, **40 minutes elapsed**, 2 node processes and 10 chrome processes, sample 10 written at 0.481h. Bars strictly monotonic 7,043 → 29,241 with zero re-seeks. Footprint 1,402.3 → 1,988.1 MB, **608 MB above the ceiling I withdrew.**

## Unit correction, adopted

`UNIT-01` applies to my own soak headline and I had it in MB/h. **The honest figure is 24.55 MB per thousand resident bars, CI [22.25, 27.50], r² 0.977.** The MB/h reading of ~1,099 is inseparable from the 12.83 bars/sec the engine happened to deliver in that window, and since delivered rate falls from 20.6 to 9.19 bars/sec as bars accumulate, **any MB/h from an early window is a warm-up artifact.** The per-thousand-bars figure brackets the zero-trade monotonic result, so two independent runs agree in the driver's unit while disagreeing wildly in MB/h — which is the whole argument for the rule.

**And a defect in my own grader, caught by publishing it:** the two-driver split of footprint onto bars and trades returned **−49.7 MB per closed trade**, memory *falling* as trades close. Predictor correlation 0.992, variance inflation 60.9 — over this span bars and trades are one variable and the coefficients are unidentified. **Suppressed with the reason recorded rather than published.** The paired zero-trade `CONF-05` arm is the identification strategy: with trades zero by construction, the between-arm difference *is* the trade term.
