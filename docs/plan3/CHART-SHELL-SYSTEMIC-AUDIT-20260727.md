# Chart-shell systemic read-only audit — 2026-07-27

Status: diagnostic/board evidence only. No shell, loader, route, build, or product file was changed. The in-flight Tier-3 loader candidate was not inspected or modified.

## Executive finding

Production does not have a closed shell allowlist. Homepage nginx serves every file copied below `out/chart/`; a miss falls through to FastAPI, which separately exposes selected root files and mounts `dist-v9`, `dist`, `modules`, `multichart`, and all of `multichart-prod`. Consequently test fixtures, frozen evidence, old sandboxes, and one abandoned source-template mirror are public URLs.

There are 22 chart-capable HTML files in the three relevant trees. They collapse to 12 URL identities. Four are owned production shell roles, two are intentional legacy/forwarding roles, and six URL families are non-production templates, harnesses, or snapshots that are reachable only because whole directories are served/copied.

No repository `CODEOWNERS`, `OWNERS`, or `MAINTAINERS` file exists. “Owner” below therefore means the build/routing code that demonstrably produces or selects the file; human/team ownership is **ABSENT** for every row and must be assigned.

## Routing facts

- Production image: `homepage/Dockerfile` builds `chart v 1.4/talaria-design/live/index.html` with Vite, emits `chart/dist-v9`, then copies `dist-v9`, `modules`, `multichart-prod`, and `legacy-index.html` into Next `public/chart` before static export.
- Homepage nginx: `location ^~ /chart/ { try_files $uri $uri/ @chart_upstream; }`. Any copied HTML is directly reachable; missing paths are forwarded to FastAPI.
- FastAPI: `/chart/` redirects to `/chart/index.html`; that route selects `dist-v9/index.html`, then `dist/index.html`, then the pointer stub. It also mounts `/chart/dist-v9`, `/chart/dist`, `/chart/modules`, `/chart/multichart` and `/chart/multichart-prod`.
- Local Express (`chart/server.js`) serves the entire chart directory and is a development-only broad exposure.
- Source `chart v 1.4/talaria-design/live/index.html` is a Vite input, not a production URL. The copy at `homepage/public/chart/talaria-design/live/index.html` has no generating script or Docker copy instruction.

## Complete inventory

Digest values are SHA-256 prefixes. “Loader” is the ordered external/dynamically declared script list with cache tokens normalized; intentionally different embed roles are compared by contract, not byte equality. Full hashes and full order lists are in `docs/plan3/evidence/chart-shell-audit-20260727.json`.

