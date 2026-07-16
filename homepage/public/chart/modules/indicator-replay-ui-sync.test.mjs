import assert from 'node:assert/strict';
import {
    rc6IndicatorReplayUiSyncV2Enabled,
    resolveReplayPlayheadBarIndex,
    pinReplayLegendHoverToPlayhead,
    shouldSyncReplayLegendAfterRecalc,
    seriesValueAtBarForLegend,
    formatLegendNumericToken,
    legendTokenMatchesSeriesAtBar,
} from './indicator-replay-ui-sync.mjs';

const disableReplayUiSync = process.env.TALARIA_TEST_DISABLE_RC6_INDICATOR_REPLAY_UI_SYNC_V2 === '1';

const scopeOn = { __TALARIA_RC6_INDICATOR_REPLAY_UI_SYNC_V2: !disableReplayUiSync };
const scopeOff = { __TALARIA_RC6_INDICATOR_REPLAY_UI_SYNC_V2: false };

assert.equal(rc6IndicatorReplayUiSyncV2Enabled(scopeOn), !disableReplayUiSync);
assert.equal(rc6IndicatorReplayUiSyncV2Enabled(scopeOff), false);
assert.equal(rc6IndicatorReplayUiSyncV2Enabled({}), true, 'default ON when unset');

const chartReplay = {
    data: [1, 2, 3, 4, 5],
    hoverIndex: 0,
    replaySystem: { isActive: true, isPlaying: true },
};
assert.equal(resolveReplayPlayheadBarIndex(chartReplay), 4);

const chartLive = { data: [1, 2, 3], replaySystem: null };
assert.equal(resolveReplayPlayheadBarIndex(chartLive), -1);

if (disableReplayUiSync) {
    assert.equal(pinReplayLegendHoverToPlayhead(chartReplay, scopeOff), false, 'switch OFF: no hover pin');
    assert.equal(shouldSyncReplayLegendAfterRecalc(chartReplay, scopeOff), false, 'switch OFF: skip post-recalc sync');
} else {
    assert.equal(pinReplayLegendHoverToPlayhead(chartReplay, scopeOn), true);
    assert.equal(chartReplay.hoverIndex, 4);
    assert.equal(shouldSyncReplayLegendAfterRecalc(chartReplay, scopeOn), true);
}

const series = [10, 11, 12.5, 13, 14.25];
const barIdx = 4;
const val = seriesValueAtBarForLegend(series, barIdx, 0);
assert.equal(val, 14.25);
const token = formatLegendNumericToken(val, 2);
assert.equal(token, '14.25');
assert.equal(legendTokenMatchesSeriesAtBar(token, val, 2), true);
assert.equal(legendTokenMatchesSeriesAtBar('14.250', val, 2), false);

const offsetVal = seriesValueAtBarForLegend(series, barIdx, 1);
assert.equal(offsetVal, 13);

console.log(disableReplayUiSync
    ? 'GREEN — replay UI sync helpers present; switch-OFF skips pin/sync (RED-again)'
    : 'GREEN — replay playhead pin + legend token parity helpers passed');
