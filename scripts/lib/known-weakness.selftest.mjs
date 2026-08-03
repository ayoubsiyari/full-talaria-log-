import test from 'node:test';
import assert from 'node:assert/strict';
import { assessHeadline, collectWeaknesses, withWeaknessGate, MIN_DISPOSITION_CHARS } from './known-weakness.mjs';

/** The real thing, at the real depth: W90 carried this four levels down and nobody read it. */
const W90 = {
  packet: 'W90',
  instrument: {
    signature: 'PROCESS-MEMORY-CENSUS-V1',
    knownWeakness: 'memory-infra allocator roots can overlap, because I summed `size` rather than '
      + '`effective_size`. Renderer roots sum to 310.9 MB against 311.21 MB private (clean), but GPU '
      + 'roots sum to 206 MB against 156 MB private.',
  },
  headline: 'JS heap is 21% of the renderer',
};

test('a weakness four levels deep is found, because that is where the real one was', () => {
  const found = collectWeaknesses(W90);
  assert.equal(found.length, 1);
  assert.equal(found[0].at, 'instrument.knownWeakness');
});

test('RED — the W90 failure: a headline published over an undispositioned weakness is refused', () => {
  const v = assessHeadline({ headline: 'the 59.84% coverage reading', rung: W90, dispositions: [] });
  assert.equal(v.state, 'WEAKNESS_UNADDRESSED');
  assert.equal(v.publishable, false, 'this is exactly what was allowed to happen for weeks');
  assert.match(v.reason, /instrument\.knownWeakness/);
});

test('a written disposition naming the weakness unblocks it', () => {
  const v = assessHeadline({
    headline: 'the corrected all-process coverage',
    rung: W90,
    dispositions: [{
      weakness: 'summed `size` rather than `effective_size`',
      disposition: 'addressed',
      by: 'C',
      text: 'DETAILED-DUMP-CAPTURE-V1 sums effective_size and flags any process that lacks it; overshoot '
        + 'past the total is its own OVERLAP_SUSPECTED state rather than a passing grade.',
    }],
  });
  assert.equal(v.state, 'WEAKNESS_DISPOSITIONED');
  assert.equal(v.publishable, true);
  assert.equal(v.addressed.length, 1);
});

test('a dismissal is allowed — the gate demands a decision, not a fix', () => {
  const v = assessHeadline({
    headline: 'a GPU ranking',
    rung: W90,
    dispositions: [{
      weakness: 'GPU roots sum to 206 MB against 156 MB private',
      disposition: 'dismissed',
      text: 'This headline ranks GPU arenas rather than decomposing them additively, so root overlap '
        + 'changes no ordering and the figure is not quoted as a sum.',
    }],
  });
  assert.equal(v.publishable, true);
  assert.equal(v.state, 'WEAKNESS_DISPOSITIONED');
});

test('a one-word disposition is a gesture and does not unblock', () => {
  const v = assessHeadline({
    rung: W90,
    dispositions: [{ weakness: 'effective_size', disposition: 'dismissed', text: 'noted' }],
  });
  assert.equal(v.state, 'DISPOSITION_HOLLOW');
  assert.equal(v.publishable, false, `under ${MIN_DISPOSITION_CHARS} chars is signing the form, not reading it`);
});

test('a disposition against a weakness that is not there cannot launder one that is', () => {
  const v = assessHeadline({
    rung: W90,
    dispositions: [{
      weakness: 'some other caveat entirely',
      disposition: 'addressed',
      text: 'A long and entirely sincere paragraph about a completely different problem that happens to be lengthy.',
    }],
  });
  assert.equal(v.state, 'WEAKNESS_UNADDRESSED', 'a generic sign-off must not cover the field');
});

test('an unknown disposition verb is not a disposition', () => {
  const v = assessHeadline({
    rung: W90,
    dispositions: [{ weakness: 'effective_size', disposition: 'considered',
      text: 'We thought about this at some length and formed a view that we did not write down here.' }],
  });
  assert.equal(v.publishable, false);
});

test('a clean rung publishes without ceremony — the gate must not tax honest work', () => {
  const v = assessHeadline({ headline: 'a clean floor', rung: { floorMB: 674.9 } });
  assert.equal(v.state, 'NO_WEAKNESS');
  assert.equal(v.publishable, true);
});

test('multiple weaknesses need one disposition each, not one between them', () => {
  const two = { a: { knownWeakness: 'the first specific problem with the dump basis' },
    b: { knownWeakness: 'the second unrelated problem with the settle time' } };
  const v = assessHeadline({ rung: two, dispositions: [{ weakness: 'the first specific problem',
    disposition: 'addressed', text: 'Fixed by summing across every process against the same all-process total.' }] });
  assert.equal(v.state, 'WEAKNESS_UNADDRESSED');
  assert.equal(v.unaddressed.length, 1);
});

test('withWeaknessGate stamps the artifact so the refusal travels with it', () => {
  const stamped = withWeaknessGate(W90, { headline: 'coverage' });
  assert.equal(stamped.headlinePublishable, false);
  assert.equal(stamped.knownWeaknessGate.state, 'WEAKNESS_UNADDRESSED');
});
