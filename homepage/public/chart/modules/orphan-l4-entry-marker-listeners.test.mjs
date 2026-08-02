/**
 * ORPHAN-L4: OrderManager.drawEntryMarker d3 mouseenter/mouseleave release
 * on marker/chart dispose. Kill-switch restores the orphan.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/orphan-l4-entry-marker-listeners.test.mjs"
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const OM_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'order-manager.js');
const OM_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'order-manager.js');
const SWITCH = '__TALARIA_DISABLE_OM_ENTRY_MARKER_LISTENER_RELEASE_V1';
const SOURCE = fs.readFileSync(OM_JS, 'utf8');

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function methodSource(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    ${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) throw new Error(`method ${name} missing from order-manager.js`);
  return match[0];
}

function replaceOne(text, from, to, label) {
  const count = text.split(from).length - 1;
  assert.equal(count, 1, `${label} anchor count`);
  return text.replace(from, to);
}

const METHOD_NAMES = [
  '_omEntryMarkerListenerReleaseEnabled',
  '_releaseEntryMarkerHoverListeners',
  '_disposeEntryMarkerRecord',
  '_releaseEntryMarkerListenersForChart',
];

function omMethods(text) {
  return METHOD_NAMES.map((name) => methodSource(text, name)).join('\n');
}

class FakeMarker {
  constructor() {
    this.listeners = new Map();
    this.removed = false;
  }

  on(type, fn) {
    if (fn == null) this.listeners.delete(type);
    else this.listeners.set(type, fn);
    return this;
  }

  remove() {
    this.removed = true;
    return this;
  }

  count(type) {
    return this.listeners.has(type) ? 1 : 0;
  }
}

function makeRuntime(text = SOURCE) {
  const sandbox = { console, Date, Math };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(`
globalThis.window = {};
class HarnessOm {
    constructor() {
        this.entryMarkers = [];
        this.chart = { id: 'main' };
    }
${omMethods(text)}
}
globalThis.HarnessOm = HarnessOm;
`, context);
  return context;
}

function attachHover(marker) {
  marker.on('mouseenter', () => {});
  marker.on('mouseleave', () => {});
}

function assertDefaultReleasesOnTeardown(text = SOURCE) {
  const ctx = makeRuntime(text);
  const om = new ctx.HarnessOm();
  const chart = om.chart;
  const marker = new FakeMarker();
  attachHover(marker);
  om.entryMarkers.push({ marker, orderId: 1, chart });

  assert.equal(marker.count('mouseenter'), 1);
  assert.equal(marker.count('mouseleave'), 1);

  om._releaseEntryMarkerListenersForChart(chart);
  note('default-release-mouseenter', marker.count('mouseenter') === 0);
  note('default-release-mouseleave', marker.count('mouseleave') === 0);
  assert.equal(marker.count('mouseenter'), 0);
  assert.equal(marker.count('mouseleave'), 0);

  const marker2 = new FakeMarker();
  attachHover(marker2);
  om.entryMarkers = [{ marker: marker2, orderId: 2, chart }];
  om._disposeEntryMarkerRecord(om.entryMarkers[0]);
  note('dispose-removes-dom', marker2.removed === true);
  note('dispose-clears-listeners', marker2.count('mouseenter') === 0 && marker2.count('mouseleave') === 0);
  assert.equal(marker2.removed, true);
  assert.equal(marker2.count('mouseenter'), 0);
  assert.equal(marker2.count('mouseleave'), 0);
}

function assertKillRestoresOrphan(text = SOURCE) {
  const ctx = makeRuntime(text);
  ctx.window[SWITCH] = true;
  const om = new ctx.HarnessOm();
  const marker = new FakeMarker();
  attachHover(marker);
  om.entryMarkers.push({ marker, orderId: 7, chart: om.chart });

  om._releaseEntryMarkerListenersForChart(om.chart);
  note('kill-keeps-mouseenter', marker.count('mouseenter') === 1);
  note('kill-keeps-mouseleave', marker.count('mouseleave') === 1);
  assert.equal(marker.count('mouseenter'), 1);
  assert.equal(marker.count('mouseleave'), 1);

  om._disposeEntryMarkerRecord(om.entryMarkers[0]);
  note('kill-dispose-still-removes-dom', marker.removed === true);
  note('kill-dispose-leaves-listeners', marker.count('mouseenter') === 1 && marker.count('mouseleave') === 1);
  assert.equal(marker.removed, true);
  assert.equal(marker.count('mouseenter'), 1);
  assert.equal(marker.count('mouseleave'), 1);
}

function assertFlagTruthinessPerCall(text = SOURCE) {
  const ctx = makeRuntime(text);
  const om = new ctx.HarnessOm();

  delete ctx.window[SWITCH];
  assert.equal(om._omEntryMarkerListenerReleaseEnabled(), true, 'absent ⇒ ON');

  ctx.window[SWITCH] = false;
  assert.equal(om._omEntryMarkerListenerReleaseEnabled(), true, 'false ⇒ ON');

  ctx.window[SWITCH] = 0;
  assert.equal(om._omEntryMarkerListenerReleaseEnabled(), true, '0 ⇒ ON');

  ctx.window[SWITCH] = '';
  assert.equal(om._omEntryMarkerListenerReleaseEnabled(), true, '"" ⇒ ON');

  ctx.window[SWITCH] = true;
  assert.equal(om._omEntryMarkerListenerReleaseEnabled(), false, 'true ⇒ OFF');

  ctx.window[SWITCH] = 1;
  assert.equal(om._omEntryMarkerListenerReleaseEnabled(), false, '1 ⇒ OFF');

  ctx.window[SWITCH] = '1';
  assert.equal(om._omEntryMarkerListenerReleaseEnabled(), false, '"1" ⇒ OFF');

  // Per-call: flip mid-flight without reconstructing OM.
  delete ctx.window[SWITCH];
  assert.equal(om._omEntryMarkerListenerReleaseEnabled(), true, 'delete ⇒ ON again');
  ctx.window[SWITCH] = true;
  assert.equal(om._omEntryMarkerListenerReleaseEnabled(), false, 're-set ⇒ OFF');
  note('flag-truthiness-per-call', true);
}

function assertSeamsWired(text = SOURCE) {
  const strip = methodSource(text, '_stripOrderDrawingLayersFromChart');
  const multi = methodSource(text, '_syncOrderVisualsMultiPanel');
  const prune = methodSource(text, '_pruneMarkerRegistriesForChart');
  const m19 = methodSource(text, '_m19StripClosedTradeMarkers');
  const replay = methodSource(text, '_pruneReplayFutureTradeMarkers');
  const update = methodSource(text, '_updateEntryMarkersForChart');

  // Live call (not comment-wrapped) immediately before entry-marker DOM strip.
  assert.match(
    strip,
    /^\s*this\._releaseEntryMarkerListenersForChart\s*\(\s*chart\s*\)\s*;\s*$/m,
  );
  assert.match(multi, /^\s*this\._disposeEntryMarkerRecord\s*\(/m);
  assert.match(prune, /this\._disposeEntryMarkerRecord\s*\(/);
  assert.match(m19, /this\._disposeEntryMarkerRecord\s*\(/);
  assert.match(replay, /this\._disposeEntryMarkerRecord\s*\(/);
  assert.match(update, /this\._disposeEntryMarkerRecord\s*\(/);

  assert.match(text, /drawEntryMarker/);
  assert.match(methodSource(text, 'drawEntryMarker'), /\.on\(\s*['"]mouseenter['"]/);
  assert.match(methodSource(text, 'drawEntryMarker'), /\.on\(\s*['"]mouseleave['"]/);

  const gate = methodSource(text, '_omEntryMarkerListenerReleaseEnabled');
  assert.match(gate, /!!window\.__TALARIA_DISABLE_OM_ENTRY_MARKER_LISTENER_RELEASE_V1/);
  note('seams-wired', true);
}

test('ORPHAN-L4: default releases entry-marker hover listeners on teardown', () => {
  assertDefaultReleasesOnTeardown();
});

test('ORPHAN-L4: kill switch restores orphan listeners', () => {
  assertKillRestoresOrphan();
});

test('ORPHAN-L4: flag uses !! truthiness and is read per call', () => {
  assertFlagTruthinessPerCall();
});

test('ORPHAN-L4: dispose seams call release helpers', () => {
  assertSeamsWired();
});

test('ORPHAN-L4 mirror: homepage order-manager.js is byte-identical', () => {
  const a = fs.readFileSync(OM_JS);
  const b = fs.readFileSync(OM_MIRROR);
  const hash = sha256(a);
  note('mirror-byte-identical', a.equals(b), `sha256=${hash}`);
  assert.equal(sha256(b), hash);
});

test('ORPHAN-L4 mutants: drop release / invert gate go red', () => {
  const dropStripRelease = replaceOne(
    SOURCE,
    '        this._releaseEntryMarkerListenersForChart(chart);\n',
    '        // orphan-l4 release omitted\n',
    'drop strip release',
  );
  assert.throws(() => assertSeamsWired(dropStripRelease));
  note('mutant-killed:drop-strip-release', true);

  const invertGate = replaceOne(
    SOURCE,
    '        return !(typeof window !== \'undefined\'\n'
      + '            && !!window.__TALARIA_DISABLE_OM_ENTRY_MARKER_LISTENER_RELEASE_V1);',
    '        return !!(typeof window !== \'undefined\'\n'
      + '            && !!window.__TALARIA_DISABLE_OM_ENTRY_MARKER_LISTENER_RELEASE_V1);',
    'invert gate',
  );
  assert.throws(() => assertDefaultReleasesOnTeardown(invertGate));
  note('mutant-killed:invert-gate', true);

  const hasOwn = replaceOne(
    SOURCE,
    '        return !(typeof window !== \'undefined\'\n'
      + '            && !!window.__TALARIA_DISABLE_OM_ENTRY_MARKER_LISTENER_RELEASE_V1);',
    '        return !(typeof window !== \'undefined\'\n'
      + '            && Object.prototype.hasOwnProperty.call(window, "__TALARIA_DISABLE_OM_ENTRY_MARKER_LISTENER_RELEASE_V1"));',
    'hasOwnProperty flag',
  );
  assert.throws(() => assertFlagTruthinessPerCall(hasOwn));
  note('mutant-killed:flag-hasown', true);

  const skipOnNull = replaceOne(
    SOURCE,
    '        try { marker.on(\'mouseenter\', null); } catch (_) { /* ignore */ }\n'
      + '        try { marker.on(\'mouseleave\', null); } catch (_) { /* ignore */ }',
    '        /* try { marker.on(\'mouseenter\', null); } catch (_) {} */\n'
      + '        /* try { marker.on(\'mouseleave\', null); } catch (_) {} */',
    'skip on-null',
  );
  assert.throws(() => assertDefaultReleasesOnTeardown(skipOnNull));
  note('mutant-killed:skip-on-null', true);
});
