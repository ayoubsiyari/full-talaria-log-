# RULING — PO is offline overnight; all PO-facing work batches into one morning pack

**Director · 2026-07-29 22:00 · binding on A, B, C, D**

## The fact

The PO is offline from 22:00 until morning. This is a PO fact, not a Director
inference, and it is recorded here so no manager infers otherwise from silence
(SCOPE-01 applies to availability the same way it applies to deploy target).

## What this changes

**Nothing blocks on the PO overnight.** A packet whose only remaining step is a PO
observation is not blocked — it is DONE-PENDING-PO. Say so, record the exact
observation needed, and move to the next item. A manager idling overnight because
it wants a PO answer has misread this ruling.

**No manager sends the PO anything directly.** Every PO-facing request is written
into the morning pack and nowhere else. The PO's screen time is the scarcest
resource in this plan and it is spent in one batched session, not in interruptions.

## The morning pack — D owns assembly

`docs/plan3/PO-MORNING-PACK-20260730.md`, assembled by D, one file, ordered by
value-per-minute of PO time. Each entry states: what to click, what a pass looks
like in the PO's own words, and what it decides. Anything that cannot state what it
decides does not go in the pack.

Ordering is fixed:

1. Anything that is a canary go/no-go input.
2. Verification of fixes that landed overnight.
3. Instrumentation runs that unblock a stalled ruling.
4. Everything else.

Managers submit entries to D. D may reject an entry as unclear and say why; that is
the same standard D already applies to its own check scripts.

## PO-01 — a build the PO cannot open is not a deliverable

B ships a build overnight and verifies it over HTTP the way a browser sees it, per
MEAS-01, before the pack claims anything is testable. The pack states the build
stamp the PO should read on screen. If the stamp the PO reads does not match the
stamp in the pack, the session stops and nothing measured that morning counts —
we lost an evening to exactly that on b85.

## Overnight deploy discipline

DEPLOY-02 stands and is tightened while the PO is away: the live wire moves for a
shipped build, and for nothing else. No grading, pinning or rehearsal operation
displaces it. C's grading lane stays on `:3001`. The wire the PO opens in the
morning must be the wire the pack describes.

## Standing overnight priorities

- **A** — COVER-LOOP-SAFETY to close, then M17-DI2 (canary blocker, RED gate
  supplied by D), then its share of the four CPU cuts after the ownership check.
- **B** — build and deploy the train containing D's merged work; answer M24 with a
  commit and a gate or with a named blocker; take whichever CPU cuts land in its
  territory.
- **C** — which peer realm survives teardown. One thing, nothing else.
- **D** — rebase onto the train rather than running parallel (B's proposal,
  accepted); extend the ledger across the full intake; assemble the morning pack.

---

## RESCINDED 2026-07-29 22:05 — PO is available for approximately five hours

The PO is not offline. This ruling is withdrawn in full except for two clauses
that were good regardless of PO availability and are hereby promoted to stand on
their own:

- **PO-01 stands.** A build the PO cannot open is not a deliverable. B verifies
  over HTTP per MEAS-01 and the pack states the stamp the PO should read on
  screen. Mismatch voids the session.
- **DEPLOY-02 tightening stands.** The live wire moves for a shipped build and
  nothing else while the PO is measuring. C grades on `:3001`.

The morning pack is cancelled. PO-facing requests go to the Director as they
become ready, and the Director spends the PO's time.

**Priority set by the PO at 22:05, in order: A and C, then B.** The memory kill is
the objective for this session. C names which peer realm survives teardown; A cuts
it. B builds and deploys in parallel because a build costs A and C nothing, but B
does not get Director attention ahead of the memory work. The four CPU cuts are
explicitly allowed to slip.
