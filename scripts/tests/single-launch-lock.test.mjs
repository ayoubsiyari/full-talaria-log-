#!/usr/bin/env node
// SEAL-EVIDENCE-01: RUNTIME_TOOL — this gate executes the real lock helper in
// this process and in genuine child processes. It proves the guard REFUSES a
// second launch; it says nothing about any instrument that has not adopted it.
console.log('SEAL-EVIDENCE-01 EVIDENCE CLASS: RUNTIME_TOOL — real fs + real child processes; proves the lock discriminates, not that any given instrument uses it.');

/**
 * LAUNCH-LOCK-01 gate.
 *
 * The point of the whole exercise is that the second launch must FAIL, so the
 * load-bearing cells here are the ones where a green requires an exception to
 * have been thrown. A test that only proves the first launch succeeds would
 * pass with the helper deleted.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { acquireRunLock, lockPathFor } from '../lib/single-launch-lock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HELPER = path.resolve(HERE, '../lib/single-launch-lock.mjs');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-locktest-'));

// Child specifiers must be file:// URLs: on Windows a bare absolute path is
// read as the scheme "c:" and the import fails before the lock is ever reached.
const spec = (p) => JSON.stringify(pathToFileURL(p).href);
const dirArg = JSON.stringify(DIR);

let pass = 0;
let fail = 0;
const cell = (name, fn) => {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    pass += 1;
  } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message}`);
    fail += 1;
  }
};

console.log('\nLAUNCH-LOCK-01 — one instrument, one live run\n');

cell('first launch acquires, and says so', () => {
  const l = acquireRunLock('cell-1', { dir: DIR });
  assert.equal(l.state, 'LOCK_ACQUIRED');
  assert.ok(fs.existsSync(l.file), 'lock file should exist while held');
  l.release();
  assert.ok(!fs.existsSync(l.file), 'lock file should be gone after release');
});

cell('SECOND LAUNCH IS REFUSED while the first is live — the whole point', () => {
  const first = acquireRunLock('cell-2', { dir: DIR });
  let threw = null;
  try {
    acquireRunLock('cell-2', { dir: DIR });
  } catch (err) {
    threw = err;
  }
  first.release();
  assert.ok(threw, 'second acquire MUST throw; a warning is not a guard');
  assert.equal(threw.state, 'INSTRUMENT_ALREADY_RUNNING');
  assert.equal(threw.holder.pid, process.pid, 'refusal must name the holding pid');
  assert.match(threw.message, /Refusing to start a second run/);
});

cell('refusal happens BEFORE any artifact is written', () => {
  // The failure we are preventing is truncation, so the guard is worthless if
  // it fires after the second run has already opened the output for writing.
  const artifact = path.join(DIR, 'cell-3-artifact.json');
  fs.writeFileSync(artifact, JSON.stringify({ moments: { A: 1, B: 2 }, real: true }));
  const first = acquireRunLock('cell-3', { dir: DIR });
  try {
    acquireRunLock('cell-3', { dir: DIR });
    fs.writeFileSync(artifact, JSON.stringify({ moments: {} })); // must be unreachable
  } catch { /* expected */ }
  first.release();
  const after = JSON.parse(fs.readFileSync(artifact, 'utf8'));
  assert.equal(after.real, true, 'the first run\'s artifact must be untouched');
  assert.equal(Object.keys(after.moments).length, 2, 'moments must not be emptied');
});

cell('a dead holder is RECLAIMED, and reported distinctly from a live one', () => {
  const file = lockPathFor('cell-4', DIR);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // pid 0x7FFFFFFE will not be alive; stands in for a run that died unreleased.
  fs.writeFileSync(file, JSON.stringify({ pid: 2147483646, startedAt: 'yesterday' }));
  const l = acquireRunLock('cell-4', { dir: DIR });
  assert.equal(l.state, 'STALE_LOCK_RECLAIMED',
    '"the last run died" must not read the same as "a run is live"');
  assert.equal(l.reclaimedFrom.pid, 2147483646);
  l.release();
});

cell('two distinct instruments do not block each other', () => {
  const a = acquireRunLock('cell-5-alpha', { dir: DIR });
  const b = acquireRunLock('cell-5-beta', { dir: DIR });
  assert.equal(a.state, 'LOCK_ACQUIRED');
  assert.equal(b.state, 'LOCK_ACQUIRED');
  a.release();
  b.release();
});

cell('release only removes a lock this process still owns', () => {
  const l = acquireRunLock('cell-6', { dir: DIR });
  // A legitimate successor takes the lock after we died but before our exit
  // handler ran. Our release must not delete their lock.
  fs.writeFileSync(l.file, JSON.stringify({ pid: 999999, startedAt: 'successor' }));
  l.release();
  assert.ok(fs.existsSync(l.file), 'must not delete a successor\'s lock');
  fs.unlinkSync(l.file);
});

