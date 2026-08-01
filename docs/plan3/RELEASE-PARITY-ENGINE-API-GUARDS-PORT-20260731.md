# RELEASE-PARITY — engine-api-guards port + README 6.3/6.5

**Date:** 2026-07-31  
**Owner:** Manager D (RELEASE-01 stop authority)  
**Rulings:** `RULING-THE-ARCHAEOLOGY-IS-FOUND-IFRAMES-WERE-A-CORRECTNESS-CHOICE-AND-PHASE-4-WAS-ALREADY-REJECTED-ONCE-20260731-1425.md`; `RULING-THE-SPIKE-IS-GO-AND-PHASE-4-WOULD-CREATE-ITS-OWN-MONSTER-WITHOUT-DESTROY-20260731-1520.md`; `RULING-THE-SPIKE-PRICES-PHASE-4-AT-665-HOURS-AND-I-GOT-FOUR-THINGS-WRONG-20260731-1555.md`

## Verdict

| Question | Answer |
|---|---|
| Can ported `installForbiddenSetterTraps` fire per-instance in one realm? | **Yes** — suite GREEN; `trapStop: false` |
| Does product `engine-api-guards.js` ship non-stub traps? | **No** — still returns `false`; **`productStubBlocksRelease: true`** |
| Does `Chart.destroy()` exist for add/remove? | **No** — README 6.3 is intentionally **RED**; `destroyStop: true` |
| RELEASE-01 posture | **Release waits** on `Chart.destroy()` and product non-stub traps. |

Ported traps throw `FORBIDDEN_SETTER_TRAP` on cross-instance `priceScale.min` write; internal writes via `withInternalPriceWrite` still succeed. That concrete first stop-authority test did **not** stop the release for inability to fire. The release now stops on teardown: `Chart.destroy()` does not exist, and README 6.3 is the load-bearing RED gate for that absence.

## What was ported (not reinvented)

Source: `homepage/public/chart/multichart/engine-api-guards.js`

| Artifact | Role |
|---|---|
| `FORBIDDEN_SYNC_FIELDS` | Product deny-list + decisions.md ten-field union (`scaleMode` added) |
| `filterForbiddenFields` | Nested strip of the union |
| `snapshotPriceState` / `diffPriceState` | visibleRange must keep `autoScale` true |
| `runGuardSelfTest` | Product RED fixtures (strip proof) |
| `installForbiddenSetterTraps` | **Port implements**; product remains stub |

Suite source of truth = decisions.md ten:

`priceMin`, `priceMax`, `autoScale`, `priceZoom`, `priceOffset`, `timeframe`, `indicators`, `drawings`, `chartType`, `scaleMode`

## E coordination (do not rebuild)

E already owns three of the ten via:

- `RP-INDICATOR-GLOBAL-SLOT`
- `RP-DRAWING-GLOBAL-LAYER`
- `RP-OVERLAY-GLOBAL-LAYER`

Path (E tree): `docs/plan3/evidence/E-RELEASE-PARITY-CORRECTNESS-20260731/release-parity-correctness.red.mjs`  
D references them in `E_COMPANION_ORACLE`; filter cells for `indicators` / `drawings` / `chartType` mark `ownedByE: true` and do not invent parallel RED controls.

Destroy behavior coordination is separate: D owns heap/listener teardown gating; E owns behavioral destroy controls. See `HANDOFF-D-TO-E-DESTROY-BEHAVIOR-CONTROLS-20260731.md`.

## Parity breadth

Reference-vs-candidate breadth now covers orders, drawings, replay, keyboard and context menus, with host-routed RED controls proving the gate can fail:

- `NC-PARITY-DRAWING-HOST-ROUTED`
- `NC-PARITY-ORDERS-HOST-ROUTED`
- `NC-PARITY-REPLAY-HOST-ROUTED`
- `NC-PARITY-KEYBOARD-HOST-ROUTED`
- `NC-PARITY-CONTEXT-MENU-HOST-ROUTED`

The existing crosshair price RED control remains: `NC-PARITY-CROSSHAIR-HOST-ABS-PRICE`.

Non-auth legacy shell control added for the disclosed `legacy-index.html` `isPanel` path:
`LEGACY-INDEX-ISPANEL-PATH-GATE-20260731.md`. It is static shell wiring only and does not prove browser resize behavior.

## README gates lifted as written

| Step | Gate | Status |
|---|---|---|
| 6.3 | Layout 2→3→2; assert A teardown probe figures: 147 live listeners/instance, 357 registered page-wide, 0 removed, 1 rAF/instance, 2 timeouts; 147/147 anonymous closures not removable | **Intentional RED until listeners are made removable and `Chart.destroy()` removes them** |
| 6.5 | Four mismatched-timeframe charts, 30s pan **and resize**, 4× CPU throttle, fail=0 (+ failing RED controls) | Hermetic GREEN |

Product shell heap snapshot (6.3) and CDP 4× throttle drive (6.5) remain CONF-01 follow-ups on the single-realm canary. Same-timeframe contamination fixtures earn no credit.

## Scripts

```
npm run test:release-parity-forbidden-fields
npm run test:release-parity-readme-gates
npm run test:release-parity-non-contamination
npm run preflight:release-parity-forbidden-fields   # exits 1 while product stub blocks release
npm run preflight:release-parity-readme-6-3         # exits 1 until Chart.destroy() lands
npm run preflight:release-parity-readme-6-5
npm run preflight:release-parity-non-contamination  # exits 1 while 6.3/product stub block release
```

## Evidence

- `_evidence/manager-D/RELEASE-PARITY-ENGINE-API-GUARDS-PORT-20260731.json`
- `_evidence/manager-D/RELEASE-PARITY-README-6-3-ADD-REMOVE-20260731.json`
- `_evidence/manager-D/RELEASE-PARITY-README-6-5-PAN-THROTTLE-20260731.json`
