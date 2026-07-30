# CORRECTION — every heap figure we have quoted is main-frame scoped. What is void, what stands, and the command that replaces it.

**From:** Manager B (release) · **To:** Director, PO · **Cc:** Manager C (instrument owner), Manager A
**Raised:** 2026-07-30, against live pin `20260729b104`
**Trigger:** PO proved the retained-iframe mechanism with the Documents counter; Director reports the real figure is ~789 MB against the 131–192 MB we have been quoting.

## 1. What our instrument actually reads

Every heap number in this plan — mine included — comes from one call:

```js
performance.memory.usedJSHeapSize   // after forced GC, read in the TOP frame
```

`scripts/lib/heap-cycle-browser.mjs` takes it via `page.evaluate(...)`, which runs in the **main frame's** execution context, and the file already carries the admission for a neighbouring case:

> `note: 'Workers hold private heaps invisible to main usedJSHeapSize.'`

So the instrument is documented as blind to worker heaps. I then inferred that the same blindness applies to retained panel iframe documents. **That inference is WITHDRAWN — see §0 below. It was wrong, and it was the load-bearing claim of this document.**

## 0. CORRECTION 2026-07-30, after C's W86 — the central claim of this note was wrong

C measured what I had only reasoned about, and measured it the one way that settles it: **same-instant, two arms, nine samples.**

- The CDP metric that Performance Monitor displays reads **0.695 ×** `performance.memory`. The console gauge reads **higher** than Performance Monitor, not lower. **The sign of my claim was inverted.**
- Ballast allocated **inside panel A's realm moved the host console reading by +18 MB of JS heap in the host isolate**. A main-frame-only counter cannot do that. `performance.memory` is **per-isolate**, and our panels share the host renderer's isolate, so the host reading **does** include panel-realm JS heap.

**What this means for the tables below: the "VOID as a grade of A's cut" verdict is itself withdrawn.** The gauge is not blind to the memory A's cuts release. It remains blind to worker heaps, it measures JS heap and not DOM/CSS/GPU, and it cannot see realms placed in a *different renderer process* — which is C's leading candidate for the unexplained 789 MB, since a 15-pair session is ~30 frames and Chrome may split those across processes.

Two further consequences, both against my earlier framing:

- **~12 MB/cycle is an UPPER bound on the product rate, not a floor.** The PO measured with DevTools open, which inflates. I had told A to treat megabyte deltas as a floor. That was backwards.
- **`measureUserAgentSpecificMemory` is cancelled and C is right to refuse it.** COEP `require-corp` would break host-to-panel `frame.contentWindow` access, which both the product and the harness depend on: turning it on to measure memory would break the feature being measured. My §4 offered it as the better instrument; withdrawn.

My error was the one this plan's standing order names — I compared readings taken in different sessions and called the difference a property of the instrument. **Same-instant or it is not a comparison.** C's ballast test is the positive control I should have built before writing any of this.

The one thing here that stands unchanged is the reason it stands: the detached-node and DOM-census gates are counted from CDP snapshots rather than from `performance.memory`, which is why they were made the superior gate.

## 2. What that voids — including a number I gave the Director myself

| Figure | Where it was used | Status |
|---|---|---|
| **~12 MB/cycle on b103, "halved from 23.5"** — both **main-frame JS heap** reads | my B-0193 and my report to the Director | **The VOID verdict is WITHDRAWN (§0).** Same-isolate, so the gauge does see panel-realm JS heap; the reading is a legitimate grade of A's cut. Its real limits: DevTools was open (inflates, so ~12 is an **upper** bound), it excludes worker heaps and non-JS memory, and it cannot see realms in another renderer process. |
| `HEAP_CYCLE_PO_FLOOR_MB=[106,152,204]`, `HEAP_CYCLE_PO_BASELINE_MB=54` | pinned calibration constants | **Valid as main-frame readings, not as footprint.** Keep for continuity of comparison; relabel, do not re-baseline yet. |
| `HEAP-CYCLE-HEAP-FLOOR-BOUNDED` ≤ 8 MiB/cycle, **main-frame JS heap** | gate threshold | **Threshold is on the wrong scope.** Cannot pass or fail a panel-realm fix honestly. |
| `HEAP-CYCLE-PO-HAND-SHAPE` mean ≈13 MB/cycle **main-frame JS heap**, PO hand `75/80/72/90/96/141/155` | gate cell | same — main-frame scope only |
| `HEAP-GROWTH-SURFACE-CALIBRATION` pin of ≳28 MB, **main-frame JS heap** | leak-shape pin | same |
| Detached `<div>` ≈ **+21,699/cycle**, UniqueElementData +30,565, CSSBacking +22,209 | mandatory superior gate | **STANDS.** Counted from CDP heap snapshots and DOM census, not from `performance.memory`. This is why the detached-div gate was made the superior one, and that decision is now vindicated. |

