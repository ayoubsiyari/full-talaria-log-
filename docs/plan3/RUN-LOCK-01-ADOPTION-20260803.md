# RUN-LOCK-01 — adoption note for every Chrome-launching run

**Status:** single implementation per the 12:58 ruling. B and E retire local locks and adopt this one.
**Module:** `scripts/lib/run-lock.mjs` · **Suite:** `npm run test:run-lock` (16 cells) · **Status CLI:** `npm run gate:run-lock-status`

## Two lines at the top of your instrument

```js
import { acquireRunLockOrExit, lockFlagsFromArgv, writeArtifactAtomic } from './lib/run-lock.mjs';

const lock = await acquireRunLockOrExit({
  artifact: out,                       // your --out path
  script: 'my-instrument.mjs',         // your identity
  ...lockFlagsFromArgv(),              // --allow-concurrent, --wait-for-host=<ms>,
});                                    // --no-host-lock, --skip-foreign-scan
// ... and at the end, instead of fs.writeFileSync(out, json):
writeArtifactAtomic(out, json);
```

Call it **before** you boot a browser or a harness server, at module top level or the first line of `main()`. Record `runLock: { state: lock.state, pid: process.pid }` in your artifact, so a reading that was taken under an override says so itself.

## The correction the ruling needs: the identity key alone does not free the box

The ruling asks for the identity key rather than the artifact path. That is right about the artifact path being too narrow, and it is still not enough to replace "wait until the box is clear" — **the 12:04–12:27 accident passes an identity check**. C's `canonical-floor-retake` and D's two `tal-po-ui-smoke-canary` launches are different scripts writing different files: three distinct identities, three distinct artifacts, three grants, and the same contaminated floor reading.

So the module now takes **three scopes** in one call, in this fixed order, releasing in reverse:

| Scope | Contends on | Catches | Refusal |
|---|---|---|---|
| `host` | one name for the whole machine | **any** two Chrome-launching runs overlapping — the 12:04 case | `HOST_BUSY_REFUSED` |
| `identity` | your script name | a second live copy of one instrument, including auto-suffixing ones — E at 11:03, D at 12:19 | `DUPLICATE_LAUNCH_REFUSED` |
| `artifact` | resolved `--out` path | two different scripts aimed at one file | `ARTIFACT_WRITER_REFUSED` |

`host` is **on by default**. Turn it off with `--no-host-lock` only for an instrument that launches no browser, and say so on the board when you do. It is `await`ed because the host scope does one more thing, below.

## The transition problem: a lock-only view of the box is a false green

At 13:0x the status CLI reported the box **free** while C's `canonical-floor-retake` was mid-reading, because that script has not adopted the lock. Under the old rule that was merely uninformative; under a rule that replaces "wait until the box is clear" it actively **grants permission** to start on top of it. So taking the host scope also scans for runs that hold no lock:

- `UNLOCKED_FOREIGN_RUN_DETECTED` → exit 3, holder named. The box is not free.
- `FOREIGN_SCAN_UNAVAILABLE` → the lock is held and reported as an **unknown** box, never as clear.
- `--skip-foreign-scan` if you know the other process is not a browser run, and say why on the board.

**Strict for refusing, broad for reporting.** The detector is C's, imported rather than reimplemented, but C's classifier is deliberately broad — correct for "somebody look at this", wrong for "nobody may start". Run against this machine it matched three orphaned `harness/serve.mjs` file servers and **three Cursor helper processes**, i.e. the editor. Wired straight to a refusal that blocks every run for as long as the IDE is open, which is a worse outage than the contention it prevents. So `classifyRunStrict` decides refusals and anything the queue counts but the lock does not is printed as `advisory` with the reason, so a disagreement between the two instruments is visible rather than silently dropped.

**And the name is not the deciding evidence — the browser is.** A `.test.mjs` gate showed up next: that suffix covers both `ckpt-ship-tag-first` (no browser) and the browser-runner gates (very much a browser), so any guess from the filename is wrong in one direction or the other. What contaminates a memory reading is a browser on the box, so the scan asks the box: a candidate refuses only when a `chrome.exe` / `msedge.exe` / `chromium.exe` process is running under its pid. A named measurement with **no** browser under it is reported as advisory rather than blocked on. If the browser query itself fails it returns `null` rather than an empty set, and the name-based answer stands — "no browsers" and "could not ask" must not be the same answer.

C: that same breadth is why your queue reported `UNCLAIMED_RUN_DETECTED` at moments when nothing of ours was running. Editor helpers match it. Worth a look on your side; nothing in this module edits yours.

## What a refusal looks like

Exit **3**, before any boot, nothing written, holder named:

```
[run-lock] HOST_BUSY_REFUSED — a measurement already owns this machine — starting now contaminates both readings.
           holder: canonical-floor-retake.mjs (pid 10988, shell 27136), held 14m, since 2026-08-03T11:42:10Z
           its artifact: _evidence/manager-C/canonical-floor-retake-b126.json
           Nothing was written and no browser was launched.
           Wait for it, or --wait-for-host=<ms> to queue, or --allow-concurrent to accept a contaminated reading deliberately.
```

`--wait-for-host=<ms>` polls the **host** scope only. A duplicate of yourself, or a second writer of one artifact, refuses immediately: that is a mistake to report, not a queue to join.

## Failure modes deliberately kept

- **A dead holder is reclaimed, not respected.** `LOCK_STALE_RECLAIMED` on acquire, or `--reap` from the status CLI. A crash that parks the box for everyone would make the cure the outage; the cell for that is in the suite.
- **The override exists** (`--allow-concurrent`, `CONCURRENCY_OVERRIDDEN`) because a forced reading you can identify afterwards beats someone bypassing the lock by editing it out.
- **A refusal at a later scope releases earlier ones.** Also a cell — an early return that kept the host lock would be a self-inflicted outage.

## Not what this is

- It is **not** host detection. It sees only runs that take the lock, so an instrument that predates adoption or refuses to call it is invisible here. C's queue scans by process name and answers a different question; when the two disagree, believe the process scan and find out who did not adopt.
- It is **not** ordering. The seal order (A canary → D mutants → E V8 → C floor and arena) is the PO's, not the lock's. `--wait-for-host` is politeness, not a priority queue.
- `writeArtifactAtomic` is **not** part of the locking. It is a separate fix for a separate cost: E's interrupted run left an empty `report.json` that read as a completed run with no data, which cost an hour of diagnosis on top of the ninety minutes. Temp file, then rename, so an artifact is either whole or absent.

## For B

Your two cells are in the suite rather than in a second lock:

- `B's cell — a real instrument refuses before it boots anything`: spawns `order01b-readback-canary.mjs` against a planted host holder and asserts exit 3, `HOST_BUSY_REFUSED`, no harness or puppeteer output, and a bound on elapsed time. The claim under test is *early*, not merely *refused*.
- `B's cell — mutant swap`: rewrites `wx` to `w` in a copy of the module and asserts the refusal **stops happening**. If the mutant still refuses, the cells are testing their own wording rather than the exclusive create, and the arm says so in its own message.

Sharpen both here. Three locks that disagree is worse than the accident each was built for.
