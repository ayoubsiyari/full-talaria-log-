# Director audit — ticket backlog reality check (2026-07-29 13:00)

Performed personally by the Director, as owed to the PO. Method: the 2026-07-27 intake inventory
(`TICKETS-INTAKE-20260727.md`, 124 distinct tickets TAL-01617…TAL-01941 plus Rayan's 11) checked
against commit history on all branches since 2026-07-26, and against the closure record in
`docs/plan3` (464 documents).

## Headline

**I cannot tell you how many tickets are resolved, and neither can anyone else on this team.**
There is no ticket-status ledger. The 124 tickets were normalized and mapped onto mechanisms M1–M24
on 27 July and were never tracked to closure after that. A search for closure declarations across
all 464 Plan 3 documents returns 37 scattered prose mentions covering 13 mechanisms. That is not
tracking; that is anecdote.

This finding outranks the counts below, because it means every previous statement about backlog
health — including any assurance I gave that canary would receive a fully resolved chart — rested
on nothing.

## What the intake itself said, and why it matters now

The intake recorded that all 100 testers were on the OLD production website `talaria-log.com`,
a pre-Plan-3 surface. Only Ninja and Ibrahim moved to the new build on 26 July. The intake's own
conclusion was that most of the 124 rows are **expected to close by PO visual re-check on the
current accepted build, not by engineering.**

That re-check was specified on 27 July. **It has never been run.** It is the only instrument that
would convert the backlog from unknown to known, and it is cheap — it is PO screen time, not
engineering time. Two days of capacity went past it.

## Confirmed zero-work items

Verified by commit-history search on all branches since 26 July, each under four independent naming
variants (mechanism id, ticket ids, and symptom phrasing) to guard against a false negative from
scope-name drift:

| Item | Severity | Reports | Implementation commits |
|---|---|---|---|
| **M23 — replay rollback does not cancel executed trades** | P0 | 6 → 1 | **0** |
| **M24 — trade registration / ledger integrity** | P0 | 10 → 1 | **0** |
| **M17-DI2 — completed-bar close mutation** | self-declared CANARY BLOCKER | TAL-01918 | **0** |
| **M14 — Fibonacci settings do not apply** | P1 | 4 independent reporters | **0** |

M23 and M24 are the two mechanisms in the entire intake that describe **users losing trades**:
rollback silently reactivating a cancelled order at the wrong location, and executed trades never
reaching the journal. They are the same damage class as the trade-loss hydration defect that we
treated as an emergency and hotfixed within hours. These two have had two days and no work.

M14 is the highest-confidence recurrence in the whole intake — four independent reporters — and is
small, self-contained, and unrelated to any file the leak hunt touches.

## Identifier collision — a real governance defect

Commit scopes `fix(m23)` and `test(m24)` exist and are numerous, but they do **not** refer to the
intake's M23 and M24. In commits, `m23` denotes host-commit listener teardown (memory) and `m24`
denotes idle CPU profiling. The intake defines M23 as replay rollback trade-state and M24 as trade
ledger integrity.

Consequence: anyone reading commit history — including me, an hour ago — would conclude these P0
mechanisms were being actively worked. They are not. **A status report built from commit scopes
would have been confidently wrong.** Promote `ID-01`: a mechanism identifier is allocated once and
never reused; a commit scope that reuses a live identifier is a defect and is renamed on sight.

## Where capacity actually went

808 commits since 26 July, essentially all of them on the lag / memory / CPU / deployment /
verification-infrastructure axis. That work is real and much of it is good — indicator lag is
confirmed dead by PO validation on b82, and the trade-loss hydration defect is fixed and live.
But it means the functional backlog has been frozen since 24 July while three managers worked one
axis.

I own this allocation. Every dispatch I wrote for two days pointed at the same axis.

## The other canary blocker

`session-calendar` has real work (21 commits) but the record shows it **blocked on server
territory**, with M2 reopened on PO ground truth after a post-merge green was withdrawn. It is not
closed and it is not close to closed.

## What this means for the canary question

The PO asked directly whether canary users will get a fully solved chart — no lag, no leak, all
tickets resolved. The honest answer, which I should have given when asked:

- **No lag** — largely true for indicator lag, confirmed by PO validation on b82. Smoothness
  (FIX 1) is authored but held, not merged.
- **No leak** — not yet true. Bounded and quantified at roughly 50 MB per multichart cycle, five
  suspects now being killed in parallel.
- **All tickets resolved** — **unknown, and demonstrably not true for at least four items**, two of
  which are P0 trade-correctness and one of which is a self-declared canary blocker.

## Director's orders arising

1. **PO visual re-check is now the highest-value action available and costs no engineering time.**
   I will produce a scripted pass over the 16 intake clusters against b82 so the PO can convert
   unknown to known in one sitting. Until it runs, the backlog number stays honestly unknown.
2. **M14 (Fibonacci) starts now.** It is small, four-reporter-confirmed, and touches nothing the
   leak hunt owns. There is no capacity argument for leaving it.
3. **M23 and M24 are re-dispatched as P0** alongside the leak, not behind it. Trade loss is the
   damage class we already agreed outranks performance.
4. **M17-DI2 keeps its canary-blocker label or loses it by PO decision — not by neglect.** A
   blocker that no one is working is either not a blocker or the plan is wrong. I will not let it
   sit in the third state.
5. **`ID-01` is binding immediately** (identifier reuse), and a single ticket-status ledger becomes
   the one authority for backlog claims. No more counting from prose.

## Correction to the record

Any earlier statement I made implying the backlog was broadly handled was unfounded. I did not
audit it before saying so. This document is the first actual audit.
