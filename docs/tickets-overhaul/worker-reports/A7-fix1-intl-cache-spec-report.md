# A7 fix #1 — VWAP Intl formatter cache (implementation spec, HOLD)

## 1. Task + RC

- **Task:** A7 fix #1 — Intl formatter cache for `vwapBarPartsInTimezone` (PREP ONLY, HOLD-FOR-BLESS).
- **Goal:** Spec the freeze-safe top-ranked A7 fix, benchmark per-bar alloc vs cached formatter, and prepare a turnkey hunk for both mirrored trees — **without landing product changes** until Manager releases hold after `20260716b10` bless.
- **RC:** RC-5 perf follow-on (indicator replay/add latency class). Mechanism prep only — no RC discharged.

---

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/chart/modules/vwap-intl-cache.bench.mjs` | **NEW** — standalone micro-benchmark replicating production `Intl.DateTimeFormat` construction args from `vwapBarPartsInTimezone` (2188-2196); compares per-bar alloc vs specced cache; parity spot-check. |
| `docs/tickets-overhaul/worker-reports/A7-fix1-intl-cache-spec-report.md` | This report (spec + diff preview + numbers). |

**NOT touched (per HOLD):**
- `chart-indicators-full.js` (both trees) — diff preview only below
- `react-parity-lib.mjs`, harness, `chart.js`, `replay-system.js`

**I8 on land:** mirror `vwap-intl-cache.bench.mjs` + hunk to `homepage/public/chart/modules/` byte-identical when hold lifts.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Behavior |
|--------|---------|----------|
| `window.__TALARIA_DISABLE_VWAP_INTL_CACHE_V1` | **unset** (fix ON) | Reuse per-timezone `Intl.DateTimeFormat` cache in `vwapBarPartsInTimezone` |
| set `true` | revert | Per-bar `new Intl.DateTimeFormat(...)` (current production) |

**Gating surface (on land):** `chart-indicators-full.js` — function `vwapBarPartsInTimezone` + cache helper/decl only. No other files. Switch OFF must restore per-bar allocation in **both** mirrored copies.

**Ungatable paths:** none — single function entry.

---

## 4. Proof — RED → GREEN

**N/A for product** (HOLD — no hunk applied). Benchmark proof for spec:

**Command:**
```bash
node "chart v 1.4/chart/modules/vwap-intl-cache.bench.mjs"
```

**Environment:** Node v24.15.0, Windows, synthetic 100k 1m bars, `tz=America/New_York`, 5 runs.

| Path | min (ms) | avg (ms) | p95 (ms) | max (ms) |
|------|----------|----------|----------|----------|
| `vwapBarPartsInTimezone` — **per-bar Intl alloc** (production) | 7,033 | **8,869** | 15,206 | 15,206 |
| `vwapBarPartsInTimezone` — **cached formatter** (proposed) | 394 | **592** | 1,207 | 1,207 |
| Session VWAP integrate loop — per-bar alloc | 7,317 | **8,687** | 13,772 | 13,772 |
| Session VWAP integrate loop — cached formatter | 403 | **437** | **532** | 532 |

**Speedup:** ~15× (parts only avg); ~20× (full session anchor+integrate loop avg).

**Parity:** spot-check bars 0, 50k, 99,999 — **PASS** (cached matches per-bar alloc).

**Determinism:** 5/5 runs completed; cached path p95 532 ms (no artificial sleep).

**I15:** Synthetic bars in Node — same `Intl` construction args as production; not browser `addIndicator` actuation. Status after land: **DONE (dev only) — NEEDS-LIVE** for TAL-01632 until PO confirms add on deep history.

**Switch revert (spec-level):** bench can add OFF path by branching to `vwapBarPartsInTimezonePerBarAlloc` when `globalThis.__TALARIA_DISABLE_VWAP_INTL_CACHE_V1 === true`; expect OFF ≈ 8.7 s avg, ON ≈ 0.44 s avg on 100k loop.

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I8 | Spec requires both trees on land; prep bench in canonical tree only |
| I3/I13 | Switch specced; single-function gate |
| I9 | No gate run (HOLD + bless collision) |
| I15 | Bench mirrors production Intl args; live deferred |
| HOLD | No `chart-indicators-full.js` edit, no product commit |

---

## 6. What I did NOT do / limits

- Did **not** apply hunk to `chart-indicators-full.js` (awaiting bless release).
- Did **not** commit (report + bench are local only until Manager directs).
- Did **not** mirror bench to `homepage/public/chart/` yet (on land).
- **Full `calculateVWAPIndicatorData` add** still does triple O(n) passes + seven `data.map` allocs + bands (`2321-2393`) — fix #1 removes the dominant cost but **alone** may not bring full add under 500 ms on 100k bars; fix #2 (anchor precompute) is separate.
- Did **not** edit worker `indicator-worker.js` VWAP (worker path is simplified; main-thread session VWAP is the ticket surface).

---

## 7. Live-verification handoff (after land)

1. Build id: TBD when hold lifts (post-`20260716b10` bless).
2. Load 1m chart with deep history (~50k–100k bars).
3. Add **VWAP** (default session anchor) — UI must not freeze ~1 minute.
4. DevTools: `__TALARIA_DISABLE_VWAP_INTL_CACHE_V1 = true` → re-add VWAP → freeze returns (RED-again).
5. Replay smoke (fix #3 is separate): expect improvement but not full replay budget until incremental pass.

---

## 8. Status

**DIAGNOSTIC-ONLY / SPEC-READY — NOT COMMITTED, AWAITING BLESS RELEASE.**

When Manager says **"release A7 fix #1"**: apply hunk (both trees), run bench ON/OFF, file-scoped commit, NEEDS-LIVE for TAL-01632.

---

## 9. Planned diff preview (NOT APPLIED)

**File:** `chart v 1.4/chart/modules/chart-indicators-full.js` and mirror `homepage/public/chart/modules/chart-indicators-full.js`

**Insert before `function vwapBarPartsInTimezone` (~line 2184):**

```diff
+    /** Per-timezone Intl formatters for VWAP session anchor (fix A7-1). */
+    const _vwapBarPartsFmtCache = Object.create(null);
+    function vwapCachedBarPartsFormatter(tzId) {
+        const key = tzId || 'Etc/UTC';
+        if (!_vwapBarPartsFmtCache[key]) {
+            _vwapBarPartsFmtCache[key] = new Intl.DateTimeFormat('en-GB', {
+                timeZone: key,
+                year: 'numeric',
+                month: 'numeric',
+                day: 'numeric',
+                hour: 'numeric',
+                minute: 'numeric',
+                hour12: false
+            });
+        }
+        return _vwapBarPartsFmtCache[key];
+    }
```

**Replace `vwapBarPartsInTimezone` body (~2184-2216):**

```diff
     function vwapBarPartsInTimezone(bar, tzId) {
         const t = bar && bar.t != null ? Number(bar.t) : NaN;
         if (!Number.isFinite(t)) return null;
         try {
-            const parts = new Intl.DateTimeFormat('en-GB', {
-                timeZone: tzId || 'Etc/UTC',
-                year: 'numeric',
-                month: 'numeric',
-                day: 'numeric',
-                hour: 'numeric',
-                minute: 'numeric',
-                hour12: false
-            }).formatToParts(new Date(t));
+            const useCache = !(typeof window !== 'undefined'
+                && window.__TALARIA_DISABLE_VWAP_INTL_CACHE_V1);
+            const fmt = useCache
+                ? vwapCachedBarPartsFormatter(tzId)
+                : new Intl.DateTimeFormat('en-GB', {
+                    timeZone: tzId || 'Etc/UTC',
+                    year: 'numeric',
+                    month: 'numeric',
+                    day: 'numeric',
+                    hour: 'numeric',
+                    minute: 'numeric',
+                    hour12: false
+                });
+            const parts = fmt.formatToParts(new Date(t));
             const get = function (type) {
                 const p = parts.find(function (x) { return x.type === type; });
                 return p ? parseInt(p.value, 10) : 0;
             };
             return {
                 y: get('year'),
                 mo: get('month') - 1,
                 day: get('day'),
                 dec: get('hour') + get('minute') / 60
             };
         } catch (e) {
             const d = new Date(t);
             return {
                 y: d.getUTCFullYear(),
                 mo: d.getUTCMonth(),
                 day: d.getUTCDate(),
                 dec: d.getUTCHours() + d.getUTCMinutes() / 60
             };
         }
     }
