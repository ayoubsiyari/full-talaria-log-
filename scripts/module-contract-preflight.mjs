#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultManifest = path.join(repoRoot, 'scripts/module-contracts.json');
const SURFACE_CONTRACT_CLASS_ALLOWLIST = Object.freeze({
  host: ['correctness'],
  panel: ['correctness'],
  harness: [],
});
const EXECUTABLE_SCRIPT_TYPES = new Set([
  '',
  'application/ecmascript',
  'application/javascript',
  'module',
  'text/ecmascript',
  'text/javascript',
]);

function stripHtmlComments(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '');
}

function stripInertHtmlBlocks(source) {
  const ranges = [];
  const stack = [];
  const tagPattern = /<\/?(noscript|template)\b[^>]*>/gi;
  for (const match of source.matchAll(tagPattern)) {
    const [tag, tagName] = match;
    const normalized = tagName.toLowerCase();
    if (!tag.startsWith('</')) {
      stack.push({ tagName: normalized, index: match.index });
      continue;
    }
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].tagName !== normalized) continue;
      const open = stack[i];
      stack.length = i;
      if (stack.length === 0) ranges.push([open.index, match.index + tag.length]);
      break;
    }
  }
  for (const open of stack) ranges.push([open.index, source.length]);
  return ranges
    .sort((a, b) => b[0] - a[0])
    .reduce((out, [from, to]) => maskRange(out, from, to), source);
}

function stripJsComments(source) {
  let out = '';
  let quote = null;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
      i += 1;
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

function readAttribute(attrs, name) {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : '';
}

function hasAttribute(attrs, name) {
  return new RegExp(`\\b${name}(?:\\s*=|\\s|$)`, 'i').test(attrs);
}

function isExecutableScript(attrs) {
  if (hasAttribute(attrs, 'nomodule')) return false;
  return EXECUTABLE_SCRIPT_TYPES.has(readAttribute(attrs, 'type').trim().toLowerCase());
}

function matchingBraceAt(source, openAt) {
  let quote = null;
  let escaped = false;
  let depth = 0;
  for (let i = openAt; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function maskRange(source, from, to) {
  return source.slice(0, from) + ' '.repeat(Math.max(0, to - from)) + source.slice(to);
}

function maskNonExecutingFunctionBodies(source) {
  let out = source;
  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (!/\bfunction\b/.test(out.slice(i, i + 8))) continue;
    const before = out.slice(0, i).trimEnd();
    const openAt = out.indexOf('{', i + 8);
    if (openAt < 0) continue;
    const closeAt = matchingBraceAt(out, openAt);
    if (closeAt < 0) continue;
    const after = out.slice(closeAt + 1);
    const invokedImmediately = before.endsWith('(') && /^\s*\)\s*\(\s*\)\s*;?/.test(after);
    if (!invokedImmediately) out = maskRange(out, i, closeAt + 1);
  }
  return out;
}

function endOfStatementAt(source, startAt) {
  let quote = null;
  let escaped = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = startAt; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') parenDepth += 1;
    if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    if (ch === '[') bracketDepth += 1;
    if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    if ((ch === ';' || ch === '\n') && parenDepth === 0 && bracketDepth === 0) return i + 1;
  }
  return source.length;
}

function maskNonExecutingArrowBodies(source) {
  let out = source;
  const ranges = [];
  for (const match of out.matchAll(/=>/g)) {
    let bodyAt = match.index + match[0].length;
    while (/\s/.test(out[bodyAt] || '')) bodyAt += 1;
    if (out[bodyAt] === '{') {
      const closeAt = matchingBraceAt(out, bodyAt);
      if (closeAt < 0) continue;
      const after = out.slice(closeAt + 1);
      const invokedImmediately = /^\s*\)\s*\(\s*\)\s*;?/.test(after);
      if (!invokedImmediately) ranges.push([bodyAt, closeAt + 1]);
      continue;
    }
    const endAt = endOfStatementAt(out, bodyAt);
    ranges.push([bodyAt, endAt]);
  }
  for (const [from, to] of ranges.reverse()) out = maskRange(out, from, to);
  return out;
}

