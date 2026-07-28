/**
 * B-OREI — order-line registry eviction gate.
 *
 * ============================================================================
 * WHAT THIS GATE ACTUALLY PROVES  (read this before citing it as evidence)
 * ============================================================================
 *
 * For each `this.orderLines = <filter-chain over this.orderLines>` assignment
 * that this gate can find in ONE file (`order-manager.js`) and can parse in a
 * restricted expression grammar, it proves:
 *
 *     removal-set  ==  disposal-set
 *
 * where both sets are computed by ACTUALLY EVALUATING the predicate source as
 * a boolean function over a small, closed, enumerated universe of row objects
 * (3 order ids — including a numeric twin of the target id, so `==` and `===`
 * are distinguishable — x 2 pending-states x 4 chart slots x 2 encodings of
 * "not pending"), and where the disposal-set is obtained from the source in
 * one of two shapes:
 *
 *   - collected-set : an earlier filter-chain over the same registry whose
 *                     result array is the ACTUAL RECEIVER of a `.forEach(...)`
 *                     disposal loop (binding-linked, not proximity-matched),
 *                     with a disposal callback that contains no `return`,
 *                     `break` or `continue`.
 *   - single-row    : the statement IMMEDIATELY PRECEDING the eviction is
 *                     `<disposalCall>(<binding>)`, and `<binding>` is the
 *                     parameter of a `.forEach(...)` over an earlier
 *                     filter-chain that the eviction statement sits inside.
 *
 * Nothing here is decided by the presence or absence of a substring. The
 * discriminator property (`isPending`) is not searched for at all. A predicate
 * that mentions it and a predicate that does not (`(ol) => ol !== olEntry`)
 * are both accepted iff their removal-set equals their disposal-set; a
 * predicate that mentions it and is wrong (`(ol.isPending || true)`) is
 * rejected. That is the whole design constraint, and it is why the gate
 * interprets predicates instead of matching them.
 *
 * Everything outside the restricted grammar FAILS CLOSED: calls, block-bodied
 * arrows, template literals, multi-parameter predicates, reads of properties
 * outside the row model, and free identifiers other than `orderId`, `ch`,
 * `olEntry` and `this` all make the gate fail rather than pass.
 *
 * ============================================================================
 * PREMISES — asserted by the fixture, NOT derived from the source
 * ============================================================================
 * P1  The meaning of the free identifiers at each site: `orderId` is the id of
 *     the order being resolved, `ch` is the chart being laid out, `this.chart`
 *     is the manager's home chart. The gate binds these to sentinels; it does
 *     NOT verify from the source that they are in scope with those meanings.
 * P2  The row model itself: a registry row is characterised by
 *     (orderId, isPending-truthiness, chart). If a row carries some other
 *     field that an eviction predicate ought to consider, this gate cannot
 *     see it — it will reject the predicate as reading an unmodelled property.
 * P3  For single-row sites, the fixture declares which row is disposed. The
 *     `pending` component of that declaration IS cross-checked against the
 *     source (see cell 05: enclosing `if (isPending)` / `else` derivation over
 *     a binding destructured from the disposal binding), and the `chart` and
 *     `orderId` components are cross-checked by requiring the declared row to
 *     be a member of the iteration source's collect-set. Nothing verifies that
 *     the iteration source declared in the fixture is the only one.
 * P4  Disposal is treated as total: a `.forEach` disposal loop is assumed to
 *     dispose every element it receives. The gate checks only that the loop
 *     cannot skip elements via `return`/`break`/`continue`. A `try/catch` that
 *     swallows a mid-row throw is NOT modelled.
 *
 * ============================================================================
 * KNOWN GAPS — this gate does NOT enforce a registry-wide invariant
 * ============================================================================
 * G1  ONE FILE ONLY. The same `orderLines` registry is evicted from
 *     `drawing-tools-manager.js` (`orderManager.orderLines = ...filter(...)`
 *     at, currently, lines 12088 and 12133 — the second of which is keyed on a
 *     `removedIds.includes(...)` set built elsewhere in the block). Those
 *     sites are invisible to this gate. Any claim of the form "all eviction
 *     sites are safe" is therefore FALSE if it cites only this artefact.
 * G2  ONE GRAMMAR ONLY. Only `this.<registry> = <filter chain>` assignments are
 *     inventoried. `splice`, `pop`, `shift`, `delete`, `length = n`, reassign
 *     from a `map`/`reduce`/`concat`/`slice` result, or eviction through an
 *     alias (`const a = this.orderLines; ... a.splice(...)`) are not detected
 *     AT ALL and will not even appear as an unmodelled shape.
 * G3  WHOLESALE RESETS ARE COUNTED, NOT CHECKED. `this.orderLines = []`
 *     discards the entire registry with no disposal analysis whatsoever.
 *     Cell 02 pins the number of such resets so a new one cannot appear
 *     silently, and that is the only protection offered.
 * G4  NO EXECUTION OF THE PRODUCT. Nothing here observes a real frame, a real
 *     row, or the actual reachability of any branch. A predicate can be
 *     removal-set-correct under this model and still be unreachable, reached
 *     with different bindings, or shadowed by a later mutation.
 * G5  DISPOSAL IS ASSUMED, NOT OBSERVED. The gate matches the NAME of the
 *     disposal call (fixture `meta.singleRowDisposalCall`) and the SHAPE of
 *     the disposal loop. It has no idea whether either actually detaches DOM.
 * G6  ROW UNIVERSE IS FINITE AND SMALL. A predicate wrong only for a row
 *     configuration outside the enumerated universe (a fourth chart identity,
 *     a truthy non-`true` `isPending` — the product only ever writes the
 *     literal `true`, so `isPending === true` would be accepted here — or
 *     duplicate rows sharing all three modelled attributes) is accepted.
 *     In particular the gate cannot distinguish
 *     "removes exactly the disposed row" from "removes every row that shares
 *     the disposed row's three modelled attributes" — for the currently
 *     shipped predicates those differ only if the registry holds duplicates.
 * G7  ORDER OF SITES ONLY. Sites are keyed by ordinal in source order plus
 *     enclosing method. Two evictions swapped between methods with the same
 *     shape would not be noticed.
 * G8  THE `ol.chart || this.chart` FALLBACK IS NOT COVERED. Demonstrated: the
 *     gate ACCEPTS a rewrite of the updateOrderLines predicates to plain
 *     `ol.chart === ch`. Its worlds always place the disposed row on an
 *     explicit chart distinct from `this.chart`, because the world where
 *     `this.chart === ch` and the disposed row has no `chart` property is
 *     precisely the world in which the SHIPPED predicates also remove a row
 *     they did not dispose. Modelling that world would reject the shipped fix,
 *     so it is excluded and named here instead. Anyone touching the chart
 *     clause of those two predicates gets no protection from this gate.
 * G9  CONSISTENCY, NOT INTENT. Demonstrated: narrowing BOTH the collect filter
 *     and the eviction of removeOrderLine by `&& ol.isPending` is ACCEPTED,
 *     because removal still equals disposal. The gate cannot tell you that the
 *     caller wanted the executed rows gone too. It proves the two sets agree,
 *     never that the agreed set is the right one.
 * G10 DELIBERATELY OVER-STRICT IN PLACES. A `for...of` disposal loop, a
 *     disposal call behind an `if`, a statement inserted between the disposal
 *     and the eviction, a block-bodied predicate, or any call inside a
 *     predicate all make this gate FAIL even when the code is correct. That is
 *     the chosen trade: unverifiable shapes fail rather than pass. Expect to
 *     extend the gate, not to silence it.
 *
 * ============================================================================
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
 * Errors. Every one of these is a FAIL, never a skip.
 * ------------------------------------------------------------------ */

