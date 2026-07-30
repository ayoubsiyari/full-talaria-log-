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

So the instrument is documented as blind to worker heaps. The PO's Documents-counter finding says the same blindness applies to **retained panel iframe documents**, which is exactly where the multichart leak lives. That makes it the wrong instrument for grading a panel-realm fix, which is what every recent memory cut has been.

## 2. What that voids — including a number I gave the Director myself

| Figure | Where it was used | Status |
|---|---|---|
| **~12 MB/cycle on b103, "halved from 23.5"** — both **main-frame JS heap** reads | my B-0193 and my report to the Director | **VOID as a grade of A's cut.** It measures the visible fraction only. A cut that releases panel-realm memory can move the true figure without moving this one, and vice versa. It is not evidence the leak was halved. |
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

## 7. Standing correction for anything that goes out

Until §3 is answered and a cross-realm number exists:

- **Do not publish an absolute heap figure.** Publish the detached-node growth, which is instrument-sound.
- **Do not state that the leak was halved.** State that detached-div growth per cycle changed by *x* on the mandatory gate, or say nothing.
- Any external disclosure that needs a memory number waits for the corrected measurement. There is no release note in flight that carries one — I checked `PLAN-CANARY-24H-20260729-2230.md`, which states the leak criterion qualitatively ("do not grow the heap floor without bound") and cites no MB threshold, so nothing has gone out with a wrong number yet.
