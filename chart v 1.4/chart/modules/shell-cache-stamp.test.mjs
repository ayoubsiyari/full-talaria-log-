import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.env.SHELL_CACHE_STAMP_FIXTURE_ROOT || path.resolve(import.meta.dirname, '../../..'));
const firstPartyHosts = new Set(['talaria.app', 'talaria.local']);

const staleTokens = [
  '20260524a10',
  '20260509T1755',
  '20260509T2030',
];

const files = [
  {
    label: 'canonical chart host',
    rel: 'chart v 1.4/chart/multichart/chart-host.html',
    expectedScriptSrcs: [
      'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js',
      '../chart.js',
      './engine-api-guards.js',
      './sync-bridge.js',
    ],
    expectedScriptAttributes: [
      ['src', 'crossorigin', 'referrerpolicy'],
      ['src'],
      ['src'],
      ['src'],
    ],
  },
  {
    label: 'served chart host',
    rel: 'homepage/public/chart/multichart/chart-host.html',
    expectedScriptSrcs: [
      'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js',
      '../chart.js',
      './engine-api-guards.js',
      './sync-bridge.js',
    ],
    expectedScriptAttributes: [
      ['src', 'crossorigin', 'referrerpolicy'],
      ['src'],
      ['src'],
      ['src'],
    ],
  },
  {
    label: 'canonical multichart shell',
    rel: 'chart v 1.4/chart/multichart/multichart-shell.html',
    expectedScriptSrcs: [
      'engine-api-guards.js',
      'multichart-manager.js',
    ],
    expectedScriptAttributes: [
      ['src'],
      ['src'],
    ],
  },
  {
    label: 'served multichart shell',
    rel: 'homepage/public/chart/multichart/multichart-shell.html',
    expectedScriptSrcs: [
      'engine-api-guards.js',
      'multichart-manager.js',
    ],
    expectedScriptAttributes: [
      ['src'],
      ['src'],
    ],
  },
];

function readHtml(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function scriptSrcs(html) {
  return scriptTags(html).map((tag) => tag.src);
}

function scriptTags(html) {
  return [...html.matchAll(/<script\b([^>]*)>/gi)]
    .map((match) => {
      const attrs = match[1];
      const src = attrs.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);
      if (!src) return null;
      return {
        src: src[2],
        attributes: attributeNames(attrs),
      };
    })
    .filter(Boolean);
}

function attributeNames(attrs) {
  return [...attrs.matchAll(/\s+([^\s=/"'<>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g)]
    .map((match) => match[1].toLowerCase());
}

function stripQueryAndHash(ref) {
  return ref.split('#')[0].split('?')[0];
}

function isStampRequiredJs(ref) {
  const bare = stripQueryAndHash(ref);
  if (!bare.endsWith('.js')) return false;
  if (!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(bare)) return true;

  const url = new URL(bare, 'https://talaria.app');
  return firstPartyHosts.has(url.hostname);
}

function hasVersionToken(ref) {
  return /[?&]v=[^&#]+/.test(ref);
}

test('multichart shell local script URLs all carry cache stamps', () => {
  for (const file of files) {
    const localJsSrcs = scriptSrcs(readHtml(file.rel)).filter(isStampRequiredJs);
    const unstamped = localJsSrcs.filter((src) => !hasVersionToken(src));

    assert.deepEqual(unstamped, [], `${file.label} has unstamped local scripts`);
  }
});

test('multichart shell files do not retain retired cache tokens', () => {
  for (const file of files) {
    const html = readHtml(file.rel);
    const retained = staleTokens.filter((token) => html.includes(token));

    assert.deepEqual(retained, [], `${file.label} retains stale cache tokens`);
  }
});

test('multichart shell script inventory and order stay fixed', () => {
  for (const file of files) {
    const tags = scriptTags(readHtml(file.rel));
    const actual = tags.map((tag) => stripQueryAndHash(tag.src));

    assert.deepEqual(actual, file.expectedScriptSrcs, file.label);
    assert.deepEqual(
      tags.map((tag) => tag.attributes),
      file.expectedScriptAttributes,
      `${file.label} script attributes`,
    );
  }
});

test('chart-host mirrors carry matching cache stamps per corresponding asset', () => {
  const hostFiles = files.filter((file) => file.rel.endsWith('/chart-host.html'));
  const stampRows = hostFiles.map((file) => scriptTags(readHtml(file.rel))
    .filter((tag) => isStampRequiredJs(tag.src))
    .map((tag) => [stripQueryAndHash(tag.src), tag.src.match(/[?&]v=([^&#]+)/)?.[1] || null]));

  assert.deepEqual(stampRows[1], stampRows[0]);
});

test('multichart shell served copy remains byte-identical to canonical', () => {
  const canonical = fs.readFileSync(path.join(root, 'chart v 1.4/chart/multichart/multichart-shell.html'));
  const served = fs.readFileSync(path.join(root, 'homepage/public/chart/multichart/multichart-shell.html'));

  assert.deepEqual(served, canonical);
});
