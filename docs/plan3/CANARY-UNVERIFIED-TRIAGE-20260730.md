# Canary Row Disposition — 2026-07-30 (updated 12:10 closure pass)

Scope: the 102 unverified rows from the 10:40 triage, plus M24 reopen rows.  
**Bare `unverified` count after this pass: 0.**  
Authority: `docs/plan3/CANARY-CLOSURE-PASS-20260730-1210.md`, ledger `TICKET-STATUS-LEDGER-20260729.md`.

## Original triage counts (10:40, before closing)

- `(a)` existing gate: **15**
- `(b)` code read + new gate: **14**
- `(c)` PO eyes / NEEDS-INFO: **73**
- Total: **102**

## Closure pass outcomes (12:10)

### Bucket (a)

| Outcome | Count | Rows |
| --- | ---: | --- |
| `fixed` (gates GREEN) | 8 | TAL-01733, 01910, 01887, 01939, 01699, 01885, PO value-box, PO hover |
| `blocked-on-build` | 6 | TAL-01918, 01922, 01899, 01718, 01900, 01902 |

TAL-01918 / TAL-01922: gates exist locally and are RED; product fix not on deployed stamp → **BLOCKED-ON-BUILD**, not closed, not bare unverified.  
M25 four: gates only on `diagnostics/v3-qa123-soak-20260727`.

### Bucket (b)

| Outcome | Count | Rows |
| --- | ---: | --- |
| `fixed` | 6 | TAL-01903, 01886, 01802, 01777, 01807b, PO pending SL/TP resurrect |
| `owner-blocked` | 8 | TAL-01799, 01864, 01936, 01931, 01759, 01935/01914/01921, 01938, 01913 |

New gates: `cross-timeframe-current-price-coherence.test.mjs`, `order-pair-switch-visual-rebind.test.mjs` (`ab57a5dac`).

### Reclassify the 26 (default-c dump → zero PO minutes)

| Class | Count |
| --- | ---: |
| `cosmetic-disclosed` | 6 |
| `superseded` | 14 |
| `needs-info` | 6 |

IDs: see `CANARY-CLOSURE-PASS-20260730-1210.md` §3.

### Remaining `po-eyes` (26)

True deployed-build looks that still cannot close at node level: order-line leftovers, data/replay/UI clusters, TAL-01796 / TAL-01911 / TAL-01940 first looks, etc.  
**Five money scripts** for the next stamp: `PO-SCRIPTS-NEXT-BUILD-20260730.md` (ordered by rows-closed / PO-minute; each row tagged re-run vs first look).

## Ledger status totals after pass

| Status | Count |
| --- | ---: |
| fixed | 51 |
| superseded | 29 |
| po-eyes | 26 |
| needs-info | 17 |
| owner-blocked | 13 |
| blocked-on-build | 6 |
| cosmetic-disclosed | 6 |
| unverified | **0** |
