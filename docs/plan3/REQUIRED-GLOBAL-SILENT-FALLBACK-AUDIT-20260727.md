# Tier-3 required-global silent-fallback audit — 2026-07-27

Status: read-only diagnostics/board evidence. No loader, shell, product, generated output, acceptance rule, or route was changed.

## Verdict

**STOP THE LINE:** `indicator-performance.js` declares that it must precede `chart-indicators-full.js`, but `IndicatorPerf` is absent from both maintained legacy surfaces and the reachable stale homepage source shell. Its consumers silently select slower/raw-copy and weaker-cache fallbacks. Current V9 source, generated dist, homepage dist forwarding, and production embed contain the module in the right order; legacy and the stale public source mirror do not.

The systemic pattern is wider than IndicatorPerf. Twelve required-global contracts have guarded consumers that can conceal an absent module. Seven are required product capabilities, four are required optimizations/infrastructure, and one (`CompareOverlay`) is genuinely optional only in embed-lite while required on the host. Existing tests are mostly unit/behavior tests that import or stub their own globals; only IndicatorPerf has a product-surface presence and negative-control gate.

## Audited surfaces

- Maintained V9 source: `chart v 1.4/talaria-design/live/index.html`
- Generated V9: `chart v 1.4/chart/dist-v9/index.html`
- Homepage production forwarding: `homepage/public/chart/dist-v9/index.html`
- Legacy source and homepage mirror: both `legacy-index.html`
- Production embed and homepage mirror: both `multichart-prod/chart-embed.html`
- Reachable stale source mirror: `homepage/public/chart/talaria-design/live/index.html`
- Consumers in `chart.js`, indicator/replay/order/drawing modules, `indicator-worker.js`, and multichart bridges

`dist/index.html`, sandbox multichart shells, test fixtures, and frozen baselines are visibility/control surfaces, not accepted product entrypoints. Their presence must not make a product tripwire green.

## Inventory

| Module / required global | Required order | Entry surfaces | Guard and fallback | Impact if absent | Runtime visibility | Existing gate | Gap / classification |
|---|---|---|---|---|---|---|---|
| `indicator-performance.js` / `IndicatorPerf` | before `chart-indicators-full.js` | V9 source/dist/forward, embed; **missing legacy + stale source mirror** | indicator lines 1407, 1434, 8248, 8364, 10605, 11532, 11823, 12017, 12202, 12606; raw arrays, sync/full recompute, visibility-only hash | high replay/worker transfer and calculation cost; cache invalidation can become less precise | no product banner; browser probe can read global | B75 product-surface four-state gate, corruption and blocked-response negative controls | **STOP-THE-LINE; required optimization, not optional** |
| `preferences-sync.js` / `preferencesSync` | before `preferences-init.js`, then all preference consumers | all maintained host/embed/legacy surfaces | chart 16524/16549; drawing manager 17184/17203/17216; guarded consumers fall to defaults/local state, while `preferences-init` catches initialization failure | cross-device/account persistence silently stops; defaults can mask missing hydration | console error only; no durable product tripwire | preference unit tests; no shell absence control | required data/persistence infrastructure; fail at first consumer-ready checkpoint |
| `viewport-data-manager.js` / `ViewportDataManager` | before `chart.js` | V9 + embed; legacy does not declare 6M viewport path | chart 25423–25424 resolves optional constructor and continues without manager | full dataset path, memory/network/latency regression on large files | no user-visible dependency state | behavioral tests only | required optimization where viewport pipeline is advertised; role-scoped tripwire |
| `talaria-toast-stack.js` / `__TalariaToastStack` | before `chart.js`, replay and order consumers | V9 + embed; legacy uses legacy notification rail | chart 13676; replay 1953/1972/1980/4172/9785; order 46425/46447 guard and use legacy/no pinned rail | messages still appear, but replay cut-line placement/relayout and shared stacking degrade | visible only when a toast/pinned label happens | no module-presence negative control | required UX infrastructure on V9/embed; legacy fallback is intentional by role |
| `compare-overlay.js` / `CompareOverlay` | before `chart.js` | V9 host only through host-only loader; intentionally absent embed | chart 1547 silently skips construction | compare feature disappears; no calculation fallback | compare UI may remain discoverable until action | no host presence/absence gate | required host feature; **truly optional only for embed-lite** |
| `replay-system.js` / `ReplaySystem` | after `chart.js`, before replay bridge/use | all maintained runtime roles | chart 12952–13019 retries and logs; embed bridge 1097 retries init | replay unavailable or late/racy; dependent indicator/order paths silently operate without active replay | console error; user sees inert/missing behavior | many replay behavior gates, no loader fault injection | required feature; product tripwire after deferred scripts settle |
| `order-event-bus.js` / `OrderEventBus` | bus before service/manager | all host/embed/legacy runtime roles | order manager 455 warns then installs no-op bus | subscriptions/events disappear while UI can continue | console warning only | Q8/Q-series unit tests, no shell absence gate | required order infrastructure, fallback not acceptance-correct |
| `order-service.js` / `OrderService` | after bus, before `order-manager.js` | all host/embed/legacy runtime roles | order manager 465–506 uses legacy in-class state | dual state model, persistence/event semantics can diverge | console warning only | service behavior tests, no product presence control | required order infrastructure, fallback is rollback only |
| `tool-lifecycle-store.js` / `ToolLifecycleStore` | after undo/redo, before drawing manager | all maintained runtime roles | drawing manager 562 creates `null` store and subscriber setup becomes inert | centralized selection/hover/edit/delete ownership lost; multichart divergence risk | no product-visible dependency state | lifecycle tests/kill switch, not missing-file injection | required drawing infrastructure; use module-response fault injection, not acceptance broadening |
| `drawing-tools-text.js` / `DrawingTextHelpers` | text module before drawing UI/manager | all maintained runtime roles | UI 267/34764 and manager 1220/7928/8240/8747/11373/16911 use local/null paths | duplicated fallback behavior; inline text save and geometry behavior can differ | only feature-specific symptoms | drawing behavior tests; no presence control | required drawing correctness for text-capable roles |
| Talaria indicator modules / `TalariaFvgIndicator`, `TalariaRatioGapIndicator`, `TalariaWeeklyMapIndicator`, `TalariaSimpleSmcIndicator` | each before `chart-indicators-full.js` | all maintained runtime roles | indicator 4074–4107 returns empty boxes/lines/bands when module/calculate absent | indicator remains selectable but paints nothing: silent correctness failure | empty chart, no dependency error | module unit tests; no per-module absence control | required feature modules whenever catalog exposes type; four independent tripwires |
| indicator RC6 modules / exported lifecycle, visibility, settings, rehydrate, replay-sync functions | before `chart-indicators-full.js`; replay-sync is present on embed/legacy but absent V9 host loader | V9 has persist/settings/visibility/lifecycle; embed adds replay-sync; legacy adds replay-sync | indicator 83–118 defaults enablement to ON even if implementation functions are missing, then chooses legacy/no-op branches at call sites | split lifecycle state, stale visibility/settings, duplicate rehydrate snapshots, replay legend lag | no consolidated runtime witness | module unit/audit tests, mostly self-imported | required architecture where enabled; **V9 host replay-sync omission requires owner ruling and fault-injection RED before promotion to STOP** |
| `indicator-ui.js` / `INDICATOR_DEFINITIONS`, settings functions | after `chart-indicators-full.js` | all maintained runtime roles | indicator 454/4052/6650/7267/18164 skips definition sanitation/settings and logs only on attempted settings | settings/catalog behavior disappears or accepts unsanitized/default payload paths | visible only when opening settings | UI tests, no shell absence negative control | required indicator feature; tripwire after UI script execution |

