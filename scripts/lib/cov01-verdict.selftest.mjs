import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assessCov01, loadMoments, momentFileName, COV01_MOMENTS, COV01_FLOOR_PCT,
} from './cov01-verdict.mjs';

const moment = (name, coveragePct, over = {}) => ({
  moment: name,
  present: true,
  coveragePct,
  namedMB: coveragePct != null ? +(coveragePct * 6.749).toFixed(2) : null,
  totalMB: 674.9,
  totalBasis: 'all-chrome-process-private',
  processCount: 7,
  covState: 'MEASURED',
  ...over,
});

const allAt = (pct) => COV01_MOMENTS.map((m) => moment(m, pct));

test('four moments all clearing the floor is the only green', () => {
  const v = assessCov01({ moments: allAt(96.4) });
  assert.equal(v.state, 'COV01_GREEN');
  assert.equal(v.pass, true);
  assert.equal(v.quotable, true);
  assert.equal(v.worstMoment.coveragePct, 96.4);
});

test('the worst moment is the verdict — an average above the floor does not rescue one below it', () => {
  const v = assessCov01({
    moments: [moment('trades:start', 99), moment('trades:end', 99),
      moment('zerotrade:start', 99), moment('zerotrade:end', 83)],
  });
  assert.equal(v.meanPct, 95, 'the mean clears the floor');
  assert.equal(v.state, 'COVERAGE_BELOW_FLOOR');
  assert.equal(v.pass, false);
  assert.equal(v.worstMoment.moment, 'zerotrade:end');
  assert.equal(v.spreadPct, 16);
});

test('the published 59.84% grades RED rather than throwing', () => {
  const v = assessCov01({ moments: allAt(59.84) });
  assert.equal(v.state, 'COVERAGE_BELOW_FLOOR');
  assert.match(v.why, /59\.84% against a 95% floor/);
});

test('absent moments are UNMEASURED, distinct from below-floor', () => {
  const v = assessCov01({ moments: [moment('trades:start', 99), moment('trades:end', 99)] });
  assert.equal(v.state, 'MOMENTS_MISSING');
  assert.equal(v.pass, false);
  assert.deepEqual(v.missing, ['zerotrade:start', 'zerotrade:end']);
  assert.match(v.why, /not a pass either/);
});

test('no moments at all is missing, not vacuously green', () => {
  const v = assessCov01({ moments: [] });
  assert.equal(v.state, 'MOMENTS_MISSING');
  assert.equal(v.pass, false);
  assert.equal(v.missing.length, 4);
});

test('a failed capture is its own state and is never read as zero coverage', () => {
  const v = assessCov01({
    moments: [...allAt(99).slice(0, 3),
      moment('zerotrade:end', null, { covState: 'CAPTURE_FAILED', captureError: 'target closed' })],
  });
  assert.equal(v.state, 'CAPTURE_FAILED');
  assert.notEqual(v.state, 'COVERAGE_BELOW_FLOOR');
  assert.equal(v.failedMoments[0].error, 'target closed');
});

test('BASIS-GUARD-01: single-pid coverage is refused, not graded, even at 99%', () => {
  const v = assessCov01({
    moments: [...allAt(99).slice(0, 3),
      moment('zerotrade:end', 99, { processCount: 1, totalBasis: 'single-renderer-private' })],
  });
  assert.equal(v.state, 'BASIS_REJECTED');
  assert.equal(v.pass, false);
  assert.match(v.why, /divides one renderer by the whole browser/);
});

test('an all-Chrome total over one process is still the 59.84% basis and is refused', () => {
  const v = assessCov01({ moments: allAt(99).map((m) => ({ ...m, processCount: 1 })) });
  assert.equal(v.state, 'BASIS_REJECTED');
});

test('a captured moment with no coverage figure is unreadable, not a pass', () => {
  const v = assessCov01({ moments: [...allAt(99).slice(0, 3), moment('zerotrade:end', null)] });
  assert.equal(v.state, 'COVERAGE_UNREADABLE');
  assert.equal(v.pass, false);
});

test('exactly at the floor passes and a hair under does not', () => {
  assert.equal(assessCov01({ moments: allAt(COV01_FLOOR_PCT) }).pass, true);
  assert.equal(assessCov01({ moments: allAt(94.99) }).pass, false);
});

test('the moments span both arms, so one arm alone can never go green', () => {
  const tradesOnly = [moment('trades:start', 99), moment('trades:end', 99)];
  assert.equal(assessCov01({ moments: tradesOnly }).state, 'MOMENTS_MISSING');
});

