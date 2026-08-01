# FINDING — playback costs 186% of a core and 422 MB, and the JS heap triples

**Director · 2026-07-30 10:30 · binding on A, B, C**

## The measurement

PO, deployed b103, `sessionId=924`, DevTools closed, Brave Task Manager, full columns.
Four charts, **idle** compared against **thirty seconds of playback**.

| Column | 4 charts idle | 4 charts playing | Delta |
|---|---|---|---|
| Renderer footprint | 549,716K | **971,664K** | **+421,948K (+412 MB)** |
| Renderer CPU | 18.3% | **186.1%** | **10x** |
| JavaScript memory | 138,540K (133,408K live) | **319,552K (271,613K live)** | **+177 MB total, +135 MB LIVE** |
| JS a moment later | — | 197,776K (179,703K live) | −119 MB, −92 MB live |
| GPU process footprint | 288,452K | **516,452K** | +223 MB |
| GPU process CPU | 8.5% | **27.0%** | 3.2x |
| GPU memory (tab) | 60,647K → 96,129K | 68,021K → 88,439K | — |
| Browser CPU | 14.2% | 11.1% | — |
| Idle wake ups (tab) | 1,243 | **4,547 → 5,466** | ~4x |
| Image cache | 63,126K | 63,126K | **flat** |
| Script cache | 37,329K | 37,329K | **flat** |

**Total across all processes, four charts playing: roughly 1.6 GB and roughly 224% of
a core.**

## Finding 1 — 186% IN ONE RENDERER PROCESS IS THE SMOOTHNESS MONSTER

A renderer process reporting 186% is using **nearly two full cores**. A single process
cannot exceed 100% on one thread, so this is the main thread plus raster and
compositor threads all saturated simultaneously. Add the GPU process at 27% and the
browser at 11% and the application is consuming **about two and a quarter cores to
play four charts**.

This is the first time the cost has been measured across processes rather than in the
tab alone. C's earlier census reported 133-139% with 61% off-thread and was treated as
an oddity. It was not an oddity — it was the tab's share of a bigger number, and the
off-thread portion is raster, which is exactly what a 51,303-node DOM and a large
canvas surface area produce.

**The felt lag, the jitter, the panels that pause and jump, the fan noise, the thermal
throttling the PO has reported on a laptop — this number is all of them.** Nothing
else needs to be true for the product to feel the way it feels.

## Finding 2 — PLAYBACK ADDS 135 MB OF *LIVE* JAVASCRIPT

Idle four-up: 133,408K live. Playing: 271,613K live. **The live set doubles.**

Live is the number that matters. Total heap growing means allocation; **live growing
means objects are being retained while playback runs**. Thirty seconds of playback
retains an extra 135 MB across four panels — roughly **34 MB per panel** — and the
follow-up sample shows it falling back to 179,703K, so much of it is reclaimable but
is being held long enough to be resident.

**This is the JS-side defect we have been unable to find all week, and it only exists
during playback.** Every leak hunt was conducted on open/close cycles. Nobody profiled
allocation *during* play.

**It also reopens something I closed.** FIX 2 was cancelled when A measured GC overhead
at 0.258%. That measurement was not wrong, but it answered a different question: a
generational collector handles short-lived garbage cheaply, so low GC overhead is
entirely compatible with an enormous allocation rate. **Low GC cost never implied low
allocation, and I let it stand as if it did.** Allocation volume during playback was
never measured. It is now the question.

Candidates, unranked and to be settled by an allocation profile rather than by
argument: per-tick copies of bar arrays; indicator series reallocated whole on each
tick instead of appended; marker, label or order objects rebuilt per frame; string
formatting in the countdown and price-label paths on every frame; and the
already-known `Error` construction in the animate loop, which captures a full stack
trace per throw.

## Finding 3 — the GPU process gains 223 MB during playback

288 MB idle to 516 MB playing, with CPU tripling to 27%. Playback is producing
sustained raster and texture upload rather than compositing existing layers. That is
the signature the "promote the canvas" cut was written for, and this measurement moves
that cut from a speculative CPU tweak to a targeted fix with a number attached.

## Finding 4 — two things stayed flat, and that is informative

Image cache and script cache did not move by a single kilobyte between idle and
playback. Both are fixed cost, both are B's, and neither is implicated in the lag.
Useful: it means B's 62 MB asset work and A's playback work cannot interfere with each
other and can proceed fully in parallel.

## What this changes about priority

We have been treating memory as the canary blocker and smoothness as the follow-on.
**That ordering is now wrong.** The idle floor is a large number the user does not feel
directly; 186% of a core during playback is the thing the PO sees, the thing testers
report, and the thing a canary user will notice in the first minute. It is also,
unlike the floor, a defect rather than a design cost — a chart that plays smoothly on
one panel should not need two cores for four.

Memory work continues, because Findings 2 and 3 are memory work that happens to be the
same defect as the CPU. **The DOM node census stays the top instrument task**, because
node count drives raster, and raster is the off-thread majority of the 186%.

## Orders

**A — this is your packet, and it is the highest-value work in the plan.**

1. **Allocation profile during playback**, four panels, thirty seconds. Not GC
   overhead — allocation volume by call site. Name the top five allocating call sites
   by bytes. This is a DevTools Memory panel allocation-sampling run and it costs
   minutes.
2. **The animate-loop `Error` fire rate**, which is already assigned and is now more
   likely to matter than when I assigned it.
3. Then cut the top allocator, behind a flag, and re-read this same Task Manager row.

**C — one addition, ahead of the GPU monotonic question.** Break the 186% into main
thread versus raster versus compositor. A cannot aim at "186%" and the off-thread
majority decides whether the fix is fewer nodes, fewer surfaces, or less JavaScript.
The node census remains first.

**B — unchanged.** The 62 MB assets, then b104. Finding 4 confirms your lane does not
touch A's.

## Method note

Six findings today, all from Task Manager columns and a five-minute PO test. In the
same period the constructed instruments produced one finding, and it needed two
retractions. **The cheapest available measurement has outperformed the most expensive
one by an order of magnitude, and the difference was not sophistication — it was
looking at the whole system instead of the part we had already decided was guilty.**
