# M20 Q6 full ReplaySystem lifecycle correction

Status: `READY-Q6-PROVENANCE-REVIEW`

This packet supersedes the rejected float-only packet and is not self-acceptance. No commit, push, deploy, install, `chart.js`, Q9, indicator, manager, M19/M21, or bridge edit was performed.

## Binding and source scope

- Current HEAD: `f8ef6a0017b3087070c3e2bc098fc92e3aa10413`
- Exact Q6 commit: `2f0ce7831e2aa74cf86e2263f50b5a023ecab932`
- Exact replay SHA-256: `a8c4b32dac9b86eeeb928450d60d2838d456759d8451629d54ab3c47c029ebfe`
- Immutable Q6 core SHA-256: `12eb6525ff4af6d520ac2abd6f47b294b00320f6d36bb1852760899ebf20d5c6`
- Corrected replay SHA-256, both trees: `e461cff70a92912b3e98919d717d8de3bee543346c374af78ece40ccbab39618`
- Q9 HEAD-added-hunk SHA-256 before/after, both trees: `2c8c950242c87c8c82506f5d17c13107ffb7db6100617ee16666057d3a827b84` (9 blocks)

The complete source/test commit classification is in:

`docs/plan3/evidence/W4-Q6-LIFECYCLE-V2-20260724-MANIFEST.json`

It binds every product/test file to current HEAD or truthfully labels it `WORKTREE_ONLY_UNCOMMITTED`. It explicitly records that report/evidence/manifest files are ignored local artifacts under the repository-wide `docs/` ignore rule. It borrows no Q9 manifest.

## Lifecycle-neighbor provenance correction

The rejected `47 pass / 0 fail / 3 skip` claim was produced by the wrong command selection, not by a Node-version conditional, TAP parser, stale output, or duplicate execution. The prior run used only the canonical tree and combined idle-drain/timezone suites with favorites/order:

```powershell
node --test --test-concurrency=1 "C:\Users\user\Desktop\talaria1\full-talaria-log--main\chart v 1.4\chart\modules\m20-q1-q2-q8-idle-drains.test.mjs" "C:\Users\user\Desktop\talaria1\full-talaria-log--main\chart v 1.4\chart\modules\m20-a-timezone-listener-api.red.test.mjs" "C:\Users\user\Desktop\talaria1\full-talaria-log--main\chart v 1.4\chart\modules\m20-a-favorites-chart-lifecycle.red.test.mjs" "C:\Users\user\Desktop\talaria1\full-talaria-log--main\chart v 1.4\chart\modules\order-lifecycle-event-ownership.test.mjs"
```

That exact wrong selection independently reproduces `50 tests / 47 pass / 0 fail / 3 skip` from `C:\Windows\Temp` under Node `v24.15.0`.

The corrected lifecycle-neighbor commands are:

```powershell
node --test --test-concurrency=1 "C:\Users\user\Desktop\talaria1\full-talaria-log--main\chart v 1.4\chart\modules\m20-a-favorites-chart-lifecycle.red.test.mjs" "C:\Users\user\Desktop\talaria1\full-talaria-log--main\chart v 1.4\chart\modules\m21-w6-fixtures\m21-indicator-lifecycle-census.test.mjs" "C:\Users\user\Desktop\talaria1\full-talaria-log--main\chart v 1.4\chart\modules\order-lifecycle-event-ownership.test.mjs" "C:\Users\user\Desktop\talaria1\full-talaria-log--main\chart v 1.4\chart\modules\indicator-lifecycle-store.test.mjs"
```

Canonical TAP: `26 tests / 25 pass / 0 fail / 1 skip`; skipped row: `lifecycle evidence writer`.

```powershell
node --test --test-concurrency=1 "C:\Users\user\Desktop\talaria1\full-talaria-log--main\homepage\public\chart\modules\m20-a-favorites-chart-lifecycle.red.test.mjs" "C:\Users\user\Desktop\talaria1\full-talaria-log--main\homepage\public\chart\modules\m21-w6-fixtures\m21-indicator-lifecycle-census.test.mjs" "C:\Users\user\Desktop\talaria1\full-talaria-log--main\homepage\public\chart\modules\order-lifecycle-event-ownership.test.mjs" "C:\Users\user\Desktop\talaria1\full-talaria-log--main\homepage\public\chart\modules\indicator-lifecycle-store.test.mjs"
```

Homepage TAP: `26 tests / 25 pass / 0 fail / 1 skip`; skipped row: `lifecycle evidence writer`.

Aggregation sums matching raw TAP fields from the two independent Node processes. Therefore the truthful aggregate is `52 tests / 50 pass / 0 fail / 2 skip`; skips are not counted as passes.

Canonical and homepage command-input files are byte-identical. Full commands, runtime, input hashes, the reproduced wrong-selection summary, matching protected before/after hashes, and aggregation semantics are sealed in:

`docs/plan3/evidence/W4-Q6-LIFECYCLE-V2-20260724-provenance.json`

SHA-256: `5d2ee42c3aa604895d9b58e6f68520093454e7ba74cfe9c983a2658ee4702b8e`

## Exact switch-OFF surface

The immutable class body is the OFF implementation. It has:

- no Q6 lifecycle own fields;
- no lifecycle registry or page hooks;
- no `destroy` or `dispose`;
- no correction-only prototype methods;
- immutable `makeCloneDraggable`, teardown, close, and exit return/throw/order behavior.

