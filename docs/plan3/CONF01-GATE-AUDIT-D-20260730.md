# CONF-01 gate audit (Director D) — 2026-07-30

**Binding:** Reference acceptance config is four panels / four **different** symbols / four **different** timeframes / indicators / orders. Same-pair multichart measurements and gates carry **no** acceptance weight under CONF-01.

**Scope:** Every `status=fixed` row in `TICKET-STATUS-LEDGER-20260729.md` at audit time. Applied to ledger in the CONF-01 commit.

---

## 1. Applied reopen (`broken`)

Reason: **`CONF-01: gate same-pair/single-panel vacuous`**

| Ticket | Gate | Why |
| --- | --- | --- |
| TAL-01887 | harness `H-S18` + `H-S83` | `scenarios.mjs` boots `pair: 'same'` 4-panel |
| TAL-01910 | harness `H-S18` + `H-S83` | Same |
| TAL-01939 | harness `H-S18` + `H-S83` | Same |

---

## 2. Strengthened (remain `fixed`)

| Ticket | Change |
| --- | --- |
| Rayan #2 | Teardown gate now asserts EURUSD host + GBPUSD/USDJPY/XAUUSD peers (four distinct symbols); RED kill still fails |
| Rayan #8 | Gap reconcile uses mixed-symbol journal; place-audit blocks EURUSD pending fill on GBPUSD candle |
| TAL-01802 / TAL-01886 | Cross-TF gate keeps same-symbol TF limb; adds XAUUSD peer must not inherit GBPUSD host mark |
| M24 restore (#5→#942) | Mixed-symbol hydrate cell on `m24-order-id-restore-stability.test.mjs`; `.red.test.mjs` still RED |

---

## 3. Honest remaining `fixed` count

| Metric | Count |
| --- | ---: |
| Ledger `fixed` before CONF-01 apply | 51 |
| Reopened (H-S18/H-S83) | 3 |
| **Honest `fixed` after apply** | **48** |

OM unit gates that do not claim same-pair MC acceptance remain CONF01-OK (single-chart money-path units still have weight for their own defects).

---

## 4. Coordination

- **D3:** `NOTE-C-TAL01941-SOAK-INTO-C2-20260730.md` — fold soak into C’s duration run; no second long harness.
- **D5:** `PO-SCRIPTS-NEXT-BUILD-20260730.md` restaged — every pack opens 4sym/4tf first; still AWAITING STAMP.
