# ACK — CLOSURE-PANEL-SHELL-HEALTHY residual (embed fallback at b81)

**Director:** `CLOSURE-PANEL-SHELL-HEALTHY-20260728-2205.md` §3  
**Tool:** `live-surface-probe/embed-fallback-bump-check.mjs`  
**Evidence:** `observations/embed-fallback-bump-check-2026-07-28T21-04-26-389Z.json`  
**Verdict:** **PASS** — residual closed on the tip.

---

## 1. Line 9 fallback rewritten in both trees

| Tree | `p.get('v') \|\| '…'` |
|---|---|
| `chart v 1.4/chart/multichart-prod/chart-embed.html` | **`20260728b81`** |
| `homepage/public/chart/multichart-prod/chart-embed.html` | **`20260728b81`** |

Not stuck on `20260727b80`. Tip ship stamp owns the literal.

## 2. Bump reaches this literal

`bump-dist-v9-cache.mjs` → `bumpChartEmbedHtml(distBuildId)`:

- Rewrites `window.__TALARIA_CHART_BUILD_ID = p.get('v') || '…'` in **both** paths above
- Called from the main bump path with `distBuildId`
- Also bumps embed font/vendor `?v=`

So each ship bump moves the no-`?v=` fallback; panels cannot freeze one build behind via this line alone.

## 3. `--deploy-gate` covers this shell + engine↔shell

`live-surface-probe.mjs`:

- `DEFAULT_SHELLS` includes **`/chart/multichart-prod/chart-embed.html`**
- Declared-id regex is `(?:p\.get\('v'\)\s*\|\|\s*)?'([^']+)'` — extracts the fallback literal
- Under `--deploy-gate`, `engineBuildCheck` defaults **on**: `CHART_ENGINE_BUILD` must equal the coherent shell id (embed participates)

Runbook §2b already lists `--shell=/chart/multichart-prod/chart-embed.html`.

## 4. Field note

Test host still serves older embed stamps until this tip is pushed — that is train-behind, not a bump miss. Post-push: `--deploy-gate` fails exit 2 if embed fallback ≠ engine.

Panels are **verified healthy** on the tip for this residual.
