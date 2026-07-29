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

## Not Money-path Re-review Queue

- `42d01a1dc` — M14 Fibonacci drawing levels.
- `6ad9f48ec` — pinned tool preferences.
- `ed2a183f3` — timezone bridge CST override fix.
