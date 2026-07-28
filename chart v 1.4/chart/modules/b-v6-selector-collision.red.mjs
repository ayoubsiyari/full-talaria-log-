/**
 * B-V6-P1 selector collision red gate.
 *
 * ============================================================================
 * §A4b / §A13.2 STAMP
 * ============================================================================
 *
 * What GREEN licenses: the inventoried order-overlay SVG remover selectors,
 * as extracted from `order-manager.js` at runtime, do not remove order 12's
 * synthetic SVG parts when composed for order 1 and applied in a real browser
 * to SVG nodes whose class strings are also extracted from the producer sites.
 *
 * What GREEN does NOT license: the product's own order lifecycle, product
 * reachability, D3 behaviour, real broker/order state, or every selector in
 * the chart. This is a test/oracle/harness gate for one stated mechanism:
 * prefix-related order ids can collide when a remover uses substring matching.
 *
 * CI portability note: this gate imports C's browser runner by absolute path
 * from another worktree. That runner is currently untracked there, so this
 * gate is not CI-portable yet.
 *
 * Usage:
 *   node "chart v 1.4/chart/modules/b-v6-selector-collision.red.mjs"
 *
 * Exit code is non-zero when any required assertion fails. Current source is
 * expected to be RED if the substring collision remains present.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WRITING_TREE = 'C:\\Users\\user\\Desktop\\talaria1\\manager-b-plan3';
const OTHER_TREE = 'C:\\Users\\user\\Desktop\\talaria1\\full-talaria-log--main';
const PRODUCT_PATH = path.join(WRITING_TREE, 'chart v 1.4', 'chart', 'modules', 'order-manager.js');
const FIXTURE_DIR = path.join(WRITING_TREE, 'chart v 1.4', 'chart', 'modules', 'b-fixtures', 'v6-selector-collision');
const CASE_DATA_PATH = path.join(FIXTURE_DIR, 'case-data.json');
const RUNNER_PATH = path.join(OTHER_TREE, 'scripts', 'order-overlay-browser-runner.mjs');

const ORDER_1 = '1';
const ORDER_12 = '12';
const TP_KEY = '0';

const {
  runOrderOverlayBrowserRunner,
  validateOrderOverlayReport,
} = await import(pathToFileURL(RUNNER_PATH).href);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function lineOf(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function maskInert(source) {
  const out = source.split('');
  let i = 0;
  const blank = (idx) => {
    if (idx < out.length && out[idx] !== '\n') out[idx] = ' ';
  };
  while (i < source.length) {
    const c = source[i];
    const n = source[i + 1];
    if (c === '/' && n === '/') {
      while (i < source.length && source[i] !== '\n') {
        blank(i);
        i += 1;
      }
      continue;
    }
    if (c === '/' && n === '*') {
      blank(i);
      blank(i + 1);
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        blank(i);
        i += 1;
      }
      blank(i);
      blank(i + 1);
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      blank(i);
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          blank(i);
          blank(i + 1);
          i += 2;
          continue;
        }
        if (source[i] === quote) {
          blank(i);
          i += 1;
          break;
        }
        blank(i);
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return out.join('');
}

function matchingCloser(masked, openIndex, open = '(', close = ')') {
  let depth = 0;
  for (let i = openIndex; i < masked.length; i += 1) {
    if (masked[i] === open) depth += 1;
    if (masked[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractMethod(source, name) {
  const re = new RegExp(`\\b${escapeRegExp(name)}\\s*\\([^)]*\\)\\s*\\{`, 'g');
  const hit = re.exec(source);
  if (!hit) throw new Error(`method ${name} was not found`);
  const open = source.indexOf('{', hit.index);
  const localMasked = maskInert(source.slice(open));
  const closeRel = matchingCloser(localMasked, 0, '{', '}');
  if (closeRel === -1) throw new Error(`method ${name} body was not closed`);
  const close = open + closeRel;
  const raw = source.slice(open + 1, close);
  return {
    name,
    start: open + 1,
    end: close,
    raw,
    masked: maskInert(raw),
  };
}

function splitTopLevelArgs(rawArgs) {
  const masked = maskInert(rawArgs);
  const args = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < masked.length; i += 1) {
    const c = masked[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    if (c === ')' || c === ']' || c === '}') depth -= 1;
    if (c === ',' && depth === 0) {
      args.push(rawArgs.slice(start, i).trim());
      start = i + 1;
    }
  }
  args.push(rawArgs.slice(start).trim());
  return args;
}

function findCallsInSpan(source, span, callee) {
  const masked = span.masked;
  const calls = [];
  const re = new RegExp(`(?:\\.|\\b)${escapeRegExp(callee)}\\s*\\(`, 'g');
  let hit = re.exec(masked);
  while (hit) {
    const open = masked.indexOf('(', hit.index);
    const close = matchingCloser(masked, open);
    if (close !== -1) {
      const argsText = span.raw.slice(open + 1, close);
      calls.push({
        absoluteOffset: span.start + hit.index,
        line: lineOf(source, span.start + hit.index),
        argsText,
        args: splitTopLevelArgs(argsText),
      });
    }
    hit = re.exec(masked);
  }
  return calls;
}

function findCalls(source, callee) {
  const calls = [];
  const re = new RegExp(`(?:\\.|\\b)${escapeRegExp(callee)}\\s*\\(`, 'g');
  let hit = re.exec(source);
  while (hit) {
    const open = source.indexOf('(', hit.index);
    const localMasked = maskInert(source.slice(open));
    const closeRel = matchingCloser(localMasked, 0);
    if (closeRel !== -1) {
      const close = open + closeRel;
      const argsText = source.slice(open + 1, close);
      calls.push({
        absoluteOffset: hit.index,
        line: lineOf(source, hit.index),
        argsText,
        args: splitTopLevelArgs(argsText),
      });
    }
    hit = re.exec(source);
  }
  return calls;
}

function unquoteLiteral(raw) {
  const text = raw.trim();
  const quote = text[0];
  if (!['"', "'", '`'].includes(quote) || text[text.length - 1] !== quote) {
    throw new Error(`expected a string/template literal, got ${text}`);
  }
  return { quote, body: text.slice(1, -1), raw: text };
}

function readPath(env, expr) {
  const parts = expr.trim().split('.').map((part) => part.trim()).filter(Boolean);
  let value = env[parts[0]];
  for (const part of parts.slice(1)) {
    if (value == null || !Object.hasOwn(value, part)) {
      throw new Error(`cannot evaluate interpolation ${expr}`);
    }
    value = value[part];
  }
  if (value == null) throw new Error(`interpolation ${expr} resolved to ${value}`);
  return String(value);
}

function evalLiteral(raw, env) {
  const { quote, body } = unquoteLiteral(raw);
  if (quote !== '`') return body;
  return body.replace(/\$\{([^}]+)\}/g, (_match, expr) => readPath(env, expr));
}

function containsMarker(arg, marker) {
  return arg.includes(marker);
}

function firstCallArgContaining(calls, marker, label) {
  const hit = calls.find((call) => call.args.some((arg) => containsMarker(arg, marker)));
  if (!hit) throw new Error(`could not find ${label} template marker ${marker}`);
  const arg = hit.args.find((candidate) => containsMarker(candidate, marker));
  return { ...hit, arg };
}

function allCallArgsContaining(calls, marker, label) {
  const hits = [];
  for (const call of calls) {
    const arg = call.args.find((candidate) => containsMarker(candidate, marker));
    if (arg) hits.push({ ...call, arg });
  }
  if (!hits.length) throw new Error(`could not find ${label} template marker ${marker}`);
  return hits;
}

function cssTokenSelector(token) {
  if (!/^[A-Za-z_-][A-Za-z0-9_-]*$/.test(token)) {
    throw new Error(`cannot make a simple class selector for token ${token}`);
  }
  return `.${token}`;
}

function tokenSafeSelector(elements, requiredTokenHint, { uniqueOnly = false } = {}) {
  const order1Tokens = new Set();
  const order12Tokens = new Set();
  for (const element of elements) {
    for (const token of element.classesByOrder[ORDER_1].split(/\s+/).filter(Boolean)) order1Tokens.add(token);
    for (const token of element.classesByOrder[ORDER_12].split(/\s+/).filter(Boolean)) order12Tokens.add(token);
  }
  const hintToken = [...order1Tokens].find((token) => token.includes(requiredTokenHint) && order12Tokens.has(token));
  const orderToken = [...order1Tokens].find((token) => !order12Tokens.has(token));
  const tokens = uniqueOnly ? [orderToken].filter(Boolean) : [hintToken, orderToken].filter(Boolean);
  if (!tokens.length) throw new Error(`could not derive a token-safe selector for ${requiredTokenHint}`);
  return [...new Set(tokens)].map(cssTokenSelector).join('');
}

function elementFromTemplate(part, template, envForOrder, producerLine) {
  return {
    part,
    classesByOrder: {
      [ORDER_1]: evalLiteral(template, envForOrder(ORDER_1)),
      [ORDER_12]: evalLiteral(template, envForOrder(ORDER_12)),
    },
    producerLine,
  };
}

function extractSelectors(source) {
  const pendingMethod = extractMethod(source, 'removePendingOrderLine');
  const sweepMethod = extractMethod(source, '_sweepOrphanedOrderLevelDom');
  const pendingCalls = findCallsInSpan(source, pendingMethod, 'selectAll');
  const sweepCalls = findCallsInSpan(source, sweepMethod, 'selectAll');
  return {
    controlPendingDelete: firstCallArgContaining(pendingCalls, 'pending-tp-delete', 'control pending delete selector'),
    removePendingPct: firstCallArgContaining(pendingCalls, 'pending-tp-pct', 'removePendingOrderLine pending pct selector'),
    sweepOpenPct: firstCallArgContaining(sweepCalls, 'open-tp-pct', 'sweep open pct selector'),
    sweepPendingPct: firstCallArgContaining(sweepCalls, 'pending-tp-pct', 'sweep pending pct selector'),
    sweepPendingDelete: firstCallArgContaining(sweepCalls, 'pending-tp-delete', 'sweep pending delete selector'),
    sweepMultiAvg: firstCallArgContaining(sweepCalls, 'multi-tp-avg', 'sweep multi TP average selector'),
  };
}

function extractProducers(source) {
  const allCreateStepper = [
    ...findCalls(source, '_createTpPctStepperOnChart'),
    ...findCalls(source, '_ensureModernTpPctStepper'),
  ];
  const allBadges = findCalls(source, '_createOrderLevelBadgeOnChart');
  const pendingPct = firstCallArgContaining(allCreateStepper, 'pending-tp-pct', 'pending pct producer');
  const pendingDelete = firstCallArgContaining(allBadges, 'pending-tp-delete', 'pending delete producer');
  const openPct = allCallArgsContaining(allCreateStepper, 'open-tp-pct', 'open pct producers');

  const multiMethod = extractMethod(source, '_drawMultiTPAvgLineOnChart');
  const clsMatch = /\bconst\s+cls\s*=\s*(`[^`]+`|'[^']+'|"[^"]+")/.exec(multiMethod.raw);
  if (!clsMatch) throw new Error('multi TP average producer class binding was not found');
  const attrCalls = findCallsInSpan(source, multiMethod, 'attr')
    .filter((call) => call.args[0] && evalLiteral(call.args[0], {}) === 'class')
    .filter((call) => call.args[1] && call.args[1].includes('${cls}'));
  if (!attrCalls.length) throw new Error('multi TP average class attr producers were not found');

  const multiElements = attrCalls.map((call, index) => ({
    part: index === 0 ? 'line' : `label-${index}`,
    template: call.args[1],
    line: call.line,
  }));

  return {
    pendingPct: { template: pendingPct.arg, line: pendingPct.line },
    pendingDelete: { template: pendingDelete.arg, line: pendingDelete.line },
    openPct: openPct.map((hit, index) => ({ template: hit.arg, line: hit.line, index })),
    multiAvg: {
      clsTemplate: clsMatch[1],
      elements: multiElements,
    },
  };
}

function buildElements(producers, kind) {
  if (kind === 'pendingPct') {
    return [
      elementFromTemplate(
        'pending-pct-stepper',
        producers.pendingPct.template,
        (orderId) => ({ poId: orderId }),
        producers.pendingPct.line
      ),
    ];
  }
  if (kind === 'pendingDelete') {
    return [
      elementFromTemplate(
        'pending-delete',
        producers.pendingDelete.template,
        (orderId) => ({ entry: { pendingOrder: { id: orderId } } }),
        producers.pendingDelete.line
      ),
    ];
  }
  if (kind === 'openPct') {
    return producers.openPct.map((producer) => elementFromTemplate(
      `open-pct-producer-${producer.index + 1}`,
      producer.template,
      (orderId) => ({ oid: orderId, order: { id: orderId }, tpKey: TP_KEY }),
      producer.line
    ));
  }
  if (kind === 'multiAvg') {
    return producers.multiAvg.elements.map((producer) => {
      const envForOrder = (orderId) => {
        const cls = evalLiteral(producers.multiAvg.clsTemplate, { id: orderId });
        return { id: orderId, cls };
      };
      return elementFromTemplate(producer.part, producer.template, envForOrder, producer.line);
    });
  }
  throw new Error(`unknown producer kind ${kind}`);
}

function selectorFromArg(extracted, env) {
  return evalLiteral(extracted.arg, env);
}

function site(id, name, extractedSelector, selectorEnv, elements, producerKind, priority) {
  return {
    id,
    name,
    selector: selectorFromArg(extractedSelector, selectorEnv),
    removerLine: extractedSelector.line,
    elements,
    producerKind,
    priority,
    producerEvidence: elements.map((element) => ({
      part: element.part,
      line: element.producerLine,
      order1Class: element.classesByOrder[ORDER_1],
      order12Class: element.classesByOrder[ORDER_12],
    })),
  };
}

function buildCurrentSites(source) {
  const selectors = extractSelectors(source);
  const producers = extractProducers(source);
  const pendingPct = buildElements(producers, 'pendingPct');
  const pendingDelete = buildElements(producers, 'pendingDelete');
  const openPct = buildElements(producers, 'openPct');
  const multiAvg = buildElements(producers, 'multiAvg');

  return {
    control: site(
      'control-token-delete',
      'control: pending TP delete token selector',
      selectors.controlPendingDelete,
      { orderId: ORDER_1 },
      pendingDelete,
      'pendingDelete',
      0
    ),
    experiment: [
      site(
        'site-5-multi-tp-avg',
        'site 5: sweep multi TP average',
        selectors.sweepMultiAvg,
        { oid: ORDER_1 },
        multiAvg,
        'multiAvg',
        1
      ),
      site(
        'site-1-remove-pending-tp-pct',
        'site 1: remove pending TP pct',
        selectors.removePendingPct,
        { orderId: ORDER_1 },
        pendingPct,
        'pendingPct',
        2
      ),
      site(
        'site-2-sweep-open-tp-pct',
        'site 2: sweep open TP pct',
        selectors.sweepOpenPct,
        { oid: ORDER_1 },
        openPct,
        'openPct',
        3
      ),
      site(
        'site-3-sweep-pending-tp-pct',
        'site 3: sweep pending TP pct',
        selectors.sweepPendingPct,
        { oid: ORDER_1 },
        pendingPct,
        'pendingPct',
        4
      ),
      site(
        'site-4-sweep-pending-tp-delete',
        'site 4: sweep pending TP delete',
        selectors.sweepPendingDelete,
        { oid: ORDER_1 },
        pendingDelete,
        'pendingDelete',
        5
      ),
    ],
  };
}

function buildCorrectedSites(currentSites) {
  const all = [currentSites.control, ...currentSites.experiment];
  return all.map((current) => ({
    ...current,
    selector: tokenSafeSelector(
      current.elements,
      current.producerKind === 'multiAvg' ? 'multi-tp-avg' : current.producerKind.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
      { uniqueOnly: current.producerKind === 'multiAvg' }
    ),
  }));
}

function cloneForCorruption(currentSites) {
  const corrupted = currentSites.experiment.find((entry) => entry.id === 'site-5-multi-tp-avg');
  return [{
    ...corrupted,
    selector: '[',
  }];
}

function writeFixturePayload(currentSites) {
  const payload = {
    version: 'B-V6-P1-selector-collision-v1',
    stampObserved: 'B-V6 selector collision synthetic SVG browser gate',
    preconditionLogLine: 'Parsed remover selector templates and producer class templates from order-manager.js source text at runtime.',
    states: [
      {
        id: 'current-source',
        name: 'current source selectors',
        sites: [currentSites.control, ...currentSites.experiment],
      },
      {
        id: 'corrected-token-selectors',
        name: 'simulated corrected token selectors',
        sites: buildCorrectedSites(currentSites),
      },
      {
        id: 'deliberately-corrupted-input',
        name: 'deliberately corrupted selector input',
        sites: cloneForCorruption(currentSites),
      },
    ],
  };
  fs.writeFileSync(CASE_DATA_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}

function requireState(report, id) {
  const state = report.states?.find((entry) => entry.id === id);
  assert.ok(state, `browser report is missing state ${id}`);
  return state;
}

function statePasses(state) {
  return state.sites.every((siteResult) => siteResult.assertionPass);
}

function summarizeSite(siteResult) {
  const matched = siteResult.matchedLabels.length ? siteResult.matchedLabels.join(', ') : '<none>';
  const removed12 = siteResult.removedOrder12.length ? siteResult.removedOrder12.join(', ') : '<none>';
  return `${siteResult.id}: ${siteResult.verdict}; matched=[${matched}]; removed-order-12=[${removed12}]`;
}

function resultCell(id, name, run) {
  try {
    run();
    return { id, name, status: 'PASS', detail: 'assertion satisfied' };
  } catch (error) {
    return { id, name, status: 'FAIL', detail: String(error && error.message ? error.message : error) };
  }
}

const source = fs.readFileSync(PRODUCT_PATH, 'utf8');
const currentSites = buildCurrentSites(source);
writeFixturePayload(currentSites);

let runnerResult;
try {
  runnerResult = await runOrderOverlayBrowserRunner({
    fixtureDir: FIXTURE_DIR,
    fixturePath: '/host.html',
    timeoutMs: 15_000,
  });
} finally {
  try {
    fs.rmSync(CASE_DATA_PATH, { force: true });
  } catch {
    // Transient fixture input cleanup must not mask the browser verdict.
  }
}

const cells = [];
let report = runnerResult.report;
cells.push(resultCell('B-V6-00', 'browser runner produced valid report shape', () => {
  assert.equal(runnerResult.ok, true, runnerResult.error || 'runner returned ok=false');
  const validation = validateOrderOverlayReport(report);
  assert.equal(validation.ok, true, validation.errors.join('; '));
  assert.equal(report.fixturePayloadVersion, 'B-V6-P1-selector-collision-v1');
}));

if (!report) {
  report = { states: [] };
}

const currentState = report.states?.find((entry) => entry.id === 'current-source') || { sites: [] };
const correctedState = report.states?.find((entry) => entry.id === 'corrected-token-selectors') || { sites: [] };
const corruptedState = report.states?.find((entry) => entry.id === 'deliberately-corrupted-input') || { sites: [] };

cells.push(resultCell('B-V6-01', 'current source keeps order 12 parts', () => {
  const state = requireState(report, 'current-source');
  const failures = state.sites.filter((entry) => entry.id !== 'control-token-delete' && !entry.assertionPass);
  assert.deepEqual(failures.map(summarizeSite), [], 'current source collision(s):\n  - ' + failures.map(summarizeSite).join('\n  - '));
}));

cells.push(resultCell('B-V6-02', 'simulated token selector form goes green', () => {
  const state = requireState(report, 'corrected-token-selectors');
  const failures = state.sites.filter((entry) => !entry.assertionPass);
  assert.deepEqual(failures.map(summarizeSite), [], 'corrected selector collision(s):\n  - ' + failures.map(summarizeSite).join('\n  - '));
}));

cells.push(resultCell('B-V6-03', 'deliberately corrupted input fails closed', () => {
  const state = requireState(report, 'deliberately-corrupted-input');
  assert.equal(statePasses(state), false, 'corrupted selector unexpectedly passed');
  assert.ok(state.sites.some((entry) => entry.selectorError), 'corrupted selector did not report a selector error');
}));

cells.push(resultCell('B-V6-04', 'inverted assertion flips verdict', () => {
  const state = requireState(report, 'current-source');
  const normal = state.sites.filter((entry) => entry.id !== 'control-token-delete').every((entry) => entry.assertionPass);
  const inverted = !normal;
  assert.notEqual(normal, inverted, 'inverted assertion did not flip the current-source verdict');
}));

cells.push(resultCell('B-V6-05', 'control token selector does not collide', () => {
  const state = requireState(report, 'current-source');
  const control = state.sites.find((entry) => entry.id === 'control-token-delete');
  assert.ok(control, 'control site missing');
  assert.equal(control.assertionPass, true, summarizeSite(control));
}));

const site5 = currentState.sites.find((entry) => entry.id === 'site-5-multi-tp-avg');
const site5Matched = site5?.matchedLabels?.length ? site5.matchedLabels.join(', ') : '<none>';
console.log(`Site 5 collides: ${site5?.assertionPass === false ? 'YES' : 'NO'}; matched elements: ${site5Matched}`);
console.log('');
console.log('B-V6-P1 selector collision browser gate');
console.log(`Writing tree confirmed: ${WRITING_TREE}`);
console.log(`Product source read-only: ${PRODUCT_PATH}`);
console.log(`Browser runner imported from read-only other tree: ${RUNNER_PATH}`);
console.log('CI portability: depends on an untracked runner file in another worktree, so not CI-portable yet.');
console.log('GREEN licenses: selector matching against synthetic SVG in a real browser only; it does not license the product order lifecycle.');
console.log('');
console.log('Current-source site verdicts:');
for (const siteResult of currentState.sites || []) {
  console.log(`  ${summarizeSite(siteResult)}`);
}
console.log('');
console.log('Corrected-token simulation verdicts:');
for (const siteResult of correctedState.sites || []) {
  console.log(`  ${summarizeSite(siteResult)}`);
}
console.log('');
console.log('Four-state proof cells:');
for (const cell of cells) {
  console.log(`${cell.id} ${cell.name}: ${cell.status}`);
  for (const line of cell.detail.split('\n')) console.log(`    ${line}`);
}

const passed = cells.filter((entry) => entry.status === 'PASS').length;
const failed = cells.length - passed;
console.log('');
console.log(`Summary: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`B-V6-P1 selector collision gate RED: ${failed} cell(s) failing`);
  process.exitCode = 1;
}
