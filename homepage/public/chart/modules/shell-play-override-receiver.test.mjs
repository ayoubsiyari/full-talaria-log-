/**
 * SHELL-PLAY-01 — the V9 shell's `play` override must drive the live receiver.
 *
 * A traced `step=1s` to this override (BOARD-A 19:20): `play` was an own
 * property, entered 16 times, always returning normally, while
 * `_shouldUseTickAnimation` — the line straight after the engine's entry guards
 * — was reached zero times. Panels played correctly at the same knobs.
 *
 * Cause: the override was installed as
 *     patchOriginalPlay = patchedRs.play.bind(patchedRs);
 * so it *drove* the instance captured at patch time while the telemetry beneath
 * it *described* `this`. Once those diverge the override starts a stale engine
 * and broadcasts the live engine's speed/mode/step to the panels — panels play
 * at the right knobs, the host never moves, and nothing throws. That is exactly
 * the SHELL_PLAY_OVERRIDE_INERT signature, including why it looked like an
 * engine bug rather than a shell bug.
 *
 * Drives the real override block lifted out of MultichartGrid.jsx.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// SEAL-EVIDENCE-01: source evidence cannot bless served bytes. This gate reads the chart
// SOURCE, so it can show what the code says and not what the sealed build does.
// The token travels in the output because an audit document does not travel with
// a sweep log.
console.log("[SEAL-EVIDENCE-01] STATIC_ONLY_SOURCE_GATE SHELL-PLAY override receiver \u2014 reads source; served behaviour unobserved");


const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Named refusal instead of a bare ENOENT. A gate that cannot find its subject
 * has not tested it, and must not report that as the subject being defective.
 */
function readSubject(file) {
  if (!fs.existsSync(file)) throw new Error(`SUBJECT_ABSENT: ${file}`);
  return fs.readFileSync(file, 'utf8');
}


/**
 * Walk up to the repo root instead of counting directory levels.
 *
 * This file is mirrored to a tree at a DIFFERENT depth, so a fixed '../../..'
 * resolved to the wrong directory in one of the two locations and the gate there
 * died on load, or failed a cell on a path it built itself. A gate that cannot
 * reach its subject reports a red indistinguishable from a product defect.
 */
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`ANCHOR_BROKEN: repo root not found from ${start}`);
}

const ROOT = findRoot(__dirname);
const GRID = path.resolve(findRoot(__dirname), 'chart v 1.4/talaria-design/src/MultichartGrid.jsx');

const gridSrc = readSubject(GRID);

const ANCHOR = 'if (typeof patchedRs.play === "function") {';

function liftBlock(source, anchor) {
  const start = source.indexOf(anchor);
  if (start < 0) {
    const state = source.includes('patchedRs.play') ? 'ANCHOR_BROKEN' : 'RESOLVER_ABSENT_FROM_TREE';
    assert.fail(`${state}: play override block`);
  }
  const open = source.indexOf('{', start);
  let d = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') d += 1;
    else if (source[i] === '}') { d -= 1; if (d === 0) return source.slice(start, i + 1); }
  }
  assert.fail('ANCHOR_BROKEN: play override block — unbalanced braces');
  return null;
}

const BLOCK = liftBlock(gridSrc, ANCHOR);

/** Mimics the engine's play(): early-returns leave both start flags clear. */
function makeEngine(name, { isActive = true } = {}) {
  return {
    name,
    isActive,
    isPlaying: false,
    isPlayStarting: false,
    speed: 10,
    playbackMode: 'tick',
    playCalls: 0,
    getPlaybackMode() { return this.playbackMode; },
    play(...args) {
      this.playCalls += 1;
      this.lastArgs = args;
      if (!this.isActive) return 'inactive';
      this.isPlayStarting = true;
      return 'started';
    },
  };
}

function install(patchedRs, { killSwitch = false } = {}) {
  const broadcasts = [];
  const ctx = vm.createContext({ Number, Boolean, console });
  const factory = vm.runInContext(`(function (deps) {
    const shellPlayReceiverFixV1Enabled = deps.enabled;
    const broadcastToIframes = deps.broadcast;
    const replayStepTfForBroadcast = deps.stepTf;
    const requestAnimationFrame = deps.raf;
    return function (patchedRs) {
      let patchOriginalPlay = null;
      ${BLOCK}
      return () => patchOriginalPlay;
    };
  })`, ctx)({
    enabled: () => !killSwitch,
    broadcast: (cmd, payload) => { broadcasts.push({ cmd, payload }); },
    stepTf: (rs) => (rs && rs.stepTf) || null,
    raf: () => {},
  });
  const getOriginal = factory(patchedRs);
  return { broadcasts, getOriginal };
}

