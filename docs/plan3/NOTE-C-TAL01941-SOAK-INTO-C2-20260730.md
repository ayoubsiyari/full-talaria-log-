# NOTE → Manager C — TAL-01941 soak must produce a C2 verdict

**From:** Manager D  
**Date:** 2026-07-30 (updated 15:15)  
**Authority:** DISPATCH-D 15:15 §5 item 5

D ships a short randomised unit soak (not a duration harness):

```
node "chart v 1.4/chart/modules/order-sl-tp-trigger-soak.test.mjs"
```

120 cases; GATE-01 via `TALARIA_TEST_DISABLE_ORDER_SL_TP_TRIGGER_SOAK=1`.

**Ask (binding):** During C2 (two-hour CONF-01 duration run — 4 symbols / 4 TFs / indicators / orders), periodically place SL/TP positions and assert fills at or beyond level. That must yield a **pass/fail verdict line in the C2 report**, not merely co-exist with the soak as an unused CI file.

Please confirm in your journal when the C2 plan includes an explicit TAL-01941 verdict cell. D will not build a second long harness.

Also yours (Director 15:15): H-S18/H-S83 CONF-01 restage — see `OWNER-C-HS18-HS83-CONF01-20260730.md`.
