#!/usr/bin/env node
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzeAuthoritativeV8Read,
  runGate01CapabilityProof,
} from './lib/v8-authoritative-analysis.mjs';

const valid = {
  identityLockHeld: true,
  allPhasesCompleted: true,
  sidecarsClean: true,
  cov01CoveragePct: 97.5,
  gate01: { ok: true, state: 'GREEN' },
};

describe('V8 authoritative heap read analysis', () => {
  it('GATE-01 capability proof is green on synthetic plateau/slope/dirty cells', () => {
    const proof = runGate01CapabilityProof();
    assert.equal(proof.ok, true);
    assert.equal(proof.state, 'GREEN');
    assert.equal(proof.cells.plateau.shape, 'PLATEAU');
    assert.equal(proof.cells.slope.shape, 'SLOPE');
    assert.equal(proof.cells.dirty.quotable, false);
  });

  it('classifies B-C floor movement inside the noise band as plateau', () => {
    const samples = Array.from({ length: 30 }, (_, i) => ({
      elapsedMin: i * 3,
      jsHeapUsedMB: i < 5 ? 45 + i * 1.8 : 54 + ((i % 2) ? 0.25 : -0.25),
    }));
    const report = analyzeAuthoritativeV8Read({
      samples,
      floors: [
        { label: 'A', jsHeapUsedMB: 45 },
        { label: 'B', jsHeapUsedMB: 54.1 },
        { label: 'C', jsHeapUsedMB: 54.2 },
      ],
      warmupMin: 15,
      validityInputs: valid,
    });
    assert.equal(report.shape, 'PLATEAU');
    assert.equal(report.quotable, true);
    assert.match(report.verdictLine, /plateau/);
  });

  it('classifies B-C floor movement outside the noise band as slope with CI', () => {
    const samples = Array.from({ length: 30 }, (_, i) => ({
      elapsedMin: i * 3,
      jsHeapUsedMB: 30 + i * 0.6,
    }));
    const report = analyzeAuthoritativeV8Read({
      samples,
      floors: [
        { label: 'A', jsHeapUsedMB: 30 },
        { label: 'B', jsHeapUsedMB: 42 },
        { label: 'C', jsHeapUsedMB: 56 },
      ],
      warmupMin: 15,
      validityInputs: valid,
    });
    assert.equal(report.shape, 'SLOPE');
    assert.equal(report.quotable, true);
    assert.equal(report.fit.ok, true);
    assert.equal(Array.isArray(report.fit.slopeCi95MBPerHour), true);
    assert.match(report.verdictLine, /CI95/);
  });

  it('refuses quotability when COV-01 or GATE-01 is dirty', () => {
    const samples = Array.from({ length: 30 }, (_, i) => ({
      elapsedMin: i * 3,
      jsHeapUsedMB: 20 + i,
    }));
    const report = analyzeAuthoritativeV8Read({
      samples,
      floors: [
        { label: 'A', jsHeapUsedMB: 20 },
        { label: 'B', jsHeapUsedMB: 40 },
        { label: 'C', jsHeapUsedMB: 60 },
      ],
      validityInputs: {
        ...valid,
        cov01CoveragePct: 94.9,
        gate01: { ok: false, state: 'RED' },
      },
    });
    assert.equal(report.shape, 'SLOPE');
    assert.equal(report.quotable, false);
    assert.equal(report.validity.checks.cov01Coverage.ok, false);
    assert.equal(report.validity.checks.gate01CapabilityProof.ok, false);
  });
});
