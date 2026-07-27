/**
 * B-OREI — order-line registry eviction invariant (red gate).
 *
 * Invariant under test
 *   Every site in order-manager.js that evicts entries from the `this.orderLines`
 *   registry with a predicate keyed on `orderId` must discriminate pending rows
 *   from executed rows, unless the site is an intentional remove-all whose
 *   disposal loop covers exactly the set it removes.
 *
 * Why this gate is STRUCTURAL
 *   The eviction sites sit inside DOM/D3/rAF-bound methods that cannot be loaded
 *   in Node, so the gate inspects source text rather than running the product.
 *   Two consequences were designed for deliberately:
 *     - No assertion references a line number or an exact whitespace run. Sites
 *       are located by the eviction construct itself and keyed by their ordinal
 *       in source order, so reformatting does not move them.
 *     - Comments, string literals, template literals and regex literals are
 *       blanked before any analysis, and the discriminator must appear as a
 *       property access on the predicate's OWN parameter. A comment mentioning
 *       `isPending`, a string containing it, or an unrelated local variable
 *       named `isPending` therefore cannot satisfy the gate. Cell B-OREI-01
 *       proves this on synthetic inputs on every run.
 *
 * Scope
 *   This gate bounds eviction blast radius only. It says nothing about why a
 *   lookup misses for a live order; that trigger is out of scope here.
 *
 * Usage
 *   node "chart v 1.4/chart/modules/b-order-registry-eviction-invariant.red.mjs"
 *   optional: --fixture=<path>  override fixture (proof runs)
 *   optional: --source=<path>   override product source (proof runs)
 *   optional: --invert=<cellId> invert one cell's assertion (proof runs)
 * Exit code 1 on any failing cell.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRODUCT_RELATIVE = ['chart v 1.4', 'chart', 'modules', 'order-manager.js'];
const FIXTURE_RELATIVE = ['chart v 1.4', 'chart', 'modules', 'b-fixtures', 'order-registry-eviction-sites.json'];

function findRepoRoot(startDir) {
  let dir = startDir;
  while (dir && dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, ...PRODUCT_RELATIVE))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(`Could not resolve repository root from ${startDir}`);
}

const repoRoot = findRepoRoot(__dirname);

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : 'true'];
  })
);

const invertedCell = args.get('invert') || '';
const fixturePath = args.has('fixture')
  ? path.resolve(repoRoot, args.get('fixture'))
  : path.join(repoRoot, ...FIXTURE_RELATIVE);
const sourcePath = args.has('source')
  ? path.resolve(repoRoot, args.get('source'))
  : path.join(repoRoot, ...PRODUCT_RELATIVE);

/* ------------------------------------------------------------------ *
 * Lexical masking: blank comments and literals, preserving offsets.
 * ------------------------------------------------------------------ */

function regexCanStart(prevMeaningfulChar) {
  if (!prevMeaningfulChar) return true;
  return !/[A-Za-z0-9_$)\]]/.test(prevMeaningfulChar);
}

/**
 * Returns a string of identical length and identical newline positions in which
 * every comment body, string body, template body and regex body is replaced by
 * spaces. Delimiters are kept so token shape survives.
 */
function maskInert(src) {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  let prev = '';

  const blank = (idx) => {
    if (idx < n && out[idx] !== '\n') out[idx] = ' ';
  };

  while (i < n) {
    const c = src[i];
    const d = i + 1 < n ? src[i + 1] : '';

    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') { blank(i); i += 1; }
      continue;
    }

    if (c === '/' && d === '*') {
      blank(i); blank(i + 1); i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { blank(i); i += 1; }
      blank(i); blank(i + 1); i += 2;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i += 1;
      let braceDepth = 0;
      while (i < n) {
        const s = src[i];
        if (s === '\\') { blank(i); blank(i + 1); i += 2; continue; }
        if (quote === '`' && s === '$' && src[i + 1] === '{') {
          blank(i); blank(i + 1); braceDepth += 1; i += 2; continue;
        }
        if (quote === '`' && braceDepth > 0) {
          if (s === '{') braceDepth += 1;
          else if (s === '}') braceDepth -= 1;
          blank(i); i += 1; continue;
        }
        if (s === quote) break;
        if (quote !== '`' && s === '\n') break; // unterminated; bail rather than desync
        blank(i); i += 1;
      }
      i += 1;
      prev = quote;
      continue;
    }

    if (c === '/' && regexCanStart(prev)) {
      i += 1;
      let inClass = false;
      while (i < n) {
        const s = src[i];
        if (s === '\\') { blank(i); blank(i + 1); i += 2; continue; }
        if (s === '\n') break;
        if (s === '[') inClass = true;
        else if (s === ']') inClass = false;
        else if (s === '/' && !inClass) break;
        blank(i); i += 1;
      }
      i += 1;
      prev = '/';
      continue;
    }

    if (!/\s/.test(c)) prev = c;
    i += 1;
  }

  return out.join('');
}

