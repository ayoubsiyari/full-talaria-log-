/**
 * SR-02 four-way classification of `window.chart` sites on the booted path.
 *
 * Buckets required by the packet:
 *   MY_INSTANCE      - means *this* chart; should use `this`, no focus involved
 *   FOCUSED_INSTANCE - wants whichever chart the user is interacting with; route via seam
 *   HOST_CHART       - specifically wants the host/main chart, not a peer
 *   AMBIGUOUS        - needs a human decision
 *
 * The classification is driven by two measured properties, not by guesswork:
 *
 *  (a) GUARDED FALLBACK. Whether the site sits in a `||`/`??`/ternary chain in
 *      which an instance-owned reference (`this.chart`, `this.manager`,
 *      `drawing.chart`, ...) is read FIRST. If so the site is already
 *      instance-preferring: `window.chart` only fires when the owning reference
 *      is unset, so it is not a routing defect and converting it changes
 *      nothing in multichart. This is the property that prices the packet.
 *
 *  (b) HOST INTENT. Whether the site is compared against `this` (`window.chart
 *      !== this`), or reaches a member that the host owns as a singleton
 *      (orderManager / replaySystem / settingsModal), which panels are
 *      documented to share (chart.js:1604-1608 "Panels will reference the main
 *      chart's replay and order systems").
 */
import fs from 'node:fs';
import * as acorn from 'acorn';

const outPath = process.argv[2];
const files = process.argv.slice(3);

const FN_THIS = new Set(['FunctionExpression', 'FunctionDeclaration']);

function bindingOf(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i];
    if (s.type === 'ArrowFunctionExpression') continue;
    if (FN_THIS.has(s.type)) {
      const p = stack[i - 1];
      if (p && (p.type === 'MethodDefinition' || p.type === 'PropertyDefinition')) return 'CLASS_METHOD';
      return 'INNER_FUNCTION';
    }
    if (s.type === 'MethodDefinition' || s.type === 'PropertyDefinition') return 'CLASS_METHOD';
  }
  return 'MODULE';
}

const nameOf = (stack, types) => {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (types.includes(stack[i].type)) {
      const n = stack[i];
      if (n.id && n.id.name) return n.id.name;
      if (n.key) return n.key.name || n.key.value || '(computed)';
      return '(anonymous)';
    }
  }
  return null;
};

/** Collect every node in a subtree. */
function nodesIn(root) {
  const out = [];
  (function rec(n) {
    if (!n || typeof n.type !== 'string') return;
    out.push(n);
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') rec(x); }
      else if (v && typeof v.type === 'string') rec(v);
    }
  })(root);
  return out;
}

/**
 * The smallest enclosing "resolution expression" — the whole expression whose
 * value is being computed. This is the unit in which a fallback chain lives.
 */
function resolutionExpr(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const t = stack[i].type;
    if (t === 'VariableDeclarator' || t === 'ReturnStatement' || t === 'AssignmentExpression'
      || t === 'IfStatement' || t === 'ConditionalExpression' || t === 'LogicalExpression'
      || t === 'ExpressionStatement') {
      // keep climbing through Logical/Conditional to get the OUTERMOST chain
      let j = i;
      while (j > 0 && ['LogicalExpression', 'ConditionalExpression'].includes(stack[j - 1].type)) j--;
      return stack[j];
    }
  }
  return null;
}

const HOST_SINGLETON_MEMBERS = new Set([
  'orderManager', 'replaySystem', 'settingsModal', 'objectTreeManager',
  '_settingsSourceChart', 'propfirmTracker',
]);