cell('ACROSS PROCESSES: a real second node process is refused', () => {
  // In-process cells share module state. This one proves the lock is carried by
  // the filesystem, which is the only thing that helps a duplicate launch.
  const holder = acquireRunLock('cell-7', { dir: DIR });
  const child = `
    import { acquireRunLock } from ${spec(HELPER)};
    try { acquireRunLock('cell-7', { dir: ${dirArg} });
          console.log('ACQUIRED'); }
    catch (e) { console.log(e.state); }
  `;
  const script = path.join(DIR, 'child.mjs');
  fs.writeFileSync(script, child);
  const out = execFileSync(process.execPath, [script], { encoding: 'utf8' }).trim();
  holder.release();
  assert.equal(out, 'INSTRUMENT_ALREADY_RUNNING',
    `a separate process must be refused, got: ${out}`);
});

cell('SIMULTANEOUS START: 10 processes released on one millisecond yield ONE winner', () => {
  // The cells above start the second launch after the first is established,
  // which is the easy half. The launches that actually cost us runs began
  // together, and a check-then-write lock passes every sequential test while
  // admitting all ten here. Shipped first with existsSync+writeFileSync: it
  // admitted 12 of 12 racers in five rounds of six.
  const RACERS = 10;
  const ROUNDS = 3;
  // Driven from a child so the cell stays synchronous: the racers must be
  // genuinely concurrent, but this assertion must not be.
  // Racer takes its lock dir and a shared release instant on argv, then spins to
  // that instant: staggered starts are the case that already passes, so the
  // processes have to be let go together.
  const racer = path.join(DIR, 'racer.mjs');
  fs.writeFileSync(racer, `
    import { acquireRunLock } from ${spec(HELPER)};
    const [dir, startAt] = process.argv.slice(2);
    while (Date.now() < Number(startAt)) {}
    try { acquireRunLock('raced', { dir }); console.log('WON'); }
    catch { console.log('refused'); }
    // Hold past the round. A winner that exits immediately releases the lock,
    // and the losers then acquire it legitimately one after another — which
    // counts as several winners and blames the lock for the test's impatience.
    setTimeout(() => {}, 1500);
  `);

  const driver = path.join(DIR, 'race-driver.mjs');
  fs.writeFileSync(driver, `
    import { spawn } from 'node:child_process';
    import fs from 'node:fs';
    import path from 'node:path';
    const results = [];
    for (let r = 0; r < ${ROUNDS}; r += 1) {
      const dir = path.join(${JSON.stringify(DIR)}, 'race-' + r);
      fs.mkdirSync(dir, { recursive: true });
      const startAt = Date.now() + 600;
      const wins = await Promise.all(Array.from({ length: ${RACERS} }, () => new Promise((res) => {
        let buf = '';
        const p = spawn(process.execPath, [${JSON.stringify(racer)}, dir, String(startAt)]);
        p.stdout.on('data', (d) => { buf += d; });
        p.on('close', () => res(buf.includes('WON') ? 1 : 0));
      })));
      results.push(wins.reduce((a, b) => a + b, 0));
    }
    console.log(JSON.stringify(results));
  `);

  const raw = execFileSync(process.execPath, [driver], { encoding: 'utf8' }).trim();
  const perRound = JSON.parse(raw.split('\n').pop());
  const bad = perRound.filter((w) => w !== 1);
  assert.equal(bad.length, 0,
    `winners per round were ${perRound.join(', ')} across ${RACERS} simultaneous processes; `
    + 'exactly one may win each round or a duplicate launch proceeds');
});

cell('ANTI-VACUITY: with the liveness check defeated, the refusal stops firing', () => {
  // Mutant. If this cell cannot make the guard fail, the cells above are not
  // measuring the guard and their greens are worthless.
  const src = fs.readFileSync(HELPER, 'utf8');
  const mutated = src.replace(
    'if (holder && pidAlive(holder.pid)) throw refuse(holder);',
    '',
  );
  assert.notEqual(mutated, src, 'mutation anchor not found — gate is broken, not passing');
  const mutantPath = path.join(DIR, 'mutant-lock.mjs');
  fs.writeFileSync(mutantPath, mutated);
  const child = `
    import { acquireRunLock } from ${spec(mutantPath)};
    try { acquireRunLock('cell-8', { dir: ${dirArg} });
          acquireRunLock('cell-8', { dir: ${dirArg} });
          console.log('MUTANT_LET_IT_THROUGH'); }
    catch (e) { console.log('STILL_REFUSED'); }
  `;
  const script = path.join(DIR, 'mutant-child.mjs');
  fs.writeFileSync(script, child);
  const out = execFileSync(process.execPath, [script], { encoding: 'utf8' }).trim();
  assert.equal(out, 'MUTANT_LET_IT_THROUGH',
    'the mutant should have let a second launch through; if it still refused, '
    + 'the refusal is coming from somewhere other than the code under test');
});

fs.rmSync(DIR, { recursive: true, force: true });

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
