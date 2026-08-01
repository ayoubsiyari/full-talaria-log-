# FIX 2 — Per-tick allocation reuse (replay path) delivery path (Manager B → Manager A)

**Role:** Manager B pre-clear (read-only investigation; this file is the only write for this item).  
**Worktree:** `c:\Users\user\Desktop\talaria1\manager-b-plan3`  
**Observed:** 2026-07-28 (local tree only).  
**TREE-02:** citations below are what was Glob’d/grepped/opened; no guessed paths.  
**Status:** **FIX NOT BUILT YET** — reserved kill-switch `__TALARIA_DISABLE_MC_TICK_ALLOC_REUSE_V1` is **ABSENT** from product trees (and from docs/release inventory as a train switch). This document pre-clears candidate edit surfaces, shells, stamps, and homepage-twin discard. Implementation choice among candidates remains A’s at build time.

---

## Verdict for A (one screen)

| Question | Answer |
|---|---|
| Canonical product bytes (primary candidate) | `chart v 1.4/chart/modules/replay-system.js` — tick path / tickPathCache / per-tick arrays live here |
| Co-candidates (Director; confirm at impl) | `chart v 1.4/chart/modules/chart-data-pipeline.js` and/or `chart v 1.4/chart/chart.js` tick / replay update path |
| Committed homepage twins | `homepage/public/chart/modules/replay-system.js`, `…/chart-data-pipeline.js`, `homepage/public/chart/chart.js` — **discarded at image build** |
| What A must edit for the fix | Canonical chart tree only (whichever candidate(s) impl chooses); never homepage twins as SoT |
| Reserved kill-switch | `window.__TALARIA_DISABLE_MC_TICK_ALLOC_REUSE_V1` — **not present in product yet**; A must add with the fix |
| What stamps move | Blanket shell `?v=` / `__TALARIA_CHART_BUILD_ID` / embed default / SW — **not** per-module content-addressed stamps |
| Who stamps | `npm run build:live:chart` → `bump-dist-v9-cache.mjs` (Docker `v9_react` / `chart_assets`); checkpoint may also bump `CHART_ENGINE_BUILD` in `chart.js` |
| Checkpoint / contract preflight | `scripts/lib/checkpoint-provenance.mjs` (shells + I8 `modules/` + `chart.js` mirrors); `scripts/module-contract-preflight.mjs` exists but **does not** contract these three files’ FIX 2 content |

---

## 1. On-disk inventory (TREE-02 — only paths actually found)

### A. `replay-system.js` (2 hits) — primary tick-path candidate

| Path | Role | SHA-256 (this worktree) | Loaded by which shell | Stamp that must move |
|---|---|---|---|---|
| `chart v 1.4/chart/modules/replay-system.js` | **Source of truth** for replay/tick runtime. Docker modules COPY from `v9_react` / `chart_assets`. | `2b77f3c3b7e3d75102959a95f70941b803655779fd837430d09c541120e15a18` | See shell table | Shell `?v=` / embed `V` / SW |
| `homepage/public/chart/modules/replay-system.js` | **Committed mirror** — byte-identical (`2b77f3c3…`). Sync via `sync-v9-to-homepage.mjs` modules `fs.cpSync` / `syncHomepageModules`. **Discarded in image:** `homepage/Dockerfile` L80 modules overwrite. | same | Same URL if serving committed `public/` without overwrite | Same |

Existing tick-adjacent surface (not FIX 2): `tickPathCache`, per-tick `new Array(n)` path builders, M20-Q9 prefix reuse comments — pre-existing allocation work; **kill-switch name for FIX 2 is absent**.

### B. `chart-data-pipeline.js` (2 hits) — co-candidate

| Path | Role | SHA-256 (this worktree) | Loaded by which shell | Stamp that must move |
|---|---|---|---|---|
| `chart v 1.4/chart/modules/chart-data-pipeline.js` | Display / resample pipeline (before `chart.js` in V9 shells). | `51b117bf9050d725ce0df1c240f43d3610a3fe97b8a4329628ec3652fd8f0161` | dist-v9 / live / embed — **not** in `legacy-index.html` (grep: no match) | Shell `?v=` / embed `V` / SW |
| `homepage/public/chart/modules/chart-data-pipeline.js` | Committed mirror — byte-identical (`51b117bf…`). Discarded at image build (L80). | same | Same URL if serving committed `public/` | Same |

