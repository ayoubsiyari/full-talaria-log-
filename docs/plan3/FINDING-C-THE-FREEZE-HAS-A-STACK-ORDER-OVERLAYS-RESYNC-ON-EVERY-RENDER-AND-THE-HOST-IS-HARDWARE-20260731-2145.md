# The freeze has a stack: order overlays re-sync on every render, and the host is hardware after all

**Manager C — 2026-07-31 21:45 — artifacts `LONG-TASK-ANATOMY-20260731.json`, `LONG-TASK-FREQUENCY-20260731.json`, `RASTERISER-IDENTITY-20260731.json` — build b120, live soak, read-only attach**

The Director is right that the 792 ms task is the most actionable thing produced today, and treating it as a
calibration by-product was my error. Made into the object of study, it gives up a cause in one attach.

---

## The rasteriser, read rather than inferred, on two routes

| Route | String |
|---|---|
| `SystemInfo.getInfo` on **the live soak browser** | `ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.15.9636)` |
| **`WEBGL_debug_renderer_info`** `UNMASKED_RENDERER_WEBGL` | `ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)` |
| `UNMASKED_VENDOR_WEBGL` | `Google Inc. (NVIDIA)` |

**Hardware rasterisation, confirmed on both routes. There is no SwiftShader on this machine.** The extension
is present on both WebGL1 and WebGL2, and the soak browser's GPU-relevant launch flags contain nothing that
would force software raster.

The WebGL read was **not** taken inside the soak page, deliberately: creating a WebGL context there allocates
in the very GPU process my scheduled allocator diff measures, and opening a tab can fully occlude the soak
window, which makes Chrome mark the page hidden and throttle its rAF. It ran in a separate short-lived Chrome
on the same machine, **bridged to the soak browser by an exact match on the independently measured
`SystemInfo` string** — a measured bridge, and the artifact refuses to transfer the result if the two strings
ever differ.

**So the caveat lifts.** My paint buckets and GPU-process figures are user-representative, and the cost curve
is not caveated on rasterisation. And the corollary stands from the other direction: **if B is on a
SwiftShader host, B and I have been comparing CPU numbers taken on different machines**, which is a hazard
neither of us was recording. It also points the wrong way for our 2.18x gap — software raster would make B's
number *higher* than mine, not lower.

---

## The freeze, dissected: eight of them, and they are the same freeze

One 15-second trace window contained **15 tasks over 500 ms**. The eight largest:

| Task | scripting | gc | rendering | layout | painting |
|---|---|---|---|---|---|
| 692.4 ms | 92.3% | 0.8% | 2.2% | 1.8% | 0.6% |
| 692.3 ms | 91.8% | 1.2% | 2.1% | 1.5% | 0.7% |
| 680.9 ms | 91.8% | 1.1% | 2.2% | 1.7% | 0.6% |
| 663.8 ms | 91.8% | 1.3% | 2.0% | 1.6% | 0.7% |
| 658.3 ms | 91.1% | 1.0% | 2.4% | 1.6% | 1.0% |
| 599.2 ms | 92.3% | 0.4% | 2.3% | 1.8% | 0.6% |
| 597.5 ms | 91.5% | 1.2% | 2.2% | 1.8% | 0.7% |
| 568.4 ms | 91.4% | 1.4% | 2.1% | 1.9% | 0.6% |

These are not eight different problems. **Every one is 91–92% scripting and every one has the same four
functions at the top in the same order.** A freeze here is a reproducible event, not a tail.

### Functions inside one 692.4 ms freeze (1,313 samples taken *inside that task*)

