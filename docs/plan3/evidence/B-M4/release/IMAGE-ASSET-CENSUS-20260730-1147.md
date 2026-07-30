# IMAGE ASSET CENSUS — every image the app loads, by decoded bytes

**Manager B · 2026-07-30 11:47 · answers the 10:20 dispatch item 1, before any cut**
**Instrument for every figure below: decoded image bytes (width x height x 4), and
Brave Task Manager "Image cache" where a measurement is quoted. Neither is JS heap.**

## Method, and why decoded bytes is the right column

`scripts/image-asset-census.mjs` walks the three served trees (`homepage/public`,
`chart v 1.4/chart`, `chart v 1.4/talaria-design`), parses PNG/JPEG/GIF/WebP headers for
true pixel dimensions, computes `width x height x 4` for the decoded bitmap, then greps
every HTML/CSS/JS/TSX file for references to each basename and classifies the load site.

A decoded bitmap costs `width x height x 4` bytes **whatever it cost on disk**. Flat
artwork compresses superbly, which is exactly why this went unnoticed for three months:
every one of these files looks trivial in a directory listing.

**The whole defect in one line: 1.67 MB of PNG on disk decodes to 200.51 MB of bitmap.**

## The top ten by decoded bytes

Deduplicated by image content, because the browser decodes a URL once no matter how many
copies of the file exist in the repo. "Copies" is how many paths hold identical bytes.

| # | Decoded | Pixels | Disk | Copies | Asset | Loads when |
|---|---|---|---|---|---|---|
| 1 | **40.24 MB** | 4720x2235 | 76 KB | 2 | `chart/modules/logo-14.png` | screenshot dark-brand wordmark, on demand |
| 2 | **40.22 MB** | 4720x2234 | 82 KB | 1 | `public/logo-05.png` | no live load path found (see below) |
| 3 | **31.40 MB** | 3684x2234 | 59 KB | 2 | `chart/modules/logo-05.png` | **EAGER — every chart page load** |
| 4 | **20.38 MB** | 2391x2234 | 114 KB | 3 | `chart/modules/logo-04.png` | **EAGER — every chart page load** |
| 5 | **20.38 MB** | 2391x2234 | 59 KB | 3 | `chart/modules/logo-08.png` | alert notification icon; screenshot brand row |
| 6 | **20.38 MB** | 2391x2234 | 64 KB | 2 | `chart/modules/logo-09.png` | screenshot brand row; legacy index |
| 7 | **20.38 MB** | 2391x2234 | 117 KB | 5 | `public/LOGO-07.png` | 22px icon in the backtest modal |
| 8 | **6.00 MB** | 1730x909 | 1100 KB | 1 | `public/talaria-log.logo.png` | OpenGraph share image (not rendered) |
| 9 | **1.00 MB** | 512x512 | 26 KB | 7 | `dist-v9/pwa/icon-512.png` | PWA manifest, on install |
| 10 | **0.14 MB** | 192x192 | 8 KB | 7 | `dist-v9/pwa/icon-192.png` | PWA manifest, eager |

Below the top ten it collapses to nothing: the 32x32 icons and the favicon are 4 KB
decoded between them. **Eight assets over 1024 px account for 199.36 MB of the 200.51 MB
total.** There is no long tail. There are eight files.

Format mix of everything referenced: **twelve PNGs and zero SVGs.** Every icon in this
product is a bitmap.

## The Director's four predicted shapes, adjudicated

1. **PNGs at multiples of displayed size — CONFIRMED, and it is the whole defect.**
   `logo-04.png` renders in a `440px` CSS box (`.loader-brand`) and ships at 2391 px.
   `LOGO-07.png` renders at 22 px and ships at 2391 px — **108x the displayed edge.**
2. **base64 data URLs in CSS or JS — REFUTED.** One `data:image/svg+xml` under 1 KB in
   `HomePageClient.tsx`. Nothing else.
3. **An eagerly-loaded full icon set — REFUTED.** There is no icon set. There are seven
   near-identical brand logos.
4. **A sprite sheet at absurd resolution — REFUTED.** No sprite sheets.

## What actually loads on a chart page load, verified by reading the code

This is the part that matters, and it is two files:

- **`logo-04.png` — 20.38 MB.** `dist-v9/index.html` line 1659,
  `<img class="loader-brand" src="/chart/modules/logo-04.png">`. A plain eager `<img>` in
  the shipped shell, decoded before the first candle is drawn.
- **`logo-05.png` — 31.40 MB.** `screenshot-manager.js`: module load calls
  `initScreenshotManager()` -> `new ScreenshotManager()` -> `constructor` -> `init()` ->
  `getBrandLogoImage()`, which requests `modules/logo-05.png` at 3684x2234.

**Together 51.78 MB against a measured Image cache of 63,075K (61.60 MB).** The
remaining ~9.8 MB is **not yet attributed** and I am not going to pretend it is. The
post-cut re-read is what settles it — see the prediction below.

