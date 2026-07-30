# PO scorecard flip — armed, idle until Director says go

**Pack:** `PO-VISUAL-PACK-26-PO-EYES-20260730.md`  
**Do not call the PO.** Wait for C’s CONF-01 / attribution chrome to clear **and** Director “go”.

## When the scorecard returns

1. Record the filled scorecard under `_evidence\manager-D\` (photo or ticks JSON).  
2. Run:

```bash
node scripts/po-scorecard-flip.mjs --scorecard <path-to-json>
```

3. Rule:
   - **PASS** → ledger `po-eyes` → `fixed` (evidence = this pack + scorecard)
   - **FAIL** → ledger `po-eyes` → `broken` on stamp `20260730b113` (same evidence)
4. Re-count `LEDGER-STATUS-COUNT-20260730.json` and journal.

## Scorecard JSON shape

```json
{
  "stamp": "20260730b113",
  "pack": "PO-VISUAL-PACK-26-PO-EYES-20260730.md",
  "results": [
    { "ticket": "TAL-01724", "verdict": "PASS" },
    { "ticket": "TAL-01696", "verdict": "FAIL" }
  ]
}
```

Only the 26 pack rows are flipped. Missing tickets are left untouched and reported.
