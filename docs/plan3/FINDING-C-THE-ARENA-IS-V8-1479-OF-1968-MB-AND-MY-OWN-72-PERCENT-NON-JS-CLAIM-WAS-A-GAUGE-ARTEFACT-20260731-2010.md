# FINDING C — The arena is named: **V8 holds 1,479.3 MB of the 1,968 MB renderer.** It is not native bar arrays, not bitmaps, not canvas. **And it corrects my own published claim that 72% of the renderer is not JS — that was an artefact of measuring V8 with `usedJSHeapSize`, which sees about a third of what V8 actually holds.**

**2026-07-31 20:10** · Manager C · `LIVE-ALLOCATOR-DUMP-20260731.json`
**`Tracing.requestMemoryDump` at BACKGROUND detail against the running soak. It was cheap enough to take live, so the arena question did not have to wait for arm 2.**
**bfcache: default/enabled. Declared per `RESET-01`.**

## The dump, for the renderer that holds everything

pid 30588 — the process measured at 1,968.2 MB private, 96.8% of all renderer memory:

| allocator | MB | what it is |
| --- | --- | --- |
| **`v8`** | **1,479.3** | **V8's own memory: heap spaces, code space, and external backing stores** |
| `blink_gc` | 401.1 | Oilpan — Blink's garbage-collected C++ objects |
| `partition_alloc` | 307.9 | Blink's partitioned allocator — strings, buffers, DOM-adjacent |
| `malloc` | 172.8 | general native heap |
| `cc` | 50.6 | compositor |
| `gpu` | 37.2 | renderer-side GPU resources |
| `web_cache` | 13.7 | resource cache |
| `shared_memory` / `skia` | 8.3 / 0.3 | — |

For contrast, the GPU process (pid 28064): `gpu` 236.3, `skia` 68.7, `malloc` 46.9.

**The allocator rows sum to more than the private footprint** because memory-infra allocators overlap through ownership edges — V8's backing stores are also counted inside `malloc` and `partition_alloc`. The ranking is sound; the sum is not additive and I am not going to present it as one.

## The correction, and it is to a number I published this morning

I published, from the baseline census: **"renderer 693.8 MB of which JS heap is 186.66 (27%) and 497.23 MB (72%) is NOT JS."** I then built a whole line of reasoning on it — including this evening's conclusion that the growth is "not DOM-resident" and lives in "native allocator arenas holding bar data."

**The direction was right and the attribution was wrong.** That 72% was computed as *renderer private minus `usedJSHeapSize`*, and **`usedJSHeapSize` measures live objects in V8's heap, not V8's footprint.** V8 also holds committed-but-unused heap space, code and compiled-bytecode space, and external backing stores for typed arrays. Measured directly, **V8 is 75% of this renderer**, not 28%.

**So "the growth is not JS" was an artefact of the gauge.** My collection-event evidence still stands on its own terms — a natural GC returned 206 MB of heap, 12,060 listeners and 25,891 nodes while footprint kept climbing — but the correct reading of that is **not** "the memory is outside V8". It is that **V8 gave back live-object space and did not return the arena to the OS**, which is exactly what a generational heap does. I read a retention story out of an allocator behaviour.

**This also revises what I told the Director and A about Phase 4.** I said the target was "duplicated per-realm structure inside one process". The dump says the target is **V8 memory in one isolate**, and the four realms share that isolate.

## What is now excluded, with numbers rather than argument

| candidate | verdict |
| --- | --- |
| Canvas backing stores | **4.16 MB.** Excluded |
| Decoded bitmaps / images | `skia` **0.3 MB** in this renderer; `<img>` content ≥5.75 MB. Excluded |
| GPU | 37.2 MB renderer-side, 236.3 MB in the GPU process. Real, bounded, **not renderer memory** |
| DOM nodes, listeners | Excluded by the collection event, and `blink_gc` at 401 MB bounds all of Blink |
| Worker heaps | Still **unmeasured** by the naive route, but two worker isolates cannot be 1.5 GB |
| **Script and compiled-code residency** | **Inside the `v8` row and not yet separated from it** |
| **Bar data** | **Inside the `v8` row** — typed arrays and object arrays both land there |

**The five-way question has collapsed to one arena and one remaining split: within V8's 1,479 MB, how much is bar data and how much is code?** That split needs a heap snapshot by object type, which is the expensive instrument, and it is the one thing I will not take against a live soak — a snapshot forces a full GC and stops the world for seconds.

## What I will do next, and it is nearly free

**A single dump is a snapshot, not a growth attribution.** The decisive follow-up is a **second background dump later in the run and a diff**: whichever allocator row carries the growth is the answer, and background detail has now been shown to cost nothing observable. I will take dump two before arm 1 ends and publish the delta, with the `v8` row's growth compared against bars accumulated over the same window in MB per thousand bars.

The prediction, stated in advance so it can be wrong: **`v8` carries essentially all of the growth, and `blink_gc`, `partition_alloc` and `malloc` stay roughly flat.** If instead `partition_alloc` climbs, bar data is being held outside V8 and my monotonic per-bar figure needs re-interpreting.

## Honest limits

Background detail gives per-allocator totals only — no per-object or per-type breakdown, and `process_totals` came back empty at this detail level, so the private-footprint figures in this finding come from the OS reader rather than the dump. It is a ranking of arenas, taken once, on a live run. It names where to look. It does not yet say what is in there.
