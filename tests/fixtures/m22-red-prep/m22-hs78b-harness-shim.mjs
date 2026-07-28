/**
 * M22 / H-S78B — harness read/gesture shim (imports harness-lib only; no scenarios.mjs).
 * RED-PREP-ONLY-M21-1-LOCKED
 */
import {
  M22_HS78B_PAN_COMMIT_THRESHOLD_CSS_PX,
  M22_HS78B_SCENARIO,
  followSlackPx,
} from './m22-hs78b-play-pan-optout-contract.mjs';

export async function replayStartTs(page) {
  return page
    .evaluate(() => {
      const d = window.chart && window.chart.data;
      if (!Array.isArray(d) || d.length < 10) return null;
      return Number(d[Math.floor(d.length * 0.6)].t);
    })
    .catch(() => null);
}

export async function setHostReplayPlaying(page, playing) {
  return page.evaluate((p) => {
    const rs = window.chart && window.chart.replaySystem;
    if (!rs || !rs.isActive) return false;
    rs.isPlaying = !!p;
    return rs.isPlaying;
  }, !!playing).catch(() => false);
}

export async function streamPlayFramesNoDrag(page, startTs, frames, stepMs, opts = {}) {
  const { perFrameMs = 18 } = opts;
  const { hostReplaySeek, broadcastCmd } = opts.lib;
  await setHostReplayPlaying(page, true);
  let ts = startTs;
  for (let i = 0; i < frames; i += 1) {
    ts += stepMs;
    await hostReplaySeek(page, ts);
    await broadcastCmd(page, 'replayFrame', { timestamp: ts, isPlaying: true });
    await sleepMs(perFrameMs);
  }
  return ts;
}

export function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Panel follow snapshot (mirrors scenarios.mjs readPanelFollow — read-only evaluate). */
export async function readPanelFollow(page, id, panelFrameMap) {
  const frame = id === 'A' ? page : panelFrameMap(page)[id];
  if (!frame) return null;
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch) return null;
    const rs = ch.replaySystem || null;
    const data = Array.isArray(ch.data) ? ch.data : [];
    const spacing = (typeof ch.getCandleSpacing === 'function')
      ? ch.getCandleSpacing()
      : (Number(ch.candleWidth) + (Number(ch.candleGap) || 2));
    const m = ch.margin || { l: 0, r: 70 };
    let effectiveW = Number(ch.w) || 0;
    if (effectiveW < 80) {
      try {
        const el = ch.canvas && ch.canvas.parentElement;
        const rw = el ? el.getBoundingClientRect().width : 0;
        if (Number.isFinite(rw) && rw >= 80) effectiveW = rw;
      } catch (_) { /* ignore */ }
    }
    if (effectiveW < 80) effectiveW = 320;
    const plotW = Math.max(1, effectiveW - (m.l || 0) - (m.r || 0));
    const offsetX = Number(ch.offsetX);
    let targetOffsetX = null;
    try {
      if (rs && typeof rs.getReplayAutoScrollState === 'function') {
        const st = rs.getReplayAutoScrollState(ch);
        if (st && Number.isFinite(st.offsetX)) targetOffsetX = st.offsetX;
      }
    } catch (_) { /* ignore */ }
    const offsetToTarget = (Number.isFinite(targetOffsetX) && Number.isFinite(offsetX))
      ? Math.abs(offsetX - targetOffsetX) : null;
    const zPan = (typeof ch._v9LayoutZoom === 'function') ? ch._v9LayoutZoom() : 1;
    let panCommitThreshold = 5;
    try {
      if (typeof ch._panCommitThresholdPx === 'function') panCommitThreshold = ch._panCommitThresholdPx();
    } catch (_) { /* ignore */ }
    const drag = ch.drag ? {
      active: !!ch.drag.active,
      type: ch.drag.type,
      panCommitted: ch.drag.panCommitted,
      startX: ch.drag.startX,
      startY: ch.drag.startY,
    } : null;
    return {
      tf: ch.currentTimeframe != null ? String(ch.currentTimeframe) : '',
      replayActive: !!(rs && rs.isActive),
      replayPlaying: !!(rs && rs.isPlaying),
      userHasPanned: !!(rs && rs.userHasPanned),
      autoScrollEnabled: rs ? rs.autoScrollEnabled !== false : true,
      replayTs: rs && Number.isFinite(Number(rs.replayTimestamp)) ? Number(rs.replayTimestamp) : null,
      offsetX,
      spacing,
      targetOffsetX,
      offsetToTarget,
      followRenders: Number(ch._mcPlayFollowRenders) || 0,
      dpr: (typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0)
        ? window.devicePixelRatio : 1,
      layoutZoom: zPan,
      panCommitThresholdPx: panCommitThreshold,
      drag,
    };
  }).catch(() => null);
}

