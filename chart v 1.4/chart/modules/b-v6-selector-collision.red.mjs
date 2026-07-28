/**
 * B-V6-P1 selector collision red gate.
 *
 * ============================================================================
 * §A4b / §A13.2 STAMP
 * ============================================================================
 *
 * What GREEN licenses: the inventoried order-overlay SVG remover selectors,
 * as extracted from `order-manager.js` at runtime, do not remove order 31's
 * synthetic SVG parts when composed for order 3 and applied in a real browser
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

const PRIMARY_ORDER = '3';
const COLLISION_ORDER = '31';
const TP_KEY = '0';
const ALLOWED_CLASS_SUBSTRING_SELECTALL_ARGS = new Set([
  '\'[class*="multi-tp-avg-__preview__"]\'',
  '\'[class*="pending-tp-tp-plus-badge"],[class*="pending-tp-delete"],[class*="pending-tp-split"],[class*="pending-sl-badge"],[class*="pending-tp-badge"]\'',
  '\'[class*="pending-tp-pct-control"],[class*="pending-tp-pct-dec"],[class*="pending-tp-pct-inc"]\'',
  '\'[class*="open-tp-pct-control"],[class*="open-tp-pct-dec"],[class*="open-tp-pct-inc"]\'',
  '\'[class*="split-avg-"]\'',
  '\'[class*="multi-tp-avg-"]\'',
  '\'g[class*="entry-marker-"], g.entry-marker, .entry-marker\'',
  '\'.exit-marker, [class*="exit-marker-"], .partial-close-marker, [class*="partial-close-marker-"]\'',
  '\'text[class*="pip-indicator"]\'',
  '\'text[class*="dollar-indicator"]\'',
  '\'text[class*="rr-indicator"]\'',
  '\'[class*="pending-tp-tp-plus-badge"]\'',
  '\'[class*="pending-tp-delete"]\'',
  '\'[class*="pending-tp-split"]\'',
  '\'[class*="pending-tp-pct-control"]\'',
  '\'[class*="pending-tp-pct-dec"]\'',
  '\'[class*="pending-tp-pct-inc"]\'',
  '\'[class*="label-accent"]\'',
  '\'[class*="split-avg-connector"], .exec-order-connector\'',
  '\'[class*="split-avg-connector"]\'',
]);

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

function allCallArgsContaining(calls, marker, label) {
  const hits = [];
  for (const call of calls) {
    const arg = call.args.find((candidate) => containsMarker(candidate, marker));
    if (arg) hits.push({ ...call, arg });
  }
  if (!hits.length) throw new Error(`could not find ${label} template marker ${marker}`);
  return hits;
}

function exactlyOneCallArgContaining(calls, marker, label) {
  const hits = allCallArgsContaining(calls, marker, label);
  assert.equal(
    hits.length,
    1,
    `${label} expected exactly one producer argument containing ${marker}; found ${hits.length}; candidates: ${hits.map((hit) => `line ${hit.line}: ${hit.arg}`).join(' | ')}`
  );
  return hits[0];
}

function exactlyOneSelectAllArgMatching(calls, marker, label, env, expectedSelector) {
  const candidates = [];
  for (const call of calls) {
    for (const arg of call.args) {
      if (!containsMarker(arg, marker)) continue;
      let selector = null;
      let error = null;
      try {
        selector = evalLiteral(arg, env);
      } catch (caught) {
        error = String(caught && caught.message ? caught.message : caught);
      }
      candidates.push({ ...call, arg, selector, error });
    }
  }
  const matches = candidates.filter((candidate) => candidate.selector === expectedSelector);
  assert.equal(
    matches.length,
    1,
    `${label} expected exactly one selectAll(${expectedSelector}) match; found ${matches.length}; candidates: ${candidates.map((candidate) => `line ${candidate.line}: ${candidate.arg}`).join(' | ') || '<none>'}`
  );
  const unexpected = candidates.filter((candidate) => candidate.selector !== expectedSelector);
  assert.deepEqual(
    unexpected.map((candidate) => `line ${candidate.line}: ${candidate.arg}${candidate.error ? ` (${candidate.error})` : ''}`),
    [],
    `${label} has extra selectAll argument(s) containing ${marker}`
  );
  return matches[0];
}

function assertNoForbiddenClassSubstringSelectors(source) {
  const calls = findCalls(source, 'selectAll');
  const violations = [];
  for (const call of calls) {
    for (const arg of call.args) {
      if (arg.includes('[class*=') && !ALLOWED_CLASS_SUBSTRING_SELECTALL_ARGS.has(arg.trim())) {
        violations.push(`line ${call.line}: ${arg}`);
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    'non-allowlisted [class*=...] selectAll arguments are forbidden:\n  - ' + violations.join('\n  - ')
  );
}

function cssTokenSelector(token) {
  if (!/^[A-Za-z_-][A-Za-z0-9_-]*$/.test(token)) {
    throw new Error(`cannot make a simple class selector for token ${token}`);
  }
  return `.${token}`;
}

function tokenSafeSelector(elements, requiredTokenHint, { uniqueOnly = false } = {}) {
  const primaryTokens = new Set();
  const collisionTokens = new Set();
  for (const element of elements) {
    for (const token of element.classesByOrder[PRIMARY_ORDER].split(/\s+/).filter(Boolean)) primaryTokens.add(token);
    for (const token of element.classesByOrder[COLLISION_ORDER].split(/\s+/).filter(Boolean)) collisionTokens.add(token);
  }
  const hintToken = [...primaryTokens].find((token) => token.includes(requiredTokenHint) && collisionTokens.has(token));
  const orderToken = [...primaryTokens].find((token) => !collisionTokens.has(token));
  const tokens = uniqueOnly ? [orderToken].filter(Boolean) : [hintToken, orderToken].filter(Boolean);
  if (!tokens.length) throw new Error(`could not derive a token-safe selector for ${requiredTokenHint}`);
  return [...new Set(tokens)].map(cssTokenSelector).join('');
}

function elementFromTemplate(part, template, envForOrder, producerLine) {
  return {
    part,
    classesByOrder: {
      [PRIMARY_ORDER]: evalLiteral(template, envForOrder(PRIMARY_ORDER)),
      [COLLISION_ORDER]: evalLiteral(template, envForOrder(COLLISION_ORDER)),
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
    controlPendingDelete: exactlyOneSelectAllArgMatching(pendingCalls, 'pending-tp-delete', 'control pending delete selector', { orderId: PRIMARY_ORDER }, `.pending-tp-delete.pending-tp-${PRIMARY_ORDER}`),
    removePendingPct: exactlyOneSelectAllArgMatching(pendingCalls, 'pending-tp-pct', 'removePendingOrderLine pending pct selector', { orderId: PRIMARY_ORDER }, `.pending-tp-pct-control.pending-tp-${PRIMARY_ORDER}`),
    sweepOpenPct: exactlyOneSelectAllArgMatching(sweepCalls, 'open-tp-pct', 'sweep open pct selector', { oid: PRIMARY_ORDER }, `.open-tp-pct-control.tp-${PRIMARY_ORDER}`),
    sweepPendingPct: exactlyOneSelectAllArgMatching(sweepCalls, 'pending-tp-pct', 'sweep pending pct selector', { oid: PRIMARY_ORDER }, `.pending-tp-pct-control.pending-tp-${PRIMARY_ORDER}`),
    sweepPendingDelete: exactlyOneSelectAllArgMatching(sweepCalls, 'pending-tp-delete', 'sweep pending delete selector', { oid: PRIMARY_ORDER }, `.pending-tp-delete.pending-tp-${PRIMARY_ORDER}`),
    sweepMultiAvg: exactlyOneSelectAllArgMatching(sweepCalls, 'multi-tp-avg', 'sweep multi TP average selector', { oid: PRIMARY_ORDER }, `.multi-tp-avg-${PRIMARY_ORDER}`),
  };
}

function extractProducers(source) {
  const allCreateStepper = [
    ...findCalls(source, '_createTpPctStepperOnChart'),
    ...findCalls(source, '_ensureModernTpPctStepper'),
  ];
  const allBadges = findCalls(source, '_createOrderLevelBadgeOnChart');
  const pendingPct = exactlyOneCallArgContaining(allCreateStepper, 'pending-tp-pct', 'pending pct producer');
  const pendingDelete = exactlyOneCallArgContaining(allBadges, 'pending-tp-delete', 'pending delete producer');
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
      primaryOrderClass: element.classesByOrder[PRIMARY_ORDER],
      collisionOrderClass: element.classesByOrder[COLLISION_ORDER],
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
      { orderId: PRIMARY_ORDER },
      pendingDelete,
      'pendingDelete',
      0
    ),
    experiment: [
      site(
        'site-5-multi-tp-avg',
        'site 5: sweep multi TP average',
        selectors.sweepMultiAvg,
        { oid: PRIMARY_ORDER },
        multiAvg,
        'multiAvg',
        1
      ),
      site(
        'site-1-remove-pending-tp-pct',
        'site 1: remove pending TP pct',
        selectors.removePendingPct,
        { orderId: PRIMARY_ORDER },
        pendingPct,
        'pendingPct',
        2
      ),
      site(
        'site-2-sweep-open-tp-pct',
        'site 2: sweep open TP pct',
        selectors.sweepOpenPct,
        { oid: PRIMARY_ORDER },
        openPct,
        'openPct',
        3
      ),
      site(
        'site-3-sweep-pending-tp-pct',
        'site 3: sweep pending TP pct',
        selectors.sweepPendingPct,
        { oid: PRIMARY_ORDER },
        pendingPct,
        'pendingPct',
        4
      ),
      site(
        'site-4-sweep-pending-tp-delete',
        'site 4: sweep pending TP delete',
        selectors.sweepPendingDelete,
        { oid: PRIMARY_ORDER },
        pendingDelete,
        'pendingDelete',
        5
      ),
    ],
  };
}

function cloneForCorruption(currentSites) {
  const corrupted = currentSites.experiment.find((entry) => entry.id === 'site-5-multi-tp-avg');
  return [{
    ...corrupted,
    selector: '[',
  }];
}

function cloneForKnownCollision(currentSites) {
  return currentSites.experiment.map((entry) => ({
    ...entry,
    selector: legacyBroadSelectorForSite(entry),
  }));
}

function cloneForNoMatch(currentSites) {
  const noMatch = currentSites.experiment.find((entry) => entry.id === 'site-1-remove-pending-tp-pct');
  return [{
    ...noMatch,
    selector: '.b-v6-selector-collision-never-matches',
  }];
}

function cloneForEmptyProducer(currentSites) {
  const empty = currentSites.experiment.find((entry) => entry.id === 'site-1-remove-pending-tp-pct');
  return [{
    ...empty,
    elements: [],
    producerEvidence: [],
  }];
}

function assertCompleteSiteInventory(currentSites) {
  assert.ok(currentSites?.control, 'control selector site was not parsed');
  assert.equal(currentSites.experiment?.length, 5, `expected 5 experiment selector sites, found ${currentSites.experiment?.length || 0}`);
  const emptySites = [currentSites.control, ...currentSites.experiment].filter((entry) => !entry.elements?.length);
  assert.deepEqual(emptySites.map((entry) => entry.id), [], 'parsed selector site(s) have no producer elements');
}

function legacyBroadSelectorForSite(siteEntry) {
  if (siteEntry.id === 'site-5-multi-tp-avg') return `[class*="multi-tp-avg-${PRIMARY_ORDER}"]`;
  if (siteEntry.id === 'site-2-sweep-open-tp-pct') return `[class*="tp-${PRIMARY_ORDER}"]`;
  if (
    siteEntry.id === 'site-1-remove-pending-tp-pct'
    || siteEntry.id === 'site-3-sweep-pending-tp-pct'
    || siteEntry.id === 'site-4-sweep-pending-tp-delete'
  ) {
    return `[class*="pending-tp-${PRIMARY_ORDER}"]`;
  }
  throw new Error(`no legacy broad selector mapping for ${siteEntry.id}`);
}

function broadSelectorNeedle(selector) {
  const match = /^\[class\*="([^"]+)"\]$/.exec(selector);
  if (!match) throw new Error(`expected broad class selector, got ${selector}`);
  return match[1];
}

function simpleClassSelectorMatches(selector, className) {
  const requiredTokens = selector.split('.').filter(Boolean);
  const actualTokens = new Set(String(className).split(/\s+/).filter(Boolean));
  return requiredTokens.every((token) => actualTokens.has(token));
}

function markerCollisionRows(currentSites) {
  return currentSites.experiment.map((entry) => {
    const firstElement = entry.elements[0];
    const primaryClass = firstElement.classesByOrder[PRIMARY_ORDER];
    const collisionClass = firstElement.classesByOrder[COLLISION_ORDER];
    const oldSelector = legacyBroadSelectorForSite(entry);
    const oldNeedle = broadSelectorNeedle(oldSelector);
    return {
      id: entry.id,
      oldSelector,
      tokenSelector: entry.selector,
      primaryClass,
      collisionClass,
      oldCollides: collisionClass.includes(oldNeedle),
      tokenMatchesPrimary: simpleClassSelectorMatches(entry.selector, primaryClass),
      tokenCollides: simpleClassSelectorMatches(entry.selector, collisionClass),
    };
  });
}

function writeFixturePayload(currentSites) {
  const payload = {
    version: 'B-V6-P1-selector-collision-v1',
    orderPair: [PRIMARY_ORDER, COLLISION_ORDER],
    stampObserved: 'B-V6 selector collision synthetic SVG browser gate',
    preconditionLogLine: 'Parsed remover selector templates and producer class templates from order-manager.js source text at runtime.',
    states: [
      {
        id: 'current-source',
        name: 'current source selectors',
        sites: [currentSites.control, ...currentSites.experiment],
      },
      {
        id: 'known-colliding-substring-selector',
        name: 'known colliding substring selector',
        sites: cloneForKnownCollision(currentSites),
      },
      {
        id: 'deliberately-corrupted-input',
        name: 'deliberately corrupted selector input',
        sites: cloneForCorruption(currentSites),
      },
      {
        id: 'selector-matches-nothing',
        name: 'selector matching nothing',
        sites: cloneForNoMatch(currentSites),
      },
      {
        id: 'producer-produces-nothing',
        name: 'producer produces no SVG elements',
        sites: cloneForEmptyProducer(currentSites),
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
  const removedPrimary = siteResult.removedPrimaryOrder?.length ? siteResult.removedPrimaryOrder.join(', ') : '<none>';
  const removedCollision = siteResult.removedCollisionOrder?.length ? siteResult.removedCollisionOrder.join(', ') : '<none>';
  return `${siteResult.id}: ${siteResult.verdict}; matched=[${matched}]; removed-order-${PRIMARY_ORDER}=[${removedPrimary}]; removed-order-${COLLISION_ORDER}=[${removedCollision}]`;
}

function resultCell(id, name, run) {
  try {
    run();
    return { id, name, status: 'PASS', detail: 'assertion satisfied' };
  } catch (error) {
    return { id, name, status: 'FAIL', detail: String(error && error.message ? error.message : error) };
  }
}

function replaceRequired(text, from, to, label) {
  assert.ok(text.includes(from), `mutation target not found for ${label}: ${from}`);
  return text.replace(from, to);
}

function assertSourceMutationRejected(mutatedSource) {
  assertNoForbiddenClassSubstringSelectors(mutatedSource);
  const mutatedSites = buildCurrentSites(mutatedSource);
  assertCompleteSiteInventory(mutatedSites);
}

function classSubstringBanProbeRows() {
  const probes = [
    ['the original bug, verbatim', '`[class*="pending-tp-${orderId}"]`'],
    ['same, oid', '`[class*="multi-tp-avg-${oid}"]`'],
    ['string concatenation', '\'[class*="pending-tp-\' + oid + \'"]\''],
    ['unlisted var name', '`[class*="pending-tp-${ordId}"]`'],
    ['unlisted path ol.orderId', '`[class*="pending-tp-${ol.orderId}"]`'],
    ['unlisted path row.id', '`[class*="pending-tp-${row.id}"]`'],
    ['String(oid)', '`[class*="pending-tp-${String(oid)}"]`'],
  ];
  return probes.map(([label, arg]) => {
    const probeSource = `function __bV6Probe(svg, oid, orderId, ordId, ol, row) { svg.selectAll(${arg}).remove(); }\n`;
    let caught = false;
    try {
      assertNoForbiddenClassSubstringSelectors(probeSource);
    } catch {
      caught = true;
    }
    return { label, arg, caught };
  });
}

function runDesignedMutationSet(baseSource, browserReport) {
  const mutants = [];
  const addSourceMutant = (name, caughtBy, mutateSource) => {
    mutants.push({
      name,
      expectedCatch: caughtBy,
      run: () => assertSourceMutationRejected(mutateSource(baseSource)),
    });
  };
  const addReportMutant = (name, caughtBy, run) => mutants.push({ name, expectedCatch: caughtBy, run });
  const killedWhen = (condition, message) => {
    if (condition) throw new Error(message);
  };

  addSourceMutant('M01 original bug verbatim', 'static inventory ban', (text) => `${text}\nfunction __bV6M01(svg, orderId) { svg.selectAll(\`[class*="pending-tp-\${orderId}"]\`).remove(); }\n`);
  addSourceMutant('M02 original bug with oid', 'static inventory ban', (text) => `${text}\nfunction __bV6M02(svg, oid) { svg.selectAll(\`[class*="multi-tp-avg-\${oid}"]\`).remove(); }\n`);
  addSourceMutant('M03 string concatenation broad selector', 'static inventory ban', (text) => `${text}\nfunction __bV6M03(svg, oid) { svg.selectAll('[class*="pending-tp-' + oid + '"]').remove(); }\n`);
  addSourceMutant('M04 unlisted ordId interpolation', 'static inventory ban', (text) => `${text}\nfunction __bV6M04(svg, ordId) { svg.selectAll(\`[class*="pending-tp-\${ordId}"]\`).remove(); }\n`);
  addSourceMutant('M05 unlisted ol.orderId interpolation', 'static inventory ban', (text) => `${text}\nfunction __bV6M05(svg, ol) { svg.selectAll(\`[class*="pending-tp-\${ol.orderId}"]\`).remove(); }\n`);
  addSourceMutant('M06 unlisted row.id interpolation', 'static inventory ban', (text) => `${text}\nfunction __bV6M06(svg, row) { svg.selectAll(\`[class*="pending-tp-\${row.id}"]\`).remove(); }\n`);
  addSourceMutant('M07 String(oid) interpolation', 'static inventory ban', (text) => `${text}\nfunction __bV6M07(svg, oid) { svg.selectAll(\`[class*="pending-tp-\${String(oid)}"]\`).remove(); }\n`);
  addSourceMutant('M08 non-allowlisted literal marker substring', 'static inventory ban', (text) => `${text}\nfunction __bV6M08(svg) { svg.selectAll('[class*="pending-tp-3"]').remove(); }\n`);
  addSourceMutant('M09 non-allowlisted combined substring', 'static inventory ban', (text) => `${text}\nfunction __bV6M09(svg, primaryLegId) { svg.selectAll('[class*="pending-tp-' + primaryLegId + '"],.kept').remove(); }\n`);
  addSourceMutant('M10 hardcode pending pct order 1', 'parse health', (text) => replaceRequired(text, '`.pending-tp-pct-control.pending-tp-${orderId}`', '`.pending-tp-pct-control.pending-tp-1`', 'hardcode pending pct order 1'));
  addSourceMutant('M11 hardcode pending delete order 1', 'parse health', (text) => replaceRequired(text, '`.pending-tp-delete.pending-tp-${orderId}`', '`.pending-tp-delete.pending-tp-1`', 'hardcode pending delete order 1'));
  addSourceMutant('M12 hardcode sweep open order 1', 'parse health', (text) => replaceRequired(text, '`.open-tp-pct-control.tp-${oid}`', '`.open-tp-pct-control.tp-1`', 'hardcode sweep open order 1'));
  addSourceMutant('M13 hardcode sweep pending pct order 1', 'parse health', (text) => replaceRequired(text, '`.pending-tp-pct-control.pending-tp-${oid}`', '`.pending-tp-pct-control.pending-tp-1`', 'hardcode sweep pending pct order 1'));
  addSourceMutant('M14 hardcode sweep pending delete order 1', 'parse health', (text) => replaceRequired(text, '`.pending-tp-delete.pending-tp-${oid}`', '`.pending-tp-delete.pending-tp-1`', 'hardcode sweep pending delete order 1'));
  addSourceMutant('M15 hardcode multi avg order 1', 'parse health', (text) => replaceRequired(text, '`.multi-tp-avg-${oid}`', '`.multi-tp-avg-1`', 'hardcode multi avg order 1'));
  addSourceMutant('M16 duplicate pending pct selector', 'parse health', (text) => replaceRequired(text, 'c.svg.selectAll(`.pending-tp-pct-control.pending-tp-${oid}`).remove();', 'c.svg.selectAll(`.pending-tp-pct-control.pending-tp-${oid}`).remove();\n            c.svg.selectAll(`.pending-tp-pct-control.pending-tp-${oid}`).remove();', 'duplicate pending pct selector'));
  addSourceMutant('M17 remove multi avg selector', 'parse health', (text) => replaceRequired(text, 'svg.selectAll(`.multi-tp-avg-${oid}`).remove();', 'svg.selectAll(`.multi-tp-avg-missing-${oid}`).remove();', 'remove multi avg selector'));
  addSourceMutant('M18 typo open pct selector', 'parse health', (text) => replaceRequired(text, 'c.svg.selectAll(`.open-tp-pct-control.tp-${oid}`).remove();', 'c.svg.selectAll(`.open-tp-pct-control.missing-tp-${oid}`).remove();', 'typo open pct selector'));

  const browserMutationState = requireState(browserReport, 'known-colliding-substring-selector');
  for (const siteId of [
    'site-5-multi-tp-avg',
    'site-1-remove-pending-tp-pct',
    'site-2-sweep-open-tp-pct',
    'site-3-sweep-pending-tp-pct',
    'site-4-sweep-pending-tp-delete',
  ]) {
    addReportMutant(`W${String(mutants.length - 17).padStart(2, '0')} in-place broad ${siteId}`, 'browser oracle', () => {
      const siteResult = browserMutationState.sites.find((entry) => entry.id === siteId);
      killedWhen(siteResult?.assertionPass === false && siteResult?.removedCollisionOrder?.length > 0, `${siteId} browser collision killed`);
    });
  }
  addReportMutant('W06 selector matching nothing must fail', 'browser oracle', () => killedWhen(statePasses(requireState(browserReport, 'selector-matches-nothing')) === false, 'no-match selector killed'));
  addReportMutant('W07 producer producing nothing must fail', 'browser oracle', () => killedWhen(statePasses(requireState(browserReport, 'producer-produces-nothing')) === false, 'empty producer killed'));
  addReportMutant('W08 invalid selector must fail', 'browser oracle', () => killedWhen(statePasses(requireState(browserReport, 'deliberately-corrupted-input')) === false, 'invalid selector killed'));
  addReportMutant('W09 parse with zero sites must fail', 'parse health', () => assertCompleteSiteInventory({ control: null, experiment: [] }));
  addReportMutant('W10 current source must include all sites', 'parse health', () => killedWhen(requireState(browserReport, 'current-source').sites.length === 6, 'site count killed'));
  addReportMutant('W11 current source must match primary order', 'browser oracle', () => killedWhen(requireState(browserReport, 'current-source').sites.every((entry) => entry.removedPrimaryOrder?.length === entry.producerEvidence?.length), 'primary removal killed'));
  addReportMutant('W12 current source must spare collision order', 'browser oracle', () => killedWhen(requireState(browserReport, 'current-source').sites.every((entry) => entry.removedCollisionOrder?.length === 0), 'collision spare killed'));

  mutants.push({
    name: 'S31 pure stub returning green cells',
    allowedSurvivor: true,
    run: () => {},
  });

  return mutants.map((mutant) => {
    try {
      mutant.run();
      return { name: mutant.name, survived: true, allowedSurvivor: mutant.allowedSurvivor === true };
    } catch (error) {
      return {
        name: mutant.name,
        survived: false,
        caughtBy: mutant.expectedCatch || 'unknown',
        detail: String(error && error.message ? error.message : error),
      };
    }
  });
}

const cells = [];
const source = fs.readFileSync(PRODUCT_PATH, 'utf8');
let currentSites = null;
let markerProofRows = [];
const banProbeRows = classSubstringBanProbeRows();

cells.push(resultCell('B-V6-00', 'source inventory parses exhaustively', () => {
  assertNoForbiddenClassSubstringSelectors(source);
  currentSites = buildCurrentSites(source);
  assertCompleteSiteInventory(currentSites);
  markerProofRows = markerCollisionRows(currentSites);
  assert.equal(markerProofRows.length, 5, `expected five marker collision rows, found ${markerProofRows.length}`);
  assert.deepEqual(
    markerProofRows.filter((row) => !row.oldCollides || !row.tokenMatchesPrimary || row.tokenCollides).map((row) => row.id),
    [],
    'marker collision proof failed for site(s)'
  );
}));

cells.push(resultCell('B-V6-01', 'class substring ban catches evasion forms', () => {
  assert.deepEqual(
    banProbeRows.filter((row) => !row.caught).map((row) => `${row.label}: ${row.arg}`),
    [],
    'class substring ban evasion(s) survived'
  );
}));

let runnerResult = {
  ok: false,
  error: 'browser runner skipped because source inventory did not parse',
  report: null,
};

if (currentSites) {
  writeFixturePayload(currentSites);
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
}

let report = runnerResult.report;
cells.push(resultCell('B-V6-02', 'browser runner produced valid report shape', () => {
  assert.equal(runnerResult.ok, true, runnerResult.error || 'runner returned ok=false');
  const validation = validateOrderOverlayReport(report);
  assert.equal(validation.ok, true, validation.errors.join('; '));
  assert.equal(report.fixturePayloadVersion, 'B-V6-P1-selector-collision-v1');
}));

if (!report) {
  report = { states: [] };
}

const currentState = report.states?.find((entry) => entry.id === 'current-source') || { sites: [] };
const knownCollisionState = report.states?.find((entry) => entry.id === 'known-colliding-substring-selector') || { sites: [] };
const corruptedState = report.states?.find((entry) => entry.id === 'deliberately-corrupted-input') || { sites: [] };
const noMatchState = report.states?.find((entry) => entry.id === 'selector-matches-nothing') || { sites: [] };
const emptyProducerState = report.states?.find((entry) => entry.id === 'producer-produces-nothing') || { sites: [] };

cells.push(resultCell('B-V6-03', `current source removes order ${PRIMARY_ORDER} only`, () => {
  const state = requireState(report, 'current-source');
  const failures = state.sites.filter((entry) => entry.id !== 'control-token-delete' && !entry.assertionPass);
  assert.deepEqual(failures.map(summarizeSite), [], 'current source collision(s):\n  - ' + failures.map(summarizeSite).join('\n  - '));
}));

cells.push(resultCell('B-V6-04', 'known colliding selector fails closed', () => {
  const state = requireState(report, 'known-colliding-substring-selector');
  assert.equal(statePasses(state), false, 'known colliding selector unexpectedly passed');
  const failures = state.sites.filter((entry) => entry.assertionPass || entry.removedCollisionOrder?.length === 0);
  assert.deepEqual(failures.map(summarizeSite), [], 'product-shaped broad selector did not collide for every marker');
}));

cells.push(resultCell('B-V6-05', 'deliberately corrupted input fails closed', () => {
  const state = requireState(report, 'deliberately-corrupted-input');
  assert.equal(statePasses(state), false, 'corrupted selector unexpectedly passed');
  assert.ok(state.sites.some((entry) => entry.selectorError), 'corrupted selector did not report a selector error');
}));

cells.push(resultCell('B-V6-06', 'selector matching nothing fails closed', () => {
  const state = requireState(report, 'selector-matches-nothing');
  assert.equal(statePasses(state), false, 'no-match selector unexpectedly passed');
  assert.ok(state.sites.some((entry) => entry.matchedLabels?.length === 0 && entry.removedPrimaryOrder?.length === 0), 'no-match selector did not exercise the absence path');
}));

cells.push(resultCell('B-V6-07', 'empty producer output fails closed', () => {
  const state = requireState(report, 'producer-produces-nothing');
  assert.equal(statePasses(state), false, 'empty producer output unexpectedly passed');
  assert.ok(state.sites.some((entry) => entry.sitePreconditionPass === false), 'empty producer output did not fail the fixture precondition');
}));

cells.push(resultCell('B-V6-08', 'control token selector does not collide', () => {
  const state = requireState(report, 'current-source');
  const control = state.sites.find((entry) => entry.id === 'control-token-delete');
  assert.ok(control, 'control site missing');
  assert.equal(control.assertionPass, true, summarizeSite(control));
}));

const mutationResults = currentSites && report.states?.length ? runDesignedMutationSet(source, report) : [];
cells.push(resultCell('B-V6-09', 'designed mutation budget has only allowed survivor', () => {
  assert.ok(mutationResults.length > 0, 'mutation set did not run');
  const unexpectedSurvivors = mutationResults.filter((entry) => entry.survived && !entry.allowedSurvivor);
  assert.deepEqual(unexpectedSurvivors.map((entry) => entry.name), [], 'unexpected mutation survivor(s)');
  const killed = mutationResults.filter((entry) => !entry.survived);
  for (const mechanism of ['browser oracle', 'static inventory ban', 'parse health']) {
    assert.ok(killed.some((entry) => entry.caughtBy === mechanism), `mutation ledger has no ${mechanism} catch`);
  }
}));

const site5 = currentState.sites.find((entry) => entry.id === 'site-5-multi-tp-avg');
const site5Matched = site5?.matchedLabels?.length ? site5.matchedLabels.join(', ') : '<none>';
console.log(`Site 5 collides: ${site5?.assertionPass === false ? 'YES' : 'NO'}; matched elements: ${site5Matched}`);
console.log('');
console.log('B-V6-P1 selector collision browser gate');
console.log(`Writing tree confirmed: ${WRITING_TREE}`);
console.log(`Product source read-only: ${PRODUCT_PATH}`);
console.log(`Browser runner imported from read-only other tree: ${RUNNER_PATH}`);
console.log(`Order pair: ${PRIMARY_ORDER}/${COLLISION_ORDER}; bare id substring collision: "${COLLISION_ORDER}".includes("${PRIMARY_ORDER}") === ${COLLISION_ORDER.includes(PRIMARY_ORDER)}`);
console.log('CI portability: depends on an untracked runner file in another worktree, so not CI-portable yet.');
console.log('GREEN licenses: selector matching against synthetic SVG in a real browser only; it does not license the product order lifecycle.');
console.log(`Allowed literal [class*=] selectAll arguments in current source: ${ALLOWED_CLASS_SUBSTRING_SELECTALL_ARGS.size}`);
console.log('');
console.log('Class substring ban probes:');
for (const row of banProbeRows) {
  console.log(`  ${row.caught ? 'CAUGHT' : 'EVADED'} ${row.label}: ${row.arg}`);
}
console.log('');
console.log('Marker-prefixed collision proof:');
for (const row of markerProofRows) {
  console.log(`  ${row.id}: old ${row.oldSelector} collides=${row.oldCollides}; token ${row.tokenSelector} primary=${row.tokenMatchesPrimary} collision=${row.tokenCollides}`);
}
console.log('');
console.log('Current-source site verdicts:');
for (const siteResult of currentState.sites || []) {
  console.log(`  ${summarizeSite(siteResult)}`);
}
console.log('');
console.log('Known-colliding negative-control verdicts:');
for (const siteResult of knownCollisionState.sites || []) {
  console.log(`  ${summarizeSite(siteResult)}`);
}
console.log('');
console.log('Corruption negative-control verdicts:');
for (const siteResult of corruptedState.sites || []) {
  console.log(`  ${summarizeSite(siteResult)}`);
}
console.log('');
console.log('Absence negative-control verdicts:');
for (const siteResult of [...(noMatchState.sites || []), ...(emptyProducerState.sites || [])]) {
  console.log(`  ${summarizeSite(siteResult)}`);
}
console.log('');
if (mutationResults.length) {
  const survived = mutationResults.filter((entry) => entry.survived);
  const killed = mutationResults.filter((entry) => !entry.survived);
  const countByMechanism = (mechanism) => killed.filter((entry) => entry.caughtBy === mechanism).length;
  console.log(`Mutation set: ${mutationResults.length} designed / ${survived.length} survived`);
  console.log(`  caught by browser oracle: ${countByMechanism('browser oracle')}`);
  console.log(`  caught by static inventory ban: ${countByMechanism('static inventory ban')}`);
  console.log(`  caught by parse health: ${countByMechanism('parse health')}`);
  for (const entry of survived) {
    console.log(`  SURVIVED: ${entry.name}${entry.allowedSurvivor ? ' (allowed)' : ''}`);
  }
  console.log('');
}
console.log('Proof cells:');
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
