const iframe = document.getElementById('product');
const log = document.getElementById('log');
const rows = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function note(name, pass, detail, extra = {}) {
  rows.push({ name, pass: !!pass, detail, ...extra });
  log.textContent += `\n${pass ? 'PASS' : 'FAIL'} ${name} — ${detail}`;
}

async function waitFor(fn, timeout = 12000) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    try { const value = fn(); if (value) return value; } catch {}
    await sleep(25);
  }
  throw new Error('bounded wait expired');
}

function bars(count = 40) {
  const out = [];
  const t0 = 1720000000000;
  for (let i = 0; i < count; i += 1) {
    const o = 100 + i * 0.25;
    out.push({ t: t0 + i * 60000, o, h: o + 1, l: o - 1, c: o + 0.5, v: 100 + i });
  }
  return out;
}

async function freshProduct() {
  iframe.src = `/chart/multichart-prod/chart-embed.html?tal01934=${Date.now()}`;
  await new Promise((resolve) => iframe.addEventListener('load', resolve, { once: true }));
  const w = iframe.contentWindow;
  const chart = await waitFor(() => w.chart && w.ReplaySystem && w.Chart && w.chart.canvas && w.chart.render && w.chart.scheduleRender && w.chart);
  await waitFor(() => typeof chart.addIndicator === 'function');
  return { w, chart };
}

async function runCase({ mutation, indicators, repeat }) {
  const { w, chart } = await freshProduct();
  // Product fix defaults ON. Every negative control explicitly exercises the
  // retained kill switch; add-invalidation is the unmodified GREEN path.
  w.__TALARIA_DISABLE_REPLAY_CROSSHAIR_REFRESH = mutation !== 'add-invalidation';
  const all = bars();
  const initial = all.slice(0, 12);
  chart.data = initial.slice();
  chart.rawData = initial.slice();
  chart.currentTimeframe = '1m';
  chart.offsetX = 0;
  chart.bumpDataVersion?.();
  chart.render();

  if (!chart.indicators) chart.initIndicators();
  if (indicators && mutation !== 'indicator-collapse') {
    chart.addIndicator('sma', { period: 3 });
    chart.addIndicator('ema', { period: 4 });
    chart.addIndicator('wma', { period: 5 });
    await waitFor(() => chart.indicators?.active?.length === 3);
  }
  const activeTypes = (chart.indicators?.active || []).map((x) => x.type).sort();
  const indicatorSignature = activeTypes.join(',');

  const replay = new w.ReplaySystem(chart);
  chart.replaySystem = replay;
  replay.isActive = true;
  replay.fullRawData = all;
  replay.fullData = all;
  replay.currentIndex = 11;
  replay.sessionStartIndex = 0;
  replay.replayTimestamp = all[11].t;
  replay.replayStartTimestamp = all[0].t;
  replay.replayEndTimestamp = all.at(-1).t;
  replay.playbackMode = 'candle';
  replay.tickAnimationEnabled = false;
  replay.useConstantTickInterval = true;
  replay.speed = 100;
  replay.stepTimeframeOverride = '1m';
  replay.autoScrollEnabled = true;
  replay.userHasPanned = false;

  const diag = { raf: 0, render: 0, schedule: 0, refresh: 0, fakeWrites: 0 };
  const realRaf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) => realRaf((ts) => { diag.raf += 1; cb(ts); });
  const realRender = chart.render.bind(chart);
  chart.render = (...args) => { diag.render += 1; return realRender(...args); };
  const realSchedule = chart.scheduleRender.bind(chart);
  chart.scheduleRender = (...args) => { diag.schedule += 1; return realSchedule(...args); };
  const realRefresh = chart.refreshCrosshairFromLastPointer.bind(chart);
  chart.refreshCrosshairFromLastPointer = (...args) => { diag.refresh += 1; return realRefresh(...args); };

  const timeBadge = chart.canvas.parentElement.querySelector(':scope > .time-label');
  const canvasRect = chart.canvas.getBoundingClientRect();
  const idx = chart.data.length - 1;
  const localX = Math.max(chart.margin.l + 2, Math.min(chart.w - chart.margin.r - 2, chart.dataIndexToPixel(idx)));
  const localY = Math.max(chart.margin.t + 20, Math.min(chart.h - chart.margin.b - 20, chart.h / 2));
  const pointer = () => chart.canvas.dispatchEvent(new w.MouseEvent('mousemove', {
    bubbles: true, clientX: canvasRect.left + localX, clientY: canvasRect.top + localY,
  }));
  pointer();
  await new Promise((r) => realRaf(() => r()));
  const before = timeBadge.textContent;

  const realTick = replay._runCandlePlaybackTick.bind(replay);
  if (mutation === 'fake-badge-write') {
    replay._runCandlePlaybackTick = (...args) => {
      const result = realTick(...args);
      diag.fakeWrites += 1;
      timeBadge.textContent = new Date(replay.replayTimestamp).toISOString();
      return result;
    };
  } else if (mutation === 'pause-only-update') {
    const realPause = replay.pause.bind(replay);
    replay.pause = () => { const result = realPause(); chart.refreshCrosshairFromLastPointer(); return result; };
  } else if (mutation === 'wrong-owner') {
    replay._runCandlePlaybackTick = (...args) => {
      const result = realTick(...args);
      w.parent?.chart?.refreshCrosshairFromLastPointer?.();
      return result;
    };
  } else if (mutation === 'dead-code-decoy') {
    replay.__tal01934DeadInvalidation = () => chart.refreshCrosshairFromLastPointer();
  } else if (mutation === 'bypass-real-render') {
    chart.render = () => { diag.render += 1; };
  }

  replay.play();
  await waitFor(() => replay.isPlaying);
  if (replay.playInterval) { w.clearInterval(replay.playInterval); replay.playInterval = null; }
  for (let i = 0; i < 3; i += 1) {
    replay._runCandlePlaybackTick();
    if (replay.playInterval) { w.clearInterval(replay.playInterval); replay.playInterval = null; }
    await new Promise((r) => realRaf(() => r()));
  }
  const duringPlay = timeBadge.textContent;
  const indexAfter = replay.currentIndex;
  const timestampAfter = replay.replayTimestamp;
  replay.pause();
  const afterPause = timeBadge.textContent;
  replay.play();
  await waitFor(() => replay.isPlaying);
  replay.pause();

  pointer();
  await new Promise((r) => realRaf(() => r()));
  const afterNudge = timeBadge.textContent;

  replay.stopAllPlayback();
  replay.pause();
  const indicatorValid = indicators
    ? indicatorSignature === 'ema,sma,wma'
    : indicatorSignature === '';
  const advanced = indexAfter >= 14 && timestampAfter > all[11].t;
  const realRenderObserved = diag.render > 0 && mutation !== 'bypass-real-render';
  const labelAdvanced = duringPlay !== before;
  const legitimateAdvance = labelAdvanced && diag.refresh > 0 && diag.fakeWrites === 0;
  const pointerControl = afterNudge !== before;
  const m21RuntimeObserved = typeof chart.scheduleRender === 'function'
    && typeof chart.animate === 'function'
    && typeof chart.renderPending === 'boolean'
    && diag.raf > 0 && diag.render > 0;
  const oraclePass = advanced && realRenderObserved && indicatorValid
    && legitimateAdvance && pointerControl && m21RuntimeObserved;

  return {
    mutation, indicators: indicators ? 'SMA+EMA+WMA' : 'none', repeat,
    oraclePass, advanced, realRenderObserved, indicatorValid, legitimateAdvance, pointerControl,
    labels: { before, duringPlay, afterPause, afterNudge },
    replay: { indexAfter, timestampAfter },
    activeTypes, diag,
    owner: { overlayWindow: 'iframe-panel', replayOwnerSameChart: replay.chart === chart },
    m21: {
      singleRenderRuntimeObserved: m21RuntimeObserved,
      scheduleRenderHook: typeof chart.scheduleRender === 'function',
      animateHook: typeof chart.animate === 'function',
      renderPendingState: chart.renderPending,
    },
  };
}

