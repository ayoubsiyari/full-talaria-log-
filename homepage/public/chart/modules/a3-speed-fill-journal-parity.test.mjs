/**
 * A3 — CI-permanent money-path gate: coordinate-invariance.
 *
 * Identical session across playback coordinates 1 / 5 / 10 must produce
 * byte-equal fills, journal, and money transcripts. Live evidence must pin
 * the candidate by badge · digest · source SHA (three identity coordinate pairs).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  A3_CANDIDATE_B122,
  A3_PLAYBACK_COORDINATES,
  A3_SIGNATURE,
  buildTranscripts,
  compareCoordinateTranscripts,
  matchCoordinatePairs,
  modelCoordinateInvariantSession,
  normalizeMoneyRow,
  stableDigest,
} from '../../../scripts/lib/a3-speed-fill-journal-parity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const runnerPath = path.join(repoRoot, 'scripts/a3-speed-fill-journal-parity-canary.mjs');
const libPath = path.join(repoRoot, 'scripts/lib/a3-speed-fill-journal-parity.mjs');
const evidencePath = path.join(repoRoot, 'docs/plan3/evidence/a3-speed-fill-journal-parity-b122.json');
const packageJsonPath = path.join(repoRoot, 'package.json');

test('A3 source: CI gate and live runner are wired', () => {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  assert.equal(typeof pkg.scripts['test:a3-speed-fill-journal-parity'], 'string');
  assert.equal(typeof pkg.scripts['preflight:a3-speed-fill-journal-parity'], 'string');
  assert.ok(fs.existsSync(runnerPath), 'live runner must exist');
  assert.ok(fs.existsSync(libPath), 'shared lib must exist');
  const runner = fs.readFileSync(runnerPath, 'utf8');
  assert.match(runner, /A3_PLAYBACK_COORDINATES|playbackCoordinates/);
  assert.match(runner, /matchCoordinatePairs/);
  assert.match(runner, /buildTranscripts/);
  assert.match(runner, /compareCoordinateTranscripts/);
});

test('A3 model: three playback coordinates yield three byte-equal transcript pairs', () => {
  const series = Array.from({ length: 40 }, (_, i) => ({
    t: 1_700_000_000_000 + i * 60_000,
    o: 1.1,
    h: 1.1 + (i === 23 ? 0.01 : 0.001),
    l: 1.09,
    c: 1.1005 + i * 0.00001,
    v: 100,
  }));
  const modeled = modelCoordinateInvariantSession({
    series,
    startIdx: 20,
    hitIdx: 23,
    direction: 'BUY',
    speeds: A3_PLAYBACK_COORDINATES,
  });
  assert.deepEqual(modeled.arms.map((a) => a.speed), [1, 5, 10]);
  assert.equal(modeled.comparison.ok, true);
  assert.equal(modeled.comparison.pairs.length, 3);
  for (const pair of modeled.comparison.pairs) {
    assert.equal(pair.equal, true, `${pair.name} transcript must be byte-equal`);
    assert.equal(new Set(pair.digests).size, 1);
  }
});

test('A3 model RED: speed folded into money transcript fails the gate', () => {
  const row = normalizeMoneyRow({
    ticker: 'EURUSD',
    direction: 'BUY',
    status: 'CLOSED',
    entryPrice: 1.1,
    openPrice: 1.1,
    closePrice: 1.11,
    pnl: 100,
    quantity: 1,
    openTime: 1,
    closeTime: 2,
    closeReason: 'takeProfit',
    takeProfit: 1.11,
    stopLoss: 1.0,
  });
  const arms = [1, 5, 10].map((speed) => {
    const normalized = {
      closed: [{ ...row, pnl: row.pnl * speed }],
      journal: [{ ...row, pnl: row.pnl * speed }],
    };
    return {
      speed,
      status: 'OBSERVED',
      normalized,
      transcripts: buildTranscripts(normalized),
      digest: stableDigest(normalized),
    };
  });
  const comparison = compareCoordinateTranscripts(arms);
  assert.equal(comparison.ok, false);
  assert.equal(comparison.pairs.find((p) => p.name === 'money').equal, false);
});

test('A3 identity: three coordinate pairs reject stale b85 surface', () => {
  const stale = {
    badge: '20260728b85',
    digest: 'deadbeefdeadbeefdeadbeefdeadbeef',
    sourceCommitSha: '0000000000000000000000000000000000000000',
  };
  const mismatch = matchCoordinatePairs(stale, A3_CANDIDATE_B122);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.pairs.length, 3);
  assert.ok(mismatch.pairs.every((p) => p.equal === false || p.name === 'digest' || p.name === 'badge' || p.name === 'sourceCommitSha'));
  assert.equal(mismatch.pairs.find((p) => p.name === 'badge').equal, false);

  const match = matchCoordinatePairs(A3_CANDIDATE_B122, A3_CANDIDATE_B122);
  assert.equal(match.ok, true);
  assert.ok(match.pairs.every((p) => p.equal));
});

test('A3 sealed evidence: candidate b122 arms are byte-equal across coordinates', () => {
  assert.ok(fs.existsSync(evidencePath), 'sealed canary evidence must be committed');
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(evidence.signature, A3_SIGNATURE);
  assert.ok(evidence.identity?.ok, 'evidence must pass three identity coordinate pairs');
  assert.deepEqual(evidence.expectedCoordinates, A3_CANDIDATE_B122);
  assert.ok(Array.isArray(evidence.playbackCoordinates));
  assert.deepEqual(evidence.playbackCoordinates, A3_PLAYBACK_COORDINATES);
  assert.ok(Array.isArray(evidence.arms));
  assert.equal(evidence.arms.length, 3);
  assert.deepEqual(evidence.arms.map((a) => a.speed), [1, 5, 10]);

  // Recompute transcripts from sealed normalized arms so a rewritten digest cannot soft-pass.
  const recomputed = evidence.arms.map((arm) => ({
    speed: arm.speed,
    status: arm.status,
    normalized: arm.normalized,
    transcripts: buildTranscripts(arm.normalized),
  }));
  const comparison = compareCoordinateTranscripts(recomputed);
  assert.equal(comparison.ok, true, comparison.reason);
  assert.equal(evidence.verdict, 'PASSED');
  for (const pair of comparison.pairs) {
    assert.equal(pair.equal, true, `${pair.name} must be byte-equal on sealed evidence`);
  }
});
