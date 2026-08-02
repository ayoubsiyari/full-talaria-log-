/**
 * HEAP-CYCLE PO workload — arm the product the way the PO measures:
 * 4 panels + ≥3 indicators each + one open order + live replay playing.
 *
 * Shared constants with M6; MultichartGrid iframe walk (not thin host.html).
 */

import { chartTarget } from '../../chart v 1.4/chart/multichart-prod/harness/interactive-helpers.mjs';
import { waitForPanelFrame } from '../../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';

export const HEAP_CYCLE_PO_INDICATORS = Object.freeze([
  ['sma', { period: 20 }],
  ['ema', { period: 50 }],
  ['rsi', { period: 14 }],
  ['macd', { fast: 12, slow: 26, signal: 9 }],
]);

export const HEAP_CYCLE_PO_PANEL_IDS = Object.freeze(['A', 'B', 'C', 'D']);

/** PO canary hand floors (MB): baseline 75 then six return-to-single samples. */
export const HEAP_CYCLE_PO_HAND_FLOORS_MB = Object.freeze([80, 72, 90, 96, 141, 155]);
export const HEAP_CYCLE_PO_HAND_BASELINE_MB = 75;
/** Mean Δ ≈ +13.3 MB/cycle; late jump +45 on cycle 5. */
export const HEAP_CYCLE_PO_HAND_MEAN_MB = 13;
export const HEAP_CYCLE_PO_HAND_LATE_JUMP_MB = 45;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logPoWorkload(...args) {
  console.error(`[heap-cycle-po-workload ${new Date().toISOString()}]`, ...args);
}

async function resolvePanelFrame(page, panelId, timeoutMs = 45_000) {
  if (panelId === 'A') return page.mainFrame();
  const existing = chartTarget(page, panelId);
  if (existing && typeof existing.evaluate === 'function') return existing;
  return waitForPanelFrame(page, panelId, timeoutMs);
}

/**
 * Arm one panel chart: indicators + enter replay + play at high speed.
 * Runs inside the panel frame (or host for A).
 */
/**
 * SPEED-01: the engine ladder is the integers 1..10 in bars/s, frozen at replay-system.js:190, and
 * _speedGovNearestRung snaps anything off it to the nearest rung. A default of 60 therefore does not
 * fail here - it silently becomes 10, and the harness records the request it made rather than the speed
 * it got. A handed this over and was right that it is worse than a leftover.
 *
 * Refused rather than snapped, for the reason A gives: the engine's snap is correct for a user turning a
 * dial and wrong for a harness, which must learn that its request was refused.
 */
const SPEED_LADDER_BPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export function assertOnLadder(speed, where) {
  if (!SPEED_LADDER_BPS.includes(Number(speed))) {
    throw new Error(`SPEED-01: ${where} requested speed ${speed}, which is off the ladder (${SPEED_LADDER_BPS[0]}..${SPEED_LADDER_BPS[SPEED_LADDER_BPS.length - 1]} bars/s). The engine would snap it to the nearest rung and the artifact would name a speed that never ran.`);
  }
  return Number(speed);
}