class GateError extends Error {}
class GrammarError extends GateError {}   // predicate outside the restricted grammar
class ModelError extends GateError {}     // predicate stepped outside the row model
class ShapeError extends GateError {}     // source structure the gate cannot link up

/* ------------------------------------------------------------------ *
 * Lexical masking: blank comments and literals, preserving offsets.
 * Used ONLY for locating structure. Predicates are re-read from raw
 * source and re-tokenised, so nothing depends on the masker being a
 * complete JS lexer.
 * ------------------------------------------------------------------ */

function regexCanStart(prevMeaningfulChar) {
  if (!prevMeaningfulChar) return true;
  return !/[A-Za-z0-9_$)\]]/.test(prevMeaningfulChar);
}

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
 * Restricted expression grammar: tokenizer, parser, evaluator.
 *
 * Supported: identifiers, `this`, boolean/null/undefined/number/string
 * literals, member access (`.x`, `?.x`, `[expr]`, `?.[expr]`), `!`,
 * `===` `!==` `==` `!=`, `&&` `||` `??`, and the conditional operator.
 *
 * NOT supported, by design: calls, assignments, arithmetic, `typeof`,
 * `in`, `instanceof`, array/object literals, template literals, spread,
 * block-bodied arrows, multiple parameters, destructured parameters.
 * Encountering any of them raises GrammarError, which fails the gate.
 * ------------------------------------------------------------------ */

const PUNCTUATORS = ['===', '!==', '==', '!=', '&&', '||', '??', '?.', '=>', '!', '?', ':', '.', '(', ')', '[', ']', ','];

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === '{') throw new GrammarError('block-bodied predicate is not supported');
    if (c === '`') throw new GrammarError('template literal is not supported inside a predicate');
    if (c === '"' || c === "'") {
      const quote = c;
      let value = '';
      i += 1;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') { value += src[i + 1]; i += 2; continue; }
        value += src[i]; i += 1;
      }
      if (i >= src.length) throw new GrammarError('unterminated string literal');
      i += 1;
      toks.push({ type: 'string', value });
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      toks.push({ type: 'number', value: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) j += 1;
      toks.push({ type: 'ident', value: src.slice(i, j) });
      i = j;
      continue;
    }
    const punct = PUNCTUATORS.find((p) => src.startsWith(p, i));
    if (!punct) throw new GrammarError(`unsupported character '${c}' in predicate`);
    toks.push({ type: 'punct', value: punct });
    i += punct.length;
  }
  toks.push({ type: 'eof', value: '<eof>' });
  return toks;
}

const KEYWORD_LITERALS = new Map([
  ['true', true],
  ['false', false],
  ['null', null],
  ['undefined', undefined],
]);

