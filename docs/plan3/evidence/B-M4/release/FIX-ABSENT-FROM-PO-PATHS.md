# Fix correct in repo, absent from what the PO opens

**Author:** Manager B  
**Date:** 2026-07-28  
**Charter follow-on:** name every delivery path where a fix can be right on disk and still invisible to the PO surface; state the close for each.  
**Evidence base:** B-M4 Docker/nginx/bump/probe work (`FIX3-REPLAY-SYSTEM-DELIVERY-PATH.md`, `INDEX-HTML-BUILD-ID.md`, `CENSUS-20260728-1626Z.md`, `live-surface-probe/README.md`, `homepage/Dockerfile`, `api_server.py` `/chart/index.html` preference order).  
**Writable set:** this file only.

Status key: **CLOSED** | **PARTIAL** | **OPEN**.

---

## Summary counts

| Status | Count |
|---|---|
| CLOSED | 7 |
| PARTIAL | 5 |
| OPEN | 2 |

**OPEN residual paths (2):** Cloudflare / `max-age=3600` warm cache; client browser holding a prior stamp URL / old SW after SW bump.

---

## Path catalog

### 1. Never built into the image (ordinary build / bump skipped)

| | |
|---|---|
| **Mechanism** | Fix lands in `chart v 1.4/chart/modules/…` (or `chart.js`) but the image is built without `npm run build:live:chart`, without `CHECKPOINT_BUILD=1`, or with bump skipped. Dockerfile rejects bare `CHART_BUILD_ID` unless `CHECKPOINT_BUILD=1` (`homepage/Dockerfile` L35–36); ordinary path can still ship auto-incremented stamps from committed ids. |
| **Detect** | Image modules sha256 ≠ canonical post-fix; checkpoint provenance / C coherence fail when train includes them; deploy-gate marker ABSENT. |
| **Close owner** | **B** (bump + checkpoint params) + release discipline (`BUILD-PARAMS.json` pins). After merge: **C** tree gate fails content/stamp drift on listed modules. |
| **Status** | **PARTIAL** — checkpoint path closes the intended ship; ordinary/local builds remain a footgun (see also path 12). |

### 2. Homepage committed mirror served instead of rebuilt bytes

| | |
|---|---|
| **Mechanism** | `homepage/public/chart/**` is a committed twin. Docker: `COPY homepage/` then overwrite modules/dist-v9/chart.js/… from `chart_assets` (`homepage/Dockerfile` L72, L77–86). Director ruling: **mirror discarded at image build**. Local / non-Docker / stale Next `out/` can still `try_files` committed or previously exported `public/chart` (`nginx.local.conf` `location ^~ /chart/` → try_files then `@chart_upstream`). |
| **Detect** | Compare served `/chart/modules/<file>` sha256 to canonical `chart v 1.4/chart/modules/<file>`; Docker build logs show overwrite COPY. |
| **Close owner** | **B** documents; image build owns overwrite. Local serve: operator must run `build:live:chart` / sync, not hand-edit homepage twin. |
| **Status** | **CLOSED** for Docker production images. **PARTIAL** residual: local/non-Docker still serves committed `public/` until sync/rebuild. |

### 3. Content changed, `?v=` stamp unmoved (order-manager incident class)

| | |
|---|---|
| **Mechanism** | Module bytes change; shell still advertises the prior `?v=`. CDN/browser keep serving the old body under the unchanged cache key. |
| **Detect** | **C** `MODULE-CONTENT-STAMP-BASELINE` + `NC-STALE-STAMP-CONTENT-DRIFT` (aims `modules/order-manager.js`) at build time. **B** `--deploy-gate` catches inert `?v=` at runtime (stamp moves but does not select bytes). |
| **Close owner** | **C** build-time; **B** post-push. |
| **Status** | **CLOSED** (dual close: tree gate + deploy-gate). Requires train merge of C's gate for the build half. |

### 4. Cloudflare / `max-age=3600` warm cache serving old bytes despite new stamp

| | |
|---|---|
| **Mechanism** | Edge or origin advertises `Cache-Control: max-age=3600, public, must-revalidate`. Old stamp URLs (or inert-host single URL) remain warm up to one hour after push. Probe may see `cf-cache-status` / `age`. |
| **Detect** | Probe headers; byte-identity vs expected sha256; age > 0 on HIT. |
| **Close owner** | Ops / release purge + **B** probe observation. No automated purge in B's probe. |
| **Status** | **OPEN** — observed and reported; not mechanically closed by bump or C's tree gate. |

