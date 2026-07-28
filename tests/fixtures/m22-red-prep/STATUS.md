# M22 deferred RED-prep fixtures

Owner decision: `defer-all` (2026-07-26).

These H-S6 and H-S78B artifacts are planning/test fixtures only. They are
outside both deploy-mirrored module trees and must not be copied into either
`chart v 1.4/chart/modules` or `homepage/public/chart/modules`.

- H-S6 remains RED prep. A passing meta-test only confirms the expected RED
  product signature; it is not acceptance.
- H-S78B remains RED/failing. A passing meta-test only confirms the expected
  RED product signature; it is not acceptance.
- No M22 homepage mirror is permitted while these lanes are deferred.
- The captured H-S78B runner output was removed because it contained absolute
  local paths and represented a failed syntax run, not acceptance evidence.

Run the retained meta-tests from the repository root:

```sh
node --test --test-concurrency=1 tests/fixtures/m22-red-prep/m22-hs6-owner-fetch.red.test.mjs
node --test --test-concurrency=1 tests/fixtures/m22-red-prep/m22-hs78b-play-pan-optout.red.test.mjs
```

The M20-Q1/Q2 RED-prep artifacts were not retained. All six canonical files and
their six homepage mirrors were untracked candidate-worktree files and were
removed under the same `defer-all` decision.