**Not** in `build-chart-client-bundle.mjs` `CHART_CLIENT_PART1` list (unlike `chart.js` / `replay-system.js`).

### C. `chart.js` (2 hits) — co-candidate tick / replay update path

| Path | Role | SHA-256 (this worktree) | Loaded by which shell | Stamp that must move |
|---|---|---|---|---|
| `chart v 1.4/chart/chart.js` | Engine; `_mcDiagWrapReplaySystem` / `scheduleRender` / replay tick counters. | `9422392ec420e8da5f7fbaa1942cb9548c37fb41200d033f97d6205ff342b08b` | All primary shells | Shell stamps + optional checkpoint `CHART_ENGINE_BUILD` rewrite |
| `homepage/public/chart/chart.js` | Committed mirror — byte-identical. Discarded at image build (L81). | same | Same URL if serving committed `public/` | Same |

### Kill-switch product search

Grep worktree for `__TALARIA_DISABLE_MC_TICK_ALLOC_REUSE_V1` / `TICK_ALLOC_REUSE` / `MC_TICK_ALLOC` → **0 hits**. Feature is pre-clear only.

### Related non-file carriers (references only)

| Location | What was seen |
|---|---|
| `chart v 1.4/chart/scripts/build-chart-client-bundle.mjs` L62–63 | `'chart.js'`, `'modules/replay-system.js'` in legacy bundle list — only if `BUILD_LEGACY_BUNDLE=1`. **No** `chart-data-pipeline.js` entry. |
| `chart v 1.4/chart/api_server.py` | `@app.get("/replay-system.js")` → modules file (FIX3 cite class); static allowlist includes `"chart.js"`. |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs` L601–605 | Allowlist includes `chart-data-pipeline.js`, `chart.js`, `replay-system.js`. |
| Dual-tree tests (`m20-q9-prefix-slice.test.mjs`, `m20-q6-replay-lifecycle-binding.test.mjs`, etc.) | Assert identity / lifecycle; not runtime shells. |

---

## 2. Shells that load them — exact `src` / stamp pattern

| Shell (canonical path) | `replay-system.js` | `chart-data-pipeline.js` | `chart.js` | Homepage twin notes |
|---|---|---|---|---|
| `chart v 1.4/talaria-design/live/index.html` | L1620 `…/replay-system.js?v=20260728b81` | L1605 `…/chart-data-pipeline.js?v=20260728b81` | L1615 `…/chart.js?v=20260728b81` | No committed `homepage/public/chart/talaria-design/live/` in this worktree; Docker L88–90 overwrites from `chart_assets` at image build |
| `chart v 1.4/chart/dist-v9/index.html` | L1620 same | L1605 same | L1615 same | `homepage/public/chart/dist-v9/index.html` L1618 / L1603 / L1613 — same `b81` |
| `chart v 1.4/chart/legacy-index.html` | L44070 relative `modules/replay-system.js?v=20260728b81` | **Not loaded** (no match) | L44067 relative `chart.js?v=20260728b81` | No committed homepage `legacy-index.html` in this worktree |
| `chart v 1.4/chart/multichart-prod/chart-embed.html` | path inject `'/chart/modules/replay-system.js'` (FIX3 L349 class; this tree build id default `'20260728b81'`) | L347 `'/chart/modules/chart-data-pipeline.js'` | L350 `'/chart/chart.js'` | Homepage twin `…/chart-embed.html` L345 / L348; default id L9 `'20260728b81'` |

**Stamp machinery:** same as FIX 1 / FIX 3 — `bump-dist-v9-cache.mjs` rewrites shell `?v=`, `__TALARIA_CHART_BUILD_ID`, embed fallback, SW; checkpoint may rewrite `CHART_ENGINE_BUILD` inside `chart.js`. No per-file content stamp inside `replay-system.js` or `chart-data-pipeline.js`.

---

## 3. Source vs build-output vs discarded mirror (Dockerfile evidence)

### Director ruling — verified against current Dockerfiles

Homepage `public/chart` mirror discarded at image build. **Confirmed:**

**`homepage/Dockerfile`**

- L4–5: chart static built in `chart_assets`.
- L29: `COPY ["chart v 1.4/chart", "./chart/"]`.
- L47: `npm run build:live:chart`.
- L73: `COPY homepage/ ./`.
- L78–81: overwrite `dist-v9`, **`modules`**, **`chart.js`**, then multichart-prod / workers / vendor / fonts / sw; L88–90 also overwrite `talaria-design/live`.

**`chart v 1.4/chart/Dockerfile.local`**

- L32 / L50: chart COPY + `build:live:chart` in `v9_react`.
- L91: final chart COPY.
- L100–110: overwrite `./modules`, `./chart.js`, `./dist-v9`, `./multichart-prod`, … from `v9_react` build outputs.

### Role summary

| Artifact | Role at ship time |
|---|---|
| `chart v 1.4/chart/modules/replay-system.js` | Source → image `modules/` |
| `chart v 1.4/chart/modules/chart-data-pipeline.js` | Source → image `modules/` |
| `chart v 1.4/chart/chart.js` | Source → image `chart.js` |
| Matching `homepage/public/chart/…` paths | Committed / local mirrors; **discarded** on homepage image rebuild |
| Stamped shells / SW | Build outputs of `build:live:chart` + bump |

### nginx

`homepage/nginx.local.conf` L145–150: `location ^~ /chart/` → `try_files` then `@chart_upstream`; `expires 1h`. Baked `out/chart/modules/…` and `out/chart/chart.js` preferred.

---

## 4. Rebuild steps → which copies regenerate

| Step | Regenerates |
|---|---|
| Edit product | Only canonical bytes until sync/build |
| `npm run build:live:chart` (from `talaria-design`) | Stamps shells; `sync-v9-to-homepage.mjs` replaces homepage `modules/` (incl. replay + pipeline) and `chart.js` |
| Docker homepage / trading-chart | Same build inside `chart_assets` / `v9_react`; image modules + chart.js from build stage, not committed homepage twin |
| `CHECKPOINT_BUILD=1` + `CHART_BUILD_ID=…` | `bump-chart-engine-build.mjs` + layout assert (I8 modules + chart.js) |
| `BUILD_LEGACY_BUNDLE=1` | Concat minify includes `chart.js` + `replay-system.js` only — **not** default; **not** `chart-data-pipeline.js` |

---

## 5. Stamps / provenance / “module-contract”

### Checkpoint

`checkpoint-provenance.mjs` I8 mirrors include **`modules`** and **`chart.js`**. Layout assert after sync/Docker stage expects homepage-chart-root hashes to match canonical for those trees. Shell `matchAllCacheIds` uniqueness applies.

### Module-contract preflight

`scripts/module-contract-preflight.mjs` + `scripts/module-contracts.json` exist — cover ModulePresenceRuntime / IndicatorPerf only. **No** FIX 2 / tick-alloc contract entry. A should not expect that preflight to fail solely because tick-reuse bytes changed.

### What must bump when FIX 2 content changes

1. `CHART_BUILD_ID` / shell `?v=` on dist-v9, live, legacy (covers `replay-system.js?v=` and `chart-data-pipeline.js?v=` and `chart.js?v=` on shells that load them).
2. Embed `__TALARIA_CHART_BUILD_ID` default (covers inject `q`).
3. `SW_VERSION`.
4. If `chart.js` changes under checkpoint: `CHART_ENGINE_BUILD` same id.

**Pitfall:** auto-increment behind live — use explicit ahead-of-live `CHART_BUILD_ID` for checkpoint ships.

**Legacy gap:** if FIX 2 lands **only** in `chart-data-pipeline.js`, legacy-index does **not** load that file — V9 / embed / live are the proof surfaces.

---

## 6. Live observation

Not re-probed for this pre-clear (feature absent). Prior B-M4 class still applies:

- Test host `?v=` may be **inert** for `/chart/modules/…` and `/chart/chart.js` (identical body sha across query variants).
- Post-push proof = **byte-identity** of each changed canonical file vs served URL, not stamp text alone.

---

## What A must touch vs what the build stamps for free

### A must touch (when building FIX 2)

1. Implement per-tick allocation reuse on the replay path in the chosen canonical file(s):
   - **Primary candidate:** `chart v 1.4/chart/modules/replay-system.js`
   - **Co-candidates:** `chart v 1.4/chart/modules/chart-data-pipeline.js` and/or `chart v 1.4/chart/chart.js`
2. Wire reserved kill-switch `__TALARIA_DISABLE_MC_TICK_ALLOC_REUSE_V1` (unset → fix ON; `=== true` style consistent with A’s other MC switches).
3. Ship via image rebuild of **homepage + trading-chart**.
4. Sync / dual-tree: `build:live:chart` — do not treat homepage twins as SoT.
5. Checkpoint: `CHART_BUILD_ID` ahead of live.

### Build stamps for free

- Shell / embed / SW via `bump-dist-v9-cache.mjs`.
- Homepage modules + chart.js via `sync-v9-to-homepage.mjs`.
- Docker stages running `build:live:chart`.

### A should not rely on

- Editing only homepage twins (discarded at image build).
- Hand-bumping one module’s `?v=` without the bump script.
- Proving deploy via stamp text alone on an inert-`?v=` host.
- Assuming legacy-index exercises `chart-data-pipeline.js` (it does not load it today).

---

## Residual risks

1. **FIX absent** — switch and feature not in product; this is pre-clear only.
2. **Multi-file ambiguity** — Director allows replay-system and/or pipeline and/or chart.js; wrong-file edit = PO still sees old alloc path.
3. **Inert `?v=`** — prove with sha256 of body for each changed URL.
4. **Legacy surface gap** for pipeline-only changes.
5. **Nginx 1h TTL** / warm cache on old stamp URLs.
6. **Auto-increment behind live** without explicit `CHART_BUILD_ID`.

---

## One-command verification (A after change + deploy)

PowerShell from repo root after FIX 2 is live. Adjust `$files` to the canonical paths A actually changed:

```powershell
$base="http://31.97.192.82:3000"; $files=@(
  @{ local="chart v 1.4/chart/modules/replay-system.js"; url="/chart/modules/replay-system.js" },
  @{ local="chart v 1.4/chart/modules/chart-data-pipeline.js"; url="/chart/modules/chart-data-pipeline.js" },
  @{ local="chart v 1.4/chart/chart.js"; url="/chart/chart.js" }
); foreach($f in $files){ $tmp=Join-Path $env:TEMP ([IO.Path]::GetFileName($f.local)+".live"); Invoke-WebRequest ($base+$f.url) -OutFile $tmp -UseBasicParsing; $L=(Get-FileHash $f.local -Algorithm SHA256).Hash.ToLower(); $R=(Get-FileHash $tmp -Algorithm SHA256).Hash.ToLower(); "$($f.url) local=$L live=$R bytes_match=$($L -eq $R) kill=$(((Get-Content $tmp -Raw) -match '__TALARIA_DISABLE_MC_TICK_ALLOC_REUSE_V1'))" }; foreach($s in @('/chart/dist-v9/index.html','/chart/legacy-index.html','/chart/multichart-prod/chart-embed.html')){ $c=(Invoke-WebRequest ($base+$s) -UseBasicParsing).Content; foreach($pat in @('replay-system\.js[^"''\s]*','chart-data-pipeline\.js[^"''\s]*','chart\.js[^"''\s]*')){ $m=[regex]::Match($c,$pat); if($m.Success){ "$s -> $($m.Value)" } } }
```

**Pass criteria for A:** for every file A changed, `bytes_match=True`; at least one served body contains `__TALARIA_DISABLE_MC_TICK_ALLOC_REUSE_V1`; primary shells advertise the new `CHART_BUILD_ID`. Optionally dual-fetch `?v=` variants to record inert/non-inert.

---

## Cite index (opened / grepped)

- Enumerate: `replay-system.js` → 2; `chart-data-pipeline.js` → 2; `chart.js` → 2.
- Grep: `__TALARIA_DISABLE_MC_TICK_ALLOC_REUSE_V1` / `TICK_ALLOC_REUSE` / `MC_TICK_ALLOC` → **0**.
- `homepage/Dockerfile` L4–5, L29, L47, L73, L78–90.
- `chart v 1.4/chart/Dockerfile.local` L32, L50, L91, L100–120.
- `chart v 1.4/talaria-design/scripts/sync-v9-to-homepage.mjs` (chart.js + modules sync).
- `chart v 1.4/chart/scripts/build-chart-client-bundle.mjs` L62–63 (no pipeline entry).
- `scripts/lib/checkpoint-provenance.mjs` mirrors; `scripts/module-contracts.json` (no FIX 2 entry).
- `homepage/nginx.local.conf` L145–150.
- Shell lines §2; prior inert-`?v=` class: `CENSUS-20260728-1626Z` / `FIX3-REPLAY-SYSTEM-DELIVERY-PATH.md`.
- Model structure: `FIX3-REPLAY-SYSTEM-DELIVERY-PATH.md`.
