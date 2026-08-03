#!/usr/bin/env node
/**
 * DEF-05(a) — the chart survives loss of its 2D backing store and repaints itself.
 *
 * THE DEFECT
 * ----------
 * `this.ctx` is acquired exactly once, in the Chart constructor, and resize() reuses it
 * rather than re-acquiring. When the browser discards a canvas backing store under GPU
 * pressure -- which a four-up grid plus a ten-hour soak is an efficient way to produce --
 * every subsequent draw went to a dead context. The panel stayed black, with no error and
 * nothing in the console. That is the three-black-panels-after-refresh death.
 *
 * ON THE WEBGL HALF OF THE ROW
 * ----------------------------
 * Not implemented, deliberately. There is no WebGL in this codebase: every rendering context
 * in the served bundle is getContext('2d'). `webglcontextlost` only fires on a WebGL context,
 * so listeners for it would be present, mirrored, and incapable of ever firing -- a fix bound
 * to nothing. The cell below asserts that absence on purpose, so that if WebGL is ever
 * introduced this gate goes red and the decision is revisited rather than inherited.
 *
 * METHOD
 * ------
 * The Chart class needs d3 and a live DOM, so the three methods under test are lifted out of
 * the shipped chart.js by brace-matching and run against a fake canvas. The extraction reads
 * the real file, so the gate cannot pass against source that no longer contains the fix.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

console.log('SEAL-EVIDENCE-01 EVIDENCE CLASS: SANDBOX_SIM — product source is executed here in a synthetic realm against stubs this gate wrote. Green means the logic behaves against those stubs, NOT that the shipped product does. A row can be green here and inert in the browser.');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const CANON = path.join(ROOT, 'chart v 1.4', 'chart', 'chart.js');
const MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'chart.js');

let pass = 0;
let fail = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n          expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`}`);
};

const src = fs.readFileSync(CANON, 'utf8');

/** Lift `name(...) { ... }` out of the class body by matching braces from its opening one. */
function extractMethod(source, name) {
  const at = source.indexOf(`\n    ${name}(`);
  if (at < 0) throw new Error(`method ${name} not found in chart.js`);
  const open = source.indexOf('{', source.indexOf('(', at + 1));
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return source.slice(at + 1, i + 1);
    }
  }
  throw new Error(`unbalanced braces extracting ${name}`);
}

const FLAG_HELPER = (() => {
  const at = src.indexOf('function _talariaDisableFlagTruthy(');
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error('could not extract _talariaDisableFlagTruthy');
})();

const METHODS = ['_canvasContextRecoveryV1Enabled', '_installCanvasContextRecovery', '_recoverCanvasContext']
  .map((m) => extractMethod(src, m));