async function armPanelChart(frame, {
  indicators = HEAP_CYCLE_PO_INDICATORS,
  replaySpeed = 10,
  /** PO hand leaves indicators; clearing/re-adding each cycle under-reads. */
  retainIndicators = false,
} = {}) {
  return frame.evaluate(async (indicatorList, speed, retain) => {
    const sleepLocal = (ms) => new Promise((r) => setTimeout(r, ms));
    try { window.alert = () => {}; } catch (_) {}
    const chart = window.chart;
    if (!chart) return { ok: false, reason: 'no chart' };

    const active0 = (chart.indicators && chart.indicators.active) || [];
    if (!retain) {
      // Forced-GC floor mode: avoid stacking across cycles.
      try {
        if (active0.length && typeof chart.removeIndicator === 'function') {
          for (const ind of [...active0]) {
            try { chart.removeIndicator(ind.id || ind); } catch (_) {}
          }
        } else if (chart.indicators && Array.isArray(chart.indicators.active)) {
          chart.indicators.active.length = 0;
        }
      } catch (_) {}
    }

    const added = [];
    const needAdd = retain
      ? active0.length < 3
      : true;
    if (needAdd && typeof chart.addIndicator === 'function') {
      for (const [type, params] of indicatorList) {
        try {
          const ind = chart.addIndicator(type, params);
          added.push({ type, id: ind && ind.id || null, ok: true });
        } catch (error) {
          added.push({ type, ok: false, error: String(error?.message || error) });
        }
      }
    }
    const active = (chart.indicators && chart.indicators.active) || [];
    const indicatorsOk = retain
      ? active.length >= 3
      : (added.filter((r) => r.ok).length >= 3 && active.length >= 3);

    const rs = chart.replaySystem;
    let replay = { ok: false, reason: 'no replaySystem' };
    if (rs) {
      try {
        if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
          rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
        }
        // The request is made, then READ BACK. Both catches here were empty, so a setSpeed that threw
        // and a governor that snapped were equally invisible: the run continued at some other speed and
        // the artifact reported the number that was asked for. That is the defect that ran a soak at 60
        // under a 5x label, and it is the "refusal signal" A asked for.
        let speedSetError = null;
        if (typeof rs.setSpeed === 'function') {
          try { rs.setSpeed(speed); } catch (e) { speedSetError = String(e?.message || e); }
        } else if (rs.speed != null) {
          try { rs.speed = speed; } catch (e) { speedSetError = String(e?.message || e); }
        } else {
          speedSetError = 'no setSpeed() and no writable speed field';
        }
        let effectiveSpeed = null;
        let speedRoute = null;
        for (const [name, get] of [
          ['getTargetBarsPerSecond()', () => (typeof rs.getTargetBarsPerSecond === 'function' ? rs.getTargetBarsPerSecond() : undefined)],
          ['targetBarsPerSecond', () => rs.targetBarsPerSecond],
          ['speed', () => rs.speed],
        ]) {
          let v; try { v = get(); } catch (_) { continue; }
          if (Number.isFinite(Number(v))) { effectiveSpeed = Number(v); speedRoute = name; break; }
        }
        replay = {
          ok: !!rs.isActive, isActive: !!rs.isActive,
          requestedSpeed: speed, effectiveSpeed, speedRoute, speedSetError,
          speedHonoured: effectiveSpeed != null ? effectiveSpeed === speed : null,
        };
      } catch (error) {
        replay = { ok: false, reason: String(error?.message || error) };
      }
    }

    let playing = { ok: false, isPlaying: false };
    if (rs && rs.isActive) {
      try {
        if (typeof rs.goToReplayTimestamp === 'function' && Array.isArray(chart.data) && chart.data.length > 50) {
          const mid = chart.data[Math.floor(chart.data.length * 0.2)];
          if (mid && mid.t != null) rs.goToReplayTimestamp(Number(mid.t));
        }
        if (!rs.isPlaying && typeof rs.play === 'function') rs.play();
        else if (!rs.isPlaying && typeof rs.togglePlay === 'function') rs.togglePlay();
        const started = Date.now();
        while (Date.now() - started < 3000) {
          if (rs.isPlaying) break;
          await sleepLocal(50);
        }
        playing = { ok: !!rs.isPlaying, isPlaying: !!rs.isPlaying };
      } catch (error) {
        playing = { ok: false, reason: String(error?.message || error) };
      }
    }

    return {
      ok: indicatorsOk && replay.ok && playing.ok,
      indicatorsOk,
      indicatorCount: active.length,
      added,
      replay,
      playing,
      dataBars: Array.isArray(chart.data) ? chart.data.length : 0,
      retainedIndicators: !!retain,
    };
  }, indicators, replaySpeed, retainIndicators === true);
}