async function main() {
  const cases = [];
  for (let repeat = 1; repeat <= 2; repeat += 1) {
    cases.push({ mutation: 'remove-invalidation', indicators: false, repeat });
    cases.push({ mutation: 'remove-invalidation', indicators: true, repeat });
  }
  for (const mutation of [
    'add-invalidation', 'bypass-real-render', 'fake-badge-write', 'indicator-collapse',
    'pause-only-update', 'wrong-owner', 'dead-code-decoy',
  ]) cases.push({ mutation, indicators: true, repeat: 1 });

  for (const spec of cases) {
    try {
      const result = await Promise.race([
        runCase(spec),
        new Promise((_, reject) => setTimeout(() => reject(new Error('case hard timeout')), 20000)),
      ]);
      const expected = spec.mutation === 'add-invalidation';
      note(`${spec.mutation}/${result.indicators}/r${spec.repeat}`,
        result.oraclePass === expected,
        `oracle=${result.oraclePass} expected=${expected}`, { result });
    } catch (error) {
      note(`${spec.mutation}/r${spec.repeat}`, false, String(error?.stack || error));
    }
  }
  iframe.src = 'about:blank';
  const pass = rows.filter((r) => r.pass).length;
  const report = {
    verdict: pass === rows.length ? 'HARNESS-PASS' : 'HARNESS-FAIL',
    pass, fail: rows.length - pass, rows,
    bounded: true, cleanup: 'replay timers stopped; iframe navigated to about:blank; browser process killed by runner',
  };
  await fetch('/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report) });
}

main().catch(async (error) => {
  await fetch('/report', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ verdict: 'HARNESS-FAIL', fatal: String(error?.stack || error), rows }),
  });
});
