# 20260727b80 indicator-performance loader candidate

- Immutable base: `967f96692fbccd448a3a31c7b2ff71718e18a71e` (B79).
- Rebuilt in isolated worktree `b80-indicator-loader-tier3-r2`; no cherry-pick was used.
- Maintained-source change: one `indicator-performance.js` loader immediately before `chart-indicators-full.js`.
- Permanent A5 gate: root `test:indicator-performance-loader` script plus the `indicator-performance-loader` CI job.
- Gate workload: three normal runs on `127.0.0.1`, one different clock/host run on `localhost` using `process.hrtime.bigint`, and one inverted-assertion run. Every run retains missing-loader, blocked-response, corrupt-module, wrong-order, cold-cache, and service-worker-bypass controls.
- Product coverage: maintained source (static), dist-v9 host, homepage-forwarded dist-v9 host, and multichart embed. The gate verifies loader execution order, all required APIs, response status, uniform `20260727b80` stamps, and embed behavior.
- Deliberately excluded stale surface: `homepage/public/chart/talaria-design/live/index.html`; it remained byte-unchanged.

## Build and inverse proof

1. Captured `pre-build-manifest.json`.
2. Ran `BUILD_ID=20260727b80 npm run build:live`.
3. Captured `post-build-1-manifest.json`, rebuilt with the same command, and captured `post-build-2-manifest.json`.
4. `reproducibility.json` records 3,293 tracked files compared with zero byte differences.
5. Removed only the loader declaration from maintained source, rebuilt, and ran the gate: RED (`source-rollback-red.json`).
6. Restored only maintained source, rebuilt, and ran the gate: GREEN (`source-restored-green.json` and the canonical gate artifact).

## Generated-change inventory

The build produced 18 generated/mirrored paths; this is not a forced 14-file claim:

- Vite output (2): chart `dist-v9/index.html` and `dist-v9/assets/talaria-v9-live.js`.
- Cache/stamp generator (9): chart engine pair (2), service-worker copies (5, including maintained live PWA), and legacy shell pair (2).
- Embed/harness stamp generator (4): chart and homepage copies of `chart-embed.html` and `harness/serve.mjs`.
- Homepage dist mirror (2): homepage `dist-v9/index.html` and `dist-v9/assets/talaria-v9-live.js`.
- Full multichart mirror (1 additional newly materialized file): `homepage/public/chart/multichart-prod/harness/h-a7b-r2-setup-contract.test.mjs`, copied from its tracked chart source.

The maintained live index, CI workflow, root package script, gate, and evidence files are authored candidate/evidence changes, not generated output.
