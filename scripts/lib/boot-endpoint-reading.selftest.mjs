import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { takeBootEndpointReading } from './boot-endpoint-reading.mjs';

/**
 * The rungs are 600 s in production. Tests pass 0 for the sleeps and assert on what the reading SAYS
 * its rungs were, because SETTLE-CRITERION-V2 grades on the declared rung length: a test that shortened
 * the rung and still expected SETTLED would be proving the criterion can be bypassed.
 */
const REAL_RUNGS = [0, 600_000, 600_000];

function fakePage({ playing = true, resumeWorks = true, probeAllocates = true } = {}) {
  const state = { playing, gcCalls: 0, probeMB: 0 };
  return {
    state,
    async evaluate(fn, arg) {
      const src = String(fn);
      if (/rs\.pause/.test(src)) {
        const before = state.playing; state.playing = false;
        return [{ realm: 'host', before, after: state.playing }];
      }
      if (/rs\.play/.test(src)) {
        const before = state.playing; if (resumeWorks) state.playing = true;
        return [{ realm: 'host', before, after: state.playing }];
      }
      if (/__capabilityProbe = buf/.test(src)) {
        if (probeAllocates) state.probeMB = arg;
        return probeAllocates;
      }
      if (/delete window\.__capabilityProbe/.test(src)) { state.probeMB = 0; return null; }
      return null;
    },
    async createCDPSession() {
      return { send: async (m) => { if (/collectGarbage/.test(m)) state.gcCalls += 1; }, detach: async () => {} };
    },
  };
}

const goodIdentity = { commit: 'a173b5c5f001', buildStamp: 'b126', expectedSha: 'deadbeef', servedSha: 'deadbeef' };
const goodDump = (artifactPath, over = {}) => ({
  covState: 'MEASURED', arenaCoveragePct: 96.2, sizeBasis: 'effective_size', processCount: 9,
  basisGuard: { ok: true }, artifactPath, nodeBasisCounts: { effective_size: 40 }, ...over,
});

async function run(over = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'boot-endpoint-'));
  // A real file, because the sidecars row checks the disk and a fake path would test nothing.
  const dumpPath = path.join(tmp, 'trades_start.detailed-dump.json');
  fs.writeFileSync(dumpPath, '{}');
  const page = over.page ?? fakePage();
  const flat = over.reads ?? [700.1, 675.4, 674.9];
  let i = 0;
  const reading = await takeBootEndpointReading({
    page,
    rungsMs: over.rungsMs ?? REAL_RUNGS,
    // The probe's bytes show up in the footprint, as they would on a real page. This is what makes the
    // capability probe a real round trip in the test rather than a rubber stamp.
    readFootprint: async () => ({
      footprintTotalMB: flat[Math.min(i++, flat.length - 1)] + page.state.probeMB,
      pageRendererMB: 300, footprintByType: { gpu: 120, renderer: 340, browser: 90, other: 30 },
    }),
    captureDump: async () => (over.dump === undefined ? goodDump(dumpPath) : over.dump(dumpPath)),
    readHeapMB: over.readHeapMB ?? (async () => 100),
    identity: over.identity === undefined ? goodIdentity : over.identity,
    // Left undefined by default so the in-situ CAPABILITY-PROBE-01 actually runs in these tests.
    capability: over.capability,
    runCapabilityProbe: over.runCapabilityProbe,
    capabilityProbeMB: over.capabilityProbeMB ?? 64,
    phaseSummary: over.phaseSummary === undefined ? { state: 'PHASES_COMPLETE', timeouts: 0 } : over.phaseSummary,
    outDir: tmp,
    sleepFn: async () => {},
    gcOptions: { rounds: 1, gapMs: 0, tailMs: 0 },
  });
  return { reading, tmp, page, dumpPath };
}

test('the happy path is SETTLED, valid, and yields one quotable floor', async () => {
  const { reading } = await run();
  assert.equal(reading.settle.settled, true, reading.settle.why ?? '');
  assert.equal(reading.validity.valid, true, reading.validity.why ?? '');
  assert.equal(reading.quotable, true);
  assert.equal(reading.floorMB, 674.9);
  assert.equal(reading.failureSidecarPath, null);
  assert.match(reading.packetRow, /674\.9 MB — SETTLED/);
});

test('it pauses before reading and puts the arm back afterwards', async () => {
  const { reading, page } = await run();
  assert.equal(reading.quiescence.quiescent, true);
  assert.equal(reading.resume.resumed, true);
  assert.equal(page.state.playing, true, 'the arm must be playing again or the soak runs stopped');
});

test('a resume that does not take is reported, not swallowed', async () => {
  const { reading } = await run({ page: fakePage({ resumeWorks: false }) });
  assert.equal(reading.resume.resumed, false);
  assert.match(reading.resume.why, /the arm would continue on a stopped page/);
});

