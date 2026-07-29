# Patch Request: M20-A `timezone-manager.js` Pin Re-review

Owner requested: M20-A owner

## Summary

Manager D TOP re-review of the money-path queue found a non-money-path residual: commit `c0a0d7620` changed `chart v 1.4/chart/modules/timezone-manager.js` and broke an out-of-scope M20-A sha256 pin.

This does not affect order execution and did not block D's money-path queue, but the M20-A gate should not be trusted until it is re-pinned and re-reviewed by its owner.

## Evidence

TOP reviewer finding:

- Pin held at `c0a0d7620^`.
- Pin broke exactly at `c0a0d7620`.
- Later timezone work did not introduce the pin break.
- Affected gate: `m20-a-timezone-listener-api.red.test.mjs`.

## Ask

Please re-pin `timezone-manager.js` for M20-A, re-run the relevant M20-A gate, and record a fresh owner review.

Manager D is not taking this packet because it is non-money-path and outside the current on-call role.
