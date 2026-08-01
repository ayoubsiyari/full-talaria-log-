# D1 — Journal Screenshot Fix Bitmap Delta

**Date:** 2026-07-31  
**Manager:** D  
**Artifact:** `docs/plan3/D1-JOURNAL-BITMAP-DELTA-BROWSER-20260731.json`  
**Evidence mirror:** `_evidence/manager-D/D1-JOURNAL-BITMAP-DELTA-BROWSER-20260731.json`

## Verdict

A's journal screenshot fix removes the full-resolution decoded image surface from the settled journal list.

In a real Chromium browser, using the real Talaria screenshot fixture (`3331×1556`) and A's measured
shape (`60` rows × `2` screenshots = `120` images):

| Arm | Settled DOM images | DOM decoded-pixel floor | Renderer private delta | GPU private delta |
|---|---:|---:|---:|---:|
| Legacy full `<img src=data:...>` | 120 full images | 2,487,857,280 bytes | 69,636,096 bytes | 430,989,312 bytes |
| J1 thumbnail path | 120 thumbnails | 12,902,400 bytes | 93,237,248 bytes | 31,248,384 bytes |

Decoded DOM image delta:

`2,487,857,280 - 12,902,400 = 2,474,954,880 bytes`

So the 136× markup drop is not merely a string win. In the settled list, the browser-visible image
surface changes from full screenshots to thumbnails.

## What Was Measured

The harness launched real headless Chromium through Puppeteer and used the same real screenshot payload
D previously measured:

- source dimensions: `3331×1556`
- full decoded bitmap: `20,732,144 bytes`
- J1 thumbnail dimensions at `maxDim=240`: `240×112`
- thumbnail decoded bitmap: `107,520 bytes`

Each of the 120 screenshots was made unique by appending inert bytes after JPEG EOI. This avoids a
false pass where Chrome deduplicates every row into one shared decoded image.

Both arms keep full data-URL strings in a JS array to model hydrated `tradeJournal` rows. That isolates
the question Director asked: decoded bitmap/list render behavior, not string retention.

## Interpretation

The legacy arm still presents 120 full-resolution image resources to the DOM. The J1 arm decodes each
full screenshot transiently to rasterize a thumbnail, then leaves only thumbnail image resources in the
DOM. The settled DOM decoded-pixel floor falls by about **192.8×**.

The process-footprint counters do **not** show a 2.49 GB settled renderer increase in either arm on this
headless Chromium run. That means this harness does not support the claim that A's fix left a multi-GB
settled full-resolution bitmap cache intact. It does show the J1 raster path has a non-zero transient/
allocator cost: about **93 MB renderer private** in this synthetic 120-image run.

## Caveat

CDP does not expose the Chrome Task Manager "Image cache" column directly. The image-cache answer here is
therefore a real-browser decoded image surface measurement plus Windows process footprint, not a direct
Task Manager column scrape.
