# RUN-LOCK-01 — host scope must not be silently declinable

**Raised by:** B, 15:07+01:00 / 2026-08-03T14:07:00Z
**Owner of the fix:** A (RUN-LOCK-01). **B is not editing `scripts/lib/run-lock.mjs`** — three lanes
built three locks this morning by editing in parallel, and that is not being repeated.
**Status:** requirement handed over, not implemented.

---

## 1. The asymmetry, stated once

The three scopes are not three strengths of the same guard. They answer two different questions:

| Scope | Keyed on | Prevents |
|---|---|---|
| `identity` | script name | **a second copy of the same script** |
| `artifact` | output path | **a second writer of the same file** |
| `host` | `MEASUREMENT_HOST`, one per box | **two *different* scripts sharing one machine** |

`identity` and `artifact` stop a script colliding with **itself**. Only `host` stops a script
colliding with **someone else**. A run holding identity and artifact but not host is fully protected
against the one accident that cannot happen and unprotected against the one that keeps happening.

## 2. The defect

`host` is a caller-supplied default, not an invariant:

```js
// scripts/lib/run-lock.mjs:331
export function acquireRunLock({ artifact = null, script = ..., host = true, ... })
```

and it is reachable from the command line:

```js
// scripts/lib/run-lock.mjs:456
host: !argv.includes('--no-host-lock'),
```

So `--no-host-lock` removes cross-script protection from any instrument that uses
`lockFlagsFromArgv()`, which is now all of them. Three consequences:

1. **The refusal states never fire.** `HOST_BUSY_REFUSED` cannot be reached by a run that never
   asked for host scope, so the box admits two different scripts and neither is told.
2. **Nothing records that the run was unprotected.** Artifacts carry `runLock.state`, which reads
   `LOCK_ACQUIRED` for a host-less acquisition. A measurement taken while another script was on the
   box is indistinguishable, after the fact, from one taken alone.
3. **`--allow-concurrent` is a second door to the same room** and needs the same treatment.

## 3. Observed, with evidence

`inspectLocks()` at 14:53:05+01:00 / 2026-08-03T13:53:05Z, during C's arena series:

```
LIVE  artifact   competitor-arena-reference.mjs  pid 25392  started 14:46:24+01:00 / 2026-08-03T13:46:24Z
LIVE  identity   competitor-arena-reference.mjs  pid 25392  started 14:46:24+01:00 / 2026-08-03T13:46:24Z
```

No `host` entry. That is not a partial acquisition and not a partial release: `acquireRunLock` takes
`host` **first** (line 340) and `releaseAll` reverses the held list so `host` is released **last**.
A tree with identity and artifact but no host can therefore only mean host scope was never
requested — i.e. that leg ran with `--no-host-lock`.

**C's script is not at fault and this is not a bug report against C.** `competitor-arena-reference.mjs`
uses `acquireRunLockOrExit` with `lockFlagsFromArgv()` correctly, and their *next* leg (pid 31420,
observed 15:0x+01:00) holds all three scopes. The flag is the defect, not the caller.

## 4. Why this is the seal-relevant one

It is a **silent** loss of a guarantee. Every other lock failure this morning announced itself: a
refusal, a crash, a truncated artifact. This one produces a clean-looking run and a clean-looking
artifact. Under SEAL-EVIDENCE-01 the question is not "did the lock exist" but "what did it observe",
and a host-less run observed nothing about the box it was measuring.

## 5. The requirement

**R1 — Host scope is not declinable without a stated reason.** Remove `--no-host-lock`, or require it
to carry a reason (`--no-host-lock=<why>`) the way the dirty-build waiver was required to. A bare
boolean that removes the only cross-script guarantee is the escape hatch that makes the guarantee
advisory. Same for `--allow-concurrent`.

**R2 — Name the state at acquisition.** A host-less acquisition must not return `LOCK_ACQUIRED`. It
returns something that says so — `HOST_SCOPE_DECLINED` — and prints it, so the operator sees at
launch that the box is unguarded.

**R3 — The artifact records which scopes were actually held.** `scopesHeld: ['identity','artifact']`
plus the declined reason. This is the difference between an artifact that can be audited for
contention and one that cannot. Every instrument already writes `runLock`, so this is a field, not a
redesign.

**R4 — `inspectLocks()` reports the class, so it has a detector.** A live run without a host lock is
its own named state (`RUN_WITHOUT_HOST_SCOPE`) rather than an absence a reader has to notice. This
class had no detector, which is why it survived four incidents.

**R5 — Document the asymmetry where the flags are defined.** Section 1's table, next to
`lockFlagsFromArgv`. The reason `--no-host-lock` looks harmless is that the three scopes read as
three degrees of the same thing.

## 5a. R6 — a lock nobody can discover is not a lock (added 15:52+01:00, from a live incident)

Written after walking onto E's measurement myself, 40 minutes after drafting section 5.

`inspectLocks()` at 15:37+01:00, three minutes into E's 90-minute V8 heap-slope run, returned
**`NO LOCKS AT ALL`**. E's run was in fact guarded — by `.v8-playback-heap-slope.lock`, a private lock
file inside E's own `--outDir`, which `inspectLocks()` does not read because it only walks `.locks`.

So the shared detector reported an idle box during a 90-minute measurement, and I put four node
processes on it. This is not a hypothetical: it is the fifth contention incident of the day and I
caused it while holding the requirement document for the other four open in another window.

**R6 — one detector, or the detector is decorative.** Either the shared lock is the only lock, or
`inspectLocks()` must be able to see the others. A lane's private lock is invisible to every other
lane's pre-flight check, and a "no locks" reading that means "no locks I happen to look at" is worse
than no reading, because it actively licenses the collision. Two lock systems that cannot see each
other are worse than the single accident each was built for.

This also sharpens R4: `RUN_WITHOUT_HOST_SCOPE` should be reachable from evidence on the box —
a live measurement process with no corresponding host lock — rather than only from the lock tree,
which by definition cannot show a run that never registered.

## 6. Related, already handed over

- **`LOCK_DIR` needs an env override** (`TALARIA_RUN_LOCK_DIR`). It is a hard-coded constant, so the
  shared selftest plants a **real** host lock and can refuse a live run. B's two cells now defer with
  `CELL_DEFERRED_BOX_BUSY` naming the holder, which is a mitigation, not the fix. Landed at
  `efc6d96ce`; the override remains A's to take when the queue drains.

## 7. What B is NOT claiming

The PO's reading is that this explains all four contention incidents. B can state the **mechanism**
and that it fits, but has direct evidence for one instance only — the `inspectLocks()` reading in
section 3. Attributing E's lost run, D's two canary processes 53 seconds apart, or the
`12:04+01:00` accident to a declined host scope specifically would require each run's invocation or
its artifact's lock record, and **the artifact does not currently record it** (R3). That absence is
itself the finding: the class cannot be attributed retrospectively, which is the strongest argument
for R3 and R4.