/* ------------------------------------------------------------------ *
 * Structural discovery of orderId-keyed registry evictions.
 * ------------------------------------------------------------------ */

const CONTROL_WORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'do',
  'with', 'try', 'typeof', 'new', 'delete', 'void', 'case', 'in', 'of', 'await',
  'yield', 'throw',
]);

function matchParen(masked, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < masked.length; i += 1) {
    const c = masked[i];
    if (c === '(') depth += 1;
    else if (c === ')') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

function statementEnd(masked, from) {
  let depth = 0;
  for (let i = from; i < masked.length; i += 1) {
    const c = masked[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') { depth -= 1; if (depth < 0) return -1; }
    else if (c === ';' && depth === 0) return i;
  }
  return -1;
}

function findEnclosingMethod(masked, offset) {
  const re = /(?:^|\n)[ \t]*(?:static[ \t]+)?(?:async[ \t]+)?([A-Za-z_$#][A-Za-z0-9_$]*)[ \t]*\(([^()\n]*)\)[ \t]*\{/g;
  let best = null;
  let m = re.exec(masked);
  while (m !== null) {
    if (m.index >= offset) break;
    if (!CONTROL_WORDS.has(m[1])) best = { name: m[1], start: m.index };
    m = re.exec(masked);
  }
  return best;
}

function firstFilterPredicate(masked, from, to) {
  const region = masked.slice(from, to);
  const re = /\.\s*filter\s*\(/g;
  const m = re.exec(region);
  if (!m) return null;
  const openIdx = from + m.index + m[0].length - 1;
  const closeIdx = matchParen(masked, openIdx);
  if (closeIdx === -1 || closeIdx > to) return null;
  return { text: masked.slice(openIdx + 1, closeIdx), start: openIdx + 1, end: closeIdx };
}

function describePredicate(predicateText, discriminatorProperty) {
  const paramMatch = /^\s*\(?\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)?\s*=>/.exec(predicateText);
  const param = paramMatch ? paramMatch[1] : null;
  const keyedOnOrderId = /\borderId\b/.test(predicateText);
  if (!param) {
    return { param: null, keyedOnOrderId, discriminated: false, polarity: null };
  }
  const access = `${param}\\s*(?:\\?\\s*\\.|\\.)\\s*${discriminatorProperty}\\b`;
  const discriminated = new RegExp(access).test(predicateText);
  let polarity = null;
  if (discriminated) {
    polarity = new RegExp(`!\\s*${access}`).test(predicateText) ? 'executed' : 'pending';
  }
  return { param, keyedOnOrderId, discriminated, polarity };
}

function normalise(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Discovers every `this.<registry> = ... .filter(<predicate keyed on orderId>)`
 * eviction in the given source, in source order.
 */
function analyseSource(rawSource, { registryProperty = 'orderLines', discriminatorProperty = 'isPending' } = {}) {
  const masked = maskInert(rawSource);
  if (masked.length !== rawSource.length) throw new Error('masker changed source length');

  const assignRe = new RegExp(`this\\s*\\.\\s*${registryProperty}\\s*=(?!=)`, 'g');
  const sites = [];
  const perMethodCount = new Map();
  let m = assignRe.exec(masked);

  while (m !== null) {
    const rhsStart = m.index + m[0].length;
    const stmtEnd = statementEnd(masked, rhsStart);
    if (stmtEnd !== -1) {
      const predicate = firstFilterPredicate(masked, rhsStart, stmtEnd);
      if (predicate) {
        const shape = describePredicate(predicate.text, discriminatorProperty);
        if (shape.keyedOnOrderId) {
          const method = findEnclosingMethod(masked, m.index);
          const methodName = method ? method.name : '<unresolved>';
          const inMethod = perMethodCount.get(methodName) ?? 0;
          perMethodCount.set(methodName, inMethod + 1);
          sites.push({
            ordinal: sites.length,
            enclosingMethod: methodName,
            methodStart: method ? method.start : 0,
            ordinalInMethod: inMethod,
            offset: m.index,
            predicate: normalise(predicate.text),
            ...shape,
          });
        }
      }
    }
    m = assignRe.exec(masked);
  }

  return { masked, sites };
}

/**
 * Evidence for `remove-all-with-set-wide-disposal`: somewhere between the start
 * of the enclosing method and the eviction there must be another orderId-keyed
 * filter of the same discriminator class (the "collect the doomed rows" filter),
 * followed by a forEach that consumes it.
 */
function setWideDisposalEvidence(masked, site, discriminatorProperty) {
  const region = { from: site.methodStart, to: site.offset };
  const re = /\.\s*filter\s*\(/g;
  const slice = masked.slice(region.from, region.to);
  let m = re.exec(slice);
  while (m !== null) {
    const openIdx = region.from + m.index + m[0].length - 1;
    const closeIdx = matchParen(masked, openIdx);
    if (closeIdx !== -1 && closeIdx < region.to) {
      const text = masked.slice(openIdx + 1, closeIdx);
      const shape = describePredicate(text, discriminatorProperty);
      if (shape.keyedOnOrderId && shape.discriminated === site.discriminated && shape.polarity === site.polarity) {
        const after = masked.slice(closeIdx, region.to);
        if (/\.\s*forEach\s*\(/.test(after)) {
          return { found: true, collectFilter: normalise(text) };
        }
      }
    }
    m = re.exec(slice);
  }
  return { found: false, collectFilter: null };
}

/* ------------------------------------------------------------------ *
 * Self-test corpus: proves the detector is not satisfiable by comments,
 * strings, or an unrelated local named like the discriminator.
 * ------------------------------------------------------------------ */

function wrapMethod(body) {
  return `class Probe {\n    probeMethod(orderId) {\n${body}\n    }\n}\n`;
}

const SELF_TESTS = [
  {
    name: 'bare undiscriminated eviction is NOT discriminated',
    body: '        this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId));',
    expect: { count: 1, discriminated: false, polarity: null },
  },
  {
    name: 'line comment naming the discriminator does NOT satisfy',
    body: '        // must also check ol.isPending here\n        this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId));',
    expect: { count: 1, discriminated: false, polarity: null },
  },
  {
    name: 'comment INSIDE the predicate does NOT satisfy',
    body: '        this.orderLines = (this.orderLines || []).filter(\n            (ol) => /* ol.isPending */ !(ol.orderId === orderId) // ol.isPending\n        );',
    expect: { count: 1, discriminated: false, polarity: null },
  },
  {
    name: 'string literal containing the access does NOT satisfy',
    body: '        this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && "ol.isPending"));',
    expect: { count: 1, discriminated: false, polarity: null },
  },
  {
    name: 'template literal containing the access does NOT satisfy',
    body: '        this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && `${1}ol.isPending`));',
    expect: { count: 1, discriminated: false, polarity: null },
  },
  {
    name: 'unrelated free variable named isPending does NOT satisfy',
    body: '        this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && isPending));',
    expect: { count: 1, discriminated: false, polarity: null },
  },
  {
    name: 'discriminator on a DIFFERENT object does NOT satisfy',
    body: '        this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && other.isPending));',
    expect: { count: 1, discriminated: false, polarity: null },
  },
  {
    name: 'renaming the predicate parameter does not break detection',
    body: '        this.orderLines = (this.orderLines || []).filter((row) => !(row.orderId === orderId && row.isPending));',
    expect: { count: 1, discriminated: true, polarity: 'pending' },
  },
  {
    name: 'genuine pending discriminator IS detected',
    body: '        this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && ol.isPending));',
    expect: { count: 1, discriminated: true, polarity: 'pending' },
  },
  {
    name: 'genuine executed discriminator IS detected with executed polarity',
    body: '        this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && !ol.isPending));',
    expect: { count: 1, discriminated: true, polarity: 'executed' },
  },
  {
    name: 'optional chaining and heavy reformatting still detected',
    body: '        this.orderLines\n            =\n            ( this.orderLines || [] )\n                .filter(\n                    ol =>\n                        !(\n                            ol.orderId === orderId\n                            &&   !   ol   ?.   isPending\n                        )\n                );',
    expect: { count: 1, discriminated: true, polarity: 'executed' },
  },
  {
    name: 'eviction not keyed on orderId is not inventoried',
    body: '        this.orderLines = (this.orderLines || []).filter((ol) => !ol.chart || ol.chart === this.chart);',
    expect: { count: 0 },
  },
  {
    name: 'plain reset is not inventoried',
    body: '        this.orderLines = [];',
    expect: { count: 0 },
  },
];

/* ------------------------------------------------------------------ *
 * Cells
 * ------------------------------------------------------------------ */

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const rawSource = fs.readFileSync(sourcePath, 'utf8');
const registryProperty = String(fixture.meta.registryExpression).replace(/^this\./, '');
const discriminatorProperty = String(fixture.meta.discriminatorProperty);
const { masked, sites: discovered } = analyseSource(rawSource, { registryProperty, discriminatorProperty });
const expectedSites = fixture.sites;
const exemptionCodes = new Set(fixture.meta.exemptionCodes || []);

const cells = [
  ['B-OREI-01', 'DETECTOR SELF-TEST (comment/string/rename immunity)', () => {
    for (const probe of SELF_TESTS) {
      const src = wrapMethod(probe.body);
      const { sites } = analyseSource(src, { registryProperty, discriminatorProperty });
      assert.equal(sites.length, probe.expect.count, `${probe.name}: inventoried ${sites.length}, expected ${probe.expect.count}`);
      if (probe.expect.count === 0) continue;
      assert.equal(sites[0].discriminated, probe.expect.discriminated, `${probe.name}: discriminated=${sites[0].discriminated}, expected ${probe.expect.discriminated}`);
      assert.equal(sites[0].polarity, probe.expect.polarity, `${probe.name}: polarity=${sites[0].polarity}, expected ${probe.expect.polarity}`);
    }
  }],

  ['B-OREI-02', 'SITE INVENTORY COUNT matches fixture', () => {
    assert.equal(
      discovered.length,
      expectedSites.length,
      `found ${discovered.length} orderId-keyed ${registryProperty} eviction(s), fixture declares ${expectedSites.length}`
        + ` [found: ${discovered.map((s) => `${s.ordinal}:${s.enclosingMethod}`).join(', ')}]`
    );
  }],

  ['B-OREI-03', 'SITE IDENTITY (enclosing method per ordinal)', () => {
    const n = Math.min(discovered.length, expectedSites.length);
    for (let i = 0; i < n; i += 1) {
      assert.equal(discovered[i].enclosingMethod, expectedSites[i].enclosingMethod, `ordinal ${i}: enclosing method is ${discovered[i].enclosingMethod}, fixture says ${expectedSites[i].enclosingMethod}`);
      assert.equal(discovered[i].ordinalInMethod, expectedSites[i].ordinalInMethod, `ordinal ${i} (${discovered[i].enclosingMethod}): ordinalInMethod is ${discovered[i].ordinalInMethod}, fixture says ${expectedSites[i].ordinalInMethod}`);
    }
    assert.equal(discovered.length, expectedSites.length, 'inventory length differs; see B-OREI-02');
  }],

  ['B-OREI-04', 'PREDICATE SHAPE PARSEABLE at every site', () => {
    for (const site of discovered) {
      assert.ok(site.param, `ordinal ${site.ordinal} (${site.enclosingMethod}): could not resolve predicate parameter from \`${site.predicate}\`; gate fails closed on unrecognised eviction shapes`);
    }
  }],

  ['B-OREI-05', 'DISCRIMINATOR PRESENT at every required site', () => {
    const failures = [];
    for (const expected of expectedSites) {
      if (!expected.mustDiscriminate) continue;
      const site = discovered[expected.ordinal];
      if (!site) { failures.push(`ordinal ${expected.ordinal} (${expected.enclosingMethod}): site not found in source`); continue; }
      if (!site.discriminated) {
        failures.push(`ordinal ${expected.ordinal} (${site.enclosingMethod}#${site.ordinalInMethod}) evicts on orderId without a ${site.param}.${discriminatorProperty} discriminator: ${site.predicate}`);
        continue;
      }
      if (site.polarity !== expected.expectedPolarity) {
        failures.push(`ordinal ${expected.ordinal} (${site.enclosingMethod}#${site.ordinalInMethod}) discriminates with polarity '${site.polarity}', fixture requires '${expected.expectedPolarity}': ${site.predicate}`);
      }
    }
    assert.deepEqual(failures, [], `${failures.length} undiscriminated/mis-polarised eviction site(s):\n  - ${failures.join('\n  - ')}`);
  }],

  ['B-OREI-06', 'EXEMPTION EVIDENCE for every exempt site', () => {
    const failures = [];
    for (const expected of expectedSites) {
      if (expected.mustDiscriminate) continue;
      const site = discovered[expected.ordinal];
      if (!site) { failures.push(`ordinal ${expected.ordinal} (${expected.enclosingMethod}): site not found in source`); continue; }
      if (!exemptionCodes.has(expected.exemption)) {
        failures.push(`ordinal ${expected.ordinal} (${expected.enclosingMethod}): exemption '${expected.exemption}' is not in meta.exemptionCodes`);
        continue;
      }
      const evidence = setWideDisposalEvidence(masked, site, discriminatorProperty);
      if (!evidence.found) {
        failures.push(`ordinal ${expected.ordinal} (${site.enclosingMethod}#${site.ordinalInMethod}) claims '${expected.exemption}' but no equivalently-keyed collect-filter feeding a forEach precedes it inside ${site.enclosingMethod}`);
      }
    }
    assert.deepEqual(failures, [], `${failures.length} unsupported exemption(s):\n  - ${failures.join('\n  - ')}`);
  }],
];

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const results = [];
for (const [id, name, runner] of cells) {
  let status;
  let detail;
  try {
    runner();
    status = 'PASS';
    detail = 'invariant satisfied';
  } catch (error) {
    status = 'FAIL';
    detail = String(error?.message || error);
  }
  if (id === invertedCell) {
    status = status === 'PASS' ? 'FAIL' : 'PASS';
    detail = `INVERTED ASSERTION; original detail: ${detail.split('\n')[0]}`;
  }
  results.push({ id, name, status, detail });
}

console.log('B-OREI order-line registry eviction invariant (structural red gate)');
console.log(`Source:  ${path.relative(repoRoot, sourcePath).split(path.sep).join('/')}`);
console.log(`Fixture: ${path.relative(repoRoot, fixturePath).split(path.sep).join('/')}`);
console.log(`Registry: this.${registryProperty}; discriminator: <row>.${discriminatorProperty}`);
if (invertedCell) console.log(`Inverted cell: ${invertedCell}`);
console.log('');
console.log('Discovered orderId-keyed eviction sites (source order):');
for (const site of discovered) {
  const flag = site.discriminated ? `discriminated:${site.polarity}` : 'UNDISCRIMINATED';
  console.log(`  [${site.ordinal}] ${site.enclosingMethod}#${site.ordinalInMethod} ${flag}`);
  console.log(`      ${site.predicate}`);
}
console.log('');
for (const result of results) {
  console.log(`${result.id} ${result.name}: ${result.status}`);
  for (const line of result.detail.split('\n')) console.log(`    ${line}`);
}

const passed = results.filter((r) => r.status === 'PASS').length;
const failed = results.length - passed;
console.log('');
console.log(`Summary: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(`B-OREI invariant violated: ${failed} cell(s) failing`);
  process.exitCode = 1;
}
