# B80 Tier-3 packet — module contract and presence enforcement

Accepted candidate: `106c5973c`

Mechanism row: Director A4c/A6 capability-loss-without-failure

Scope: IndicatorPerf and extensible module contracts; Lane 5 trade persistence explicitly excluded

Authored against: `20260727b80`

Last proven RED on: `20260727b80`

Oracle state: PROVEN

Independent-review correction commits:

- `d071c858f` removes the stale accidental public live shell as a deletion-only commit.
- The review handoff records the follow-up implementation commit hash after authoring proof.

## Contract and inventory

`scripts/module-contracts.json` is the machine-readable authority. Every module has
`provides`, `requiredSurfaces`, `class`, `order`, and `source` plus version, script,
and generated mirrors. The audited inventory contains the source host, both generated
host copies, and both panel copies. Legacy source/public shells remain explicitly
non-servable route-removal debt. Frozen harness evidence is explicitly non-production.

The preflight checks every owned/stamped required surface for one-and-only-one loader,
declared predecessor/successor order, build stamp, source existence, and byte-identical
generated module mirrors. It is wired into root/chart builds, multichart CI, and
checkpoint preflight.

## Runtime behavior

Each accepted host/panel loads `module-presence-runtime.js` before the chart engine.
It publishes `window.__TALARIA_LOADED_MODULES` records with module/version/class/status.
IndicatorPerf registers after publishing its APIs. At DOM readiness the tripwire checks:

- exactly one IndicatorPerf ledger record;
- required IndicatorPerf callable APIs;
- provider script precedes `chart-indicators-full.js`.

Before any order script executes, each shell publishes the exact Lane-5 contract
`window.__TALARIA_DEGRADED_STATE = { degradedModules: [] }`.
`window.__TALARIA_DEGRADED_MODE__` remains a compatibility alias.
The incorrectly suffixed `window.__TALARIA_DEGRADED_STATE__` is also retained only
as a compatibility alias to the same object.

Absence/misorder preserves fallback execution, emits one loud correctness-degraded
event/error, updates the canonical degraded state, adds a bounded module ID once,
and displays a discreet non-interactive badge. It never throws, blocks, or opens a modal.
Support context includes bounded `degradedModules[]` (32 IDs, 64 characters each).

## A5 anti-lying proof

Permanent fault injection mutates an in-memory owned shell:

1. Broken state: missing provider fails.
2. Fixed state: audited inventory passes.
3. Corrupted input: duplicate and misordered provider fail.
4. Inverted assertion: fixed state fails the inverted assertion.

Additional negative controls mutate servability classification and inventory path.
Removal-pending is deploy-blocking; a supposedly removed shell reappearing is RED.
The suite copies all sources/surfaces/mirrors to an alternate temporary host path and
runs with a fixed alternate clock. Assertion payloads contain no UUID, wall clock,
rAF ordering, or float equality.

The Puppeteer proof loads the maintained source host HTML and production panel shell
HTML through an HTTP server in real Chromium. It proves APIs, ledger records, exact
degraded-state shape, runtime-before-order-script timing, real `submitOrder` timing,
independent cross-window state, withheld-IndicatorPerf RED, and the visible badge.
The focused Node proof imports the consumer token parsed from both order-manager
surfaces in accepted Lane-5 commit `1f9ec3275` and requires exact publisher equality.

Commands:

```text
npm run preflight:module-contracts
npm run test:module-contracts
```

Authoring requirement: run the complete test command three times; all runs must pass.
Generated source/public runtime and IndicatorPerf module mirrors must be byte-identical.

## Exact implementation files

- `.gitattributes`
- `.github/workflows/multichart-harness.yml`
- `package.json`
- `chart v 1.4/talaria-design/package.json`
- `scripts/checkpoint-provenance.mjs`
- `scripts/module-contracts.json`
- `scripts/module-contract-preflight.mjs`
- `scripts/tests/module-contract-preflight.test.mjs`
- `scripts/tests/lane5-order-manager-consumer-token.mjs`
- `scripts/tests/module-presence-runtime.test.mjs`
- `scripts/tests/module-presence-browser.test.mjs`
- `chart v 1.4/talaria-design/live/index.html`
- `chart v 1.4/chart/dist-v9/index.html`
- `homepage/public/chart/dist-v9/index.html`
- `chart v 1.4/chart/multichart-prod/chart-embed.html`
- `homepage/public/chart/multichart-prod/chart-embed.html`
- `chart v 1.4/chart/modules/module-presence-runtime.js`
- `homepage/public/chart/modules/module-presence-runtime.js`
- `chart v 1.4/chart/modules/indicator-performance.js`
- `homepage/public/chart/modules/indicator-performance.js`
- `homepage/src/app/dashboard/support/supportUi.tsx`
- `homepage/src/app/dashboard/v16/v16LiveGlobals.d.ts`
- `tests/evidence/b80-tier3-module-contract/TIER3-PACKET.md`

No order-manager, backend, trade record, deploy, or push change belongs to this packet.
