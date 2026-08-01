import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');
const canonicalShell = path.join(root, 'chart v 1.4/talaria-design/live/index.html');
const servedShell = path.join(root, 'homepage/public/chart/talaria-design/live/index.html');
const servedRoot = path.join(root, 'homepage/public');
const servedRoute = '/chart/talaria-design/live/';

function read(file) {
  return fs.readFileSync(file);
}

function readHtml(file) {
  return fs.readFileSync(file, 'utf8');
}

function oldPublicShell() {
  return execFileSync('git', [
    'show',
    'd071c858f^:homepage/public/chart/talaria-design/live/index.html',
  ], { cwd: root });
}

function versionTokens(html) {
  return [...new Set([...html.matchAll(/[?&]v=([A-Za-z0-9._-]+)/g)]
    .map((match) => `?v=${match[1]}`))]
    .sort();
}

function stripQueryAndHash(ref) {
  return ref.split('#')[0].split('?')[0];
}

function isLocalAsset(ref) {
  return ref
    && !ref.startsWith('#')
    && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(ref);
}

function referencedAssets(html) {
  const refs = new Set();
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi)) {
    const ref = match[2];
    if (ref.includes('+')) continue;
    const cleaned = stripQueryAndHash(ref);
    if (isLocalAsset(cleaned)) refs.add(cleaned);
  }
  for (const match of html.matchAll(/\b(?:inject|__loadHostOnlyScript)\(\s*["']([^"']+)["']/g)) {
    const cleaned = stripQueryAndHash(match[1]);
    if (isLocalAsset(cleaned)) refs.add(cleaned);
  }
  return [...refs].sort();
}

function servedPathFor(ref) {
  const pathname = ref.startsWith('/')
    ? ref
    : path.posix.normalize(`${servedRoute}${ref}`);
  return path.join(servedRoot, pathname.replace(/^\//, ''));
}

test('P6 live shell remains present in the served tree', () => {
  assert.equal(fs.existsSync(servedShell), true);
});

test('P6 live shell is byte-identical to current canonical, not the deleted public shell', () => {
  assert.deepEqual(read(servedShell), read(canonicalShell));
  assert.notDeepEqual(read(servedShell), oldPublicShell());
});

test('P6 live shell carries only the current b80 cache token', () => {
  const html = readHtml(servedShell);
  assert.equal(html.includes('?v=20260723b12'), false);
  assert.equal(html.includes('?v=20260723b50'), false);
  assert.deepEqual(versionTokens(html), ['?v=20260727b80']);
});

test('P6 live shell pins the known-broken Vite dev entry pending redirect', () => {
  const html = readHtml(servedShell);
  assert.match(html, /<script\s+type="module"\s+src=["']\.\/main\.jsx["']/);

  // Pre-existing: the deleted public copy carried this same dev entry, while
  // homepage/public has never carried the sibling main.jsx. This route remains
  // non-functional until B's 302 sends users to the built dist-v9 shell.
  assert.equal(fs.existsSync(servedPathFor('./main.jsx')), false);
});

test('P6 live shell enumerates resolving assets and the intentional dev-entry miss', () => {
  const rows = referencedAssets(readHtml(servedShell)).map((ref) => ({
    ref,
    servedPath: path.relative(root, servedPathFor(ref)),
    exists: fs.existsSync(servedPathFor(ref)),
  }));
  const missing = rows.filter((row) => !row.exists).map((row) => row.ref);
  assert.deepEqual(missing, ['./main.jsx'], JSON.stringify(rows, null, 2));
  assert.ok(rows.some((row) => row.ref === '/chart/chart.js'));
  assert.ok(rows.some((row) => row.ref === '/chart/modules/module-presence-runtime.js'));
});
