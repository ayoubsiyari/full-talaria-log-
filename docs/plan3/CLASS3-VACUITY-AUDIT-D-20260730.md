# D2 — Class-3 vacuity audit (CONF-01 substance)

**Tip:** current `manager-d/trade-correctness`  
**Authority:** DISPATCH-D 15:15 §3  
**Baseline column:** `node scripts/ledger-status-count.mjs`  
**Rule:** Class 3 = report describes multichart, gate boots single chart only → `conf01-unshaped` until reshaped.

Cross-check: explore audit [D2 class-3 vacuity audit](a5bde4aa-40cb-41eb-ad50-bc25010d5625) found **2** CLASS-3 candidates; this file records apply + reshape.

## Applied

| Ticket | Was | Action |
| --- | --- | --- |
| **TAL-01798** | CLASS-3 (CLOSED by TF in another layout; single-chart lifecycle gate) | Reshaped: `TAL-01798 CONF-01: peer-panel TF change does not close host open` in `order-lifecycle-event-ownership.test.mjs` (± homepage). Kill makes peer claim return true → suite RED. Status remains **`fixed`**. |
| **PO pending SL/TP resurrect** | CLASS-3 (peer rebroadcast; emit-mock only) | Reshaped earlier: host EURUSD → peer GBPUSD adopt cleared protection cell in `order-pending-protection-clear.test.mjs`. Status remains **`fixed`**. |

Rayan #2 / #8: **not** CLASS-3 (CONF-01 multi/cross-symbol + RED-first proven).

## CLASS-3 remaining among `fixed`

**0** after reshape of the two money/identity rows above.

## Mechanical count

Re-run after ledger edits:

```
node scripts/ledger-status-count.mjs
```
