# RULING — Three strikes on the wire. And the real denominator is 148, not 51.

**Date:** 2026-07-30 15:40
**Verified at:** `manager-d/trade-correctness` tip `94dcfacc3`, clean.
**Evidence:** `docs/plan3/LEDGER-STATUS-COUNT-20260730.json` (mechanical, schema
`talaria.ledger-status-count.v1`)

---

## 1. The count is 50. My 53 was my own bad instrument.

D produced it mechanically via `scripts/ledger-status-count.mjs` into a JSON artifact.
The 48 was stale arithmetic (`51 − 3`) computed against a pre-repair snapshot, correctly
retired. The 53 was **mine** — a `Select-String` word-frequency count that matched the
word "fixed" in prose. I demanded a mechanical count while quoting a hand-waved one.
`EVID-01` applies to the Director too.

**HONEST_FIXED = 50.** Accepted. D was right and I was the noisy gauge.

---

## 2. Three strikes: a ready fix not being on the wire is now a pattern

D's D3 answer is the most consequential thing in the heartbeat. The M24 display-ID
stability fix (`2cc949399`) was **not on b103** (`153c835e2`). The PO's `#5 → #942`
renumbering was therefore **deploy lag, not a gate gap.** D's gate was sound; the fix
was never in the build under test. It is live on b113.

That is the third instance of the same failure:

| # | What | Cost |
|---|---|---|
| 1 | Countdown guard `684e3e5cb` missed **seven** builds | P0 correctness fix absent for seven builds; my routing failure |
| 2 | Script 2 labelled "TESTABLE ON b99" with fixes absent from b99 | PO tested pre-fix code and reported failures that were not defects |
| 3 | M24 fix `2cc949399` absent from b103 | PO's time spent; a correct gate wrongly suspected |

Three is not bad luck. And the exposure is now acute: under the amended schedule there
is **exactly one PO contact point** — Saturday 06:00 to 14:00, four hours, the five
CONF-01 packs. If those packs run against a build missing fixes, we burn the only
verification window we have and the canary launches unverified or not at all.

### `TEST-01` (new, binding)

> A test pack declares the commits it exercises. Before the PO is called, the pack
> verifies **mechanically** that every declared commit is present on the deployed wire,
> reading the build stamp off the running page (`MEAS-01`). A pack that cannot prove its
> own subject is deployed does not run. "The Director believes it shipped" is not a
> deployment.

Applies immediately to D's five CONF-01 packs and to every acceptance run before freeze.

---

## 3. The real denominator, published

Every progress percentage this campaign has quoted used 51 as the denominator. The
ledger holds **148 rows**.

| State | Count | Meaning |
|---|---:|---|
| `fixed` | **50** | gate exercises the user path and goes RED on reversal |
| `superseded` | 29 | subsumed by another fix; genuinely closed |
| `po-eyes` | **26** | needs the PO's eyes — Saturday's window |
| `owner-blocked` | **20** | **no owner. Director's routing debt.** |
| `needs-info` | **10** | open question; Director's to close |
| `blocked-on-build` | 6 | waiting on a build stamp |
| `verify-gone` | 3 | cannot reproduce |
| `closed-scratched` | 2 | withdrawn |
| `intended` | 1 | working as designed |
| `feature-request` | 1 | not a defect |

Genuinely closed: 50 + 29 + 2 + 1 + 1 = **83 of 148 (56%)**.
Needing the PO on Saturday: **26**.
**Without any resolution path at all: 39** (owner-blocked 20 + needs-info 10 +
blocked-on-build 6 + verify-gone 3).

The 20 and the 10 are both mine, not D's. The owner-blocked column was 13 at 12:40 and
is 20 now — it grew because D keeps finding rows nobody owns while I have not been
routing them. That is a Director failure and §4 addresses it.

---

## 4. The owner-blocked twenty: an honest resource conflict

`OWNER-BLOCKED-ROUTING-20260730-1240.md` routes **all thirteen** original rows to
**A** — and the seven added since are the same shape. A is starting the largest memory
landing of the campaign in a few hours: base-series residency, then compact bar storage,
both oracle-gated on price correctness, both inside `chart.js`.

Handing A twenty correctness rows tonight means the 5.6x does not close. Deferring all
twenty silently means shipping a canary with twenty known-unfixed rows, against the
PO's explicit bar. Neither is acceptable and pretending otherwise is how this campaign
has repeatedly gone wrong.

**The rows split cleanly by mechanism:**

- **Engine-internal, genuinely A's, cannot be moved** — TAL-01865 and TAL-01747
  (symbol/`fileId` persist, one class), TAL-01931 (`replay-system.js` step-forward
  batching), TAL-01936 and TAL-01864 (`chart.js` time-alignment and smart-window),
  M20-A timezone pin. These sit in the files A is already operating on. Six rows.
- **Visual overlay cluster, self-contained** — TAL-01913 (daily-open lines), TAL-01914,
  TAL-01921, TAL-01935 (indicator labels), TAL-01938 (ORB size / session labels), plus
  TAL-01759 and TAL-01799 (multichart layout shell). Drawing and labelling. No price
  data, no memory path, no money path. Seven-plus rows.

**Ruling.** The visual overlay cluster does not belong on A's desk and does not belong
deferred. It wants a **fifth manager, E**, scoped to overlay and label rendering only,
in its own worktree, with a territory that explicitly excludes the `chart.js` data and
storage paths A is rewriting.

**The contention question E answers first, before writing anything:** whether Cluster H
lives in overlay/indicator modules or inside `chart.js` itself. If modules, E runs fully
parallel to A with zero collision. If `chart.js`, E prepares and reviews against A's
post-landing tip and lands serially behind it — the work is still done, just ordered.
E does not discover this by arguing; E reads the files and reports which.

This needs the PO's willingness to run a fifth agent, which is a resource question, not
a product decision. It is not a `AUTH-01` interrupt and I am not treating it as one —
it goes in the next report and I proceed on the assumption of yes.

**A is told explicitly: none of the twenty is yours tonight.** The memory landing is
A's only job until it is graded. The six engine-internal rows queue behind it.

---

## 5. Director's own queue, now, not dispatched

- **The 10 `needs-info` rows.** The PO asked days ago why unknown tickets were still
  unknown and was right to. Ten remain. I answer them from the intake data or scratch
  them with a reason. Mine, tonight, not D's.
- **The 20 owner-blocked**, per §4.
- **The 6 `blocked-on-build`** — confirm these clear on B's next stamp or name what else
  they need.

---

## 6. D's remaining answers, accepted

- **D2, class-3 vacuity: zero remaining.** TAL-01798 reshaped with a peer-TF lifecycle
  cell, GREEN with kill RED; PO pending-clear already had the host→peer adopt cell. The
  class I invented at 15:15 is closed at 15:35.
- **Rayan #2 / #8: RED-first proven.** Matrix all GREEN=0 / RED≠0, and #8's kill fails
  under CONF-01 first — the four-symbol configuration is where it breaks, which is the
  correct shape for an order-identity defect.
- **TAL-01941: D is right and I was loose.** My C2 instruction said "fold the soak into
  the duration run," which permits co-existence. D requires an explicit verdict cell.
  Co-existence is not a verdict. Correction accepted and passed to C.
