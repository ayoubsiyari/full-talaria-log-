# PULL-01 — order memory terms

**Tip:** `76023722d`  
**Grading:** payload sizing, no browser soak.  
**Real payload:** `C:/Users/user/Desktop/talaria1/manager-d-trade/docs/plan3/fixtures/talaria-chart-median-live-census.dataurl.txt`  
**MIME note:** data URL declares `image/png`; bytes are `image/jpeg`.

## Screenshot term

The real Talaria-Chart screenshot fixture is **3331×1556**. A decoded RGBA
bitmap is:

`3331 × 1556 × 4 = 20,732,144 bytes`

| Model | Per closed trade | At 301 closed trades |
|---|---:|---:|
| One decoded bitmap / closed trade | **20,732,144** | **6,240,375,344** |
| Entry + exit decoded bitmaps / closed trade | **41,464,288** | **12,480,750,688** |
| Four compressed data-URL string fields / closed trade | 1,940,048 | 583,954,448 |

This explains why the previous one-trade / 8 KB synthetic was not a product figure. The
decoded-bitmap term is advisor-sized and is now the leading TAL-01891 candidate, pending live
heap proof of retention.

## excursionSamples term

| Scale | Samples | Packed Float64 lower bound | Product JSON UTF-16 approximation |
|---|---:|---:|---:|
| Current RED term | **95,652** | **765,216** | **1,604,120** |
| Hourly slope | 23,300/h | 186,400/h | 358,868/h |

Verdict: excursionSamples is real and rising, but its byte term is **sub-MB at 95,652 samples**
under both lower-bound and product JSON sizing. It stays in the RED verdict as a correctness /
retention term, not the 8 GB driver.

## TAL-01891 disposition

Reopen as **live P0 candidate**. A heavy account with hundreds of retained closed-trade
screenshots can plausibly reach multi-GB memory while fresh harness accounts do not reproduce it.

Evidence mirror: `_evidence/manager-D/PULL01-ORDER-MEMORY-TERMS-20260731.json`.
