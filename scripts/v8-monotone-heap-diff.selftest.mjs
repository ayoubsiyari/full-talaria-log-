/**
 * Self-test for V8 playback heap-diff heartbeat stall handling.
 * No browser, no network.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { waitWithHeartbeats } from './v8-monotone-heap-diff.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const never = () => new Promise(() => {});

async function oldUnboundedHeartbeatReadback({ keepAlive }) {
  await sleep(1);
  await keepAlive();
  return 'settled';
}

describe('V8 playback heartbeat readback stall handling', () => {
  it('reproduces old unbounded readback parking on a hanging keepalive', async () => {
    const outcome = await Promise.race([
      oldUnboundedHeartbeatReadback({ keepAlive: never }).then(() => 'settled'),
      sleep(50).then(() => 'parked'),
    ]);
    assert.equal(outcome, 'parked');
  });

  it('bounded heartbeat emits a named state instead of parking', async () => {
    const report = { heartbeats: [] };
    let saves = 0;
    await waitWithHeartbeats(5, report, {}, 'SELFTEST', {
      sleepFn: sleep,
      keepAlive: never,
      readPlayhead: async () => [{ realm: 'selftest' }],
      saveReport: () => { saves += 1; },
      heartbeatEveryMs: 1,
      keepTimeoutMs: 20,
      playheadTimeoutMs: 20,
    });

    assert.equal(saves > 0, true);
    assert.equal(report.heartbeats.length > 0, true);
    assert.equal(report.heartbeats[0].state, 'HEARTBEAT_KEEPALIVE_TIMEOUT');
    assert.equal(report.heartbeats[0].keepPlaying.phase, 'heartbeat.keepConf01Playing');
  });
});
