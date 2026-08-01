# E Kill Roster LAG-3 / LIFE-2 / PROC-2

**2026-08-01** · Manager E · packet `E-KILL-ROSTER-ROUND-ONE-V1`

## Verdict

`GREEN` locally for E's round-one kill-roster work:

- `LAG-3`: `_m19iB62WindowFp` memoizes the repeated same-window fingerprint
  behind `__TALARIA_INDICATOR_FP_MEMO_V1`.
- `LIFE-2`: indicator worker singleton terminates on cycle close behind
  `__TALARIA_WORKER_TERMINATE_V1`.
- `PROC-2`: trade resolver wiring gate now has a named binding check that fails
  when resolver presence is not bound to a caller.

## Repricing

C's 09:45 finding moves `LAG-3` to the front of E's queue: in zero-trade traces
`_m19iB62WindowFp` is the largest sampled self-time item, at `28.0%` and
`280.1 ms/s`, while marker lookup is absent. The roster's deployed
`chart-indicators-full.js:10526` coordinate is not a working-tree coordinate;
the row must be located by symbol.

`scripts/roster-line-check.mjs` run from E's worktree reported:

- citations resolving locally: `1 of 6`
- symbols present locally: `6 of 6`
- `LAG-3` deployed line `10526` maps to comment text locally; the symbol is
  present in the tree.

## Product Change

`_m19iB62WindowFp` in `chart-indicators-full.js` now has a WeakMap memo keyed
by data-array window identity plus the current tail endpoint. The expensive
window pass remains available with the switch off; with
`__TALARIA_INDICATOR_FP_MEMO_V1 === true`, repeated renders of the same window
reuse the fingerprint.

The worker singleton now has a switch-gated teardown path. When
`__TALARIA_WORKER_TERMINATE_V1 === true`, `pagehide` or `beforeunload` rejects
pending worker jobs, clears the singleton, and calls `.terminate()`.

The trade-attribution oracle now emits:

- `TRADE-RESOLVER-PRESENT-AND-BOUND`
- `TRADE-RESOLVER-PRESENT-BUT-UNBOUND-RED`

## Gate

Tracked oracle:

- `docs/plan3/oracles/m19i-b62-window-fp-regime-v1.mjs`
- `npm run preflight:m19i-b62-window-fp-regime`
- `npm run test:m19i-b62-window-fp-regime`
- `docs/plan3/oracles/trade-attribution-correctness-v1.mjs`
- `npm run preflight:trade-attribution-correctness`

Configuration stamps:

- Zero-trade arm: `barCount=625`, `tradeCount=0`, `cadenceHz=60`, unit
  `milliseconds`.
- Trade-heavy arm: `barCount=625`, `tradeCount=43`, real `OrderManager`
  prototype installed on `chart.orderManager`, unit `milliseconds`.

Latest local run:

- Zero-trade: memo off `45.7297 ms`, memo on `0.0697 ms`, ratio `0.0015`.
- Trade-heavy: memo off `41.1145 ms`, memo on `0.0660 ms`, ratio `0.0016`.
- No-regression cells: first fingerprint matches switch-off, repeat memo hits
  are stable, switch-off still detects middle-volume mutation, outside-tail
  mutation stays outside the tail window, endpoint changes invalidate memo.
- LIFE-2: VM harness created one worker, fired `pagehide`, observed
  `terminated=true` and singleton cleared.
- PROC-2: current E tree is still `RESOLVER_ABSENT_FROM_TREE`, and the
  synthetic `TRADE-RESOLVER-PRESENT-BUT-UNBOUND-RED` arm is `GREEN` because the
  named binding check fails with `RESOLVER_PRESENT_BUT_UNCALLED`.

## Limitation

These are Node/VM gates over exact extracted product helpers plus static product
surface checks. They are not review, seal, deploy, badge, or soak evidence.
