/**
 * RUN-LOCK-01 — one live writer per artifact, and no half-written artifact.
 *
 * Two failures observed on 2026-08-03, hours apart, on different instruments:
 * E lost ninety minutes to a duplicate launch of its own script overwriting the
 * artifact at 11:03, and at 12:19 two `tal-po-ui-smoke-canary` processes started
 * 53 seconds apart from different shells with the identical `--out` path. Both
 * are the same defect: the instrument does not know another copy of itself is
 * already running, and the loser's hours vanish into a file the winner rewrites.
 *
 * The lock is keyed on the ARTIFACT PATH rather than the script name, because
 * two different scripts writing one path truncate each other just as well, and
 * the same script writing two paths is legitimate.
 *
 * Named states, so a refusal cannot be mistaken for a crash:
 *   LOCK_ACQUIRED            this process owns the artifact
 *   DUPLICATE_LAUNCH_REFUSED a live process holds it; we exit without writing
 *   LOCK_STALE_RECLAIMED     holder is dead; taken over, and said so
 *   CONCURRENCY_OVERRIDDEN   operator forced it; recorded in the artifact
 *
 * Host exclusivity is a separate matter and stays with the measurement queue:
 * this stops one artifact being written twice, not two measurements sharing a
 * browser host. Both were in play at 12:19.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const LOCK_DIR = path.join(REPO_ROOT, '.locks');

export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists and belongs to someone else. Absence is ESRCH only.
    return err && err.code === 'EPERM';
  }
}

export function lockPathFor(artifact) {
  const abs = path.resolve(artifact);
  const hash = crypto.createHash('sha1').update(abs).digest('hex').slice(0, 10);
  const leaf = path.basename(abs).replace(/[^\w.-]+/g, '_').slice(0, 60);
  return path.join(LOCK_DIR, `${leaf}.${hash}.lock`);
}

function readLock(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

/**
 * @param {object} o
 * @param {string} o.artifact  path this run will write
 * @param {string} o.script    for the refusal message
 * @param {boolean} o.allowConcurrent  explicit operator override
 * @returns {{state: string, release: () => void, holder: object|null, lockFile: string}}
 */
export function acquireRunLock({ artifact, script = path.basename(process.argv[1] || 'unknown'), allowConcurrent = false }) {
  if (!artifact) throw new Error('acquireRunLock: artifact path is required');
  const lockFile = lockPathFor(artifact);
  fs.mkdirSync(LOCK_DIR, { recursive: true });

  const payload = () => JSON.stringify({
    pid: process.pid,
    ppid: process.ppid,
    script,
    artifact: path.resolve(artifact),
    startedAt: new Date().toISOString(),
    argv: process.argv.slice(2),
  }, null, 2);

  let state = 'LOCK_ACQUIRED';
  for (;;) {
    try {
      // wx is the whole mechanism: exclusive create is atomic, so two processes
      // racing 53 seconds or 53 milliseconds apart cannot both win.
      const fd = fs.openSync(lockFile, 'wx');
      fs.writeFileSync(fd, payload());
      fs.closeSync(fd);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const holder = readLock(lockFile);
      if (holder && isAlive(holder.pid) && holder.pid !== process.pid) {
        if (!allowConcurrent) {
          return { state: 'DUPLICATE_LAUNCH_REFUSED', holder, lockFile, release() {} };
        }
        return { state: 'CONCURRENCY_OVERRIDDEN', holder, lockFile, release() {} };
      }
      // Holder is dead, or the file is unparseable. Reclaim rather than block:
      // a crashed run must not park an artifact permanently.
      state = holder ? 'LOCK_STALE_RECLAIMED' : 'LOCK_UNPARSEABLE_RECLAIMED';
      try { fs.unlinkSync(lockFile); } catch { /* raced with another reclaimer */ }
    }
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const mine = readLock(lockFile);
    if (!mine || mine.pid === process.pid) {
      try { fs.unlinkSync(lockFile); } catch { /* already gone */ }
    }
  };
  for (const sig of ['exit', 'SIGINT', 'SIGTERM']) {
    process.once(sig, () => { release(); if (sig !== 'exit') process.exit(130); });
  }
  return { state, release, holder: null, lockFile };
}

/**
 * Refuse loudly and exit, or return the lock. The default for an instrument:
 * the cost of a wrong refusal is a re-launch, the cost of a wrong write is
 * somebody's ninety minutes.
 */
export function acquireRunLockOrExit(opts) {
  const lock = acquireRunLock(opts);
  if (lock.state === 'DUPLICATE_LAUNCH_REFUSED') {
    const h = lock.holder || {};
    console.error(`[run-lock] DUPLICATE_LAUNCH_REFUSED — ${h.script || 'another process'} `
      + `(pid ${h.pid}, started ${h.startedAt}) is already writing this artifact:\n`
      + `           ${path.resolve(opts.artifact)}\n`
      + `           Nothing was written. Wait for it, or pass a different --out, `
      + `or --allow-concurrent to accept a contaminated artifact deliberately.`);
    process.exit(3);
  }
  if (lock.state !== 'LOCK_ACQUIRED') console.warn(`[run-lock] ${lock.state}`);
  return lock;
}

/**
 * Atomic write. A run killed mid-write left a truncated JSON that parsed as
 * "no data" rather than "interrupted", which is how a lost run reads as a
 * completed one with nothing in it.
 */
export function writeArtifactAtomic(file, data) {
  const abs = path.resolve(file);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, abs);
  return abs;
}