test('loadMoments reads E\'s artifact contract off disk and reports gaps', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov01-'));
  fs.writeFileSync(path.join(dir, momentFileName('trades:start')), JSON.stringify({
    signature: 'DETAILED-DUMP-CAPTURE-V1',
    moment: 'trades:start',
    totalPrivateMB: 674.9,
    totalBasis: 'all-chrome-process-private',
    singlePidCoverage: 59.84,
    row: { arenaCoveragePct: 97.1, arenaNamedTotalMB: 655.3, processCount: 7, covState: 'MEASURED' },
  }));
  const loaded = loadMoments(dir);
  const first = loaded.find((m) => m.moment === 'trades:start');
  assert.equal(first.present, true);
  assert.equal(first.coveragePct, 97.1);
  assert.equal(first.singlePidCoverage, 59.84, 'the rejected basis rides along for comparison');
  assert.equal(loaded.filter((m) => !m.present).length, 3);
  assert.match(loaded.find((m) => m.moment === 'trades:end').why, /no artifact at/);
  assert.equal(assessCov01({ moments: loaded }).state, 'MOMENTS_MISSING');
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * THE SEAM WITH E'S PARSER, tested on a real artifact rather than asserted in prose.
 *
 * E's parser is the sanctioned per-moment reader, so the obvious integration is to route this
 * aggregator through it. These two cells are why that would be wrong: `correctedCoverageFromCaptureRow`
 * sets `totalBasis: 'all-chrome-process-private'` as a LITERAL, so every moment it returns claims the
 * corrected basis whatever the artifact says. That is correct for its own job — it parses captures it
 * knows are V1 — and unfalsifiable as the input to a basis guard.
 */
const writeArtifact = (dir, name, { processCount = 7, totalBasis = 'all-chrome-process-private', pct = 97.1 } = {}) => {
  fs.writeFileSync(path.join(dir, momentFileName(name)), JSON.stringify({
    signature: 'DETAILED-DUMP-CAPTURE-V1',
    moment: name,
    totalPrivateMB: 674.9,
    totalBasis,
    singlePidCoverage: 59.84,
    row: {
      arenaCoveragePct: pct, arenaNamedTotalMB: 403.85, processCount, covState: 'MEASURED',
      arenaCoverageMeets95: pct >= 95,
    },
  }));
};

test('a single-pid artifact on disk is refused, and that is the 59.84% shape', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov01-seam-'));
  for (const m of COV01_MOMENTS) writeArtifact(dir, m);
  assert.equal(assessCov01({ moments: loadMoments(dir) }).state, 'COV01_GREEN', 'four good moments are green');

  // Narrow the numerator back to one process — the exact regression BASIS-GUARD-01 exists to catch.
  writeArtifact(dir, 'zerotrade:end', { processCount: 1 });
  const v = assessCov01({ moments: loadMoments(dir) });
  assert.equal(v.state, 'BASIS_REJECTED');
  assert.equal(v.pass, false);
  assert.equal(v.offending[0].moment, 'zerotrade:end');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('routing through E\'s parser would make the basis guard unfalsifiable', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov01-seam-'));
  writeArtifact(dir, 'trades:start', { processCount: 1, totalBasis: 'single-renderer-private' });
  const file = path.join(dir, momentFileName('trades:start'));

  const { parseDetailedDumpArtifacts } = await import('../detailed-dump-parser.mjs');
  const parsed = parseDetailedDumpArtifacts([file]);
  const viaE = (parsed.samples || parsed)[0];
  assert.equal(viaE.coverage.totalBasis, 'all-chrome-process-private',
    'E\'s parser reports the corrected basis for an artifact that declares the rejected one');

  // Reading the artifact directly keeps the field falsifiable.
  const mine = loadMoments(dir).find((m) => m.moment === 'trades:start');
  assert.equal(mine.totalBasis, 'single-renderer-private');
  assert.equal(mine.processCount, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('an unreadable artifact is absent, not a silent skip', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cov01-'));
  fs.writeFileSync(path.join(dir, momentFileName('trades:start')), '{ truncated');
  const loaded = loadMoments(dir);
  assert.equal(loaded.find((m) => m.moment === 'trades:start').present, false);
  assert.match(loaded.find((m) => m.moment === 'trades:start').why, /unreadable/);
  fs.rmSync(dir, { recursive: true, force: true });
});