function endOfConditionAt(source, openAt) {
  let quote = null;
  let escaped = false;
  let depth = 0;
  for (let i = openAt; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function maskDeadControlBlocks(source) {
  let out = source;
  const ranges = [];
  for (const match of out.matchAll(/\b(?:if|while)\s*\(/g)) {
    const conditionOpenAt = out.indexOf('(', match.index);
    const conditionCloseAt = endOfConditionAt(out, conditionOpenAt);
    if (conditionCloseAt < 0) continue;
    const condition = out.slice(conditionOpenAt + 1, conditionCloseAt).replace(/\s+/g, '');
    if (!['0', 'false', '!1'].includes(condition)) continue;
    let bodyAt = conditionCloseAt + 1;
    while (/\s/.test(out[bodyAt] || '')) bodyAt += 1;
    if (out[bodyAt] === '{') {
      const closeAt = matchingBraceAt(out, bodyAt);
      if (closeAt >= 0) ranges.push([match.index, closeAt + 1]);
      continue;
    }
    ranges.push([match.index, endOfStatementAt(out, bodyAt)]);
  }
  for (const [from, to] of ranges.reverse()) out = maskRange(out, from, to);
  return out;
}

function maskAfterReturnOrThrow(source) {
  let out = source;
  const ranges = [];
  for (const match of out.matchAll(/\b(?:return|throw)\b/g)) {
    let end = out.indexOf('}', match.index);
    if (end < 0) end = out.length;
    ranges.push([match.index, end]);
  }
  for (const [from, to] of ranges.reverse()) out = maskRange(out, from, to);
  return out;
}

function executableJs(source) {
  return maskAfterReturnOrThrow(
    maskDeadControlBlocks(maskNonExecutingArrowBodies(maskNonExecutingFunctionBodies(stripJsComments(source)))),
  );
}

function scriptPaths(html) {
  const values = [];
  const uncommented = stripInertHtmlBlocks(stripHtmlComments(html));
  for (const script of uncommented.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!isExecutableScript(script[1])) continue;
    const src = script[1].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (src) {
      values.push(src.split('?')[0]);
      continue;
    }
    const activeJs = executableJs(script[2]);
    for (const match of activeJs.matchAll(/(?:inject|__loadHostOnlyScript)\(\s*["']([^"']+\.js)["']\s*\)/g)) {
      values.push(match[1].split('?')[0]);
    }
    for (const block of activeJs.matchAll(/(?:var|const|let)\s+paths\s*=\s*\[([\s\S]*?)\]/g)) {
      const afterArray = activeJs.slice(block.index + block[0].length);
      if (!/document\.write\s*\([^)]*\bpaths\s*\[\s*i\s*\]/.test(afterArray)) continue;
      for (const match of block[1].matchAll(/["']([^"']+\.js)["']/g)) values.push(match[1]);
    }
  }
  return values;
}

function inferSurfaceFromEvidence(surface, scripts) {
  const normalizedPath = String(surface.path || '').replaceAll('\\', '/');
  if (/\/chart-embed\.html$/.test(normalizedPath) || /\/multichart\/chart-host\.html$/.test(normalizedPath)) {
    return 'panel';
  }
  if (/\/dist-v9\/index\.html$/.test(normalizedPath) || /\/talaria-design\/live\/index\.html$/.test(normalizedPath)) {
    return 'host';
  }
  if (
    scripts.includes('/chart/chart.js') &&
    scripts.some((script) => script.startsWith('/chart/multichart-prod/'))
  ) {
    return 'panel';
  }
  return null;
}

function requiredContractsForSurface(manifest, surfaceName) {
  const contracts = manifest.modules.filter((item) => item.requiredSurfaces.includes(surfaceName));
  const requiredClasses = SURFACE_CONTRACT_CLASS_ALLOWLIST[surfaceName] || [];
  return {
    contracts,
    requiredContracts: contracts.filter((item) => requiredClasses.includes(item.class)),
  };
}

function assertBooleanIfPresent(object, key, label) {
  if (Object.hasOwn(object, key)) assert.equal(typeof object[key], 'boolean', `${label}: ${key} must be boolean`);
}

function assertBoundedIdentifier(value, label, { allowLeadingDigit = false } = {}) {
  const pattern = allowLeadingDigit
    ? /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
    : /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
  assert.match(value, pattern, `${label}: unbounded/invalid identifier`);
}

export function validateModuleContracts({
  manifest = JSON.parse(fs.readFileSync(defaultManifest, 'utf8')),
  root = repoRoot,
  readFile = (file) => fs.readFileSync(file, 'utf8'),
} = {}) {
  assert.equal(manifest.schema, 'talaria.module-contracts.v1', 'unsupported contract schema');
  assert.ok(Array.isArray(manifest.modules) && manifest.modules.length, 'module contracts absent');
  assert.ok(Array.isArray(manifest.inventory) && manifest.inventory.length, 'servable inventory absent');

  const moduleIds = new Set();
  for (const contract of manifest.modules) {
    assertBoundedIdentifier(contract.id, 'module id');
    assertBoundedIdentifier(contract.version, `${contract.id} version`, { allowLeadingDigit: true });
    assert.ok(!moduleIds.has(contract.id), `${contract.id}: duplicate module contract`);
    moduleIds.add(contract.id);
    assert.ok(['correctness', 'performance', 'enhancement'].includes(contract.class), `${contract.id}: invalid class`);
    assert.ok(Array.isArray(contract.provides) && contract.provides.length, `${contract.id}: provides absent`);
    assert.ok(Array.isArray(contract.requiredSurfaces) && contract.requiredSurfaces.length, `${contract.id}: requiredSurfaces absent`);
    assert.ok(contract.order && Array.isArray(contract.order.after) && Array.isArray(contract.order.before), `${contract.id}: order absent`);
    assert.ok(typeof contract.source === 'string' && contract.source, `${contract.id}: source absent`);
    const sourcePath = path.resolve(root, contract.source);
    assert.ok(fs.existsSync(sourcePath), `${contract.id}: source missing`);
    const sourceBytes = fs.readFileSync(sourcePath);
    for (const mirror of contract.mirrors || []) {
      const mirrorPath = path.resolve(root, mirror);
      assert.ok(fs.existsSync(mirrorPath), `${contract.id}: mirror missing`);
      assert.deepEqual(fs.readFileSync(mirrorPath), sourceBytes, `${contract.id}: mirror differs from source`);
    }
  }

  const inventoryIds = new Set();
  const checked = [];
  const failures = [];
  for (const surface of manifest.inventory) {
    assertBoundedIdentifier(surface.id, 'surface id');
    assert.ok(!inventoryIds.has(surface.id), `${surface.id}: duplicate inventory entry`);
    inventoryIds.add(surface.id);
    assertBoundedIdentifier(surface.surface, `${surface.id} surface`);
    assert.ok(
      Object.hasOwn(SURFACE_CONTRACT_CLASS_ALLOWLIST, surface.surface),
      `${surface.id}: invalid surface ${surface.surface}`,
    );
    assert.ok(['owned-stamped', 'excluded', 'removed', 'removal-pending'].includes(surface.status), `${surface.id}: invalid status`);
    assertBooleanIfPresent(surface, 'servable', surface.id);
    if (surface.status === 'removal-pending') {
      assert.fail(`${surface.id}: deploy blocked until accidental public surface is removed`);
    }
    if (surface.status !== 'owned-stamped') {
      assert.ok(surface.reason, `${surface.id}: exclusion reason absent`);
      assert.equal(surface.servable, false, `${surface.id}: excluded/removed surface cannot be servable`);
      if (surface.status === 'removed') {
        assert.equal(fs.existsSync(path.resolve(root, surface.path)), false, `${surface.id}: removed surface still exists`);
      }
      continue;
    }
    const absolute = path.resolve(root, surface.path);
    assert.ok(fs.existsSync(absolute), `${surface.id}: owned surface missing`);
    const html = readFile(absolute);
    const scripts = scriptPaths(html);
    const evidenceSurface = inferSurfaceFromEvidence(surface, scripts);
    if (evidenceSurface && evidenceSurface !== surface.surface) {
      failures.push(`${surface.id}: declared surface ${surface.surface} conflicts with ${evidenceSurface} evidence`);
    }
    const effectiveSurface = evidenceSurface || surface.surface;
    const { contracts, requiredContracts } = requiredContractsForSurface(manifest, effectiveSurface);
    if (surface.servable === true && requiredContracts.length === 0) {
      failures.push(`${surface.id}: owned-stamped servable surface ${surface.surface} has no correctness contracts`);
    }
    for (const contract of contracts) {
      const positions = scripts.flatMap((value, index) => value === contract.script ? [index] : []);
      if (positions.length !== 1) {
        failures.push(`${surface.id}: ${contract.id} required script count ${positions.length}`);
        continue;
      }
      const at = positions[0];
      for (const predecessor of contract.order.after) {
        const predecessorAt = scripts.indexOf(predecessor);
        if (!(predecessorAt >= 0 && predecessorAt < at)) {
          failures.push(`${surface.id}: ${contract.id} must follow ${predecessor}`);
        }
      }
      for (const successor of contract.order.before) {
        const successorAt = scripts.indexOf(successor);
        if (!(successorAt > at)) {
          failures.push(`${surface.id}: ${contract.id} must precede ${successor}`);
        }
      }
      checked.push({ surface: surface.id, module: contract.id, index: at });
    }
    if (!/\d{8}b\d+/.test(html)) failures.push(`${surface.id}: build stamp absent`);
  }
  assert.equal(failures.length, 0, failures.join('; '));
  return { signature: 'TALARIA_MODULE_CONTRACT_PREFLIGHT_V1', ok: true, checked };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(validateModuleContracts(), null, 2)}\n`);
  } catch (error) {
    console.error(`[module-contract-preflight] ${error.message}`);
    process.exit(1);
  }
}
