// Territory manifest reader and ownership resolver for the A11.2 ownership preflight.
//
// The manifest is YAML because the Director reads and edits it by hand. Rather than
// take a parser dependency, this module accepts a deliberately small YAML subset and
// refuses everything else: anchors, aliases, block scalars, flow collections, tabs,
// odd indentation and duplicate keys all throw. A manifest that does not parse is a
// RED packet, never a permissive default.

import assert from 'node:assert/strict';
import fs from 'node:fs';

export const SIGNATURE = 'TALARIA_TERRITORY_PREFLIGHT_V1';
export const SCHEMA = 'talaria.territory.v1';

const INDENT_WIDTH = 2;
const MAX_PATTERN_LENGTH = 200;
const MAX_PATTERN_WILDCARDS = 8;
const PROVENANCE = ['ruling', 'inferred'];
const KEY = /^([A-Za-z_][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/;

function stripComment(raw, lineNo) {
  let quote = null;
  let lastNonSpace = null;
  for (let i = 0; i < raw.length; i += 1) {
    const character = raw[i];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    // A quote only opens a quoted scalar where a value may begin: at the start of the
    // line, or straight after `key:` or a sequence dash. Anywhere else it is an
    // ordinary apostrophe in prose ("another manager's journal").
    if ((character === '"' || character === "'") && (lastNonSpace === null || lastNonSpace === ':' || lastNonSpace === '-')) {
      quote = character;
      lastNonSpace = character;
      continue;
    }
    if (character === '#' && (i === 0 || /\s/.test(raw[i - 1]))) return raw.slice(0, i);
    if (!/\s/.test(character)) lastNonSpace = character;
  }
  assert.equal(quote, null, `territory manifest line ${lineNo}: unterminated quote`);
  return raw;
}

function tokenize(text) {
  const tokens = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const raw = lines[index].replace(/\r$/, '');
    assert.equal(raw.includes('\t'), false, `territory manifest line ${lineNo}: tab indentation is rejected`);
    const content = stripComment(raw, lineNo).replace(/\s+$/, '');
    if (!content.trim()) continue;
    const indent = content.length - content.trimStart().length;
    assert.equal(indent % INDENT_WIDTH, 0, `territory manifest line ${lineNo}: indent ${indent} is not a multiple of ${INDENT_WIDTH}`);
    const body = content.slice(indent);
    assert.notEqual(body, '---', `territory manifest line ${lineNo}: multi-document manifests are rejected`);
    if (body === '-' || body.startsWith('- ')) {
      tokens.push({ indent, dash: true, lineNo });
      const rest = body.slice(1).trimStart();
      if (rest) tokens.push({ indent: indent + INDENT_WIDTH, content: rest, lineNo, inlineItem: true });
      continue;
    }
    tokens.push({ indent, content: body, lineNo });
  }
  assert.ok(tokens.length, 'territory manifest is empty');
  return tokens;
}

function parseScalar(raw, lineNo) {
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"') && value.length > 1)
    || (value.startsWith("'") && value.endsWith("'") && value.length > 1)) {
    return value.slice(1, -1);
  }
  for (const forbidden of ['{', '}', '[', ']', '\\', '`']) {
    assert.equal(value.includes(forbidden), false, `territory manifest line ${lineNo}: character ${forbidden} is rejected in a bare scalar`);
  }
  for (const prefix of ['&', '*', '!', '|', '>', '%', '@', '"', "'"]) {
    assert.equal(value.startsWith(prefix), false, `territory manifest line ${lineNo}: ${prefix} scalars are rejected`);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

function parseNode(tokens, state, indent) {
  return tokens[state.at].dash ? parseSequence(tokens, state, indent) : parseMapping(tokens, state, indent);
}

function parseSequence(tokens, state, indent) {
  const items = [];
  while (state.at < tokens.length && tokens[state.at].indent === indent && tokens[state.at].dash) {
    const { lineNo } = tokens[state.at];
    state.at += 1;
    const child = tokens[state.at];
    assert.ok(child && child.indent === indent + INDENT_WIDTH, `territory manifest line ${lineNo}: empty sequence item`);
    // `- scalar` (an owned_rows entry) rather than `- key: value` (a rule mapping).
    if (child.inlineItem && !KEY.test(child.content)) {
      items.push(parseScalar(child.content, child.lineNo));
      state.at += 1;
      continue;
    }
    items.push(parseNode(tokens, state, indent + INDENT_WIDTH));
  }
  return items;
}

function parseMapping(tokens, state, indent) {
  const mapping = {};
  while (state.at < tokens.length && tokens[state.at].indent === indent && !tokens[state.at].dash) {
    const { content, lineNo } = tokens[state.at];
    const match = KEY.exec(content);
    assert.ok(match, `territory manifest line ${lineNo}: not a key or sequence item`);
    const [, key, inline] = match;
    assert.equal(Object.hasOwn(mapping, key), false, `territory manifest line ${lineNo}: duplicate key ${key}`);
    state.at += 1;
    if (inline !== undefined && inline.trim() !== '') {
      mapping[key] = parseScalar(inline, lineNo);
      continue;
    }
    const child = tokens[state.at];
    assert.ok(child && child.indent > indent, `territory manifest line ${lineNo}: key ${key} has no value`);
    assert.equal(child.indent, indent + INDENT_WIDTH, `territory manifest line ${child.lineNo}: expected indent ${indent + INDENT_WIDTH}`);
    mapping[key] = parseNode(tokens, state, child.indent);
  }
  return mapping;
}

export function parseStrictYaml(text) {
  const tokens = tokenize(text);
  const state = { at: 0 };
  const value = parseNode(tokens, state, tokens[0].indent);
  assert.equal(state.at, tokens.length, `territory manifest line ${tokens[state.at]?.lineNo}: unexpected indentation`);
  return value;
}

// Glob subset: literal segments, `*` and `?` within a segment, `**` across segments.
export function globToRegExp(pattern) {
  assert.equal(typeof pattern, 'string', 'territory pattern must be a string');
  assert.ok(pattern.length > 0 && pattern.length <= MAX_PATTERN_LENGTH, `territory pattern ${pattern}: length out of bounds`);
  assert.equal(pattern.includes('\\'), false, `territory pattern ${pattern}: use posix separators`);
  assert.equal(pattern.startsWith('/'), false, `territory pattern ${pattern}: must be repository-relative`);
  assert.equal(pattern.split('/').includes('..'), false, `territory pattern ${pattern}: .. is rejected`);
  assert.ok((pattern.match(/\*/g) || []).length <= MAX_PATTERN_WILDCARDS, `territory pattern ${pattern}: too many wildcards`);
  for (const forbidden of ['{', '}', '[', ']', '(', ')', '|', '+']) {
    assert.equal(pattern.includes(forbidden), false, `territory pattern ${pattern}: character ${forbidden} is rejected`);
  }
  const segments = pattern.split('/');
  let source = '^';
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    if (segment === '**') {
      source += last ? '.+' : '(?:[^/]+/)*';
      return;
    }
    assert.equal(segment.includes('**'), false, `territory pattern ${pattern}: ** must occupy a whole segment`);
    source += segment
      .replace(/[.^$]/g, '\\$&')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
    if (!last) source += '/';
  });
  return new RegExp(`${source}$`);
}