const played = (b) => b.filter((x) => x.cmd === 'replayPlay');
const stepTf = (b) => b.filter((x) => x.cmd === 'replaySetStepTf');
/** Payloads are built inside the sandbox realm; compare values, not prototypes. */
const plain = (v) => JSON.parse(JSON.stringify(v));

test('SHELLPLAY: mutant — the bound original starts the stale engine, not the receiver', () => {
  const stale = makeEngine('stale');
  const live = makeEngine('live');
  const { broadcasts } = install(stale, { killSwitch: true });
  live.play = stale.play; // the override, as installed on the patched object

  live.play();

  assert.equal(stale.isPlayStarting, true, 'mutant did not drive the stale engine');
  assert.equal(live.isPlayStarting, false, 'mutant somehow started the live engine');
  assert.equal(
    played(broadcasts).length,
    1,
    'mutant should still announce the start it never made — that is the silent divergence',
  );
});

test('SHELLPLAY: green — the override drives whichever engine it is called on', () => {
  const stale = makeEngine('stale');
  const live = makeEngine('live');
  install(stale);
  live.play = stale.play;

  live.play();

  assert.equal(live.isPlayStarting, true, 'the receiver was not started');
  assert.equal(stale.playCalls, 0, 'the stale engine was driven instead of the receiver');
});

test('SHELLPLAY: green — a normal single-instance start still broadcasts', () => {
  const rs = makeEngine('host');
  const { broadcasts } = install(rs);

  rs.play();

  assert.equal(rs.isPlayStarting, true);
  assert.equal(played(broadcasts).length, 1, 'panels were not told to play');
  assert.deepEqual(plain(played(broadcasts)[0].payload), { speed: 10, mode: 'tick' });
  assert.equal(rs.__shellPlayOverrideInert, false, 'a successful start was marked inert');
});

test('SHELLPLAY: a host that refuses to start does not march the panels', () => {
  const rs = makeEngine('host', { isActive: false });
  const { broadcasts } = install(rs);

  rs.play();

  assert.equal(rs.isPlaying, false);
  assert.equal(rs.isPlayStarting, false);
  assert.equal(
    played(broadcasts).length,
    0,
    'panels were told to play while the host stayed frozen — the original symptom',
  );
});

test('SHELLPLAY: the inert case is observable, not silent', () => {
  const rs = makeEngine('host', { isActive: false });
  install(rs);
  rs.play();
  assert.equal(
    rs.__shellPlayOverrideInert,
    true,
    'no marker for the canary to read SHELL_PLAY_OVERRIDE_INERT from',
  );
});

test('SHELLPLAY: step config still syncs even when the host did not start', () => {
  const rs = makeEngine('host', { isActive: false });
  rs.stepTf = '1s';
  const { broadcasts } = install(rs);
  rs.play();
  assert.equal(stepTf(broadcasts).length, 1, 'step timeframe sync was lost with the play gate');
  assert.deepEqual(plain(stepTf(broadcasts)[0].payload), { tf: '1s' });
});

test('SHELLPLAY: kill switch restores the legacy bound behaviour', () => {
  const stale = makeEngine('stale');
  const live = makeEngine('live');
  install(stale, { killSwitch: true });
  live.play = stale.play;
  live.play();
  assert.equal(stale.isPlayStarting, true, 'kill switch did not restore the bound original');
});

test('SHELLPLAY: arguments reach the engine', () => {
  const rs = makeEngine('host');
  install(rs);
  rs.play({ resume: true });
  assert.deepEqual(plain(rs.lastArgs), [{ resume: true }], 'the override swallowed its arguments');
});

test('SHELLPLAY: bound — the play original is captured unbound', () => {
  const block = liftBlock(gridSrc, ANCHOR);
  assert.match(
    block,
    /patchOriginalPlay = patchedRs\.play;/,
    'the original is not captured unbound',
  );
  assert.doesNotMatch(
    block,
    /patchOriginalPlay = patchedRs\.play\.bind\(/,
    'the original is still hard-bound to the patch-time instance',
  );
  assert.match(block, /patchOriginalPlay\.apply\(this, args\)/, 'the original is not applied to the receiver');
});

test('SHELLPLAY: bound — cleanup restores a real method rather than a bound copy', () => {
  // patchOriginalPlay is what the effect cleanup assigns back onto the instance,
  // so capturing it unbound is what stops an unmount from leaving a permanently
  // bound own-property `play` behind for the next mount to wrap.
  assert.match(
    gridSrc,
    /if \(patchOriginalPlay\)\s+patchedRs\.play\s+= patchOriginalPlay;/,
    'cleanup no longer restores play',
  );
});
