# FINDING — Test 4. The leak is UNBOUNDED: 4 → 17 replay engines. And `destroy()` IS being called, so my 15:36 mechanism is wrong.

**2026-07-28 15:54. PO heap snapshot, test server, `sessionId=888`, after five further multichart open/close cycles. Total heap 520 MB.**

**This is now the primary memory defect and it outranks everything else in the plan except the trade-loss hotfix.**

---

## 1. UNBOUNDED. This is the severe branch of Test 4.

**`M20Q6ReplaySystem` instance count: 4 → 17 after five more open/close cycles.** No cap. Roughly 2.6 new engines per cycle, each surviving forever.

**Retained size per orphan, from the PO's filtered view:** eleven instances at **~7,535 kB each**, three at ~7,534 kB, one at 7,336 kB, plus five smaller ones at 502/502/315/314/314 kB. **That is over 80 MB of orphaned replay engines in a single session, growing without limit.**

`Detached <div>` across all four snapshots: **19,852 → 21,097 → 22,151 → 44,953.** It roughly doubled in five cycles.

**This is the mechanism behind the 1 GB → 2.5 GB report.** It is not a slow ambient accretion; it is a large, discrete, per-cycle allocation that is never freed.

## 2. `destroy()` IS called. My 15:36 mechanism was wrong.

The PO expanded one orphan. It contains:

```
_m20Q6LifecycleState :: "destroyed"
```

**The engine's own lifecycle state says destroyed.** So `destroy()` ran, `m20Q6DrainState` ran, and **my 15:36 claim that the teardown hand-inlines half a destructor and skips `destroy()` is refuted by the object's own state.** The teardown is calling it. **The bug is that `destroy()` does not actually release anything that matters.**

## 3. Where the 7.5 MB per orphan actually lives

Same expanded orphan:

```
fullData      :: Array @30835125   → 7,238 kB
fullRawData   :: Array @18296563   →   290 kB
```

**`fullData` is essentially the entire 7,535 kB.** `destroy()` drains the WeakMap-held state via `m20Q6DrainState(m20Q6States.get(this), 'destroy')` — **but `fullData` and `fullRawData` are properties on the instance itself, not in that state object, so draining the state does not touch them.**

**The engine is marked destroyed while still holding a full copy of the candle data.**

## 4. The retainer is a strong `Map` keyed by the instance — and it is NOT `m20Q6States`

The PO's snapshot names the retaining edge:

```
1 / part of key {M20Q6ReplaySystem @14714091} -> value (Object @22396091) pair in Map
```

**The instance is a KEY in a `Map`, which is a strong reference and pins the key forever.**

**I checked the obvious suspect and it is innocent:** `m20Q6States` is declared `new WeakMap()` at `replay-system.js:9089`, and a WeakMap key cannot retain. **`replay-system.js` contains no `new Map()` at all**, so the retaining Map lives outside that module — most likely host-side, in `chart.js` or the multichart layer.

**Naming that Map is the fix, and I am handing it to A rather than continuing to grep blind** — A has the snapshot and can read the retainer chain directly, which is strictly faster than my guessing. **Per Ruling M-3 no memory fix ships without a named retainer path, and that requirement stands here.**

**One candidate worth checking first, not asserted:** the mcDiag instrumentation wraps the replay system (`chart.js:2644`, `mcDiagUpdateChartDataWrapper`) and installs a reporter. **Instrumentation that registers what it measures is a classic retainer, and we would then be leaking because of a diagnostic we added.** A should confirm or eliminate it rather than take it from me.

## 5. Detached documents DO exist. My 15:36 retraction was itself wrong.

The PO filtered for `Document`:

- **`Detached DocumentTimeline ×15`** and **`Detached DocumentType ×15`**
- Multiple **`Detached HTMLDocument`** entries
- And decisively: **`Detached <html lang="en" class="multichart-embed" …>`**

**`multichart-embed` is the panel iframe class** — `chart.js:2612` tests for exactly that class in `_isMultichartEmbedPanel()`. **These detached documents are multichart panels.**

**So my original 15:12 hypothesis was right, my 15:36 retraction of it was wrong, and roughly fifteen leaked documents line up with roughly seventeen leaked engines — one per leaked panel.**

**The lesson is specific and I flagged it myself at 15:36 without heeding it:** I concluded "no `Detached HTMLDocument`" from a list *sorted by shallow size*, while noting in the same document that a detached document has a small shallow size and could sit below the fold. **I wrote the caveat and then reasoned as though it did not apply.** A filtered query takes ten seconds and I substituted a scan for it.

## 6. Corrected mechanism

**Each multichart panel close leaks, permanently: one panel `HTMLDocument`, one `M20Q6ReplaySystem` marked `"destroyed"` but retained as a key in a strong `Map`, that engine's `fullData` array of roughly 7 MB, and the panel's detached DOM subtree of roughly 4,500 divs.** Nothing caps it.

## 7. Dispatch — Manager A. This is now top priority, above M25 and SURF-1.

1. **Name the retaining `Map` from the snapshot retainer chain.** Check the mcDiag reporter registry first. **M-3 applies: no fix without the named path.**
2. **Fix it as three things, not one:** delete the instance from that `Map` on `destroy()`; **null `fullData` and `fullRawData` in `destroy()`** so a retained instance cannot pin 7 MB; and confirm the panel document is released once the engine is. **Kill-switch, matching the teardown's three existing siblings.**
3. **Do not re-derive the "teardown skips `destroy()`" story — it is refuted.** `_m20Q6LifecycleState` reads `"destroyed"` on every orphan.
4. **Acceptance is M-6 and it is now validated as the right metric:** engine count exactly 1 in a single-chart state after multichart use, and no detached-`<div>` growth per cycle. **M-6 correctly reads red on this session where the withdrawn M-5 would have read green.**
5. **Report the count, not the megabytes** — your own harness-scenario doubt still applies to byte totals, and 4 → 17 is unambiguous without them.