/** A canvas that can lose and regain its context, and hand out a distinguishable one each time. */
function makeHarness({ killSwitch = false, dpr = 2 } = {}) {
  const listeners = new Map();
  let contextSerial = 0;
  const newCtx = () => {
    contextSerial++;
    return { __serial: contextSerial, transforms: [], scales: [],
      setTransform(...a) { this.transforms.push(a); },
      scale(...a) { this.scales.push(a); } };
  };
  const canvas = {
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener() {},
    getContext: () => newCtx(),
  };
  const win = { devicePixelRatio: dpr };
  if (killSwitch) win.__TALARIA_DISABLE_CANVAS_CONTEXT_RECOVERY_V1 = true;
  win.window = win; win.parent = win; win.top = win;

  const sandbox = {
    window: win,
    console: { log() {}, warn() {}, error() {} },
    __out: {},
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(
    `${FLAG_HELPER}\nglobalThis.__out.proto = { ${METHODS.join(',\n')} };`,
    ctx,
    { filename: 'chart.js#def05a' },
  );

  const painted = [];
  const tracked = [];
  const chart = Object.create(sandbox.__out.proto);
  chart.canvas = canvas;
  chart.ctx = newCtx();
  chart._indLayerCanvas = { stale: true };
  chart._indLayerCtx = { stale: true };
  chart.renderPending = true;
  chart.render = function () { painted.push(Date.now()); };
  chart._trackListener = function (target, type, handler, options) {
    tracked.push({ target, type, handler, options });
    target.addEventListener(type, handler, options);
    return handler;
  };

  const fire = (type) => {
    let defaultPrevented = false;
    const ev = { type, preventDefault() { defaultPrevented = true; } };
    for (const h of listeners.get(type) || []) h(ev);
    return defaultPrevented;
  };
  return { chart, fire, listeners, painted, tracked, canvas };
}

console.log('\n=== PRESENT: the handlers, the switch and the re-acquisition are in the shipped file ===');
{
  check('a contextlost listener is registered', /'contextlost'/.test(src), true);
  check('a contextrestored listener is registered', /'contextrestored'/.test(src), true);
  check('the switch __TALARIA_DISABLE_CANVAS_CONTEXT_RECOVERY_V1 exists',
    src.includes('__TALARIA_DISABLE_CANVAS_CONTEXT_RECOVERY_V1'), true);
  check('recovery re-acquires the context rather than reusing the dead one',
    /_recoverCanvasContext\(\)\s*\{[\s\S]{0,400}getContext\('2d'\)/.test(src), true);
  check('and is installed from the constructor at the point of acquisition',
    /this\.ctx = this\.canvas\.getContext\('2d'\);[\s\S]{0,220}this\._installCanvasContextRecovery\(\);/.test(src), true);
  check('handlers go through _trackListener, so destroy() releases them',
    /_installCanvasContextRecovery\(\)\s*\{[\s\S]{0,1200}this\._trackListener\(this\.canvas, 'contextrestored'/.test(src), true);
}

console.log('\n=== BOUND: a lost-then-restored context re-acquires and repaints ===');
{
  const h = makeHarness();
  h.chart._installCanvasContextRecovery();
  check('both events are subscribed at install', h.listeners.has('contextlost') && h.listeners.has('contextrestored'), true);

  const ctxBefore = h.chart.ctx.__serial;
  const prevented = h.fire('contextlost');
  check('contextlost is cancelled, which is what makes the browser send contextrestored', prevented, true);
  check('and the loss is recorded', h.chart._canvasContextLost, true);
  check('no repaint is attempted while the surface is gone', h.painted.length, 0);

  const t0 = Date.now();
  h.fire('contextrestored');
  const elapsed = Date.now() - t0;

  check('the context is re-acquired, not the dead one reused', h.chart.ctx.__serial !== ctxBefore, true);
  check('the panel repaints', h.painted.length, 1);
  check('ORACLE: repaint happens within 2s of restore', elapsed < 2000, true);
  check('the DPR transform is reapplied, so a HiDPI panel is not left painting at 1x',
    JSON.stringify(h.chart.ctx.scales[0]), JSON.stringify([2, 2]));
  check('the transform is reset before scaling, matching resize()',
    JSON.stringify(h.chart.ctx.transforms[0]), JSON.stringify([1, 0, 0, 1, 0, 0]));
  check('the indicator layer cache is dropped, since it held a context off the same dead surface',
    h.chart._indLayerCtx, null);
  check('and the lost flag is cleared, so a second loss is handled too', h.chart._canvasContextLost, false);
}

console.log('\n=== a second loss/restore cycle also recovers, so this is not a one-shot ===');
{
  const h = makeHarness();
  h.chart._installCanvasContextRecovery();
  h.fire('contextlost'); h.fire('contextrestored');
  const afterFirst = h.chart.ctx.__serial;
  h.fire('contextlost'); h.fire('contextrestored');
  check('the second restore re-acquires again', h.chart.ctx.__serial !== afterFirst, true);
  check('and repaints again', h.painted.length, 2);
}

console.log('\n=== DISCRIMINATING: with the switch on, the panel stays dead ===');
{
  const h = makeHarness({ killSwitch: true });
  check('the switch really is off', h.chart._canvasContextRecoveryV1Enabled(), false);
  h.chart._installCanvasContextRecovery();
  const ctxBefore = h.chart.ctx.__serial;
  h.fire('contextlost');
  h.fire('contextrestored');
  check('THE RED: nothing is subscribed', h.listeners.size, 0);
  check('THE RED: the dead context is still in place', h.chart.ctx.__serial, ctxBefore);
  check('THE RED: no repaint ever happens -- this is the black panel', h.painted.length, 0);
}

console.log('\n=== the WebGL half is absent ON PURPOSE, and stays that way ===');
{
  const webglContexts = /getContext\(\s*['"](?:webgl2?|experimental-webgl)['"]/.test(src);
  check('there is still no WebGL context anywhere in chart.js', webglContexts, false);
  check('so no webglcontextlost listener is shipped, because it could never fire',
    /addEventListener\(\s*['"]webglcontextlost/.test(src), false);
  check('and the reasoning is recorded next to the code, not only in a commit message',
    /no WebGL in this codebase/.test(src), true);
}

console.log('\n=== MIRRORED: the browser runs what was reviewed here ===');
{
  const a = fs.readFileSync(CANON);
  const b = fs.readFileSync(MIRROR);
  check('chart.js byte-identical canonical vs mirror', a.equals(b), true);
}

console.log(`\n================ DEF-05(a): ${pass} passed, ${fail} failed ================\n`);
process.exitCode = fail === 0 ? 0 : 1;
