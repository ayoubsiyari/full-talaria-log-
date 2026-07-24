# M20 Q8 alert-checker transaction correction

Status: `PENDING-FRESH-GPT-REVIEW`  
Acceptance claimed: no  
Commit / push / deploy / install: none  
Bound working HEAD: `f8ef6a0017b3087070c3e2bc098fc92e3aa10413`

## Provenance

- Immutable quick-kill commit:
  `5cd010bb8649fec301983c6ee964379e8d3be3f7`
- Immutable product SHA-256, both trees:
  `fb17b18698a18605d9051183c7f867abb9cf77b353abb2df0baf34e01825093d`
- Rejected round-1 fixture SHA-256:
  `89ec4e7ba1b9cb13a54c1958c1166e43771d2aebede8a72421024fe45f315bc9`
- Corrected product SHA-256, both trees:
  `76c1c0f365571d32d43358fff90274a2e736c8ee3d3dea21a90e63d1201af95c`
- Corrected product Git blob, both trees:
  `871de0b2dd0964fe1e017bc5ffd8bf060b68b3ed`
- Dedicated test SHA-256, both trees:
  `52518c8ecca2434b2bff4ea9a5e5a61d802349a14e62c50a97d64c44f4484796`
- Combined test SHA-256, both trees:
  `4aec92a5d90bd1d86b9d3872bc1af39253566fa337b75acfb73037153f53aeaa`

The immutable source is loaded directly with `git show`. The rejected
uncommitted source is preserved as a clearly named test fixture, not as a
product shadow. Current product and test mirrors are byte-identical.

## Correction

The existing and only switch remains
`__TALARIA_DISABLE_M20_Q8_ALERT_CHECKER_IDLE_V1`.

Fix-ON installation occurs during the existing init-time checker start. It
adds instance-local transaction methods and an instance-local timer ledger.
Create, delete, clear, toggle, and update snapshot alert collection identity,
entries, property descriptors, and prior timer ownership.

- A mutation primitive that throws is uncommitted. Any partial collection or
  property write is restored and no checker start, stop, or handle replacement
  occurs.
- A completed mutation is reconciled after persistence/UI/notification work,
  including when that work throws. The original operation error object remains
  the outward error.
- A throwing save that partially changes alert state restores the committed
  in-memory mutation shape before reconciliation.
- If reconciliation cannot establish the desired timer ownership, alert state
  and prior checker ownership roll back. Reconciliation/rollback failures are
  sent only to a nonthrowing diagnostic path when an operation error already
  exists.
- Clear retries once. This handles injected clear failures both before and
  after their timer-host effect without losing the original operation error.
- Nonempty-to-nonempty keeps the live checker. Empty-to-nonempty starts once;
  nonempty-to-empty stops once. Secondary owned/untracked handles are cleared
  without replacing the valid primary.

The prototype create/update/delete/toggle/clear methods retain immutable
operation order. With the switch disabled from startup, no fix aliases or
ledger are installed. Full traces match the immutable commit for switch getter
reads and order, return/throw behavior, timer calls, alert/property writes,
side effects, and legacy restart amplification.

## Replay results

Canonical evidence is opt-in and written atomically. A default run was proven
no-write by comparing all three evidence hashes before and after the dual-tree
test.

- RED: 38/38 replay rows. This includes three immutable state/checker
  violations and 22 exact rejected-snapshot binding failures.
- GREEN: 109/109 adversarial rows.
- KILL: 22/22 trace/provenance rows, with intentional `RED` verdict and four
  legacy invariant violations.
- Dual-tree default run: 22 pass, 0 fail, 2 opt-in writer skips.
- Dual-tree arbitrary-working-directory run: 22 pass, 0 fail, 2 skips.
- Canonical combined Q1/Q2/Q8 run: 5 pass, 0 fail, 1 writer skip.
- Syntax: both products, both dedicated tests, both combined tests, and the
  rejected fixture parse cleanly.
- IDE lints: zero findings in the six edited product/test files.

Each product tree independently covers the deterministic before/during/after
fault matrix, set/start failure, clear failure before and after effect,
persistent clear rollback, hostile diagnostics, partial push/splice/property/
save failures, render-failing enable and disable toggles, updates, nested
create/create, delete/create, and toggle/update error propagation, manager
isolation, stale and active untracked handles, and callback fault propagation.

Fifty adds produce one start and zero clears. The 100-cycle lifecycle row per
tree records 103 starts, 103 clears, maximum one active checker, zero stress
callback errors, and zero final timers. Destroy/reinit, repeated reinit, rapid
empty/nonempty mutation, and hidden-document ticks remain covered.

## Root and ignored-artifact disposition

The dedicated Q8 resolver uses four canonical markers, rejects the homepage
shadow root, and passes from both mirrored entrypoints and an arbitrary
working directory.

The shared homepage copy of `m20-q1-q2-q8-idle-drains.test.mjs` still resolves
its second tree beneath `homepage/homepage/public/chart`. Its standalone run
has one pass, four failures, and one skip: Q1, Q2, Q8, and the dependent
switch-discrimination test are affected. Fixing the shared root constants
would alter Q1/Q2-owned lines, so this Q8 correction did not do so. The
canonical combined entrypoint passes.

The prior Q8 report and three evidence files under ignored `docs/` were
removed. The accepting report, evidence, fixture, and manifest are rebuilt
under `chart v 1.4/chart/modules/m20-q8-transaction-packet`, which
`git check-ignore` confirms is normal nonignored scope. This is a commit-ready
packet shape only; no commit claim is made.

## Forbidden-file audit

No Q8 action wrote `chart.js`, replay, order, indicator, timezone, or
favorites products. At packet seal, all six canonical/homepage pairs were
byte-identical. During final audits, a concurrent owner repeatedly changed only
the canonical `replay-system.js` (`7298992d...` → `4f8f7167...` →
`6ab21b9c...`); the homepage replay mirror remained `7298992d...`. Q8
product/test hashes remained stable. The manifest records the observations,
marks this non-Q8 path externally volatile, and does not claim final replay
parity or a durable final hash for that concurrently owned file.

## Evidence hashes

- RED:
  `ad348e22640d8d794d1eacd57fb1109b3b7b962fb69d788b7797aa3a4d6452b9`
- GREEN:
  `29a8e85a24ba0f7112ea059d0fddd2cca5514bd1671ece404c3e028019877c25`
- KILL:
  `11f38d264381a1d8767c1b9c755098e42e37359548811946732b45a2ceef7d23`

## Replay commands

From the repository root:

```powershell
$env:M20_Q8_EVIDENCE='red'
node --test --test-concurrency=1 "chart v 1.4/chart/modules/m20-q8-alert-checker-transaction.test.mjs"
$env:M20_Q8_EVIDENCE='green'
node --test --test-concurrency=1 "chart v 1.4/chart/modules/m20-q8-alert-checker-transaction.test.mjs"
$env:M20_Q8_EVIDENCE='kill'
node --test --test-concurrency=1 "chart v 1.4/chart/modules/m20-q8-alert-checker-transaction.test.mjs"
Remove-Item Env:M20_Q8_EVIDENCE
```

Residual gate: `PENDING-FRESH-GPT-REVIEW`. This report is not self-acceptance.