### 5. Wrong shell (design live at b12 vs dist-v9 at b75; legacy de-route)

| | |
|---|---|
| **Mechanism** | PO opens `/chart/talaria-design/live/` (advertises old build id) while canonical V9 is `/chart/dist-v9/` or authenticated `/chart/index.html` → dist-v9. Census: design shell `b12`/`b50` vs engine `b75`. Legacy may 404 or be de-routed; ignored for coherence when non-200. Homepage twin `homepage/public/chart/talaria-design/live/` is **not** in Docker chart_assets overwrite and **not** in C's `CACHE_STAMP_SHELLS`. |
| **Detect** | Probe default shells include `talaria-design/live`; `--deploy-gate` fails if 200 shells disagree. C cross-shell cell covers canonical live + dist + legacy + embed, not the homepage design twin. |
| **Close owner** | **B** bump stamps canonical `talaria-design/live/index.html`; **C** after merge for listed shells; homepage design twin remains a gap. |
| **Status** | **PARTIAL** — primary shells closed; design homepage twin / wrong URL still PO-visible. |

### 6. Auth gate: unauthenticated probe sees login, not the chart

| | |
|---|---|
| **Mechanism** | nginx/api auth redirects unauthenticated `/chart/…` to login (often 307, or HTML login with 200). Grepping login HTML for a fix marker manufactures ABSENT. |
| **Detect** | Probe returns `UNDETERMINED` with auth reason; `redirect: manual` never follows into login. |
| **Close owner** | **B** probe — use `--cookie` / `--token` for attribution. PO sessions must be authenticated. |
| **Status** | **PARTIAL** — closed when cookie supplied; by design unread without auth. |

### 7. `api_server` serves dist-v9 for `/chart/index.html` when present, stub when absent

| | |
|---|---|
| **Mechanism** | `api_server.py` L27039–27048: preference `dist-v9/index.html` → legacy `dist/index.html` → stub `chart/index.html`. Stub had **no** build id; PO on fallback could not name the build. Authenticated stack usually gets stamped dist-v9; stub is fallback/source. |
| **Detect** | Presence of dist-v9 vs stub body; `__TALARIA_CHART_BUILD_ID` in response. |
| **Close owner** | **B** — stub now stamped by `bumpChartIndexStub`; `verifyTreeLayout` fails mismatched stub under checkpoint. Doc: `INDEX-HTML-BUILD-ID.md`. |
| **Status** | **CLOSED**. |

### 8. `?v=` inert on test host (byte identity required)

| | |
|---|---|
| **Mechanism** | Origin returns identical sha256 for `/chart/modules/…` under empty, old, current, and nonsense `?v=` (CENSUS-20260728-1626Z; FIX3 live probe). Stamp is a cache key only; it does not select bytes. |
| **Detect** | Probe dual-fetch → `stampInert: true`. |
| **Close owner** | **B** `--deploy-gate` (exit 2 unless `--waive-stamp-inert`). Post-push proof = byte-identity of body vs expected fix, not “URL says bNN”. |
| **Status** | **CLOSED** for gate detection. Does not by itself purge warm entries (see path 4). |

### 9. Service worker holding old `SW_VERSION`

| | |
|---|---|
| **Mechanism** | PWA SW caches chart assets under `SW_VERSION = "talaria-chart-<id>"`. Bump rewrites SW files; a client that never updates the worker keeps the prior cache. |
| **Detect** | Client Application panel / `navigator.serviceWorker`; compare installed SW string to shell build id. |
| **Close owner** | **B** bump moves `SW_VERSION` on chart + homepage + dist + live public SW paths. Client refresh/unregister is PO/runbook. |
| **Status** | **PARTIAL** — ship side closed; installed-client residual OPEN until refresh. |

### 10. Multichart iframe loading embed with a different default build id