// Specificity: an exact pattern beats a wildcard pattern, then the longer literal
// prefix wins, then fewer wildcards, then the longer pattern. Deterministic so that
// a carve-out (order-manager.js) reliably beats a tree grant (modules/**), and so
// that two managers can never both "win" by accident of manifest order.
export function patternSpecificity(pattern) {
  const wildcards = (pattern.match(/[*?]/g) || []).length;
  const firstWildcard = pattern.search(/[*?]/);
  return {
    exact: wildcards === 0 ? 1 : 0,
    literalPrefix: firstWildcard === -1 ? pattern.length : firstWildcard,
    wildcards,
    length: pattern.length,
  };
}

function compareSpecificity(a, b) {
  if (a.exact !== b.exact) return b.exact - a.exact;
  if (a.literalPrefix !== b.literalPrefix) return b.literalPrefix - a.literalPrefix;
  if (a.wildcards !== b.wildcards) return a.wildcards - b.wildcards;
  return b.length - a.length;
}

function compiledRules(entries, label) {
  assert.ok(Array.isArray(entries), `${label}: expected a list`);
  return entries.map((entry) => {
    assert.ok(entry && typeof entry === 'object', `${label}: expected a mapping per entry`);
    assert.equal(typeof entry.pattern, 'string', `${label}: pattern absent`);
    assert.ok(PROVENANCE.includes(entry.provenance), `${label} ${entry.pattern}: provenance must be one of ${PROVENANCE.join('/')}`);
    return {
      pattern: entry.pattern,
      regex: globToRegExp(entry.pattern),
      specificity: patternSpecificity(entry.pattern),
      provenance: entry.provenance,
      reason: entry.reason || entry.authority || '',
    };
  });
}

