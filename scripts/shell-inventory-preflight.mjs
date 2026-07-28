#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TALARIA_SHELL_PRESENCE_PREFLIGHT_V2 = 'TALARIA_SHELL_PRESENCE_PREFLIGHT_V2';

const DISCOVERY_SIGNATURE = 'TALARIA_SERVABLE_SHELL_DISCOVERY_V1';
const SERVABLE_SURFACE_SCHEMA = 'talaria.servable-surface-inventory.v1';
const CHART_SHELL_SCHEMA = 'talaria.chart-shell-inventory.v1';
const CORRECTNESS_EXPOSURE_MODULES = [
  '/chart/modules/indicator-performance.js',
  '/chart/modules/module-presence-runtime.js',
];
const ROUTING_EVIDENCE_CHANNELS = [
  'fastapiAllowlist',
  'fastapiMount',
  'dockerCopy',
  'nginxRoot',
];
// Host and embed roles carry the exposure obligation by declaration. They are not the whole
// story: EXPOSURE is path-bound below, so a shell that loads the chart engine is in the class
// whatever its row claims to be.
const EXPOSURE_BOUND_ROLES = new Set([
  'legacy-host-source',
  'legacy-host-public',
  'v9-host-source',
  'v9-host-built',
  'v9-host-public',
  'multichart-embed-source',
  'multichart-embed-public',
]);
// A row may claim to be an inert pointer, but only discovery can prove it: no script sources
// and no chart engine reference. A "stub" that loads anything is not a stub.
const EXPOSURE_STUB_ROLES = new Set(['pointer-stub']);
const ARCHIVE_RETAIN_PREFIXES = ['docs/plan3/', 'scripts/fixtures/'];
// The servable universe is pinned, not author-chosen. It must equal
// servable-shell-discovery's DEFAULT_ROOTS; a cell asserts the two lists agree.
export const PINNED_ROOTS = Object.freeze(['chart v 1.4', 'homepage/out', 'homepage/public']);
const GLOB_SEGMENT = /[*?[\]{}]/;
const STATUSES = new Set([
  'owned-stamped',
  'image-verified',
  'removal-pending',
  'denied-route-pending',
  'removed',
  'no-routing-evidence',
]);
const STATUS_DERIVED_SERVABLE_REQUIREMENTS = {
  'no-routing-evidence': false,
  removed: false,
  'removal-pending': true,
  'denied-route-pending': true,
  'image-verified': true,
};
const ROLES = new Set([
  'v9-host-source',
  'v9-host-built',
  'v9-host-public',
  'legacy-host-source',
  'legacy-host-public',
  'multichart-embed-source',
  'multichart-embed-public',
  'dist-legacy-fallback',
  'admin-dist',
  'pointer-stub',
  'sandbox-multichart',
  'browser-harness',
  'frozen-evidence',
  'public-test-fixture',
  'image-built-export',
  'admin-root-shell',
  'backtest-root-shell',
  'propfirm-root-shell',
]);

// Every kind this gate can emit. --allow-kinds is validated against this list so a typo in a
// CI allowance is loud instead of silently allowing nothing (or, worse, being mistaken for a
// real allowance by the next reader).
export const VIOLATION_KINDS = Object.freeze([
  'chart-shell-undeclared',
  'conditional-exposure',
  'declared-shell-missing',
  'discovery-empty',
  'discovery-roots-divergent',
  'discovery-signature',
  'exclusion-count-mismatch',
  'exclusion-count-undeclared',
  'exclusion-dead',
  'exclusion-invalid',
  'forbidden-module-present',
  'inventory-not-object',
  'inventory-roles-invalid',
  'inventory-roots-invalid',
  'inventory-roots-unpinned',
  'inventory-schema',
  'inventory-shells-invalid',
  'inventory-surfaces-invalid',
  'proof-of-derouting-unsatisfied',
  'removal-pending',
  'removed-shell-present',
  'required-module-count',
  'required-module-order',
  'retain-path-invalid',
  'retain-reason-missing',
  'retained-file-missing',
  'role-id-invalid',
  'role-invalid',
  'role-modules-duplicate',
  'role-modules-invalid',
  'role-stamp-series-invalid',
  'routing-evidence-mismatch',
  'routing-evidence-missing',
  'routing-evidence-uncited',
  'servable-not-derived',
  'shell-duplicate',
  'shell-parse-incomplete',
  'shell-path-invalid',
  'shell-reason-missing',
  'shell-servable-invalid',
  'shell-status-invalid',
  'shell-undefined-role',
  'stamp-absent',
  'stamp-mixed',
  'stamp-series-mismatch',
  'stamp-unexpected',
  'status-abolished',
  'status-evidence-divergence',
  'undeclared-shell',
]);