const PROBE_INSTALL_FN = () => {
  const ch = window.chart;
  if (!ch || !ch.canvas) return { ok: false, reason: 'no chart canvas' };
  window.__m22Hs78bProbe = {
    chartEvents: [],
    dragSamples: [],
    installedAt: performance.now(),
  };
  const probe = window.__m22Hs78bProbe;
  const canvas = ch.canvas;
  const types = ['mousedown', 'mousemove', 'mouseup', 'pointerdown', 'pointermove', 'pointerup'];
  probe._handlers = types.map((type) => {
    const handler = (e) => {
      probe.chartEvents.push({
        type,
        clientX: e.clientX,
        clientY: e.clientY,
        buttons: e.buttons,
        ts: performance.now(),
      });
      const d = ch.drag;
      if (d && (d.active || type === 'mousedown' || type === 'pointerdown')) {
        probe.dragSamples.push({
          type,
          dragActive: !!d.active,
          dragType: d.type,
          panCommitted: d.panCommitted,
          startX: d.startX,
          startY: d.startY,
        });
      }
    };
    canvas.addEventListener(type, handler, true);
    return { type, handler };
  });
  return { ok: true, dpr: window.devicePixelRatio || 1 };
};

const PROBE_READ_FN = () => {
  const ch = window.chart;
  const probe = window.__m22Hs78bProbe;
  if (!ch || !probe) return null;
  const drag = ch.drag ? {
    active: !!ch.drag.active,
    type: ch.drag.type,
    panCommitted: ch.drag.panCommitted,
    startX: ch.drag.startX,
    startY: ch.drag.startY,
  } : null;
  let commitDx = null;
  let commitDy = null;
  if (drag && Number.isFinite(drag.startX)) {
    const z = (typeof ch._v9LayoutZoom === 'function') ? ch._v9LayoutZoom() : 1;
    const last = probe.chartEvents.filter((e) => e.type === 'mousemove' || e.type === 'pointermove').pop();
    if (last) {
      commitDx = (last.clientX - drag.startX) / z;
      commitDy = (last.clientY - (drag.startY ?? last.clientY)) / z;
    }
  }
  return {
    chartEvents: probe.chartEvents.slice(),
    dragSamples: probe.dragSamples.slice(),
    dragDuring: drag,
    commitDx,
    commitDy,
    panCommitThresholdPx: typeof ch._panCommitThresholdPx === 'function'
      ? ch._panCommitThresholdPx() : 5,
  };
};

export async function installChartEventProbe(frame) {
  return frame.evaluate(PROBE_INSTALL_FN).catch(() => ({ ok: false }));
}

export async function readChartEventProbe(frame) {
  return frame.evaluate(PROBE_READ_FN).catch(() => null);
}

export async function teardownChartEventProbe(frame) {
  return frame.evaluate(() => {
    const probe = window.__m22Hs78bProbe;
    if (!probe || !probe._handlers) return false;
    const ch = window.chart;
    const canvas = ch && ch.canvas;
    if (canvas) {
      for (const { type, handler } of probe._handlers) {
        canvas.removeEventListener(type, handler, true);
      }
    }
    delete window.__m22Hs78bProbe;
    return true;
  }).catch(() => false);
}

/**
 * Controlled pan-intent gesture at exact CSS px while replay play frames stream.
 * @returns {{ ts: number, probe: object, snapshots: object }}
 */