test('three rungs are walked, so condition F has a curve to grade', async () => {
  const { reading } = await run();
  assert.equal(reading.curve.length, 3);
  assert.deepEqual(reading.curve.map((c) => c.footprintTotalMB), [700.1, 675.4, 674.9]);
});

test('the old hour-0 shape — one read on a playing page — is refused', async () => {
  const { reading } = await run({ rungsMs: [0], page: fakePage(), reads: [1159.7] });
  assert.equal(reading.settle.settled, false);
  assert.equal(reading.quotable, false);
  assert.match(reading.notQuotableBecause, /SETTLE-CRITERION-V2/);
  assert.ok(reading.settle.failures.some((f) => f.condition === 'F'), 'one read is not a curve');
});

test('a still-moving curve is not quotable however long the settle was', async () => {
  const { reading } = await run({ reads: [800, 750, 700] });
  assert.equal(reading.settle.settled, false);
  assert.equal(reading.floorMB, null);
});

test('effective_size is confirmed as its own fact, separate from the coverage number', async () => {
  const { reading } = await run();
  assert.equal(reading.effectiveSize.confirmed, true);
  assert.equal(reading.effectiveSize.basis, 'effective_size');
});

test('a dump on the old size basis fails the effective_size confirmation', async () => {
  const { reading } = await run({ dump: (p) => goodDump(p, { sizeBasis: 'size' }) });
  assert.equal(reading.effectiveSize.confirmed, false);
  assert.match(reading.effectiveSize.why, /must not be quoted as if it were/);
});

test('a failed validity row writes a sidecar file and blocks the number', async () => {
  const { reading, tmp } = await run({ runCapabilityProbe: false });
  assert.equal(reading.quotable, false);
  assert.equal(reading.floorMB, null);
  assert.ok(reading.failureSidecarPath, 'a sidecar must exist');
  const s = JSON.parse(fs.readFileSync(reading.failureSidecarPath, 'utf8'));
  assert.equal(s.sidecar, 'READING-VALIDITY-FAILURE');
  assert.deepEqual(s.unprovenRows, ['capabilityProof']);
  assert.ok(fs.readdirSync(tmp).some((f) => f.startsWith('READING-VALIDITY-FAILURE')));
});

test('an unsettled but otherwise valid reading still ships a sidecar', async () => {
  const { reading } = await run({ reads: [800, 750, 700] });
  assert.ok(reading.failureSidecarPath, 'settle failure travels as a file too, not as prose');
  const s = JSON.parse(fs.readFileSync(reading.failureSidecarPath, 'utf8'));
  assert.deepEqual(s.redRows, ['settleCriterion']);
  assert.match(s.instruction, /the caveat is this/);
});

test('a heap that rose across the collection trips condition C', async () => {
  let n = 0;
  const { reading } = await run({ readHeapMB: async () => (n++ % 2 === 0 ? 100 : 118) });
  assert.equal(reading.settle.settled, false);
  assert.ok(reading.settle.failures.some((f) => f.state === 'COLLECTION_INEFFECTIVE_OR_RESAMPLED'));
});

test('the endpoint proves its own capability rather than borrowing E\'s artifact', async () => {
  const { reading } = await run();
  assert.equal(reading.capabilityProof.probe, 'CAPABILITY-PROBE-01');
  assert.equal(reading.capabilityProof.detected, true, reading.capabilityProof.why ?? '');
  assert.equal(reading.capabilityProof.roseMB, 64);
  assert.equal(reading.capabilityProof.fellMB, 64);
  assert.match(reading.capabilityProof.doesNotProve, /per-arena attribution/);
});

test('the probe runs after the quoted floor, so it cannot move the number it certifies', async () => {
  const { reading } = await run();
  assert.equal(reading.floorMB, 674.9, 'the floor must be the curve read, with no probe bytes in it');
  assert.equal(reading.curve.at(-1).footprintTotalMB, 674.9);
});

test('an instrument that cannot see 64 MB arrive fails the capability row', async () => {
  const { reading } = await run({ page: fakePage({ probeAllocates: false }) });
  assert.equal(reading.capabilityProof.detected, false);
  assert.match(reading.capabilityProof.why, /never tested/);
  assert.equal(reading.quotable, false);
  assert.ok(reading.failureSidecarPath);
});

test('the bar comparison is only made against a settled reading', async () => {
  const settled = (await run()).reading;
  assert.notEqual(settled.bar.barState, 'BAR_NOT_APPLICABLE_UNSETTLED');
  const moving = (await run({ reads: [800, 750, 700] })).reading;
  assert.equal(moving.bar.barState, 'BAR_NOT_APPLICABLE_UNSETTLED');
});