// The budgets CI is wired at, checked in next to the gate that emits them. A cell holds the
// workflow's allowance list and the live kind counts against this map, so a budget cannot be
// raised in the workflow alone, and a budget cannot drift above what the tree actually emits.
// Every entry is a known loud RED with an owner:
//
//   conditional-exposure            chart/multichart/chart-host.html and its homepage/public
//                                   copy are routed, load the chart engine and omit the
//                                   correctness-class exposure modules.
//   exclusion-count-undeclared      the one live exclusion (**/node_modules/**) predates the
//                                   mandatory expectedMatchCount and its reason text already
//                                   names the 9 files; the budget goes to zero the moment
//                                   scripts/servable-surface-inventory.json declares the count.
//   proof-of-derouting-unsatisfied  the de-routing requirements on the pending rows are not
//                                   yet met; each unmet requirement is one violation.
//   shell-parse-incomplete          shells whose loader graph cannot be read from their own
//                                   text (script element creation, document.write outside a
//                                   recognised loader, Worker construction).
export const EXPECTED_ALLOW_KINDS = Object.freeze({
  'conditional-exposure': 2,
  'exclusion-count-undeclared': 1,
  'proof-of-derouting-unsatisfied': 38,
  'shell-parse-incomplete': 12,
});

export const EXPECTED_ALLOW_PATHS = Object.freeze({
  'conditional-exposure': Object.freeze([
    'chart v 1.4/chart/multichart/chart-host.html',
    'homepage/public/chart/multichart/chart-host.html',
  ]),
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultServableInventory = 'scripts/servable-surface-inventory.json';
const defaultChartInventory = 'scripts/chart-shell-inventory.json';
const defaultDiscovery = 'scripts/lib/servable-shell-discovery.mjs';

function posixPath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+/g, '/');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedIdentifier(value) {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(value);
}

function isUnderRoot(file, roots) {
  return roots.some((root) => file === root || file.startsWith(`${root}/`));
}

function isRepoRelativePath(value) {
  const normalized = posixPath(value);
  return Boolean(normalized)
    && !normalized.startsWith('/')
    && !/^[A-Za-z]:\//.test(normalized)
    && !normalized.split('/').includes('..');
}

function retainPathAllowed(retainPath, shellPath) {
  return retainPath === shellPath || ARCHIVE_RETAIN_PREFIXES.some((prefix) => retainPath.startsWith(prefix));
}

function globPatternToRegExp(pattern) {
  const normalized = posixPath(pattern);
  let source = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '*') {
      if (normalized[index + 1] === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]*';
      }
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    source += char.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
  }
  source += '$';
  return new RegExp(source);
}

function readEvidenceLine(root, file, line) {
  const normalizedFile = posixPath(file);
  if (!isRepoRelativePath(normalizedFile) || !Number.isInteger(line) || line < 1) return null;
  try {
    const lines = fs.readFileSync(path.join(root, normalizedFile), 'utf8').split(/\r?\n/);
    return lines[line - 1] ?? null;
  } catch {
    return null;
  }
}

function validateRoutingEvidenceShape({ evidence, path: shellPath, violations, kindForMissing, kindForInvalid }) {
  if (!isPlainObject(evidence)) {
    violations.push(violation(kindForMissing, { path: shellPath, detail: 'routingEvidence object with all routing channels is required' }));
    return false;
  }
  let valid = true;
  for (const channelName of ROUTING_EVIDENCE_CHANNELS) {
    const channel = evidence[channelName];
    if (!isPlainObject(channel) || typeof channel.present !== 'boolean') {
      violations.push(violation(kindForInvalid, {
        path: shellPath,
        channel: channelName,
        detail: 'routingEvidence channel must be an object with present boolean',
      }));
      valid = false;
    }
  }
  return valid;
}

function validateCitation({ root, shellPath, channelName, channel, violations }) {
  if (channel.file == null || channel.line == null || channel.quote == null) {
    violations.push(violation('routing-evidence-uncited', {
      path: shellPath,
      channel: channelName,
      detail: 'routing evidence present=true must carry file, line and quote',
    }));
    return;
  }
  const actualLine = readEvidenceLine(root, channel.file, channel.line);
  if (actualLine == null || String(actualLine).trim() !== String(channel.quote).trim()) {
    violations.push(violation('routing-evidence-mismatch', {
      path: shellPath,
      channel: channelName,
      file: posixPath(channel.file),
      line: channel.line,
      detail: 'routing evidence quote must match the cited source line',
    }));
  }
}

function literalSegments(pattern) {
  return posixPath(pattern).split('/').filter((segment) => segment !== '' && !GLOB_SEGMENT.test(segment));
}

// The literal prefix of the pattern with every trailing wildcard segment removed. `chart v
// 1.4/**` reduces to the root itself, which is how a whole-root exclusion is recognised
// structurally rather than by counting matches.
function exclusionBase(pattern) {
  const segments = posixPath(pattern).split('/').filter(Boolean);
  while (segments.length > 0 && GLOB_SEGMENT.test(segments[segments.length - 1])) segments.pop();
  return segments.join('/');
}

function structuralExclusionFault(pattern, roots) {
  if (!pattern) return 'pattern must be a non-empty repo-relative glob';
  if (pattern.startsWith('/') || /^[A-Za-z]:\//.test(pattern) || pattern.split('/').includes('..')) {
    return 'pattern must be repo-relative and must not escape the repository';
  }
  if (literalSegments(pattern).length === 0) {
    return 'pattern must contain at least one literal, non-wildcard path segment';
  }
  if (roots.includes(exclusionBase(pattern))) {
    return 'pattern reduces to a whole declared root, which would exclude every shell under it';
  }
  return null;
}

