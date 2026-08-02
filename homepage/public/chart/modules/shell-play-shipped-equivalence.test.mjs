/**
 * SHELL-PLAY-01 follow-up — does the SHIPPED override forward to its receiver?
 *
 * A's b124 canary (docs/plan3/evidence/order01b-readback-canary-step1s-b124.json)
 * returned SHELL_PLAY_OVERRIDE_INERT on the reasoning that `rs.play()` started
 * nothing while `prototype.play.call(rs)` started playback on the same object.
 * That verdict requires the two to be different calls.
 *
 * This gate takes the override out of the BUILT bundle — the actual minified
 * bytes the canary ran — and asks where it sends the engine call. It is not an
 * argument about the source; it is the shipped function, executed.
 *
 * Anti-vacuity: the same cells run against a reconstruction of the pre-fix
 * bound form, which MUST come out the other way. If both forms pass, the gate
 * is measuring nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const BUNDLE = path.join(ROOT, 'chart v 1.4/chart/dist-v9/assets/talaria-v9-live.js');

const MARKER = '__shellPlayOverrideInert';

/**
 * Pull the installed play override out of the built bundle. Anchored on the
 * marker rather than on minified identifiers, which change every build.
 */
function liftShippedOverride() {
  const src = fs.readFileSync(BUNDLE, 'utf8');
  const marker = src.indexOf(MARKER);
  if (marker < 0) assert.fail('RESOLVER_ABSENT_FROM_TREE: the override is not in the built bundle');

  // Walk back to the assignment that installs it.
  const head = src.lastIndexOf('.play=function', marker);
  if (head < 0) assert.fail('ANCHOR_BROKEN: no play install site before the marker');
  const recvStart = src.lastIndexOf(',', src.lastIndexOf('=', head)) + 1;
  const install = src.slice(recvStart, head);

  const fnStart = src.indexOf('function', head);
  const open = src.indexOf('{', src.indexOf(')', fnStart));
  let d = 0;
  let end = -1;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') d += 1;
    else if (src[i] === '}') { d -= 1; if (d === 0) { end = i + 1; break; } }
  }
  if (end < 0) assert.fail('ANCHOR_BROKEN: unbalanced override body');

  // The capture line sits just before the install, e.g. `const ve=pt;rr=pt.play,`
  const preamble = src.slice(Math.max(0, recvStart - 200), recvStart);
  return { fnText: src.slice(fnStart, end), install, preamble };
}

const shipped = liftShippedOverride();

/** An engine whose prototype play records which object it actually ran on. */
function makeEngine(name, log) {
  class Engine {
    constructor(n) {
      this.name = n;
      this.isActive = true;
      this.isPlaying = false;
      this.isPlayStarting = false;
      this.speed = 10;
    }

    getPlaybackMode() { return 'candle'; }

    play() {
      log.push(this.name);
      this.isPlayStarting = true;
      return 'started';
    }
  }
  return new Engine(name);
}

/**
 * Install a play override on `receiver`, wired the way the shipped bundle wires
 * it (`rr` = the captured method, `ve` = the instance present at patch time).
 * `bindOriginal` reproduces the pre-fix form.
 */
function install({ fnText, receiver, patchTimeInstance, capturedFrom, bindOriginal }) {
  const broadcasts = [];
  const ctx = vm.createContext({ Number, Boolean, console });
  const wire = vm.runInContext(`(function (d) {
    const oM = d.enabled, bt = d.broadcast, rf = d.stepTf, requestAnimationFrame = d.raf;
    const ve = d.ve;
    const rr = d.rr;
    return ${fnText};
  })`, ctx);

  const original = bindOriginal
    ? Object.getPrototypeOf(capturedFrom).play.bind(patchTimeInstance)
    : Object.getPrototypeOf(capturedFrom).play;

  receiver.play = wire({
    enabled: () => true,
    broadcast: (cmd, payload) => broadcasts.push({ cmd, payload }),
    stepTf: () => null,
    raf: () => {},
    ve: patchTimeInstance,
    rr: original,
  });
  return { broadcasts };
}

