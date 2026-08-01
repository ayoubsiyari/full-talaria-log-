# CLOSURE — I retargeted the withdrawn finding at the correct file. `chart-embed.html` is healthy: both modules present, d3 vendored and stamped, engine stamped dynamically. The defect class does not exist in production. One residual for B: line 9 hardcodes a fallback build ID.

**2026-07-28 22:05. Closing the 21:10 finding properly rather than leaving it withdrawn and unanswered.**

---

## 1. B corrected one more detail of mine, and was right again

**I said production panels load dist-v9 iframes. B observed the running bytes:** `iframeSrcBuilder` → **`/chart/multichart-prod/chart-embed.html?…`**, with **zero** references to `chart-host.html`.

**I had read the doc comment at the top of `MultichartGrid.jsx`, which describes intent. B read what the served asset actually builds.** B recorded the discrepancy explicitly rather than quietly adopting my wording, which is the correct handling.

**B's redirect is scoped safely:** `= /chart/multichart` plus `^~ /chart/multichart/` with the trailing slash, so `/chart/multichart-prod/` is untouched. **The dead prototype is de-routed and the d3-from-CDN exposure with it.**

## 2. The retargeted question, and the answer

**A withdrawn finding is not the same as an answered question. My hypothesis was that the panel shell was stale and missing modules. It was aimed at the wrong file. The disciplined move is to aim it at the right one.**

**`chart v 1.4/chart/multichart-prod/chart-embed.html`:**

| Defect alleged at 21:10 | Status in the real panel shell |
|---|---|
| Missing `indicator-performance.js` | **Present**, line 355 |
| Missing `module-presence-runtime.js` | **Present**, line 347 |
| Engine loaded unstamped | **Stamped** — line 311 reads the build ID, line 372 appends `?v=` |
| d3 from CDN, no integrity | **Vendored** — `/chart/vendor/d3.min.js?v=20260727b80`, line 305 |

**The defect class does not exist in production. The real panel shell is modern, complete and stamped.**

**Consequence, stated because it is the honest one: the multichart indicator lag is NOT a missing-module problem.** The module is loaded. **The founding symptom of this investigation remains unexplained, and my 21:10 claim to have explained it is fully retracted with nothing salvaged from it.**

## 3. One residual, and it is a real one — for B

**Line 9:** `window.__TALARIA_CHART_BUILD_ID = p.get('v') || '20260727b80';`

**The fallback is a hardcoded literal.** A panel opened without a `?v=` parameter stamps every module — including `chart.js` — as **`b80`**.

**So if the `b81` bump did not rewrite line 9, every panel will request `?v=20260727b80` after the push and browsers will serve `b80`-cached bytes.** **That is the `order-manager.js` failure exactly: content moves, stamp does not.**

**Ordered for B: confirm the `20260728b81` bump rewrote line 9 of `chart-embed.html` in both trees, and that the `--deploy-gate` engine↔shell check covers this shell.** If the bump does not reach this literal, **the panel path silently serves one build behind on every push, forever** — and it would look exactly like a fix that did not work.

**This is a one-line verification and it is the last thing standing between "panels are healthy" and "panels are verified healthy."**

## 4. What I take from the whole episode

**Three claims in ninety minutes, each published on a source read and each corrected by an observation.** The pattern is now unambiguous and so is the remedy already recorded at 21:45: **claims about runtime behaviour go to B for a probe before they go to A as work.**

**Worth noting what the process got right despite me.** A refused work on the grounds of my own prior ruling. B held a 404 that would have broken multichart, then probed before landing the reverse instruction. **Neither manager executed a wrong Director instruction tonight, and both stopped one.** The isolation and escalation machinery earned its cost today.