export function validateTerritoryManifest(raw) {
  assert.ok(raw && typeof raw === 'object' && !Array.isArray(raw), 'territory manifest must be a mapping');
  assert.equal(raw.schema, SCHEMA, `territory manifest: unsupported schema ${raw.schema}`);
  assert.equal(raw.owner, 'Director', 'territory manifest: owner must be Director');
  assert.equal(typeof raw.manifest_path, 'string', 'territory manifest: manifest_path absent');

  const directorOnly = compiledRules(raw.director_only, 'director_only');
  assert.ok(directorOnly.length, 'territory manifest: director_only must not be empty');
  assert.ok(
    directorOnly.some((rule) => rule.regex.test(raw.manifest_path)),
    'territory manifest: manifest_path is not director_only, so a manager could grant itself territory',
  );

  const shared = compiledRules(raw.shared_paths || [], 'shared_paths');

  assert.ok(Array.isArray(raw.journals) && raw.journals.length, 'territory manifest: journals absent');
  const journalPaths = new Set();
  const journals = raw.journals.map((entry) => {
    assert.equal(typeof entry.path, 'string', 'journals: path absent');
    assert.equal(typeof entry.owner, 'string', `journals ${entry.path}: owner absent`);
    assert.equal(journalPaths.has(entry.path), false, `journals ${entry.path}: duplicate journal`);
    journalPaths.add(entry.path);
    return { path: entry.path, owner: entry.owner };
  });

  assert.ok(Array.isArray(raw.managers) && raw.managers.length, 'territory manifest: managers absent');
  const ids = new Set();
  const managers = raw.managers.map((entry) => {
    assert.match(String(entry.id), /^[A-Z]$/, `managers: id ${entry.id} must be a single capital letter`);
    assert.equal(ids.has(entry.id), false, `managers ${entry.id}: duplicate manager`);
    ids.add(entry.id);
    const owned = compiledRules(entry.owned_paths, `manager ${entry.id} owned_paths`);
    assert.ok(owned.length, `manager ${entry.id}: owned_paths must not be empty`);
    return {
      id: entry.id,
      role: entry.role || '',
      deploySurface: entry.deploy_surface || 'none',
      ownedRows: Array.isArray(entry.owned_rows) ? entry.owned_rows.map(String) : [],
      owned,
      denied: compiledRules(entry.denied_paths || [], `manager ${entry.id} denied_paths`),
    };
  });

  for (const journal of journals) {
    assert.ok(
      journal.owner === 'Director' || ids.has(journal.owner),
      `journals ${journal.path}: owner ${journal.owner} is not a declared manager`,
    );
  }

  return {
    schema: raw.schema,
    version: String(raw.version ?? ''),
    manifestPath: raw.manifest_path,
    directorOnly,
    shared,
    journals,
    managers,
    managerIds: [...ids],
  };
}

