# The trace is not thresholding, I read 2.18x B's blocking time, and I am not on B's host

**Manager C — 2026-07-31 21:00 — artifact `LIVE-TRACE-CALIBRATED-20260731.json`, build b120, bfcache default (read-only attach, no navigation)**

Three ordered items, done in order, before any bucket was read. Item 1 passes the test that mattered and
fails the number. Item 2 does not apply to me, and finding that out is worth more than complying with it
would have been. Item 3 was a one-line fix that turned out to be the wrong one line.

---

## 1. B's calibration: the thresholding test PASSES, the agreement does not

| Quantity | My trace | B |
|---|---|---|
| Unthresholded main-thread task total | **867.3 ms/s** | — |
| Blocking time, sum of (task − 50 ms) over 50 ms | **657.7 ms/s** | 302 ms/s |
| Outermost tasks in window | 1,196 | — |
| Tasks over 50 ms | 15 | — |
| Longest single task | **792.6 ms** | — |

**The decision rule the Director set is passed.** The tell was whether my unthresholded total came to ~300
ms/s (my instrument is also thresholding, decomposition untrustworthy) or north of 700 (it is not). It is
**867.3 ms/s**. My trace is not thresholding, so the buckets can be read.

That figure has an independent check, and it agrees: the decomposition pass — a different filter over
different events — puts the main thread busy **86.1% of wall, i.e. 861 ms/s**, against the task pass's
867.3. Two passes that share no code path agree to **0.7%**. The instrument is sound.

**What does not agree is the load: 657.7 against B's 302, a factor of 2.18.** I am not going to call that
an instrument disagreement, because the tell already cleared my instrument, and because there is a specific
and boring explanation available that is also testable:

> My trace was taken at **65,700 resident bars**; B's per-event window ran **1,930–6,242 bars**. My own
> cost-per-event curve rises **2.24x** between 6,700 and 36,104 bars. **A 2.18x ratio in blocking time is
> what a 2.24x cost curve predicts** — the same monster, read at ten times the bar count.

**Falsifiable, and cheap for B to settle:** if B re-runs the same conversion against a session at ~65,000
bars, B should read **near 650 ms/s, not 302**. If B reads 302 again at 65,000 bars, my explanation is
wrong and we do have an instrument disagreement — and then the 2.18 is the thing to chase. Until one of us
runs that, **no bucket of mine should be quoted against any number of B's**, which is what the artifact's
verdict field says.

**The 792.6 ms task is a finding on its own.** That is a single main-thread task holding the UI for over
three quarters of a second — not a statistical rate, a freeze a user would report as the page hanging.

### The calibration caught a defect in my own instrument, which is what calibrations are for

The first run of it returned **1,651.9 ms/s** of task time. That is more than a second of work per second
on one thread, which is impossible, and the impossibility is how it announced itself: `RunTask` and
`ThreadControllerImpl::RunTask` **nest**, and I summed both, counting every task twice. De-duplicating to
outermost tasks discarded **1,129 nested duplicates of 2,325** and produced the 867.3 above.

Had B's target been 600 instead of 302, my double-counted 1,101 would have looked like a plausible
near-miss and I would have published it. **The instrument now asserts the invariant** — task time per
second per thread cannot exceed 1,000 — and marks the whole trace INVALID rather than reporting a bucket
if it ever does again.

**And one process failure of mine to record:** I applied that calibration patch with a PowerShell string
replace whose anchor did not match. `.Replace()` returns the string unchanged when it finds nothing, so the
edit silently did nothing, and I ran a full trace against the live soak believing code was there that was
not. The artifact came back with the calibration field simply absent. **A patch that cannot fail loudly is
not a patch**, and the re-run cost an attach against a committed ten-hour run.

---

## 2. The rasteriser: the premise does not hold, because I am not on B's host

Recorded in the artifact as ordered, and it says the opposite of what the ruling assumed:

```
glRenderer: ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0)
            Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.15.9636)
glVendor:   Google Inc. (NVIDIA)
softwareRasterised: false
features not hardware-accelerated: direct_rendering_display_compositor, raw_draw,
                                   trees_in_viz, webnn   (none of them rasterisation)
```

**There is no SwiftShader here.** This soak runs on a Windows host with a hardware NVIDIA RTX 4060 through
ANGLE/D3D11, rasterisation hardware-accelerated. So:

- **My GPU-process figure is real GPU memory**, not software rasteriser memory wearing a GPU label. The
  first allocator dump's `gpu 236.3 MB + skia 68.7 MB` in the GPU process stands as measured.
- **My paint bucket is a user-comparable paint cost.** It is 0.5% of the main thread, and that number can
  be used as-is rather than as an upper bound.

The caveat the Director wanted inside the artifact is inside it either way — the field is generated from
the live string, so it prints the software-raster warning automatically on a host that has one, and prints
`Hardware rasterisation reported; paint buckets are comparable to a user path` on this one. **It is a
measurement now, not a remembered fact about a host.**

**But the important part is the consequence, and it is bigger than the caveat it replaces.** If B is on a
SwiftShader container and I am on hardware, **B and I have been comparing CPU numbers taken on different
machines all day**. Software rasterisation is not free and it competes for the same CPU, so B's host is
doing work mine is not. That is a second candidate explanation for the 2.18x — and it points the wrong way,
since it would make B's number *higher* than mine, not lower, which if anything *strengthens* the
bar-count explanation above. **Every cross-manager CPU comparison from today should carry the host, and
neither of us has been recording it.** I now do.

---

## 3. Dropping `toplevel` was the wrong one-line fix; keeping it and excluding `RunTask` is the right one

My first trace credited 99.9% of the main thread to a single "other" bucket because `RunTask` wrappers
enclose everything and I bucketed outermost events. The instruction was to drop the `toplevel` category.

**Dropping the category would have satisfied item 3 and broken item 1**, because `RunTask` is the only
source of main-thread *task durations* and B's calibration is defined over tasks. The correct fix is to
**keep `toplevel` for the task list and exclude `RunTask` from the bucketing pass**, which is what the
instrument now does. Both items are served by one trace instead of two attaches.

The decomposition, calibrated:

| Bucket | Share of main thread |
|---|---|
| **scripting** | **87.7%** |
| other (unclassified inner events) | 11.6% |
| painting | 0.5% |
| gc | 0.1% |
| layout / rendering / parsing | 0.0% |

271.6 ms of main thread per data event over 18 bars. `FireAnimationFrame` 70.7%, `TimerFire` 15.3%,
`HandlePostMessage` 10.8%. This reproduces the uncalibrated run's 87.2% scripting on a differently filtered
pass, and **now it is quotable**, subject to the 2.18x caveat above against B's figures specifically.

---

## Second allocator dump: scheduled, self-diffing, prediction already on the record

Approved and launched (`scripts/allocator-dump-two.mjs`, pid 20216), firing at ~185 minutes and diffing
itself against the first dump without needing me present. **The prediction is written into the script
before the measurement is taken**, and the grader scores it mechanically rather than letting me narrate
the result afterwards:

> v8 carries essentially all of the growth; `blink_gc`, `partition_alloc` and `malloc` stay approximately
> flat. **If `partition_alloc` climbs instead, bar data is held outside V8 and my per-bar figure needs
> re-reading against a non-JS arena.**

Growth is expressed in **MB per thousand resident bars**, not MB/h, and the diff voids itself if the
heaviest renderer's pid changes between dumps — two different processes cannot be differenced, and a pid
change would otherwise manufacture a spectacular fake delta.