/** Parses `<param> => <expression>` and nothing else. */
function parseArrowPredicate(src) {
  const toks = tokenize(src);
  let pos = 0;

  const peek = () => toks[pos];
  const isPunct = (v) => toks[pos].type === 'punct' && toks[pos].value === v;
  const eat = (v) => { if (isPunct(v)) { pos += 1; return true; } return false; };
  const expect = (v) => { if (!eat(v)) throw new GrammarError(`expected '${v}', found '${String(peek().value)}'`); };

  let param;
  if (peek().type === 'ident' && !KEYWORD_LITERALS.has(peek().value) && peek().value !== 'this') {
    param = peek().value;
    pos += 1;
  } else if (eat('(')) {
    if (peek().type !== 'ident') throw new GrammarError('predicate parameter must be a plain identifier');
    param = peek().value;
    pos += 1;
    if (isPunct(',')) throw new GrammarError('predicate must take exactly one parameter');
    expect(')');
  } else {
    throw new GrammarError('predicate must be a single-parameter arrow function');
  }
  expect('=>');

  const parseConditional = () => {
    const test = parseOr();
    if (eat('?')) {
      const cons = parseConditional();
      expect(':');
      const alt = parseConditional();
      return { t: 'cond', test, cons, alt };
    }
    return test;
  };

  function parseOr() {
    let left = parseAnd();
    while (isPunct('||') || isPunct('??')) {
      const op = peek().value;
      pos += 1;
      left = { t: 'bin', op, left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd() {
    let left = parseEquality();
    while (isPunct('&&')) {
      pos += 1;
      left = { t: 'bin', op: '&&', left, right: parseEquality() };
    }
    return left;
  }

  function parseEquality() {
    let left = parseUnary();
    while (isPunct('===') || isPunct('!==') || isPunct('==') || isPunct('!=')) {
      const op = peek().value;
      pos += 1;
      left = { t: 'bin', op, left, right: parseUnary() };
    }
    return left;
  }

  function parseUnary() {
    if (eat('!')) return { t: 'not', arg: parseUnary() };
    return parseMember();
  }

  function parseMember() {
    let node = parsePrimary();
    for (;;) {
      if (eat('.')) {
        if (peek().type !== 'ident') throw new GrammarError('expected property name after `.`');
        node = { t: 'member', obj: node, name: peek().value, optional: false };
        pos += 1;
        continue;
      }
      if (isPunct('?.')) {
        pos += 1;
        if (eat('[')) {
          const key = parseConditional();
          expect(']');
          node = { t: 'member', obj: node, key, optional: true };
          continue;
        }
        if (peek().type !== 'ident') throw new GrammarError('expected property name after `?.`');
        node = { t: 'member', obj: node, name: peek().value, optional: true };
        pos += 1;
        continue;
      }
      if (eat('[')) {
        const key = parseConditional();
        expect(']');
        node = { t: 'member', obj: node, key, optional: false };
        continue;
      }
      if (isPunct('(')) throw new GrammarError('call expressions are not supported inside a predicate');
      return node;
    }
  }

  function parsePrimary() {
    if (eat('(')) {
      const inner = parseConditional();
      expect(')');
      return inner;
    }
    const tok = peek();
    if (tok.type === 'string' || tok.type === 'number') { pos += 1; return { t: 'lit', v: tok.value }; }
    if (tok.type === 'ident') {
      pos += 1;
      if (KEYWORD_LITERALS.has(tok.value)) return { t: 'lit', v: KEYWORD_LITERALS.get(tok.value) };
      if (tok.value === 'this') return { t: 'this' };
      return { t: 'ident', name: tok.value };
    }
    throw new GrammarError(`unexpected token '${String(tok.value)}' in predicate`);
  }

  const ast = parseConditional();
  if (peek().type !== 'eof') throw new GrammarError(`unexpected trailing token '${String(peek().value)}' in predicate`);
  return { param, ast };
}

/* ------------------------------------------------------------------ *
 * The closed universe. Every value a predicate can touch is registered
 * here with an explicit key whitelist, so reading anything the model
 * does not describe raises ModelError instead of yielding undefined.
 * ------------------------------------------------------------------ */

const MODEL_KEYS = new WeakMap();
const MODEL_NAMES = new WeakMap();

function modelled(name, props, keys) {
  const obj = Object.assign(Object.create(null), props);
  MODEL_KEYS.set(obj, new Set(keys));
  MODEL_NAMES.set(obj, name);
  return obj;
}

function describeValue(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'object') return MODEL_NAMES.get(v) || 'un-modelled object';
  return `${typeof v} ${JSON.stringify(v)}`;
}

/**
 * `looseTarget` is the numeric twin of the string `target` id. It exists so a
 * predicate that compares ids with `==` instead of `===` conflates two rows
 * that the registry treats as different, and is rejected.
 */
const ORDER_ID = { target: '7', looseTarget: 7, other: '99' };
const CHART_SLOTS = ['ch', 'home', 'other', 'absent'];

/**
 * Builds one world. `executedFlag` is how a NOT-pending row encodes
 * `isPending`; both encodings observed in the wild are exercised, so a
 * predicate that is only correct under one of them is rejected.
 */
function buildWorld(name, executedFlag) {
  const charts = {
    ch: modelled('chart#ch', {}, []),
    home: modelled('chart#home', {}, []),
    other: modelled('chart#other', {}, []),
  };
  const rows = [];
  for (const idKey of Object.keys(ORDER_ID)) {
    for (const pending of [true, false]) {
      for (const chartKey of CHART_SLOTS) {
        const row = modelled(
          `row(${idKey},${pending ? 'pending' : 'executed'},${chartKey})`,
          {
            orderId: ORDER_ID[idKey],
            isPending: pending ? true : executedFlag,
            chart: chartKey === 'absent' ? undefined : charts[chartKey],
          },
          ['orderId', 'isPending', 'chart']
        );
        rows.push({ row, idKey, pending, chartKey, label: MODEL_NAMES.get(row) });
      }
    }
  }
  const self = modelled('this(orderManager)', { chart: charts.home }, ['chart']);
  return { name, rows, charts, self, executedFlag };
}

function buildWorlds() {
  return [
    buildWorld('executed rows carry isPending:false', false),
    buildWorld('executed rows carry isPending:undefined', undefined),
  ];
}

function baseEnvironment(world) {
  return new Map([
    ['this', world.self],
    ['orderId', ORDER_ID.target],
    ['ch', world.charts.ch],
  ]);
}

function readProp(obj, key) {
  const allowed = MODEL_KEYS.get(obj);
  if (!allowed) throw new ModelError(`property '${key}' read from ${describeValue(obj)}, which is outside the row model`);
  if (!allowed.has(key)) throw new ModelError(`predicate reads unmodelled property '${key}' from ${describeValue(obj)}`);
  return obj[key];
}

function evaluate(node, env) {
  switch (node.t) {
    case 'lit':
      return node.v;
    case 'this': {
      if (!env.has('this')) throw new ModelError('`this` is not bound at this site');
      return env.get('this');
    }
    case 'ident': {
      if (!env.has(node.name)) {
        throw new ModelError(`free identifier '${node.name}' is not bound by the gate's site model`);
      }
      return env.get(node.name);
    }
    case 'not':
      return !evaluate(node.arg, env);
    case 'cond':
      return evaluate(node.test, env) ? evaluate(node.cons, env) : evaluate(node.alt, env);
    case 'bin': {
      const left = evaluate(node.left, env);
      switch (node.op) {
        case '&&': return left ? evaluate(node.right, env) : left;
        case '||': return left ? left : evaluate(node.right, env);
        case '??': return left === null || left === undefined ? evaluate(node.right, env) : left;
        case '===': return left === evaluate(node.right, env);
        case '!==': return left !== evaluate(node.right, env);
        /* eslint-disable eqeqeq */
        case '==': return left == evaluate(node.right, env);
        case '!=': return left != evaluate(node.right, env);
        /* eslint-enable eqeqeq */
        default: throw new GrammarError(`unsupported operator '${node.op}'`);
      }
    }
    case 'member': {
      const obj = evaluate(node.obj, env);
      if (obj === null || obj === undefined) {
        if (node.optional) return undefined;
        throw new ModelError(`property access on ${describeValue(obj)}`);
      }
      let key = node.name;
      if (key === undefined) {
        const raw = evaluate(node.key, env);
        if (typeof raw !== 'string' && typeof raw !== 'number') {
          throw new ModelError(`computed property key must be a string or number, got ${describeValue(raw)}`);
        }
        key = String(raw);
      }
      return readProp(obj, key);
    }
    default:
      throw new GrammarError(`unsupported node '${node.t}'`);
  }
}

/** Row indices for which every predicate in the chain is truthy (i.e. kept). */
function keptSet(chain, world, extraBindings) {
  const kept = new Set();
  world.rows.forEach((entry, index) => {
    const passes = chain.predicates.every((pred) => {
      const env = baseEnvironment(world);
      for (const [k, v] of extraBindings) env.set(k, v);
      env.set(pred.param, entry.row);
      return Boolean(evaluate(pred.ast, env));
    });
    if (passes) kept.add(index);
  });
  return kept;
}

function removedSet(chain, world, extraBindings) {
  const kept = keptSet(chain, world, extraBindings);
  const removed = new Set();
  world.rows.forEach((_entry, index) => { if (!kept.has(index)) removed.add(index); });
  return removed;
}

function setDiffReport(world, actual, expected) {
  const extra = [...actual].filter((i) => !expected.has(i));
  const missing = [...expected].filter((i) => !actual.has(i));
  const parts = [];
  if (extra.length) parts.push(`removed but NOT disposed: ${extra.map((i) => world.rows[i].label).join(', ')}`);
  if (missing.length) parts.push(`disposed but NOT removed: ${missing.map((i) => world.rows[i].label).join(', ')}`);
  return parts.join('; ');
}

/* ------------------------------------------------------------------ *
 * Structural navigation over the masked source.
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

function matchCloser(masked, closeIdx, open, close) {
  let depth = 0;
  for (let i = closeIdx; i >= 0; i -= 1) {
    const c = masked[i];
    if (c === close) depth += 1;
    else if (c === open) { depth -= 1; if (depth === 0) return i; }
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

/** Start offset of the statement ending just before `endIdx` (exclusive). */
function statementStartBefore(masked, endIdx) {
  let depth = 0;
  for (let i = endIdx - 1; i >= 0; i -= 1) {
    const c = masked[i];
    if (c === ')' || c === ']' || c === '}') depth += 1;
    else if (c === '(' || c === '[') { depth -= 1; if (depth < 0) return i + 1; }
    else if (c === '{') { depth -= 1; if (depth < 0) return i + 1; }
    else if (c === ';' && depth === 0) return i + 1;
  }
  return 0;
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

function squash(text) {
  return text.replace(/\s+/g, '');
}

function normalise(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Decomposes `<base>.filter(p1).filter(p2)...` walking right to left.
 * Returns { baseSquashed, methods, predicateSpans } with spans in source order.
 * Throws ShapeError if the tail is not a well-formed method chain.
 */
function decomposeChain(masked, from, to) {
  let a = from;
  let b = to;
  const trim = () => {
    while (a < b && /\s/.test(masked[a])) a += 1;
    while (b > a && /\s/.test(masked[b - 1])) b -= 1;
  };
  trim();
  const calls = [];
  for (;;) {
    if (b <= a || masked[b - 1] !== ')') break;
    const openIdx = matchCloser(masked, b - 1, '(', ')');
    if (openIdx === -1 || openIdx < a) break;
    const head = masked.slice(a, openIdx);
    const m = /(\??\.)\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(head);
    if (!m) break;
    calls.push({ method: m[2], argStart: openIdx + 1, argEnd: b - 1 });
    b = a + m.index;
    trim();
  }
  calls.reverse();
  return { baseSquashed: squash(masked.slice(a, b)), baseStart: a, baseEnd: b, calls };
}

/* ------------------------------------------------------------------ *
 * Guard-chain derivation (used to VERIFY, not assume, which branch a
 * single-row eviction sits in).
 * ------------------------------------------------------------------ */

function openBraceStack(masked, from, to) {
  const stack = [];
  for (let i = from; i < to; i += 1) {
    const c = masked[i];
    if (c === '{') stack.push(i);
    else if (c === '}') stack.pop();
  }
  return stack;
}

function guardOfBlock(masked, braceIdx, depth = 0) {
  if (depth > 4) return { kind: 'unresolved', cond: null };
  let j = braceIdx - 1;
  while (j >= 0 && /\s/.test(masked[j])) j -= 1;
  if (j < 0) return { kind: 'unresolved', cond: null };

  if (masked[j] === ')') {
    const open = matchCloser(masked, j, '(', ')');
    if (open === -1) return { kind: 'unresolved', cond: null };
    let k = open - 1;
    while (k >= 0 && /\s/.test(masked[k])) k -= 1;
    const end = k + 1;
    while (k >= 0 && /[A-Za-z0-9_$]/.test(masked[k])) k -= 1;
    const word = masked.slice(k + 1, end);
    if (word === 'if') return { kind: 'if', cond: normalise(masked.slice(open + 1, j)) };
    return { kind: word ? `head:${word}` : 'head:expr', cond: null };
  }

  if (/\belse$/.test(masked.slice(Math.max(0, j - 7), j + 1))) {
    let p = j - 4;
    while (p >= 0 && /\s/.test(masked[p])) p -= 1;
    if (p >= 0 && masked[p] === '}') {
      const ifBrace = matchCloser(masked, p, '{', '}');
      if (ifBrace !== -1) {
        const g = guardOfBlock(masked, ifBrace, depth + 1);
        if (g.kind === 'if') return { kind: 'else', cond: g.cond };
      }
    }
    return { kind: 'else', cond: null };
  }

  return { kind: 'plain', cond: null };
}

/* ------------------------------------------------------------------ *
 * Discovery of registry writes.
 * ------------------------------------------------------------------ */

function parsePredicateSpan(rawSource, span, where) {
  const text = rawSource.slice(span.argStart, span.argEnd);
  let parsed;
  try {
    parsed = parseArrowPredicate(text);
  } catch (error) {
    throw new GrammarError(`${where}: ${error.message} — in \`${normalise(text)}\``);
  }
  return { ...parsed, text: normalise(text) };
}

function buildChain(masked, rawSource, from, to, acceptedBases, where) {
  const decomposed = decomposeChain(masked, from, to);
  const nonFilter = decomposed.calls.filter((c) => c.method !== 'filter');
  if (nonFilter.length) {
    throw new ShapeError(`${where}: chain contains un-modelled transform(s) ${nonFilter.map((c) => `.${c.method}()`).join(', ')}`);
  }
  if (!acceptedBases.has(decomposed.baseSquashed)) {
    throw new ShapeError(`${where}: chain base is \`${normalise(masked.slice(decomposed.baseStart, decomposed.baseEnd))}\`, expected one of ${[...acceptedBases].join(' | ')}`);
  }
  const predicates = decomposed.calls.map((c, i) => parsePredicateSpan(rawSource, c, `${where} filter #${i}`));
  return { predicates, baseSquashed: decomposed.baseSquashed, text: normalise(masked.slice(from, to)) };
}

/**
 * Every `this.<registry> = <rhs>;` in source order, classified as a
 * wholesale reset, a filter-chain eviction, or an un-modelled write.
 */
function discoverRegistryWrites(rawSource, registryProperty) {
  const masked = maskInert(rawSource);
  if (masked.length !== rawSource.length) throw new Error('masker changed source length');

  const acceptedBases = new Set([
    `this.${registryProperty}`,
    `(this.${registryProperty}||[])`,
    `this.${registryProperty}||[]`,
  ]);

  const assignRe = new RegExp(`this\\s*\\.\\s*${registryProperty}\\s*=(?!=)`, 'g');
  const writes = [];
  const perMethodCount = new Map();
  let m = assignRe.exec(masked);

  while (m !== null) {
    const rhsStart = m.index + m[0].length;
    const stmtEnd = statementEnd(masked, rhsStart);
    const method = findEnclosingMethod(masked, m.index);
    const methodName = method ? method.name : '<unresolved>';
    const record = {
      offset: m.index,
      line: rawSource.slice(0, m.index).split('\n').length,
      enclosingMethod: methodName,
      methodStart: method ? method.start : 0,
      rhsStart,
      stmtEnd,
    };

    if (stmtEnd === -1) {
      record.kind = 'unmodelled';
      record.problem = 'could not find the end of the assignment statement';
    } else if (squash(masked.slice(rhsStart, stmtEnd)) === '[]') {
      record.kind = 'reset';
    } else {
      try {
        record.chain = buildChain(masked, rawSource, rhsStart, stmtEnd, acceptedBases, 'eviction');
        record.kind = record.chain.predicates.length ? 'eviction' : 'unmodelled';
        if (!record.chain.predicates.length) record.problem = 'filter-free reassignment of the registry';
      } catch (error) {
        record.kind = 'unmodelled';
        record.problem = error.message;
      }
    }

    if (record.kind === 'eviction') {
      const inMethod = perMethodCount.get(methodName) ?? 0;
      perMethodCount.set(methodName, inMethod + 1);
      record.ordinalInMethod = inMethod;
    }
    writes.push(record);
    m = assignRe.exec(masked);
  }

  const evictions = writes.filter((w) => w.kind === 'eviction');
  evictions.forEach((site, i) => { site.ordinal = i; });
  return {
    masked,
    writes,
    evictions,
    resets: writes.filter((w) => w.kind === 'reset'),
    unmodelled: writes.filter((w) => w.kind === 'unmodelled'),
  };
}

/* ------------------------------------------------------------------ *
 * Disposal-loop resolution. This is the binding-linked part: the array
 * produced by the collect filter must BE the receiver of the forEach.
 * ------------------------------------------------------------------ */

const ESCAPE_RE = /\b(?:return|break|continue)\b/;

function resolveCallbackBody(masked, methodStart, limit, callbackText, callbackStart, callbackEnd, where) {
  const trimmed = normalise(callbackText);
  const arrowBlock = /^\(?\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\)?\s*=>\s*\{/.exec(trimmed);
  if (arrowBlock) {
    const braceIdx = masked.indexOf('{', callbackStart);
    if (braceIdx === -1 || braceIdx > callbackEnd) throw new ShapeError(`${where}: could not locate disposal callback body`);
    let depth = 0;
    let end = -1;
    for (let i = braceIdx; i <= callbackEnd; i += 1) {
      if (masked[i] === '{') depth += 1;
      else if (masked[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) throw new ShapeError(`${where}: unterminated disposal callback body`);
    return { param: arrowBlock[1], bodyStart: braceIdx + 1, bodyEnd: end };
  }
  const identOnly = /^[A-Za-z_$][A-Za-z0-9_$]*$/.exec(trimmed);
  if (identOnly) {
    const name = trimmed;
    const declRe = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*`, 'g');
    const region = masked.slice(methodStart, limit);
    const dm = declRe.exec(region);
    if (!dm) throw new ShapeError(`${where}: disposal callback \`${name}\` is not declared inside the enclosing method`);
    const declRhs = methodStart + dm.index + dm[0].length;
    const declEnd = statementEnd(masked, declRhs);
    if (declEnd === -1) throw new ShapeError(`${where}: could not delimit the declaration of \`${name}\``);
    return resolveCallbackBody(masked, methodStart, limit, masked.slice(declRhs, declEnd), declRhs, declEnd, `${where} (via \`${name}\`)`);
  }
  throw new ShapeError(`${where}: disposal callback is neither a block-bodied arrow nor a locally declared function reference`);
}

/**
 * Shape A (`arrayBinding` given): `const NAME = <chain>;` ... `NAME.forEach(cb)`.
 * Shape B (`arrayBinding` null): `<chain>.forEach(cb)` as one expression.
 * Both return the collect chain, the callback parameter, and the body span.
 */
function resolveDisposalLoop(masked, rawSource, methodStart, limit, arrayBinding, acceptedBases, where) {
  if (arrayBinding) {
    const declRe = new RegExp(`\\b(?:const|let|var)\\s+${arrayBinding}\\s*=\\s*`, 'g');
    const region = masked.slice(methodStart, limit);
    const decls = [];
    let dm = declRe.exec(region);
    while (dm !== null) { decls.push(methodStart + dm.index + dm[0].length); dm = declRe.exec(region); }
    if (decls.length !== 1) {
      throw new ShapeError(`${where}: expected exactly one declaration of \`${arrayBinding}\` before the eviction, found ${decls.length}`);
    }
    const declRhs = decls[0];
    const declEnd = statementEnd(masked, declRhs);
    if (declEnd === -1) throw new ShapeError(`${where}: could not delimit the declaration of \`${arrayBinding}\``);
    const chain = buildChain(masked, rawSource, declRhs, declEnd, acceptedBases, `${where} collect-filter`);
    if (!chain.predicates.length) throw new ShapeError(`${where}: \`${arrayBinding}\` is not bound to a filter over the registry`);

    const reassignRe = new RegExp(`\\b${arrayBinding}\\s*=(?!=)`, 'g');
    const tail = masked.slice(declEnd, limit);
    if (reassignRe.test(tail)) {
      throw new ShapeError(`${where}: \`${arrayBinding}\` is reassigned between the collect-filter and the eviction; the link is not sound`);
    }

    const forEachRe = new RegExp(`\\b${arrayBinding}\\s*\\.\\s*forEach\\s*\\(`, 'g');
    const after = masked.slice(declEnd, limit);
    const hits = [];
    let fm = forEachRe.exec(after);
    while (fm !== null) { hits.push(declEnd + fm.index + fm[0].length - 1); fm = forEachRe.exec(after); }
    if (hits.length !== 1) {
      throw new ShapeError(`${where}: expected exactly one \`${arrayBinding}.forEach(...)\` between the collect-filter and the eviction, found ${hits.length}`);
    }
    const openIdx = hits[0];
    const closeIdx = matchParen(masked, openIdx);
    if (closeIdx === -1) throw new ShapeError(`${where}: unterminated \`${arrayBinding}.forEach(\``);
    const cb = resolveCallbackBody(masked, methodStart, limit, masked.slice(openIdx + 1, closeIdx), openIdx + 1, closeIdx, where);
    return { chain, callback: cb, receiver: arrayBinding, forEachOpen: openIdx, forEachClose: closeIdx };
  }

  // Shape B: the collect filter is chained straight into the forEach.
  const forEachRe = /\.\s*forEach\s*\(/g;
  const region = masked.slice(methodStart, limit);
  const candidates = [];
  let fm = forEachRe.exec(region);
  while (fm !== null) {
    const dotIdx = methodStart + fm.index;
    const openIdx = methodStart + fm.index + fm[0].length - 1;
    try {
      const chain = buildChain(masked, rawSource, statementStartBefore(masked, dotIdx), dotIdx, acceptedBases, `${where} collect-filter`);
      if (chain.predicates.length) candidates.push({ chain, openIdx });
    } catch { /* not a registry filter chain; ignore */ }
    fm = forEachRe.exec(region);
  }
  if (candidates.length !== 1) {
    throw new ShapeError(`${where}: expected exactly one \`<registry filter chain>.forEach(...)\` before the eviction, found ${candidates.length}`);
  }
  const { chain, openIdx } = candidates[0];
  const closeIdx = matchParen(masked, openIdx);
  if (closeIdx === -1) throw new ShapeError(`${where}: unterminated \`.forEach(\``);
  const cb = resolveCallbackBody(masked, methodStart, limit, masked.slice(openIdx + 1, closeIdx), openIdx + 1, closeIdx, where);
  return { chain, callback: cb, receiver: '<inline chain>', forEachOpen: openIdx, forEachClose: closeIdx };
}

/* ------------------------------------------------------------------ *
 * Per-site verification.
 * ------------------------------------------------------------------ */

function acceptedBasesFor(registryProperty) {
  return new Set([
    `this.${registryProperty}`,
    `(this.${registryProperty}||[])`,
    `this.${registryProperty}||[]`,
  ]);
}

function verifyCollectedSetSite(model, site, spec, worlds, registryProperty) {
  const where = `ordinal ${site.ordinal} (${site.enclosingMethod}#${site.ordinalInMethod})`;
  const loop = resolveDisposalLoop(
    model.masked,
    model.rawSource,
    site.methodStart,
    site.offset,
    spec.disposal.arrayBinding ?? null,
    acceptedBasesFor(registryProperty),
    where
  );

  const body = model.masked.slice(loop.callback.bodyStart, loop.callback.bodyEnd);
  const escape = ESCAPE_RE.exec(body);
  if (escape) {
    throw new ShapeError(
      `${where}: the disposal loop can skip rows — \`${escape[0]}\` appears in the \`.forEach\` body, so the disposal set is not provably the whole collected set`
    );
  }

  for (const world of worlds) {
    const removed = removedSet(site.chain, world, []);
    const collected = keptSet(loop.chain, world, []);
    if (removed.size !== collected.size || [...removed].some((i) => !collected.has(i))) {
      throw new ShapeError(
        `${where}: removal set != disposal set in world "${world.name}" — ${setDiffReport(world, removed, collected)}`
      );
    }
  }
  return {
    shape: 'collected-set',
    receiver: loop.receiver,
    collect: loop.chain.predicates.map((p) => p.text).join(' AND '),
  };
}

function verifySingleRowSite(model, site, spec, worlds, registryProperty, meta) {
  const where = `ordinal ${site.ordinal} (${site.enclosingMethod}#${site.ordinalInMethod})`;
  const binding = spec.disposal.binding;

  // 1. The statement immediately before the eviction must be the disposal call.
  const stmtEnd = model.masked.lastIndexOf(';', site.offset);
  const between = model.masked.slice(stmtEnd + 1, site.offset);
  if (stmtEnd === -1 || between.trim() !== '') {
    throw new ShapeError(`${where}: the eviction is not immediately preceded by a statement (found \`${normalise(between)}\` in between)`);
  }
  const prevStart = statementStartBefore(model.masked, stmtEnd);
  const prevStatement = squash(model.masked.slice(prevStart, stmtEnd));
  const expectedCall = squash(`${meta.singleRowDisposalCall}(${binding})`);
  if (prevStatement !== expectedCall) {
    throw new ShapeError(
      `${where}: the statement immediately before the eviction is \`${normalise(model.masked.slice(prevStart, stmtEnd))}\`, expected \`${meta.singleRowDisposalCall}(${binding})\``
    );
  }

  // 2. `binding` must be the parameter of a forEach over an earlier registry
  //    filter chain, and the eviction must sit inside that loop body.
  const loop = resolveDisposalLoop(
    model.masked,
    model.rawSource,
    site.methodStart,
    site.offset,
    spec.disposal.iterationBinding ?? null,
    acceptedBasesFor(registryProperty),
    `${where} iteration source`
  );
  if (loop.callback.param !== binding) {
    throw new ShapeError(`${where}: iteration source yields \`${loop.callback.param}\`, but the disposal call names \`${binding}\``);
  }
  if (!(site.offset > loop.callback.bodyStart && site.offset < loop.callback.bodyEnd)) {
    throw new ShapeError(`${where}: the eviction does not sit inside the \`${loop.receiver}.forEach\` body that binds \`${binding}\``);
  }

  // 3. Derive, from the source, which pending-branch the eviction sits in.
  const destructureRe = new RegExp(`\\b(?:const|let|var)\\s*\\{([^{}]*)\\}\\s*=\\s*${binding}\\b`);
  const destructure = destructureRe.exec(model.masked.slice(site.methodStart, site.offset));
  if (!destructure) {
    throw new ShapeError(`${where}: could not find \`const { ... } = ${binding}\` in the enclosing method; branch derivation is unsound without it`);
  }
  const destructured = destructure[1].split(',').map((s) => s.trim().split(':')[0].trim());
  const flag = meta.discriminatorProperty;
  if (!destructured.includes(flag)) {
    throw new ShapeError(`${where}: \`${flag}\` is not destructured from \`${binding}\`; branch derivation is unsound without it`);
  }
  const stack = openBraceStack(model.masked, site.methodStart, site.offset);
  let derivedPending = null;
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const guard = guardOfBlock(model.masked, stack[i]);
    if (guard.cond !== null && normalise(guard.cond) === flag) {
      derivedPending = guard.kind === 'if';
      break;
    }
  }
  if (derivedPending === null) {
    throw new ShapeError(`${where}: no enclosing \`if (${flag})\` / \`else\` branch found, so the disposed row's ${flag} value cannot be derived from the source`);
  }
  if (derivedPending !== spec.disposal.disposedRow.pending) {
    throw new ShapeError(
      `${where}: source places this eviction in the ${derivedPending ? `\`if (${flag})\`` : '`else`'} branch (disposed row is ${derivedPending ? 'PENDING' : 'EXECUTED'}), but the fixture declares pending=${spec.disposal.disposedRow.pending}`
    );
  }

  // 4. Removal set must be exactly the disposed row, in every world.
  for (const world of worlds) {
    const disposedIndex = world.rows.findIndex(
      (r) => r.idKey === spec.disposal.disposedRow.orderId
        && r.pending === spec.disposal.disposedRow.pending
        && r.chartKey === spec.disposal.disposedRow.chart
    );
    if (disposedIndex === -1) {
      throw new ShapeError(`${where}: fixture declares a disposed row outside the modelled universe`);
    }
    const disposedRow = world.rows[disposedIndex].row;

    // The declared disposed row must really be produced by the iteration source.
    const iterated = keptSet(loop.chain, world, [[binding, disposedRow]]);
    if (!iterated.has(disposedIndex)) {
      throw new ShapeError(
        `${where}: the fixture's disposed row ${world.rows[disposedIndex].label} is not produced by the iteration source \`${loop.chain.predicates.map((p) => p.text).join(' AND ')}\``
      );
    }

    const removed = removedSet(site.chain, world, [[binding, disposedRow]]);
    const expected = new Set([disposedIndex]);
    if (removed.size !== 1 || !removed.has(disposedIndex)) {
      throw new ShapeError(
        `${where}: removal set != disposal set {${world.rows[disposedIndex].label}} in world "${world.name}" — ${setDiffReport(world, removed, expected)}`
      );
    }
  }
  return { shape: 'single-row', receiver: loop.receiver, disposed: `${spec.disposal.disposedRow.orderId}/${spec.disposal.disposedRow.pending ? 'pending' : 'executed'}/${spec.disposal.disposedRow.chart}` };
}

/* ------------------------------------------------------------------ *
 * Fixture schema. Strict: unknown keys are a hard failure, so a site
 * cannot be quietly annotated into an exemption. There is no exemption
 * mechanism in this gate.
 * ------------------------------------------------------------------ */

const META_KEYS = new Set([
  'id', 'product', 'registryExpression', 'discriminatorProperty', 'singleRowDisposalCall',
  'invariant', 'enforcedProperty', 'hazard', 'gateKind', 'gateKindReason', 'siteKey',
  'knownGaps', 'wholesaleResetCount', 'notEnforced',
]);
const SITE_KEYS = new Set(['ordinal', 'enclosingMethod', 'ordinalInMethod', 'disposal', 'note']);
const DISPOSAL_KEYS = {
  'collected-set': new Set(['kind', 'arrayBinding']),
  'single-row': new Set(['kind', 'binding', 'iterationBinding', 'disposedRow']),
};
const DISPOSED_ROW_KEYS = new Set(['orderId', 'pending', 'chart']);

function validateFixture(fixture) {
  const problems = [];
  const check = (cond, message) => { if (!cond) problems.push(message); };

  check(fixture && typeof fixture === 'object', 'fixture is not an object');
  if (problems.length) return problems;

  for (const key of Object.keys(fixture)) {
    if (key !== 'meta' && key !== 'sites') problems.push(`unknown top-level fixture key '${key}'`);
  }
  for (const key of Object.keys(fixture.meta || {})) {
    if (!META_KEYS.has(key)) problems.push(`unknown meta key '${key}' (this gate has no exemption mechanism; annotations cannot weaken a site)`);
  }
  check(Number.isInteger(fixture.meta?.wholesaleResetCount), 'meta.wholesaleResetCount must be an integer');
  check(typeof fixture.meta?.singleRowDisposalCall === 'string', 'meta.singleRowDisposalCall must be a string');

  (fixture.sites || []).forEach((site, i) => {
    for (const key of Object.keys(site)) {
      if (!SITE_KEYS.has(key)) problems.push(`site[${i}]: unknown key '${key}' (this gate has no exemption mechanism; annotations cannot weaken a site)`);
    }
    check(site.ordinal === i, `site[${i}]: ordinal must equal its array index`);
    check(typeof site.enclosingMethod === 'string', `site[${i}]: enclosingMethod must be a string`);
    check(Number.isInteger(site.ordinalInMethod), `site[${i}]: ordinalInMethod must be an integer`);
    const disposal = site.disposal;
    if (!disposal || typeof disposal !== 'object') {
      problems.push(`site[${i}]: missing disposal model`);
      return;
    }
    const allowed = DISPOSAL_KEYS[disposal.kind];
    if (!allowed) {
      problems.push(`site[${i}]: unknown disposal.kind '${disposal.kind}' — the gate fails closed on disposal shapes it cannot verify`);
      return;
    }
    for (const key of Object.keys(disposal)) {
      if (!allowed.has(key)) problems.push(`site[${i}]: unknown disposal key '${key}' for kind '${disposal.kind}'`);
    }
    if (disposal.kind === 'collected-set') {
      check(disposal.arrayBinding === null || typeof disposal.arrayBinding === 'string', `site[${i}]: disposal.arrayBinding must be a string or null`);
    } else {
      check(typeof disposal.binding === 'string', `site[${i}]: disposal.binding must be a string`);
      check(disposal.iterationBinding === null || typeof disposal.iterationBinding === 'string', `site[${i}]: disposal.iterationBinding must be a string or null`);
      const row = disposal.disposedRow;
      if (!row || typeof row !== 'object') {
        problems.push(`site[${i}]: single-row disposal needs a disposedRow`);
      } else {
        for (const key of Object.keys(row)) {
          if (!DISPOSED_ROW_KEYS.has(key)) problems.push(`site[${i}]: unknown disposedRow key '${key}'`);
        }
        check(Object.prototype.hasOwnProperty.call(ORDER_ID, row.orderId), `site[${i}]: disposedRow.orderId must be one of ${Object.keys(ORDER_ID).join('|')}`);
        check(typeof row.pending === 'boolean', `site[${i}]: disposedRow.pending must be a boolean`);
        check(CHART_SLOTS.includes(row.chart), `site[${i}]: disposedRow.chart must be one of ${CHART_SLOTS.join('|')}`);
      }
    }
  });
  return problems;
}

/* ------------------------------------------------------------------ *
 * Self-test corpus. Runs the WHOLE pipeline (discovery, grammar,
 * evaluation, linkage) against synthetic sources every time, so the
 * engine's own claims are exercised on inputs whose verdict is known.
 * ------------------------------------------------------------------ */

const SYNTH_SINGLE_ROW_HEAD = `class Probe {
    updateOrderLines(ch) {
        const lines = (this.orderLines || []).filter((ol) => (ol.chart || this.chart) === ch);
        lines.forEach((olEntry) => {
            const { orderId, isPending } = olEntry;
            if (isPending) {
                const orderData = this._find(orderId);
                if (!orderData) {
                    this._disposeOrderLineElements(olEntry);
`;
const SYNTH_SINGLE_ROW_TAIL = `
                    return;
                }
            }
        });
    }
}
`;

function synthSingleRow(evictionStatement) {
  return `${SYNTH_SINGLE_ROW_HEAD}                    ${evictionStatement}${SYNTH_SINGLE_ROW_TAIL}`;
}

const SYNTH_SINGLE_ROW_FIXTURE_SITE = {
  ordinal: 0,
  enclosingMethod: 'updateOrderLines',
  ordinalInMethod: 0,
  disposal: {
    kind: 'single-row',
    binding: 'olEntry',
    iterationBinding: 'lines',
    disposedRow: { orderId: 'target', pending: true, chart: 'ch' },
  },
};

function synthCollected(collectPredicate, loopBody, evictionPredicate) {
  return `class Probe {
    removeOrderLine(orderId) {
        const doomed = this.orderLines.filter(${collectPredicate});
        doomed.forEach((row) => {
${loopBody}
        });
        this.orderLines = this.orderLines.filter(${evictionPredicate});
    }
}
`;
}

const SYNTH_COLLECTED_FIXTURE_SITE = {
  ordinal: 0,
  enclosingMethod: 'removeOrderLine',
  ordinalInMethod: 0,
  disposal: { kind: 'collected-set', arrayBinding: 'doomed' },
};

function runSyntheticSite(source, siteSpec, meta) {
  const model = discoverRegistryWrites(source, 'orderLines');
  model.rawSource = source;
  if (model.evictions.length !== 1) {
    return { ok: false, reason: `expected 1 eviction in the probe, discovered ${model.evictions.length}` };
  }
  const site = model.evictions[0];
  const worlds = buildWorlds();
  try {
    if (siteSpec.disposal.kind === 'single-row') {
      verifySingleRowSite(model, site, siteSpec, worlds, 'orderLines', meta);
    } else {
      verifyCollectedSetSite(model, site, siteSpec, worlds, 'orderLines');
    }
    return { ok: true, reason: 'accepted' };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

const SELF_TESTS = [
  // ---- single-row site: the eviction must remove exactly `olEntry` ----
  ['keyed predicate matching the disposed row is ACCEPTED', 'accept',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && ol.isPending && (ol.chart || this.chart) === ch));')],
  ['identity predicate with no discriminator substring is ACCEPTED', 'accept',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => ol !== olEntry);')],
  ['computed access is ACCEPTED', 'accept',
    synthSingleRow("this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && ol['isPending'] && (ol.chart || this.chart) === ch));")],
  ['double negation is ACCEPTED', 'accept',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && !(!ol.isPending) && (ol.chart || this.chart) === ch));')],
  ['dead discriminator `(x.isPending || true)` is REJECTED', 'reject',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && (ol.isPending || true) && (ol.chart || this.chart) === ch));')],
  ['inverted polarity is REJECTED', 'reject',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && !ol.isPending && (ol.chart || this.chart) === ch));')],
  ['`=== false` comparison is REJECTED', 'reject',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && ol.isPending === false && (ol.chart || this.chart) === ch));')],
  ['dropping the chart clause is REJECTED', 'reject',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && ol.isPending));')],
  ['un-keyed revert is REJECTED', 'reject',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId));')],
  ['a second chained filter widening the removal is REJECTED', 'reject',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && ol.isPending && (ol.chart || this.chart) === ch)).filter((ol) => !(ol.orderId === orderId));')],
  ['inversion through a ternary is REJECTED', 'reject',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => ol.orderId === orderId ? !ol.isPending : true);')],
  ['a comment naming the discriminator does NOT rescue a bad predicate', 'reject',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => /* ol.isPending */ !(ol.orderId === orderId)); // ol.isPending')],
  ['a string containing the access does NOT rescue a bad predicate', 'reject',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && "ol.isPending"));')],
  ['an unrelated free variable is REJECTED (unbound identifier)', 'reject',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && isPending && (ol.chart || this.chart) === ch));')],
  ['loose `==` on the id conflates the string and numeric twin and is REJECTED', 'reject',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId == orderId && ol.isPending && (ol.chart || this.chart) === ch));')],
  ['reading an unmodelled row property is REJECTED', 'reject',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => !(ol.uid === olEntry.uid));')],
  ['a call inside the predicate is REJECTED (outside the grammar)', 'reject',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && Boolean(ol.isPending) && (ol.chart || this.chart) === ch));')],
  ['a template literal in the predicate is REJECTED (outside the grammar)', 'reject',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && `${ol.isPending}` && (ol.chart || this.chart) === ch));')],
  ['a `.map()` in the eviction chain is REJECTED (un-modelled transform)', 'reject',
    synthSingleRow('this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && ol.isPending && (ol.chart || this.chart) === ch)).map((ol) => ol);')],
  ['deleting the disposal call breaks the linkage and is REJECTED', 'reject',
    `class Probe {
    updateOrderLines(ch) {
        const lines = (this.orderLines || []).filter((ol) => (ol.chart || this.chart) === ch);
        lines.forEach((olEntry) => {
            const { orderId, isPending } = olEntry;
            if (isPending) {
                const orderData = this._find(orderId);
                if (!orderData) {
                    console.log('gone');
                    this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && ol.isPending && (ol.chart || this.chart) === ch));
                    return;
                }
            }
        });
    }
}
`],
  ['moving the eviction into the WRONG branch is REJECTED', 'reject',
    `class Probe {
    updateOrderLines(ch) {
        const lines = (this.orderLines || []).filter((ol) => (ol.chart || this.chart) === ch);
        lines.forEach((olEntry) => {
            const { orderId, isPending } = olEntry;
            if (isPending) {
                console.log('pending');
            } else {
                const orderData = this._find(orderId);
                if (!orderData) {
                    this._disposeOrderLineElements(olEntry);
                    this.orderLines = (this.orderLines || []).filter((ol) => !(ol.orderId === orderId && ol.isPending && (ol.chart || this.chart) === ch));
                    return;
                }
            }
        });
    }
}
`],
];

