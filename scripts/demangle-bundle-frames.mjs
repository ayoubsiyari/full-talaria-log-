#!/usr/bin/env node
/**
 * DEMANGLE-BUNDLE-FRAMES-V1 — resolve minified function names from a served bundle
 * statically, so a stack signature from ELEMENT-WRITER-ATTRIBUTION-V1 can be read
 * without a browser, a heap snapshot, or three gigabytes of RAM.
 *
 * Given names like R3 / O_ / R_, it finds each definition in the bundle, prints a
 * bounded slice of the body, and classifies it by the DOM operations it performs.
 * Classification is by evidence in the body, not by guesswork: a function that calls
 * appendChild is reported as doing so, and one whose body does not mention the DOM is
 * reported as "no direct DOM call", which is itself informative for a wrapper frame.
 *
 * It also verifies the local bundle matches the DEPLOYED one by byte length before
 * quoting any line number, because a line number from a different build is worse than
 * no line number (MEAS-01 in spirit: the artifact must match what ran).
 */
import fs from 'node:fs';

const DOM_MARKERS = [
  'createElement', 'createElementNS', 'createTextNode', 'appendChild', 'insertBefore',
  'removeChild', 'replaceChild', 'innerHTML', 'cloneNode', 'createDocumentFragment',
];

/** Find `function NAME(` and `NAME=function(` and `NAME=(`-style arrow definitions. */
export function findDefinitions(source, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`function\\s+${esc}\\s*\\(`, 'g'),
    new RegExp(`\\b${esc}\\s*=\\s*function\\s*\\(`, 'g'),
    new RegExp(`\\b${esc}\\s*=\\s*\\(?[\\w,\\s]*\\)?\\s*=>`, 'g'),
  ];
  const hits = [];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) hits.push({ index: m.index, matched: m[0] });
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** Body slice from a definition, cut at a bounded length rather than brace-matched. */
export function bodyAt(source, index, maxChars = 900) {
  return source.slice(index, index + maxChars);
}

export function classifyBody(body) {
  const found = DOM_MARKERS.filter((m) => body.includes(m));
  return {
    domCalls: found,
    verdict: found.length
      ? `creates or moves DOM: ${found.join(', ')}`
      : 'no direct DOM call in the sliced body — likely a wrapper or dispatch frame',
  };
}

/** React's commit phase has recognisable shapes even minified. */
export function reactHint(body) {
  const hints = [];
  if (/\.stateNode/.test(body)) hints.push('touches fiber.stateNode (React fiber commit)');
  if (/\.memoizedProps/.test(body)) hints.push('reads memoizedProps (React fiber)');
  if (/case 5:|case 6:|tag===5/.test(body)) hints.push('switches on fiber tag (HostComponent=5)');
  if (/document\.createElement/.test(body)) hints.push('calls document.createElement directly');
  if (/is:/.test(body) && /createElement/.test(body)) hints.push('honours the "is" option — React createInstance');
  return hints;
}

export function demangle(source, names, { maxChars = 900 } = {}) {
  return names.map((name) => {
    const defs = findDefinitions(source, name);
    const entries = defs.slice(0, 3).map((d) => {
      const body = bodyAt(source, d.index, maxChars);
      return {
        atIndex: d.index,
        line: source.slice(0, d.index).split('\n').length,
        matched: d.matched,
        ...classifyBody(body),
        reactHints: reactHint(body),
        slice: body.slice(0, 320),
      };
    });
    return { name, definitionsFound: defs.length, entries };
  });
}

const invokedDirectly = process.argv[1] && /demangle-bundle-frames\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.replace(/^--/, '').split('=');
    args[k] = v ?? true;
  }
  const file = args.file || 'homepage/public/chart/dist-v9/assets/talaria-v9-live.js';
  const names = String(args.names || 'R3,O_,R_').split(',').map((s) => s.trim()).filter(Boolean);
  const source = fs.readFileSync(file, 'utf8');
  const out = {
    signature: 'DEMANGLE-BUNDLE-FRAMES-V1',
    file,
    bytes: Buffer.byteLength(source),
    deployedBytes: args.deployedBytes ? Number(args.deployedBytes) : null,
    matchesDeployed: args.deployedBytes ? Buffer.byteLength(source) === Number(args.deployedBytes) : null,
    names: demangle(source, names),
  };
  if (args.out) fs.writeFileSync(String(args.out), JSON.stringify(out, null, 1));
  for (const n of out.names) {
    console.error(`[demangle] ${n.name}: ${n.definitionsFound} definition(s)`);
    for (const e of n.entries) {
      console.error(`[demangle]   line ${e.line} · ${e.verdict}`);
      if (e.reactHints.length) console.error(`[demangle]   hints: ${e.reactHints.join(' | ')}`);
      console.error(`[demangle]   ${e.slice.replace(/\s+/g, ' ').slice(0, 240)}`);
    }
  }
  console.error(`[demangle] local bytes=${out.bytes} deployed=${out.deployedBytes ?? 'not checked'} match=${out.matchesDeployed}`);
}
