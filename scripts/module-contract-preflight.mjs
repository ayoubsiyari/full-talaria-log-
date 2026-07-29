#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// In CHECKPOINT Docker stages the script is COPY'd to /scripts/*.mjs, so the
// parent-of-script default would be filesystem root. Allow an explicit root
// (Dockerfile sets TALARIA_MODULE_CONTRACT_ROOT) and fall back to repo layout.
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.TALARIA_MODULE_CONTRACT_ROOT
  ? path.resolve(process.env.TALARIA_MODULE_CONTRACT_ROOT)
  : path.resolve(scriptDir, '..');
const defaultManifest = process.env.TALARIA_MODULE_CONTRACTS_JSON
  ? path.resolve(process.env.TALARIA_MODULE_CONTRACTS_JSON)
  : path.join(scriptDir, 'module-contracts.json');
const SURFACE_CONTRACT_CLASS_ALLOWLIST = Object.freeze({
  host: ['correctness'],
  panel: ['correctness'],
  harness: [],
});
const PINNED_JS_LOADER_ALLOWLIST = Object.freeze([
  {
    name: 'MULTICHART_PROD_CHART_EMBED_DOCUMENT_WRITE_V1',
    surfacePath: /^(?:chart v 1\.4\/chart|homepage\/public\/chart)\/multichart-prod\/chart-embed\.html$/,
    bodyPattern: /\(function\s*\(\)\s*\{\s*var V = window\.__TALARIA_CHART_BUILD_ID \|\| '';\s*var q = V \? \('\?v=' \+ V\) : '';\s*var paths = \[([\s\S]*?)\];\s*for \(var i = 0; i < paths\.length; i\+\+\) \{\s*document\.write\('<script defer src="' \+ paths\[i\] \+ q \+ '"><\\\/script>'\);\s*\}\s*\}\)\(\);/,
  },
]);
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

function maskRange(source, from, to) {
  return source.slice(0, from) + ' '.repeat(Math.max(0, to - from)) + source.slice(to);
}

function stripInertHtmlBlocks(source) {
  const ranges = [];
  const stack = [];
  const tagPattern = /<\/?(noscript|template|title|textarea|xmp)\b[^>]*>/gi;
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

function readAttribute(attrs, name) {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : '';
}

function hasAttribute(attrs, name) {
  return new RegExp(`\\b${name}(?:\\s*=|[\\s/]|$)`, 'i').test(attrs);
}

function isExecutableScript(attrs) {
  if (hasAttribute(attrs, 'nomodule')) return false;
  return EXECUTABLE_SCRIPT_TYPES.has(readAttribute(attrs, 'type').trim().toLowerCase());
}

function pinnedImmediateLoaderPaths(uncommentedHtml, surfacePath) {
  const normalizedPath = String(surfacePath || '').replaceAll('\\', '/');
  const allowlist = PINNED_JS_LOADER_ALLOWLIST.filter((entry) => entry.surfacePath.test(normalizedPath));
  if (allowlist.length === 0) return [];

  const values = [];
  for (const script of uncommentedHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!isExecutableScript(script[1]) || readAttribute(script[1], 'src')) continue;
    for (const allow of allowlist) {
      const match = script[2].match(allow.bodyPattern);
      if (!match) continue;
      for (const pathMatch of match[1].matchAll(/["']([^"']+\.js)["']/g)) values.push(pathMatch[1].split('?')[0]);
    }
  }
  return values;
}

function scriptPaths(html, surfacePath) {
  const values = [];
  const uncommented = stripInertHtmlBlocks(stripHtmlComments(html));
  for (const script of uncommented.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!isExecutableScript(script[1])) continue;
    const src = readAttribute(script[1], 'src');
    if (src) values.push(src.split('?')[0]);
  }
  values.push(...pinnedImmediateLoaderPaths(uncommented, surfacePath));
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
    const scripts = scriptPaths(html, surface.path);
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