const SELF_TESTS_COLLECTED = [
  ['collect-set equals removal-set is ACCEPTED', 'accept',
    synthCollected('(r) => r.orderId === orderId', '            if (row.orderId) { /* dispose */ }', '(ol) => ol.orderId !== orderId')],
  ['an early `return` in the disposal loop is REJECTED', 'reject',
    synthCollected('(r) => r.orderId === orderId', '            if (row.isPending) return;\n            if (row.orderId) { /* dispose */ }', '(ol) => ol.orderId !== orderId')],
  ['a removal wider than the collect-set is REJECTED', 'reject',
    synthCollected('(r) => r.orderId === orderId && r.isPending', '            if (row.orderId) { /* dispose */ }', '(ol) => ol.orderId !== orderId')],
  ['a removal narrower than the collect-set is REJECTED', 'reject',
    synthCollected('(r) => r.orderId === orderId', '            if (row.orderId) { /* dispose */ }', '(ol) => !(ol.orderId === orderId && ol.isPending)')],
  ['an unrelated forEach standing in for the disposal loop is REJECTED', 'reject',
    `class Probe {
    removeOrderLine(orderId) {
        const doomed = this.orderLines.filter((r) => r.orderId === orderId);
        this.somethingElse.forEach((x) => { /* not the doomed rows */ });
        this.orderLines = this.orderLines.filter((ol) => ol.orderId !== orderId);
    }
}
`],
];

