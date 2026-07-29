# Manager D TOP Review Requeue

Date: 2026-07-29
Author audit: tier=audit model=gpt-5.5

## Rule

TIER-01: orders, positions, balance, SL/TP execution, and trade journal packets require tier=top reviewer acceptance before canary. RED/GREEN gates still stand, but a packet without recorded TOP ACCEPT is not canary-ready.

## API Fallback Window Finding

I found no explicit `API fallback window` marker in `docs/plan3` or the available prior transcript. During the restored-routing resume window, no money-path packet was accepted under fallback routing: timezone was non-money-path, and TAL-01697 live-recalc remained uncommitted until tier=top model=claude-opus-5-thinking-high accepted it.

## TOP ACCEPT Recorded

- `231df7bb5` — `cluster-g: feed provisional tp sl drag into panel pnl` — tier=top reviewer model=claude-opus-5-thinking-high result=ACCEPT recorded in `docs/plan3/journal-D.md`.

## Re-review Before Canary

These money-path commits have RED/GREEN evidence but no recorded tier=top reviewer ACCEPT in `journal-D.md`:

- `b21d236d3` — M24 restored order IDs / ledger integrity.
- `f1ddb2e64` — M24 split order IDs / ledger integrity.
- `b3f6cd6de` — one-tick entries classify as pending orders.
- `5f3e68368` — stale draft SL/TP level reset.
- `a8d887db1` — single TP remains executable after trailing SL crosses it.
- `7a2871f24` — realized balance floor.
- `864c2446c` — exact pending TP teardown selectors.
- `c0a0d7620` — close restore and drag regressions.
- `e9d9f7594` — spread exit marker projection.
- `379394fc0` — risk size recalculation after SL commit.
- `b1196e79c` — breakeven trigger place anchor.
- `adaffe58e` — late entry screenshot retained in trade journal.
- `93c842bc8` — SL trigger diagnostics only; TAL-01941 remains instrumentation, not a speculative fill fix.

## TOP Re-review Result — 2026-07-29

Reviewer: tier=top model=claude-opus-5-thinking-high. Repo `manager-d-trade` at `3fae85648`; clean tree; no edits.

Result: **QUEUE CLEAR — 13/13 ACCEPT, 0 REJECT.** All listed money-path commits are canary-ready under TIER-01.

Accepted:

- `b21d236d3` — M24 restored order IDs / ledger integrity.
- `f1ddb2e64` — M24 split order IDs / ledger integrity.
- `b3f6cd6de` — one-tick entries classify as pending orders.
- `5f3e68368` — stale draft SL/TP level reset.
- `a8d887db1` — single TP remains executable after trailing SL crosses it.
- `7a2871f24` — realized balance floor.
- `864c2446c` — exact pending TP teardown selectors.
- `c0a0d7620` — close restore and drag regressions.
- `e9d9f7594` — spread exit marker projection.
- `379394fc0` — risk size recalculation after SL commit.
- `b1196e79c` — breakeven trigger place anchor.
- `adaffe58e` — late entry screenshot retained in trade journal.
- `93c842bc8` — SL trigger diagnostics only; instrumentation verified not to change execution branch selection.

Reviewer verification summary:

- Per-commit diff read of money-path logic and RED/GREEN re-execution at HEAD in both mirrors where applicable.
- Mirror byte-parity verified for every touched canonical/homepage module.
- Canonical module sweep at HEAD: all queue-relevant tests pass. Five unrelated/pre-existing module test failures remain outside this queue (`m20-q4-trail-sl-path-cap.red`, `m21-2-candle-offscreen-scaffold`, `m19i-b62-exact-tail-red`, `m20-a1-screenshot-idb.green`, and designed-RED `m20-a-timezone-listener-api.red`).

Residuals, not blocking canary:

- `c0a0d7620` broke an out-of-scope M20-A sha256 pin for `timezone-manager.js`; route to M20-A owner for re-pin/re-review. Non-money-path and no effect on order execution.
- `c0a0d7620` is broad; future money-path packets should avoid carrying unrelated files.
- `b3f6cd6de` has RED asymmetry: `order-entry-aggregates.mjs` has process-env RED coverage, while the duplicated `order-manager.js` classifier RED arm is window-switch only. Recommend one live smoke check that clicking exactly on the live price line still classifies as `market` on a 5-decimal instrument.

## Not Money-path Re-review Queue

- `42d01a1dc` — M14 Fibonacci drawing levels.
- `6ad9f48ec` — pinned tool preferences.
- `ed2a183f3` — timezone bridge CST override fix.