| Self | Function |
|---|---|
| **31.8% / 219.9 ms** | `_chartIndexForCloseMarkerOnChart` — order-manager.js:42043 |
| 12.7% / 88.1 ms | `m20Q6CapturedClear` — replay-system.js:9800 |
| 10.4% / 72.2 ms | `_m19iB62WindowFp` — chart-indicators-full.js:10526 |
| **9.9% / 68.6 ms** | **`set innerHTML`** |
| 2.7% / 18.5 ms | `setAttribute` |
| 2.6% / 17.9 ms | `checkVisibility` |
| 2.3% / 15.8 ms | `getBoundingClientRect` |
| 2.2% / 15.3 ms | `_resampleDataFull` — chart.js:26504 |
| 1.4% / 9.5 ms | `querySelectorAll` |

## The stack, which is the actual deliverable

```
_chartIndexForCloseMarkerOnChart      order-manager.js:42043     <- 31.8% of the freeze
 <- _chartIndexForExitMarkerOnChart   order-manager.js:42224
  <- (anonymous)                      order-manager.js:43223
   <- updateOrderLines                order-manager.js:46335
    <- _syncOrderOverlaysDuringPan    chart.js:29217
     <- render                        chart.js:29800
      <- ch.render                    index.html:1928
       <- _renderReplayChartUpdate    replay-system.js:4010
        <- m20Q6CaptureEffects / m20Q6StateFor / m20Q6CapturedReplayEffect
         <- updateChartData           replay-system.js:4202
          <- m20Q6CaptureEffects / m20Q6StateFor / m20Q6CapturedReplayEffect   <-- SECOND TIME
           <- mcDiagUpdateChartDataWrapper   chart.js:2718
            <- run                    replay-system.js:5081
             <- m20Q6PatchTimezoneManager / m20Q6CaptureEffects
              <- m20Q6InertableScheduledCallback  replay-system.js:9743
```

**Three things this names that no aggregate has named:**

1. **`_syncOrderOverlaysDuringPan` runs from `render`, during replay, with nobody panning.** The whole
   marker-index cost is entered through an overlay re-sync whose name says it belongs to a pan gesture. Every
   render re-resolves every order marker's bar index, which is why the cost is trades × bars — and it is 31.8%
   of a freeze on a session with 43 closed trades.
2. **The `m20Q6` capture wrapper appears TWICE in one stack**, around `updateChartData` and again around the
   render it triggers. `updateChartData` is re-entered through the capture layer, so the work below it is
   being done inside a nested wrapper chain rather than once.
3. **`set innerHTML` is 68.6 ms of a single freeze**, with `setAttribute`, `checkVisibility`,
   `getBoundingClientRect` and `querySelectorAll` adding ~8% more. That is a DOM-write-and-measure block
   inside the frame, and the second stack shows where it enters: `m20Q6CapturedClear` is called from an
   anonymous listener at **replay-dashboard-sync.js:10**, via `dispatchEvent` from `updateTimeDisplay` — so a
   dashboard listener runs synchronously on every clock update.

`_resampleDataFull` is **2.2%** of the freeze, consistent with the 3.5% it scored window-wide. **A's resample
is not what freezes the page.**

---

## GC: present in one freeze, absent in the next, and I nearly published it as a headline

The very first task I captured — 782.9 ms — was **24.1% GC (187.9 ms)**, against 0.1% GC in the window
average. That looked like the finding: the average erases GC, the freeze is where it lives.

**The next two windows do not replicate it.** Across the eight freezes above, GC is 0.4–1.4%. So the honest
statement is narrower and I am making it before the tidy version escapes: **GC is an occasional add-on to a
freeze that already exists, not its cause.** One freeze in three windows carried ~188 ms of collection on top
of the same 550 ms of scripting. The cause is the scripting, every time.

---

## Frequency, measured rather than extrapolated

A 5-second trace holding one 792 ms task extrapolates to 720 per hour, which is arithmetic. The Long Tasks
API was observed against the live soak for twelve minutes instead:

**12 minutes of live soak, 1,253 bars delivered, 1,984 long tasks:**

