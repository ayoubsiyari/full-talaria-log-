/**
 * t8-step12-cadence-cost-probe.mjs — D-016 measured cost column (BEFORE baseline).
 * 4-panel same-pair: A/B=1m, C/D=4h, max speed tick play, 8s window.
 * Run: node t8-step12-cadence-cost-probe.mjs
 */

import { startServer } from './serve.mjs';
import {
  launchBrowser,
  bootLayout,
  setSync,
  setIntervalSync,
  panelCmd,
  hostReplayEnter,
  broadcastCmd,
  waitBootSettled,
  waitReplayQuiescent,
  panelFrameMap,
  sleep,
} from './harness-lib.mjs';

const PLAY_MS = 8000;
const SAMPLE_MS = 100;
const MAX_SPEED = 100;

async function replayStartTs(page) {
  return page.evaluate(() => {
    const d = window.chart && window.chart.data;
    if (!Array.isArray(d) || d.length < 10) return null;
    return Number(d[Math.floor(d.length * 0.6)].t);
  }).catch(() => null);
}

async function installFrameProbe(page) {
  return page.evaluate(() => {
    window.__t8FrameProbe = {
      hostFrameMs: [],
      panelFrameMs: { A: [], B: [], C: [], D: [] },
      started: false,
    };
    const probe = window.__t8FrameProbe;
    const hostRs = window.chart && window.chart.replaySystem;
    if (hostRs) {
      const orig = hostRs._multichartBroadcastReplayFrame;
      if (typeof orig === 'function') {
        hostRs._multichartBroadcastReplayFrame = function patchedBroadcast() {
          const t0 = performance.now();
          const r = orig.apply(this, arguments);
          probe.hostFrameMs.push(performance.now() - t0);
          return r;
        };
      }
    }
    probe.started = true;
    return { ok: true };
  });
}

async function readPanelMetrics(page, id) {
  const frame = id === 'A' ? page : panelFrameMap(page)[id];
  if (!frame) return null;
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch) return null;
    const rs = ch.replaySystem;
    const spacing = (typeof ch.getCandleSpacing === 'function')
      ? Number(ch.getCandleSpacing()) : NaN;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio > 0)
      ? window.devicePixelRatio : 1;
    return {
      tf: String(ch.currentTimeframe || ''),
      replayTs: rs && Number.isFinite(rs.replayTimestamp) ? rs.replayTimestamp : null,
      renders: ch._mcDiag ? Number(ch._mcDiag.renders) || 0 : 0,
      followRenders: Number(ch._mcPlayFollowRenders) || 0,
      offsetX: Number(ch.offsetX),
      spacing,
      candleWidth: Number(ch.candleWidth),
      dpr,
      dataLen: Array.isArray(ch.data) ? ch.data.length : 0,
      lastBarT: Array.isArray(ch.data) && ch.data.length
        ? Number(ch.data[ch.data.length - 1].t) : null,
      fastMode: !!(rs && rs.fastMode),
      tickProgress: rs ? Number(rs.tickProgress) || 0 : 0,
      speed: rs ? Number(rs.speed) : null,
      effectiveSpeed: rs && typeof rs.getEffectivePlaybackSpeed === 'function'
        ? rs.getEffectivePlaybackSpeed() : null,
      loopKind: rs && typeof rs.getPlaybackLoopKind === 'function'
        ? rs.getPlaybackLoopKind() : null,
    };
  }).catch(() => null);
}