## Worker and replay boundary

`IndicatorPerf` packs bars in the window; `indicator-worker.js` accepts packed or raw bars and therefore cannot detect that the producer optimization vanished. This fallback is functionally plausible but performance-hostile, exactly the confirmed failure class. Replay probes also guard `window.IndicatorPerf` and calculate a local lookback when absent, so probes can complete while measuring the wrong path. Browser acceptance must assert the global and API set before collecting timing or painted-endpoint evidence.

Workers cannot directly see window globals. The tripwire must validate the producer global in each frame, then send one deterministic packed payload through the real worker and assert the packed branch witness. It must not require `IndicatorPerf` inside the worker.

## Static + browser harness proposal

Add a manifest-driven Tier-3 gate, separate from product code:

1. Static manifest records each role, source/generated/forwarded path, required ordered module subsequences, required globals/APIs, role exclusions, consumer guard sites, and fallback classification.
2. Static scan fails when a required script is absent, duplicated, late, has a mixed build stamp, or when a guarded consumer is added for an undeclared global. Generated/homepage pairs remain byte/digest checked.
3. Browser server serves byte-real shell and audited modules with unrelated network calls stubbed. For every accepted product role it records request/response/resource order, frame identity, build id, global/API types, console errors, and a feature-specific witness.
4. Product tripwire fails before timing/behavior assertions if a role-required global is absent. Optional role exclusions are explicit (`CompareOverlay` in embed-lite; legacy toast implementation), never inferred from a guard.
5. Each ungated module gets response fault injection: blocked, empty, syntactically valid but API-corrupt, and wrong-order. Required cells must RED. Existing kill switches remain the negative control where they genuinely disable the mechanism.
6. Indicator plugin injection removes one plugin at a time and asserts the catalog-visible indicator cannot return an empty-success result. RC6 injection removes one implementation module at a time and asserts enabled-without-implementation RED.
7. Four-state proof, 3× repeat, alternate host/clock, deterministic assertion payload, provenance/staleness stamp, and last-proven-RED follow Director A5.

Do not make the gate green by accepting a fallback. A fallback can remain in product for rollback/resilience while the product-role tripwire still requires the primary module.

## Board disposition

- **STL-1:** wire `IndicatorPerf` on legacy and disposition/remove the stale public source shell in separate product/routing packets. Current diagnosis remains RED until both accepted reachable roles are resolved.
- **T3-2:** add the manifest/static/browser tripwire with fault injection; diagnostics only.
- **T3-3:** resolve whether replay UI sync is required on V9 host. If enabled behavior is intended there, absence becomes STOP-THE-LINE; if embed-only, encode that role exclusion with evidence.
- **T2 follow-up:** assign owners and close accidental public shell exposure per `CHART-SHELL-SYSTEMIC-AUDIT-20260727.md`.

Acceptance is unchanged: product-required globals must exist. Defensive fallback execution is evidence of resilience, not evidence that the required module is optional.
