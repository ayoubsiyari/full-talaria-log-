/**
 * CPU-CUT-CSS-IDEMPOTENT — skip no-op textContent writes on the legend hover
 * <style> element.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/ind-legend-css-idempotent.test.mjs"
 *
 * Defect: ensureTalariaIndLegendHoverCss() reassigned s.textContent = css on
 * every call even when the element already held the identical literal CSS,
 * forcing StyleEngine invalidations (~62/sec measured on the live instrument).
 *
 * Kill-switch: window.__TALARIA_DISABLE_IND_LEGEND_CSS_IDEMPOTENT_V1
 *   absent/falsy => fix ON (skip byte-identical writes)
 *   truthy       => legacy unconditional write
 * Flag is read per call; never sampled at module load.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = path.resolve(__dirname, '..', '..', '..');
const SRC = path.join(__dirname, 'indicator-ui.js');
const MIRROR = path.join(
  WORKTREE_ROOT,
  'homepage',
  'public',
  'chart',
  'modules',
  'indicator-ui.js',
);
const SWITCH = '__TALARIA_DISABLE_IND_LEGEND_CSS_IDEMPOTENT_V1';
const STYLE_ID = 'talaria-ind-legend-hover-css';
const N = 60;

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function extractEnsureFn(source) {
  const fnStart = source.indexOf('function ensureTalariaIndLegendHoverCss()');
  assert.ok(fnStart >= 0, 'ensureTalariaIndLegendHoverCss missing');
  const end = source.indexOf('\nfunction talariaCrosshairBarIndex', fnStart);
  assert.ok(end > fnStart, 'talariaCrosshairBarIndex sentinel missing after ensure fn');
  // Include an immediately-preceding load-time sample of the kill-switch when
  // present (mutation: flag sampled once at module load). Clean source has none.
  let start = fnStart;
  const lookback = source.slice(Math.max(0, fnStart - 500), fnStart);
  const switchAt = lookback.lastIndexOf(SWITCH);
  if (switchAt >= 0) {
    const abs = Math.max(0, fnStart - 500) + switchAt;
    start = source.lastIndexOf('\n', abs) + 1;
  }
  return source.slice(start, end);
}

function expectedCss() {
  return [
    '@media (hover: hover) and (pointer: fine) {',
    '  .talaria-ind-legend-row .talaria-ind-actions {',
    '    opacity: 0;',
    '    transition: opacity 0.12s ease;',
    '    pointer-events: none;',
    '  }',
    '  .talaria-ind-legend-row:hover .talaria-ind-actions {',
    '    opacity: 1;',
    '    pointer-events: auto;',
    '  }',
    '}',
    '#chart-container #chartWrapper .ohlc-indicators,',
    '#panels-container .ohlc-indicators,',
    '.ohlc-indicators {',
    '  pointer-events: auto;',
    '  position: relative;',
    '  z-index: 100;',
    '}',
    '#ohlcIndicators .talaria-ind-legend-row .talaria-ind-actions,',
    '.ohlc-indicators .talaria-ind-legend-row .talaria-ind-actions,',
    '#separatePanelsOverlay .talaria-ind-legend-row .talaria-ind-actions {',
    '  pointer-events: auto !important;',
    '}',
    '#separatePanelsOverlay .talaria-ind-legend-row .talaria-ind-actions {',
    '  opacity: 1;',
    '}',
  ].join('\n');
}

/** Style element whose textContent setter is counted. */
function makeStyleEl(initial = '') {
  let value = initial;
  let writes = 0;
  const el = { id: STYLE_ID };
  Object.defineProperty(el, 'textContent', {
    configurable: true,
    enumerable: true,
    get() {
      return value;
    },
    set(next) {
      writes += 1;
      value = String(next);
    },
  });
  return {
    el,
    writes: () => writes,
    resetWrites() {
      writes = 0;
    },
    setValueSilent(next) {
      value = String(next);
    },
  };
}

