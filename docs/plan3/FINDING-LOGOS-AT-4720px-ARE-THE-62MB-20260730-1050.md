# FINDING — the 62 MB image cache is brand logos exported at 4720x2234

**Director · 2026-07-30 10:50 · binding on B (owner), A, C**

## Provenance, supplied by the PO and recorded as fact

The chart's entire visual layer — icons, order panel, bars, hover and click reactions
— was produced roughly three months ago by an external designer working on a local
server, then handed over and integrated. It ships as the **V9** layer
(`talaria-design/`, `dist-v9/`, `talaria-v9-live.js`), which is why the tab is titled
"Talaria — V9 Live".

The PO raised this as an untrained hunch: that the handed-over design assets and
elements might be oversized, and that some of their behaviour reached further into the
product than intended. **The hunch is correct on both counts and the first count is
now measured.**

## The measurement

Decoded image size is `width x height x 4 bytes` and is **independent of file size on
disk**. A logo is flat colour and compresses superbly, so an enormous image can look
harmless in a directory listing and be catastrophic in memory.

| File | Dimensions | On disk | **Decoded in RAM** |
|---|---|---|---|
| `modules/logo-06.png` | 4720 x 2234 | 87 KB | **40.2 MB** |
| `modules/logo-14.png` | 4720 x 2235 | 76 KB | **40.2 MB** |
| `public/logo-05.png` | 4720 x 2234 | 82 KB | **40.2 MB** |
| `modules/logo-05.png` | 3684 x 2234 | 59 KB | **31.4 MB** |
| `image/talaria chart.png` | 3582 x 2078 | 733 KB | **28.4 MB** |
| `LOGO-07.png` | 2391 x 2234 | 117 KB | **20.4 MB** |
| `modules/logo-04.png` | 2391 x 2234 | 114 KB | **20.4 MB** |
| `modules/logo-08.png` | 2391 x 2234 | 59 KB | **20.4 MB** |
| `modules/logo-09.png` | 2391 x 2234 | 64 KB | **20.4 MB** |

**4720 pixels wide is wider than a 4K display.** These are wordmarks and icons
rendered at a few hundred pixels.

## Which ones actually load, and the arithmetic

- **`dist-v9/index.html:1653`** — `<img class="loader-brand" src="/chart/modules/logo-04.png">`.
  The V9 loader brand, on **every page load, for every user**. **20.4 MB.**
- **`screenshot-manager.js:198`** — `getBrandLogoImage()` walks
  `['logo-05','logo-14','logo-04','logo-09']`, takes the first that loads, and caches
  it on `this._brandLogoImage` **permanently**. First candidate is `logo-05` at
  **31.4 MB**.
- **`screenshot-manager.js:364-367`** — the chart brand row uses `logo-08` or
  `logo-09`, **20.4 MB** each.
- **`alert-system.js:1339`** — `icon: 'modules/logo-08.png'` as a notification icon.
  **20.4 MB** for an icon that renders at perhaps 48 pixels.

Loader brand plus screenshot brand plus chart brand row is **roughly 52-72 MB**. The
measured image cache is **63,126K**. The account closes.

It also explains the two properties that made this confusing: the cache is **flat
between one chart and four**, because logos load once per tab; and it is **flat
between idle and playback**, because nothing about playing touches them.

## Why this matters more than its size

**It is bigger than the JavaScript heap of an entire chart** (63 MB against 102 MB for
everything the application computes), and it buys nothing.

**It is on the critical path of every page load.** Decoding a 4720 x 2234 PNG is real
main-thread milliseconds before anything renders, repeated per logo. The PO has
complained about slow load since the start of Plan 3 and this is a direct, uninvited
contributor.

**It is the lowest-risk fix in the entire plan.** No product logic, no money path, no
kill-switch semantics, no oracle, no regression class. Resize an image, keep the
`src`.

**And it survived a week of expert hunting** because every instrument we built looked
at the JavaScript heap, where this does not appear, and because 87 KB on disk looks
like nothing at all.

## Orders — B

1. **Resize every brand asset to its maximum displayed size at 2x** for high-DPI. A
   wordmark displayed at 240 px gets 480 px, not 4720. Expect ~60 MB recovered and a
   materially faster first paint.
2. **Do not simply constrain with CSS.** `width` in CSS does nothing to decoded size —
   the browser decodes the full bitmap regardless. The file itself must shrink. Add
   `srcset` or explicit `width`/`height` attributes as well so layout is stable, but
   the resize is the fix.
3. **Sweep every image asset in the served tree** for the same defect, not just the
   ones named here, and include the duplicated mirrors under `homepage/public/`.
4. **`alert-system.js:1339`** — a 2391 x 2234 notification icon. Ship a 64 px icon.
5. **`screenshot-manager.js`** — if a high-resolution logo is genuinely needed for
   exported screenshots, load it **on demand at export time and release it after**,
   rather than caching it on the instance for the life of the session. Screenshot
   quality is not a reason for every user to carry 31 MB permanently.
6. **Re-read the Task Manager image cache column afterwards** and report the new
   figure. Measured by the instrument that found it.
7. **Add a CI check**: no served image whose decoded size exceeds a stated budget.
   This is how it does not come back with the next design handover.

## The PO's second suspicion — the design layer reaching into product state

Not yet measured, but **it already has a confirmed instance**. D found that the V9
theme snapshot path in `v9-theme-bridge.js` was **overwriting the user's persisted
timezone**, forcing `America/Chicago` — a visual layer silently rewriting a user
setting that affects which candle a trade lands on. That is precisely the class of
defect the PO described without having the vocabulary for it, and it was found
independently before he described it.

Two further threads point the same way and are already assigned:

- **51,303 DOM nodes on a canvas chart.** The V9 layer is React. If the chrome, order
  panel, buttons and hover states are DOM components rather than canvas, that is where
  the nodes are, and DOM node count drives the raster load that is the off-thread
  majority of the 186% playback CPU. **C's node census must attribute nodes to V9
  components versus product chrome** — added to the census brief.
- **`[V9 ind] useEffect fired` firing continuously**, and 62 stylesheet rule-set
  invalidations per second. Both are React-shaped, and both were logged as unexplained.

**Standing instruction to all managers:** the V9 layer is now a first-class suspect
surface, not background. When a defect's mechanism is unclear, establish whether the
code path originates in the integrated design layer before assuming it is product
code. This is provenance information the managers did not have and could not have
inferred.

## Method note, and it is the sixth today

This took four minutes: list images, compute `w x h x 4`, grep for who loads them.
No harness, no subagent, no snapshot. **It was found because the PO volunteered
history that no measurement could have surfaced.** Domain and provenance context from
the PO has outperformed our instrumentation every time it has been offered, and it has
been offered rarely because nobody asked for it.
