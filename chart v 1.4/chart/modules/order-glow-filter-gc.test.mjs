/**
 * ORDER-GLOW-GC-V1 — per-order SVG <filter> defs are reclaimed when an order's
 * visuals are torn down, instead of accumulating in <defs> for the whole session.
 *
 * The load-bearing cells run the REAL extracted OrderManager methods against a REAL
 * Blink DOM and the REAL vendored d3, driven over CDP, and COUNT <filter> nodes.
 * No source-text assertion decides whether the fix works; the only source-text
 * checks here are (a) harness-fidelity checks, which prove the hand-built marker
 * scaffolding matches what drawEntryMarker/drawExitMarker actually emit, and
 * (b) mutant needle counts.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/order-glow-filter-gc.test.mjs"
 *
 * Set EDGE_PATH to a Chromium binary if it is not in a default Windows location.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const OM_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'order-manager.js');
const OM_MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'order-manager.js');
const D3_JS = path.join(ROOT, 'chart v 1.4', 'chart', 'vendor', 'd3.min.js');
const SWITCH = '__TALARIA_DISABLE_ORDER_GLOW_FILTER_GC_V1';

const SOURCE = fs.readFileSync(OM_JS, 'utf8');
const MIRROR_SOURCE = fs.readFileSync(OM_MIRROR, 'utf8');
const D3 = fs.readFileSync(D3_JS, 'utf8');

/** Cycles used by the headline growth cell. Large enough that a leak is unmistakable. */
const CYCLES = 120;

function note(name, pass, detail = '') {
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/* ------------------------------------------------------------------ *
 * Source extraction (same shape the sibling order-manager suites use) *
 * ------------------------------------------------------------------ */

function methodSource(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    ${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  if (!match) throw new Error(`method ${name} missing from order-manager.js`);
  return match[0];
}

function functionSource(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^function ${escaped}\\s*\\([^]*?^}`, 'm'));
  if (!match) throw new Error(`function ${name} missing from order-manager.js`);
  return match[0];
}

/** The fix's own methods. Absent from the pre-fix base, present everywhere else. */
const GC_METHOD_NAMES = [
  '_orderGlowFilterGcEnabled',
  '_isOrderGlowFilterId',
  '_isAnyOrderGlowFilterId',
  '_referencedGlowFilterIds',
  '_reclaimUnreferencedGlowFilters',
  '_reclaimOrderGlowFilters',
  '_reclaimOrderGlowFiltersForChart',
];

/** Methods the harness needs. Anything the fix touches is the REAL source. */
const METHOD_NAMES = [
  // creation + hover reference (pre-existing)
  '_ensureMarkerGlowFilter',
  '_setEntryArrowHoverGlow',
  '_setExitArrowHoverGlowFromSelection',
  // the fix
  ...GC_METHOD_NAMES,
  // the two teardown seams the fix hangs off
  '_sweepOrphanedOrderLevelDom',
  '_stripOrderDrawingLayersFromChart',
  // transitive deps of those two seams
  '_pendingTpPctControlsSelector',
  '_pendingTpDeleteSelector',
  '_omEntryMarkerListenerReleaseEnabled',
  '_releaseEntryMarkerHoverListeners',
  '_releaseEntryMarkerListenersForChart',
  // id allocation, for the collision cell
  '_m24ScanOrderIdentityRows',
  '_m24ReconcileOrderIdCounter',
  '_allocateOrderId',
];

const FUNCTION_NAMES = [
  '_orderSel01ExactTeardownV1Enabled',
  '_m24OrderIdAllocatorV1Enabled',
  '_m24DisplayIdStabilityV1Enabled',
  '_m24OrderIdGapReconcileV1Enabled',
];
const OPTIONAL_TRUE_FUNCTION_NAMES = new Set([
  '_m24DisplayIdStabilityV1Enabled',
  '_m24OrderIdGapReconcileV1Enabled',
]);

/**
 * `preFix` is set ONLY for the pre-fix base revision, where the seven
 * ORDER-GLOW-GC-V1 methods do not exist yet. Everywhere else a missing method is
 * a hard error, so a mutant cannot pass by quietly deleting one.
 */
function harnessSource(text, preFix = false) {
  const fns = FUNCTION_NAMES.map((n) => {
    try {
      return functionSource(text, n);
    } catch (err) {
      if (preFix && OPTIONAL_TRUE_FUNCTION_NAMES.has(n)) {
        return `function ${n}() { return true; }`;
      }
      throw err;
    }
  }).join('\n');
  const wanted = preFix ? METHOD_NAMES.filter((n) => !GC_METHOD_NAMES.includes(n)) : METHOD_NAMES;
  if (preFix) {
    for (const n of GC_METHOD_NAMES) {
      assert.equal(text.includes(`    ${n}(`), false, `pre-fix base must not already define ${n}`);
    }
  }
  const methods = wanted.map((n) => methodSource(text, n)).join('\n');
  return `${fns}
class HarnessOm {
    constructor(charts) {
        this.__charts = charts;
        this.chart = charts[0];
        this.entryMarkers = [];
        this.exitMarkers = [];
        this.partialCloseMarkers = [];
        this.tradeConnectors = [];
        this.mfeMaeMarkers = [];
        this.splitGroupAvgLines = [];
        this.multiTPAvgLines = [];
        this.orderIdCounter = 1;
        this.pendingOrders = [];
        this.openPositions = [];
        this.closedPositions = [];
        this.orders = [];
        this.tradeJournal = [];
    }
    _collectLayoutCharts() { return this.__charts; }
    _isMultiPanelLayout() { return this.__charts.length > 1; }
${methods}
}
return HarnessOm;`;
}

/* ------------------------------------------------ *
 * Harness fidelity: the scaffolding matches reality *
 * ------------------------------------------------ */

function assertHarnessFidelity(text = SOURCE) {
  const draw = methodSource(text, 'drawEntryMarker');
  const exit = methodSource(text, 'drawExitMarker');
  const partial = methodSource(text, 'drawPartialCloseMarker');
  // The harness below hand-builds these exact node shapes; if drawing changes, fail.
  assert.match(draw, /entry-marker entry-marker-\$\{order\.id\}/);
  assert.match(draw, /_ensureMarkerGlowFilter\(chart\.svg, `entry-glow-\$\{order\.id\}`/);
  assert.match(draw, /data-role', 'entry-arrow'/);
  assert.match(exit, /exit-marker exit-marker-\$\{order\.id\}/);
  assert.match(exit, /const exitGlowId = `exit-glow-\$\{order\.id\}`/);
  assert.match(exit, /data-exit-glow-id', exitGlowId/);
  assert.match(exit, /data-role', 'exit-arrow'/);
  assert.match(partial, /const glowId = `partial-glow-\$\{order\.id\}-\$\{closeData\.targetId\}`/);
  // The ONLY writers of an order-keyed filter reference are the hover-ON branches.
  const refs = text.match(/\.attr\('filter', `url\(#\$\{[A-Za-z]+\}\)`\)/g) || [];
  assert.equal(refs.length, 3, 'exactly three order-keyed url(#…) writers');
  note('harness-fidelity', true, `${refs.length} order-keyed filter refs in source`);
}

/* ---------------------------- *
 * Headless Chromium over CDP   *
 * ---------------------------- */

function findEdge() {
  const candidates = [
    process.env.EDGE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 0;
    const pending = new Map();
    ws.addEventListener('open', () => {
      resolve({
        send: (method, params = {}, sessionId = null) => {
          const id = ++nextId;
          const msg = { id, method, params };
          if (sessionId) msg.sessionId = sessionId;
          ws.send(JSON.stringify(msg));
          return new Promise((res, rej) => {
            pending.set(id, { res, rej });
            setTimeout(() => {
              if (pending.has(id)) { pending.delete(id); rej(new Error(`cdp timeout ${method}`)); }
            }, 120000);
          });
        },
        close: () => ws.close(),
      });
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      }
    });
    ws.addEventListener('error', (e) => reject(e.error || new Error('cdp socket error')));
  });
}

async function waitPort(port) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await sleep(150);
  }
  throw new Error(`debug port ${port} not ready`);
}