```

**Scope guard:** no edits to `calculateVWAPIndicatorData` math, replay scheduler, or `chartCachedDateTimeFormat` (defined later at 2775 — avoid hoist coupling).

---

## 10. Proposed perf-budget scenario

| ID | Surface | Budget (RED) | Rationale |
|----|---------|--------------|-----------|
| **A7-PERF-VWAP-INTL-1** | Session anchor-key + integrate loop on 100k fixture (bench parity) | p95 **< 600 ms** | Bench cached loop p95 **532 ms** + ~10% headroom |
| **A7-PERF-VWAP-ADD-1** | Browser `addIndicator('vwap')` on 100k-bar chart | p95 **< 2500 ms** (interim); stretch **< 500 ms** after fix #2 | Fix #1 alone removes ~8.4 s Intl tax but triple-pass + allocs remain (~1–2 s estimated) |

Lane 4 registers harness when bless path is free. Until then: Node bench + PO live for TAL-01632.

---

## 11. Land checklist (when hold lifts)

1. Apply §9 hunk to **both** `chart-indicators-full.js` trees (I8 byte match).
2. Copy `vwap-intl-cache.bench.mjs` to mirror tree.
3. Run bench — cached avg ~400–600 ms, per-bar alloc avg ~8–9 s.
4. Optional: extend bench with switch OFF branch for RED-again evidence.
5. File-scoped commit: `chart-indicators-full.js` (both) + `vwap-intl-cache.bench.mjs` (both).
6. Status: **DONE (dev only) — NEEDS-LIVE** for TAL-01632.

---

## 12. Relation to A7 diagnostic

Confirms A7 report rank-#1 fix. Corrects stale `ROOT-CAUSES.md:47` line cite (replay lines shifted); this fix targets **add-time + all passes using `vwapBarPartsInTimezone`** only. Replay per-frame full recompute remains for **A7 fix #3**.
