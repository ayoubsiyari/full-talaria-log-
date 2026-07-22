/**
 * L3-M10 Failure A — runtime P&L hub must tick on replayFrame (Play),
 * not only on replayTick (pause/scrub).
 *
 * GREEN:
 *   node --test "chart v 1.4/chart/modules/m10-runtime-pnl-replay-frame.test.mjs"
 *
 * RED-again:
 *   TALARIA_DISABLE_ORDER_MC_PNL_REPLAY_FRAME_HUB_V1=1 node --test ...
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.resolve(__dirname, '../multichart-prod/panel-cmd-bridge.js');
const GRID = path.resolve(__dirname, '../../talaria-design/src/MultichartGrid.jsx');
const KILL = process.env.TALARIA_DISABLE_ORDER_MC_PNL_REPLAY_FRAME_HUB_V1 === '1';

function extractCase(src, caseName) {
  const start = src.indexOf(`case '${caseName}'`);
  assert.ok(start >= 0, `missing case ${caseName}`);
  const next = src.indexOf('case \'', start + 6);
  return src.slice(start, next > 0 ? next : start + 2500);
}

test('panel-cmd-bridge posts order-pnl-tick from replayFrame while playing', () => {
  const bridge = fs.readFileSync(BRIDGE, 'utf8');
  const tickCase = extractCase(bridge, 'replayTick');
  const frameCase = extractCase(bridge, 'replayFrame');
  assert.match(tickCase, /postOrderPnlTick|order-pnl-tick/);
  assert.match(bridge, /orderMcPnlReplayFrameHubV1EnabledBridge/);
  assert.match(bridge, /__TALARIA_DISABLE_ORDER_MC_PNL_REPLAY_FRAME_HUB_V1/);
  if (KILL) {
    // Kill-switch discriminator present; runtime gate returns false when set.
    assert.match(bridge, /DISABLE_ORDER_MC_PNL_REPLAY_FRAME_HUB_V1 === true\) return false/);
  } else {
    assert.match(frameCase, /postOrderPnlTick|order-pnl-tick/);
    assert.match(frameCase, /isPlaying/);
  }
});

test('MultichartGrid fans runtimeOnly on replayFrame Play flush', () => {
  const grid = fs.readFileSync(GRID, 'utf8');
  assert.match(grid, /orderMcPnlReplayFrameHubV1Enabled/);
  assert.match(grid, /__multichartScheduleHostPnlFanout/);
  assert.match(grid, /flushCoalescedReplayFrame/);
  // Frame flush must schedule fanout when isPlaying.
  const idx = grid.indexOf('flushCoalescedReplayFrame');
  assert.ok(idx >= 0);
  const body = grid.slice(idx, idx + 1800);
  if (KILL) {
    assert.match(grid, /__TALARIA_DISABLE_ORDER_MC_PNL_REPLAY_FRAME_HUB_V1/);
  } else {
    assert.match(body, /isPlaying/);
    assert.match(body, /__multichartScheduleHostPnlFanout/);
    assert.match(body, /runtimeOnly/);
  }
});
