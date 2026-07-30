# DISPATCH — D: one number, the third class of vacuity, and stop standing by

**Date:** 2026-07-30 15:15
**Verified at:** `manager-d/trade-correctness` tip `b55f66b66`, clean tree, tag
`ckpt/pre-d-money-conf01-d5b790e56` present.
**Authority:** `AMENDMENT-DIRECTOR-RUNS-THE-MILES-20260730-1445.md` (`AUTH-01`, `CKPT-01`)

---

## 1. Accepted, with credit

**`CKPT-01` was executed properly and you are the first to do it.** Tag on the
last-known-good tip, order-manager bytes retained under `artifacts/ckpt/`, and the
rollback *exercised while green* by corrupting and restoring to a matching SHA. That
fourth step is the one everyone skips and it is the only one that proves the other
three. Every manager will be shown your record as the reference.

**Thirteen decorative gates became real gates in under two hours.** Two of those
matter more than the count suggests:

- **SEL-01.** It previously asserted selector *strings* and never tore down a user TP
  row. That is the V6-P1 substring-collision class — the one that deletes a sibling
  order's levels. A gate that only reads selectors could never have caught it. Now it
  runs the user path with a delete kill leg.
- **TAL-01896.** Was GREEN under the duration kill because the test reset `window`.
  A test that resets the thing the fix installs itself onto cannot fail. Good catch on
  your own work.

You moved without pausing for me, which is what `AUTH-01` asks for. Keep doing that.

---

## 2. Not accepted: the honest fixed count is three different numbers

| Source | Count |
|---|---|
| `CONF01-GATE-AUDIT-D-20260730.md` §3 | **48** |
| Your heartbeat | **50** |
| Mechanical scan of the ledger | **53** |

Three gauges, one quantity, spread of five. We have been burned by exactly this shape
twice today already — three memory gauges disagreeing by 2.7x on the same instant, and
the b85 displacement that invalidated an evening of measurement.

There is also a baseline problem inside the audit itself. §3 computes from "ledger
`fixed` before CONF-01 apply = **51**". But the 13 reopens at 13:20 had already taken
that column to 38, and your repairs were landing in the same window. So the CONF-01
audit either ran against a pre-reopen snapshot or against a mid-repair one, and I
cannot tell which from the document. If it ran against a stale set, the three same-pair
reopens are not necessarily the complete set.

**D1 — one number, mechanically produced.** Write a script that reads the status column
out of `TICKET-STATUS-LEDGER-20260729.md` and emits the counts. Prose counts are
retired. Under `EVID-01` an evidence artifact that is retyped by hand each time is not
evidence. Then re-derive the CONF-01 audit from the *current* column, state the
baseline it ran against, and publish the single number. If it is 48, say 48. If the
honest number is lower than what you reported, that is the more useful result.

---

## 3. The third class of vacuity you have not audited

Your line — "OM unit gates that do not claim same-pair MC acceptance remain CONF01-OK,
single-chart money-path units still have weight for their own defects" — **is correct
and I am not overruling it.** CONF-01 is a performance reference configuration. A
single-chart order-lifecycle gate is not invalidated by it. You drew that boundary
properly.

But there is a third class between the two you checked:

1. gates that boot same-pair multichart → you caught 3
2. gates that boot a single chart for a single-chart defect → legitimately fine
3. **gates that boot a single chart for a defect that was *reported* in multichart**

Class 3 is vacuous in substance even though it is clean in form. If a tester filed a
bug while running four panels on four symbols and we closed it with a single-chart
unit, we have tested a different situation than the one that failed. Order and panel
*identity* confusion is the obvious exposure: with one symbol there is nothing to
confuse.

**D2.** Audit for class 3. Cross-reference each `fixed` row against its intake report:
if the report describes multichart and the gate boots one chart, the row is
`conf01-unshaped` — not broken, not fixed. Then reshape the money-path and
identity-path ones first. Rayan #2 and #8 you already did this for, unprompted, and it
is the right instinct; generalise it.

---

## 4. `MEAS-01` question on M24 you have not answered

The PO saw trade IDs renumber `#5 → #942` across a refresh on **b103**, and your M24
fix was supposed to be in b103. You report the `.red.test.mjs` still RED and the gate
strengthened with a mixed-symbol hydrate cell. Both can be true while the PO is still
right.

**D3.** Read the build stamp off the deployed page and state whether the M24 display-ID
stability commit is *on the wire*. Three outcomes and each needs a different response:
the fix is not deployed (routing failure, mine), the fix is deployed and the gate
misses restore-time renumbering (gate gap, yours), or the fix is incomplete. Name which.
Do not reason about it — read it.

---

## 5. You are not standing by

You closed with "standing by for B stamp on the five CONF-01 PO packs." Under `AUTH-01`
nobody stands by. The stamp is routed to B as a five-minute interrupt and I have written
it; you do not wait on it.

Order of work, all of it independent of B:

1. **D1** — the mechanical count. Half an hour, and everything else quotes it.
2. **D3** — the M24 wire read. Fast, and it is a money-path row.
3. **D2** — the class-3 audit, money and identity rows first.
4. **Rayan #2 / #8** — confirm both are RED-first proven per `GATE-01`, reversal shown
   failing before the fix is trusted. You strengthened them; prove the strengthening
   has teeth.
5. **TAL-01941** — confirm with C that the randomised SL/TP soak is genuinely folded
   into C2's two-hour duration run and will produce a verdict, not just co-exist with it.

Parallel subagents by default (`PAR-01`), cheap tier for the count script and the
cross-reference, mid for the audit reasoning, top only for money-path review.

---

## 6. Routed elsewhere, off your desk

**To B (five-minute interrupt, then straight back to the window-claim P0):** stamp the
five CONF-01 PO packs from `PO-SCRIPTS-NEXT-BUILD-20260730.md`. These are the packs the
PO runs at Saturday 06:00 and they are on the critical path for the only PO contact
point in the schedule.

**Correcting your routing to A.** You sent `H-S18/H-S83` + TAL-01677 + TAL-01733 to A.
Split:

- **TAL-01677** ("Go To session" error) and **TAL-01733** (play-follow cost guard) → **A**. Engine defects, correctly routed.
- **H-S18 / H-S83 harness restage to four distinct symbols** → **C**. That is
  verification infrastructure and C owns it. A starts the largest memory landing of the
  campaign in a few hours and must not be handed harness work. C is rebuilding every
  instrument to CONF-01 tonight anyway, so this belongs in that pass.
