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
   - **ZERO-TRADE-60X FAIL** → replay-smoothness rows are forced to `FAIL` unless Director
     explicitly scopes the failure elsewhere.
   - Missing / `UNREADABLE` CONF-04 mode axis → refuse flip; every measurement must state the
     mode read from each relevant realm.
4. Re-count `LEDGER-STATUS-COUNT-20260730.json` and journal.

## Scorecard JSON shape

```json
{
  "stamp": "20260730b113",
  "pack": "PO-VISUAL-PACK-26-PO-EYES-20260730.md",
  "modeAxis": {
    "M0": "page shell mode read",
    "M1": "host chart mode read",
    "M2": "replay mode read",
    "M3": "multichart host mode read",
    "M4": "peer panel modes read",
    "M5": "order-manager mode read",
    "M6": "history/journal mode read"
  },
  "results": [
    { "ticket": "TAL-01724", "verdict": "PASS" },
    { "ticket": "ZERO-TRADE-60X", "verdict": "PASS" },
    { "ticket": "TAL-01696", "verdict": "FAIL" }
  ]
}
```

Only the 26 pack rows are flipped. Missing tickets are left untouched and reported.