async function placeHostOrder(page) {
  return page.evaluate(() => {
    try { window.alert = () => {}; } catch (_) {}
    const chart = window.chart;
    const om = chart && (chart.orderManager || window.orderManager);
    const service = om && om.orderService;
    const candle = chart && Array.isArray(chart.data) && chart.data.length
      ? chart.data[chart.data.length - 1]
      : null;
    const price = candle && Number(candle.c);
    if (!service || typeof service.submitOrder !== 'function' || !Number.isFinite(price)) {
      return { ok: false, reason: 'orderService.submitOrder unavailable', openCount: 0 };
    }
    const submitted = service.submitOrder({
      orderType: 'market',
      direction: 'BUY',
      side: 'BUY',
      quantity: 1,
      entryPrice: price,
      timestamp: candle && candle.t != null ? Number(candle.t) : Date.now(),
      stopLoss: price * 0.99,
      takeProfit: price * 1.01,
    });
    const openCount = Array.isArray(service.openPositions) ? service.openPositions.length
      : (Array.isArray(service.orders) ? service.orders.length : 0);
    return {
      ok: !!(submitted && submitted.id) || openCount > 0,
      result: submitted ? { id: submitted.id, status: submitted.status } : null,
      openCount,
      via: 'orderService.submitOrder',
    };
  });
}

async function waitPanelChartReady(page, panelId, timeoutMs = 45_000) {
  const started = Date.now();
  let frame = null;
  while (Date.now() - started < timeoutMs) {
    try {
      frame = await resolvePanelFrame(page, panelId, Math.min(5_000, timeoutMs));
    } catch (_) {
      frame = null;
    }
    if (frame) {
      const ready = await frame.evaluate(() => {
        const chart = window.chart;
        return !!(chart
          && Array.isArray(chart.data)
          && chart.data.length > 20
          && chart.replaySystem);
      }).catch(() => false);
      if (ready) return frame;
    }
    await sleep(150);
  }
  throw new Error(`timeout waiting for panel ${panelId} chart+replay ready`);
}

/**
 * Arm PO workload on MultichartGrid (host A + peer iframes B/C/D).
 * @returns {{ armed: boolean, panels: number, indicatorsOk: boolean, replayOk: boolean, order: object, playing: object[], observedPlaying: number, perPanel: object[] }}
 */
export async function armHeapCyclePoWorkload(page, {
  panelIds = HEAP_CYCLE_PO_PANEL_IDS,
  playHoldMs = 6_000,
  // SPEED-01. The second of the two defaults A named; both had to move, since a caller that passes
  // nothing reaches whichever one is on its path.
  replaySpeed = 10,
  retainIndicators = false,
  /**
   * PO-exact reproduction needs two indicators per panel and NO order at all: the
   * zero-trade run is the control that separates the bar-driven defect from the
   * trade-driven one, and an order placed by the harness would destroy it. Defaults
   * are unchanged so every existing gate arms exactly as before.
   */
  indicators = HEAP_CYCLE_PO_INDICATORS,
  placeOrder = true,
} = {}) {
  // Fixing the default alone would leave the sharper case open: a caller that explicitly passes 60 is
  // making the same mistake more loudly, and the engine would snap it just as quietly.
  assertOnLadder(replaySpeed, 'armHeapCyclePoWorkload');
  const perPanel = [];
  const frameById = new Map();
  for (const id of panelIds) {
    logPoWorkload(`arm panel ${id}: wait ready`);
    const frame = await waitPanelChartReady(page, id, 45_000);
    frameById.set(id, frame);
    // Prefer chartTarget when available (handles A host vs iframe).
    const target = chartTarget(page, id) || frame;
    let row = await armPanelChart(target, { replaySpeed, retainIndicators, indicators });
    if (!row.ok) {
      await sleep(200);
      row = await armPanelChart(target, { replaySpeed, retainIndicators, indicators });
    }
    logPoWorkload(
      `arm panel ${id}: ok=${row.ok} ind=${row.indicatorCount} `
      + `replay=${row.replay?.ok} playing=${row.playing?.ok}`,
    );
    perPanel.push({ id, ...row });
  }

  const order = placeOrder
    ? await placeHostOrder(page)
    : { ok: true, skipped: true, reason: 'zero-trade reproduction: no order placed', openCount: 0 };
  logPoWorkload(placeOrder
    ? `order ok=${order.ok} openCount=${order.openCount}`
    : 'order SKIPPED (zero-trade reproduction)');

  let observedPlaying = 0;
  const playStarted = Date.now();
  while (Date.now() - playStarted < playHoldMs) {
    let playingNow = 0;
    for (const id of panelIds) {
      try {
        const target = chartTarget(page, id) || frameById.get(id);
        if (!target || typeof target.evaluate !== 'function') continue;
        const isPlaying = await target.evaluate((speed) => {
          const rs = window.chart && window.chart.replaySystem;
          if (!rs) return false;
          if (!rs.isPlaying) {
            try {
              if (typeof rs.setSpeed === 'function') rs.setSpeed(speed);
              if (typeof rs.play === 'function') rs.play();
              else if (typeof rs.togglePlay === 'function') rs.togglePlay();
            } catch (_) {}
          }
          return !!rs.isPlaying;
        }, replaySpeed);
        if (isPlaying) playingNow += 1;
      } catch (_) {}
    }
    observedPlaying = Math.max(observedPlaying, playingNow);
    await sleep(100);
  }
  logPoWorkload(`play hold done observedPlaying=${observedPlaying}`);

  const indicatorsOk = perPanel.every((row) => row.indicatorsOk);
  const replayOk = perPanel.every((row) => row.replay && row.replay.ok);
  const playingArmed = perPanel.filter((row) => row.playing && row.playing.ok).length >= 3
    || observedPlaying >= 3;
  const armed = indicatorsOk && replayOk && order.ok === true && playingArmed && perPanel.length >= 4;

  return {
    armed,
    panels: perPanel.length,
    indicatorsOk,
    replayOk,
    order,
    playing: perPanel.map((row) => ({ id: row.id, ...(row.playing || {}) })),
    observedPlaying,
    stillPlaying: observedPlaying,
    perPanel,
    playHoldMs,
    replaySpeed,
  };
}

