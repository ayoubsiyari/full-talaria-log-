# Stamp ownership meet-point — Manager B × Manager C

**Author:** Manager B  
**Date:** 2026-07-28  
**C tip cited:** `manager-c/verification-infra` @ `903be02e90f1944b09a7ce369871292eedf81ddc`  
**Writable set:** this file only (no product / C scripts / homepage edits).

---

## Ownership split (binding)

| Concern | Owner | Artifact |
|---|---|---|
| **Enforcement** of `CACHE-STAMP-COHERENCE-V1` (build-time / tree gate) | **C** | `scripts/lib/cache-stamp-coherence.mjs`, `scripts/cache-stamp-coherence-gate.mjs`, `scripts/cache-stamp-module-baseline.json`; reserved `TALARIA_CACHE_STAMP_COHERENCE_V1` in `docs/plan3/GATE-NAME-RESERVATIONS.md` |
| **Mechanical stamp movement** (bump every shell that loads `chart.js` / `replay-system.js`) | **B** | `chart v 1.4/talaria-design/scripts/bump-dist-v9-cache.mjs` (+ checkpoint `bump-chart-engine-build.mjs` when `CHECKPOINT_BUILD=1`) |
| **Post-push served-surface verification** | **B** | `live-surface-probe.mjs --deploy-gate` |
| **Tree layout / uniqueness proof** (shell lists, stub id, mirrors under checkpoint) | **B** | `scripts/lib/checkpoint-provenance.mjs` → `verifyTreeLayout` |

**B will NOT fork a second coherence gate.** After train merge brings C's gate onto the release branch, B continues to own bump + deploy-gate only. Meet-point is merge + sequencing, not a parallel implementation.

---

## What C's LIVE gate asserts

Cited from `git show manager-c/verification-infra:scripts/lib/cache-stamp-coherence.mjs`:

1. **Cross-shell `?v=` coherence** — cell `CROSS-SHELL-MODULE-STAMP-COHERENCE`. Shells in `CACHE_STAMP_SHELLS` that share `/chart/modules/*` URLs must agree on each module's stamped `?v=` (e.g. dist `b83` vs legacy/embed `b80` is RED).
2. **Content-hash vs sealed stamp baseline** — cell `MODULE-CONTENT-STAMP-BASELINE`. If a served module's bytes change while its stamped `?v=` stays the same as the sealed baseline, the build is RED. Negative control `NC-STALE-STAMP-CONTENT-DRIFT` aims at `modules/order-manager.js` (the order-manager stamp-unmoved incident class).
3. **Shell build-id uniformity** — cell `SHELL-BUILD-ID-UNIFORM`. All readable shells must extract exactly one shared build id via `BUILD_ID_RES` + all `[?&]v=` matches.

`CACHE_STAMP_SHELLS` (same file):

| id | relativePath |
|---|---|
| `dist-v9-canonical` | `chart v 1.4/chart/dist-v9/index.html` |
| `dist-v9-homepage` | `homepage/public/chart/dist-v9/index.html` |
| `live-source` | `chart v 1.4/talaria-design/live/index.html` |
| `legacy-canonical` | `chart v 1.4/chart/legacy-index.html` |
| `embed-canonical` | `chart v 1.4/chart/multichart-prod/chart-embed.html` |
| `embed-homepage` | `homepage/public/chart/multichart-prod/chart-embed.html` |

CLI: `scripts/cache-stamp-coherence-gate.mjs` (`--write-baseline` reseals). Reservation row: LIVE (W55), signature `TALARIA_CACHE_STAMP_COHERENCE_V1`.

Baseline (`scripts/cache-stamp-module-baseline.json`) **includes** `modules/replay-system.js` (stamp + sha256). It does **not** list `chart.js`.

---

## What B owns (mechanical + runtime)

### Bump (`bump-dist-v9-cache.mjs`)

Rewrites, in the same build that changes module / engine bytes:

