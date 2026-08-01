# FINDING — **The Hoarder is identified, by name, with a proven retainer chain and matching source.** `window.__talariaBarStore` is created by whichever chart realm asks for it first, then assigned to the **top** window. When a panel creates it, the parent permanently holds a closure rooted in the panel's realm — so the panel's entire window and DOM can never be collected. **A kill-switch for it already exists in shipped code: `__TALARIA_DISABLE_SHARED_BAR_STORE`.** The PO can falsify or confirm this tonight in five minutes.

**2026-07-29 03:20. The PO's step-14 retainer capture ended a question open since the 4 → 17 orphan count first appeared.**

---

## 1. The captured chain, read bottom-up

```
value in system / PropertyCell
 __talariaBarStore in Window [JSGlobalObject] / 31.97.192.82
  clearFile in {put, pick, peek, clearFile, stats}
   context in clearFile()            ← chart.js?v=20260728b82:3314
    files in system / Context / scope
     … table in Map → tfs → cursors/bars …
      global_proxy_object in Detached system / NativeContext
       part of key → value pair in ephemeron table in **Detached Window**
```

**A live global on the top window reaches, through one closure, into a Detached Window.** **`chart.js:3314` is `clearFile(fileId) { files.delete(...) }`** — its closure captures `files`, and the whole store shares that scope.

## 2. The source, which matches exactly

**`chart.js:3191-3220`, commented "Resolve the ONE shared store (lazily created on the top same-origin window)":**

```js
let host = window;
try { const top = window.top || window; void top.document; host = top; }
catch (_e) { host = window; }
if (!host.__talariaBarStore) {
    host.__talariaBarStore = this._createSharedBarStore();   // line 3206
}
```

**Panels are same-origin iframes, so `void top.document` succeeds and `host` becomes the parent.**

**The defect is that `_createSharedBarStore()` is invoked in the caller's realm while the result is stored in the parent's.** **If a panel wins the race to first call, the store object and every closure inside it — `files`, `lruSeq`, `evict`, `unionByTime` — are constructed in that panel's JavaScript context, and then handed to a window that outlives it.**

**A closure keeps its entire scope chain alive, and a scope chain roots in its realm's global object.** **So the parent's `__talariaBarStore` pins the creating panel's Window, its NativeContext, and its whole document.** **Destroying the panel detaches it and frees nothing.**

## 3. Every unexplained observation now resolves

**Data independence, which killed my last hypothesis and is explained by this one.** What is retained is a panel's **realm and DOM**, whose size is set by DOM complexity, not by candle count. **A 3-year session and a 3-month session leak identically because the leaked object was never the data** — the PO measured 151 MB against 164 MB across a 4.4× data difference.

**The ~29 MB of `Detached` objects per cycle in the PO's comparison.** `Detached <div>` +21,699, `Detached blink::UniqueElementData` +30,565, `Detached blink::HeapVectorBacking<CSSPropertyValue>` +22,209, and roughly twenty more Detached rows. **That is a panel's entire rendered DOM held in memory, three times per cycle.**

**The engines.** `M20Q6ReplaySystem` +3 and `ReplaySystem` +3 per cycle, exactly one per panel — **and each only 376 bytes.** **The engines were never the payload; they are passengers inside the retained realms.** **Had we attacked the orphan count directly, as I nearly ordered twice, we would have freed 1.1 kB and declared failure.**

**M26.** Nulling `fullData` inside an engine cannot free the realm that holds the engine. **`correct but insufficient` is confirmed as the right label, and for a reason we can now state mechanically rather than by inference.**

## 4. Immediate falsification, available tonight

**Line 3194 already ships a kill-switch: `window.__TALARIA_DISABLE_SHARED_BAR_STORE = true` makes `_sharedBarStore()` return null before any store is created.**

**Set it before loading, then repeat the heap cycle test.** **Growth collapses → confirmed. Growth persists at ~50 MB/cycle → this chain is real but not the dominant term, and I say so.**

**This is a genuine falsification test rather than a confirmation exercise, and I want it run before A writes a line.** **Three of my hypotheses died tonight; this one arrives with a mechanism, a matching retainer capture, and a switch that can refute it in five minutes. It should still be made to survive that.**

## 5. The fix, for A, once the switch result is in

**The store must be created in the realm that owns it.** Panels must never construct an object destined for the parent's globals.

**Preferred shape: only the top window constructs the store.** A panel calling `_sharedBarStore()` uses `host.__talariaBarStore` if it already exists, and otherwise **falls back to a local store in its own realm** rather than creating one for the parent. **A panel-local store dies with its panel, which is correct.** The parent's store is then built by the host chart, in the host realm, where it belongs.

**Note the sharing loss is small and worth naming honestly:** panels that boot before the host would miss the shared cache and refetch. **That is a bandwidth cost, not a correctness one, and it is plainly preferable to pinning a document per panel forever.**

**Acceptance: heap flat across three cycles with distinct symbols, forced collection, and `Detached <div>` delta near zero in a snapshot comparison.** **The Detached count is the better gate than total heap — it is specific to this mechanism and cannot be satisfied by unrelated noise.**

## 6. Attribution

**This was found by the PO, in a DevTools pane they had not used before, at three in the morning, on the fourth attempt at a test I had failed to specify clearly.** **My three mechanism hypotheses tonight were all wrong; the measurement they insisted on completing before dispatching any of them is what produced the answer.** **Recording that plainly, because the process lesson is worth more than the fix: `MEAS-01` was earned, not theorised.**
