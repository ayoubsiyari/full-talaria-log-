# FINDING — Cold census/probe is green while a warm browser can stay on an old shell

**2026-07-28 ~23:17Z. Manager B. Surfaces: tip + live `http://31.97.192.82:3000`.**

**Trigger:** PO browser read `20260726b75` while the host served `20260728b82`. Tonight's stamp-census and deploy-gate were cold fetches.

---

## Verdict

**`CANARY_DELIVERY_BROKEN` for returning users.** Origin is b82; unaided warm transition to b82 is not implemented. Server-side census cannot repair this.

Probe evidence: `observations/sw-warm-client-delivery-2026-07-28T23-17-37-860Z.json`.

---

## Answers to the three questions

### 1. Is `chart/modules/talaria-version-reload.js` loaded on shells users actually get?

**No.**

| Shell | Loads `talaria-version-reload.js`? | Loads `pwa-install.js` (registers SW)? |
|---|---|---|
| Live `/chart/dist-v9/index.html` | **No** | Yes → `register("/chart/sw.js", { scope: "/chart/" })` |
| Live `/chart/multichart-prod/chart-embed.html` | **No** | **No** |
| Tip tree copies of both | **No** | dist-v9 yes / embed no |

The module exists on disk and is only injected by the multichart harness (`scenarios.mjs` + opt-in flag). It is not a product script tag.

### 2. Does it act on the worker, or only reload?

**Even if loaded and enabled: detection does not touch the worker. Only the Reload button does.**

From `talaria-version-reload.js`:

- **`check()`** compares `window.__TALARIA_CHART_BUILD_ID` to a fresh `/chart/sw.js` fetch and, on mismatch, **`showToast` only**.
- **`hardReload()`** (unregister all SW registrations + delete all caches, then navigate) runs **only on Reload click**.
- Comment in-file already states a plain `location.reload()` cannot escape a controlling SW — that is why hardReload exists — but nothing calls it without the user.

Additionally the module is **retired default OFF**:

```js
// Default OFF — product no longer shows "A new version is available".
return root.__TALARIA_MC_ENABLE_VERSION_RELOAD_PROMPT !== true;
```

Harness must set `__TALARIA_MC_ENABLE_VERSION_RELOAD_PROMPT = true` or `start()` never runs.

### 3. Does a warm browser holding an old build transition to the new one unaided?

**No.**

Mechanism that pins a returning user:

1. `pwa-install.js` registers `/chart/sw.js` at scope `/chart/` on dist-v9 (host chart).
2. Tip `sw.js` is passthrough (`respondWith(fetch(event.request))`) with `skipWaiting` + `clients.claim` + cache wipe on activate — **once a new document loads and a new SW activates**.
3. Shells are served with **`Cache-Control: max-age=3600, public, must-revalidate`**. A warm HTTP cache (and any older SW that still controls from a prior caching strategy) can keep serving `20260726b75` HTML.
4. While that old HTML stays in the tab / bfcache / HTTP cache, the page may never re-execute `register()`, so the browser may never fetch the new `sw.js` byte stream that would activate b82.
5. With version-reload absent and default-off, **nothing prompts and nothing tears down the worker**.

So: cold `curl`/probe sees b82; PO's warm session can keep b75. That matches the report.

---

## What this means for tonight's gates

| Gate | What it measured | What the PO received |
|---|---|---|
| stamp-census | Origin, no cookies, no SW | Possibly cached shell |
| deploy-gate `--deploy-gate` | Origin module bytes | Possibly stale controller |
| `journalVouchedFor` PRESENT | Origin `order-manager.js` | Unknown on warm client |

**DEPLOY-01 / canary delivery needs a warm-client clause:** prove a controlled client that held build N moves to N+1 without DevTools "empty cache and hard reload", or document that canary requires users to unregister `/chart/` SW + hard reload (unacceptable as the only path).

---

## Not claimed

- Did not reproduce the PO's exact browser profile (no remote CDP into their machine).
- Did not change product code in this finding.
- Tip SW passthrough is an improvement over CacheFirst, but it does not by itself wake a tab that never reloads.