**The detached-div gate is unaffected and remains the grading instrument.** Nothing in this correction weakens the leak finding — it removes a number that was flattering it.

## 3. Careful: 789 MB and 131–192 MB may not be the same quantity

Before we substitute one number for the other, the instrument behind 789 MB has to be named, because the candidates measure different things:

| Instrument | What it includes | Typical relation to `usedJSHeapSize` |
|---|---|---|
| `performance.memory.usedJSHeapSize` | live JS objects in **one V8 isolate**, quantised | the 131–192 figures |
| Chrome Task Manager → *Memory footprint* | whole renderer **process** RSS: JS heap + DOM + CSS + images + decoded bitmaps + GPU transfer buffers | commonly 3–6× larger |
| DevTools Performance monitor → *JS heap size* | renderer-wide JS heap (CDP `Performance.getMetrics` → `JSHeapUsedSize`) | larger than top-frame if realms are in separate isolates |
| `performance.measureUserAgentSpecificMemory()` | JS + DOM + CSS across the whole agent cluster, with per-frame attribution | the honest cross-realm total — **unavailable on canary**, see §5 |

If 789 MB came from the Task Manager it is a **process footprint**, not a heap, and the correct statement is "footprint ~789 MB, of which main-frame JS heap ~192 MB" — not "the heap is 789 MB". If it came from the Performance monitor it *is* a JS-heap figure and the top-frame instrument is under-reading by ~4×. Both are serious; they are not the same claim, and disclosure language differs.

**One line back from the PO settles it: which readout produced 789 — Task Manager "Memory footprint", or DevTools Performance monitor "JS heap size"?**

## 4. The replacement command — one paste, and it answers the question itself

Paste in the console **on the multichart page with panels open**, after the workload is armed. It reads every realm, not just the top one, and tells us whether the panels share the top frame's isolate:

```js
(async () => {
  const mb = (b) => +(b / 1048576).toFixed(1);
  const rows = [];
  const read = (w, realm) => {
    try {
      const m = w.performance && w.performance.memory;
      rows.push({
        realm,
        path: (w.location && w.location.pathname) || 'n/a',
        usedMB: m ? mb(m.usedJSHeapSize) : null,
        totalMB: m ? mb(m.totalJSHeapSize) : null,
        limitMB: m ? mb(m.jsHeapSizeLimit) : null,
      });
    } catch (e) { rows.push({ realm, error: String(e.name || e) }); }
  };
  read(window, 'top');
  for (let i = 0; i < window.frames.length; i++) read(window.frames[i], `frame[${i}]`);
  const used = rows.filter((r) => r.usedMB != null).map((r) => r.usedMB);
  const distinct = [...new Set(used)];
  let uaMemory = 'not attempted';
  try {
    if (window.crossOriginIsolated && performance.measureUserAgentSpecificMemory) {
      const r = await performance.measureUserAgentSpecificMemory();
      uaMemory = { totalMB: mb(r.bytes), breakdown: r.breakdown.filter((b) => b.bytes > 0).map((b) => ({ mb: mb(b.bytes), types: b.types })) };
    } else {
      uaMemory = `unavailable — crossOriginIsolated=${window.crossOriginIsolated === true}`;
    }
  } catch (e) { uaMemory = `threw ${e.name}`; }
  console.table(rows);
  console.log({
    realmsRead: rows.length,
    framesLive: window.frames.length,
    iframesInDom: document.querySelectorAll('iframe').length,
    documentsRetainedHint: 'compare with DevTools Performance monitor → Documents',
    distinctHeapReadings: distinct,
    sharedIsolate: rows.length > 1 && distinct.length === 1,
    sumOfRealmsMB: +used.reduce((a, b) => a + b, 0).toFixed(1),
    topFrameOnlyMB: rows[0] && rows[0].usedMB,
    uaMemory,
  });
})();
```

**How to read it, decided in advance so the answer cannot be argued afterwards:**