export function loadTerritoryManifest({ file, text = fs.readFileSync(file, 'utf8') } = {}) {
  return validateTerritoryManifest(parseStrictYaml(text));
}

function normalizePath(value) {
  assert.equal(typeof value, 'string', 'touched path must be a string');
  const posix = value.replace(/\\/g, '/').replace(/^\.\//, '');
  assert.ok(posix.length > 0, 'touched path must not be empty');
  return posix;
}

// One touched path against one authoring manager. Ordering matters: director_only
// outranks every grant, an explicit deny outranks a tree grant, and an unowned or
// ambiguously owned path is RED rather than allowed.
export function resolveOwnership(manifest, rawPath, author) {
  const path = normalizePath(rawPath);
  const directorOnly = manifest.directorOnly.find((rule) => rule.regex.test(path));
  if (directorOnly && author !== 'Director') {
    return { path, ok: false, verdict: 'director-only', owner: 'Director', rule: directorOnly.pattern, reason: directorOnly.reason };
  }
  const authoring = manifest.managers.find((manager) => manager.id === author);
  if (author !== 'Director') {
    assert.ok(authoring, `authoring manager ${author} is not declared in the territory manifest`);
    const denied = authoring.denied.find((rule) => rule.regex.test(path));
    if (denied) {
      return { path, ok: false, verdict: 'denied', owner: author, rule: denied.pattern, reason: denied.reason };
    }
  }
  const shared = manifest.shared.find((rule) => rule.regex.test(path));
  if (shared) {
    return { path, ok: true, verdict: 'shared', owner: 'shared', rule: shared.pattern, reason: shared.reason };
  }
  if (directorOnly) {
    return { path, ok: true, verdict: 'director-only', owner: 'Director', rule: directorOnly.pattern, reason: directorOnly.reason };
  }

  const matches = [];
  for (const manager of manifest.managers) {
    for (const rule of manager.owned) {
      if (rule.regex.test(path)) matches.push({ manager: manager.id, rule });
    }
  }
  if (!matches.length) {
    return { path, ok: false, verdict: 'unowned', owner: null, rule: null, reason: 'no manager owns this path; a Director grant is required' };
  }
  matches.sort((a, b) => compareSpecificity(a.rule.specificity, b.rule.specificity));
  const winner = matches[0];
  const tied = matches.filter((candidate) => compareSpecificity(candidate.rule.specificity, winner.rule.specificity) === 0);
  const tiedManagers = new Set(tied.map((candidate) => candidate.manager));
  if (tiedManagers.size > 1) {
    return {
      path,
      ok: false,
      verdict: 'ambiguous',
      owner: null,
      rule: [...tied.map((candidate) => `${candidate.manager}:${candidate.rule.pattern}`)].sort().join(' '),
      reason: 'two managers claim this path at equal specificity; a Director ruling is required',
    };
  }
  if (author === 'Director') {
    return { path, ok: true, verdict: 'director', owner: winner.manager, rule: winner.rule.pattern, reason: '' };
  }
  if (winner.manager !== author) {
    return {
      path,
      ok: false,
      verdict: 'out-of-territory',
      owner: winner.manager,
      rule: winner.rule.pattern,
      reason: `path is owned by Manager ${winner.manager}`,
    };
  }
  return { path, ok: true, verdict: 'owned', owner: winner.manager, rule: winner.rule.pattern, reason: '' };
}

// A packet's whole touched-file list. Pure file-list comparison, no semantics.
export function auditTouchedPaths(manifest, author, paths) {
  assert.ok(Array.isArray(paths), 'touched paths must be a list');
  const results = [...paths].map(normalizePath).sort().map((path) => resolveOwnership(manifest, path, author));
  const violations = results.filter((result) => !result.ok);
  return {
    signature: SIGNATURE,
    schema: manifest.schema,
    manifestVersion: manifest.version,
    author,
    ok: violations.length === 0,
    checked: results,
    violations,
  };
}
