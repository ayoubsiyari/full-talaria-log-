#!/usr/bin/env node
// SEAL-EVIDENCE-01: RUNTIME_TOOL — runs the real run-lock against a real planted
// holder in this process. It measures WHERE the refusal happens relative to the
// first `await`, and nothing else. No browser, no harness, no served surface.
console.log('SEAL-EVIDENCE-01 EVIDENCE CLASS: RUNTIME_TOOL — real lock, real planted holder, in-process; measures refusal timing only.');

/**
 * Why this exists as its own file rather than a scratch one-liner.
 *
 * I told D that their un-awaited `acquireRunLockOrExit` still refuses, correcting
 * my own first reading that their guard "does nothing". That correction is the
 * load-bearing part of the report — it is the difference between "your run is
 * unprotected" and "one arm of your protection is raced" — and INSTRUMENT-01 says
 * a result is not citable until the instrument that produced it is committed. It
 * applies to the claims I make about other people's lanes most of all.
 *
 * What it shows: `acquireRunLockOrExit` refuses in its SYNCHRONOUS prefix, so
 * `process.exit(3)` fires during the call and the caller's next statement never
 * runs, awaited or not. The lock-scope refusals therefore bind even when misused.
 * The arm that does NOT bind is the one after the first `await` — the unlocked-run
 * scan — because an un-awaited caller proceeds while it is still deciding.
 *
 * Run: node scripts/tests/run-lock-await-binding.probe.mjs
 * Expect: exit 3, the HOST_BUSY_REFUSED banner, and NO "REACHED NEXT STATEMENT".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOST_SCOPE_KEY, acquireRunLockOrExit, lockPathFor,
} from '../lib/run-lock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const lockFile = lockPathFor(HOST_SCOPE_KEY, 'host');

// A holder that is genuinely alive and is not us, so the refusal is real.
fs.mkdirSync(path.dirname(lockFile), { recursive: true });
fs.writeFileSync(lockFile, JSON.stringify({
  scope: 'host', pid: process.ppid, script: 'planted-holder.mjs', startedAt: new Date().toISOString(),
}, null, 2));

// Release the planted lock however we leave, including via process.exit(3) from
// inside the call below. Without this the probe parks the box it is studying.
process.on('exit', () => { try { fs.unlinkSync(lockFile); } catch { /* already gone */ } });

console.log(`planted a live host holder at ${path.relative(path.resolve(HERE, '../..'), lockFile)}`);
console.log('calling acquireRunLockOrExit WITHOUT await ...\n');

const notAwaited = acquireRunLockOrExit({
  artifact: path.join(HERE, 'never-written.json'),
  script: 'await-binding-probe.mjs',
});

// If this line prints, the refusal was NOT synchronous and D's suite really would
// have proceeded past an unheld lock. It does not print.
console.log('REACHED NEXT STATEMENT — refusal was not synchronous');
console.log(`  returned a Promise: ${typeof notAwaited?.then === 'function'}`);
console.log(`  .state           : ${notAwaited?.state}`);
console.log(`  typeof .release  : ${typeof notAwaited?.release}`);
process.exit(0);