- **`sharedIsolate: true`** (every realm reports the same `usedMB`) — the panels live in the top frame's isolate, our 131–192 MB of **main-frame JS heap** *already* counted them, `sumOfRealmsMB` would be double counting, and the gap to the ~789 MB **process footprint** reading is non-JS memory or another process. The correction is then to disclosure language, not to the leak numbers.
- **`sharedIsolate: false`** (realms differ) — the panels are in separate isolates, the top-frame instrument **never saw them**, and `sumOfRealmsMB` is the JS-heap truth. Every per-cycle figure we have quoted is then a lower bound, and A's cut has to be regraded on the sum.

Either way the next number we publish carries its scope in its name.

## 5. Why the good instrument is unavailable here, and what it would cost

`performance.measureUserAgentSpecificMemory()` is the API designed for exactly this — cross-realm, per-frame attribution, JS **and** DOM — and it requires `crossOriginIsolated`, which requires `Cross-Origin-Opener-Policy: same-origin` plus `Cross-Origin-Embedder-Policy: require-corp` on the document. Measured on canary just now:

```
/chart/dist-v9/index.html          → 200, no COOP, no COEP
/chart/multichart-prod/chart-embed.html → 200, no COOP, no COEP
```

So it will reject there today. Turning COEP on is not a free measurement flag: `require-corp` makes every cross-origin subresource opt in via CORP/CORS, and anything that does not is blocked. **I am not enabling it on the canary during a 24-hour window** — that trades a measurement for a risk of blank panels. If we want it, it belongs behind its own flag on a separate lane, and it is a real packet, not a toggle.

## 6. What I am doing about recurrence

A figure without a scope is how this happened. `HEAP-FIGURE-SCOPE-V1` now lints release-facing documents: a heap figure in megabytes must name its instrument scope on the same line, from a fixed vocabulary (`main-frame JS heap`, `per-realm JS heap`, `cross-realm JS heap`, `renderer-process footprint`, `detached-node count`). Unlabelled figures fail the gate, so the next disclosure cannot inherit this defect silently.

## 7. To A, C and D specifically

**A — this paragraph previously told you the opposite and it was wrong.** Your panel-realm cuts *can* be graded on the console gauge: it is per-isolate and your panels share the host isolate, which C proved with panel-realm ballast moving the host reading by +18 MB. Treat megabyte deltas as an **upper** bound, not a floor, because the PO's readings were taken with DevTools open. The counter loop the plan gives you (`DOM-COUNTER-STAIRCASE-V1`) is the right instrument for iteration speed regardless, and detached-node growth remains the attributable one.

Your fixes are live: `e7616ab06` shipped in b104 as `db72fa4d3` (`git range-diff` prints them equal), and `XFRAME-REF-RELEASE` (`2ce27242d` + `34cac2453`) shipped in **b108**, both byte-equal to your originals. Your three CPU cuts and the countdown null guard shipped in **b109** — they were assembled on `manager-a/cpu-cuts-b105-20260730` and had never reached a stamp. All four gates green at my tip: 42/42 realm-teardown, 50/50 across countdown/legend-CSS/rAF with six on-disk mutants dead.

**Also for A:** the M17-DI2 kill-switch could not reach the panels. All four read sites — `chart.js`, `replay-system.js`, `panel-cmd-bridge.js` — are loaded inside every panel iframe and each read its own realm only, so a host-side flip left the guard on and would have presented as "no effect". Fixed at all four sites and shipped in b105; your gate is extended from 13 to 21 cells with a mutant that proves the climb is load-bearing. Worth checking the same question against your other panel-realm switches: `panel-cmd-bridge.js` still has 13 own-realm reads belonging to other cuts, and I have not touched those.

**C** — b103 and b104 are both retained with tarballs and images, so your grading target is intact. But the instrument you were asked to grade against reports main-frame JS heap only. If you have a regrade in flight that turns on a megabyte threshold, it needs the scope caveat attached before it is quoted. `report.meta.instrumentScope` now carries it on all three surfaces including `deployed`.

**D** — nothing in your persistence work changes because of this note; it is the heap thread only. The prefs-500 findings I sent you separately still stand.

## 8. Standing correction for anything that goes out

Until §3 is answered and a cross-realm number exists:

- **Do not publish an absolute heap figure.** Publish the detached-node growth, which is instrument-sound.
- **Do not state that the leak was halved.** State that detached-div growth per cycle changed by *x* on the mandatory gate, or say nothing.
- Any external disclosure that needs a memory number waits for the corrected measurement. There is no release note in flight that carries one — I checked `PLAN-CANARY-24H-20260729-2230.md`, which states the leak criterion qualitatively ("do not grow the heap floor without bound") and cites no MB threshold, so nothing has gone out with a wrong number yet.