| URL / repository path | Production reachability | Owner / source of truth; generation | Stamp | File / loader digest | Class | Current drift |
|---|---|---|---|---|---|---|
| `/chart/index.html` → `chart/dist-v9/index.html` | Yes, FastAPI-selected; homepage normally serves `/chart/index.html` via upstream because no committed public file | `talaria-design/live/index.html`; Vite `build:live:chart` → `chart/dist-v9`; Docker/Next copy | b61 | `662c23b81d1` / `a5218a3d198a` | canonical generated production host | Source has one intentional extra `indicator-performance.js` before Vite output plus `./main.jsx` transformed to bundle; otherwise current |
| `/chart/dist-v9/index.html` → `chart v 1.4/chart/dist-v9/index.html` | Yes, local homepage copy first; FastAPI mount fallback | Same source/build as above | b61 | `662c23b81d1` / `a5218a3d198a` | generated production host alias | Byte-equal to homepage mirror |
| `/chart/dist-v9/index.html` → `homepage/public/chart/dist-v9/index.html` | Yes, served by homepage nginx | Generated mirror via sync script and Docker copy | b61 | `662c23b81d1` / `a5218a3d198a` | generated/forwarded production host | No drift from chart build output |
| source `chart v 1.4/talaria-design/live/index.html` | No production URL; Vite dev only | Canonical host source; `vite.config.live.js` | b61 | `47ae102fb9f4` / `f56433c6456c` | canonical source template | Expected source-vs-output transform; contract must account for source entry and build-generated bundle |
| `/chart/legacy-index.html` → chart source | Yes, FastAPI root allowlist and homepage copy | `chart/legacy-index.html`; explicit Docker/sync copy | b61 | `dc73d5aa73c4` / `f7f7cc1ad367` | owned legacy production shell | Byte-equal to homepage mirror; loader intentionally differs from V9 host |
| `/chart/legacy-index.html` → homepage mirror | Yes, homepage nginx | Generated copy of chart legacy source | b61 | `dc73d5aa73c4` / `f7f7cc1ad367` | generated legacy production shell | No drift |
| `/chart/dist/index.html` | Yes only through FastAPI fallback/mount when present | Legacy client bundle build (`build-chart-client-bundle.mjs`); generated output | b59 | `26496d6699da` / `443608e8db92` | fallback generated legacy shell | Stale two builds behind b61; reachable but not selected while dist-v9 exists |
| `/chart/index.html` physical `chart/index.html` | Route-selected only if both builds absent; direct Express dev | Pointer document maintained manually | none | `e166fc50a5a4` / empty | forwarded fallback/pointer | Not a chart runtime; safe only as last fallback |
| `/chart/multichart-prod/chart-embed.html` → chart source | Yes, FastAPI directory mount; used by product iframe path | `chart/multichart-prod/chart-embed.html`; whole-folder Docker/sync copy | b61 | `510962d42455` / `150e36ef15d2` | owned production embed | Byte-equal to homepage mirror; intentionally different loader contract from host (lite/embed set) |
| same URL → homepage mirror | Yes, homepage nginx | Generated copy of chart source | b61 | `510962d42455` / `150e36ef15d2` | generated production embed | No drift |
| `/chart/multichart/chart-host.html` → chart source | Yes via FastAPI sandbox mount | Hand-maintained sandbox; no declared build owner | timestamp a10 | `b3965bb79354` / `75cfe73a48be3` | non-production sandbox | Homepage mirror has same loader order but different bytes |
| same URL → homepage mirror | Yes, homepage nginx | Accidental whole-tree historical mirror; no current Docker copy path for `multichart` | timestamp a10 | `b8ea70d0232f` / `75cfe73a48be3` | accidental stale sandbox | File differs from chart source by 1,307 bytes despite identical loader digest |
| `/chart/multichart/multichart-shell.html` → chart source | Yes via FastAPI sandbox mount | Hand-maintained sandbox; no declared build owner | timestamp 20260509 | `bb52cd6128d` / `5895c8ac7091` | non-production sandbox | Byte-equal mirror but old timestamp loader tokens |
| same URL → homepage mirror | Yes, homepage nginx | Accidental historical mirror | timestamp 20260509 | `bb52cd6128d` / `5895c8ac7091` | accidental stale sandbox | Reachable duplicate; no production role |
| `/chart/talaria-design/live/index.html` | **Yes, homepage nginx** | **Owner absent; no build/generation path.** It appears to be an abandoned manual copy of the Vite source | b12 plus b50 | `9fb370ceeb19` / `d3c72deae7aa` | **accidental unowned stale source shell** | **Critical drift:** canonical is b61; this shell is b12 and mixes `talaria-simple-smc-indicator.js` b50 into a b12 order. It loads `./main.jsx`, which is not a production bundle |
| `/chart/modules/m21-w6-fixtures/lwc-proto-snapshot/lwc-proto.html` → chart source | Yes via FastAPI `/chart/modules` mount | W6 archived prototype fixture; no production owner | none | `b3241a7334f8` / `c236eec5b2e1` | non-production snapshot | Byte-equal public mirror; vendor is intentionally archived/absent |
| same URL → homepage mirror | Yes, copied because all modules are copied | Generated accidental publication | none | same | accidental reachable snapshot | Not a product shell; should not route |
| `/chart/multichart-prod/m20-q5-q7-browser-harness/m20-q5-q7-browser-harness.html` → chart source | Yes via FastAPI prod-directory mount | Test harness, no production owner | none | `4b4ab1b0961c` / `84e2dbaf980b` | non-production harness | Byte-equal public mirror; route exposure is accidental |
| same URL → homepage mirror | Yes, copied with all `multichart-prod` | Generated accidental publication | none | same | accidental reachable harness | Not a product route |
| `/chart/multichart-prod/m20-q5-q7-browser-harness/m20-q5-q7-panel-frame.html` → chart source | Yes via FastAPI prod-directory mount | Test harness frame, no production owner | none | `161b6267da49` / `d9153d25aaa6` | non-production harness | Byte-equal public mirror; route exposure is accidental |
| same URL → homepage mirror | Yes, copied with all `multichart-prod` | Generated accidental publication | none | same | accidental reachable harness | Not a product route |
| `/chart/multichart-prod/harness/frozen/m21-vy-ab-baseline-v2.2/runtime/chart/multichart-prod/chart-embed.html` → chart source | Yes via FastAPI prod-directory mount | Immutable test evidence snapshot, not product-owned | b61 | `510962d42455` / `150e36ef15d2` | frozen evidence | Currently byte-equal to embed by design, but production reachability is accidental |
| same frozen URL → homepage mirror | Yes, copied with all `multichart-prod` | Generated accidental publication | b61 | same | accidental reachable frozen evidence | A future immutable old snapshot would remain reachable and stale |

### Classification summary

