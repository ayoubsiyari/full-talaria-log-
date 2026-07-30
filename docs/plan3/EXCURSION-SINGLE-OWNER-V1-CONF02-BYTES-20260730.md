# EXCURSION-SINGLE-OWNER-V1 — CONF-02 byte cell

**Tip:** `f4e006b06`  
**Grading:** harness GREEN only — **C grades on the wire** (`DECL-01`).  
**Not the memory win.** Director: expect small; 730 MB/h is A's.

## Authoritative list

`tradeJournal`. `managerClosed` and `serviceClosed` are the **same array** via
`bindServiceProp` (zero additional bytes). The real duplicate was journal `.slice()`
copies. After share + TRADE-EVICT, closed/service report 0 excursion samples; journal keeps them.

## Cap

319 samples/row in the duration gate is the **sum of four keys**, ceiling 1,024 — not a
breach of the 256 per-array cap (C FINDING 21:10). Hard-cap belt shipped anyway.

## Measured figure (excursion arrays only, UTF-16)

| | Bytes |
|---|---:|
| Legacy deduped (closed+journal slices, flag OFF) | **390,240** |
| Product journal-only after evict (flag ON) | **195,120** |
| Delta | **195,120** |
| Open positions retained | **6,552** |
| Naive three-list sum (misleading) | 585,360 |

Evidence: `_evidence/manager-D/EXCURSION-SINGLE-OWNER-V1-CONF02-BYTES-20260730.json` (EVID-02).
