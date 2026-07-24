/**
 * M20 QUICK-KILL Q6 — floating replay-toolbar document mousemove/mouseup teardown.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-q6-replay-float-listeners.test.mjs"
 *
 * Evidence modes (env):
 *   M20_Q6_EVIDENCE=red|green|kill → docs/plan3/evidence/W4-Q6-20260724-<mode>.json
 *
 * Kill-switch (default fix ON when unset/false):
 *   __TALARIA_DISABLE_M20_Q6_REPLAY_FLOAT_LISTENER_TEARDOWN_V1
 *
 * File-disjoint: owns replay-system.js float/close/exit listener teardown only.
 * Does not touch Q9 prefix-slice hunks (W1).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHART_ROOT = path.resolve(__dirname, '..');
const HOMEPAGE_CHART = path.resolve(__dirname, '../../../homepage/public/chart');
const EVIDENCE_DIR = path.resolve(__dirname, '../../../docs/plan3/evidence');
const require = createRequire(import.meta.url);

const KS_Q6 = '__TALARIA_DISABLE_M20_Q6_REPLAY_FLOAT_LISTENER_TEARDOWN_V1';
const evidenceMode = String(process.env.M20_Q6_EVIDENCE || '').toLowerCase();
const softRed = evidenceMode === 'red';
const evidenceRows = [];

function note(fixId, name, pass, detail = '') {
  evidenceRows.push({ q: fixId, name, pass: !!pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [${fixId}] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function read(relFromChart) {
  return fs.readFileSync(path.join(CHART_ROOT, relFromChart), 'utf8');
}

function readHome(rel) {
  return fs.readFileSync(path.join(HOMEPAGE_CHART, rel), 'utf8');
}

function hardAssert(cond, msg) {
  if (!softRed) assert.equal(cond, true, msg);
}

function installDomCensus() {
  const listeners = new Map(); // type -> Set<fn>
  const count = (type) => (listeners.get(type) ? listeners.get(type).size : 0);
  let floatingClone = null;

  const document = {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      const set = listeners.get(type);
      if (set) set.delete(fn);
    },
    getElementById(id) {
      if (id === 'replayToolbarClone') return floatingClone;
      return null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement(tag) {
      const el = {
        tagName: String(tag || 'div').toUpperCase(),
        style: {},
        className: '',
        id: '',
        innerHTML: '',
        children: [],
        appendChild(child) { this.children.push(child); return child; },
        addEventListener() {},
        remove() {},
      };
      return el;
    },
    body: { appendChild() {} },
  };

  global.window = global.window || {};
  global.document = document;
  global.userStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
  window.userStorage = global.userStorage;

  function makeClone() {
    const clone = {
      id: 'replayToolbarClone',
      style: { left: '10px', top: '20px', opacity: '1', pointerEvents: 'auto' },
      classList: { add() {}, remove() {} },
      listeners: [],
      addEventListener(type, fn) { this.listeners.push({ type, fn }); },
      getBoundingClientRect() { return { left: 10, top: 20, width: 200, height: 40 }; },
      closest() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      appendChild() {},
      remove() { floatingClone = null; },
    };
    floatingClone = clone;
    return clone;
  }

  return { document, listeners, count, makeClone, setFloating(c) { floatingClone = c; } };
}

function loadReplaySystem() {
  const resolved = require.resolve('./replay-system.js');
  delete require.cache[resolved];
  return require('./replay-system.js');
}

// ─── Static contract ───────────────────────────────────────────────────────

test('Q6: static — kill-switch + teardown wiring on float close/exit paths', () => {
  const src = read('modules/replay-system.js');
  const home = readHome('modules/replay-system.js');

  const hasKill = src.includes(KS_Q6) && home.includes(KS_Q6);
  const hasEnabledHelper =
    /_m20Q6ReplayFloatListenerTeardownEnabled\s*\(/.test(src)
    && /_m20Q6ReplayFloatListenerTeardownEnabled\s*\(/.test(home);
  const hasTeardown =
    /_teardownFloatingCloneDocListeners\s*\(/.test(src)
    && /_removeFloatingReplayToolbarClone\s*\(/.test(src);
  const makeCloneSlice = (() => {
    const i = src.search(/makeCloneDraggable\s*\(\s*clone\s*\)\s*\{/);
    return i >= 0 ? src.slice(i, i + 2200) : '';
  })();
  const installsDocPair =
    /addEventListener\(\s*['"]mousemove['"]/.test(makeCloneSlice)
    && /addEventListener\(\s*['"]mouseup['"]/.test(makeCloneSlice);
  const registersTeardown =
    makeCloneSlice.includes('_floatingCloneDocListenerTeardowns')
    && /removeEventListener\(\s*['"]mousemove['"]/.test(makeCloneSlice);
  const closeSlice = (() => {
    const i = src.search(/addCloseButtonToClone\s*\(\s*clone\s*\)\s*\{/);
    return i >= 0 ? src.slice(i, i + 1600) : '';
  })();
  const closeTearsDown =
    closeSlice.includes('_removeFloatingReplayToolbarClone')
    || closeSlice.includes('_teardownFloatingCloneDocListeners');
  const exitSlice = (() => {
    const i = src.search(/exitReplayMode\s*\(\s*\)\s*\{/);
    return i >= 0 ? src.slice(i, i + 1200) : '';
  })();
  const exitTearsDown =
    exitSlice.includes('_removeFloatingReplayToolbarClone')
    || exitSlice.includes('_teardownFloatingCloneDocListeners');
  // Must not disturb Q9 prefix-slice region (W1-owned).
  const q9Idx = src.indexOf('Re-apply the replay prefix slice');
  const q9TouchedByQ6 = q9Idx >= 0 && src.slice(q9Idx, q9Idx + 800).includes(KS_Q6);

  note('Q6', 'kill-switch-present', hasKill, KS_Q6);
  note('Q6', 'enabled-helper-present', hasEnabledHelper);
  note('Q6', 'teardown-helpers-present', hasTeardown);
  note('Q6', 'makeCloneDraggable-installs-doc-pair', installsDocPair);
  note('Q6', 'makeCloneDraggable-registers-teardown', registersTeardown);
  note('Q6', 'close-path-tears-down', closeTearsDown);
  note('Q6', 'exit-path-tears-down', exitTearsDown);
  note('Q6', 'homepage-mirror-parity', hasKill && hasTeardown && home.includes('_teardownFloatingCloneDocListeners'));
  note('Q6', 'q9-prefix-slice-untouched', q9TouchedByQ6 === false);

  hardAssert(hasKill, 'Q6 kill-switch missing');
  hardAssert(hasEnabledHelper, 'Q6 enabled helper missing');
  hardAssert(hasTeardown, 'Q6 teardown helpers missing');
  hardAssert(installsDocPair, 'makeCloneDraggable must still install document mousemove/mouseup');
  hardAssert(registersTeardown, 'makeCloneDraggable must register teardown for the doc pair');
  hardAssert(closeTearsDown, 'close path must tear down document listeners');
  hardAssert(exitTearsDown, 'exitReplayMode must tear down document listeners');
  hardAssert(q9TouchedByQ6 === false, 'Q6 must not edit Q9 prefix-slice hunks');
});

// ─── Behavioral census ─────────────────────────────────────────────────────

test('Q6: behavioral — fix ON flat census; kill-switch restores accumulation', () => {
  const { count, makeClone } = installDomCensus();
  const ReplaySystem = loadReplaySystem();
  assert.equal(typeof ReplaySystem, 'function', 'ReplaySystem export missing');

  function freshInstance() {
    const rs = Object.create(ReplaySystem.prototype);
    rs.chart = {
      scheduleRender() {},
      resampleData: (d) => d,
      rawData: [],
      data: [],
      currentTimeframe: '1m',
    };
    rs.toolbar = { style: { opacity: '0.3' }, classList: { add() {}, remove() {} } };
    rs.isActive = true;
    rs.isPlaying = false;
    rs.fullRawData = null;
    rs._floatingCloneDocListenerTeardowns = [];
    rs.saveFloatingClonePosition = () => {};
    rs.stop = () => {};
    rs.hideToolbar = () => {};
    rs.updateReplayButtonState = () => {};
    rs.updateAutoScrollIndicator = () => {};
    rs._flushReplayStateToSession = () => {};
    rs._detachReplayFollowViewportListeners = () => {};
    rs._syncCompareOverlaysForReplay = () => {};
    return rs;
  }

  // Baseline
  const baseMove = count('mousemove');
  const baseUp = count('mouseup');

  {
    window[KS_Q6] = false; // fix ON
    const rs = freshInstance();
    const clone = makeClone();
    rs.makeCloneDraggable(clone);
    note('Q6', 'fix-on-installs-one-pair',
      count('mousemove') === baseMove + 1 && count('mouseup') === baseUp + 1,
      `move=${count('mousemove') - baseMove} up=${count('mouseup') - baseUp}`);
    hardAssert(count('mousemove') === baseMove + 1, 'expected one mousemove');
    hardAssert(count('mouseup') === baseUp + 1, 'expected one mouseup');

    // Close path
    if (typeof rs._removeFloatingReplayToolbarClone === 'function') {
      rs._removeFloatingReplayToolbarClone();
    } else {
      // Pre-fix legacy: DOM remove only (documents the leak for RED).
      clone.remove();
      userStorage.removeItem('replayToolbarClonePosition');
      rs.toolbar.style.opacity = '1';
    }
    const flatAfterClose =
      count('mousemove') === baseMove && count('mouseup') === baseUp;
    note('Q6', 'fix-on-close-flat-census', flatAfterClose,
      `move=${count('mousemove') - baseMove} up=${count('mouseup') - baseUp}`);
    hardAssert(flatAfterClose, 'close must remove the document listener pair');
  }

  {
    window[KS_Q6] = false;
    const rs = freshInstance();
    const clone = makeClone();
    rs.makeCloneDraggable(clone);
    // Exit path (replay ends while float is open)
    if (typeof rs._removeFloatingReplayToolbarClone === 'function') {
      // Prefer the helper exitReplayMode would call; also exercise exit if available.
      rs.exitReplayMode();
    } else {
      clone.remove();
      userStorage.removeItem('replayToolbarClonePosition');
    }
    const flatAfterExit =
      count('mousemove') === baseMove && count('mouseup') === baseUp;
    note('Q6', 'fix-on-exit-flat-census', flatAfterExit,
      `move=${count('mousemove') - baseMove} up=${count('mouseup') - baseUp}`);
    hardAssert(flatAfterExit, 'exitReplayMode must remove the document listener pair');
  }

  {
    window[KS_Q6] = false;
    const rs = freshInstance();
    // Two float cycles must not accumulate.
    for (let i = 0; i < 2; i++) {
      const clone = makeClone();
      rs.makeCloneDraggable(clone);
      if (typeof rs._removeFloatingReplayToolbarClone === 'function') {
        rs._removeFloatingReplayToolbarClone();
      } else {
        clone.remove();
      }
    }
    const flatAfterCycles =
      count('mousemove') === baseMove && count('mouseup') === baseUp;
    note('Q6', 'fix-on-two-cycles-flat', flatAfterCycles,
      `move=${count('mousemove') - baseMove} up=${count('mouseup') - baseUp}`);
    hardAssert(flatAfterCycles, 'two float cycles must leave a flat document census');
  }

  {
    // Kill-switch OFF path: legacy accumulation (desired flat contract RED).
    window[KS_Q6] = true;
    const rs = freshInstance();
    const beforeMove = count('mousemove');
    const beforeUp = count('mouseup');
    const clone = makeClone();
    rs.makeCloneDraggable(clone);
    if (typeof rs._removeFloatingReplayToolbarClone === 'function') {
      rs._removeFloatingReplayToolbarClone();
    } else {
      clone.remove();
    }
    const leaked =
      count('mousemove') === beforeMove + 1 && count('mouseup') === beforeUp + 1;
    const desiredFlatHolds =
      count('mousemove') === beforeMove && count('mouseup') === beforeUp;
    note('Q6', 'kill-switch-restores-accumulation', leaked === true,
      `moveΔ=${count('mousemove') - beforeMove} upΔ=${count('mouseup') - beforeUp}`);
    note('Q6', 'switch-off-desired-flat-census-RED', desiredFlatHolds === false,
      `desiredFlat=${desiredFlatHolds}`);
    if (!softRed) {
      assert.equal(leaked, true, 'kill-switch must restore legacy listener leak');
      assert.equal(desiredFlatHolds, false, 'desired flat census must fail under kill-switch');
    }
  }

  window[KS_Q6] = false;
});

// ─── Evidence writer ───────────────────────────────────────────────────────

test('evidence writer', { skip: !evidenceMode }, () => {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const stamp = '20260724';
  const out = path.join(EVIDENCE_DIR, `W4-Q6-${stamp}-${evidenceMode}.json`);
  const failed = evidenceRows.filter((r) => !r.pass);
  let verdict = failed.length ? 'RED' : 'GREEN';
  if (evidenceMode === 'kill') {
    const disc = evidenceRows.filter((r) => String(r.name).includes('switch-off')
      || String(r.name).includes('kill-switch-restores'));
    const discOk = disc.length > 0 && disc.every((r) => r.pass);
    // Under kill mode, desired flat census is RED again (legacy leak returns).
    verdict = discOk ? 'RED' : 'FAIL-DISCRIMINATION';
  }
  if (evidenceMode === 'red') {
    // Pre-fix capture: desired teardown contracts are absent / census leaks.
    verdict = failed.length ? 'RED' : 'UNEXPECTED-GREEN';
  }
  const payload = {
    worker: 'W4',
    fix: 'Q6',
    mode: evidenceMode,
    stamp,
    killSwitch: KS_Q6,
    rows: evidenceRows,
    summary: {
      total: evidenceRows.length,
      pass: evidenceRows.length - failed.length,
      fail: failed.length,
    },
    verdict,
  };
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  process.stdout.write(`Wrote evidence ${out} verdict=${payload.verdict}\n`);
});
