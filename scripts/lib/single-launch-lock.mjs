/**
 * LAUNCH-LOCK-01 — one instrument, one live run, or a named refusal.
 *
 * We lost two multi-hour runs today. The second one — E's ninety-minute V8
 * playback slope — did not die from a crash: its `report.json` was overwritten
 * at 11:03:58 by what looks like a second launch of the same instrument, which
 * reset `startedAt`, emptied `moments` and `heartbeats`, and left two orphaned
 * heap snapshots that can no longer be attributed to a run.
 *
 * The dangerous part is not the lost time. It is that the artifact was
 * TRUNCATED SILENTLY. Nothing refused, nothing warned, and the file still
 * parsed as valid JSON afterwards — so a reader who had not watched the run
 * would have read an empty shell as a completed measurement of nothing. On a
 * ten-hour soak that is a far worse place to discover it.
 *
 * BIND-01. Three states, kept apart, because collapsing them is how a guard
 * becomes indistinguishable from the thing it guards against:
 *
 *   LOCK_ACQUIRED              no live holder; this process now owns the run
 *   INSTRUMENT_ALREADY_RUNNING a live holder exists — REFUSE, write nothing,
 *                              and name the pid and start time that own it
 *   STALE_LOCK_RECLAIMED       a lock file exists but its pid is gone, so the
 *                              previous run died without releasing. Reclaimed,
 *                              and reported DISTINCTLY: "the last run died" and
 *                              "another run is live" are different findings and
 *                              must not read the same.
 *
 * Deliberately NOT an advisory warning. A guard that prints and continues is
 * the escape hatch that makes the guard advisory, which is the same shape as a
 * dirty-build waiver: it exists precisely for the moment someone is in a hurry.
 *
 *   import { acquireRunLock } from './lib/single-launch-lock.mjs';
 *   const lock = acquireRunLock('v8-playback-heap-slope');   // throws on refusal
 *   try { ...run... } finally { lock.release(); }
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Is a pid still alive? signal 0 tests existence without delivering anything. */
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to another user. That is ALIVE.
    // Treating it as dead would let a second run stomp a first one owned by a
    // different account, which is exactly the failure this prevents.
    return err.code === 'EPERM';
  }
}

export function lockPathFor(name, dir) {
  const base = dir || path.join(os.tmpdir(), 'talaria-run-locks');
  return path.join(base, `${String(name).replace(/[^a-zA-Z0-9._-]/g, '_')}.lock.json`);
}

/**
 * @param {string} name  instrument identity — the thing that may only run once
 * @param {{dir?:string, meta?:object}} [opts]
 * @returns {{state:string, pid:number, file:string, reclaimedFrom?:object, release:()=>void}}
 * @throws  Error with `.state = 'INSTRUMENT_ALREADY_RUNNING'` and `.holder`
 */
export function acquireRunLock(name, opts = {}) {
  const file = lockPathFor(name, opts.dir);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  let reclaimedFrom = null;
  let state = 'LOCK_ACQUIRED';

  if (fs.existsSync(file)) {
    let holder = null;
    try {
      holder = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      // An unreadable lock is not permission to proceed. Treat it as a dead
      // holder so it can be reclaimed, but say so rather than pretending the
      // file was never there.
      holder = { pid: -1, corrupt: true };
    }
    if (pidAlive(holder.pid)) {
      const err = new Error(
        `INSTRUMENT_ALREADY_RUNNING: "${name}" is held by pid ${holder.pid}`
        + ` since ${holder.startedAt || 'unknown'}. Refusing to start a second run:`
        + ` a concurrent launch overwrites the first run's artifact.`
        + ` Lock: ${file}`,
      );
      err.state = 'INSTRUMENT_ALREADY_RUNNING';
      err.holder = holder;
      err.lockFile = file;
      throw err;
    }
    reclaimedFrom = holder;
    state = 'STALE_LOCK_RECLAIMED';
  }

  const record = {
    signature: 'TALARIA_RUN_LOCK_V1',
    name,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    // Both clocks, on purpose. Half our instruments stamp UTC and every board
    // stamps +01:00, and reconciling a lost run across those two has already
    // produced one phantom contradiction. A lock that records only one of them
    // makes the next forensic worse.
    startedAtLocal: new Date().toString(),
    host: os.hostname(),
    argv: process.argv.slice(1),
    ...(opts.meta || {}),
  };
  fs.writeFileSync(file, JSON.stringify(record, null, 2));

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    try {
      // Only remove a lock this process still owns. A slow exit must not delete
      // a lock that a legitimate successor has already taken.
      const cur = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (cur.pid === process.pid) fs.unlinkSync(file);
    } catch { /* already gone, or unreadable — nothing safe to do */ }
  };

  process.once('exit', release);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.once(sig, () => { release(); process.exit(130); });
  }

  return { state, pid: process.pid, file, reclaimedFrom, release };
}