function loadHarness({
  source = fs.readFileSync(SRC, 'utf8'),
  flag,
  preseed = false,
  preseedText = '',
} = {}) {
  const headKids = [];
  const head = {
    appendChild(node) {
      headKids.push(node);
      return node;
    },
    children: headKids,
  };
  let styleHandle = null;
  if (preseed) {
    styleHandle = makeStyleEl(preseedText);
    headKids.push(styleHandle.el);
  }
  const document = {
    head,
    getElementById(id) {
      if (id === STYLE_ID && styleHandle) return styleHandle.el;
      return null;
    },
    createElement(tag) {
      assert.equal(String(tag).toLowerCase(), 'style');
      styleHandle = makeStyleEl('');
      return styleHandle.el;
    },
  };
  const windowObj = {};
  if (flag !== undefined) windowObj[SWITCH] = flag;

  const sandbox = { document, window: windowObj, console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(extractEnsureFn(source), sandbox, { filename: 'indicator-ui-ensure.js' });
  assert.equal(typeof sandbox.ensureTalariaIndLegendHoverCss, 'function');

  return {
    call() {
      sandbox.ensureTalariaIndLegendHoverCss();
    },
    window: windowObj,
    document,
    headKids,
    styleWrites: () => (styleHandle ? styleHandle.writes() : 0),
    styleEl: () => (styleHandle ? styleHandle.el : null),
    styleText: () => (styleHandle ? styleHandle.el.textContent : null),
    resetWrites() {
      if (styleHandle) styleHandle.resetWrites();
    },
    mutateText(next) {
      assert.ok(styleHandle, 'style element must exist before mutate');
      styleHandle.setValueSilent(next);
    },
  };
}

test('fix ON: N calls with the element present produce exactly ONE textContent write', () => {
  // Element already present (empty). First call fills; remaining N-1 skip.
  const h = loadHarness({ preseed: true, preseedText: '' });
  h.resetWrites();
  for (let i = 0; i < N; i++) h.call();
  const writes = h.styleWrites();
  note('fix-on-one-write', writes === 1, `writes=${writes} across ${N} calls`);
  assert.equal(writes, 1, `fix ON must write exactly once across ${N} calls (spy saw ${writes})`);
  assert.equal(h.styleText(), expectedCss());
});

test('fix ON: externally changed textContent is rewritten on next call', () => {
  const h = loadHarness({ preseed: true, preseedText: expectedCss() });
  h.resetWrites();
  h.mutateText('/* externally mutated */');
  h.call();
  const writes = h.styleWrites();
  note('fix-on-external-mutate-rewrites', writes === 1, `writes=${writes}`);
  assert.equal(writes, 1, 'external mutation must force one rewrite');
  assert.equal(h.styleText(), expectedCss(), 'rewritten to canonical CSS');
});

test('fix ON: absent element is still created and appended (first-call path)', () => {
  const h = loadHarness();
  assert.equal(h.document.getElementById(STYLE_ID), null);
  h.call();
  const el = h.styleEl();
  assert.ok(el, 'style element created');
  assert.equal(el.id, STYLE_ID);
  assert.equal(h.headKids[0], el, 'appended to head');
  assert.equal(h.styleWrites(), 1, 'create path writes once');
  assert.equal(h.styleText(), expectedCss());
  note('fix-on-create-path', true, 'created+appended');
});

test('fix OFF: N calls produce N writes (legacy exactly)', () => {
  const h = loadHarness({ flag: true, preseed: true, preseedText: expectedCss() });
  h.resetWrites();
  for (let i = 0; i < N; i++) h.call();
  const writes = h.styleWrites();
  note('fix-off-n-writes', writes === N, `writes=${writes}`);
  assert.equal(writes, N, `legacy must write on every call (got ${writes})`);
});

test('flag read per call: truthy then absent restores fix without reload', () => {
  const h = loadHarness({ flag: true, preseed: true, preseedText: expectedCss() });
  h.resetWrites();
  for (let i = 0; i < 5; i++) h.call();
  assert.equal(h.styleWrites(), 5, 'truthy flag => legacy writes');
  delete h.window[SWITCH];
  h.resetWrites();
  for (let i = 0; i < N; i++) h.call();
  const writes = h.styleWrites();
  note('flag-per-call-restore', writes === 0, `writes=${writes} after flag cleared`);
  assert.equal(writes, 0, 'clearing flag mid-session must restore idempotent skip');
});

test('flag polarity: falsy values keep fix ON (not === true sampling)', () => {
  for (const falsy of [false, 0, '', null, undefined]) {
    const h = loadHarness({
      flag: falsy,
      preseed: true,
      preseedText: expectedCss(),
    });
    if (falsy === undefined) h.window[SWITCH] = undefined;
    h.resetWrites();
    for (let i = 0; i < 10; i++) h.call();
    assert.equal(
      h.styleWrites(),
      0,
      `falsy flag=${JSON.stringify(falsy)} must keep fix ON`,
    );
  }
  // truthy non-true must turn fix OFF (kills === true mutant)
  const hTruthy = loadHarness({ flag: 1, preseed: true, preseedText: expectedCss() });
  hTruthy.resetWrites();
  for (let i = 0; i < 10; i++) hTruthy.call();
  assert.equal(hTruthy.styleWrites(), 10, 'truthy 1 must disable fix (not === true)');
  const hStr = loadHarness({ flag: '1', preseed: true, preseedText: expectedCss() });
  hStr.resetWrites();
  for (let i = 0; i < 10; i++) hStr.call();
  assert.equal(hStr.styleWrites(), 10, "truthy '1' must disable fix");
  note('flag-polarity-truthiness', true);
});

test('css is built only from string literals (byte-identity of skipped write)', () => {
  const source = fs.readFileSync(SRC, 'utf8');
  const fn = extractEnsureFn(source);
  assert.equal(
    (fn.match(/\$\{/g) || []).length,
    0,
    'ensure fn must not interpolate into css',
  );
  assert.match(fn, /const css = \[[\s\S]*?\]\.join\('\\n'\)/);
  const h = loadHarness({ source });
  h.call();
  assert.equal(h.styleText(), expectedCss(), 'runtime css matches literal recompute');
  note('literal-css-byte-identity', true);
});

test('source: inequality guard + per-call flag present once', () => {
  const source = fs.readFileSync(SRC, 'utf8');
  const fn = extractEnsureFn(source);
  const guard = 'disableIndLegendCssIdempotentV1 || s.textContent !== css';
  const flagRead = 'window.__TALARIA_DISABLE_IND_LEGEND_CSS_IDEMPOTENT_V1';
  assert.equal(fn.split(guard).length - 1, 1, 'inequality guard once in ensure fn');
  assert.equal(fn.split(flagRead).length - 1, 1, 'flag read once inside ensure fn');
  const before = source.slice(0, source.indexOf('function ensureTalariaIndLegendHoverCss()'));
  assert.equal(
    before.includes(SWITCH),
    false,
    'flag must not be sampled before ensureTalariaIndLegendHoverCss',
  );
  note('source-guard-anchor', true);
});

test('mirrors: chart v 1.4 and homepage/public indicator-ui.js are byte-identical', () => {
  const a = fs.readFileSync(SRC);
  const b = fs.readFileSync(MIRROR);
  const hash = sha256(a);
  note('mirror-byte-identical', a.equals(b), `sha256=${hash}`);
  assert.equal(sha256(b), hash, 'homepage mirror must be byte-identical');
});
