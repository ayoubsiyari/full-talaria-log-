# FINDING — The deploy worked; the PO's browser did not. `dist-v9` serves `20260728b82` on the test host, the PO's console reads `20260726b75`, and a service worker registered at `/chart/` scope is the mechanism. That makes this a delivery hazard rather than a stale tab: a returning canary user may keep an old shell after we push, which is the cache-stamp problem with teeth.

**2026-07-29 00:10. Probed read-only. Production is on `20260723b56`, which is a separate fact worth recording.**

---

## 1. What is actually served

**Test host `31.97.192.82:3000`:**

| path | status | build |
|---|---|---|
| `/chart/dist-v9/index.html` | 200 | **`20260728b82`** |
| `/chart/legacy-index.html` | 302 → dist-v9 | **`20260728b82`** |
| `/chart/index.html` | 307 → `/login/?next=…` | *(login page — no stamp, correctly)* |
| `/chart/` | 403 | — |

**B's deploy is real and B's census was honest. `b82` is live and the legacy de-route works.**

**Production `talaria-log.com/chart/dist-v9/index.html`: `20260723b56`.** **Five builds and six days behind, and it contains the trade-loss defect.** Consistent with D-5 reserving production for a single push, and worth stating numerically in the incident record — **the exposed users are on `b56`, not on anything recent.**

## 2. Why the PO sees `b75`

**Neither surface serves `b75`. Production is `b56`; test is `b82`. So `b75` is not coming from a server — it is being served from within the browser.**

**Mechanism identified:** `pwa-install.js` calls

```
navigator.serviceWorker.register("/chart/sw.js", { scope: "/chart/" })
```

**present in five copies across the trees, with `sw.js` shipped in six locations.** **A service worker at `/chart/` scope intercepts requests for everything the chart loads, including the shell that carries the build stamp.**

**And `b75` is exactly the build the test host served earlier tonight** — B's own pass-1 probe recorded `legacy-index.html` at `20260726b75` before it fixed the route. **So the PO's browser cached that shell while it was current and has been replaying it since.**

**This is why a plain reload will not clear it. A service worker answers before the network is consulted.**

## 3. The part that is not about tonight's test

**If a service worker can pin `b75` in the PO's browser after we deployed `b82`, it can pin an old shell in a canary user's browser after we push.**

**That is the cache-stamp hazard again, but stronger.** The `?v=` stamp busts HTTP caches. **A service worker is not an HTTP cache — it is code that decides what to return, and a stamped URL it has already cached is still a cache hit.** **So our entire delivery verification story — census green, stamps coherent, `journalVouchedFor` present on the wire — describes what the server offers, not what a returning user receives.**

**Every "verified on the deployed build" claim tonight was made against a cold fetch. The PO just demonstrated that a warm browser gets something else.**

## 4. Not yet a conclusion — one thing must be checked before this becomes a finding

**`chart/modules/talaria-version-reload.js` exists and reads as purpose-built for exactly this**, with feature-detected `navigator.serviceWorker` handling. **Someone anticipated it.**

**So the open question is not "is there a hazard" but "is the existing mitigation wired in and does it work":** does `talaria-version-reload.js` load on the served shells, does it detect a build-ID change, and does it **update or unregister the worker** rather than merely reloading the page — because a reload that the worker also answers changes nothing.

**Per `BRIEF-02` I am not asserting the hazard is live until that is read.** **Refutation cost is one file read plus one warm-browser test, and B has the host.**

## 5. Ordered

**B, after the guard-firing check:** determine whether `talaria-version-reload.js` is loaded on the shells a user actually gets, whether it acts on the worker rather than just reloading, and **whether a warm browser holding `b75` transitions to `b82` without manual intervention.** **If it does not, the canary delivery story is broken and no amount of server-side census fixes it.**

**And a standing correction to how I have been reading B's evidence: `census green` and `probe PRESENT` are statements about the origin. They are not statements about users.** Tonight I treated them as the latter twice.

## 6. Immediate, for the PO

**Use a fresh incognito window for the two tests.** No service worker, no cache, no ambiguity — **and it sidesteps the whole question rather than fighting it at midnight.**
