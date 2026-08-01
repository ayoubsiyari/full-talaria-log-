# D2 — Attribute the 497 MB Renderer Residual

**Date:** 2026-07-31  
**Manager:** D  
**Inputs:** `_evidence/manager-C/BASELINE-CENSUS-20260731.json`,
`docs/plan3/FINDING-C-R1-EIGHTY-TWO-PERCENT-OF-RESIDENT-BARS-PRECEDE-THE-SESSION-AND-THE-BASELINE-IS-72-PERCENT-NON-JS-20260731-1130.md`

## Verdict

The 497.23 MB is the native cost of running four full chart realms, not a hidden canvas term.

C's census already names the accounting boundary:

- renderer footprint: **693.8 MB**
- post-GC page JS heap: **186.66 MB**
- named renderer floors: **4.16 MB canvas**, **5.75 MB decoded images**
- residual: **497.23 MB**

The mechanism in code is multichart realm replication: the host plus three iframe panels boot full chart
documents, parse the chart module stack in each realm, allocate a complete DOM/style/listener/layout graph
per document, start worker-capable indicator code, and retain per-realm replay/bar/cache structures. JS
heap explains only the JavaScript object part; the residual is the browser-native side of the same boot.

## Measured Anchors

From C's census:

- **7 documents / 7 frames** at first paint.
- **61,272 live nodes**, **14,796 listeners** before forced collection.
- **23,551 nodes**, **5,512 listeners** after forced collection still remain.
- **251 script requests**, **44.26 MB decoded script bytes** at first paint.
- **2 worker targets** seen by CDP; worker heap attribution failed, but the memory is already inside
  renderer private.
- **4 canvases**, **4.16 MB backing-store floor** total. This kills "canvas backing stores" as the
  497 MB explanation.
- **120 MB worker ballast** moved renderer private by **+121.2 MB** while page JS heap moved by
  **-0.39 MB**. This proves worker/native allocations are counted in the renderer residual and invisible
  to the page heap gauge.

## Code Mechanism

The topology is host plus iframes:

- Host realm: `dist-v9/index.html?mode=backtest&mcLayout=1`.
- Panel realms: `MultichartManager.addChart()` creates iframe entries, with the V9 grid source builder
  routing panel loads through `/chart/multichart-prod/chart-embed.html?...` and then the multichart
  embed stack.

Each panel is a separate document and JS realm, not a light canvas tile.

`chart v 1.4/chart/dist-v9/index.html` / `chart-embed.html` still load the chart shell, fonts, CSS, D3,
LZ string, drawing tools, preferences, keyboard shortcuts, timezone manager, indicator modules, and
`chart.js`. The multichart embed path skips a few host-only modules, but it does not become a shared
renderer.

`chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` runs inside every iframe and installs command,
replay, order, focus, keyboard, drawing, and context-menu routing. That explains why panels carry native
listener state even when only the parent chrome is visible.

`chart v 1.4/chart/chart.js` and `chart v 1.4/chart/modules/chart-data-pipeline.js` retain multiple
series shapes per realm: `replaySystem.fullRawData`, `replaySystem.fullData`, `chart.rawData`,
`chart.data`, `dataPipeline._resampleCache.result`, and `chart.displaySeries`. C measured **239,093 bar
slots** and **149,606 distinct bar objects** across four realms. Those objects are mostly in the JS heap,
but their companion native allocations, array backing stores, compiled code, strings, and realm metadata
sit outside `usedJSHeapSize`.

`chart v 1.4/chart/modules/chart-indicators-full.js` can create `/chart/workers/indicator-worker.js`.
C saw worker targets but did not get worker heap numbers. The failed worker ballast gate proves that any
real worker heap is part of the 497 MB residual, not part of the 186.66 MB page heap.

## Attribution

This is the most defensible split with current instruments. The MB widths below are rough attribution
ranges, not measurements; they are included to show that the named mechanisms cover the 497 MB without
inventing a fifth mystery term.

| Bucket | Rough MB | Status | Why it belongs in the 497 MB residual |
|---|---:|---|---|
| Per-realm V8 code / bytecode / external strings | 120-180 | Measured script mass, native code/cache inferred | 251 script requests and 44.26 MB decoded script bytes are baseline and duplicated by realm; compiled code/cache are outside `usedJSHeapSize`. |
| DOM/style/layout/listener graph for 7 documents | 80-140 | Measured shape, native bytes not individually sized | 61k nodes and 14.8k listeners are browser-native structures around JS wrappers. |
| Worker heaps and worker allocator arenas | 20-80 | Proven blind spot | Worker allocations move renderer private 1:1 and do not move page JS heap; C saw two worker targets. |
| Paint/compositor/Skia/font caches beyond the canvas floor | 40-90 | Inferred from floors/browser model | Canvas backing stores are only 4.16 MB; layer/display-list/font/native paint state is not counted in page heap. |
| Allocator arenas / fragmentation | 40-80 | Mechanism proven by worker ballast | Freeing worker ballast did not return memory to the OS; four heavy realm boots leave warm arenas. |
| Floor shortfalls | 10-30 | Defined by C's composition model | Canvas and decoded-image rows are floors, so shortfall is absorbed into the residual by construction. |

## What Not To Aim At

Do not aim this at the four chart canvas backing stores. C measured them at **4.16 MB**.

Do not aim only at candle JS objects. C already counted the page heap at **186.66 MB**; cuts there help,
but they cannot explain the 497 MB residual by themselves.

The baseline lever is reducing replicated realms and their native browser state: fewer full iframes,
lighter iframe shells, shared scripts/workers where possible, and bounding resident pre-session bars so
each realm has less chart state to wrap and compile around.

Highest leverage for the residual itself is cross-realm script/code sharing or fewer full iframe engines.
R-1 / `fullRawData` / `fullData` cuts still matter, but they primarily attack the 186.66 MB JS heap side.