async function startMaxSpeedTickPlay(page, panelIds) {
  await broadcastCmd(page, 'replayPlay', { speed: MAX_SPEED, mode: 'tick' });
  return page.evaluate((ids, spd) => {
    const ch = window.chart;
    const rs = ch && ch.replaySystem;
    if (!rs || !rs.isActive) return { ok: false, reason: 'host replay not active' };
    if (!window.__multichartGrid) {
      window.__multichartGrid = { getPanelIds: () => ids };
    }
    try {
      rs.setSpeed(spd);
      if (typeof rs.setPlaybackMode === 'function') rs.setPlaybackMode('tick');
      rs.fastMode = false;
      if (typeof rs.play === 'function') rs.play();
      return {
        ok: true,
        playing: !!rs.isPlaying,
        speed: rs.speed,
        effective: rs.getEffectivePlaybackSpeed(),
        mode: rs.getPlaybackMode(),
        loopKind: rs.getPlaybackLoopKind(),
        stepTf: typeof rs.getReplayStepTimeframeForSync === 'function'
          ? rs.getReplayStepTimeframeForSync() : null,
      };
    } catch (e) {
      return { ok: false, reason: String(e && e.message || e) };
    }
  }, panelIds, MAX_SPEED);
}

function pct(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function summarize(samples, ids) {
  const out = {};
  for (const id of ids) {
    const snaps = samples.map((s) => s[id]).filter(Boolean);
    if (!snaps.length) continue;
    const renderDeltas = [];
    const followDeltas = [];
    let prevR = snaps[0].renders;
    let prevF = snaps[0].followRenders;
    for (let i = 1; i < snaps.length; i++) {
      renderDeltas.push(snaps[i].renders - prevR);
      followDeltas.push(snaps[i].followRenders - prevF);
      prevR = snaps[i].renders;
      prevF = snaps[i].followRenders;
    }
    const coarseBarMs = snaps[0].tf === '4h' ? 14_400_000 : 60_000;
    const ts0 = snaps[0].replayTs;
    const tsN = snaps[snaps.length - 1].replayTs;
    const coarseBars = (snaps[0].tf === '4h' && Number.isFinite(ts0) && Number.isFinite(tsN))
      ? Math.max(0.01, (tsN - ts0) / coarseBarMs) : null;
    const renderTotal = snaps[snaps.length - 1].renders - snaps[0].renders;
    const followTotal = snaps[snaps.length - 1].followRenders - snaps[0].followRenders;
    const spacing = snaps[0].spacing;
    const dpr = snaps[0].dpr;
    const off0 = snaps[0].offsetX;
    const offN = snaps[snaps.length - 1].offsetX;
    const pixelColumnsCrossed = (Number.isFinite(off0) && Number.isFinite(offN))
      ? Math.round(Math.abs(offN - off0) * dpr) : null;
    out[id] = {
      tf: snaps[0].tf,
      renderTotal,
      followTotal,
      renderPerCoarseBar: coarseBars ? Number((renderTotal / coarseBars).toFixed(2)) : null,
      followPerCoarseBar: coarseBars ? Number((followTotal / coarseBars).toFixed(2)) : null,
      pixelColumnsCrossed,
      followPerPixelColumn: (pixelColumnsCrossed > 0)
        ? Number((followTotal / pixelColumnsCrossed).toFixed(3)) : null,
      spacing,
      dpr,
      fastModeEnd: snaps[snaps.length - 1].fastMode,
      replayTsDelta: Number.isFinite(tsN) && Number.isFinite(ts0) ? tsN - ts0 : null,
    };
  }
  return out;
}

function projectAfter(summary, playMs) {
  // Faithful AFTER projection per D-016 + H-S19b pixel-column model.
  // Unified min(TF)=1m clock at max tick speed (effective 200): ~3.33 1m bars/sec wall.
  // Coarse 4h forming: viewport follow coalesces to ~1 render/device-pixel-column;
  // forming-candle OHLC patches route through scheduleCoalescedSeek (1 seek/rAF) +
  // same pixel-column gate on maybePanelPlayViewportFollow.
  const coarse = summary.C || summary.D;
  if (!coarse) return null;
  const spacing = coarse.spacing || 8;
  const dpr = coarse.dpr || 1;
  const colsPer4hBar = Math.max(1, Math.round(spacing * dpr));
  const barsPerSec = 3.33 / 240;
  const coarseBarsInWindow = barsPerSec * (playMs / 1000);
  const projectedFollowPerBar = colsPer4hBar;
  const projectedRenderPerBar = colsPer4hBar + 2;
  return {
    model: 'H-S19b pixel-column + scheduleCoalescedSeek (1/rAF)',
    colsPer4hBar,
    coarseBarsInWindow: Number(coarseBarsInWindow.toFixed(3)),
    projectedFollowPer4hBar: projectedFollowPerBar,
    projectedTotalRenderPer4hBar: projectedRenderPerBar,
    projectedFollowTotal4h: Math.ceil(coarseBarsInWindow * projectedFollowPerBar),
    note: 'NOT 240× tick renders; sub-pixel 1m ticks stay in same device-pixel column',
  };
}

async function main() {
  const srv = await startServer();
  const browser = await launchBrowser({ headful: false });
  const boot = await bootLayout(browser, srv, { pair: 'same', panels: 4, tf: '1m' });
  const { page } = boot;
  const ids = ['A', 'B', 'C', 'D'];
  try {
    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(500);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 25_000, boot.getInFlightDataRequests);

    const ts0 = await replayStartTs(page);
    if (ts0 == null) throw new Error('no replay ts');
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 20_000);
    if (!entered.ok) throw new Error(`replay quiescent failed: ${entered.detail}`);

    await panelCmd(page, 'C', 'setTimeframe', { tf: '4h' }).catch(() => {});
    await panelCmd(page, 'D', 'setTimeframe', { tf: '4h' }).catch(() => {});
    await sleep(1800);

    await installFrameProbe(page);
    const playStart = await startMaxSpeedTickPlay(page, ids);
    const samples = [];
    const t0 = Date.now();
    while (Date.now() - t0 < PLAY_MS) {
      await sleep(SAMPLE_MS);
      const snap = { t: Date.now() - t0 };
      for (const id of ids) snap[id] = await readPanelMetrics(page, id);
      samples.push(snap);
    }
    await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      if (rs && typeof rs.pause === 'function') rs.pause();
    });

    const frameProbe = await page.evaluate(() => {
      const p = window.__t8FrameProbe;
      if (!p) return null;
      const sorted = (p.hostFrameMs || []).slice().sort((a, b) => a - b);
      const pick = (arr, frac) => (arr.length
        ? arr[Math.min(arr.length - 1, Math.floor(arr.length * frac))]
        : null);
      return {
        hostBroadcastSamples: sorted.length,
        hostMedianMs: pick(sorted, 0.5),
        hostP95Ms: pick(sorted, 0.95),
        hostMaxMs: sorted.length ? sorted[sorted.length - 1] : null,
      };
    });

    const summary = summarize(samples, ids);
    const after = projectAfter(summary, PLAY_MS);
    const parity = samples.length
      ? ids.every((id) => {
        const last = samples[samples.length - 1][id];
        const a = samples[samples.length - 1].A;
        return last && a && last.replayTs === a.replayTs;
      })
      : false;

    const budgetOk = frameProbe && frameProbe.hostP95Ms != null
      && frameProbe.hostP95Ms < 33
      && (summary.C?.followPerCoarseBar == null || summary.C.followPerCoarseBar < 500);

    console.log(JSON.stringify({
      probe: 'T8-step12-cadence-cost',
      playMs: PLAY_MS,
      maxSpeed: MAX_SPEED,
      playStart,
      parityTsMatch: parity,
      frameProbe,
      before: summary,
      afterProjection: after,
      verdict: budgetOk ? 'WITHIN_FRAME_BUDGET' : 'NEEDS_DIRECTOR_REVIEW',
      budget: { frameBudgetMs: 16.67, p95HeadroomMs: 33 },
    }, null, 2));
  } finally {
    await boot.close();
    await browser.close();
    srv.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