test('SHELLPLAY-SHIPPED: the bundle captures the original UNBOUND', () => {
  // `rr=pt.play` forwards; `rr=pt.play.bind(pt)` does not. This is the one line
  // the whole verdict turns on, read off the shipped bytes.
  assert.match(
    shipped.preamble + shipped.install,
    /=\s*[A-Za-z_$][\w$]*\.play\s*,?\s*$|[A-Za-z_$][\w$]*\.play\s*,/,
    `ANCHOR_BROKEN: could not read the capture line: ${JSON.stringify(shipped.preamble.slice(-120))}`,
  );
  assert.doesNotMatch(
    shipped.preamble,
    /\.play\.bind\(/,
    'the shipped bundle still captures a BOUND original — the fix did not reach these bytes',
  );
  assert.match(shipped.fnText, /\.apply\(this,/, 'the shipped override does not apply to its receiver');
});

test('SHELLPLAY-SHIPPED: the override drives the object it is called on', () => {
  const log = [];
  const stale = makeEngine('stale', log);
  const live = makeEngine('live', log);
  install({
    fnText: shipped.fnText,
    receiver: live,
    patchTimeInstance: stale,
    capturedFrom: stale,
    bindOriginal: false,
  });

  live.play();

  assert.deepEqual(log, ['live'], 'the shipped override sent the engine call to the wrong instance');
  assert.equal(live.isPlayStarting, true);
  assert.equal(stale.isPlayStarting, false);
});

test('SHELLPLAY-SHIPPED: it is indistinguishable from calling the class method', () => {
  // This is the comparison the canary made. If these two disagree, the verdict
  // stands. If they agree, the verdict is measuring something other than the
  // entry point.
  const viaOverride = [];
  const a = makeEngine('subject', viaOverride);
  install({
    fnText: shipped.fnText, receiver: a, patchTimeInstance: a, capturedFrom: a, bindOriginal: false,
  });
  a.play();

  const viaClass = [];
  const b = makeEngine('subject', viaClass);
  Object.getPrototypeOf(b).play.call(b);

  assert.deepEqual(viaOverride, viaClass, 'the two paths are not the same call');
  assert.equal(a.isPlayStarting, b.isPlayStarting, 'the two paths left different state');
});

test('SHELLPLAY-SHIPPED: anti-vacuity — the pre-fix bound form fails these cells', () => {
  const log = [];
  const stale = makeEngine('stale', log);
  const live = makeEngine('live', log);
  install({
    fnText: shipped.fnText,
    receiver: live,
    patchTimeInstance: stale,
    capturedFrom: stale,
    bindOriginal: true, // the shape that shipped before b124
  });

  live.play();

  // If this ever comes out as ['live'], the two cells above prove nothing.
  assert.deepEqual(log, ['stale'], 'the bound form no longer misroutes, so the cells above are vacuous');
  assert.equal(live.isPlayStarting, false);
});

test('SHELLPLAY-SHIPPED: a receiver that refuses to start is not announced to panels', () => {
  const log = [];
  const rs = makeEngine('host', log);
  rs.isActive = false;
  rs.play = undefined;
  const { broadcasts } = install({
    fnText: shipped.fnText, receiver: rs, patchTimeInstance: rs, capturedFrom: makeEngine('proto', log), bindOriginal: false,
  });
  // The prototype play used here records and sets isPlayStarting, so force the
  // refusal the way the engine does: no start flags after the call.
  rs.isPlaying = false;
  rs.isPlayStarting = false;
  Object.defineProperty(rs, 'isPlayStarting', { value: false, writable: false, configurable: true });

  try { rs.play(); } catch (_) { /* frozen flag write is fine */ }

  assert.equal(
    broadcasts.filter((b) => b.cmd === 'replayPlay').length,
    0,
    'panels were told to play while the host reported no start',
  );
});