- Owned production host shells: V9 canonical/source/generated mirrors; legacy shell and generated mirror.
- Owned production embed: `multichart-prod/chart-embed.html` and generated mirror.
- Forward/fallback: FastAPI `/chart/index.html`, physical pointer, legacy `dist/index.html`.
- Non-production but reachable: multichart sandbox pair, W6 LWC snapshot, Q5/Q7 harness and panel frame, frozen runtime embed.
- Unowned/reachable/stale: `homepage/public/chart/talaria-design/live/index.html` (highest priority), homepage `multichart/chart-host.html`, and all test/evidence URLs above.

## Fail-closed uniformity assertion design

Add a post-loader-fix gate driven by an explicit manifest, not directory discovery:

1. Manifest entries name role, source path, generated path(s), public URL(s), owner, generation command, allowed script sequence, and stamp policy.
2. Owned production roles:
   - `v9-host-source`: canonical source template.
   - `v9-host-built`: chart build output plus homepage mirror; these two must be byte-equal.
   - `legacy-host`: chart source plus homepage mirror; these two must be byte-equal.
   - `multichart-embed`: chart source plus homepage mirror; these two must be byte-equal.
3. Assert every manifest file exists, has exactly one accepted build stamp, and every generated pair has matching file and normalized loader-order digests.
4. Compare different roles by required ordered subsequences and role-specific allow/deny sets, not bytes:
   - all runtime roles must pin one build;
   - `chart.js` occurs once;
   - prerequisites precede `chart.js`; post-engine modules follow it;
   - host-only modules are required on host and forbidden in lite embed;
   - embed bridge quartet is required only on embed/multichart paths;
   - source entry `./main.jsx` is allowed only in Vite source and must become the built `talaria-v9-live.js`.
5. Enumerate all HTML below production copy/mount roots. Fail if a discovered file is neither an owned manifest entry nor an explicit denied non-production entry. This is the fail-closed property.
6. Validate routing config against the same manifest: an owned URL must resolve; a denied URL must return 404/410 in image preflight. No wildcard exemption for `modules/**`, `multichart-prod/harness/**`, or nested source trees.
7. Record build id, source commit, file digest, normalized loader digest, and route result as CI evidence.

This assertion deliberately does **not** require byte equality between host, legacy, and embed shells.

## Separate deny/remove routing rule

After the loader fix ships, introduce a separate routing/build packet:

- Build allowlist: copy only declared product artifacts from `modules` and `multichart-prod`; exclude `**/*.test.*`, `**/fixtures/**`, `**/harness/**`, `**/frozen/**`, browser harnesses, and nested source trees such as `talaria-design/**`.
- Homepage nginx: exact/manifest-owned chart HTML locations; deny nested HTML not in the manifest with `404` (or `410` for URLs known to have escaped).
- FastAPI: replace broad HTML-serving mounts with asset mounts that reject `.html`, then add exact routes for owned product HTML. Keep JS/CSS/static assets available as required.
- Source templates remain in source control and local Vite/harness servers; production routing must never expose them.
- Apply both controls. Copy exclusion alone leaves FastAPI fallback exposure; FastAPI denial alone leaves files already copied into nginx root.

## Proposed post-loader change packets

1. **Packet S1 — ownership/manifest and uniformity gate, Tier 2 (STANDARD).** Add shell manifest, exact ownership assignments, role-aware loader contract, generated-pair digest checks, unknown-shell RED fixture, and image route inventory. Shared build/CI path, no runtime behavior.
2. **Packet S2 — remove abandoned public source mirror, Tier 2 (STANDARD).** Remove `homepage/public/chart/talaria-design/live/index.html` and prove its URL is RED/404 while canonical `/chart/index.html` remains GREEN. Separate from loader work.
3. **Packet S3 — production copy allowlist, Tier 2 (STANDARD).** Stop publishing fixtures/harness/frozen HTML from `modules` and `multichart-prod`; preserve required runtime JS/assets. Negative-control fixture proves unknown HTML cannot enter image.
4. **Packet S4 — FastAPI/nginx exact HTML routing, Tier 2 proposed; promote to Tier 3 if route changes affect auth/admin/product entrypoint fallback.** Deny non-owned nested HTML on both serving layers; route matrix includes direct homepage, upstream fallback, canonical host, legacy host, embed, and denied templates.
5. **Packet S5 — legacy sandbox disposition, Tier 2 (STANDARD).** Decide whether `/chart/multichart/**` is retained behind an explicit non-production server or removed from production routing. Do not combine with S2–S4.

Sequence: loader fix ships and its accepted order becomes the manifest baseline; then S1; then S2/S3 independently; then S4; S5 last. None should be folded into the Tier-3 loader candidate.
