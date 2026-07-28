# Defect one test — cold vs warm panel engine version

**Finding:** `FINDING-MULTICHART-HOST-SHELL-STALE-20260728-2110.md`  
**Tool:** `live-surface-probe/panel-engine-cold-warm.mjs`  
**Host:** `http://31.97.192.82:3000`  
**Evidence:** `live-surface-probe/observations/panel-engine-cold-warm-2026-07-28T20-11-01-768Z.json`

---

## Result — LIVE

| Profile | `CHART_ENGINE_BUILD` |
|---|---|
| Cold Edge (origin panel URL) | **`20260726b75`** |
| Warm Edge (same unstamped `/chart/chart.js` URL after stale seed) | **`20260524a10-SEED`** |

**`diverge: true`.** Defect one is live: because `chart-host.html` loads `../chart.js` with **no `?v=`**, a warm browser can keep a different engine than a cold one under the same panel URL.

Structural corroboration on origin:

- Engine tag in live host HTML: `../chart.js` (no query)
- `/chart/chart.js` cache: `max-age=3600, public, must-revalidate`
- Origin cold fetch build: `20260726b75`
- Also confirmed on the same HTML: **no** `indicator-performance.js`, **no** `module-presence-runtime.js`, bridges pinned `?v=20260524a10`

## Method (short)

1. Cold profile: headless Edge → `http://31.97.192.82:3000/chart/multichart/chart-host.html` → read `CHART_ENGINE_BUILD`.
2. Warm profile: one-shot proxy serves a deliberately stale `chart.js` body on the **first** `/chart/chart.js` hit (same unstamped URL the panel requests), then reload the panel; disk cache retains the seed.

This is the measurement-instability candidate the Director named — different panel engines for different browser cache states.

## Route policy

**Never block `/chart/multichart/`.** Hold already on tip (`B-0140`). Fix is A's shell repair.