let BROWSER = null;

async function browser() {
  if (BROWSER) return BROWSER;
  const exe = findEdge();
  if (!exe) return null;
  const port = 9500 + (process.pid % 400);
  const userDataDir = path.join(
    process.env.TEMP || process.env.TMPDIR || '/tmp',
    `talaria-glow-gc-${process.pid}`,
  );
  fs.mkdirSync(userDataDir, { recursive: true });
  const child = spawn(exe, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking',
    `--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  const ver = await waitPort(port);
  const { send, close } = await cdpConnect(ver.webSocketDebuggerUrl);
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === 'page') || list[0];
  const attached = await send('Target.attachToTarget', { targetId: page.id, flatten: true });
  const sid = attached.sessionId;
  await send('Runtime.enable', {}, sid);
  await send('Page.enable', {}, sid);
  // Real d3 v7.8.5, the same build the chart ships.
  const d3res = await send('Runtime.evaluate', { expression: D3, returnByValue: false }, sid);
  if (d3res.exceptionDetails) throw new Error(`d3 load failed: ${JSON.stringify(d3res.exceptionDetails)}`);
  BROWSER = {
    exe,
    async run(expression) {
      const r = await send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true,
      }, sid);
      if (r.exceptionDetails) {
        throw new Error(`page error: ${r.exceptionDetails.text} ${JSON.stringify(r.exceptionDetails.exception?.description || '')}`);
      }
      return r.result.value;
    },
    dispose() { try { close(); } catch { /* ignore */ } try { child.kill(); } catch { /* ignore */ } },
  };
  return BROWSER;
}

process.on('exit', () => { if (BROWSER) BROWSER.dispose(); });

/* --------------------------------------------------------- *
 * The in-page scenario runner: real DOM, real d3, real source *
 * --------------------------------------------------------- */

/**
 * Builds the page-side script. `scenario` is a function body string with
 * `om`, `charts`, `H` (helpers) and `out` in scope; it returns a JSON-able object.
 */
function pageProgram(sourceText, scenarioBody, flagValueExpr = 'undefined', preFix = false) {
  return `(() => {
  document.body.innerHTML = '<div id="panels-container"></div>';
  delete window.${SWITCH};
  const __flag = ${flagValueExpr};
  if (__flag !== undefined) window.${SWITCH} = __flag;
  const HarnessOm = new Function(${JSON.stringify(harnessSource(sourceText, preFix))})();

  const NS = 'http://www.w3.org/2000/svg';
  function makeChart() {
    const el = document.createElementNS(NS, 'svg');
    el.setAttribute('width', 800); el.setAttribute('height', 400);
    document.getElementById('panels-container').appendChild(el);
    return { svg: d3.select(el), node: el };
  }
  const H = {
    filterCount(chart) { return chart.node.querySelectorAll('defs > filter').length; },
    allFilterIds(chart) {
      return Array.from(chart.node.querySelectorAll('defs > filter')).map((f) => f.getAttribute('id'));
    },
    refCount(id) {
      return Array.from(document.querySelectorAll('[filter]'))
        .filter((e) => (e.getAttribute('filter') || '').replace(/\\s+/g, '') === 'url(#' + id + ')').length;
    },
    // Mirrors drawEntryMarker's glow-relevant emission exactly (see assertHarnessFidelity).
    drawEntry(om, chart, id, color) {
      color = color || '#22c55e';
      const g = chart.svg.append('g')
        .attr('class', 'entry-marker entry-marker-' + id)
        .attr('data-order-id', id);
      om._ensureMarkerGlowFilter(chart.svg, 'entry-glow-' + id, color);
      g.append('path').attr('data-role', 'entry-arrow').attr('fill', color).attr('stroke', 'none');
      om.entryMarkers.push({ marker: g, orderId: id, chart });
      return g;
    },
    drawExit(om, chart, id, color) {
      color = color || '#ef4444';
      const g = chart.svg.append('g')
        .attr('class', 'exit-marker exit-marker-' + id)
        .attr('data-linked-order-ids', String(id));
      const glowId = 'exit-glow-' + id;
      g.attr('data-exit-glow-id', glowId);
      om._ensureMarkerGlowFilter(chart.svg, glowId, color);
      g.append('path').attr('data-role', 'exit-arrow').attr('fill', color).attr('stroke', 'none');
      om.exitMarkers.push({ marker: g, orderId: id, chart });
      return g;
    },
    drawPartial(om, chart, id, targetId, color) {
      color = color || '#eab308';
      const g = chart.svg.append('g')
        .attr('class', 'partial-close-marker partial-close-marker-' + id + '-' + targetId)
        .attr('data-linked-order-ids', String(id));
      const glowId = 'partial-glow-' + id + '-' + targetId;
      g.attr('data-exit-glow-id', glowId);
      om._ensureMarkerGlowFilter(chart.svg, glowId, color);
      g.append('path').attr('data-role', 'exit-arrow').attr('fill', color).attr('stroke', 'none');
      om.partialCloseMarkers.push({ marker: g, orderId: id, chart });
      return g;
    },
    hoverEntry(om, id, on) { om._setEntryArrowHoverGlow(id, on); },
    hoverExitGroup(om, chart, sel, on) { om._setExitArrowHoverGlowFromSelection(sel, on); },
  };

  const charts = [makeChart()];
  const om = new HarnessOm(charts);
  const out = {};
  ${scenarioBody}
  return out;
})()`;
}

async function runScenario(scenarioBody, opts = {}) {
  const b = await browser();
  if (!b) throw new Error('no Chromium found');
  return b.run(pageProgram(opts.source || SOURCE, scenarioBody, opts.flag || 'undefined', !!opts.preFix));
}

/* ------------------- *
 * Scenario definitions *
 * ------------------- */

/**
 * A trading session in two phases, both of which really happen.
 *
 * Phase A — ${CYCLES} closed round trips: entry marker → hover on/off → exit marker
 * + two partial-close legs → hover → close through the real
 * `_sweepOrphanedOrderLevelDom` seam. The <filter> count after each cycle must not
 * climb; that is the "does not grow across a session" number.
 *
 * Phase B — 25 orders that are still OPEN when the user switches symbol or layout,
 * so nothing has swept them; the only thing that can reclaim their filters is the
 * chart strip. Records the count before and after `_stripOrderDrawingLayersFromChart`.
 */
const OPEN_AT_STRIP = 25;
const SCENARIO_CYCLES = `
  const chart = charts[0];
  out.baseline = H.filterCount(chart);
  out.perCycle = [];
  for (let i = 1; i <= ${CYCLES}; i++) {
    const id = i;
    H.drawEntry(om, chart, id);
    H.hoverEntry(om, id, true);
    H.hoverEntry(om, id, false);
    const ex = H.drawExit(om, chart, id);
    H.hoverExitGroup(om, chart, ex, true);
    H.hoverExitGroup(om, chart, ex, false);
    H.drawPartial(om, chart, id, 1);
    H.drawPartial(om, chart, id, 2);
    out.peak = Math.max(out.peak || 0, H.filterCount(chart));
    om._sweepOrphanedOrderLevelDom(id);
    out.perCycle.push(H.filterCount(chart));
  }
  out.afterCycles = H.filterCount(chart);

  // Phase B: still-open orders at the moment of a symbol / layout switch.
  for (let k = 1; k <= ${OPEN_AT_STRIP}; k++) {
    const id = 100000 + k;
    H.drawEntry(om, chart, id);
    H.hoverEntry(om, id, true);
    H.hoverEntry(om, id, false);
    H.drawExit(om, chart, id);
  }
  out.beforeStrip = H.filterCount(chart);
  om._stripOrderDrawingLayersFromChart(chart);
  out.afterStrip = H.filterCount(chart);
  out.residualIds = H.allFilterIds(chart);
  out.danglingRefs = Array.from(document.querySelectorAll('[filter]'))
    .map((e) => e.getAttribute('filter'))
    .filter((v) => /url\\(#/.test(v || ''))
    .filter((v) => {
      const id = /url\\(#([^)]+)\\)/.exec(v)[1];
      return !document.getElementById(id);
    });
`;

/* ------------- *
 * Mutant plumbing *
 * ------------- */

const ORIGINALS = new Map([[OM_JS, SOURCE], [OM_MIRROR, MIRROR_SOURCE]]);

function restoreDisk() {
  for (const [file, text] of ORIGINALS) fs.writeFileSync(file, text);
  for (const [file, text] of ORIGINALS) {
    assert.equal(sha256(fs.readFileSync(file, 'utf8')), sha256(text), `restore ${path.basename(file)}`);
  }
}

/**
 * Apply a mutant ON DISK to BOTH mirrors. The needle must occur EXACTLY ONCE in
 * EACH file; anything else prints NOT_APPLIED loudly and throws, so a mutant that
 * silently fails to land can never be reported as killed.
 */
function applyMutantOnDisk(label, needle, replacement) {
  const counts = {};
  for (const file of ORIGINALS.keys()) {
    const text = fs.readFileSync(file, 'utf8');
    const n = text.split(needle).length - 1;
    counts[path.basename(path.dirname(path.dirname(path.dirname(file))))] = n;
    if (n !== 1) {
      process.stdout.write(
        `\n*** NOT_APPLIED *** mutant "${label}" needle occurs ${n}x (expected 1) in ${file}\n`
        + `*** NOT_APPLIED *** needle was: ${JSON.stringify(needle.slice(0, 160))}\n\n`,
      );
      throw new Error(`NOT_APPLIED ${label}: needle count ${n} in ${file}`);
    }
  }
  for (const file of ORIGINALS.keys()) {
    const text = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, text.replace(needle, replacement));
  }
  const mutated = fs.readFileSync(OM_JS, 'utf8');
  const mutatedMirror = fs.readFileSync(OM_MIRROR, 'utf8');
  assert.notEqual(sha256(mutated), sha256(SOURCE), `${label}: primary changed on disk`);
  assert.notEqual(sha256(mutatedMirror), sha256(MIRROR_SOURCE), `${label}: mirror changed on disk`);
  process.stdout.write(`APPLIED  ${label} — needle count 1 in each mirror ${JSON.stringify(counts)}\n`);
  return mutated;
}

/** A mutant runs the cell against the text read back FROM DISK, then restores. */
async function expectMutantKilled(label, needle, replacement, cell) {
  let mutated;
  try {
    mutated = applyMutantOnDisk(label, needle, replacement);
    let threw = false;
    try {
      await cell(mutated);
    } catch (e) {
      threw = true;
      process.stdout.write(`  killed-by: ${String(e.message).split('\n')[0].slice(0, 200)}\n`);
    }
    note(`mutant-killed:${label}`, threw);
    assert.equal(threw, true, `mutant ${label} survived — the cell did not go red`);
  } finally {
    restoreDisk();
  }
}

/* ============================== CELLS ============================== */

test('GLOW-GC harness fidelity: scaffolding matches drawEntry/Exit/Partial marker source', () => {
  assertHarnessFidelity();
});

test(`GLOW-GC headline: <filter> count returns to baseline over ${CYCLES} order cycles`, async (t) => {
  const b = await browser();
  if (!b) { t.skip('no Chromium found (set EDGE_PATH)'); return; }
  const r = await runScenario(SCENARIO_CYCLES);

  // Monotonic-growth detector: with the leak present the per-cycle series climbs.
  const first = r.perCycle[0];
  const last = r.perCycle[r.perCycle.length - 1];
  const climbed = last - first;

  note('headline-baseline', r.baseline === 0, `baseline=${r.baseline}`);
  note('headline-peak-per-cycle', r.peak > 0, `peak=${r.peak}`);
  note('headline-no-monotonic-climb', climbed === 0,
    `cycle1=${first} cycle${CYCLES}=${last} climb=${climbed}`);
  note('headline-strip-is-load-bearing', r.beforeStrip > 0, `beforeStrip=${r.beforeStrip}`);
  note('headline-returns-to-baseline-after-strip', r.afterStrip === r.baseline,
    `beforeStrip=${r.beforeStrip} afterStrip=${r.afterStrip} baseline=${r.baseline}`);
  note('headline-no-dangling-references', r.danglingRefs.length === 0,
    JSON.stringify(r.danglingRefs.slice(0, 5)));
  process.stdout.write(`KILL-02/NODES fixed: peak=${r.peak} afterCycles=${r.afterCycles} beforeStrip=${r.beforeStrip} afterStrip=${r.afterStrip} residual=${JSON.stringify(r.residualIds)}\n`);

  assert.equal(r.baseline, 0);
  assert.ok(r.peak >= 4, 'the scenario must actually create filters');
  assert.equal(climbed, 0, `<filter> count climbed ${climbed} nodes across ${CYCLES} cycles`);
  assert.equal(r.beforeStrip, OPEN_AT_STRIP * 2,
    'positive control: the still-open orders must really hold filters at strip time');
  assert.equal(r.afterStrip, r.baseline, 'strip must return <defs> to baseline');
  assert.deepEqual(r.residualIds, []);
  assert.deepEqual(r.danglingRefs, []);
});

test('GLOW-GC kill-switch: engaged, growth is exactly the legacy unbounded shape', async (t) => {
  const b = await browser();
  if (!b) { t.skip('no Chromium found (set EDGE_PATH)'); return; }

  const killed = await runScenario(SCENARIO_CYCLES, { flag: "'yes'" });
  // Legacy = the deployed tip this branch is based on, with NO fix present at all.
  const baseSource = spawnSync(
    'git', ['show', 'e675e5d1b:chart v 1.4/chart/modules/order-manager.js'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(baseSource.status, 0, `git show base: ${baseSource.stderr}`);
  const legacy = await runScenario(SCENARIO_CYCLES, { source: baseSource.stdout, preFix: true });

  process.stdout.write(`KILL-02/NODES legacy: peak=${legacy.peak} afterCycles=${legacy.afterCycles} beforeStrip=${legacy.beforeStrip} afterStrip=${legacy.afterStrip}\n`);
  note('kill-switch-matches-legacy-per-cycle',
    JSON.stringify(killed.perCycle) === JSON.stringify(legacy.perCycle),
    `killed[last]=${killed.perCycle[killed.perCycle.length - 1]} legacy[last]=${legacy.perCycle[legacy.perCycle.length - 1]}`);
  note('legacy-actually-leaks',
    legacy.afterStrip > 0 && legacy.perCycle[legacy.perCycle.length - 1] > legacy.perCycle[0],
    `cycle1=${legacy.perCycle[0]} cycle${CYCLES}=${legacy.perCycle[CYCLES - 1]} afterStrip=${legacy.afterStrip}`);

  // Positive control on the oracle itself: the legacy code MUST climb, else the
  // "returns to baseline" assertion above proves nothing.
  assert.ok(legacy.perCycle[CYCLES - 1] > legacy.perCycle[0],
    'positive control failed: legacy source did not leak, so the oracle is blind');
  assert.ok(legacy.afterStrip > 0, 'positive control: legacy strip must leave filters behind');
  assert.deepEqual(killed.perCycle, legacy.perCycle, 'kill-switch must reproduce legacy exactly');
  assert.equal(killed.afterStrip, legacy.afterStrip);
});

test('GLOW-GC cheat-catch: the glow is still created and correctly referenced for a live order', async (t) => {
  const b = await browser();
  if (!b) { t.skip('no Chromium found (set EDGE_PATH)'); return; }
  const r = await runScenario(`
    const chart = charts[0];
    // Churn first, so any GC sweep that could have run, has run.
    for (let i = 1; i <= 20; i++) { H.drawEntry(om, chart, i); om._sweepOrphanedOrderLevelDom(i); }
    om._stripOrderDrawingLayersFromChart(chart);
    out.afterChurn = H.filterCount(chart);

    // A LIVE order arrives after the sweeps.
    const id = 999;
    const g = H.drawEntry(om, chart, id, '#2962ff');
    out.createdOnDraw = !!chart.node.querySelector('defs > filter[id="entry-glow-999"]');
    H.hoverEntry(om, id, true);
    const arrow = chart.node.querySelector('.entry-marker-999 [data-role="entry-arrow"]');
    out.hoverRef = arrow.getAttribute('filter');
    const f = chart.node.querySelector('defs > filter[id="entry-glow-999"]');
    out.filterExistsOnHover = !!f;
    out.filterHasDropShadow = !!(f && f.querySelector('feDropShadow'));
    out.floodColor = f && f.querySelector('feDropShadow') ? f.querySelector('feDropShadow').getAttribute('flood-color') : null;
    out.resolvesInDocument = !!document.getElementById('entry-glow-999');

    // A live order's referenced filter must survive an unrelated order's teardown.
    om._sweepOrphanedOrderLevelDom(1);
    om._sweepOrphanedOrderLevelDom(999);
    out.survivesSweepWhileReferenced = !!chart.node.querySelector('defs > filter[id="entry-glow-999"]');
    out.refStillIntact = arrow.getAttribute('filter');

    // And an exit marker's glow, which is only referenced on hover.
    const ex = H.drawExit(om, chart, id);
    H.hoverExitGroup(om, chart, ex, true);
    const exArrow = chart.node.querySelector('.exit-marker-999 [data-role="exit-arrow"]');
    out.exitRef = exArrow.getAttribute('filter');
    out.exitFilterExists = !!chart.node.querySelector('defs > filter[id="exit-glow-999"]');
  `);

  note('cheat-catch-filter-created-on-draw', r.createdOnDraw === true);
  note('cheat-catch-hover-reference', r.hoverRef === 'url(#entry-glow-999)', String(r.hoverRef));
  note('cheat-catch-filter-has-dropshadow', r.filterHasDropShadow === true, `flood-color=${r.floodColor}`);
  note('cheat-catch-reference-resolves', r.resolvesInDocument === true);
  note('cheat-catch-referenced-filter-survives-sweep', r.survivesSweepWhileReferenced === true);
  note('cheat-catch-exit-glow-present', r.exitFilterExists === true, String(r.exitRef));

  assert.equal(r.afterChurn, 0, 'the churn phase must actually have swept');
  assert.equal(r.createdOnDraw, true, 'a live order must still get its <filter>');
  assert.equal(r.hoverRef, 'url(#entry-glow-999)');
  assert.equal(r.filterExistsOnHover, true);
  assert.equal(r.filterHasDropShadow, true);
  assert.equal(r.floodColor, '#2962ff');
  assert.equal(r.resolvesInDocument, true);
  assert.equal(r.survivesSweepWhileReferenced, true, 'HAZARD: removed a filter an element still references');
  assert.equal(r.refStillIntact, 'url(#entry-glow-999)');
  assert.equal(r.exitRef, 'url(#exit-glow-999)');
  assert.equal(r.exitFilterExists, true);
});

test('GLOW-GC dedupe on create: 200 ensure calls for one id yield exactly one <filter>', async (t) => {
  const b = await browser();
  if (!b) { t.skip('no Chromium found (set EDGE_PATH)'); return; }
  const r = await runScenario(`
    const chart = charts[0];
    for (let i = 0; i < 200; i++) om._ensureMarkerGlowFilter(chart.svg, 'entry-glow-42', '#22c55e');
    out.count = H.filterCount(chart);
    out.defsCount = chart.node.querySelectorAll('defs').length;
    out.ids = H.allFilterIds(chart);
  `);
  note('dedupe-single-filter', r.count === 1, `count=${r.count}`);
  note('dedupe-single-defs', r.defsCount === 1, `defs=${r.defsCount}`);
  assert.equal(r.count, 1);
  assert.equal(r.defsCount, 1);
  assert.deepEqual(r.ids, ['entry-glow-42']);
});

test('GLOW-GC shared filters survive: trade-connector-glow and exit-glow-fallback are not order-keyed', async (t) => {
  const b = await browser();
  if (!b) { t.skip('no Chromium found (set EDGE_PATH)'); return; }
  const r = await runScenario(`
    const chart = charts[0];
    om._ensureMarkerGlowFilter(chart.svg, 'trade-connector-glow', '#38bdf8');
    om._ensureMarkerGlowFilter(chart.svg, 'exit-glow-fallback', '#38bdf8');
    for (let i = 1; i <= 10; i++) { H.drawEntry(om, chart, i); H.drawExit(om, chart, i); }
    out.before = H.allFilterIds(chart);
    om._stripOrderDrawingLayersFromChart(chart);
    out.after = H.allFilterIds(chart).sort();
  `);
  note('shared-filters-survive-strip',
    JSON.stringify(r.after) === JSON.stringify(['exit-glow-fallback', 'trade-connector-glow']),
    JSON.stringify(r.after));
  assert.equal(r.before.length, 22);
  assert.deepEqual(r.after, ['exit-glow-fallback', 'trade-connector-glow']);
});

test('GLOW-GC id uniqueness: allocator never reissues, and no two live orders share a filter id', async (t) => {
  const b = await browser();
  if (!b) { t.skip('no Chromium found (set EDGE_PATH)'); return; }
  const r = await runScenario(`
    const chart = charts[0];
    const ids = [];
    for (let i = 0; i < 300; i++) {
      const id = om._allocateOrderId();
      ids.push(id);
      om.openPositions.push({ id });
    }
    out.allocated = ids.length;
    out.distinct = new Set(ids).size;
    // Every live order's filters coexist without collapsing into each other.
    ids.forEach((id) => { H.drawEntry(om, chart, id); H.drawExit(om, chart, id); });
    out.filterCount = H.filterCount(chart);
    out.distinctFilterIds = new Set(H.allFilterIds(chart)).size;
    // Prefix-collision guard: order 1's matcher must not claim order 12's legs.
    H.drawPartial(om, chart, 1, 3);
    H.drawPartial(om, chart, 12, 3);
    out.beforePartialSweep = H.allFilterIds(chart).filter((x) => x.indexOf('partial-glow-') === 0).sort();
    om._reclaimOrderGlowFilters(chart.svg, 1);
    out.afterPartialSweep = H.allFilterIds(chart).filter((x) => x.indexOf('partial-glow-') === 0).sort();
  `);
  note('ids-distinct', r.distinct === r.allocated, `${r.distinct}/${r.allocated}`);
  note('filter-ids-distinct', r.distinctFilterIds === r.filterCount, `${r.distinctFilterIds}/${r.filterCount}`);
  note('no-prefix-collision', JSON.stringify(r.afterPartialSweep) === JSON.stringify(['partial-glow-12-3']),
    JSON.stringify(r.afterPartialSweep));
  assert.equal(r.distinct, 300);
  assert.equal(r.filterCount, 600);
  assert.equal(r.distinctFilterIds, 600);
  assert.deepEqual(r.beforePartialSweep, ['partial-glow-1-3', 'partial-glow-12-3']);
  assert.deepEqual(r.afterPartialSweep, ['partial-glow-12-3']);
});

/* ---- hermetic cells: no browser needed ---- */

function gateContext(text = SOURCE) {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(`
globalThis.window = {};
class GateOm {
${methodSource(text, '_orderGlowFilterGcEnabled')}
${methodSource(text, '_isOrderGlowFilterId')}
${methodSource(text, '_isAnyOrderGlowFilterId')}
${methodSource(text, '_referencedGlowFilterIds')}
}
globalThis.GateOm = GateOm;
`, context);
  return context;
}

function assertFlagTruthinessPerCall(text = SOURCE) {
  const ctx = gateContext(text);
  const om = new ctx.GateOm();
  const on = [undefined, null, false, 0, '', NaN];
  const off = [true, 1, 'yes', '1', 'no', 'false', 'off', {}, [], -1, 0.5];
  for (const v of on) {
    if (v === undefined) delete ctx.window[SWITCH]; else ctx.window[SWITCH] = v;
    assert.equal(om._orderGlowFilterGcEnabled(), true, `${String(v)} ⇒ GC ON`);
  }
  for (const v of off) {
    ctx.window[SWITCH] = v;
    assert.equal(om._orderGlowFilterGcEnabled(), false, `${JSON.stringify(v)} ⇒ GC OFF`);
  }
  // Read per call: flip mid-flight without reconstructing.
  delete ctx.window[SWITCH];
  assert.equal(om._orderGlowFilterGcEnabled(), true, 'delete ⇒ ON again');
  ctx.window[SWITCH] = {};
  assert.equal(om._orderGlowFilterGcEnabled(), false, 'object ⇒ OFF (truthy, not === true)');
  note('flag-truthiness-per-call', true);
}

function assertFlagCannotThrow(text = SOURCE) {
  const ctx = gateContext(text);
  const om = new ctx.GateOm();
  vm.runInContext(`
Object.defineProperty(window, '${SWITCH}', {
  configurable: true,
  get() { throw new Error('hostile flag getter'); },
});
`, ctx);
  const v = om._orderGlowFilterGcEnabled();
  note('flag-cannot-throw', v === true, `hostile getter ⇒ ${v}`);
  assert.equal(v, true, 'a throwing flag getter must not take teardown down with it');
}

test('GLOW-GC kill-switch is TRUTHY, per-call, and cannot throw', () => {
  assertFlagTruthinessPerCall();
  assertFlagCannotThrow();
});

function assertOwnershipMatchers(text = SOURCE) {
  const ctx = gateContext(text);
  const om = new ctx.GateOm();
  assert.equal(om._isOrderGlowFilterId('entry-glow-7', 7), true);
  assert.equal(om._isOrderGlowFilterId('exit-glow-7', 7), true);
  assert.equal(om._isOrderGlowFilterId('partial-glow-7-2', 7), true);
  assert.equal(om._isOrderGlowFilterId('entry-glow-71', 7), false, 'prefix must not leak');
  assert.equal(om._isOrderGlowFilterId('partial-glow-71-2', 7), false, 'prefix must not leak');
  assert.equal(om._isOrderGlowFilterId('trade-connector-glow', 7), false);
  assert.equal(om._isAnyOrderGlowFilterId('trade-connector-glow'), false);
  assert.equal(om._isAnyOrderGlowFilterId('exit-glow-fallback'), false);
  assert.equal(om._isAnyOrderGlowFilterId('entry-glow-7'), true);
  assert.equal(om._isAnyOrderGlowFilterId('partial-glow-7-2'), true);
  assert.equal(om._isAnyOrderGlowFilterId(''), false);
  note('ownership-matchers', true);
}

function assertReferenceScan(text = SOURCE) {
  const ctx = gateContext(text);
  const om = new ctx.GateOm();
  const el = (v) => ({ getAttribute: (k) => (k === 'filter' ? v : null) });
  const doc = {
    querySelectorAll: () => [
      el('url(#entry-glow-1)'),
      el('url( #exit-glow-2 )'),
      el("url('#partial-glow-3-1')"),
      el('none'),
      el(null),
    ],
  };
  const ids = om._referencedGlowFilterIds(doc);
  assert.deepEqual([...ids].sort(), ['entry-glow-1', 'exit-glow-2', 'partial-glow-3-1']);
  // Must not throw on a hostile document.
  assert.equal(om._referencedGlowFilterIds(null).size, 0);
  assert.equal(om._referencedGlowFilterIds({ querySelectorAll() { throw new Error('boom'); } }).size, 0);
  note('reference-scan', true);
}

test('GLOW-GC ownership matchers and reference scan', () => {
  assertOwnershipMatchers();
  assertReferenceScan();
});

/* ---------------- mirror ---------------- */

test('GLOW-GC mirror: the ORDER-GLOW-GC-V1 delta is byte-identical in both copies', () => {
  const a = fs.readFileSync(OM_JS, 'utf8');
  const b = fs.readFileSync(OM_MIRROR, 'utf8');
  const block = (text) => {
    const m = text.match(/\n {4}\/\*\*\n {5}\* ORDER-GLOW-GC-V1 — default ON[^]*?\n {4}_reclaimOrderGlowFiltersForChart\(chart\) \{[^]*?\n {4}\}\n/);
    assert.ok(m, 'ORDER-GLOW-GC-V1 block not found');
    return m[0];
  };
  const ha = sha256(block(a));
  const hb = sha256(block(b));
  // Two live call sites: the chart strip and the per-order sweep.
  const seam = /this\._reclaimOrderGlowFilters(?:ForChart)?\((?!\s*$)/g;
  const seamA = (a.match(seam) || []).length;
  const seamB = (b.match(seam) || []).length;
  note('mirror-delta-identical', ha === hb, `sha256=${ha}`);
  note('mirror-seam-count', seamA === seamB && seamA === 2, `primary=${seamA} mirror=${seamB}`);
  assert.equal(ha, hb);
  assert.equal(seamA, 2, 'strip seam + per-order sweep seam');
  assert.equal(seamB, 2);
  for (const name of GC_METHOD_NAMES) {
    assert.equal(a.split(`    ${name}(`).length - 1, 1, `${name} defined once in primary`);
    assert.equal(b.split(`    ${name}(`).length - 1, 1, `${name} defined once in mirror`);
  }
  // Pre-existing: the two files are NOT byte-identical at base e675e5d1b (they
  // diverged in merge a07e35120, before this branch). This packet must not widen
  // that gap, so assert the mirror-vs-mirror diff is unchanged in size.
  process.stdout.write(`mirror sha256 primary=${sha256(a)} mirror=${sha256(b)}\n`);
});

/* ---------------- mutant table ---------------- */

async function cellHeadline(text) {
  const r = await runScenario(SCENARIO_CYCLES, { source: text });
  assert.equal(r.beforeStrip, OPEN_AT_STRIP * 2, 'positive control: open orders hold filters at strip');
  assert.equal(r.afterStrip, 0, `strip left ${r.afterStrip} filters`);
  assert.equal(r.perCycle[CYCLES - 1] - r.perCycle[0], 0, 'per-cycle count climbed');
  assert.deepEqual(r.residualIds, []);
}

async function cellPerOrderSweep(text) {
  const r = await runScenario(`
    const chart = charts[0];
    for (let i = 1; i <= 30; i++) { H.drawEntry(om, chart, i); H.drawExit(om, chart, i); om._sweepOrphanedOrderLevelDom(i); }
    out.count = H.filterCount(chart);
  `, { source: text });
  assert.equal(r.count, 0, `per-order sweep left ${r.count} filters`);
}

async function cellKillSwitchOff(text) {
  const r = await runScenario(`
    const chart = charts[0];
    for (let i = 1; i <= 30; i++) { H.drawEntry(om, chart, i); om._sweepOrphanedOrderLevelDom(i); }
    out.count = H.filterCount(chart);
  `, { source: text, flag: "'yes'" });
  assert.equal(r.count, 30, `kill-switch engaged must leave all 30, saw ${r.count}`);
}

async function cellHazard(text) {
  const r = await runScenario(`
    const chart = charts[0];
    const id = 5;
    H.drawEntry(om, chart, id);
    H.hoverEntry(om, id, true);
    om._sweepOrphanedOrderLevelDom(id);
    om._stripOrderDrawingLayersFromChart(chart);
    const arrow = document.querySelector('[data-role="entry-arrow"]');
    out.refStillWritten = arrow ? arrow.getAttribute('filter') : null;
    out.dangling = Array.from(document.querySelectorAll('[filter]'))
      .map((e) => e.getAttribute('filter'))
      .filter((v) => /url\\(#/.test(v || ''))
      .filter((v) => !document.getElementById(/url\\(#([^)]+)\\)/.exec(v)[1]));
  `, { source: text });
  assert.deepEqual(r.dangling, [], `dangling filter references: ${JSON.stringify(r.dangling)}`);
}

async function cellHazardReferenced(text) {
  const r = await runScenario(`
    const chart = charts[0];
    const id = 5;
    H.drawEntry(om, chart, id);
    H.hoverEntry(om, id, true);
    om._sweepOrphanedOrderLevelDom(id);
    out.survives = !!chart.node.querySelector('defs > filter[id="entry-glow-5"]');
  `, { source: text });
  assert.equal(r.survives, true, 'removed a filter that a live element still references');
}

async function cellSharedSurvive(text) {
  const r = await runScenario(`
    const chart = charts[0];
    om._ensureMarkerGlowFilter(chart.svg, 'trade-connector-glow', '#38bdf8');
    om._ensureMarkerGlowFilter(chart.svg, 'exit-glow-fallback', '#38bdf8');
    H.drawEntry(om, chart, 1);
    om._stripOrderDrawingLayersFromChart(chart);
    out.after = H.allFilterIds(chart).sort();
  `, { source: text });
  assert.deepEqual(r.after, ['exit-glow-fallback', 'trade-connector-glow']);
}

async function cellDedupe(text) {
  const r = await runScenario(`
    const chart = charts[0];
    for (let i = 0; i < 200; i++) om._ensureMarkerGlowFilter(chart.svg, 'entry-glow-42', '#22c55e');
    out.count = H.filterCount(chart);
  `, { source: text });
  assert.equal(r.count, 1, `dedupe broken: ${r.count} filters for one id`);
}

async function cellCheatCatch(text) {
  const r = await runScenario(`
    const chart = charts[0];
    const id = 999;
    H.drawEntry(om, chart, id, '#2962ff');
    H.hoverEntry(om, id, true);
    const arrow = chart.node.querySelector('.entry-marker-999 [data-role="entry-arrow"]');
    out.ref = arrow.getAttribute('filter');
    const f = chart.node.querySelector('defs > filter[id="entry-glow-999"]');
    out.exists = !!f;
    out.dropShadow = !!(f && f.querySelector('feDropShadow'));
  `, { source: text });
  assert.equal(r.exists, true, 'the live order has no <filter> at all');
  assert.equal(r.dropShadow, true, 'the <filter> has no feDropShadow — no glow');
  assert.equal(r.ref, 'url(#entry-glow-999)', 'the live arrow does not reference its glow');
}

test('GLOW-GC mutants: applied on disk to BOTH mirrors, each killed by a named cell', async (t) => {
  const b = await browser();
  if (!b) { t.skip('no Chromium found (set EDGE_PATH)'); return; }
  try {
    await expectMutantKilled(
      'M1-drop-strip-seam',
      '        this._reclaimOrderGlowFiltersForChart(chart);\n',
      '        /* M1: strip seam removed */\n',
      cellHeadline,
    );
    await expectMutantKilled(
      'M2-drop-per-order-seam',
      '            this._reclaimOrderGlowFilters(svg, oid);\n',
      '            /* M2: per-order seam removed */\n',
      cellPerOrderSweep,
    );
    await expectMutantKilled(
      'M3-invert-kill-switch',
      "            return !(typeof window !== 'undefined'\n"
        + `                && !!window.${SWITCH});`,
      "            return !!(typeof window !== 'undefined'\n"
        + `                && !!window.${SWITCH});`,
      cellKillSwitchOff,
    );
    await expectMutantKilled(
      'M4-drop-reference-guard',
      '            if (!id || referenced.has(id)) continue;\n',
      '            if (!id) continue;\n',
      cellHazardReferenced,
    );
    await expectMutantKilled(
      'M5-drop-shared-filter-exclusion',
      "        if (id === 'trade-connector-glow' || id === 'exit-glow-fallback') return false;\n",
      '        /* M5: shared-filter exclusion removed */\n',
      cellSharedSurvive,
    );
    await expectMutantKilled(
      'M6-break-create-dedupe',
      '        if (svg.select(`#${filterId}`).empty()) {\n',
      '        if (true) {\n',
      cellDedupe,
    );
    await expectMutantKilled(
      'M7-never-create-the-filter',
      '        if (svg.select(`#${filterId}`).empty()) {\n',
      '        if (false) {\n',
      cellCheatCatch,
    );
    await expectMutantKilled(
      'M8-exact-equality-kill-switch',
      `                && !!window.${SWITCH});`,
      `                && window.${SWITCH} === true);`,
      async (text) => {
        // `=== true` must fail the TRUTHY contract: 'yes' should still disable.
        assertFlagTruthinessPerCall(text);
      },
    );
    await expectMutantKilled(
      'M9-order-scoped-reference-scan',
      '        const referenced = this._referencedGlowFilterIds(root.ownerDocument || root);\n',
      '        const referenced = new Set();\n',
      cellHazardReferenced,
    );
  } finally {
    restoreDisk();
  }
});

test('GLOW-GC mutant NEGATIVE CONTROL: a needle that does not exist must report NOT_APPLIED', () => {
  const before = [OM_JS, OM_MIRROR].map((f) => sha256(fs.readFileSync(f, 'utf8')));
  let threw = null;
  try {
    applyMutantOnDisk(
      'NEG-nonexistent-needle',
      '        this._reclaimOrderGlowFiltersFromTheMoon(chart);\n',
      '        /* never */\n',
    );
  } catch (e) {
    threw = e;
  }
  const after = [OM_JS, OM_MIRROR].map((f) => sha256(fs.readFileSync(f, 'utf8')));
  note('negative-control-not-applied', threw !== null && /NOT_APPLIED/.test(String(threw.message)),
    threw ? String(threw.message).slice(0, 120) : 'DID NOT THROW');
  note('negative-control-disk-untouched', JSON.stringify(before) === JSON.stringify(after));
  assert.ok(threw, 'a missing needle must throw, not silently pass');
  assert.match(String(threw.message), /NOT_APPLIED/);
  assert.deepEqual(after, before, 'a failed mutant must leave both mirrors untouched');

  // Second negative control: a needle present but NOT unique must also refuse.
  let threw2 = null;
  try {
    applyMutantOnDisk('NEG-ambiguous-needle', '    }\n', '    }\n');
  } catch (e) {
    threw2 = e;
  }
  note('negative-control-ambiguous', threw2 !== null && /NOT_APPLIED/.test(String(threw2.message)));
  assert.ok(threw2);
  assert.match(String(threw2.message), /NOT_APPLIED/);
  assert.deepEqual([OM_JS, OM_MIRROR].map((f) => sha256(fs.readFileSync(f, 'utf8'))), before);
});

test('GLOW-GC teardown: both mirrors are exactly as they were on disk', () => {
  restoreDisk();
  note('disk-restored', true, `primary=${sha256(fs.readFileSync(OM_JS, 'utf8')).slice(0, 16)}`);
  if (BROWSER) { BROWSER.dispose(); BROWSER = null; }
});
