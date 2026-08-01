// Gate for the served-tree strip (B4).
//
// The strip removes ~18.6 MB from the served /chart/ tree. It is only safe while nothing a
// browser boots from lives under the stripped patterns. That is a property of the product, not
// of the script, so it needs a gate: if someone later points a production entry point at a
// *.test.mjs or at the harness, this goes RED at commit time instead of 404ing in the canary.
//
// The path manifest is not invented here. It is every distinct /chart/* URL observed in the live
// canary access log, including a multichart panel session, retained alongside this gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const SCRIPT = join(ROOT, 'deploy/strip-nonserved-chart-assets.sh');
const DOCKERFILE = join(ROOT, 'homepage/Dockerfile');
const MANIFEST = join(ROOT, 'docs/plan3/evidence/B-M4/release/b4-served-chart-paths-20260730.txt');

// The patterns the strip removes, as predicates over a served URL path.
const STRIPPED = [
  { name: 'multichart harness tree', hit: (p) => p.includes('/multichart-prod/harness/') },
  { name: 'colocated unit test', hit: (p) => p.endsWith('.test.mjs') },
  { name: 'editor backup', hit: (p) => p.endsWith('.bak') || p.endsWith('.backup') },
  { name: 'source map', hit: (p) => p.endsWith('.map') },
  { name: 'node_modules', hit: (p) => p.includes('/node_modules/') },
];

// Entry points the browser boots from. The script checks these as an invariant — whichever were
// present before the strip must be present after — so the gate checks they are named, not that
// every one exists in every image.
const REQUIRED_ENTRY_POINTS = [
  'dist-v9/index.html',
  'chart.js',
  'multichart-prod/chart-embed.html',
  'multichart-prod/embed-bridge.js',
  'multichart-prod/panel-cmd-bridge.js',
  'multichart-prod/sync-bridge.js',
  'multichart-prod/multichart-manager.js',
];

function servedPaths() {
  assert.ok(existsSync(MANIFEST), `missing served-path manifest at ${MANIFEST}`);
  return readFileSync(MANIFEST, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

export function assertNoServedPathIsStripped(paths = servedPaths()) {
  assert.ok(paths.length >= 100,
    `manifest looks truncated (${paths.length} paths); a thin manifest proves nothing`);
  const collisions = [];
  for (const p of paths) {
    for (const rule of STRIPPED) {
      if (rule.hit(p)) collisions.push(`${p} matches ${rule.name}`);
    }
  }
  assert.deepEqual(collisions, [],
    `the strip would remove a path the browser actually requests:\n  ${collisions.join('\n  ')}`);
  return true;
}

test('no observed served path falls under the strip patterns', () => {
  assert.equal(assertNoServedPathIsStripped(), true);
});

test('the manifest covers the multichart panel surface, not just the host page', () => {
  // A manifest recorded without ever opening a panel would pass the collision check while
  // proving nothing about the realm where the harness would plausibly be referenced.
  const paths = servedPaths();
  for (const needed of ['/chart/multichart-prod/chart-embed.html', '/chart/multichart-prod/embed-bridge.js']) {
    assert.ok(paths.includes(needed),
      `manifest does not cover ${needed}; re-record it with a multichart session`);
  }
});

test('the strip script guards every required entry point', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  for (const entry of REQUIRED_ENTRY_POINTS) {
    assert.ok(src.includes(entry), `strip script does not assert ${entry} survives`);
  }
  assert.match(src, /REFUSING/, 'strip script must fail the build, not warn, if an entry point goes');
  // The check has to be an invariant over what was there, not a fixed list of what ought to be:
  // the two images lay the tree out differently and a fixed list fails a build for a file that
  // never existed. This was caught by the script refusing on a real tree.
  assert.match(src, /PRESENT_BEFORE/,
    'entry-point check must compare against what existed before the strip');
  assert.match(src, /no chart entry points; wrong root/,
    'strip script must refuse a root that is not a chart tree');
});

test('the strip is wired into the image behind a build toggle', () => {
  const df = readFileSync(DOCKERFILE, 'utf8');
  assert.match(df, /ARG STRIP_NONSERVED_CHART_ASSETS=1/,
    'the strip must be toggleable at build time; that toggle is the revert');
  assert.match(df, /strip-nonserved-chart-assets\.sh \/usr\/share\/nginx\/html\/chart/,
    'the strip must run against the served tree');
  // It has to run after the static tree is copied in, or it strips nothing.
  const copyAt = df.indexOf('COPY --from=builder /app/homepage/out /usr/share/nginx/html');
  const stripAt = df.indexOf('strip-nonserved-chart-assets.sh /usr/share/nginx/html/chart');
  assert.ok(copyAt !== -1 && stripAt > copyAt,
    'the strip must run after the static tree is copied into the image');
});

test('mutation: a production path under the harness goes RED', () => {
  assert.throws(
    () => assertNoServedPathIsStripped([...servedPaths(), '/chart/multichart-prod/harness/scenarios.mjs']),
    /actually requests/);
});

test('mutation: a production path at a .test.mjs goes RED', () => {
  assert.throws(
    () => assertNoServedPathIsStripped([...servedPaths(), '/chart/modules/m20-q6-replay-lifecycle-binding.test.mjs']),
    /actually requests/);
});

test('mutation: a manifest too thin to prove anything goes RED', () => {
  assert.throws(() => assertNoServedPathIsStripped(['/chart/dist-v9/index.html']), /truncated/);
});
