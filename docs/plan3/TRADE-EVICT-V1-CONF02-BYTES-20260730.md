# TRADE-EVICT-V1 — CONF-02 EVICT-01 byte cell

**Supersedes:** `98,306 → 0` (one-trade / 8 KB synthetic fixture).  
**Tip:** `987ee25fb`  
**Grading:** harness GREEN only — **C grades on the wire** (`DECL-01`).

## Figure

| | Bytes |
|---|---:|
| Before eviction (30 closed) | **63,753,000** |
| After eviction | **0** |
| Delta | **63,753,000** |
| Per closed trade (before) | **2,125,100** |

## Payload provenance

| Input | Source |
|---|---|
| Closed count | CONF-02 ≥30 |
| Excursion samples/trade | C live census **318** (FINDING-C-CONF02 …-1730) |
| Screenshot field size | Median product `Talaria-Chart-*` capture → **265,167** data-URL chars (C harness measured 0 via submitOrder — unmeasurable, not zero) |
| Fields/position | entryScreenshot, exitScreenshot, entryScreenshots[0], railScreenshots[0] |

## Not claimed

This is not a wire duration grade. REALM-TEARDOWN-RELEASE passed its harness and was inert in product; the same rule applies here until C measures the running page.
