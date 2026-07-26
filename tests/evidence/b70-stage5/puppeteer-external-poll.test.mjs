import assert from 'node:assert/strict';
import test from 'node:test';
import { ExternalPollTimeoutError, pollExternally } from './puppeteer-external-poll.mjs';

test('accepts externally committed state when in-page timers are frozen', async () => {
  let calls = 0;
  const result = await pollExternally({
    evaluate: async () => {
      calls++;
      return {
        heartbeat: 0,
        committed: calls >= 3,
        generationFresh: calls >= 3,
      };
    },
    isTerminal: (value) => value.committed && value.generationFresh,
    timeoutMs: 100,
    intervalMs: 0,
    sleep: async () => {},
  });
  assert.equal(result.terminal, true);
  assert.equal(result.value.heartbeat, 0);
  assert.equal(result.observations.length, 3);
});

test('rejects a true externally observed deadlock', async () => {
  let clock = 0;
  await assert.rejects(
    pollExternally({
      evaluate: async () => ({ committed: false, generationFresh: false }),
      isTerminal: (value) => value.committed && value.generationFresh,
      timeoutMs: 5,
      intervalMs: 1,
      now: () => clock,
      sleep: async () => { clock++; },
    }),
    (error) => error instanceof ExternalPollTimeoutError
      && error.observations.length === 5
  );
});

test('records execution-context destruction while polling', async () => {
  let clock = 0;
  await assert.rejects(
    pollExternally({
      evaluate: async () => {
        throw new Error('Execution context was destroyed, most likely because of a navigation');
      },
      isTerminal: () => false,
      timeoutMs: 2,
      intervalMs: 1,
      now: () => clock,
      sleep: async () => { clock++; },
    }),
    (error) => error instanceof ExternalPollTimeoutError
      && error.observations.every((row) => /Execution context/.test(row.error))
  );
});
