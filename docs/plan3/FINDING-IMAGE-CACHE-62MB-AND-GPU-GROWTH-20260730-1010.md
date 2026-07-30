# FINDING — 62 MB of image cache on a canvas chart, and GPU memory that climbs

**Director · 2026-07-30 10:10 · binding on A, B, C**

## The measurement

PO enabled every Task Manager column on the deployed single-chart session
(`sessionId=924`, b103, DevTools closed). Two samples of the same tab, minutes apart.

| Column | Sample 1 | Sample 2 | Delta |
|---|---|---|---|
| JavaScript memory | 113,876K (104,188K live) | 127,444K (97,573K live) | +13.5 MB total, −6.6 MB live |
| **Image cache** | **63,075K** | **63,075K** | flat |
| **Script cache** | **32,304K** | **32,304K** | flat |
| CSS cache | 213K | 213K | flat |
| **GPU memory (tab)** | **43,729K** | **64,257K** | **+20.5 MB** |
| GPU memory (GPU proc) | 101,651K | 111,805K | +10.2 MB |
| GPU memory (browser) | 36,432K | 26,016K | −10.4 MB |
| Idle wake ups (tab) | 1,327 | 1,213 | — |
| Idle wake ups (GPU) | 1,133 | 1,464 | — |
| Idle wake ups (browser) | 2,677 | 1,946 | — |
| CPU (tab / GPU / browser) | 16.7 / 10.6 / 9.7 | — | ~37% of a core, one chart |

## Finding 1 — SIXTY-TWO MEGABYTES OF IMAGE CACHE. This is the anomaly.

A candlestick chart draws to a canvas. Its legitimate image assets are icons, a logo
and a handful of cursors — **under a megabyte, comfortably**. We are carrying
**63,075K of decoded image data**, and it is larger than the CSS cache by a factor of
**296**.

Nothing in the intended design of this product explains that number.

**Leading hypothesis, and it is a hypothesis (BRIEF-02).** The codebase has a **tile
cache** — C's forward-mutation audit references `chart.js` tile and meta purges. If
rendered candle tiles are being rasterised and retained as bitmaps rather than
redrawn, they land in exactly this counter, and in GPU memory, and in neither the JS
heap nor any snapshot census we have ever taken. That single mechanism would explain
the image cache, part of the GPU total, why the floor never matched our instruments,
and why every JS-side cut we shipped measured zero.

**Competing candidates, to be eliminated by measurement not by argument:** chart
snapshot or export bitmaps retained after use; panel preview thumbnails; `toDataURL`
or `ImageBitmap` layer caching; CSS background images at unreasonable resolution;
base64 data URLs embedded in the bundle.

**A does not cut anything from this file.** C names what the images are first.

## Finding 2 — GPU memory grows, and nobody has ever watched it

The tab's GPU allocation rose **43,729K → 64,257K, +20.5 MB**, between two samples
minutes apart on a chart that was not being reconfigured. The GPU process rose
+10.2 MB alongside it. Across the three processes the application is holding roughly
**180-200 MB of GPU memory with a single chart open**.

Canvas backing stores are allocated at device-pixel-ratio, so a high-DPI display
multiplies every surface by four. A chart that allocates a distinct canvas per
overlay, per indicator or per panel multiplies it again.

**This is a growth signature in a place we have not once looked in a week of hunting.**
It is not visible to `performance.memory`, not visible to Performance Monitor's JS
heap line, and not visible to any heap snapshot. Two samples is not a trend — C
establishes whether it is monotonic before anyone calls it a leak (DECL-01).

## Finding 3 — the script cache corroborates C independently

32,304K of script cache. C's W76 census attributed the largest growing term to script
source and compiled code from an independent instrument — heap snapshots — and was
right to retract the per-cycle framing while keeping the mechanism. **This is the
browser's own accounting agreeing with C's snapshot accounting.** Two unrelated
instruments, same conclusion, and it is the first cross-instrument agreement we have
had on any memory claim.

It also sizes the prize: 32 MB of script cache plus 62 MB of image cache is
**94 MB of non-JS, non-DOM cached bytes** in one tab, none of which any instrument we
built could see.

## Finding 4 — 37% of a core, single chart, and thousands of idle wake-ups

Tab 16.7% plus GPU 10.6% plus browser 9.7%. We have been quoting the tab figure alone
and treating the GPU as free. It is not free; it is a second CPU consumer and on a
laptop it is the one that produces heat and fan noise. Idle wake-ups run in the
**thousands** across all three processes, which is timer churn, and it corroborates
the immortal-timer family A and B have been closing.

## Orders

**C, ahead of the non-JS composition task and immediately after the node census:**

1. **Name the 62 MB of images.** Enumerate every entry in the image cache with
   dimensions, format and origin. Then answer directly: is the chart rasterising and
   retaining rendered tiles? If yes, that is the mechanism and it outranks everything
   except the node census.
2. **Is GPU memory monotonic?** Sample the tab's GPU memory every thirty seconds
   through four multichart open/close cycles. Growing-and-not-returning is a leak in
   a place we have never measured. Flat-but-large is a design cost. As with the node
   count, A must know which before it cuts.
3. **Count the canvases** and their backing-store dimensions, and state whether any
   are per-overlay, per-indicator or per-panel rather than shared.

**A, read-only, no cuts:** locate every site that creates an image, a bitmap, a
`toDataURL`, an `ImageBitmap`, an `OffscreenCanvas` or a rasterised tile, and be ready
to cut the minute C names one. Report what the tile cache retains and whether entries
are bitmaps or arrays.

**B:** confirm whether any of the 62 MB is shipped in the bundle as base64 or as
oversized static assets. That part would be fixable today with no risk at all.

## The pattern, recorded for the third time this morning

The gauge comparison, the scaling test, the JavaScript memory column, and now this —
every one of today's real findings came from **reading a number that was already on
screen**, not from an instrument we built. We spent a week constructing measurement
apparatus that could see under a fifth of the application while the browser was
displaying the rest of it behind a right-click.

**Standing order: before building an instrument, exhaust the ones the platform already
ships.** Task Manager's full column set, Performance Monitor, the Memory panel's
category breakdown, `chrome://tracing`. They are free, they are unbiased, and they do
not require us to be right about where to look before we look.
