# FINDING — R-1: 82% of resident bars precede the session, and 72% of the renderer is not JS

**2026-07-31 11:30** · Manager C · tier=mid model=claude-opus-5-thinking-high
**Ruling** cbfdb81f4 items 3 and 6 · **Rules applied** `UNIT-01`, `MEAS-01`, `KILL-02`
**Instrument** `BASELINE-CENSUS-V1` · **Artifact** `_evidence\manager-C\BASELINE-CENSUS-20260731.json`
**Build stamp read off the page** `20260730b116` · four panels, four symbols, four timeframes, two
indicators each, **zero trades, before any playback**

## Verdict first

**The PO is right, and it is the largest single baseline term.** Of 7,321 resident bars across four
realms, **6,009 — 82.1% — sit before the session start.** They are pre-session history the user never
asked to replay. And only 488 bars are visible: **15 resident bars for every visible one.**

**A suspect dies in the same count.** Only **4 bars** across all four realms sit after the playhead. The
chart does not hoard the unplayed future. "It loads the whole file including bars the user cannot see
yet" is dead, per `KILL-02`.

## R-1, the three-way split

| bucket | bars | share |
|---|---|---|
| **before session start** | **6,009** | **82.1%** |
| within session, up to the playhead | 1,308 | 17.9% |
| after the playhead | 4 | 0.05% |
| *(visible on screen)* | *488* | *6.7% of resident* |

The session-start index was read from the product's own `sessionStartIndex`; the instrument tried five
candidate names and recorded which one answered, so the split is not resting on a guessed field.

This is the mechanism behind the PO's report that requesting a three-year session also loads everything
preceding it. It is not a leak — it never grows and it is paid once — which is exactly why it belongs to
**baseline** and why it was invisible to every slope-shaped instrument we have run this week.

## Item 6 — baseline composition, four panels, first paint, zero trades

**Total footprint 1,122.1 MB.** Renderer 693.8 MB, GPU process 259.2 MB, browser process 62.5 MB.

| category | MB | kind | process |
|---|---|---|---|
| JS heap, page isolate, post forced collection | **186.66** | MEASURED | renderer |
| JS heap, worker isolates | — | **UNMEASURED** | renderer |
| Canvas backing stores | 4.16 | FLOOR | renderer+gpu |
| Decoded images | 5.75 | FLOOR | renderer |
| GPU process private, total | 259.20 | MEASURED | gpu |
| Browser process private, total | 62.50 | MEASURED | browser |
| **renderer named** | **196.57** | | |
| **renderer residual** | **497.23** | NAMED REMAINDER | renderer |

DOM at first paint: **61,272 nodes, 14,796 listeners, 7 documents** — with nothing played and nothing
traded.

### The headline of the table is the residual

**The JS heap is 186.66 MB of a 693.8 MB renderer — 27%. The other 497.23 MB, 72% of the renderer, is
not JavaScript.** It is PartitionAlloc/malloc, DOM and style structures, compiled code and external
strings, layer tiles, plus whatever the two FLOOR rows understate. This is the "JS heap is a third of
the tab" ruling reproduced at first paint with zero trades and a named remainder rather than a mystery.

Two smaller results worth keeping:

- **Canvas is not the GPU.** Declared canvas backing stores total **4.16 MB** against a **259.2 MB** GPU
  process. Whatever the GPU process is holding, it is not the chart's canvas surfaces — it is compositor
  layer tiles. Anyone aiming at "fewer canvas surfaces" to cut GPU memory would be aiming at 1.6% of it.
- **Decoded images are 5.75 MB.** Not a term at baseline.

## The 92 MB script question — settled, and it is a baseline term

The advisor said per-realm script duplication is a baseline term rather than a growth term "unless
something re-evaluates mid-session". Over three minutes of four-panel playback: **zero product scripts
parsed, decoded script bytes moved 0.00 MB, script request count moved 0** (251 before, 251 after).

Nothing re-evaluates. **Cross-realm script sharing is a baseline fix, not a leak fix** — and per the
advisor's own point it should be *sized* early even though it is *fixed* late, because its size decides
whether it is a canary item.

*Caveat: three minutes, not three hours. A re-evaluation rarer than that would not appear here.*

## Two defects in my own grader, found and corrected before publishing

**1. I counted my own probe as the product.** The first grading reported "GROWTH TERM TOO: 27 scripts
parsed during playback". Every one of those 27 was the harness's own `page.evaluate()` compilation —
`puppeteer/util/decorators.js`, `sweep-gauges.mjs`, `baseline-census.mjs`. Observer contamination, in a
gauge built to detect re-evaluation. Harness parses are now excluded and counted separately, and the
clean signals (decoded bytes, request count) said BASELINE all along.

**2. The worker row said UNMEASURED without saying where the memory went.** Corrected below, because the
answer changes the framing of item 5.

## Item 5 — the gauge failed its gate, and the failure is worth more than a pass

`GATE-01` did its job. I allocated a **120 MB** ballast inside a real dedicated worker and the new
per-isolate gauge read **nothing**, because Puppeteer's `browser.targets()` does not list dedicated
workers. CDP's `Target.getTargets` does see them, so the fix is to attach through the browser connection
with a flattened session. **No worker-heap number has been quoted and the census row correctly says
UNMEASURED rather than 0.**

What the failed run measured instead is more useful than the gauge would have been:

- **The blind spot is total and now demonstrated rather than argued.** 120 MB of real allocation inside a
  worker moved the page JS heap by **−0.39 MB** — completely invisible.
- **But it was never missing from the total.** The same ballast moved renderer private footprint by
  **+121.2 MB**, essentially 1:1. Worker memory lives in the renderer process, so it is already inside
  the 693.8 MB renderer figure and inside the 497.23 MB residual. **It was missing from the attribution,
  never from the total.** Any figure sourced from `usedJSHeapSize` understates by whatever the workers
  hold; any figure sourced from process footprint does not — and mine are.
- **`measureUserAgentSpecificMemory()` is not available here at all** — not a function, `crossOriginIsolated`
  false. It needs COOP/COEP this server does not send. It was never the one-line change it looked like.
- **Freeing inside the worker did not return the memory.** Dropping the reference took renderer private
  from 149.5 MB to **149.8 MB** — it did not come back. Allocator arenas stay warm, and that is the same
  mechanism that decides whether logging out returns anything.

## For the Director

- **R-1 is the biggest baseline lever we have found**: 82% of resident bars are pre-session history, at a
  15:1 resident-to-visible ratio. It pairs directly with the two cuts already escalated to A —
  `chart.js:7975`'s fetch cap and the `fullRawData`/`fullData` spreads.
- **Aim the baseline work at the 497 MB non-JS renderer residual, not at the JS heap.** Every gauge we
  own reads the 27%.
- **Do not send anyone after canvas surfaces for GPU memory.** 4.16 MB of canvas against a 259 MB GPU
  process.
- One correction to the framing in the 09:15 ruling: the 467 MB outside the renderer is the GPU and
  browser processes, and **worker heaps are not part of it** — they are inside the renderer and already
  counted. The compartment we were blind to was attribution, not total.
