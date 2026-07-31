# E Gate Vacuity Audit

**2026-07-31** · Manager E · packet `E-GATE-VACUITY-AUDIT-V1`

Scope: root `package.json` active `preflight:*` and `test:*` gates only. Build/dev/docker
convenience scripts and historical evidence scripts not wired from the root package are out of scope.

## Verification Runs

- `npm run test:order-registry-eviction` -> GREEN; exercised wrong discriminator widening RED and unknown fixture key RED.
- `npm run test:bar-tick-invariants` -> GREEN; exercised tickless bar and futures maintenance mutation RED arms.
- `npm run test:support-passport-degraded` -> GREEN; exercised stripped support assignment mutation RED.
- `npm run test:destroy-indicator-correctness` -> GREEN; exercised destroy indicator resurrection RED.
- `npm run test:lag-session-history` -> GREEN; exercised VOID/fail-closed controls, not a lag-defect RED.
- `npm run test:legacy-panel-shell-correctness` -> GREEN; exercised missing canvas, main constructor, and fallback-main RED arms.
- `npm run preflight:trade-attribution-correctness` -> RED on current E tree with `resolverExecutionState: RESOLVER_ABSENT_FROM_TREE`.

## Active Gate Inventory

| Gate | Verdict | Demonstrated RED / limitation |
|---|---|---|
| `preflight:territory` / `test:territory` | `VERIFIED_RED_ARM` | Attack manifests, equal-specificity path conflict, unowned path, director-only bypass, decoy manifest path, dropped journal entry, byte-tampered journal, bad trailers, and bad CLI flags all fail in `scripts/tests/territory-preflight.test.mjs`. |
| `preflight:module-contracts` / `test:module-contracts` | `VERIFIED_RED_ARM` | Missing/duplicate/misordered required scripts, false exclusions, removed surface reappearance, misordered runtime provider, and browser-visible withheld `IndicatorPerf` all fail in the module contract/runtime/browser tests. |
| `preflight:shell-inventory` / `test:shell-inventory` | `VERIFIED_RED_ARM` | Fixture asserts `undeclared-shell`, `declared-shell-missing`, role/stamp/module violations, discovery-empty, missing roots, corrupted shell extraction, and anti-lying proof. |
| `checkpoint:provenance` / `test:checkpoint-provenance` | `VERIFIED_RED_ARM` | Mutable checkpoint inputs, dirty/wrong HEAD, wrong remote, modified/wrong Q6 wrappers, stale service worker, and runtime mismatch fail closed. Note: root script name is `checkpoint:provenance`, not `preflight:checkpoint-provenance`. |
| `preflight:order-overlay-browser` / `test:order-overlay-browser` | `PARTIAL` | Missing browser, timeout without report, and invalid report shape fail closed. It is explicitly `NOT-BEHAVIOUR-COVERING`; no product overlay-defect RED is demonstrated. |
| `preflight:order-registry-eviction` / `test:order-registry-eviction` | `VERIFIED_RED_ARM` | Wrong discriminator widening exits 1 with `B-OREI-05` and `removed but NOT disposed`; unknown fixture keys fail closed. |
| `preflight:differential-parity` / `test:differential-parity` | `ENFORCEMENT_GAP` | RED evidence exists: inverted epsilon, synthetic length-growth divergence, and current expected `DRIFT-SMA-*` RED. The CLI prints the RED report but does not enforce an exit-1 aggregate, so this is not vacuous but is weakly enforced. |
| `preflight:bar-tick-invariants` / `test:bar-tick-invariants` | `VERIFIED_RED_ARM` | Tickless bar mutation and futures maintenance-gap mutation RED, with XAUUSD non-GC negative control. |
| `preflight:teardown-census` / `test:teardown-census` | `VERIFIED_RED_ARM` | Hermetic orphan interval, listener, rAF, and MessageChannel RED arms; missing browser returns `UNPROVEN`, not GREEN. |
| `preflight:rest-state-census` / `test:teardown-census` | `VERIFIED_RED_ARM` | Standing rest interval, idle render without data, and permissive allowlist mutation RED arms. |
| `preflight:lag-session-history` / `test:lag-session-history` | `NO_DEMONSTRATED_PRODUCT_RED` | Missing metadata and attempted GREEN without session history become `VOID`. This is a provenance/sealing gate; it does not demonstrate an indicator-lag defect RED. |
| `preflight:support-passport-degraded` / `test:support-passport-degraded` | `VERIFIED_RED_ARM` | `NC-PASSPORT-DEGRADED-MUTATION` strips the support UI degraded assignment and returns RED. |
| `preflight:legacy-panel-shell-correctness` / `test:legacy-panel-shell-correctness` | `VERIFIED_RED_ARM_MODEL` | Missing canvas, constructed-as-main, and active-chart fallback-to-main all RED. Limitation: static/model behavior, not browser reproduction of the resize/legacy shell case. |
| `preflight:trade-attribution-correctness` / `test:trade-attribution-correctness` | `CURRENT_RED_CLASSIFIED` | Current E tree is `RESOLVER_ABSENT_FROM_TREE`. The gate now distinguishes that from `RESOLVER_PRESENT_BUT_UNCALLED` and `RESOLVER_CALLED_BUT_WRONG`; focus mutants still prove known-defective attribution RED. |
| `preflight:destroy-indicator-correctness` / `test:destroy-indicator-correctness` | `VERIFIED_RED_ARM_MODEL` | `DESTROY-NO-DESTROY-RESURRECTS-INDICATOR` catches late indicator resurrection; D owns retained bytes/heap and A owns real teardown implementation. |

## Cannot Demonstrate Product-Defective RED

- `preflight:order-overlay-browser`: runner/schema fail-closed only; no overlay behaviour RED.
- `preflight:lag-session-history`: VOID/sealing control only; no lag-measurement defect RED.
- `preflight:legacy-panel-shell-correctness`: model/static RED only; no browser reproduction.
- `preflight:destroy-indicator-correctness`: model RED only until real teardown lands.

## Enforcement Gap

- `preflight:differential-parity`: has RED evidence but does not enforce exit 1 on aggregate RED.