| Threshold | Count in 12 min | **Per hour** | Per thousand bars |
|---|---|---|---|
| over 50 ms | 1,947 | 9,733 | 1,554 |
| over 100 ms | 1,432 | 7,159 | 1,143 |
| over 200 ms | 1,209 | 6,044 | 965 |
| **over 500 ms** | **546** | **2,729** | **436** |
| **over 1 second** | **25** | **125** | **20** |

Median long task **316 ms**. Longest **1,500 ms**.

**A task over half a second happens every 1.3 seconds, and a task over a full second happens every 29
seconds.** The 792 ms task was not a tail event I happened to catch; it is the normal operating mode of this
build at 65,000 bars.

**Total time inside tasks longer than 50 ms: 942.6 ms per second.** Ninety-four percent of every second is
spent inside a task already long enough to be a jank event. Blocking time on this twelve-minute window is
**804.8 ms/s**, against 657.7 in the five-second trace and B's 302 — so the trace window, if anything, caught
a *quiet* stretch, and the gap to B widens rather than narrows on the longer measurement.

**A second counting defect, caught by the same invariant.** The first run of this returned 1,019 ms/s of
long-task time per second — impossible on one thread, exactly like the 1,652 ms/s the trace calibration threw
earlier tonight. Cause: `buffered: true` replays entries Chrome recorded *before* observation started, and I
divided that count by the observation window. Chrome's long-task buffer holds exactly **200** entries, and
excluding them gives the table above. Both instruments now assert the same invariant and refuse to publish a
rate above 1,000 ms/s.

---

## What I would hand A

- **`_syncOrderOverlaysDuringPan` called from `render` on every replay update** is the single biggest lever in
  the freeze, at 31.8%. If overlay re-sync can be skipped when nothing panned, or the marker's bar index
  cached against the bar array instead of re-resolved, a third of the freeze goes.

  **And the switch already exists in the shipped build.** In the deployed `chart.js?v=20260731b120`:

```30105:30112:_evidence/manager-C/deployed-chart-b120.js
//   window.__TALARIA_DISABLE_ORDER_OVERLAY_PAN_ALWAYS_V1 = true
let alwaysOrderSync = true;
try {
    alwaysOrderSync = !(typeof window !== 'undefined'
        && window.__TALARIA_DISABLE_ORDER_OVERLAY_PAN_ALWAYS_V1 === true);
} catch (_) { alwaysOrderSync = true; }
if (alwaysOrderSync || syncDrawingsNow) {
    this._syncOrderOverlaysDuringPan(
```

  I checked which call site is the live one rather than assuming, because `render` contains **two**. The other
  (deployed line 30012) sits inside `if (visible.length === 0 && this.data.length > 0)` and returns
  immediately after, so it cannot be the replay path — candles are visible. **The hot call site is the one the
  kill-switch covers.** The profiler's frames match the deployed file exactly:
  `_syncOrderOverlaysDuringPan` is defined at 29217 and `render` at 29800, which are the line numbers in the
  stack above.

  **I did not flip it.** Setting a flag on the live browser changes the behaviour of a committed ten-hour
  memory run mid-flight, and the slope is the measurement. It is a one-line A/B for A on a free host, and the
  acceptance criterion is already written: `_chartIndexForCloseMarkerOnChart` should fall from 31.8% toward
  zero. The comment above the switch also names what it protects — draft SL/TP lines trailing the candles
  during uncommitted pan — so this is a test lever, not automatically a fix.
- **The doubled `m20Q6` wrapper chain around `updateChartData`** should be looked at as re-entrancy, not cost.
- **`replay-dashboard-sync.js:10`** runs `m20Q6CapturedClear` and an `innerHTML` write synchronously on every
  time-display update — 12.7% + ~10% of the freeze, and it is not the chart engine.

**Still mine and still open:** the falsifiable prediction that `_chartIndexForCloseMarkerOnChart` goes to
near-zero in the zero-trade CONF-05 arm. This stack strengthens it — the function is reached only through
order-marker resolution — but it does not settle it, and arm 2 profiles the same way.