### The second one is dead code, not a preload

`getBrandLogoImage()` has exactly two mentions in the entire repository: its own
definition and the call in `init()`. **Nothing consumes the result.** The screenshot
paths build their own images through `resolveAssetUrl()` (lines 104-105, 364-370), and
`getVisibleLogoBounds(image)` takes its image as a parameter, so `_brandLogoImage` is a
memo with no reader.

**A 31.4 MB decode on the critical path of every page load, for a cache nothing reads.**

## Two corrections to the 10:50 finding

The 10:50 note's arithmetic reached 52-72 MB by including assets that do not load. Both
of these are real files at real sizes; neither is fetched:

- **`logo-06.png`, 4720x2234, 40.22 MB decoded — never referenced.** Not in any HTML,
  CSS, JS or TSX file in any served tree. It is listed first in the 10:50 table.
- **`talaria chart.png`, 3582x2078, 28.39 MB decoded — never referenced.**

**28 of the 69 image files on disk have no reference anywhere** — 2.53 MB of dead
download weight, and 0 bytes of image cache. Deleting them is housekeeping, not a memory
fix, and I have not touched them tonight.

Also: `alert-system.js:1339` uses `logo-08.png` as a notification icon, so the first
alert a user receives decodes **20.38 MB for a 48-pixel icon**. That is a real spike but
it is not on the load path, so it is the next tranche rather than this one.

## The cuts, landed

### Cut 1 — resize the loader brand (pure size reduction, no flag per the 10:20 ruling)

`logo-04.png`: **2391x2234 -> 1024x957**, all four copies byte-identical.
**Decoded 20.38 MB -> 3.74 MB. On disk 117 KB -> 35 KB**, so it is also 82 KB less to
download on the critical path.

1024 px is deliberately generous: `.loader-brand` is a 440 px box, so this covers a 2x
device pixel ratio with room spare, and it is above every other use of the file
(280 px maintenance page, 80 px auth panel, 40 px homepage header, 22 px modal).

Resized with `scripts/png-downscale.mjs` — a dependency-free box downsampler over Node's
own zlib, because this machine has no ImageMagick, PIL or sharp and adding an image
dependency to a product repo hours before a canary is a worse trade than 150 lines. It
is alpha-weighted so a transparent neighbour cannot pull a halo into the wordmark edge,
it refuses anything it does not fully support rather than silently mangling it, and
`--selftest` is green on seven cells including a byte-exact round trip.

### Cut 2 — stop preloading the screenshot brand (flagged: it changes WHEN an asset loads)

`screenshot-manager.js` `init()` no longer calls `getBrandLogoImage()`.
**Decoded 31.40 MB -> 0 MB on load.** The method itself is untouched and still memoises,
so any future caller keeps working.

- Kill-switch: **`__TALARIA_DISABLE_SCREENSHOT_BRAND_PRELOAD_CUT_V1`** restores the eager
  preload exactly.
- Read through a realm climb (self -> parent -> top), because the chart shell can be
  framed by the dashboard and a host-only read would make the negative control inert.
  That is the B-0185 defect and CELL 6 is a mutant that proves the climb is load-bearing.
- Gate: `chart v 1.4/chart/modules/screenshot-brand-preload-cut.test.mjs`, **12/12**,
  loading the real shipped file in a vm with an instrumented `Image` so it exercises the
  actual module-load-to-constructor chain rather than a re-implementation.

**Combined: 51.78 MB -> 3.74 MB of eager decoded image bytes, a 48.04 MB cut off every
single page load**, plus 82 KB less to download.

## The prediction, so the re-read can falsify it

Same instrument that found this — **Brave Task Manager, "Image cache" column, DevTools
closed**, one chart, deployed build below.

- **Before (b103, PO-measured): 63,075K.**
- **If my accounting is right: roughly 14,000-15,000K.**
- If it lands near 63,000K, the cut did not reach the wire and the deploy is what to
  check first.
- If it lands near 24,000K, my ~9.8 MB residual is really ~19 MB and something else is
  holding image cache that I have not found — in which case the residual is the next
  thing I chase, not the logos.

Any of those three outcomes is informative, which is the point of writing the number
down first.

## Shipped, and what the PO does

**Build 20260730b110.** Verified over HTTP on the canary, not from the tree:

```
SERVED_STAMP=window.__TALARIA_CHART_BUILD_ID='20260730b110'
logo04_http=200  logo04_bytes=35347  logo04_pixels=1024x957  decoded_mb=3.74
logo04_sha256=b47ba1be1c53... matches the resized file byte for byte
screenshot-manager.js: guard=2 switch=1 climb_helper=1 call_sites=1
served shell: exactly one <img ... logo-04.png>, no other eager brand image
EAGER_DECODED_IMAGE_BYTES=3919872 (3.74 MB) from 1 asset — was 51.78 MB from 2
```

