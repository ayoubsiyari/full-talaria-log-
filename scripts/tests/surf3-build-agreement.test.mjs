import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  SURF3_BUILD_AGREEMENT_SIGNATURE,
  assertSurf3BuildAgreement,
  defaultSurf3Gate01FixtureDir,
  evaluateBuildAgreement,
  extractTalariaChartBuildId,
  loadFixtureObservations,
  runSurf3BuildAgreementGate,
} from '../lib/surf3-build-agreement.mjs';
import { parseSurf3BuildAgreementArgs } from '../surf3-build-agreement-gate.mjs';

function shellHtml(buildId) {
  return `<!doctype html><script>window.__TALARIA_CHART_BUILD_ID='${buildId}';</script>`;
}

test('unit: extractTalariaChartBuildId reads window assignment forms', () => {
  assert.equal(extractTalariaChartBuildId(shellHtml('20260726b75')), '20260726b75');
  assert.equal(
    extractTalariaChartBuildId(`window.__TALARIA_CHART_BUILD_ID = p.get('v') || '20260728b82';`),
    '20260728b82',
  );
  assert.equal(extractTalariaChartBuildId('<html>no stamp</html>'), null);
});

test('GATE-01: sealed live disagreement fixture is RED (b75 vs b82)', async () => {
  const fixtureDir = defaultSurf3Gate01FixtureDir();
  assert.ok(fs.existsSync(path.join(fixtureDir, 'MANIFEST.json')));
  const report = await runSurf3BuildAgreementGate({ fixtureDir });
  assert.equal(report.signature, SURF3_BUILD_AGREEMENT_SIGNATURE);
  assert.equal(report.status, 'RED');
  assert.equal(report.ok, false);
  const ids = report.evaluation.uniqueBuildIds.slice().sort();
  assert.deepEqual(ids, ['20260726b75', '20260728b82']);
  assert.equal(report.cells.find((c) => c.name === 'SURF3-BUILD-ID-AGREE')?.status, 'RED');
  assert.equal(report.cells.find((c) => c.name === 'SURF3-BUILD-ID-PRESENT')?.status, 'GREEN');
});

test('unit: agreeing shells are GREEN', () => {
  const evaluation = evaluateBuildAgreement([
    { url: 'http://h/chart/index.html', buildId: '20260728b82' },
    { url: 'http://h/chart/dist-v9/index.html', buildId: '20260728b82' },
  ]);
  const cells = assertSurf3BuildAgreement({ evaluation });
  assert.equal(evaluation.agree, true);
  assert.ok(cells.every((c) => c.pass));
});

test('fault-injection: missing BUILD_ID is RED even if the other shell is stamped', () => {
  const evaluation = evaluateBuildAgreement([
    { url: 'http://h/chart/index.html', buildId: null, status: 307 },
    { url: 'http://h/chart/dist-v9/index.html', buildId: '20260728b82', status: 200 },
  ]);
  const cells = assertSurf3BuildAgreement({ evaluation });
  assert.equal(evaluation.agree, false);
  assert.equal(cells.find((c) => c.name === 'SURF3-BUILD-ID-PRESENT')?.status, 'RED');
  assert.equal(cells.find((c) => c.name === 'SURF3-BUILD-ID-AGREE')?.status, 'RED');
});

test('fault-injection: synthetic disagreeing fixture directory is RED', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'surf3-red-'));
  try {
    fs.writeFileSync(path.join(tmp, 'a.html'), shellHtml('20260726b75'));
    fs.writeFileSync(path.join(tmp, 'b.html'), shellHtml('20260728b82'));
    fs.writeFileSync(path.join(tmp, 'MANIFEST.json'), JSON.stringify({
      urls: {
        'http://example/chart/index.html': { fixtureFile: 'a.html', buildId: '20260726b75' },
        'http://example/chart/dist-v9/index.html': { fixtureFile: 'b.html', buildId: '20260728b82' },
      },
    }));
    const report = await runSurf3BuildAgreementGate({ fixtureDir: tmp });
    assert.equal(report.status, 'RED');
    assert.deepEqual(report.evaluation.uniqueBuildIds.slice().sort(), ['20260726b75', '20260728b82']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('unit: fixture loader binds Director GATE-01 expected stamps', () => {
  const { manifest, observations } = loadFixtureObservations(defaultSurf3Gate01FixtureDir());
  const byUrl = Object.fromEntries(observations.map((row) => [row.url, row.buildId]));
  assert.equal(byUrl['http://31.97.192.82:3000/chart/index.html'], '20260726b75');
  assert.equal(byUrl['http://31.97.192.82:3000/chart/dist-v9/index.html'], '20260728b82');
  assert.equal(manifest.urls['http://31.97.192.82:3000/chart/index.html'].buildId, '20260726b75');
});

test('unit: CLI --fixture selects GATE-01 sealed directory', () => {
  const options = parseSurf3BuildAgreementArgs(['--fixture', '--json']);
  assert.equal(options.fixtureDir, defaultSurf3Gate01FixtureDir());
  assert.equal(options.json, true);
});

test('live-mock: fetch disagreement returns RED without network', async () => {
  const bodies = new Map([
    ['http://31.97.192.82:3000/chart/index.html', shellHtml('20260726b75')],
    ['http://31.97.192.82:3000/chart/dist-v9/index.html', shellHtml('20260728b82')],
  ]);
  const fetchImpl = async (url) => ({
    status: 200,
    headers: { get: () => null },
    text: async () => bodies.get(url),
  });
  const report = await runSurf3BuildAgreementGate({
    baseUrl: 'http://31.97.192.82:3000',
    fetchImpl,
  });
  assert.equal(report.status, 'RED');
  assert.deepEqual(report.evaluation.uniqueBuildIds.slice().sort(), ['20260726b75', '20260728b82']);
});
