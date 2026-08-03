/**
 * Who holds the box, and why your run was refused.
 *
 *   node scripts/run-lock-status.mjs            # what is held right now
 *   node scripts/run-lock-status.mjs --reap     # drop locks whose holder is dead
 *   node scripts/run-lock-status.mjs --json
 *
 * Exit 0 when the box is free, 1 when a live measurement holds it. That makes it
 * usable as a precondition in a script as well as by a person.
 *
 * This reports RUN-LOCK-01 state only. It cannot see a Chrome-launching run that
 * predates the lock or refuses to take it, which is what C's measurement queue
 * scans for by process name; the two answer different questions and disagreeing
 * is informative rather than a fault.
 */
import { HOST_SCOPE_KEY, foreignRuns, inspectLocks, reapStaleLocks } from './lib/run-lock.mjs';

const json = process.argv.includes('--json');
if (process.argv.includes('--reap')) {
  const gone = reapStaleLocks();
  if (!json) {
    for (const l of gone) console.log(`[run-lock] reaped ${l.scope} held by ${l.script} (pid ${l.pid}, dead)`);
    if (!gone.length) console.log('[run-lock] nothing to reap — every lock on file has a live holder');
  }
}

const locks = inspectLocks();
const host = locks.filter((l) => l.scope === 'host' && l.alive);
// Locks alone cannot answer "is the box free" while any instrument has yet to
// adopt, and a status tool that says BOX_FREE over a live unadopted run is worse
// than no status tool.
const foreign = await foreignRuns();
const busy = host.length > 0 || foreign.state === 'UNLOCKED_FOREIGN_RUN_DETECTED';
const verdict = foreign.state === 'UNLOCKED_FOREIGN_RUN_DETECTED' ? 'BOX_BUSY_UNLOCKED_RUN'
  : host.length ? 'BOX_BUSY'
    : foreign.state === 'FOREIGN_SCAN_UNAVAILABLE' ? 'BOX_UNKNOWN_SCAN_UNAVAILABLE'
      : 'BOX_FREE';

if (json) {
  console.log(JSON.stringify({ verdict, boxFree: verdict === 'BOX_FREE', hostScope: HOST_SCOPE_KEY, locks, foreign }, null, 2));
} else {
  for (const l of locks) {
    console.log(`[run-lock] ${l.alive ? 'HELD  ' : 'STALE '} ${l.scope.padEnd(8)} ${l.script || l.name} `
      + `(pid ${l.pid}${l.heldFor ? `, ${l.heldFor}` : ''})${l.alive ? '' : ' — holder is dead, --reap clears it'}`);
  }
  if (!locks.length) console.log('[run-lock] no locks on file');
  for (const r of foreign.runs) {
    console.log(`[run-lock] UNLOCKED ${r.script || 'unknown'} (pid ${r.pid}) — on the box, holding no lock`);
  }
  for (const a of foreign.advisory || []) {
    console.log(`[run-lock] advisory ${a.script || 'unknown'} (pid ${a.pid}) — the queue counts this, `
      + `the lock does not: ${a.excludedBecause}`);
  }
  if (foreign.state === 'FOREIGN_SCAN_UNAVAILABLE') console.log(`[run-lock] scan unavailable: ${foreign.why}`);
  console.log(`[run-lock] ${verdict}`);
}

process.exitCode = busy ? 1 : verdict === 'BOX_UNKNOWN_SCAN_UNAVAILABLE' ? 2 : 0;
