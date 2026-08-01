# RULING — D's four hours are uncommitted in C's checkout; recovery procedure

**Director · 2026-07-30 11:40 · binding on D, C, B**

## The situation

D has been working productively for four hours and **git shows nothing since 22:49
last night**, because D is editing in the **shared main workspace**
(`full-talaria-log--main`), which is checked out on **`manager-c/verification-infra`**.

Its own worktree (`talaria1/manager-d-trade`, on `manager-d/trade-correctness`) was last
touched at **07:59**. The main workspace copies were touched at **10:52** and **11:06**.
**The current work is in C's checkout and the worktree is three hours stale.** Work is
split across two locations and neither is complete.

Nothing is lost. But nothing is shippable either: B's train cannot see it, the canary
build cannot contain it, and if D commits where it is standing it lands on C's branch
for the second time in two days.

## Why this is a Director failure before it is D's

D was given a worktree after the first incident and no mechanism was added to make
working in the wrong one *impossible* or even *noticeable*. The Director then read
`git log`, saw silence, and twice reported to the PO that D was stopped. **D was
producing throughout and the reporting instrument was wrong.** A manager's activity is
not measured by its branch tip when its branch tip is not where it is typing.

## Recovery — D executes, in this order, and does not improvise

**Do not commit in `full-talaria-log--main`. Not once, not for safety.** That workspace
is on C's branch and holds ~797 unrelated dirty files.

1. **Inventory.** In the main workspace, list every changed file under D's territory
   (`order-manager.js` and its `homepage/public` mirror, `order-pending-*`,
   `m24-order-id-*`, `docs/plan3/journal-D.md`, `docs/plan3/CANARY-UNVERIFIED-TRIAGE-20260730.md`,
   `docs/plan3/TICKET-STATUS-LEDGER-20260729.md`, `docs/plan3/PO-BAND1-*`). Confirm each
   is D-owned per `TERRITORY.yml` before touching it.
2. **Reconcile the split.** The worktree also holds 07:59-era edits to
   `TICKET-STATUS-LEDGER`, `PO-BAND1` and the multi-TP test that the main workspace may
   not have. Newest-wins is *not* automatically correct here — read both and merge by
   content, not by timestamp.
3. **Copy into the worktree**, commit there on `manager-d/trade-correctness`, in scoped
   commits with the usual `Manager: D` trailer.
4. **Verify the commit is complete** — diff the worktree tree against the main-workspace
   files and confirm zero remaining difference across D's paths.
5. **Only then** clean D's paths out of the main workspace, path-scoped, so C's
   checkout does not carry them. If any of those files contains an edit that is not
   D's, stop and escalate rather than discarding it.
6. **Tell B the branch is ready** so the work reaches a build.

## Standing rule — WORK-01

**A manager works only in its own worktree. A manager that finds itself in a checkout
whose branch is not its own stops and relocates before making another edit.**

And the corollary that would have caught this four hours ago:

**Every manager heartbeat states the absolute path of the checkout it is working in and
the branch that checkout is on.** A heartbeat that reports progress without stating
where the bytes landed is not a heartbeat. The Director stops inferring liveness from
`git log` alone.

## What D's four hours actually produced, so it is on the record

Order-line edge visibility, stable label and hover, M24 restore identity — all green.
The pending SL/TP resurrect-after-re-drag defect fixed behind
`__TALARIA_DISABLE_ORDER_PENDING_PROTECTION_CLEAR_V1`, after D **rejected its own first
approach on TOP review** and rewrote it to emit cleared pending snapshots through
`_emitPendingMirrorSync()` for every cleared record. A new RED test for M24 restore
stability — which is the exact defect the PO caught when a trade ID changed from #5 to
#942, and which a green allocator gate had missed. And
`CANARY-UNVERIFIED-TRIAGE-20260730.md`, the triage of the 102 unverified rows that I
asked for at 10:40 and that everything else in the ticket lane is waiting on.

That is a strong four hours. The only thing wrong with it is its address.
