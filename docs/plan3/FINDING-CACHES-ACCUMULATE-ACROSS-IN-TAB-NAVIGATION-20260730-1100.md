# FINDING — image and script cache accumulate across in-tab session loads

**Director · 2026-07-30 11:00 · binding on B (owner), C**

## The measurement, and it is a same-process comparison

All readings below are from **the same renderer process, PID 3224, started 09:16:08**.
The PO opened sessions 922, 923, 924 and 925 successively in that one tab over roughly
ninety minutes. No reload of the tab, no new tab.

| Column | Earlier (session 924) | Now (session 925) | Delta |
|---|---|---|---|
| Image cache | 63,075K → 63,126K | **85,768K** | **+22.6 MB** |
| Script cache | 32,304K → 37,329K | **64,661K** | **+32.4 MB (doubled)** |
| CSS cache | 213K → 187K | 411K | +224K |
| GPU memory (tab) | 43,729K → 96,129K | 94,776K | — |
| Renderer footprint | 309,208K → 971,664K | 683,344K | — |
| DOM nodes | — | **97,488, SINGLE CHART** | — |
| Documents | 4 | **7, SINGLE CHART** | — |

## Finding 1 — the caches grow with tab lifetime, not with panel count

This is a different mechanism from anything recorded today and it is the one the PO
described in his own words weeks ago as **hoarding without a flush**.

Earlier today the image cache was flat at 63 MB across one chart, four charts, and four
charts playing. I recorded it as fixed cost, and within a single session load that was
correct. It is **not** fixed across the life of the tab: four session loads later it is
85.8 MB, and the script cache has **doubled** from 32 MB to 64.7 MB.

Nothing here is per-panel. It is **per navigation**. Each session load adds cached
bytes that the previous session's bytes are not evicted to make room for.

**Why this matters for a real user rather than for a benchmark.** Every measurement we
have taken — ours and the PO's — starts from a fresh session and runs for minutes. A
trader opens the platform in the morning and switches between sessions, symbols and
layouts all day in one tab. **Our entire measurement methodology has been sampling the
best case, and the reported experience has always been of something that degrades over
hours.** That gap is now explained in mechanism, if not yet in magnitude.

Recorded as a hypothesis with one strong datum, not a confirmed rate (DECL-01). Two
samples ninety minutes apart do not establish a curve.

## Finding 2 — 97,488 DOM nodes on a single chart

The node count has been 51,303 / 48,290 / 94,131 across the three scaling sessions and
is now **97,488 on one chart** with **7 documents**. Whether this tracks the data range,
the tab's accumulated lifetime, or both, is exactly the question C's census must answer,
and this reading raises the ceiling of the answer considerably.

Documents at 7 on a *single* chart is separately notable: a single chart should not need
seven browser documents.

## Finding 3 — Test 1 did not run as specified, and that is my instruction's fault

I asked for Task Manager's JavaScript memory with DevTools closed and then open — one
gauge, one variable. What was captured was Task Manager in one screenshot and
Performance Monitor's JS heap line in the other, which changes **both** the gauge and
the DevTools state at once. C has already proven those two gauges disagree by 1.4x on
the same page at the same instant, so the comparison cannot separate the inflation from
the gauge difference.

Additionally the Task Manager JavaScript memory cell reads `184,112K (242,181K live)`,
where the live figure exceeds the total. One of those digits is misread and the cell
needs re-reading before it is quoted anywhere.

**The re-run is thirty seconds** and is specified precisely in the dispatch below.

## Orders

**B — this changes your asset packet from "resize" to "resize and bound".**

1. The logo resize stands and is still the largest single win available today.
2. **Now also required: why does an in-tab navigation not release the previous
   session's cached assets and scripts?** If session loads reuse the document rather
   than navigating, the browser's own cache eviction never runs and we are responsible
   for the lifetime ourselves.
3. Report whether a session switch is a real navigation, a soft route change, or a
   full teardown and rebuild inside the same document. That answer determines whether
   this is a browser-cache question or an application-lifetime question, and they have
   completely different fixes.

**C — one addition to the node census brief.** Take the node count on a **freshly
opened tab** and again after **four successive session loads in that same tab**. If
nodes accumulate across navigations the way these caches do, then the node census, the
document staircase and this finding are one mechanism and the whole memory hunt
collapses into a single question: *what does a session switch fail to release?*

## Method note

Six hours of measurement today has repeatedly rewarded looking at the whole number, and
this finding came from the PO running a test **incorrectly** and photographing more
columns than the test required. The instruction was narrow; the observation was wide.
**Where the cost is a single screenshot, capture everything and narrow afterwards.**
