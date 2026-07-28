# FINDING — The shell the PO actually uses, `/chart/index.html`, still serves `b75` while `dist-v9` serves `b82`. B's census reported holes=0 because the census cannot authenticate, receives a 307 to the login page, and skips it. The modules that shell loads *are* current, so tonight's fixes are live; the label is wrong and any module added since 26 July may be absent. Third surface tonight excluded from verification for a reason that was not "it does not exist".

**2026-07-29 00:25. My service-worker hypothesis was wrong and the PO refuted it in one line — `navigator.serviceWorker.controller` is `undefined`. I should have asked for `location.href` before theorising.**

---

## 1. What the PO's browser reports

```
location.href                    http://31.97.192.82:3000/chart/index.html?mode=backtest&sessionId=899
window.__TALARIA_CHART_BUILD_ID  '20260726b75'
script[src*="chart.js"].src      http://31.97.192.82:3000/chart/chart.js?v=20260726b75
navigator.serviceWorker...       undefined
```

**Same host I probed. Same port. A path I probed and mis-read.**

## 2. Why my probe missed it

**`GET /chart/index.html` unauthenticated returns `307 → /login/?next=%2Fchart%2Findex.html`.** I followed the redirect, landed on a 29 KB login page with no build stamp, and recorded *"login page — no stamp, correctly"*.

**The PO is logged in, so the PO receives the real shell — and it is `b75`.**

**`/chart/index.html` is a distinct shell from `/chart/dist-v9/index.html`. The hot-patch updated the second and not the first.** B's stamp census reported `holes=0` with *"product shells dist-v9 + chart-embed + chart.js at b82"*, which was **true and incomplete**: the census cannot authenticate, so the one shell a real user lands on is the one shell it never inspected.

## 3. The good news, verified in the bytes rather than assumed

**`GET /chart/modules/replay-system.js` on the PO's surface returns 200, 451,771 bytes, and contains both `REPLAY_HIDDEN_PAUSE` and `instance.fullData = null`.**

**So the modules are current even though the shell is not.** The mechanism is the one B already documented: **`stampInert: true` — nginx ignores `?v=` when choosing bytes.** The stale `?v=20260726b75` in the old HTML is a cache key, not a content selector, so the browser requests an old-looking URL and receives the current file.

**Consequence: the PO's two tests are valid. FIX 3 and M26 are genuinely executing.** **The build badge is lying, and the fixes underneath it are real.**

## 4. The residual risk, which is not cosmetic

**A `b75` shell contains `b75`'s script tags.** **Any module introduced after 26 July has no tag and therefore never loads — and no error is raised, because nothing asked for it.**

**That is precisely the defect that produced the indicator lag: `indicator-performance.js` present on disk, absent from the shell, silently missing.** **It is also the exact class `module-presence-runtime.js` exists to detect — and if the shell predates that module's tag, the detector is itself missing.**

**Refutable in one line from the PO's console, and I would rather have the answer than the inference.**

## 5. The pattern, which is now three for three

**Tonight, three live surfaces were excluded from verification, each for a different reason and none of them "it does not exist":**

1. `legacy-index.html` — **marked excluded in a manifest** (`INV-01` promoted in response).
2. `/chart/multichart/` — **assumed de-routed by nginx** while FastAPI mounted it directly.
3. `/chart/index.html` — **returns 307 to an unauthenticated prober**, so the census skipped it.

**Generalising, and this is the rule I am promoting: a probe that cannot reach a surface has learned nothing about that surface.** **`INV-01` covered manifest exclusions. It now covers every reason a prober fails to arrive — configuration, routing, and authentication alike.** **A 307 is not an absence of a shell; it is an absence of a session.**

**Corollary for B's instruments: the deploy gate must authenticate, or it must report which surfaces it could not evaluate rather than reporting `holes=0`.** **A census that silently omits what it cannot reach produces the most dangerous artefact available to us — a green result that means "I looked where I could".**

## 6. Ordered to B, ahead of the build

1. **Sync `/chart/index.html` to `b82`** on the test host, then re-read the build ID as an authenticated user rather than from the census.
2. **Make the deploy gate authenticate, or enumerate unevaluated surfaces explicitly.** `holes=0` must mean zero holes, not zero reachable holes.
3. **Confirm whether the `b75` shell was missing script tags present in `b82`** — if it was, that is a live capability-loss instance on the PO's own surface, not a theoretical one.
