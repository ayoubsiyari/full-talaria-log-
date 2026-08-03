/**
 * Is the box available for a Chrome-launching run, and if not, who has it.
 *
 * Lifted verbatim out of `idle-transient-clean-retake.mjs` when a second wrapper
 * needed it. Writing the same wait twice is how three lock implementations ended
 * up live on this box in one morning, and B had to spend an afternoon reporting
 * that a shared detector which only reads its own locks is decorative.
 *
 * Two gates, and neither is C's `preflight`, for a reason found the hard way:
 * `preflight` counts the *waiting wrapper* as an unclaimed measurement process,
 * and `claim` refuses whenever any is visible, so a wrapper that waits for the
 * queue can never satisfy it. It waits on itself. Reported to C.
 *
 * So: another owner's live claim is honoured by reading C's state read-only, and
 * live runs come from A's own scan, which excludes self and requires an *observed*
 * browser. The run itself then takes RUN-LOCK-01, which is the gate the PO named
 * — the lock, not an empty box.
 */

import { clockOf } from './clock.mjs';
import { foreignRunsSync, isAlive } from './run-lock.mjs';
import { readState } from '../measurement-queue.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {{owner?: string, ignorePids?: number[]}} opts
 * @returns {string[]} human-readable blockers; empty means available
 */
export function boxBlockers({ owner = 'A', ignorePids = [] } = {}) {
  const blockers = [];
  const state = readState();
  const claim = state && state.claim;
  if (claim && claim.owner && claim.owner !== owner && isAlive(claim.pid)) {
    blockers.push(`queue claim: ${claim.owner}/${claim.run} pid ${claim.pid} since ${claim.at}`);
  }
  const scan = foreignRunsSync({ ignorePids: [process.pid, ...ignorePids] });
  for (const r of scan.runs) blockers.push(`live run: ${r.script} pid ${r.pid}`);
  if (scan.state === 'FOREIGN_SCAN_UNAVAILABLE') blockers.push(`scan unavailable: ${scan.why}`);
  return blockers;
}

export function boxIsFree(opts = {}) {
  const blockers = boxBlockers(opts);
  return { free: blockers.length === 0, why: blockers.join('; ') };
}

/**
 * Poll until the box frees or the budget runs out. Returns rather than throws:
 * a wait that times out is a reportable state, not a crash, and the caller has
 * an artifact to write either way.
 */
export async function waitForBox({
  owner = 'A',
  ignorePids = [],
  waitMaxMs = 90 * 60 * 1000,
  pollMs = 20_000,
  log = (m) => console.log(`[box ${clockOf(new Date(), { seconds: true })}] ${m}`),
} = {}) {
  const started = Date.now();
  let lastWhy = '';
  for (;;) {
    const q = boxIsFree({ owner, ignorePids });
    if (q.free) return { state: 'BOX_AVAILABLE', waitedMs: Date.now() - started };
    if (q.why !== lastWhy) { log(`waiting — ${q.why}`); lastWhy = q.why; }
    if (Date.now() - started > waitMaxMs) {
      return { state: 'WAIT_TIMEOUT', waitedMs: Date.now() - started, why: q.why };
    }
    await sleep(pollMs);
  }
}