**The stamp to read on screen: `20260730b110`.**

**Re-read, same instrument, same column.** Brave Task Manager, **DevTools closed**, one
chart, hard reload first so the old decodes are not still cached:

1. Open the chart, wait for candles.
2. Brave menu -> More tools -> Task Manager.
3. Read the **Image cache** column for the chart tab.

Compare against **63,075K on b103**. My prediction is 14,000-15,000K. If it reads near
63,000K the cut did not reach your browser (check the stamp, then hard-reload). If it
reads near 24,000K my unattributed residual is bigger than I thought and I chase that
next instead of more logos.

## b111 — the full sweep, per the 10:50 dispatch

b110 cut the two assets on the eager path. b111 does all of them, sized from the displayed
measurement rather than a round number, and adds the CI check.

| Asset | Was | Now | Decoded image bytes | Target set by |
|---|---|---|---|---|
| `logo-04.png` | 2391x2234 | **880x822** | 20.38 -> 2.76 MB | 440px `.loader-brand`, 416px homepage hero, at 2x |
| `logo-05.png` | 3684x2234 | **600x364** | 31.40 -> 0.83 MB | 300px wordmark slot captured at `scale = 2` |
| `logo-05.png` (root) | 4720x2234 | **600x284** | 40.22 -> 0.65 MB | sized with its sibling |
| `logo-14.png` | 4720x2235 | **600x284** | 40.24 -> 0.65 MB | dark twin of logo-05 |
| `logo-06.png` | 4720x2234 | **600x284** | 40.22 -> 0.65 MB | unreferenced; sized with siblings |
| `logo-08.png` | 2391x2234 | **256x239** | 20.38 -> 0.23 MB | 80px auth panel at 2x, plus headroom |
| `logo-09.png` | 2391x2234 | **256x239** | 20.38 -> 0.23 MB | dark twin of logo-08 |
| `LOGO-07.png` | 2391x2234 | **256x239** | 20.38 -> 0.23 MB | 22px modal icon, generous headroom |
| `talaria-log.logo.png` | 1730x909 | **1200x631** | 6.00 -> 2.89 MB | 1200x630 OpenGraph convention |
| `talaria chart.png` | 3582x2078 | **1200x696** | 28.39 -> 3.19 MB | unreferenced; marketing size |

**251.35 MB -> 12.32 MB of decoded image bytes across brand assets**, 42 files rewritten,
every copy byte-identical to its siblings.

Verified on the wire over HTTP, not from the tree:

```
SERVED_STAMP=window.__TALARIA_CHART_BUILD_ID='20260730b111'
OK modules/logo-04.png  880x822  disk=31938B  decoded=2.76MB  target_max_edge=880
OK modules/logo-05.png  600x364  disk= 8638B  decoded=0.83MB  target_max_edge=600
OK modules/logo-06.png  600x284  disk= 8323B  decoded=0.65MB  target_max_edge=600
OK modules/logo-08.png  256x239  disk= 4785B  decoded=0.23MB  target_max_edge=256
OK modules/logo-09.png  256x239  disk= 4427B  decoded=0.23MB  target_max_edge=256
OK modules/logo-14.png  600x284  disk= 7623B  decoded=0.65MB  target_max_edge=600
ALL_BRAND_ASSETS_WITHIN_TARGET=yes
on_demand_loader=2  dead_getter_in_code=0  session_field_in_code=comment only
<img class="loader-brand" src="/chart/modules/logo-04.png" alt="Talaria" width="880" height="822" />
```

**The artwork was checked numerically, not by eye.** Alpha coverage and mean opaque colour
against each pre-resize version in git — both scale-invariant, so a faithful downscale
barely moves them. All 27 changed files within tolerance. Worth knowing: **`logo-05` is a
pure white wordmark** and renders as a blank rectangle against a white background. It looks
broken and is not.

**CI check: ASSET-DECODED-BUDGET-V1.** 4 MB per-image decoded ceiling plus a per-asset
target derived from displayed size, failing closed on anything it cannot parse, triggered by
any change under the served image trees. 10/10 with four mutants. The per-asset target is
the load-bearing half: a handover re-exporting `logo-08` at 900px sits under the 4 MB
ceiling but is still 3.5x its displayed size, and only the target catches it.

**Revised prediction for b111:** the eager path is now the loader brand alone at 2.76 MB, so
roughly **13,000-14,000K** in the Image cache column, against 63,075K on b103.

## Routing

- **A** — nothing here touches your territory. `logo-04.png` changed pixels only; no
  chart module changed except `screenshot-manager.js`, which does not load in panel
  realms (`chart-embed.html` does not include it).
- **C** — this is image cache, not JS heap, and not the document staircase. It will not
  move `performance.memory`, and it should not change your frame or node counts. If it
  does, that is a finding.
- **D** — no persistence surface touched.