export async function panIntentWhilePlaying(page, panelId, cssDevicePx, ctx) {
  const {
    panelFrameMap,
    hostReplaySeek,
    broadcastCmd,
    sleep,
    startTs,
    stepMs = M22_HS78B_SCENARIO.playStepMs,
    postFrames = M22_HS78B_SCENARIO.postGesturePlayFrames,
    perFrameMs = 18,
  } = ctx;

  const rect = await page.evaluate((pid) => {
    const cell = window.__harnessCells && window.__harnessCells[pid];
    if (!cell) return null;
    const r = cell.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, panelId);
  if (!rect) throw new Error(`panIntentWhilePlaying: no cell for panel ${panelId}`);

  const frame = panelId === 'A' ? page : panelFrameMap(page)[panelId];
  if (!frame) throw new Error(`panIntentWhilePlaying: no frame for ${panelId}`);

  await installChartEventProbe(frame);

  const y = Math.round(rect.y + rect.h * 0.5);
  const xStart = Math.round(rect.x + Math.min(rect.w * 0.35, 120));
  const distance = Math.max(0, Number(cssDevicePx) || 0);

  const before = await readPanelFollow(page, panelId, panelFrameMap);
  const follow0 = Number(before?.followRenders) || 0;
  const off0 = Number(before?.offsetX);
  const target0 = Number(before?.offsetToTarget);

  await setHostReplayPlaying(page, true);
  let ts = startTs;

  await page.mouse.move(xStart, y);
  await page.mouse.down();

  let immediate = null;
  let probeMid = null;

  if (distance === 0) {
    await sleep(80);
    immediate = await readPanelFollow(page, panelId, panelFrameMap);
    probeMid = await readChartEventProbe(frame);
  } else {
    const steps = Math.max(3, distance);
    for (let i = 1; i <= steps; i += 1) {
      const x = Math.round(xStart + (distance * i) / steps);
      await page.mouse.move(x, y);
      ts += stepMs;
      await hostReplaySeek(page, ts);
      await broadcastCmd(page, 'replayFrame', { timestamp: ts, isPlaying: true });
      await sleep(perFrameMs);
      if (i === steps) {
        immediate = await readPanelFollow(page, panelId, panelFrameMap);
        probeMid = await readChartEventProbe(frame);
      }
    }
  }

  await page.mouse.up();
  await sleep(200);

  const afterRelease = await readPanelFollow(page, panelId, panelFrameMap);

  for (let i = 0; i < postFrames; i += 1) {
    ts += stepMs;
    await hostReplaySeek(page, ts);
    await broadcastCmd(page, 'replayFrame', { timestamp: ts, isPlaying: true });
    await sleep(perFrameMs);
  }

  const post50 = await readPanelFollow(page, panelId, panelFrameMap);
  const probeFinal = await readChartEventProbe(frame);
  await teardownChartEventProbe(frame);

  const followImm = (Number(immediate?.followRenders) || 0) - follow0;
  const followPost = (Number(post50?.followRenders) || 0) - follow0;
  const offImm = Number(immediate?.offsetX);
  const offPost = Number(post50?.offsetX);

  const firstDown = probeFinal?.chartEvents?.find((e) => e.type === 'mousedown' || e.type === 'pointerdown');
  const lastMove = [...(probeFinal?.chartEvents || [])]
    .reverse()
    .find((e) => e.type === 'mousemove' || e.type === 'pointermove');
  let actualMovementCssPx = 0;
  if (firstDown && lastMove) {
    actualMovementCssPx = Math.abs(lastMove.clientX - firstDown.clientX);
  }

  const probe = {
    ...(probeFinal || {}),
    actualMovementCssPx,
    offsetXDeltaImmediate: Number.isFinite(off0) && Number.isFinite(offImm) ? offImm - off0 : null,
    offsetXDeltaPost50: Number.isFinite(off0) && Number.isFinite(offPost) ? offPost - off0 : null,
    declaredCssDevicePx: distance,
    dpr: before?.dpr ?? 1,
    layoutZoom: before?.layoutZoom ?? 1,
    panCommitThresholdPx: before?.panCommitThresholdPx ?? M22_HS78B_PAN_COMMIT_THRESHOLD_CSS_PX,
    dragDuring: probeMid?.dragDuring || probeFinal?.dragDuring,
  };

  return {
    ts,
    cssDevicePx: distance,
    probe,
    snapshots: {
      before,
      immediate,
      afterRelease,
      post50,
      followRendersDeltaImmediate: followImm,
      followRendersDeltaPost50: followPost,
      offsetToTargetImmediate: immediate?.offsetToTarget,
      offsetToTargetPost50: post50?.offsetToTarget,
      offsetToTargetBefore: target0,
      recenters: (
        Number.isFinite(immediate?.offsetToTarget)
        && Number.isFinite(post50?.offsetToTarget)
        && post50.offsetToTarget < immediate.offsetToTarget * 0.85
      ),
      followEngagedBefore: !!(
        before
        && before.replayActive
        && !before.userHasPanned
        && before.autoScrollEnabled !== false
      ),
      slackPx: followSlackPx(before),
    },
  };
}

export async function bootCleanReplayPlaySession(page, lib, opts = {}) {
  const {
    setSync,
    setIntervalSync,
    waitBootSettled,
    hostReplayEnter,
    broadcastCmd,
    panelCmd,
    waitReplayQuiescent,
    sleep,
  } = lib;
  const ids = ['A', 'B', 'C', 'D'];
  const vp = M22_HS78B_SCENARIO.boot.viewport;
  await page.setViewport({
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: vp.deviceScaleFactor,
  });
  await sleep(500);
  await setSync(page, M22_HS78B_SCENARIO.boot.syncOn);
  await setIntervalSync(page, M22_HS78B_SCENARIO.boot.intervalSyncOn);
  await waitBootSettled(page, ids, 20_000, opts.getInFlightDataRequests);

  const ts0 = await replayStartTs(page);
  if (ts0 == null) return { ok: false, reason: 'no replay start ts' };

  await hostReplayEnter(page, ts0);
  await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
  const entered = await waitReplayQuiescent(page, ids, ts0, 15_000);
  if (!entered.ok) return { ok: false, reason: entered.detail, ts0 };

  await panelCmd(page, M22_HS78B_SCENARIO.panel, 'setTimeframe', {
    tf: M22_HS78B_SCENARIO.boot.coarsePanelTf,
  }).catch(() => {});
  await sleep(1200);

  let ts = ts0;
  ts = await streamPlayFramesNoDrag(page, ts, M22_HS78B_SCENARIO.warmupPlayFrames, M22_HS78B_SCENARIO.playStepMs, {
    lib,
  });

  const bBefore = await readPanelFollow(page, M22_HS78B_SCENARIO.panel, lib.panelFrameMap);
  const followEngaged = !!(
    bBefore
    && bBefore.replayActive
    && !bBefore.userHasPanned
    && bBefore.autoScrollEnabled !== false
  );

  return {
    ok: followEngaged,
    ts0,
    ts,
    bBefore,
    followEngaged,
    reason: followEngaged ? null : 'pre-gesture follow not engaged',
  };
}
