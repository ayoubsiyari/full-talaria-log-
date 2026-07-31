# Release manifest — canary `20260731b118`

**Shipped:** 2026-07-31 ~11:29Z by manager-B
**Source SHA:** `79625eac647aca88144e415ad27784063afddf3b`
**Images:** `talaria-trading-chart:canary-20260731b118`, `talaria-homepage:canary-20260731b118`
**Predecessor:** `20260731b117` (`1dad98859`)

**b118 = b117 + M20-J1.** One row, taken by SHA off `manager-a/journal-screenshot-thumbs-20260731`.

| Row | SHA | Marker on the wire |
|---|---|---|
| A — journal list stops carrying full-resolution screenshots (TAL-01891) | `d03dfc30f` | `_m20J1ThumbsEnabled` in `/chart/modules/order-manager.js` |

Everything b117 carried was re-checked on the wire after this deploy and is still present:
TICK-OFF-01, the window-claim P0, the support passport axis, E's opening-range bound and
clearIndicators evict, D's excursion single-owner and TRADE-EVICT, both Rayan #8 flags.

---

## TEST-02 — discriminating marker, provably absent from b117

The negative control was taken from the wire **while b117 was still live**, before this deploy,
for the same reason as last time: afterwards b117 is gone and the absence stops being provable.
It is on the host at `/root/b-m20j1/b117-baseline/order-manager.js`, sha256 `45586eb673302 9da…`,
2,492,338 bytes.

| Marker | b117 (before deploy) | b118 (now) | |
|---|---|---|---|
| `_m20J1ThumbsEnabled` | 0 | 4 | discriminating |
| `__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1` | 0 | 2 | discriminating |
| `M20-J1` | 0 | 4 | discriminating |

Both fetches were positive-controlled against `updateJournalTab`/`closedPositions` first. The
served file's sha256 (`20f998d9f50b5519…`) equals the sha256 inside the homepage image, so nothing
is cached between the assertion and the artefact.

## The number the ticket actually asked for

TAL-01891 is a memory ticket, so a present marker is not the claim. The claim is a byte count, and
the byte count that matters is the **decoded** bitmap the renderer holds — not the data URL's
length. A 3331×1556 capture decodes to ~19.8 MB of RGBA however small the row paints it.

Running A's own `_m20J1RasterizeThumb` as served by b118, at its shipped config
(`maxDim: 240, quality: 0.72`):

| | dimensions | encoded | **decoded** |
|---|---|---|---|
| full capture, as b117 served it | 3331×1556 | 0.22 MB | **19.77 MB** |
| thumbnail, as b118 serves it | 240×112 | 0.01 MB | **0.10 MB** |

**193× less decoded memory per screenshot.** Two screenshots per closed trade, whole journal
rendered:

| closed trades | before | after | saved |
|---|---|---|---|
| 100 | 3,954 MB | 20.5 MB | 3.93 GB |
| 301 | 11,903 MB | 61.7 MB | 11.84 GB |

This also settles the mechanism question on the ticket. The reported hypothesis was retained
decoded bitmaps, one per closed trade. There is no `createImageBitmap` anywhere in this repo —
the cost was the browser decoding full-resolution data URLs handed to `<img>` tags in the journal
list, which is why a JS-heap grader reads GREEN while the machine swaps. A reached the same place
independently from the other side in `4f41865a4`.

## The kill-switch

| `__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1` | thumbs enabled | |
|---|---|---|
| unset (shipped default) | `true` | ok |
| `true` | `false` | ok |
| `'0'` — truthy string | `false` | ok |
| `0` — falsy | `true` | ok |

Real truthiness, not `=== true`.

## One instrument failure, recorded

The first run of this probe reported the thumbnail as 0×0 and printed a "20,732,144×
reduction" and an 11.9 GB saving. That was **my instrument, not A's fix**:
`_m20J1RasterizeThumb` ends with `this._m20A1IsValidScreenshotDataUrl(out) ? out : null`, and my
isolated holder did not carry that collaborator, so the call threw into the method's own `catch`
and returned `null`. An absent result looked identical to an infinite saving.

The probe's own gate refused to confirm on that run, which is the only reason it did not become a
reported number. It now aborts explicitly on an empty thumbnail rather than dividing by it — a
ratio against zero is not a measurement.