const sites = [];
const parseFails = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true }); }
  catch { try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); }
    catch (e) { parseFails.push({ file, error: e.message }); continue; } }

  const short = file.replace(/\\/g, '/').split('/').pop();

  function visit(node, stack) {
    if (!node || typeof node.type !== 'string') return;

    if (node.type === 'MemberExpression' && !node.computed
      && node.object.type === 'Identifier' && node.object.name === 'window'
      && node.property.type === 'Identifier' && node.property.name === 'chart') {

      const parent = stack[stack.length - 1];
      const write = !!(parent && parent.type === 'AssignmentExpression' && parent.left === node);
      const member = (parent && parent.type === 'MemberExpression' && parent.object === node && !parent.computed)
        ? parent.property.name : null;

      // ---- (a) guarded-fallback detection ----
      const res = resolutionExpr(stack);
      const priorInstanceReads = [];
      let comparedToThis = false;
      if (res) {
        for (const n of nodesIn(res)) {
          // an instance-owned reference read BEFORE this site in source order
          if (n.type === 'MemberExpression' && !n.computed && n.end <= node.start && n.property.name) {
            const owned = ['chart', 'manager', 'drawingManager', 'orderManager', 'mainChart'];
            if (n.object.type === 'ThisExpression' && owned.includes(n.property.name)) {
              priorInstanceReads.push(`this.${n.property.name}`);
            } else if (n.object.type === 'Identifier'
              && n.object.name !== 'window' && n.object.name !== 'globalThis'
              && owned.includes(n.property.name)) {
              // e.g. scales.chart, drawing.chart, entry.chart — an owning
              // reference carried by the object being operated on.
              priorInstanceReads.push(`${n.object.name}.${n.property.name}`);
            }
          }
          // `window.chart !== this` / `=== this` → deliberate host-vs-self test
          if (n.type === 'BinaryExpression' && ['!==', '===', '!=', '=='].includes(n.operator)) {
            const sides = [n.left, n.right];
            const hasWin = sides.some((s) => s === node
              || (s.type === 'MemberExpression' && s.object.type === 'Identifier'
                && s.object.name === 'window' && s.property && s.property.name === 'chart'));
            const hasThis = sides.some((s) => s.type === 'ThisExpression');
            if (hasWin && hasThis) comparedToThis = true;
          }
        }
      }

      // ---- (c) host intent inherited from an enclosing guard ----
      // `if (window.chart && window.chart !== this) { window.chart.foo(); }`
      // puts the guard and the use on different lines, so line-local folding
      // misses it. Walk enclosing If/While tests for a host discriminator.
      let insideHostGuard = null;
      for (let i = stack.length - 1; i >= 0 && !insideHostGuard; i--) {
        const s = stack[i];
        if (s.type !== 'IfStatement' && s.type !== 'WhileStatement' && s.type !== 'ConditionalExpression') continue;
        const test = s.test;
        if (!test || test.end > node.start) continue; // only guards that precede the use
        for (const n of nodesIn(test)) {
          const isWinChart = n.type === 'MemberExpression' && !n.computed
            && n.object.type === 'Identifier' && n.object.name === 'window'
            && n.property && n.property.name === 'chart';
          if (n.type === 'BinaryExpression' && ['!==', '!='].includes(n.operator)) {
            const sides = [n.left, n.right];
            if (sides.some((x) => x.type === 'ThisExpression')
              && sides.some((x) => x.type === 'MemberExpression' && !x.computed
                && x.object.type === 'Identifier' && x.object.name === 'window'
                && x.property && x.property.name === 'chart')) {
              insideHostGuard = 'window.chart !== this'; break;
            }
          }
          // if (this.isPanel && window.chart && window.chart.settingsModal)
          if (isWinChart) {
            const p = nodesIn(test).find((q) => q.type === 'MemberExpression' && q.object === n);
            if (p && p.property && HOST_SINGLETON_MEMBERS.has(p.property.name)) {
              insideHostGuard = `guard reaches host .${p.property.name}`; break;
            }
          }
        }
      }

      // ---- (d) host intent from the assignment target's name ----
      let hostNamedTarget = null;
      const decl = stack[stack.length - 1];
      if (decl && decl.type === 'VariableDeclarator' && decl.id && decl.id.type === 'Identifier'
        && /^(main|host)(Chart)?$|^mainChart$|^hostChart$/i.test(decl.id.name)) {
        hostNamedTarget = decl.id.name;
      }

      sites.push({
        file: short,
        line: node.loc.start.line,
        insideHostGuard,
        hostNamedTarget,
        binding: bindingOf(stack),
        class: nameOf(stack, ['ClassDeclaration', 'ClassExpression']),
        method: nameOf(stack, ['MethodDefinition', 'PropertyDefinition']),
        write,
        member,
        guardedFallback: priorInstanceReads.length > 0,
        priorInstanceReads: [...new Set(priorInstanceReads)],
        comparedToThis,
        hostSingletonMember: !!(member && HOST_SINGLETON_MEMBERS.has(member)),
        expr: src.slice(node.start, Math.min(node.end + 60, src.length)).split('\n')[0],
        stmt: res ? src.slice(res.start, Math.min(res.start + 260, res.end)).replace(/\s+/g, ' ') : '',
      });
    }

    stack.push(node);
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') visit(x, stack); }
      else if (v && typeof v.type === 'string') visit(v, stack);
    }
    stack.pop();
  }
  visit(ast, []);
}

// ---------------- classification ----------------
// View / interaction state: reading these means "the chart the user is looking
// at", so an unguarded read of one from a UI surface wants the focused instance.
const VIEW_STATE_MEMBERS = new Set([
  'data', 'priceIncrement', 'currentTimeframe', 'currentSymbol', 'chartSettings',
  'mouseX', 'mouseY', 'dataVersion', 'canvas', 'w', 'h', 'viewStart', 'viewEnd',
  'drawingManager', 'backtestingSession', 'setCursorType', 'showSettingsCategory',
  'mapV9TimezoneLabelToId',
]);

