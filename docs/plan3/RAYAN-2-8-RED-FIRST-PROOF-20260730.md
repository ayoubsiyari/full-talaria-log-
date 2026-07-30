# Rayan #2 / #8 — GATE-01 RED-first proof (CONF-01)

**Tip:** `3f6cc83c8`+ (manager-d/trade-correctness)  
**Authority:** DISPATCH-D 15:15 §5 item 4

## Exit matrix (chart + homepage)

| Gate | Kill env | GREEN | RED | RED locus under kill |
| --- | --- | ---: | ---: | --- |
| Rayan #2 teardown | `TALARIA_TEST_DISABLE_MC_LAYOUT_HOST_ORDER_RETAIN=1` | 0 | ≠0 | host openPositions survive non-host panel remove (four-symbol contract) |
| Rayan #8A gap | `TALARIA_TEST_DISABLE_M24_ORDER_ID_GAP_RECONCILE=1` | 0 | ≠0 | next mint fills skipped #8 (mixed-symbol journal) |
| Rayan #8B place-audit | `TALARIA_TEST_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT=1` | 0 | ≠0 | CONF-01: surprise EURUSD blocked on GBPUSD panel |

All six cells (3 gates × 2 mirrors) GREEN=0 / RED≠0.

## CONF-01 kill coverage

- **#2:** retention assert is the four-symbol host/peer contract — kill clears host arrays → RED on CONF-01 teeth.
- **#8A:** gap reconcile over mixed-symbol journal — kill leaves stale counter → RED.
- **#8B:** test reordered so CONF-01 cross-panel asserts run **first**; kill fails on foreign-panel surprise before single-panel baseline.

## Commands

```bash
node "chart v 1.4/chart/modules/order-mc-layout-teardown-retains-host-orders.test.mjs"
TALARIA_TEST_DISABLE_MC_LAYOUT_HOST_ORDER_RETAIN=1 node "chart v 1.4/chart/modules/order-mc-layout-teardown-retains-host-orders.test.mjs"

node "chart v 1.4/chart/modules/m24-order-id-gap-after-hydrate.test.mjs"
TALARIA_TEST_DISABLE_M24_ORDER_ID_GAP_RECONCILE=1 node "chart v 1.4/chart/modules/m24-order-id-gap-after-hydrate.test.mjs"

node "chart v 1.4/chart/modules/order-explicit-place-audit.test.mjs"
TALARIA_TEST_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT=1 node "chart v 1.4/chart/modules/order-explicit-place-audit.test.mjs"
```

Same paths under `homepage/public/chart/modules/`.
