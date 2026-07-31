/**
 * SR-02 census: classify every `window.chart` reference on the booted path.
 *
 * Adapted from scripts/sr01/sr01-thisreach.mjs (branch
 * manager-a/order-manager-single-realm-20260731). That script is file-agnostic
 * but transformation-specific: it hardcodes `getElementById` as the matcher and
 * `OrderManager` as the class. The reusable part is the parent-stack `this`
 * binding computation, which is kept verbatim in bindingOf() below.
 *
 * Usage: node sr02-census.mjs <out.json> <file...>
 */
import fs from 'node:fs';
import * as acorn from 'acorn';

const outPath = process.argv[2];
const files = process.argv.slice(3);

const FN_THIS = new Set(['FunctionExpression', 'FunctionDeclaration']);

/**
 * Nearest enclosing non-arrow function decides `this`. Arrows are transparent.
 * Verbatim logic from sr01-thisreach.mjs lines 22-39.
 */
function bindingOf(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i];
    if (s.type === 'ArrowFunctionExpression') continue;
    if (FN_THIS.has(s.type)) {
      const parent = stack[i - 1];
      if (parent && (parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition')) {
        return 'CLASS_METHOD';
      }
      return 'INNER_FUNCTION';
    }
    if (s.type === 'MethodDefinition' || s.type === 'PropertyDefinition') return 'CLASS_METHOD';
  }
  return 'MODULE';
}

function enclosingClass(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i];
    if (s.type === 'ClassDeclaration' || s.type === 'ClassExpression') {
      return (s.id && s.id.name) || '(anonymous)';
    }
  }
  return null;
}

function enclosingMethod(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i];
    if (s.type === 'MethodDefinition' || s.type === 'PropertyDefinition') {
      return (s.key && (s.key.name || s.key.value)) || '(computed)';
    }
  }
  return null;
}

/** Innermost enclosing statement, for readable context. */
function enclosingStatement(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (/Statement$|Declaration$/.test(stack[i].type)) return stack[i];
  }
  return null;
}

const sites = [];
const parseFails = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true });
  } catch (e1) {
    try {
      ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    } catch (e2) {
      parseFails.push({ file, error: e2.message });
      continue;
    }
  }

  const short = file.replace(/\\/g, '/').split('/').pop();

  function visit(node, stack) {
    if (!node || typeof node.type !== 'string') return;

    // `window.chart` exactly: MemberExpression, non-computed, object===window,
    // property===chart. AST matching means comments and string literals that
    // merely contain the text "window.chart" cannot inflate the count.
    if (node.type === 'MemberExpression'
      && !node.computed
      && node.object.type === 'Identifier'
      && node.object.name === 'window'
      && node.property.type === 'Identifier'
      && node.property.name === 'chart') {
      const stmt = enclosingStatement(stack);
      // The parent expression: what is actually being done with window.chart.
      const parent = stack[stack.length - 1];
      sites.push({
        file: short,
        line: node.loc.start.line,
        binding: bindingOf(stack),
        class: enclosingClass(stack),
        method: enclosingMethod(stack),
        // is window.chart being written to, or only read?
        write: !!(parent && parent.type === 'AssignmentExpression' && parent.left === node),
        // full member chain, e.g. window.chart.drawingManager
        expr: src.slice(node.start, Math.min(node.end + 40, src.length)).split('\n')[0],
        stmt: stmt ? src.slice(stmt.start, Math.min(stmt.start + 220, stmt.end)).replace(/\s+/g, ' ') : '',
      });
    }

    stack.push(node);
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) {
        for (const x of v) if (x && typeof x.type === 'string') visit(x, stack);
      } else if (v && typeof v.type === 'string') visit(v, stack);
    }
    stack.pop();
  }

  visit(ast, []);
}

const tally = (key, filter = () => true) => {
  const m = new Map();
  for (const s of sites.filter(filter)) m.set(String(s[key]), (m.get(String(s[key])) || 0) + 1);
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
};

const report = {
  filesScanned: files.length,
  parseFails,
  totalSites: sites.length,
  byFile: tally('file'),
  byBinding: tally('binding'),
  byClass: tally('class'),
  writes: sites.filter((s) => s.write).length,
  reads: sites.filter((s) => !s.write).length,
};

console.log(JSON.stringify(report, null, 2));
if (parseFails.length) {
  console.log('\nPARSE FAILURES (sites in these files are NOT counted):');
  for (const p of parseFails) console.log(`  ${p.file}: ${p.error}`);
}
fs.writeFileSync(outPath, JSON.stringify({ ...report, sites }, null, 2));