/**
 * Assess whether heap-floor series matches PO hand shape
 * (≈13 MB/cycle mean, late climb with a ≥30 MB jump on cycle ≥4).
 */
export function assessPoHandHeapShape({
  baselineBytes = null,
  floorBytes = [],
} = {}) {
  const floors = (Array.isArray(floorBytes) ? floorBytes : [])
    .map((b) => Number(b))
    .filter((b) => Number.isFinite(b));
  const baseline = Number(baselineBytes);
  if (!Number.isFinite(baseline) || floors.length < 6) {
    return {
      ok: false,
      reason: `need baseline+6 floors (got baseline=${baselineBytes} floors=${floors.length})`,
      meanDeltaMb: null,
      lateJumpMb: null,
      deltasMb: [],
    };
  }
  const deltas = floors.map((f, i) => f - (i === 0 ? baseline : floors[i - 1]));
  const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const early = deltas.slice(0, 3);
  const late = deltas.slice(3);
  const earlyMean = early.reduce((a, b) => a + b, 0) / early.length;
  const lateMax = Math.max(...late);
  const mb = (b) => b / (1024 * 1024);
  const meanDeltaMb = mb(meanDelta);
  const lateJumpMb = mb(lateMax);
  const earlyMeanMb = mb(earlyMean);
  // PO: mean ~13; late jump ~45 on c5. Accept order-of-magnitude.
  const meanOk = meanDeltaMb >= 8 && meanDeltaMb <= 40;
  const lateOk = lateJumpMb >= 25 && lateJumpMb >= earlyMeanMb + 15;
  return {
    ok: meanOk && lateOk,
    meanOk,
    lateOk,
    meanDeltaMb,
    lateJumpMb,
    earlyMeanMb,
    deltasMb: deltas.map(mb),
    floorsMb: floors.map(mb),
    baselineMb: mb(baseline),
    poHand: {
      baselineMb: HEAP_CYCLE_PO_HAND_BASELINE_MB,
      floorsMb: HEAP_CYCLE_PO_HAND_FLOORS_MB.slice(),
      meanMb: HEAP_CYCLE_PO_HAND_MEAN_MB,
      lateJumpMb: HEAP_CYCLE_PO_HAND_LATE_JUMP_MB,
    },
    reason: (meanOk && lateOk)
      ? null
      : `PO-HAND-SHAPE miss: meanΔ=${meanDeltaMb.toFixed(2)}MB (want ~${HEAP_CYCLE_PO_HAND_MEAN_MB}) lateMax=${lateJumpMb.toFixed(2)}MB (want ~${HEAP_CYCLE_PO_HAND_LATE_JUMP_MB}) earlyMean=${earlyMeanMb.toFixed(2)}MB`,
  };
}
