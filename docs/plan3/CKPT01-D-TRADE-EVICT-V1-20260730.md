# CKPT-01 — pre TRADE-EVICT-V1 (binding)

**Landing:** `__TALARIA_DISABLE_TRADE_EVICT_V1` / playhead-bound hot release  
**Checkout tip at take:** `6ba61eeeb` (`6ba61eeeb62a554063bb4148f689bafc4b518410`)  
**Annotated tag:** `ckpt/pre-d-trade-evict-v1-6ba61eeeb`

Supersedes `ckpt/pre-d-money-conf01-d5b790e56` for **this** landing only — that tag covered a
different tip and mechanism. New money-path product landings get their own CKPT-01.

---

## Four required pieces

| # | Requirement | This checkpoint |
| --- | --- | --- |
| 1 | Annotated tag on exact tip | `ckpt/pre-d-trade-evict-v1-6ba61eeeb` |
| 2 | Retained deployable bytes | `artifacts/ckpt/pre-d-trade-evict-v1-6ba61eeeb/` + `SHA256SUMS.txt` (`a025cfee…`) |
| 3 | Kill-switch on the landing | `__TALARIA_DISABLE_TRADE_EVICT_V1` — FLAG-01/02/03 in `trade-evict-v1.test.mjs` / `.red.test.mjs` |
| 4 | Rollback exercised while green | Corrupted chart OM → restored from retained artifact → SHA matched; cold-read + Rayan #2 teardown GREEN |

## Rollback recipe

```text
copy artifacts\ckpt\pre-d-trade-evict-v1-6ba61eeeb\order-manager.chart.js ^
  "chart v 1.4\chart\modules\order-manager.js"
copy artifacts\ckpt\pre-d-trade-evict-v1-6ba61eeeb\order-manager.homepage.js ^
  homepage\public\chart\modules\order-manager.js
node --test "chart v 1.4/talaria-design/src/trade-evict-v1-cold-read.test.mjs"
node "chart v 1.4/chart/modules/order-mc-layout-teardown-retains-host-orders.test.mjs"
```
