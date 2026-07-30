# TRADE-EVICT-V1 — CONF-02 EVICT-01 byte cell

**Supersedes:** `98,306 → 0` (one-trade / 8 KB synthetic fixture).  
**Tip:** `ccc9b34c1`  
**Grading:** harness GREEN only — **C grades on the wire** (`DECL-01`).

## Figure

| | Bytes |
|---|---:|
| Before (30 closed + 4 open) | **70,124,552** |
| After (closed released; open retained) | **6,371,552** |
| Delta (closed-path release) | **63,753,000** |
| Closed before → after | **63,753,000 → 0** |
| Open (unchanged) | **6,371,552** |
| Per closed trade (before) | **2,125,100** |

## Payload provenance

| Input | Source |
|---|---|
| Closed count | CONF-02 ≥30 |
| Open count | 4 (CONF-01 four-symbol live book alongside accumulation) |
| Excursion samples/trade | C live census **318** (FINDING-C-CONF02 …-1730) |
| Screenshot field size | Median product `Talaria-Chart-*` capture → **265,167** data-URL chars (C harness measured 0 via submitOrder — unmeasurable, not zero) |
| Fields/closed position | entryScreenshot, exitScreenshot, entryScreenshots[0], railScreenshots[0] |

## Not claimed

This is not a wire duration grade. REALM-TEARDOWN-RELEASE passed its harness and was inert in product; the same rule applies here until C measures the running page.