/* ------------------------------------------------------------------ *
 * Load, analyse, run.
 * ------------------------------------------------------------------ */

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const rawSource = fs.readFileSync(sourcePath, 'utf8');
const schemaProblems = validateFixture(fixture);

const registryProperty = String(fixture.meta?.registryExpression ?? 'this.orderLines').replace(/^this\./, '');
const meta = {
  discriminatorProperty: String(fixture.meta?.discriminatorProperty ?? 'isPending'),
  singleRowDisposalCall: String(fixture.meta?.singleRowDisposalCall ?? 'this._disposeOrderLineElements'),
};

let model;
let modelError = null;
try {
  model = discoverRegistryWrites(rawSource, registryProperty);
  model.rawSource = rawSource;
} catch (error) {
  modelError = error;
  model = { masked: '', writes: [], evictions: [], resets: [], unmodelled: [], rawSource };
}

const worlds = buildWorlds();
const expectedSites = fixture.sites || [];

const cells = [
  ['B-OREI-01', 'ENGINE SELF-TEST (semantic accept/reject on synthetic sources)', () => {
    const failures = [];
    for (const [name, expectation, source] of SELF_TESTS) {
      const outcome = runSyntheticSite(source, SYNTH_SINGLE_ROW_FIXTURE_SITE, meta);
      if (expectation === 'accept' && !outcome.ok) failures.push(`${name}: expected ACCEPT, got REJECT — ${outcome.reason}`);
      if (expectation === 'reject' && outcome.ok) failures.push(`${name}: expected REJECT, got ACCEPT`);
    }
    for (const [name, expectation, source] of SELF_TESTS_COLLECTED) {
      const outcome = runSyntheticSite(source, SYNTH_COLLECTED_FIXTURE_SITE, meta);
      if (expectation === 'accept' && !outcome.ok) failures.push(`${name}: expected ACCEPT, got REJECT — ${outcome.reason}`);
      if (expectation === 'reject' && outcome.ok) failures.push(`${name}: expected REJECT, got ACCEPT`);
    }
    assert.deepEqual(failures, [], `${failures.length} engine self-test failure(s):\n  - ${failures.join('\n  - ')}`);
  }],

  ['B-OREI-02', 'FIXTURE SCHEMA + INVENTORY COUNTS (no exemption mechanism exists)', () => {
    assert.deepEqual(schemaProblems, [], `${schemaProblems.length} fixture schema problem(s):\n  - ${schemaProblems.join('\n  - ')}`);
    if (modelError) throw modelError;
    assert.equal(
      model.evictions.length,
      expectedSites.length,
      `found ${model.evictions.length} filter-chain eviction(s) of this.${registryProperty}, fixture declares ${expectedSites.length}`
        + ` [found: ${model.evictions.map((s) => `${s.ordinal}:${s.enclosingMethod}@L${s.line}`).join(', ')}]`
    );
    assert.equal(
      model.resets.length,
      fixture.meta.wholesaleResetCount,
      `found ${model.resets.length} wholesale \`this.${registryProperty} = []\` reset(s) (lines ${model.resets.map((r) => r.line).join(', ')}),`
        + ` fixture pins ${fixture.meta.wholesaleResetCount}. Resets are NOT analysed (gap G3); the count is pinned so a new one cannot appear silently.`
    );
  }],

  ['B-OREI-03', 'SITE IDENTITY (enclosing method per ordinal)', () => {
    if (modelError) throw modelError;
    const n = Math.min(model.evictions.length, expectedSites.length);
    for (let i = 0; i < n; i += 1) {
      assert.equal(model.evictions[i].enclosingMethod, expectedSites[i].enclosingMethod, `ordinal ${i}: enclosing method is ${model.evictions[i].enclosingMethod}, fixture says ${expectedSites[i].enclosingMethod}`);
      assert.equal(model.evictions[i].ordinalInMethod, expectedSites[i].ordinalInMethod, `ordinal ${i} (${model.evictions[i].enclosingMethod}): ordinalInMethod is ${model.evictions[i].ordinalInMethod}, fixture says ${expectedSites[i].ordinalInMethod}`);
    }
    assert.equal(model.evictions.length, expectedSites.length, 'inventory length differs; see B-OREI-02');
  }],

  ['B-OREI-04', 'EVERY REGISTRY WRITE IS MODELLED (gate fails closed on new shapes)', () => {
    if (modelError) throw modelError;
    const failures = model.unmodelled.map(
      (w) => `L${w.line} in ${w.enclosingMethod}: ${w.problem}`
    );
    assert.deepEqual(failures, [], `${failures.length} un-modelled write(s) to this.${registryProperty}; the gate cannot reason about them and will not pass them:\n  - ${failures.join('\n  - ')}`);
  }],

  ['B-OREI-05', 'SINGLE-ROW SITES: removal set == the one disposed row', () => {
    if (modelError) throw modelError;
    const failures = [];
    for (const spec of expectedSites) {
      if (spec.disposal?.kind !== 'single-row') continue;
      const site = model.evictions[spec.ordinal];
      if (!site) { failures.push(`ordinal ${spec.ordinal} (${spec.enclosingMethod}): site not found in source`); continue; }
      try {
        verifySingleRowSite(model, site, spec, worlds, registryProperty, meta);
      } catch (error) {
        failures.push(error.message);
      }
    }
    assert.deepEqual(failures, [], `${failures.length} single-row eviction site(s) not proven:\n  - ${failures.join('\n  - ')}`);
  }],

  ['B-OREI-06', 'COLLECTED-SET SITES: removal set == binding-linked disposal set', () => {
    if (modelError) throw modelError;
    const failures = [];
    for (const spec of expectedSites) {
      if (spec.disposal?.kind !== 'collected-set') continue;
      const site = model.evictions[spec.ordinal];
      if (!site) { failures.push(`ordinal ${spec.ordinal} (${spec.enclosingMethod}): site not found in source`); continue; }
      try {
        verifyCollectedSetSite(model, site, spec, worlds, registryProperty);
      } catch (error) {
        failures.push(error.message);
      }
    }
    assert.deepEqual(failures, [], `${failures.length} collected-set eviction site(s) not proven:\n  - ${failures.join('\n  - ')}`);
  }],
];

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

