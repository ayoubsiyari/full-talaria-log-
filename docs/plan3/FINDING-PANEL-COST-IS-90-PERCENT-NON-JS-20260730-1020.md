# FINDING — the image cache is fixed cost, and a panel is 90% non-JavaScript

**Director · 2026-07-30 10:20 · binding on A, B, C**

## The measurement

PO, deployed b103, `sessionId=924`, DevTools closed, Brave Task Manager, full columns.
Single chart compared against **four charts, not playing**.

| Column | 1 chart | 4 charts, idle | Delta |
|---|---|---|---|
| Renderer footprint | 309,208K | **549,716K** | **+240,508K (+235 MB)** |
| JavaScript memory | 113,876K | 138,540K | **+24,664K (+24 MB)** |
| **Image cache** | **63,075K** | **63,126K** | **+51K — FLAT** |
| Script cache | 32,304K | 37,329K | +5,025K |
| CSS cache | 213K | 187K | −26K |
| GPU memory (tab) | 43,729K → 64,257K | 60,647K → 96,129K | climbing in both |
| GPU process | 101,651K → 111,805K | 109,886K → 141,481K | climbing in both |
| CPU (tab/GPU/browser) | 16.7 / 10.6 / 9.7 | 18.3 / 8.5 / 14.2 | ~41% of a core, idle |

## Finding 1 — THE IMAGE CACHE IS FIXED COST. My tile hypothesis is dead.

63,075K with one chart. 63,126K with four. **Fifty-one kilobytes apart.**

Ten minutes ago I proposed that the 62 MB was a tile cache retaining rasterised
candle tiles. **That is refuted and I am glad it was refuted this cheaply.** A tile
cache scales with panels. This does not move at all, which means the 62 MB is loaded
once, regardless of what the user does, and it is there before the first candle is
drawn.

**That makes it static assets**, and it makes it the single most attractive item in
the entire plan:

- It is **62 MB**, which is larger than the JavaScript heap of a single chart.
- It is **paid by every user on every load**, including the canary group.
- It costs **download time and decode time on the critical path**, so it is a
  load-speed defect as well as a memory defect — and load speed is something the PO
  has complained about repeatedly.
- Fixing it touches **no product logic whatsoever**. No kill-switch debate, no oracle,
  no money path, no regression class. It is the lowest-risk fix available to us and
  probably the largest single number we can remove today.

**B owns it and it starts now.** Enumerate every image asset the app loads, with byte
size and pixel dimensions. Expect one of: PNGs shipped at multiples of their displayed
size, base64 data URLs embedded in CSS or JS, an icon set loaded eagerly in full, or a
sprite sheet at absurd resolution. Report the top ten by decoded bytes before cutting
anything, so we cut with knowledge rather than enthusiasm.

## Finding 2 — A PANEL COSTS ~80 MB AND ONLY ~8 MB OF IT IS JAVASCRIPT

Three additional panels cost **+235 MB of renderer**, of which **+24 MB is JavaScript**.

**Per panel: roughly 80 MB, of which roughly 8 MB is JS. JavaScript is ten percent of
what a panel costs.**

This is the cleanest confirmation possible of the 10:00 ruling, and it is a harder
number than that ruling had. For a week, every memory fix, every retainer hunt, every
snapshot census, every cut A shipped and every grading run C built has operated on
**one tenth of the marginal cost of the thing the PO actually opens.**

It also explains, completely and without any remaining mystery, why five carefully
authored JS-side cuts measured zero twice on two independent instruments. They were
never going to be visible. The instruments could not see the other 90%, and neither
could the fixes.

The other 90% is DOM nodes, style and layout data, canvas backing stores and
compositor surfaces. **Which is precisely where the 51,303 DOM nodes and the GPU
growth live.** Three separate measurements this morning — the node count, the
JS-vs-renderer split, and now the per-panel decomposition — all arrive at the same
place from different directions.

## Finding 3 — GPU memory grew in all four samples, with nothing playing

Tab GPU 60,647K → 96,129K, **+35 MB**, between two samples of an idle four-chart
layout. The GPU process rose +31 MB alongside. The same direction appeared in both
single-chart samples earlier.

Four samples, four increases, no playback. That is no longer a curiosity.

It is still not a declared leak (DECL-01). Allocation ramping to a steady state after
opening panels looks identical to a leak over two samples. **C settles it: sample tab
GPU memory every thirty seconds across four multichart open/close cycles and report
whether it returns to baseline.** That is the same shape of question as the document
staircase and C already has the harness for it.

## Finding 4 — the script cache does NOT multiply per realm

32,304K at one chart, 37,329K at four. Three extra realms cost **+5 MB**, not the
+96 MB that "each realm loads its own copy of 642 scripts" would predict.

The browser is deduplicating compiled script across same-origin realms. **This is
good news and it retires a worry.** C's script-source finding stands as a description
of what a heap snapshot attributes, but the browser-level cost of an extra realm's
scripts is about 1.7 MB, not 32 MB. Nobody should spend another hour on per-realm
script duplication.

## Finding 5 — 41% of a core with four charts and nothing playing

Tab 18.3, GPU 8.5, browser 14.2. **Idle.** The browser process alone is at 14.2% with
4,547 idle wake-ups, which is higher than we have ever attributed and is not something
the chart's own code accounts for directly — it is IPC traffic, compositing and
storage activity driven by the page.

The whole application, four charts, doing nothing: **roughly 964 MB across renderer,
GPU and browser.** That is in the region the PO has been reporting from Windows Task
Manager all along and has been repeatedly told was over-reporting. It was not
over-reporting. **Our instruments were under-reporting, and I told the PO otherwise
more than once.**

No cross-vendor claim is made here. Comparing this to a competitor requires the same
gauge on both, and that has not been done.

## Orders

**B — highest value item you have, start immediately.** The 62 MB image inventory.
Sizes, dimensions, format, load path, eager or lazy. Top ten by decoded bytes reported
before any cut. Then cut, and report the new number from this same Task Manager column
so the effect is measured by the instrument that found it.

**C — reprioritised, in this order.** (1) Node census, unchanged, still the top lead.
(2) Is GPU memory monotonic across four cycles. (3) Composition of the non-JS
renderer memory. **Cancelled: the image cache enumeration** — it is static assets and
it belongs to B. **Cancelled: per-realm script duplication** — Finding 4 retires it.

**A — unchanged and read-only on the DOM lead**, plus one addition: canvas count and
backing-store dimensions per panel, since ~80 MB per panel with only 8 MB of JS points
directly at surfaces. Keep firing at `DOM-COUNTER-STAIRCASE-V1` in the meantime; that
work is unaffected and remains real.

## The correction I owe the PO, on the record

The PO reported roughly 1 GB, then 2.5 GB, from the operating system's own task
manager. I treated those figures as inflated by a factor of about 2.9 and retired
Windows Task Manager as an instrument on that basis. **That was wrong.** The PO was
reading the true cost of the application and our tooling was reading a fifth of it.

Recorded because the PO was right on the evidence he had, was told he was wrong, and
kept measuring anyway. The direct reason we found this today is that he ignored me
and looked at the whole number.
