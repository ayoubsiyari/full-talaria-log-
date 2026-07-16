# Lane 3 — A7 fix #1 (Intl formatter cache) IMPLEMENTATION SPEC — PREP ONLY, DO NOT LAND YET

## Status: HOLD-FOR-BLESS
Write the spec + standalone benchmark. **Do NOT edit `chart-indicators-full.js` and do NOT commit any product change** until the Manager releases the hold (after `20260716b10` is blessed). Reason: Lane 1 may rebuild `dist-v9` for the bless; a working-tree indicator change would contaminate the blessed build. This task prepares the fix so it lands in minutes once the bless clears.

## Allowed in this task (freeze-safe, no collision)
- A standalone micro-benchmark file (NEW file, e.g. `chart v 1.4/chart/modules/vwap-intl-cache.bench.mjs`) that measures the current per-bar `Intl.DateTimeFormat` allocation cost vs a cached-formatter variant, on a synthetic 100k-bar array. No import of the live chart bundle required — replicate the allocation pattern faithfully (I15: same construction args as `vwapBarPartsInTimezone`).
- A written implementation spec doc.
- **Do NOT** edit `react-parity-lib.mjs` or any shared harness file (Lane 4 owns it during the bless).

## The fix to spec (A7 fix #1, top-ranked, freeze-safe)
Root: `vwapBarPartsInTimezone` (`chart-indicators-full.js:2184-2216`) constructs a new `Intl.DateTimeFormat` per bar. Session VWAP (default) hits this for every bar → ~13.5s add on 100k bars.
- **Fix:** module-level (or per-timezone-keyed) cache of `Intl.DateTimeFormat` instances, mirroring how opening-range already caches. Look up by timezone key; construct once; reuse.
- **Kill-switch:** `window.__TALARIA_DISABLE_VWAP_INTL_CACHE_V1` (unset = fix ON = cached; set = revert to per-bar allocation).
- **Scope:** this one function + the cache declaration. No change to VWAP math, no change to replay path (that's A7 fix #3, separate). One-phase-per-commit.

## Deliverable (report, no product commit)
`docs/tickets-overhaul/worker-reports/A7-fix1-intl-cache-spec-report.md`:
- The exact planned hunk (before/after of `vwapBarPartsInTimezone` + cache decl) as a **diff preview in the report** — not applied to the file.
- Benchmark numbers: per-bar-alloc vs cached, 100k bars (expect order-of-magnitude improvement; state actual).
- Confirmation the switch reverts cleanly (spec-level).
- Proposed perf-budget RED id `A7-PERF-VWAP-ADD-1`: add session VWAP on 100k bars → assert main-thread block < budget (name a budget from the benchmark, e.g. < 500ms).
- Explicit note: NOT committed, awaiting bless release.

## When the hold lifts (Manager will say "release A7 fix #1")
Apply the specced hunk to BOTH trees (`chart v 1.4/...` + `homepage/public/...`, I8), prove ON=fast / OFF=slow, file-scoped commit (indicator module + benchmark only), NEEDS-LIVE for the 1-min-freeze ticket TAL-01632.