- V9 / live / homepage dist: every `/chart/…` script|link `?v=` + `window.__TALARIA_CHART_BUILD_ID`
- Legacy (canonical + homepage): relative `modules/…`, `chart.js`, absolute `/chart/…`
- Embed defaults: `p.get('v') || '<id>'` + vendor/font `?v=`
- Multichart inline `var V = '…'` in live HTML
- Harness `serve.mjs` `const buildId`
- `/chart/index.html` stub build id (fallback when dist-v9 absent)
- `SW_VERSION = "talaria-chart-<id>"` on chart / homepage / dist / live public SW paths

Checkpoint path additionally runs `bump-chart-engine-build.mjs` (`CHART_ENGINE_BUILD` inside `chart.js`) when `CHECKPOINT_BUILD=1` + explicit `CHART_BUILD_ID`.

### Deploy-gate (`live-surface-probe --deploy-gate`)

Post-push only. Asserts marker PRESENT on served module bytes, 200-shell stamp coherence, and **fails on inert `?v=`** (byte-identical bodies across dual query variants) unless explicitly waived. Exit 2 = deploy hazard.

### Provenance

`verifyTreeLayout` fails mixed cache ids / stub mismatch under checkpoint layout proof.

---

## Meet point (release train)

```
A edits product bytes
        ↓
same image/build: bump (+ checkpoint engine bump) moves every shell stamp
        ↓
train merge: C's CACHE-STAMP-COHERENCE-V1 is on the release branch → RED if
  (a) shells disagree on module ?v=, or
  (b) module bytes drifted under an unmoved sealed stamp, or
  (c) shell build ids are non-uniform
        ↓
push / deploy
        ↓
B: live-surface-probe --deploy-gate --base-url=<host>
```

**Hard sequencing rule:** bump must run in the **same build** that changes module bytes. Editing `replay-system.js` / `chart.js` without the bump path is exactly the class C's baseline cell turns RED after reseal — and the class that previously shipped "correct repo, stale cache key."

Ordinary builds without `CHECKPOINT_BUILD=1` can still auto-increment from a committed stamp **behind** live (e.g. `b61→b62` while field is on `b75`). Release ships must use an explicit ahead-of-live `CHART_BUILD_ID` under `CHECKPOINT_BUILD=1` (Dockerfile rejects `CHART_BUILD_ID` without that flag).

---

## A's changing files — how C's gate covers each mechanism

| A file | Stamp mechanism | Covered by C? |
|---|---|---|
| `chart v 1.4/chart/modules/replay-system.js` | Shell tags `modules/replay-system.js?v=…` (absolute or relative) | **Yes — both cells.** Cross-shell coherence on the module path; content-hash vs sealed baseline (**baseline already includes** `modules/replay-system.js`). |
| `chart v 1.4/chart/chart.js` | `CHART_ENGINE_BUILD` inside the engine file + shell refs (`chart.js?v=…`, `__TALARIA_CHART_BUILD_ID`, embed default) | **Stamp/id path: yes. Content-hash path: no.** `BUILD_ID_RES` includes `/const CHART_ENGINE_BUILD = '([^']+)'/`, `__TALARIA_CHART_BUILD_ID`, and all `[?&]v=` — these feed `SHELL-BUILD-ID-UNIFORM` from **shell HTML** (and any shell that inlines the constant). The **module baseline map does not include `chart.js`**; engine drift is therefore covered by build-id / shell-stamp uniformity, **not** by `MODULE-CONTENT-STAMP-BASELINE`. Checkpoint bump must still rewrite `CHART_ENGINE_BUILD` in the same build so shell ids and engine constant stay aligned. |

---

## Explicit non-claims

- B does not reseal `cache-stamp-module-baseline.json` — that is C's `--write-baseline` after a legitimate stamp advance.
- B's deploy-gate does not replace C's tree gate; it catches what only the edge can show (inert `?v=`, wrong served shell, marker ABSENT).
- Homepage `public/chart/talaria-design/live/` is **outside** C's `CACHE_STAMP_SHELLS` today. B closed the Docker gap (chart_assets → `public/chart/talaria-design/live`) and bump stamps the homepage twin when present. Optional C follow-on: add that twin to `CACHE_STAMP_SHELLS` — see `FIX-ABSENT-FROM-PO-PATHS.md` path 12.
