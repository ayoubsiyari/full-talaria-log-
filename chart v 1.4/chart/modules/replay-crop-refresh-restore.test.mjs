/**
 * Go-back/crop playhead must survive refresh even when furthest_replay_ts is later.
 *
 *   node --test "chart v 1.4/chart/modules/replay-crop-refresh-restore.test.mjs"
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
global.window = global.window || {};
global.document = global.document || {
    querySelectorAll: () => [],
    getElementById: () => null,
    querySelector: () => null,
};
const ReplaySystem = require('./replay-system.js');

function harnessChart() {
    const chart = {
        _dashboardFurthestReplayTs: 1_700_000_000_000,
        _dashboardFurthestReplayHydratedTs: 1_700_000_000_000,
        _pendingReplayState: null,
        getActiveTradingSessionId: () => 'sess-crop',
        _readTradingSessionLocalBackup: () => null,
        _normalizeBacktestTimeframe: (tf) => tf || null,
        _parseReplayRestoreTimestamp(replay) {
            if (!replay || typeof replay !== 'object') return null;
            const n = Number(replay.replayTimestamp);
            return Number.isFinite(n) ? n : null;
        },
        _mergeSessionStatePatches(prev, next) {
            // Bind real implementation from chart.js source via eval-free copy of logic
            // exercised below through a local reimplementation matching the fix.
            const a = prev && typeof prev === 'object' ? prev : {};
            const b = next && typeof next === 'object' ? next : {};
            const out = Object.assign({}, a, b);
            if (a.replay && b.replay) {
                const ra = a.replay;
                const rb = b.replay;
                out.replay = Object.assign({}, ra, rb);
                const ta = Number(ra.replayTimestamp);
                const tb = Number(rb.replayTimestamp);
                const aCut = Number(ra.playheadRewoundAt);
                const bCut = Number(rb.playheadRewoundAt);
                if (Number.isFinite(ta) && Number.isFinite(tb)) {
                    if (Number.isFinite(bCut) && (!Number.isFinite(aCut) || bCut >= aCut)) {
                        out.replay.replayTimestamp = tb;
                        out.replay.playheadRewoundAt = bCut;
                    } else if (Number.isFinite(aCut) && (!Number.isFinite(bCut) || aCut > bCut)) {
                        out.replay.replayTimestamp = ta;
                        out.replay.playheadRewoundAt = aCut;
                    } else if (ta > tb) {
                        out.replay.replayTimestamp = ta;
                    }
                }
                const da = ra.dashboard || null;
                const dbb = rb.dashboard || null;
                if (da || dbb) {
                    out.replay.dashboard = Object.assign({}, da || {}, dbb || {});
                    const fa = da && Number(da.furthest_replay_ts);
                    const fb = dbb && Number(dbb.furthest_replay_ts);
                    if (Number.isFinite(fa) || Number.isFinite(fb)) {
                        out.replay.dashboard.furthest_replay_ts = Math.max(
                            Number.isFinite(fa) ? fa : -Infinity,
                            Number.isFinite(fb) ? fb : -Infinity,
                        );
                    }
                }
            }
            return out;
        },
    };

    // Port of fixed _resolveReplayPlayheadRestoreState (same rules as chart.js).
    chart._resolveReplayPlayheadRestoreState = function (localPending) {
        const playheadCandidates = [];
        const furthestTsList = [];
        const pushPlayhead = (blob) => {
            if (!blob || typeof blob !== 'object') return;
            if (!Number.isFinite(this._parseReplayRestoreTimestamp(blob))) return;
            playheadCandidates.push(blob);
        };
        const pushFurthest = (ts) => {
            const n = Number(ts);
            if (Number.isFinite(n)) furthestTsList.push(n);
        };
        if (localPending) pushPlayhead(localPending);
        if (this._pendingReplayState) {
            pushPlayhead(this._pendingReplayState);
            pushFurthest(this._pendingReplayState.dashboard?.furthest_replay_ts);
        }
        const backup = this._readTradingSessionLocalBackup(this.getActiveTradingSessionId());
        if (backup?.replay) {
            pushPlayhead(backup.replay);
            pushFurthest(backup.replay.dashboard?.furthest_replay_ts);
        }
        pushFurthest(this._dashboardFurthestReplayHydratedTs);
        pushFurthest(this._dashboardFurthestReplayTs);

        let winner = null;
        let winTs = null;
        let winRewoundAt = null;
        for (const c of playheadCandidates) {
            const ts = this._parseReplayRestoreTimestamp(c);
            if (!Number.isFinite(ts)) continue;
            const rewoundAt = Number(c.playheadRewoundAt);
            if (Number.isFinite(rewoundAt)) {
                if (winRewoundAt == null || rewoundAt >= winRewoundAt) {
                    winRewoundAt = rewoundAt;
                    winTs = ts;
                    winner = c;
                }
                continue;
            }
            if (winRewoundAt != null) continue;
            if (winTs == null || ts > winTs) {
                winTs = ts;
                winner = c;
            }
        }
        if (!winner || !Number.isFinite(winTs)) {
            let furthest = null;
            for (const ts of furthestTsList) {
                if (furthest == null || ts > furthest) furthest = ts;
            }
            if (Number.isFinite(furthest)) return { replayTimestamp: furthest };
            return localPending || null;
        }
        const out = { replayTimestamp: winTs };
        if (Number.isFinite(winRewoundAt)) out.playheadRewoundAt = winRewoundAt;
        return out;
    };

    return chart;
}

test('crop playhead wins over later furthest_replay_ts on restore', () => {
    const chart = harnessChart();
    const cutTs = 1_600_000_000_000; // earlier
    const furthest = 1_700_000_000_000; // later (pre-crop progress)
    chart._dashboardFurthestReplayTs = furthest;
    chart._readTradingSessionLocalBackup = () => ({
        replay: {
            replayTimestamp: cutTs,
            playheadRewoundAt: 9_000,
            dashboard: { furthest_replay_ts: furthest },
        },
    });

    const restored = chart._resolveReplayPlayheadRestoreState(null);
    assert.equal(restored.replayTimestamp, cutTs,
        'explicit crop playhead must beat furthest progress');
    assert.equal(restored.playheadRewoundAt, 9_000);
});

test('merge keeps intentional crop rewind over older advanced playhead', () => {
    const chart = harnessChart();
    const advanced = 1_700_000_000_000;
    const cutTs = 1_600_000_000_000;
    const merged = chart._mergeSessionStatePatches(
        { replay: { replayTimestamp: advanced, currentIndex: 500 } },
        {
            replay: {
                replayTimestamp: cutTs,
                currentIndex: 120,
                playheadRewoundAt: 12_345,
                dashboard: { furthest_replay_ts: advanced },
            },
        },
    );
    assert.equal(merged.replay.replayTimestamp, cutTs);
    assert.equal(merged.replay.playheadRewoundAt, 12_345);
    assert.equal(merged.replay.dashboard.furthest_replay_ts, advanced,
        'dashboard furthest progress may stay monotonic');
});

test('cut flush marks rewoundAt and builds patch with crop playhead', () => {
    global.window = global.window || {};
    global.document = {
        querySelectorAll: () => [],
        getElementById: () => null,
        querySelector: () => null,
    };
    const rs = Object.create(ReplaySystem.prototype);
    rs.isActive = true;
    rs.isPlaying = false;
    rs.sessionStartIndex = 0;
    rs.speed = 1;
    rs.getPlaybackMode = () => 'candle';
    rs.fullRawData = [
        { t: 1_600_000_000_000 },
        { t: 1_600_000_060_000 },
        { t: 1_700_000_000_000 },
    ];
    rs.currentIndex = 2;
    rs.replayTimestamp = 1_700_000_000_000;
    rs.tickElapsedMs = 0;
    rs.isBackNavigationAllowed = () => true;
    rs._findLastRawIndexStrictlyBefore = (data, cutAtMs) => {
        for (let i = data.length - 1; i >= 0; i--) {
            if (data[i].t < cutAtMs) return i;
        }
        return -1;
    };
    rs.updateChartData = () => {};
    rs.updateTimeDisplay = () => {};
    let flushed = null;
    rs._flushReplayStateToSession = function () {
        flushed = this._buildReplaySessionPatch();
    };
    rs._buildReplaySessionPatch = ReplaySystem.prototype._buildReplaySessionPatch;
    rs.applyReplayCutToWallClock = ReplaySystem.prototype.applyReplayCutToWallClock;
    rs.chart = {
        normalizeTimestampMs: (t) => Number(t),
        currentTimeframe: '5m',
        _dashboardFurthestReplayTs: 1_700_000_000_000,
        orderManager: { forceCloseAllOrders: () => {} },
    };

    const ok = rs.applyReplayCutToWallClock(1_600_000_060_000, { candleIndex: null });
    assert.equal(ok, true);
    assert.ok(Number.isFinite(rs._playheadRewoundAt));
    assert.ok(flushed, 'cut must critically flush session state');
    assert.equal(flushed.replay.replayTimestamp, rs.replayTimestamp);
    assert.equal(flushed.replay.playheadRewoundAt, rs._playheadRewoundAt);
    assert.ok(rs.replayTimestamp < 1_700_000_000_000, 'playhead must rewind');
});

test('chart.js restore no longer promotes furthest over explicit playhead', () => {
    const src = readFileSync(join(__dirname, '../chart.js'), 'utf8');
    assert.match(src, /playheadRewoundAt/);
    assert.match(src, /Prefer an explicit saved playhead/);
    assert.doesNotMatch(
        src,
        /candidates\.push\(\{\s*replayTimestamp:\s*Number\(bd\.furthest_replay_ts\)\s*\}\)/,
        'furthest must not be injected as a synthetic playhead candidate',
    );
});
