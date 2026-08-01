/**
 * REGIME-01 stamp emitter.
 *
 * Every performance gate must declare the regime it was measured in. This exists so that is one import
 * and one call rather than a checklist somebody has to remember at 3am.
 *
 * The reason it is mandatory, in one sentence: C measured `_chartIndexForCloseMarkerOnChart` at 31.8% of
 * a freeze on a 43-trade session, and the same function takes ZERO calls in my zero-trade session, so a
 * fix aimed at either regime reads as a null result when it is verified in the other one.
 *
 *   import { regimeStamp, printStamp } from './regime-stamp.mjs';
 *   const stamp = await regimeStamp(page, { measuredMs, events, longTasks });
 *   printStamp(stamp);                      // human-readable block for the finding
 *   fs.writeFileSync('gate.json', JSON.stringify({ stamp, result }, null, 2));
 *
 * Anything it cannot determine is reported as "UNKNOWN" rather than omitted or guessed. An absent field
 * reads as "not applicable"; UNKNOWN reads as "nobody checked", and those are different claims.
 */

/** Collect the regime from a live page. `metrics` is optional and supplies the achieved-rate fields. */
export async function regimeStamp(page, metrics = {}) {
  const inPage = await page.evaluate(() => {
    const c = window.chart || null;
    const rs = c && c.replaySystem;
    const om = window.orderManager || (c && c.orderManager) || null;

    const count = (v) => {
      if (v == null) return null;
      if (Array.isArray(v)) return v.length;
      if (typeof v === 'object') return Object.keys(v).length;
      return null;
    };
    // Trades live under several names depending on the surface; take the first that resolves rather
    // than assuming a shape, and report which one answered so the number is traceable.
    let trades = null, tradesFrom = null;
    if (om) {
      for (const k of ['closedTrades', 'trades', 'orders', 'positions']) {
        const n = count(om[k]);
        if (n != null) { trades = (trades || 0) + n; tradesFrom = (tradesFrom ? tradesFrom + '+' : '') + `${k}=${n}`; }
      }
    }
    let gl = null;
    try {
      const cv = document.createElement('canvas');
      const g = cv.getContext('webgl2') || cv.getContext('webgl');
      const dbg = g && g.getExtension('WEBGL_debug_renderer_info');
      gl = dbg ? g.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (g ? 'no-debug-ext' : 'no-webgl');
    } catch (e) { gl = 'webgl-blocked'; }

    return {
      build: (document.querySelector('script[src*="v=2026"]') || {}).src?.split('v=')[1] || 'UNKNOWN',
      url: location.href,
      bars: c && c.data ? c.data.length : null,
      rawBars: c && c.rawData ? c.rawData.length : null,
      fullRawBars: rs && rs.fullRawData ? rs.fullRawData.length : null,
      timeframe: c ? (c.currentTimeframe || 'UNKNOWN') : 'UNKNOWN',
      orderManagerPresent: !!om,
      trades, tradesFrom,
      indicators: c && c.indicators ? count(c.indicators) : null,
      nominalSpeed: rs ? (rs.speed ?? null) : null,
      playbackMode: rs ? (rs.playbackMode ?? null) : null,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      dpr: window.devicePixelRatio,
      rasteriser: gl,
      ua: navigator.userAgent,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
    };
  });

  const sec = metrics.measuredMs ? metrics.measuredMs / 1000 : null;
  return {
    ...inPage,
    measuredSeconds: sec ? +sec.toFixed(1) : null,
    achievedEventsPerSec: (sec && metrics.events != null) ? +(metrics.events / sec).toFixed(2) : 'UNKNOWN',
    longTasksPerSec: (sec && metrics.longTasks != null) ? +(metrics.longTasks / sec).toFixed(2) : 'UNKNOWN',
    repeats: metrics.repeats ?? 'UNKNOWN (n=1 unless stated)',
    regime: inPage.trades == null ? 'UNKNOWN'
      : inPage.trades === 0 ? 'ZERO-TRADE (LAG-ZT)' : `TRADE-BEARING (${inPage.trades})`,
  };
}

export function printStamp(s) {
  const L = [];
  L.push('---------------- REGIME-01 DECLARATION ----------------');
  L.push(`regime            ${s.regime}`);
  L.push(`trades            ${s.trades ?? 'UNKNOWN'}${s.tradesFrom ? `  (${s.tradesFrom})` : ''}`);
  L.push(`bars (resident)   ${s.bars ?? 'UNKNOWN'}   raw ${s.rawBars ?? '?'}   file ${s.fullRawBars ?? '?'}`);
  L.push(`timeframe         ${s.timeframe}`);
  L.push(`indicators        ${s.indicators ?? 'UNKNOWN'}`);
  L.push(`speed nominal     ${s.nominalSpeed ?? 'UNKNOWN'}   mode ${s.playbackMode ?? '?'}`);
  L.push(`speed ACHIEVED    ${s.achievedEventsPerSec} events/s   <- not the same thing as nominal`);
  L.push(`long tasks        ${s.longTasksPerSec} /s over ${s.measuredSeconds ?? '?'} s`);
  L.push(`repeats           ${s.repeats}`);
  L.push(`build             ${s.build}`);
  L.push(`rasteriser        ${s.rasteriser}`);
  L.push(`viewport          ${s.viewport} @ dpr ${s.dpr}`);
  L.push(`heap              ${s.heapMB ?? 'UNKNOWN'} MB`);
  L.push('-------------------------------------------------------');
  const out = L.join('\n');
  console.log(out);
  return out;
}