function exclusionMatchers(inventory, discoveredPaths, roots, violations) {
  if (inventory?.exclusions !== undefined && !Array.isArray(inventory.exclusions)) {
    violations.push(violation('exclusion-invalid', { index: -1, detail: 'exclusions must be an array' }));
  }
  const exclusions = Array.isArray(inventory?.exclusions) ? inventory.exclusions : [];
  return exclusions
    .map((entry, index) => {
      const pattern = typeof entry === 'string' ? entry : entry?.pattern;
      const normalizedPattern = typeof pattern === 'string' ? posixPath(pattern).trim() : '';
      let valid = true;
      const pushInvalid = (detail) => {
        violations.push(violation('exclusion-invalid', { pattern: normalizedPattern, index, detail }));
        valid = false;
      };
      if (!isPlainObject(entry) || typeof entry.reason !== 'string' || entry.reason.trim() === '') {
        pushInvalid('exclusions must be bounded objects with non-empty pattern and reason');
      }
      const structuralFault = structuralExclusionFault(normalizedPattern, roots);
      if (structuralFault) pushInvalid(structuralFault);
      const declaredCount = isPlainObject(entry) ? entry.expectedMatchCount : undefined;
      if (declaredCount === undefined) {
        // Deliberately not fatal to the matcher. Dropping an exclusion for a missing count
        // would unmask every shell it covers as undeclared-shell, and that is the one kind
        // that must never be carried by a budget. The exclusion keeps applying and the
        // undeclared count is its own loud, budgeted RED.
        violations.push(violation('exclusion-count-undeclared', {
          pattern: normalizedPattern,
          index,
          detail: 'exclusions must declare expectedMatchCount so a widening pattern cannot silently cover more shells',
        }));
      } else if (!Number.isInteger(declaredCount) || declaredCount < 1) {
        pushInvalid('expectedMatchCount must be a positive integer');
      }
      if (isPlainObject(entry)) {
        valid = validateRoutingEvidenceShape({
          evidence: entry.routingEvidence,
          path: normalizedPattern,
          violations,
          kindForMissing: 'exclusion-invalid',
          kindForInvalid: 'exclusion-invalid',
        }) && valid;
      }
      if (!valid) return null;
      const matcher = globPatternToRegExp(normalizedPattern);
      const matched = discoveredPaths.filter((shellPath) => matcher.test(shellPath));
      if (matched.length === 0) {
        violations.push(violation('exclusion-dead', {
          pattern: normalizedPattern,
          index,
          detail: 'exclusion pattern matched zero discovered shells',
        }));
        return null;
      }
      // An exclusion may narrow a root; it may never empty one. A root whose entire HTML
      // surface is excluded has to leave the pinned roots list, which is a Director change.
      for (const root of roots) {
        const underRoot = discoveredPaths.filter((shellPath) => isUnderRoot(shellPath, [root]));
        if (underRoot.length > 0 && underRoot.every((shellPath) => matcher.test(shellPath))) {
          violations.push(violation('exclusion-invalid', {
            pattern: normalizedPattern,
            index,
            root,
            detail: 'exclusion matches every discovered shell under a declared root',
          }));
          return null;
        }
      }
      if (Number.isInteger(declaredCount) && declaredCount !== matched.length) {
        violations.push(violation('exclusion-count-mismatch', {
          pattern: normalizedPattern,
          index,
          declared: declaredCount,
          matched: matched.length,
          detail: 'expectedMatchCount must equal the number of discovered shells the pattern matches',
        }));
      }
      return matcher;
    })
    .filter(Boolean);
}

function positionsOf(values, target) {
  const positions = [];
  values.forEach((value, index) => {
    if (value === target) positions.push(index);
  });
  return positions;
}

function violation(kind, fields = {}) {
  return { kind, ...fields };
}

