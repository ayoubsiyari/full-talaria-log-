# HANDOFF → Manager D: review B's reconciliation of your branch

**From:** Manager B (release manager)
**Date:** 2026-07-29 ~20:10Z
**Branch:** `manager-b/reconcile-d-20260729` (worktree `../b-reconcile-d`)
**You are on call for:** every `order-manager.js` hunk below, plus the one change B
made to one of your money-path cells. Director's instruction: B does not resolve
money-path conflicts alone.

## What was merged

Merge-base `c07defd34` (07-28 19:57). Neither branch contained the other: 297 commits
B, 69 D. Your tip moved twice while B worked (`28d808cb4` → `3fae85648`); both are in.

Seven files conflicted. Four more auto-merged, and those are the ones B read hardest,
because an auto-merge is the half nobody is forced to look at: `preferences-sync.js`,
`drawing-tools-manager.js`, `multichart-prod/harness/serve.mjs`, `package.json`.

## 1. order-manager.js — the two hunks you own the review of

Both conflicts landed in the kill-switch predicate declaration block, canonical and
mirror, and both are purely additive:

| hunk | B's side | your side | resolution |
|---|---|---|---|
| ~line 105 | `_m23RollbackTradeCancelV1Enabled` | *(empty)* | union — keep B's |
| ~line 351 | *(empty)* | six cluster-G predicates through `_orderPairSwitchDraftRebindV1Enabled` | union — keep yours |

Neither side touched the other's logic, so nothing was chosen over anything. After
resolving: zero duplicate function declarations across the file, `node --check` clean,
both families' predicates present, canonical and mirror agree on the merged region.

**What B wants your eyes on specifically:** the rest of that 50,559-line file
auto-merged. B checked for duplicate declarations and ran the suites, but you know
which function bodies your five fixes touched. If any of them share a body with the
M23 rollback-cancel path (`resurrectOpen`, the confirm/cancel path), say so and B will
re-examine that region hunk by hunk.

## 2. B changed one of your cells — read this one closely

`order-lifecycle-event-ownership.test.mjs`, cell *"batched order playback evaluates
every hidden fine step and paints once"*, canonical and mirror.

It was red on B's branch, green on yours, green at the merge-base. Bisect over B's 297
commits named `75263fdd7` (LAG-SETINTERVAL-TICK) as the first bad commit, so it has
been red through b90–b99. Cause: that fix coalesces the tick's single paint onto the
next animation frame, so counting paints synchronously after `_runCandlePlaybackTick()`
sees 0 rather than 1. Your four money-path evaluations still all happen, in order,
inside the tick — only the paint moved.

B's change: `await new Promise((resolve) => setTimeout(resolve, 0))` before the count.

Deliberately NOT asserting `paints === 0` first, even though that would be a stronger
statement: under `__TALARIA_DISABLE_LAG_SETINTERVAL_TICK_V1` the paint is synchronous
again, so a cell that pinned the deferral would hold in one switch position and fail in
the other. The invariant your cell owns — one paint per tick, not four — is preserved
in both positions.

Deferral-vs-dropped is now pinned in B's own gate instead, where it belongs.
`lag-setinterval-tick.test.mjs` had shipped proving the paint *leaves* the interval
handler and never proving it *arrives*; your cell caught that blind spot by accident.
Three cells added: the deferred paint arrives exactly once and does not requeue; a pause
landing between the tick and the frame flushes the owed paint; and a mutant proving that
a pause which skips `_cancelCandlePlaybackPaint({ flush: true })` drops the owed paint
while the playhead has advanced — the "jitter until clicked" shape.

If you think the flush makes your cell weaker rather than more honest, say so and B will
carry your preferred form instead.

## 3. Your writes in B's files — read before taken, as instructed

`preferences-sync.js` / `preferences-init.js` are B's, and the director had not ratified
your writes there. Outcome:

- **ACCEPTED as designed:** `preferServerArrayUnlessEmpty`. An empty cloud response must
  not be read as "the user has no pins". Same failure-direction reasoning as B's own
  B-W16 journal guard. Recorded, not fixed: a deliberate clear-all cannot propagate
  across devices while server-non-empty wins. That is your feature's semantics to
  change, not B's to redesign inside a reconciliation — flag it if you disagree.
- **ACCEPTED unchanged:** `preferences-init.js` save/load wrappers.
- **CHANGED:** the kill-switch read. You wrote `!== true`, so only the boolean `true`
  disables it. Every runbook and bisect script here flips switches with `= 1`, which
  would have left the fix silently ON for an operator who believed it was off. Now
  truthy-disables, matching the family — including your own
  `tradeDurationNormV1Enabled`, which already does it the family way. Pinned in your
  cell: `1, '1', 'true', 'on', {}` disable; `undefined, null, false, 0, ''` leave it ON.

`talaria-design/src/orderManagerTradeRows.js` (your `3fae85648`) is also B's territory
as of the director's grant today. Read and accepted unchanged: `rowNowMs` is in scope at
both new call sites, and the switch already uses the truthy form. `v9ClosedTradeDuration`
dropping `nowMs` for closed rows is right — a closed trade's duration must not be
measured against the wall clock.

## 4. Attribution correction, and where the gate findings actually went

Of the 69 commits B merged from your branch, **45 carry `Manager: C`** and 24 carry no
`Manager` trailer at all — those 24 are yours. So what B merged was mostly C's
verification-infrastructure work riding on your branch, and every gate finding below
belongs to C, not you. They are in
`HANDOFF-C-RECONCILE-GATES-20260729.md`, not here:

- the `module-contracts.json` panel-shell rows that block the chart build (C's
  `da05741f1`, packet W63) — escalated to A for the shell fix, and B will not soften
  C's rows to make the build pass;
- five `real dist-v9 ...` mutation cells failing as *"fixture drifted"*;
- the stale `'20260728b82'` literal in the cache-stamp coverage-hole cell;
- the `Tier:` trailer vocabulary in C's own territory gate.

**Yours to fix, one item:** those 24 commits have no `Manager`, `Row`, `Packet` or
`Tier` trailers, so `territory-preflight.mjs` cannot attribute them. B is not
rewriting your history; please add the trailers going forward, which is the same
correction B accepted for its own commits earlier today.

**Pre-existing, both sides, informational:** `MODULE-CONTENT-STAMP-BASELINE` (sealed
hashes match disk) is red on your tip and B's independently, and needs a reseal after
any module content change — including this merge.

## Acceptance evidence

```
node --test "chart v 1.4/chart/modules/order-*.test.mjs" (36 files)
          + m24-order-id-allocator + m23-rollback-trade-state.red + m23-host-listener-leak
          + pins-user-preferences + lag-setinterval-tick + timezone-persisted-boot-guard
          + talaria-design/src/orderManagerTradeRows
→ tests 100, pass 100, fail 0
```

Baselines taken before resolving, so the numbers mean something: your four money-path
cells 4/4 and your full order suite 54/54 on your tip; B's M23 pair 26/26 on B's tip;
the disputed cell 13/13 at the merge-base.

## Standing request

Neither branch containing the other for 24 hours is what made this expensive. From here
B would like D to rebase onto the train after each reconciliation point rather than
running parallel, so the next merge is a fast-forward. B will publish the train tip each
time it moves.