Runtime selection inspects the switch data descriptor without invoking an accessor. Accessor-backed diagnostic switches select the immutable runtime, so constructor getter-read count remains zero and later immutable methods retain their exact getter-read trace. A data property equal to `true` selects OFF; absent/`false` selects ON.

OFF evidence executes constructor/method getter reads, own/prototype keys, returns, thrown error identity, listener calls, and side-effect order against the exact commit. Q9's existing exit invalidation remains independently active and byte-intact.

## Full switch-ON lifecycle

ON uses a correction-only runtime subclass and module-private ownership state. It records resources before effectful registration and wraps callbacks so retired/partially constructed instances are inert.

The retry-safe drain covers:

- floating clone `mousedown` plus document `mousemove`/`mouseup` ownership;
- all setup/dynamic DOM, document, and window listeners;
- `DOMContentLoaded`, playback-mode, slider, drag, pick/go-back, clone, follow, scroll, and resize callbacks;
- follow polling interval;
- playback/tick/candle intervals and timeouts;
- deferred play RAFs, timeframe restore, replay-follow RAF/timeout chains, and queued microtasks;
- timezone-manager listener ownership through its existing `removeListener` API;
- play/pause toast dismissal and pinned cut-line ownership;
- floating/pick/go-back DOM resources and toolbar/storage state;
- shared page lifecycle hooks.

Every independent cleanup is attempted. A successful entry is settled once; a failed or uncertain entry remains owned for retry. The outward cleanup error is an `AggregateError` with code `M20_Q6_REPLAY_LIFECYCLE_CLEANUP_FAILED`, per-error cleanup labels, and a census report. When a primary operation already failed, its exact error remains outward and cleanup diagnostics are attached as `m20Q6CleanupError`.

`destroy()` and `dispose()` eventually reach `destroyed`, return the same successful report on duplicate calls, and release `chart.replaySystem` only when it still points to that instance.

## Replacement and page ownership

A module-private WeakMap is keyed by chart. Before a new ON instance performs base construction, it drains the prior registered state. A failed drain aborts replacement, leaves the prior state reachable, and makes retained callbacks inert. A later constructor retries ownership before registering anything new.

The module also installs at most one `pagehide` and one `beforeunload` callback per window while live states exist. Each callback takes a bounded snapshot and attempts every live state. Failures are retained for retry and exposed as:

`window.__TALARIA_M20_Q6_LAST_PAGE_CLEANUP_ERROR__`

OFF installs neither registry nor page callback. No `chart.js` edit is required.

## Constructor transaction

ON publishes construction ownership before the first effectful registration. First, middle, last, and register-then-throw failures immediately drain:

- already installed listeners;
- uncertain current registration;
- timers/RAFs;
- timezone ownership;
- partially installed page hooks.

Cleanup failures remain registry/page owned. Tests prove a later constructor retries the abandoned partial instance before creating a new owner.

## Superseding evidence

- RED: `W4-Q6-LIFECYCLE-V2-20260724-red.json`
  - 23 pass / 14 causal fail
  - verdict `RED-23-14`
  - SHA-256 `d8c20f5be7dc2a7aab8d68be7af31262e06d63699c8770770a8ac69068b5fa90`
- Current: `W4-Q6-LIFECYCLE-V2-20260724-current.json`
  - 37 pass / 0 fail
  - verdict `GREEN`
  - SHA-256 `17ea076917b39cd9082c66677c64c242fc81e7bce6e081c2c8941d4f0dcc0a66`
- Kill: `W4-Q6-LIFECYCLE-V2-20260724-kill.json`
  - 23 applicable exact-parity pass / 0 fail / 14 fix-only rows excluded
  - verdict `GREEN-KILL-EXACT`
  - SHA-256 `f1f7cea5cfb725efd0acf1d3b4f531071952ef389700503424f54d7c48917c51`

Kill evidence does not call legacy divergence a passing fix. Its acceptance contract is exact immutable OFF parity; ON-only rows are explicitly non-applicable.

Evidence is no-write by default. Opt-in writes resolve the canonical repository root, reject shadow destinations, and publish with same-directory temporary file plus atomic rename.

## Tests and gates

- Canonical lifecycle harness: SHA-256 `20dc8e49a58186e59a54c418dcfd684c1c3ec73642a7d3954bd47058672d685d`
- Homepage entrypoint: SHA-256 `5c360a8c7878ab031daf9177fca77c4978e6e4fe43aa2d38edf1fcf66e5e773a`
- Superseded float entrypoints, both trees: SHA-256 `884786a06a1ed62a0f4c555e23f2fb09e58a76bb2f8365cc9f9d29564a4db75a`
- Superseded strong entrypoints, both trees: SHA-256 `0987e4241663fcb73e7d8527d528d6fd58c55ef345e9900fb6888e8518c9ae2b`

Final runs:

- six canonical/homepage Q6 entrypoints: 78 pass / 0 fail;
- protected Q9 gate: 19 pass / 0 fail;
- replay neighbors: 27 pass / 0 fail;
- lifecycle ownership neighbors: 50 pass / 0 fail / 2 intentional evidence-writer skips (`25/0/1` per tree);
- homepage entrypoint from arbitrary system-temp cwd: 13 pass / 0 fail;
- default arbitrary-cwd run changed none of the report, three behavioral evidence files, provenance evidence, or manifest;
- both replay files and all Q6 JavaScript passed syntax checks;
- scoped IDE lint: zero diagnostics;
- scoped `git diff --check`: clean (line-ending notices only).

No unrelated failure is claimed, imported, or waived by this packet.

Provenance correction status: `READY-Q6-PROVENANCE-REVIEW`.