function sortPayload(list) {
  return list.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function discoveredFrom(input, inventory, root) {
  if (typeof input === 'function') {
    return input({ root, roots: Array.isArray(inventory?.roots) ? inventory.roots : [] });
  }
  return input;
}

function stripQueryHash(value) {
  return String(value || '').split(/[?#]/)[0];
}

function isExternalScriptSrc(value) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || value.startsWith('//');
}

function servingPathForShell(shellPath, roots) {
  const normalizedShell = posixPath(shellPath);
  const matchingRoot = roots
    .filter((root) => normalizedShell === root || normalizedShell.startsWith(`${root}/`))
    .sort((left, right) => right.length - left.length)[0];
  const servedRelative = matchingRoot
    ? normalizedShell.slice(matchingRoot.length).replace(/^\/+/, '')
    : normalizedShell;
  return path.posix.normalize(`/${servedRelative}`);
}

function resolveScriptSrcForShell(src, shellPath, roots) {
  const cleanSrc = stripQueryHash(src);
  if (!cleanSrc || isExternalScriptSrc(cleanSrc)) return cleanSrc;
  if (cleanSrc.startsWith('/')) return path.posix.normalize(posixPath(cleanSrc));
  const servingDir = path.posix.dirname(servingPathForShell(shellPath, roots));
  return path.posix.normalize(path.posix.join(servingDir, posixPath(cleanSrc)));
}

// Exposure membership is decided by what discovery found on the path, not by the label the
// row gives itself. A routed shell that loads the chart engine is in the exposure class even
// if its row is relabelled to a role that would otherwise be out of it.
function exposureBound(roleId, fact) {
  if (fact?.referencesChartJs === true) return true;
  if (EXPOSURE_BOUND_ROLES.has(roleId)) return true;
  if (EXPOSURE_STUB_ROLES.has(roleId)) {
    return (Array.isArray(fact?.scriptSrcs) ? fact.scriptSrcs.length : 0) > 0;
  }
  return false;
}

function derivedServable(row) {
  const evidence = isPlainObject(row?.routingEvidence) ? row.routingEvidence : {};
  return Object.values(evidence).some((channel) => isPlainObject(channel) && channel.present === true);
}

function validateRoutingEvidence(row, shellPath, violations, root) {
  const evidence = isPlainObject(row?.routingEvidence) ? row.routingEvidence : null;
  validateRoutingEvidenceShape({
    evidence,
    path: shellPath,
    violations,
    kindForMissing: 'routing-evidence-missing',
    kindForInvalid: 'routing-evidence-missing',
  });
  for (const [channelName, channel] of Object.entries(evidence || {}).sort()) {
    if (!isPlainObject(channel) || channel.present !== true) continue;
    validateCitation({ root, shellPath, channelName, channel, violations });
  }
  if (typeof row?.servable !== 'boolean') {
    violations.push(violation('shell-servable-invalid', { path: shellPath, detail: 'shell servable must be boolean' }));
    return;
  }
  const computed = derivedServable(row);
  if (row.servable !== computed) {
    violations.push(violation('servable-not-derived', {
      path: shellPath,
      declared: row.servable,
      derived: computed,
      detail: 'servable must be derived from routingEvidence.present channels',
    }));
  }
  const requiredDerived = STATUS_DERIVED_SERVABLE_REQUIREMENTS[row?.status];
  if (requiredDerived !== undefined && computed !== requiredDerived) {
    violations.push(violation('status-evidence-divergence', {
      path: shellPath,
      status: row.status,
      derived: computed,
      expected: requiredDerived,
      detail: 'status must agree with routingEvidence-derived servability',
    }));
  }
}

function validateProofOfDeRouting(row, shellPath, violations) {
  if (row?.status !== 'removal-pending' && row?.status !== 'denied-route-pending') return;
  const proof = Array.isArray(row?.proofOfDeRouting) ? row.proofOfDeRouting : [];
  for (const [index, item] of proof.entries()) {
    if (!isPlainObject(item) || item.satisfied !== true) {
      violations.push(violation('proof-of-derouting-unsatisfied', {
        path: shellPath,
        index,
        requirement: String(item?.requirement || ''),
        detail: 'proofOfDeRouting requirements must be satisfied before the row can go GREEN',
      }));
    }
  }
}

export function validateShellInventory({
  servableInventory,
  chartInventory,
  inventory,
  root = repoRoot,
  discovered,
  pinnedRoots = PINNED_ROOTS,
} = {}) {
  const broadInventory = servableInventory || inventory;
  const narrowInventory = chartInventory || inventory;
  const checked = [];
  const skipped = [];
  const violations = [];
  const roleMap = isPlainObject(narrowInventory?.roles) ? narrowInventory.roles : {};
  const roots = Array.isArray(broadInventory?.roots) ? broadInventory.roots.map(posixPath).sort() : [];
  const broadShellEntries = Array.isArray(broadInventory?.surfaces)
    ? broadInventory.surfaces
    : (Array.isArray(broadInventory?.shells) ? broadInventory.shells : []);
  const chartShellEntries = Array.isArray(narrowInventory?.shells) ? narrowInventory.shells : [];
  const discovery = discoveredFrom(discovered, broadInventory, root);
  const discoveryShells = Array.isArray(discovery?.shells) ? discovery.shells : [];
  const discoveryPaths = discoveryShells.map((shell) => posixPath(shell.path));
  const excludedDiscovered = exclusionMatchers(broadInventory, discoveryPaths, roots, violations);

  if (!isPlainObject(broadInventory)) {
    violations.push(violation('inventory-not-object', { manifest: 'servable', detail: 'servable inventory must be an object' }));
  } else if (broadInventory.schema !== SERVABLE_SURFACE_SCHEMA) {
    violations.push(violation('inventory-schema', { manifest: 'servable', detail: `unsupported schema ${String(broadInventory.schema)}` }));
  }
  if (!isPlainObject(narrowInventory)) {
    violations.push(violation('inventory-not-object', { manifest: 'chart', detail: 'chart inventory must be an object' }));
  } else if (narrowInventory.schema !== CHART_SHELL_SCHEMA) {
    violations.push(violation('inventory-schema', { manifest: 'chart', detail: `unsupported schema ${String(narrowInventory.schema)}` }));
  }
  if (!Array.isArray(broadInventory?.roots) || broadInventory.roots.length === 0 || roots.some((item) => !item || item.startsWith('/') || item.includes('..'))) {
    violations.push(violation('inventory-roots-invalid', { detail: 'roots must be non-empty repo-relative paths' }));
  }
  const expectedRoots = [...pinnedRoots].map(posixPath).sort();
  if (JSON.stringify(roots) !== JSON.stringify(expectedRoots)) {
    violations.push(violation('inventory-roots-unpinned', {
      declared: roots,
      pinned: expectedRoots,
      detail: 'inventory roots must equal the pinned servable universe',
    }));
  }
  const discoveryRoots = Array.isArray(discovery?.roots) ? discovery.roots.map(posixPath).sort() : null;
  if (discoveryRoots === null || JSON.stringify(discoveryRoots) !== JSON.stringify(roots)) {
    violations.push(violation('discovery-roots-divergent', {
      declared: roots,
      walked: discoveryRoots,
      detail: 'discovery must walk exactly the roots the inventory declares',
    }));
  }
  if (!isPlainObject(narrowInventory?.roles)) {
    violations.push(violation('inventory-roles-invalid', { detail: 'roles must be an object' }));
  }
  if (!Array.isArray(broadInventory?.surfaces) && !Array.isArray(broadInventory?.shells)) {
    violations.push(violation('inventory-surfaces-invalid', { manifest: 'servable', detail: 'surfaces must be an array' }));
  }
  if (!Array.isArray(narrowInventory?.shells)) {
    violations.push(violation('inventory-shells-invalid', { manifest: 'chart', detail: 'shells must be an array' }));
  }
  if (discovery?.signature !== DISCOVERY_SIGNATURE) {
    violations.push(violation('discovery-signature', { detail: 'servable shell discovery result is absent or unsupported' }));
  }
  if (discoveryShells.filter((shell) => isUnderRoot(posixPath(shell.path), roots)).length === 0) {
    violations.push(violation('discovery-empty', { detail: 'discovery found zero shells under inventory roots' }));
  }

  for (const roleId of Object.keys(roleMap).sort()) {
    const role = roleMap[roleId];
    if (!boundedIdentifier(roleId) || !ROLES.has(roleId)) {
      violations.push(violation('role-id-invalid', { role: roleId, detail: 'role id must be one of the chart shell role domain values' }));
    }
    if (!isPlainObject(role)) {
      violations.push(violation('role-invalid', { role: roleId, detail: 'role must be an object' }));
      continue;
    }
    if (!Array.isArray(role.stampSeries) || role.stampSeries.some((stamp) => typeof stamp !== 'string' || !/^\d{8}b\d+$/.test(stamp))) {
      violations.push(violation('role-stamp-series-invalid', { role: roleId, detail: 'role stampSeries must be an array of build stamp tokens' }));
    }
    for (const field of ['requiredModules', 'forbiddenModules']) {
      const modules = role[field];
      if (!Array.isArray(modules) || modules.some((item) => typeof item !== 'string' || item.length === 0)) {
        violations.push(violation('role-modules-invalid', { role: roleId, field, detail: `${field} must contain module path strings` }));
      }
      if (Array.isArray(modules) && new Set(modules).size !== modules.length) {
        violations.push(violation('role-modules-duplicate', { role: roleId, field, detail: `${field} contains duplicate module paths` }));
      }
    }
  }

  const declaredPaths = new Set();
  const duplicateDeclared = new Set();
  const chartFlaggedPaths = new Set();
  for (const shell of broadShellEntries) {
    const shellPath = posixPath(shell?.path);
    if (declaredPaths.has(shellPath)) duplicateDeclared.add(shellPath);
    declaredPaths.add(shellPath);
    if (shell?.chartShell === true) chartFlaggedPaths.add(shellPath);
  }
  for (const shellPath of [...duplicateDeclared].sort()) {
    violations.push(violation('shell-duplicate', { path: shellPath, detail: 'shell path is declared more than once' }));
  }

  const discoveredByPath = new Map();
  for (const shell of discoveryShells) {
    const shellPath = posixPath(shell.path);
    if (!discoveredByPath.has(shellPath)) discoveredByPath.set(shellPath, shell);
  }
  const chartDeclaredPaths = new Set(chartShellEntries.map((shell) => posixPath(shell?.path)));

  for (const shellPath of [...discoveredByPath.keys()].sort()) {
    const fact = discoveredByPath.get(shellPath);
    const excluded = excludedDiscovered.some((matcher) => matcher.test(shellPath));
    if (isUnderRoot(shellPath, roots) && fact?.parseComplete === false) {
      violations.push(violation('shell-parse-incomplete', {
        path: shellPath,
        reasons: Array.isArray(fact.parseIncompleteReasons) ? [...fact.parseIncompleteReasons].sort() : [],
        detail: 'discovery could not fully resolve shell scripts',
      }));
    }
    if (isUnderRoot(shellPath, roots) && !declaredPaths.has(shellPath) && !excluded) {
      violations.push(violation('undeclared-shell', { path: shellPath, detail: 'discovered servable HTML is absent from inventory' }));
    }
    if (isUnderRoot(shellPath, roots) && fact?.referencesChartJs === true && !chartDeclaredPaths.has(shellPath)) {
      violations.push(violation('chart-shell-undeclared', {
        path: shellPath,
        detail: 'discovered shell references chart.js but is absent from chart-shell inventory',
      }));
    }
  }

  for (const shellPath of [...chartFlaggedPaths].sort()) {
    if (!chartDeclaredPaths.has(shellPath)) {
      violations.push(violation('chart-shell-undeclared', {
        path: shellPath,
        detail: 'servable inventory chartShell=true row is absent from chart-shell inventory',
      }));
    }
  }

  const validateCommonRow = (shell, shellPath, manifest) => {
    const status = shell?.status;
    if (typeof shellPath !== 'string' || !isRepoRelativePath(shellPath)) {
      violations.push(violation('shell-path-invalid', { path: shellPath, manifest, detail: 'shell path must be repo-relative' }));
    }
    if (status === 'excluded') {
      violations.push(violation('status-abolished', { path: shellPath, status, detail: 'excluded status is abolished' }));
    } else if (!STATUSES.has(status)) {
      violations.push(violation('shell-status-invalid', { path: shellPath, status: String(status), detail: 'unknown shell status' }));
    }
    if (status !== 'owned-stamped' && status !== 'image-verified' && !shell?.reason) {
      violations.push(violation('shell-reason-missing', { path: shellPath, status: String(status), detail: 'non-owned shell status requires a reason' }));
    }
    validateRoutingEvidence(shell, shellPath, violations, root);
    validateProofOfDeRouting(shell, shellPath, violations);
    if (shell?.retainFile === true) {
      const retainedPath = typeof shell?.retainPath === 'string' && shell.retainPath.length > 0
        ? posixPath(shell.retainPath)
        : shellPath;
      if (!isRepoRelativePath(retainedPath) || !retainPathAllowed(retainedPath, shellPath)) {
        violations.push(violation('retain-path-invalid', {
          path: shellPath,
          retainPath: retainedPath,
          detail: 'retainPath must be repo-relative and either match the shell path or use an approved archive prefix',
        }));
      }
      if (typeof shell?.retainReason !== 'string' || shell.retainReason.trim() === '') {
        violations.push(violation('retain-reason-missing', {
          path: shellPath,
          retainPath: retainedPath,
          detail: 'retainFile=true requires non-empty retainReason',
        }));
      }
      if (!fs.existsSync(path.join(root, retainedPath))) {
        violations.push(violation('retained-file-missing', {
          path: shellPath,
          retainPath: retainedPath,
          detail: 'retainFile=true requires the retained file path to remain present on disk',
        }));
      }
    }
  };

  for (const { shell, path: shellPath } of broadShellEntries
    .map((shell, index) => ({ shell, index, path: posixPath(shell?.path) }))
    .sort((left, right) => left.path.localeCompare(right.path) || left.index - right.index)) {
    validateCommonRow(shell, shellPath, 'servable');
  }

  const orderedShellEntries = chartShellEntries
    .map((shell, index) => ({ shell, index, path: posixPath(shell?.path) }))
    .sort((left, right) => left.path.localeCompare(right.path) || left.index - right.index);

  for (const { shell, path: shellPath } of orderedShellEntries) {
    const roleId = shell?.role;
    const role = roleMap[roleId];
    const status = shell?.status;
    const fact = discoveredByPath.get(shellPath);
    const exists = Boolean(fact);
    const servable = derivedServable(shell);

    checked.push({ path: shellPath, role: String(roleId || ''), status: String(status || ''), present: exists });

    validateCommonRow(shell, shellPath, 'chart');
    if (exists) {
      const scripts = Array.isArray(fact.scriptSrcs)
        ? fact.scriptSrcs.map((src) => resolveScriptSrcForShell(src, shellPath, roots))
        : [];
      const missingExposureModules = CORRECTNESS_EXPOSURE_MODULES
        .filter((modulePath) => !scripts.includes(modulePath));
      // parseComplete=false is its own RED (shell-parse-incomplete); it must not mute exposure
      // when discovery already proved chart-engine binding (referencesChartJs) or the row is in
      // an exposure-bound host/embed role class.
      const exposureGraphReadable = fact.parseComplete !== false
        || fact?.referencesChartJs === true
        || EXPOSURE_BOUND_ROLES.has(roleId);
      if (roleId !== 'frozen-evidence'
        && servable
        && exposureBound(roleId, fact)
        && exposureGraphReadable
        && missingExposureModules.length > 0) {
        violations.push(violation('conditional-exposure', {
          path: shellPath,
          role: String(roleId || ''),
          missingModules: missingExposureModules,
          detail: 'routed shells bound to the chart engine must reference the correctness-class exposure modules',
        }));
      }
    }
    if (!Object.hasOwn(roleMap, roleId)) {
      violations.push(violation('shell-undefined-role', { path: shellPath, role: String(roleId), detail: 'shell references an undefined role' }));
    }

    if (status === 'image-verified') {
      skipped.push({
        path: shellPath,
        role: String(roleId || ''),
        status,
        reason: shell.reason || 'image-verified shell is checked against the built image, not the working tree',
      });
      continue;
    }
    if (status === 'removal-pending') {
      violations.push(violation('removal-pending', { path: shellPath, detail: 'deploy blocked until shell is removed' }));
      continue;
    }
    if (status === 'denied-route-pending') {
      continue;
    }
    if (status === 'removed') {
      if (fs.existsSync(path.join(root, shellPath))) {
        violations.push(violation('removed-shell-present', { path: shellPath, detail: 'shell recorded as removed still exists on disk' }));
      }
      continue;
    }
    if (status !== 'owned-stamped') continue;

    if (!exists) {
      violations.push(violation('declared-shell-missing', { path: shellPath, detail: 'owned-stamped shell is absent from discovery' }));
      continue;
    }

    const stampTokens = Array.isArray(fact.stampTokens) ? fact.stampTokens.slice().sort() : [];
    const stampSeries = Array.isArray(role?.stampSeries) ? role.stampSeries : [];
    if (stampSeries.length === 0 && stampTokens.length > 0) {
      violations.push(violation('stamp-unexpected', { path: shellPath, stamps: stampTokens, detail: 'role stampSeries is empty so the shell must carry no stamp token' }));
    }
    if (stampSeries.length > 0 && stampTokens.length === 0) {
      violations.push(violation('stamp-absent', { path: shellPath, detail: 'owned-stamped shell has no build stamp token' }));
    }
    if (stampTokens.length > 1) {
      violations.push(violation('stamp-mixed', { path: shellPath, stamps: stampTokens, detail: 'owned-stamped shell contains multiple distinct build stamp tokens' }));
    }
    if (stampSeries.length > 0 && stampTokens.some((stamp) => !stampSeries.includes(stamp))) {
      violations.push(violation('stamp-series-mismatch', { path: shellPath, expected: stampSeries, stamps: stampTokens, detail: 'shell stamp is outside the role stampSeries' }));
    }

    if (!role) continue;
    const scripts = Array.isArray(fact.scriptSrcs)
      ? fact.scriptSrcs.map((src) => resolveScriptSrcForShell(src, shellPath, roots))
      : [];
    const required = Array.isArray(role.requiredModules) ? role.requiredModules : [];
    let previous = null;
    for (const modulePath of required) {
      const resolvedModulePath = modulePath.startsWith('/') ? path.posix.normalize(posixPath(modulePath)) : posixPath(modulePath);
      const positions = positionsOf(scripts, resolvedModulePath);
      if (positions.length !== 1) {
        violations.push(violation('required-module-count', {
          path: shellPath,
          module: resolvedModulePath,
          count: positions.length,
          detail: 'required module must appear exactly once',
        }));
        previous = null;
        continue;
      }
      if (previous && previous.index >= positions[0]) {
        violations.push(violation('required-module-order', {
          path: shellPath,
          module: resolvedModulePath,
          previous: previous.module,
          detail: 'required modules must preserve role-declared relative order',
        }));
      }
      previous = { module: resolvedModulePath, index: positions[0] };
    }
    for (const modulePath of Array.isArray(role.forbiddenModules) ? role.forbiddenModules : []) {
      const resolvedModulePath = modulePath.startsWith('/') ? path.posix.normalize(posixPath(modulePath)) : posixPath(modulePath);
      const positions = positionsOf(scripts, resolvedModulePath);
      if (positions.length > 0) {
        violations.push(violation('forbidden-module-present', {
          path: shellPath,
          module: resolvedModulePath,
          count: positions.length,
          detail: 'forbidden module is referenced by this shell role',
        }));
      }
    }
  }

  sortPayload(checked);
  sortPayload(skipped);
  sortPayload(violations);
  return {
    signature: TALARIA_SHELL_PRESENCE_PREFLIGHT_V2,
    ok: violations.length === 0,
    checked,
    skipped,
    violations,
  };
}

export function countKinds(violations) {
  const counts = {};
  for (const item of violations) {
    counts[item.kind] = (counts[item.kind] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

// `kind` allows any number of that kind; `kind:N` allows at most N. The budget form is a
// ratchet: a known loud RED can be carried by CI at its current size, and one more instance
// of it fails the build. A kind may be named at most once — silently reconciling two budgets
// for the same kind would let a second, looser entry read like an allowance to the next
// reader while the tighter one is the thing being enforced.
export function parseAllowKinds(value) {
  const allowances = new Map();
  for (const token of String(value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)) {
    const [kind, limit, ...rest] = token.split(':');
    if (rest.length > 0) throw new Error(`shell inventory preflight: malformed --allow-kinds entry ${token}`);
    if (!VIOLATION_KINDS.includes(kind)) {
      throw new Error(`shell inventory preflight: --allow-kinds names unknown violation kind ${kind}`);
    }
    if (allowances.has(kind)) {
      throw new Error(`shell inventory preflight: --allow-kinds names ${kind} more than once`);
    }
    let maxCount = Number.POSITIVE_INFINITY;
    if (limit !== undefined) {
      if (!/^\d+$/.test(limit)) throw new Error(`shell inventory preflight: --allow-kinds budget for ${kind} must be a non-negative integer`);
      maxCount = Number(limit);
    }
    allowances.set(kind, maxCount);
  }
  return allowances;
}

export const EXIT_GREEN = 0;
export const EXIT_UNEXPECTED_RED = 1;
export const EXIT_ALLOWED_RED = 2;

export function classifyResult(result, allowances = new Map()) {
  const kindCounts = countKinds(result.violations);
  const unexpected = Object.entries(kindCounts)
    .filter(([kind, count]) => !allowances.has(kind) || count > allowances.get(kind))
    .map(([kind, count]) => ({
      kind,
      count,
      allowed: allowances.has(kind)
        ? (Number.isFinite(allowances.get(kind)) ? allowances.get(kind) : null)
        : 0,
    }));
  let exitCode = EXIT_GREEN;
  if (result.violations.length > 0) {
    exitCode = unexpected.length > 0 ? EXIT_UNEXPECTED_RED : EXIT_ALLOWED_RED;
  }
  return {
    kindCounts,
    unexpected,
    allowances: [...allowances.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, maxCount]) => ({ kind, maxCount: Number.isFinite(maxCount) ? maxCount : null })),
    exitCode,
  };
}

export function formatReport(result, verdict = classifyResult(result)) {
  const lines = [];
  lines.push(`[shell-inventory-preflight] ${result.checked.length} declared shell(s), ${result.skipped.length} skipped, ${result.violations.length} violation(s)`);
  for (const entry of result.checked) {
    lines.push(`  ${entry.present ? 'ok ' : 'miss'} ${entry.path} role=${entry.role} status=${entry.status}`);
  }
  for (const entry of result.skipped) {
    lines.push(`  skip ${entry.path} role=${entry.role}: ${entry.reason}`);
  }
  for (const item of result.violations) {
    const subject = item.path || item.pattern || item.role || item.kind;
    lines.push(`  RED ${item.kind}: ${subject} — ${item.detail || 'policy violation'}`);
  }
  for (const [kind, count] of Object.entries(verdict.kindCounts)) {
    const allowance = verdict.allowances.find((entry) => entry.kind === kind);
    const budget = allowance ? `allowed<=${allowance.maxCount ?? 'any'}` : 'not allowed';
    lines.push(`  kind ${kind} count=${count} ${budget}`);
  }
  for (const entry of verdict.unexpected) {
    lines.push(`  UNEXPECTED ${entry.kind}: ${entry.count} violation(s) against a budget of ${entry.allowed ?? 'any'}`);
  }
  const verdictLabel = verdict.exitCode === EXIT_GREEN
    ? 'GREEN'
    : (verdict.exitCode === EXIT_ALLOWED_RED ? 'RED (all kinds allowed by --allow-kinds)' : 'RED');
  lines.push(`[shell-inventory-preflight] ${verdictLabel} exit=${verdict.exitCode}`);
  return lines.join('\n');
}

// Last-one-wins is how a second --allow-kinds would quietly replace the reviewed budget list
// with an unreviewed one, so a repeated option is an error rather than an override. The check
// is on the normalised key, so --allow-kinds and --allowKinds are the same option.
export function parseArgs(argv) {
  const options = {};
  const allowed = new Set(['root', 'servableInventory', 'chartInventory', 'discovery', 'allowKinds', 'out']);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`shell inventory preflight: unexpected argument ${token}`);
    const equalsAt = token.indexOf('=');
    const rawKey = equalsAt === -1 ? token.slice(2) : token.slice(2, equalsAt);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (!allowed.has(key)) {
      throw new Error(`shell inventory preflight: unsupported argument --${rawKey}; discovery roots are read from the inventory`);
    }
    if (Object.hasOwn(options, key)) {
      throw new Error(`shell inventory preflight: --${rawKey} may only be given once`);
    }
    if (equalsAt !== -1) {
      options[key] = token.slice(equalsAt + 1);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`shell inventory preflight: ${token} requires a value`);
    options[key] = value;
    index += 1;
  }
  return options;
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const root = path.resolve(options.root || repoRoot);
  const servableInventoryPath = path.resolve(root, options.servableInventory || defaultServableInventory);
  const chartInventoryPath = path.resolve(root, options.chartInventory || defaultChartInventory);
  const discoveryPath = path.resolve(root, options.discovery || defaultDiscovery);
  const allowances = parseAllowKinds(options.allowKinds);
  const servableInventory = JSON.parse(fs.readFileSync(servableInventoryPath, 'utf8'));
  const chartInventory = JSON.parse(fs.readFileSync(chartInventoryPath, 'utf8'));
  let discoveryModule;
  try {
    discoveryModule = await import(pathToFileURL(discoveryPath).href);
  } catch (error) {
    throw new Error(`shell inventory preflight: discovery library absent or unloadable at ${path.relative(root, discoveryPath).replace(/\\/g, '/')}: ${error.message}`);
  }
  if (discoveryModule.DISCOVERY_SIGNATURE !== DISCOVERY_SIGNATURE || typeof discoveryModule.discoverShells !== 'function') {
    throw new Error('shell inventory preflight: discovery library does not expose TALARIA_SERVABLE_SHELL_DISCOVERY_V1 discoverShells');
  }
  if (!Array.isArray(discoveryModule.DEFAULT_ROOTS)
    || JSON.stringify([...discoveryModule.DEFAULT_ROOTS].sort()) !== JSON.stringify([...PINNED_ROOTS].sort())) {
    throw new Error('shell inventory preflight: discovery DEFAULT_ROOTS does not match the pinned servable universe');
  }
  const discovered = discoveryModule.discoverShells({ root, roots: servableInventory.roots });
  const result = validateShellInventory({ servableInventory, chartInventory, root, discovered });
  const verdict = classifyResult(result, allowances);
  if (options.out) {
    fs.writeFileSync(
      path.resolve(root, options.out),
      `${JSON.stringify({ ...result, ...verdict }, null, 2)}\n`,
    );
  }
  return { result, verdict };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { result, verdict } = await runCli();
    process.stdout.write(`${formatReport(result, verdict)}\n`);
    if (verdict.exitCode !== EXIT_GREEN) process.exit(verdict.exitCode);
  } catch (error) {
    console.error(`[shell-inventory-preflight] ${error.message}`);
    process.exit(EXIT_UNEXPECTED_RED);
  }
}
