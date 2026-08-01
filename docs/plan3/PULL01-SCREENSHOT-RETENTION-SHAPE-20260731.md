# PULL-01 — screenshot retention shape

**Date:** 2026-07-31  
**Question:** entry-only, entry+exit, or every screenshot loaded in session?  
**Answer:** ordinary closed trades are **entry-and-exit**. Aggregate rows can be **entry-list + exit**.
There is no global session-level list found for every screenshot loaded in the session.

## Retention shape

### Ordinary closed trade

The normal close path writes both:

- `entryScreenshot`: captured at order placement and copied into the journal row.
- `exitScreenshot`: captured at close and copied into the journal row.

So the ordinary closed-trade model is **entry + exit**, not entry-only.

At the current real-payload figure:

| Model | Bytes | GiB at 301 closed trades |
|---|---:|---:|
| Entry only | 6,240,375,344 | 5.81 GiB |
| Entry + exit | 12,480,750,688 | 11.62 GiB |

The 5.81 GiB model is a lower bound for accounts where only one decoded bitmap per closed trade
is rendered/retained. The ordinary product row supports the 11.62 GiB model.

### Scaled / split aggregate rows

Scaled and split close paths collect **all entry screenshots** from the aggregate legs into
`entryScreenshots`, keep `entryScreenshot` as the primary/back-compat first entry, and also carry
an `exitScreenshot`.

Shape:

`entryScreenshots[N] + entryScreenshot(first) + exitScreenshot`

Depending on browser dedupe of identical data URLs, the first entry may or may not double-count as
a decoded bitmap. The safe product-shape statement is that aggregate rows are list-shaped and can
exceed the entry+exit ordinary-trade model.

### Rail attachments

The V9 rail consumes `window.__talariaV9RailScreenshots` once per place and clears the global.
Those attachments are copied into `railScreenshots[]` on the order/journal row. This is not a
session-global list, but it is another per-trade list-shaped retention path.

## Startup / baseline behavior

Yes: the journal renders thumbnails at startup.

`init()` schedules `updateJournalTab()`. `updateJournalTab()` reverses the full `tradeJournal`,
maps every row through `renderTradeListItem()`, and assigns the generated HTML to
`tradeHistoryList.innerHTML`. `renderTradeListItem()` emits `<img src="...">` for
`entryScreenshot` and `exitScreenshot` when embedded data URLs are present.

Implication:

- Embedded legacy journal rows are a **baseline decode candidate** on page/session load, not only a
  growth term as trades close.
- With M20-A1 externalized refs, display rehydrates from a bounded cache and prefetches the newest
  rows lazily for the journal tab; but embedded payload rows still render inline thumbnails.
- The detail modal renders larger entry/exit/list thumbnails only when a trade is opened, so it is
  an additional on-demand term, not required for the startup baseline finding.

## Fix implication

Today's priority should treat TAL-01891 as both:

1. a growth term while closing trades, and
2. a baseline term when a heavy-account journal is loaded and the journal sidebar renders image
   thumbnails.

The fix must avoid eagerly putting decoded full-size screenshots behind startup thumbnail `<img>`
tags. A safe direction is thumbnail derivation/lazy loading for display plus cold full-size bytes
only on explicit preview/export.

## Consumer check before A edits

Question: does any consumer need the full-resolution bitmap resident rather than fetchable?

Answer: **no startup consumer found that needs full-resolution screenshots resident.** Consumers
need full screenshots **fetchable** on demand:

| Consumer | Needs full screenshot bytes? | Needs resident decoded bitmap at startup? |
|---|---|---|
| Sidebar journal thumbnails | No — thumbnails/display only | No; should use derived thumbnails/lazy load |
| Trade details modal | Yes, for clicked trade preview | No; can fetch on modal open |
| `showScreenshotPreview()` | Yes, for explicit preview | No; explicit click path |
| JSON export | Yes, exact original bytes | No; existing M20-A1 path already rehydrates refs lazily before export |
| CSV export | No | No |
| PDF / print / share card | No journal screenshot consumer found in D-owned paths | No evidence of resident requirement |

Therefore A can keep full-resolution screenshot bytes cold/fetchable and make startup display use
bounded thumbnails. Export/preview must fail loud if full bytes cannot be restored; they do not
require full bitmaps to live in the journal render path.

## Practical cap on `entryScreenshots[N]`

There are two entry-list mechanisms:

1. **Explicit split / multi-entry levels**: `MAX_ENTRY_LEVELS = 4`, so this path is practically
   capped at four entry screenshots plus exit/rail attachments.
2. **Manual position scaling (`scaleNextOrder`)**: `applyScaling()` pushes each new scaled order
   into `group.entries` with no `MAX_ENTRY_LEVELS` check found. Its practical cap is whatever
   limits open positions / margin / manual operation, not a screenshot-list guard.

So `entryScreenshots[N]` is capped for the explicit multi-entry UI path, but **not proven capped**
for repeated manual scaling. The fix should treat aggregate entry lists as unbounded unless A adds
or proves a scaling-group cap.
