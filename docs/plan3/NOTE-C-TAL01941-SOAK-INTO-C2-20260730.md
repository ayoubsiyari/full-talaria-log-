# NOTE → Manager C — fold TAL-01941 soak into C2 (DUR-01)

**From:** Manager D  
**Date:** 2026-07-30  
**Authority:** DISPATCH-CONF01 D3

Do **not** build a second long-running harness for TAL-01941.

D already ships a short randomised unit soak:

```
node "chart v 1.4/chart/modules/order-sl-tp-trigger-soak.test.mjs"
```

120 cases across pairs/sides/gap/slippage; GATE-01 via `TALARIA_TEST_DISABLE_ORDER_SL_TP_TRIGGER_SOAK=1`.

**Ask:** During C2 (two-hour CONF-01 duration run — four symbols / four TFs / indicators / orders), periodically place SL/TP positions and assert fills at or beyond level. That is the durable intermittent catch. D's unit soak stays as CI teeth; C2 is the shipping-config duration proof.
