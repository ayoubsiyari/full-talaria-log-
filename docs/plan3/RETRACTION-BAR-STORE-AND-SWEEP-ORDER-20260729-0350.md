# RETRACTION + REVISED ORDER — **The bar store is refuted.** The PO set `__TALARIA_DISABLE_SHARED_BAR_STORE` before both final runs and the leak persisted unchanged at ~50 MB per cycle. That is my **fourth** wrong mechanism in one night. I am not offering a fifth. The order changes from *hypothesis* to *enumeration*: sweep every parent→panel reference and release all of them. One concrete instance already found proves the class is populated. **PO has authorised the production trade-loss fix.**

**2026-07-29 03:50.**

---

## 1. Retraction

**At 03:20 I wrote that the Hoarder was "identified, by name, with a proven retainer chain and matching source." That claim is withdrawn.**

**The PO had `__TALARIA_DISABLE_SHARED_BAR_STORE = true` set before both final runs. Growth was +52/+46/+52 MB — indistinguishable from the unflagged runs.** **Disabling the mechanism did not change the outcome, so the mechanism is not the dominant term.**

**The retainer chain itself remains valid evidence** — a live global genuinely does reach a Detached Window through `clearFile()`'s closure. **But a real leak path that accounts for none of the measured growth is a defect worth fixing and not an explanation.** I conflated the two, and the falsification test I insisted on is the only reason that conflation lasted thirty minutes rather than a day.

**Tally, stated plainly because the pattern matters more than any single miss: retaining-`Map`-that-was-a-`WeakMap`, panel-id-keyed purge, symbol/timeframe datasets, shared bar store. Four mechanisms, four refutations, all within about six hours.** **Every one was reasoned from evidence; three were reasoned from evidence I had not validated. `MEAS-01` was written after the third and did not prevent the fourth.**

## 2. Why the next order contains no hypothesis

**The honest state of knowledge is narrow and worth stating exactly.** We know the leak is **~50 MB per multichart cycle, linear, bounded**; **independent of data volume and symbol count**; and composed of roughly **29 MB of `Detached` DOM and CSS objects** — `Detached <div>` +21,699, `UniqueElementData` +30,565, and some twenty further rows. **We know three panel documents are being retained per cycle. We do not know what holds them.**

**Four failed guesses is sufficient evidence that guessing is the wrong instrument.** **The order is therefore exhaustive rather than targeted: enumerate every reference the parent holds into a panel, and release all of them on teardown.** **A sweep cannot be wrong in the way a hypothesis can — it can only be incomplete, and incompleteness is measurable.**

## 3. The class is populated — one instance found while writing this

**`multichart-manager.js:381-389`:**

```js
function scheduleIframeBrandSuppression(frame) {
    var n = 0;
    var tick = function () {
        suppressIframeChartBrand(frame);
        if (++n < 48) setTimeout(tick, 250);
    };
    tick();
}
```

**A self-rescheduling timer chain, 48 ticks at 250 ms, holding `frame` in its closure for twelve seconds. No handle is stored anywhere, so `removeChart` cannot cancel it.** **A panel torn down inside that window keeps its iframe — and therefore its entire document — alive for the remainder.**

**I am explicitly not claiming this is the leak.** It is bounded at twelve seconds and cannot by itself sustain steady per-cycle growth. **Its value is as proof that uncancellable parent-held references into panels exist in this code, which is precisely the class the sweep must close.** **Presenting it as the answer would be the fifth mistake, made the same way as the first four.**

## 4. Revised order for A

**Priority one, above all shots: the self-resuming pause regression.** FIX 3's `document.hidden` predicate against a panel iframe. A canary user forgives a slow memory climb and does not forgive a chart that stalls and restarts itself.

**Priority two: the sweep.** Every parent-side timer, interval, animation frame, observer, event listener, closure and cache that holds a panel frame, document, window or node — enumerated and released in the reconcile removal loop. **Enumerated, not guessed. The deliverable includes the list.**

**Priority three, demoted from primary: the three bar-store shots.** Real defects, refuted as the dominant term, worth closing once the sweep lands.

**`GATE-01` acceptance is the `Detached <div>` delta, not total heap.** Expected magnitude is known exactly from the PO's capture: **+21,699 per cycle today, near zero when fixed.** **Total heap is contaminated by legitimate variation; the Detached count is specific to this mechanism and cannot be satisfied by noise.**

## 5. Production trade-loss — authorised

**PO: "yes for the trade loss, fix the problem."** **B is authorised to ship the scoped `api_server.py` hotfix to `talaria-log.com`, independent of the canary train.**

**Conditions, and they are not negotiable.** Restore point before touching anything. The scoped change only — **no schema changes, no data migration, no cleanup of existing rows.** Same-session verification that `journalVouchedFor` is present after deploy. Journal before execute.

**The PO's remark that "the users' sessions data is irrelevant" is read as tolerance for disruption, not as permission to delete.** **The entire purpose of this fix is to stop data being destroyed; a deploy that destroys some in passing would be self-defeating.** **B destroys nothing.**