for (const s of sites) {
  // 1. The bootstrap write defines the host singleton.
  if (s.write) { s.bucket = 'HOST_CHART'; s.why = 'bootstrap write: defines the host singleton'; continue; }

  // 2. Already instance-preferring. Checked FIRST: an owning reference is
  //    consulted before window.chart, so window.chart only fires when the
  //    instance link is missing. Not a routing defect; conversion is a no-op in
  //    multichart. This holds regardless of which member is then read.
  if (s.guardedFallback) {
    s.bucket = 'MY_INSTANCE';
    s.why = `guarded fallback behind ${s.priorInstanceReads.join(', ')} (already instance-preferring)`;
    continue;
  }

  // 3. Explicit host-vs-self comparison: the code already knows window.chart is
  //    a different object from `this` and deliberately wants the other one.
  if (s.comparedToThis) {
    s.bucket = 'HOST_CHART';
    s.why = 'compared against `this`: deliberate host reference';
    continue;
  }

  // 3b. Same intent, but the discriminator is in an enclosing guard rather than
  //     the same expression.
  if (s.insideHostGuard) {
    s.bucket = 'HOST_CHART';
    s.why = `inside guard \`${s.insideHostGuard}\`: deliberate host reference`;
    continue;
  }

  // 3c. Assigned to a host-named local (`mainChart`, `main`, `hostChart`).
  if (s.hostNamedTarget) {
    s.bucket = 'HOST_CHART';
    s.why = `assigned to host-named local \`${s.hostNamedTarget}\``;
    continue;
  }

  // 4. Host-owned singleton subsystems panels are documented to share
  //    (chart.js:1604-1608). Unguarded here, so genuinely host-directed.
  if (s.hostSingletonMember) {
    s.bucket = 'HOST_CHART';
    s.why = `unguarded reach for host-owned singleton .${s.member}`;
    continue;
  }

  // 5. Unguarded read of view/interaction state with no owning reference in the
  //    resolution expression: the genuine seam surface.
  if (s.member && VIEW_STATE_MEMBERS.has(s.member)) {
    s.bucket = 'FOCUSED_INSTANCE';
    s.why = `unguarded read of view/interaction state .${s.member} with no instance reference in scope`;
    continue;
  }

  s.bucket = 'AMBIGUOUS';
  s.why = s.member
    ? `unguarded read of .${s.member}; intent not decidable from the resolution expression`
    : 'bare existence guard / value passed on; intent not decidable from the resolution expression';
}

// Fold guard+use pairs: a bare `window.chart &&` guard on the same line as a
// member access is one logical decision, not two. Report both counts so the
// raw-node figure stays auditable.
const lineKey = (s) => `${s.file}:${s.line}`;
const byLine = new Map();
for (const s of sites) {
  if (!byLine.has(lineKey(s))) byLine.set(lineKey(s), []);
  byLine.get(lineKey(s)).push(s);
}
for (const group of byLine.values()) {
  if (group.length < 2) { group[0].logicalHead = true; continue; }
  // the site that actually reads a member is the head; bare guards attach to it
  const head = group.find((s) => s.member) || group[0];
  for (const s of group) {
    s.logicalHead = s === head;
    if (s !== head) { s.bucket = head.bucket; s.why = `guard half of ${lineKey(head)} (${head.bucket})`; }
  }
}

const tally = (key, filter = () => true) => {
  const m = new Map();
  for (const s of sites.filter(filter)) m.set(String(s[key]), (m.get(String(s[key])) || 0) + 1);
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
};

const heads = sites.filter((s) => s.logicalHead);
const report = {
  filesScanned: files.length,
  parseFails,
  rawAstNodes: sites.length,
  logicalSites: heads.length,
  distinctSourceLines: byLine.size,
  FOUR_WAY_rawNodes: tally('bucket'),
  FOUR_WAY_logicalSites: tally('bucket', (s) => s.logicalHead),
  guardedFallbackCount: sites.filter((s) => s.guardedFallback).length,
  byFileBucket: Object.fromEntries([...new Set(sites.map((s) => s.file))].sort().map((f) => [
    f, tally('bucket', (s) => s.file === f && s.logicalHead),
  ])),
};

console.log(JSON.stringify(report, null, 2));
if (parseFails.length) for (const p of parseFails) console.log(`PARSE FAIL ${p.file}: ${p.error}`);
fs.writeFileSync(outPath, JSON.stringify({ ...report, sites }, null, 2));
