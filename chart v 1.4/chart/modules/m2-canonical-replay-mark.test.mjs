/**
 * L2-M2 / TAL-01798 — cross-timeframe current-price divergence.
 *
 * Same symbol + same replay timestamp: 1m and 15m panels must share one
 * canonical market mark for current-price labels / forming close, while
 * completed coarse OHLC aggregation remains intact.
 *
 * GREEN (default):
 *   node --test "chart v 1.4/chart/modules/m2-canonical-replay-mark.test.mjs"
 *
 * RED-again (kill-switch):
 *   TALARIA_MC_DISABLE_CANONICAL_REPLAY_MARK_V1=1 node --test \
 *     "chart v 1.4/chart/modules/m2-canonical-replay-mark.test.mjs"
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const KILL = process.env.TALARIA_MC_DISABLE_CANONICAL_REPLAY_MARK_V1 === '1';

function installWindow() {
  global.window = KILL
    ? { __TALARIA_MC_DISABLE_CANONICAL_REPLAY_MARK_V1: true }
    : {};
}

installWindow();
const ReplaySystem = require('./replay-system.js');

function makeSeries() {
  // 1m bars spanning one 15m bucket. Mid-bucket playhead must NOT use the
  // completed 15m close (1.37365) as the live mark.
  const t0 = 1_700_000_000_000;
  const bars = [];
  for (let i = 0; i < 15; i++) {
    const c = 1.37300 + i * 0.00001;
    bars.push({
      t: t0 + i * 60_000,
      o: c,
      h: c + 0.00005,
      l: c - 0.00005,
      c,
      v: 1,
    });
  }
  return { t0, bars, hostMark: bars[8].c, completed15mClose: 1.37365 };
}

function hostReplay(bars, markIdx) {
  const chart = {
    currentFileId: 'file-gbpusd',
    currentSymbol: 'GBPUSD',
    currentTimeframe: '1m',
    data: bars.slice(0, markIdx + 1).map((b) => ({ ...b })),
    rawData: bars.slice(0, markIdx + 1).map((b) => ({ ...b })),
    offsetX: 0,
  };
  const rs = Object.create(ReplaySystem.prototype);
  rs.chart = chart;
  rs.isActive = true;
  rs.isPlaying = true;
  rs.playbackMode = 'candle';
  rs.getPlaybackMode = () => 'candle';
  rs.fastMode = false;
  rs.fullRawData = bars;
  rs.currentIndex = markIdx;
  rs.replayTimestamp = bars[markIdx].t;
  rs.tickProgress = 0;
  rs.tickElapsedMs = 0;
  rs.animatingCandle = null;
  rs.autoScrollEnabled = true;
  rs.userHasPanned = false;
  rs.ticksPerCandle = 72;
  rs.currentTicksPerCandle = 72;
  rs.getCurrentAnimatedPrice = () => bars[markIdx].c;
  chart.replaySystem = rs;
  return { chart, rs };
}

function coarsePanel(completedClose, fileId = 'file-gbpusd') {
  const chart = {
    currentFileId: fileId,
    currentSymbol: fileId === 'file-gbpusd' ? 'GBPUSD' : 'EURUSD',
    currentTimeframe: '15m',
    _panelFullRawData: [{ t: 1, o: 1, h: 1, l: 1, c: 1 }],
    data: [{
      t: 1_700_000_000_000,
      o: 1.37300,
      h: 1.37400,
      l: 1.37200,
      c: completedClose, // legacy seek lands on completed 15m close
    }],
    rawData: [],
    resolveEffectiveCurrentPrice(visible) {
      // Mirror chart.js preference order for this gate.
      const canonicalMarkEnabled = typeof window === 'undefined'
        || !window.__TALARIA_MC_DISABLE_CANONICAL_REPLAY_MARK_V1;
      if (canonicalMarkEnabled && Number.isFinite(Number(this._mcCanonicalReplayMark))) {
        return Number(this._mcCanonicalReplayMark);
      }
      if (this.data && this.data.length && Number.isFinite(this.data[this.data.length - 1].c)) {
        return this.data[this.data.length - 1].c;
      }
      return null;
    },
  };
  const rs = Object.create(ReplaySystem.prototype);
  rs.chart = chart;
  rs.isActive = true;
  rs.isPlaying = true;
  rs.animatingCandle = null;
  chart.replaySystem = rs;
  return { chart, rs };
}

test('candle-mode replayFrame publishes canonicalMark (not only tick animatedCandle)', () => {
  installWindow();
  const { bars, hostMark } = makeSeries();
  const { rs } = hostReplay(bars, 8);
  const detail = rs._buildMultichartReplayFrameDetail();
  assert.equal(detail.animatedCandle, undefined, 'candle mode has no animatedCandle');
  if (KILL) {
    assert.equal(detail.canonicalMark, undefined, 'kill-switch omits canonicalMark');
  } else {
    assert.equal(detail.canonicalMark, hostMark, 'host market mark is published');
  }
});

test('same-symbol coarse panel forming close + label match host mark', () => {
  installWindow();
  const { bars, hostMark, completed15mClose } = makeSeries();
  const { rs: hostRs } = hostReplay(bars, 8);
  const detail = hostRs._buildMultichartReplayFrameDetail();
  const { chart: panelB, rs: panelRs } = coarsePanel(completed15mClose);

  // Premise: before apply, labels diverge (completed 15m close vs host 1m mark).
  assert.equal(panelB.resolveEffectiveCurrentPrice(panelB.data), completed15mClose);
  assert.notEqual(completed15mClose, hostMark);

  panelRs._applyCanonicalReplayMarkFromDetail(detail);

  if (KILL) {
    assert.equal(
      panelB.resolveEffectiveCurrentPrice(panelB.data),
      completed15mClose,
      'kill-switch reproduces TAL-01798 price divergence',
    );
    assert.equal(panelB.data[0].c, completed15mClose);
  } else {
    assert.equal(panelB.data[0].c, hostMark, 'forming close stamped to host mark');
    assert.equal(
      panelB.resolveEffectiveCurrentPrice(panelB.data),
      hostMark,
      'current-price label matches host',
    );
    // Completed coarse geometry retained except forming close/high/low patch.
    assert.equal(panelB.data[0].o, 1.37300);
    assert.ok(panelB.data[0].h >= hostMark);
    assert.ok(panelB.data[0].l <= hostMark);
  }
});

test('different-symbol panel stays independent of host mark', () => {
  installWindow();
  const { bars, hostMark, completed15mClose } = makeSeries();
  const { rs: hostRs } = hostReplay(bars, 8);
  const detail = hostRs._buildMultichartReplayFrameDetail();
  const { chart: panelX, rs: panelRs } = coarsePanel(completed15mClose, 'file-eurusd');
  panelRs._applyCanonicalReplayMarkFromDetail(detail);
  assert.equal(panelX.data[0].c, completed15mClose, 'foreign symbol close untouched');
  assert.equal(panelX._mcCanonicalReplayMark, null);
  void hostMark;
});

test('three stable repetitions: host/panel marks match when fix ON', () => {
  installWindow();
  if (KILL) {
    assert.ok(true, 'skip stability under kill-switch');
    return;
  }
  const { bars, hostMark, completed15mClose } = makeSeries();
  for (let i = 0; i < 3; i++) {
    const { rs: hostRs } = hostReplay(bars, 8);
    const detail = hostRs._buildMultichartReplayFrameDetail();
    const { chart: panelB, rs: panelRs } = coarsePanel(completed15mClose);
    panelRs._applyCanonicalReplayMarkFromDetail(detail);
    assert.equal(panelB.resolveEffectiveCurrentPrice(panelB.data), hostMark, `rep ${i + 1}`);
  }
});
