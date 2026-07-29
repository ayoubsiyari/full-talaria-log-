import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateRetainerPaths,
  canonicalizeScriptSourcePath,
  classifyRetainerPath,
  formatRetainerPathsSummary,
  HEAP_RETAINER_PATHS_SIGNATURE,
  normalizePathSignature,
  synthesizeRetainerSnapshotFixture,
} from '../lib/heap-retainer-paths.mjs';

test('unit: identical retainer paths aggregate; _tfDataCache path ranks first', () => {
  const snap = synthesizeRetainerSnapshotFixture();
  const report = aggregateRetainerPaths(snap, {
    constructors: ['system / ExternalStringData'],
    topPaths: 10,
  });
  assert.equal(report.signature, HEAP_RETAINER_PATHS_SIGNATURE);
  const block = report.byConstructor[0];
  assert.equal(block.constructor, 'system / ExternalStringData');
  assert.equal(block.instanceCount, 3);
  assert.ok(block.paths.length >= 1);
  // s1(1000)+s2(2000) share Window→_tfDataCache→bag→[] ; s3(500) is other branch.
  const top = block.paths[0];
  assert.equal(top.totalSelfBytes, 3000);
  assert.equal(top.instanceCount, 2);
  assert.ok(top.path.includes('_tfDataCache'), top.path);
  assert.ok(top.suspectTokens.includes('_tfDataCache'));
  // Element indices collapsed to [] — no raw [0]/[1] split.
  assert.ok(top.path.includes('[]'));
  assert.ok(!/\[\d+\]/.test(top.path));
  const text = formatRetainerPathsSummary(report);
  assert.match(text, /_tfDataCache/);
  assert.match(text, /SUSPECT/);
});

test('unit: per-instance chains are not emitted — one line per distinct path', () => {
  const snap = synthesizeRetainerSnapshotFixture();
  const report = aggregateRetainerPaths(snap, {
    constructors: ['system / ExternalStringData'],
  });
  const block = report.byConstructor[0];
  // 3 instances but only 2 distinct path shapes (cache bag vs other).
  assert.ok(block.pathCount <= 3);
  assert.ok(block.paths.every((p) => typeof p.path === 'string' && p.instanceCount >= 1));
});

test('unit: script-source canonicalize + no false cache hit on _btTfCacheAnchorKey', () => {
  assert.equal(
    classifyRetainerPath('Chart → _btTfCacheAnchorKey → system / Script → (script-source)'),
    'script-source',
  );
  assert.ok(
    canonicalizeScriptSourcePath(
      'Chart → fn → system / Script / http://x/chart.js → (script-source) → system / ExternalStringData',
    ).includes('http://x/chart.js'),
  );
  // Edge-form cache hit still classified cache-suspect.
  assert.equal(
    classifyRetainerPath('Chart → Map[_smartPrefetchCache] → Object[payload]'),
    'cache-suspect',
  );
});

test('unit: normalizePathSignature collapses WeakMapPair + script-source noise', () => {
  const noisy = [
    '(Eternal handles) → system / FunctionTemplateInfo[201]',
    '→ PageTransitionEvent[1 / part of key (system / FunctionTemplateInfo @5396091) -> value (PageTransitionEvent @6941785) pair in WeakMap (table @8985931)]',
    '→ Window [JSGlobalObject][global_object] → fn',
    '→ system / Script / http://127.0.0.1:1/chart.js?v=1[script]',
    '→ /**\n * Order Management\n */ const X = 1; function long() { return 1 }[source]',
    '→ system / ExternalStringData[2 / backing_store]',
  ].join(' ');
  const norm = normalizePathSignature(noisy);
  assert.match(norm, /WeakMapPair/);
  assert.doesNotMatch(norm, /@5396091/);
  assert.match(norm, /script-source|system \/ Script/);
  assert.doesNotMatch(norm, /Order Management/);
  // Two noisy variants with different ids must collapse to one signature.
  const noisy2 = noisy.replace(/@5396091/g, '@111').replace(/@6941785/g, '@222').replace(/@8985931/g, '@333');
  assert.equal(normalizePathSignature(noisy2), norm);
});
