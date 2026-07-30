# RULING — The wire audit is not yet GATE-01. Two rows must make the freeze build. Both money rows are the weakest.

**Date:** 2026-07-30 16:05
**Verified at:** `manager-d/trade-correctness` tip `147fa8e5f`
**Evidence:** `docs/plan3/WIRE-AUDIT-FIXED-20260730b113.json`
(schema `talaria.wire-audit-fixed.v1`, 50 results, machine-produced)

---

## 1. The accurate breakdown

D's heartbeat led with "43 / 50 strictly on the wire" and named four exceptions. The
JSON accounts for all fifty and the arithmetic is clean:

| Verdict | Count | Rows |
|---|---:|---|
| `on-wire` | **43** | — |
| `on-wire-weak` | 3 | TAL-01895, TAL-01792, **Rayan #2** |
| `partial` | 1 | **Rayan #8** |
| `off-wire` | 2 | **TAL-01896**, **TAL-01807b** |
| `backend-static-unverifiable` | 1 | M24 / TAL-01926 |

43 + 3 + 1 + 2 + 1 = 50.

**Correction to my own framing.** I opened by reading this as "seven rows not on the
wire." That is wrong and pessimistic: 46 of 50 have at least some wire evidence, two are
genuinely absent, one is partial, one needs a different method. The honest headline is
**two rows missing and four rows insufficiently proven**, not seven missing.

D built this in under half an hour, mechanically, with an artifact. It is exactly what
`TEST-01` asked for.

---

## 2. The finding that matters most: both money rows are the least proven

Of the four rows with weak or partial proof, **two are the money-path rows I escalated
at 13:45**:

- **Rayan #2** (vanished order) — `on-wire-weak`, "weak/structural markers only"
- **Rayan #8** (self-opening sell order) — `partial`, "some markers present, some absent"

The two rows where a defect costs a user real money are the two rows where we cannot
demonstrate the fix is running. That is not a coincidence worth shrugging at; money-path
fixes tend to be behavioural rather than textual, which makes them exactly the fixes a
static marker search struggles to see. The audit's weakness is correlated with the
stakes.

---

## 3. The wire audit is not yet GATE-01, and D will recognise the disease

D spent today proving that a test which passes with the fix reversed is not a test. The
wire audit has the same defect one level up.

"Weak/structural markers only" means the script found something *shaped* like the fix. It
does not establish that the marker would be **absent** if the fix were reversed. A marker
present in both the fixed and unfixed bytes is not a marker — it is decoration, and a
wire audit built on it reports GREEN on a build that does not contain the fix. Which is
the precise failure `TEST-01` exists to prevent.

### `TEST-02` (new, binding)

> A wire marker must be **discriminating**: it must be provably absent from a build that
> predates the fix. A marker that reads present on the pre-fix bytes is vacuous and the
> row it certifies is `wire-unproven`, not `on-wire`.

**This is cheap to satisfy and we already have the inputs.** `CKPT-01` requires retained
deployable artifacts of prior builds. Run the identical audit against a build predating
each fix — b103 serves for most, the checkpoint artifacts for the rest. Every marker that
reads "present" on the pre-fix build is thrown out and rewritten. Same discipline D
applied to the fifty gates, applied now to the fifty markers.

I expect this to demote some of the 43. That is the correct outcome and it is better to
learn it tonight than at 06:00 on Saturday.

---

## 4. `TAL-01896`: "off-wire" and "unfindable" are different claims

D's heartbeat says TAL-01896 is "duration-norm not on a fetchable module." The JSON
classifies it `off-wire` with no detail.

Those are two different statements. "The marker is not reachable by my method" and "the
code is not deployed" have different remedies, and TAL-01896 is one of the thirteen rows
D repaired *today* — so the fix being absent from b113 is entirely plausible on timing
grounds alone. Choosing the pessimistic classification was right as a default. It still
has to be resolved to one or the other, because the remedy differs: a build, or a better
audit method.

---

## 5. The backend blind spot, which is a class and not a row

M24 / TAL-01926 is `backend-static-unverifiable` — the fix is Python, not served
JavaScript, so a static scan of delivered bytes cannot see it. Correctly classified.

But the exposure is larger than one row. Any fix with a backend half is invisible to this
method, and a row can read `on-wire` on the strength of its JavaScript marker while its
server-side counterpart is not deployed. The journal-prune guard and the trade-loss
hydration path are both of this shape, and the trade-loss path is the one that was
deleting user history.

**Backend rows need a live API probe, not a byte scan.** Assigned in §6.

---

## 6. Routing — these two rows must be in the freeze build

This is my routing debt and I am discharging it, not dispatching it as a question.

**To B, folded into the next train assembly (not a separate interrupt):**

- **TAL-01896** and **TAL-01807b** ship in the next build. Both are `off-wire` today.
- **Rayan #8**'s absent markers — the gap and place-audit markers — ship in the same
  build. A partially deployed money-path fix is worse than an undeployed one, because it
  reads as present.
- **Freeze condition:** the Saturday freeze build does not assemble until the wire audit
  reads clean on every money-path row. That is now a freeze gate, alongside C's duration
  run.

**To D:**

1. **`TEST-02` retrofit** — re-run the audit against pre-fix builds, throw out every
   non-discriminating marker, republish. Highest priority; it may change the number.
2. **Rayan #2 and Rayan #8 first**, before the other forty-eight. Behavioural markers,
   not structural ones — if a textual marker cannot discriminate, use a runtime probe
   that observes the fixed behaviour on the live page.
3. **Resolve TAL-01896** to either "needs a build" or "needs a better marker." One or the
   other, named.
4. **Backend probe method** for TAL-01926 and any row with a server-side half — a live
   API call whose response differs with and without the fix. Coordinate with B for the
   endpoint, do not wait for B to write it.
5. **The `TEST-01` packs are right to skip #8 / 01807b / 01896 on b113 — and must not
   skip them on Saturday.** Carry a skip register that fails loudly if any row is still
   skipped at freeze. A silently skipped money row on Saturday is the worst outcome
   available to us, because it looks like a pass.

**Unchanged:** D does not wait on B for any of this.

---

## 7. What this says about the 56% figure

I published "83 of 148 genuinely closed" at 15:40. That figure counted 50 fixed rows
without asking whether they were deployed. The honest version is that **fixed** and
**fixed and demonstrably running** are different columns, and until `TEST-02` completes I
do not know the second number. It is at least 43 and at most 50.

The ledger gains a column. Any future percentage I quote uses the deployed one.