| | |
|---|---|
| **Mechanism** | `chart-embed.html` builds module URLs from `p.get('v') || '<default>'`. Stale default (pre-bump `b61`) requests warm pre-fix URLs by name even when dist-v9 already advanced. Parent may also pass an old `?v=`. |
| **Detect** | Embed default vs dist-v9 `__TALARIA_CHART_BUILD_ID`; C `SHELL-BUILD-ID-UNIFORM` + embed shells in `CACHE_STAMP_SHELLS`; probe embed shell. |
| **Close owner** | **B** `bumpChartEmbedHtml` + harness `buildId`; **C** after merge for tree coherence. |
| **Status** | **CLOSED** for default/harness bump. **PARTIAL** if a parent layout hardcodes an old query (product/config, outside bump). |

### 11. Auto-increment stamp behind live (ordinary bump)

| | |
|---|---|
| **Mechanism** | `bump-dist-v9-cache.mjs` resolves `BUILD_ID` env, else increments the committed stamp. Committed `b61` → `b62` while production already served `b75`/`b80` → new fix ships under a **past** cache key; warm entries for newer keys keep old behaviour. |
| **Detect** | Compare chosen `CHART_BUILD_ID` to live shell / probe; release `BUILD-PARAMS.json` pin. |
| **Close owner** | **B** — `RELEASE-SHIP-REQUIREMENTS.md`: train image **must** use `CHECKPOINT_BUILD=1` + ahead-of-live `CHART_BUILD_ID`. Ordinary local builds remain a footgun and must not be the ship artifact. |
| **Status** | **CLOSED** for the train push path. Ordinary/non-checkpoint builds are out of scope for ship. |

### 12. Homepage design-shell twin not in overwrite / not in C shells

| | |
|---|---|
| **Mechanism** | Was: Docker overwrote modules/dist-v9/… but **not** `homepage/public/chart/talaria-design/live/**`, so `/chart/talaria-design/live/` kept stale `?v=` while V9 advanced. |
| **Detect** | Probe `/chart/talaria-design/live/`; compare to dist-v9 stamps. |
| **Close owner** | **B** — `homepage/Dockerfile` now `COPY --from=chart_assets /build/talaria-design/live → public/chart/talaria-design/live`; bump stamps `homepage/public/chart/talaria-design/live/index.html` when present. **C follow-on (optional):** add homepage design twin to `CACHE_STAMP_SHELLS` so tree gate sees it (canonical live already covered). |
| **Status** | **CLOSED** for Docker image + bump. PARTIAL only until C optionally lists the homepage twin. |

### 13. Browser device cache of a prior stamp URL (recurrence-wobble class)

| | |
|---|---|
| **Mechanism** | Even after origin serves new bytes under a new stamp, a PO browser may still hold the previous stamp URL (bookmark, SW, disk cache). Director pre-write: recurrence-wobble response for device caches / service workers. |
| **Detect** | Hard reload / private window / unregister SW; compare to probe from a clean client. |
| **Close owner** | Runbook / PO hygiene; B probe proves **edge now**, not **this browser**. |
| **Status** | **OPEN** (inherent client residual; not a missing bump). |

### 14. Legacy minify bundle path (`BUILD_LEGACY_BUNDLE=1`) vs default image

| | |
|---|---|
| **Mechanism** | Optional `dist/chart-app-part*.min.js` concatenates modules; off by default in `Dockerfile.local`. A fix in `modules/replay-system.js` is invisible if someone still loads an old minified bundle path. |
| **Detect** | Whether `/chart/index.html` preference hit dist-v9 vs legacy dist; bundle build flag. |
| **Close owner** | Default image path prefers dist-v9 (**B**/api_server preference order). |
| **Status** | **CLOSED** for default Docker/V9 path; PARTIAL only if an operator enables the legacy bundle path deliberately. |

---

## Ownership vs close (quick map)

| Layer | Closes |
|---|---|
| **C** `CACHE-STAMP-COHERENCE-V1` | Build-time: cross-shell module `?v=`, module content-hash vs sealed stamp, shell build-id uniformity (after train merge). |
| **B** bump + checkpoint | Mechanical stamp movement + engine `CHART_ENGINE_BUILD` + stub/embed/SW/harness. |
| **B** `--deploy-gate` | Post-push: marker PRESENT, 200-shell coherence, inert `?v=`. |
| **Neither fully** | CF/TTL warm cache; PO browser/SW residual. |

---

## Meet with `STAMP-OWNERSHIP-MEET-C.md`

C owns enforcement; B owns bump + deploy-gate; neither claims the OPEN residuals above without an explicit follow-on (purge automation, design-shell de-route or overwrite, forbidding ordinary ship builds).
