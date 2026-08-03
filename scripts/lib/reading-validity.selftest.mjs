import test from 'node:test';
import assert from 'node:assert/strict';
import { assessReading, failureSidecar, ROWS } from './reading-validity.mjs';

const allGood = {
  label: 'soak boot endpoint',
  identity: { commit: 'a173b5c5f0011', buildStamp: '20260803b126', expectedSha: 'deadbeefcafe', servedSha: 'deadbeefcafe' },
  phaseSummary: { state: 'PHASES_COMPLETE', timeouts: 0 },
  sidecars: [{ path: 'detailed-dumps/trades-start.json', exists: true }],
  coverage: { covState: 'MEASURED', arenaCoveragePct: 96.4, processCount: 9, sizeBasis: 'effective_size', basisGuard: { ok: true } },
  capability: { detected: true, what: 'combined canvas reclaim', observedMB: 50.78, artifact: 'combined-canvas-fix-settle-20260802.json' },
};

test('all five rows green is the only VALID state', () => {
  const v = assessReading(allGood);
  assert.equal(v.valid, true);
  assert.equal(v.state, 'VALID');
  for (const r of ROWS) assert.equal(v.rows[r].state, 'GREEN', `${r} must be green`);
  assert.match(v.packetRow, /VALID — all five rows green/);
});

test('UNPROVEN is not a pass — a row with no evidence blocks exactly as a RED does', () => {
  const v = assessReading({ ...allGood, capability: null });
  assert.equal(v.valid, false);
  assert.equal(v.state, 'INVALID_UNPROVEN');
  assert.deepEqual(v.unprovenRows, ['capabilityProof']);
  assert.match(v.rows.capabilityProof.reason, /a flat reading and a blind instrument are indistinguishable/);
});

test('a served SHA that is not the pinned one fails identity lock outright', () => {
  const v = assessReading({ ...allGood, identity: { ...allGood.identity, servedSha: 'feedfacefeed' } });
  assert.equal(v.rows.identityLock.state, 'RED');
  assert.match(v.rows.identityLock.reason, /measured a build nobody asked for/);
});

test('a commit with no served-SHA comparison is UNPROVEN, not green', () => {
  const v = assessReading({ ...allGood, identity: { commit: 'abc123def456', buildStamp: '20260803b126' } });
  assert.equal(v.rows.identityLock.state, 'UNPROVEN');
  assert.match(v.rows.identityLock.reason, /presence of a commit is not proof the browser loaded it/);
});

test('a timed-out phase fails, because a settle curve with a gap is not the curve it reports', () => {
  const v = assessReading({ ...allGood, phaseSummary: { state: 'PHASES_COMPLETE', timeouts: 1 } });
  assert.equal(v.rows.phases.state, 'RED');
  assert.match(v.rows.phases.reason, /unmeasured gap/);
});

test('a referenced sidecar that is not on disk fails', () => {
  const v = assessReading({ ...allGood, sidecars: [{ path: 'detailed-dumps/x.json', exists: false }] });
  assert.equal(v.rows.sidecars.state, 'RED');
  assert.match(v.rows.sidecars.reason, /not on disk/);
});

test('COV-01 below 95 fails and names the unattributed megabytes', () => {
  const v = assessReading({ ...allGood,
    coverage: { covState: 'MEASURED', arenaCoveragePct: 59.84, arenaUnattributedMB: 271.05, processCount: 9, basisGuard: { ok: true } } });
  assert.equal(v.rows.coverage.state, 'RED');
  assert.match(v.rows.coverage.reason, /59\.84%/);
  assert.match(v.rows.coverage.reason, /271\.05 MB is unattributed/);
});

test('the four non-numeric coverage states each fail on their own terms', () => {
  const states = {
    DUMP_UNAVAILABLE: /instrument failure, not zero named memory/,
    TOTAL_ABSENT: /no total to measure coverage against/,
    OVERLAP_SUSPECTED: /roots overlapped/,
  };
  for (const [covState, re] of Object.entries(states)) {
    const v = assessReading({ ...allGood, coverage: { covState } });
    assert.equal(v.rows.coverage.state, 'RED', covState);
    assert.match(v.rows.coverage.reason, re);
  }
});

test('a thrown capture is distinguished from low coverage', () => {
  const v = assessReading({ ...allGood, coverage: { covState: 'CAPTURE_FAILED', captureError: 'target closed' } });
  assert.equal(v.rows.coverage.state, 'RED');
  assert.match(v.rows.coverage.reason, /not the same as low coverage/);
});

test('a BASIS-GUARD-01 refusal fails coverage even when a percentage exists', () => {
  const v = assessReading({ ...allGood,
    coverage: { covState: 'MEASURED', arenaCoveragePct: 99.9, basisGuard: { ok: false, state: 'SCOPE_MISMATCH' } } });
  assert.equal(v.rows.coverage.state, 'RED');
  assert.match(v.rows.coverage.reason, /SCOPE_MISMATCH/);
});

test('an instrument that did not re-detect the known change fails capability', () => {
  const v = assessReading({ ...allGood, capability: { detected: false, what: 'combined canvas reclaim' } });
  assert.equal(v.rows.capabilityProof.state, 'RED');
  assert.match(v.rows.capabilityProof.reason, /cannot be trusted to have seen an unknown one/);
});

test('the failure sidecar is an artifact, and says the caveat is the file', () => {
  const v = assessReading({ ...allGood, coverage: { covState: 'MEASURED', arenaCoveragePct: 60 } });
  const s = failureSidecar(v, { reading: { floorMB: 674.9 } });
  assert.equal(s.sidecar, 'READING-VALIDITY-FAILURE');
  assert.deepEqual(s.redRows, ['coverage']);
  assert.equal(s.reading.floorMB, 674.9);
  assert.match(s.instruction, /Do not restate it with a caveat; the caveat is this/);
});

test('a valid reading produces no sidecar', () => {
  assert.equal(failureSidecar(assessReading(allGood)), null);
});

test('the packet row names every failing row so it can be pasted without editing', () => {
  const v = assessReading({ ...allGood, capability: null, coverage: { covState: 'MEASURED', arenaCoveragePct: 60 } });
  assert.match(v.packetRow, /NOT VALID/);
  assert.match(v.packetRow, /coverage/);
  assert.match(v.packetRow, /capabilityProof/);
  assert.match(v.packetRow, /failure sidecar attached/);
});