console.log('B-OREI order-line registry eviction gate (semantic-over-source)');
console.log(`Source:  ${path.relative(repoRoot, sourcePath).split(path.sep).join('/')}`);
console.log(`Fixture: ${path.relative(repoRoot, fixturePath).split(path.sep).join('/')}`);
console.log(`Registry: this.${registryProperty}; property proven: removal set == disposal set`);
console.log('SCOPE: one file, one grammar. Other files evict this same registry and are NOT covered — see gap G1 in the module header.');
if (invertedCell) console.log(`Inverted cell: ${invertedCell}`);
console.log('');
console.log('Filter-chain evictions discovered (source order):');
for (const site of model.evictions) {
  const spec = expectedSites[site.ordinal];
  console.log(`  [${site.ordinal}] L${site.line} ${site.enclosingMethod}#${site.ordinalInMethod} disposal:${spec?.disposal?.kind ?? '<undeclared>'}`);
  for (const pred of site.chain.predicates) console.log(`      keep-if ${pred.text}`);
}
if (model.resets.length) {
  console.log(`Wholesale resets NOT analysed (gap G3): ${model.resets.map((r) => `L${r.line} ${r.enclosingMethod}`).join(', ')}`);
}
if (model.unmodelled.length) {
  console.log(`Un-modelled registry writes: ${model.unmodelled.map((r) => `L${r.line} ${r.enclosingMethod}`).join(', ')}`);
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
  console.log(`B-OREI gate violated: ${failed} cell(s) failing`);
  process.exitCode = 1;
}
