#!/usr/bin/env node
/**
 * PERM-GAUGES — the two gauges ordered before the ten hours, built for the permanent set under `PERM-01`.
 *
 * GAUGE 1 — HOST-REALM PAINTS/SEC AT 1x ON A STATIC DATASET.
 *   Replaces "paints per candle", which A challenged and which the Director has withdrawn from `BUDGET-01`.
 *   That ratio had a denominator the product controls: the unfixed build already scores 5.9 paints/bar
 *   simply by running the replay fast, so the row would have gone green on a broken build. A rate measured
 *   at 1x with nothing changing cannot be gamed that way.
 *
 *   `VER-07` is the reason this gauge has two halves. A gate that only asserts "paints/sec is low" passes a
 *   host that has stopped painting altogether, which is a worse defect than the one being measured. So the
 *   second half is a NEGATIVE CONTROL: make something change, and prove the counter still rises. A gauge
 *   that cannot tell "stopped painting needlessly" from "painted once then froze" is not a gate.
 *
 * GAUGE 2 — THE ORIGINAL BUG, AS A REGRESSION TEST.
 *   From `homepage/public/chart/multichart/README.md`: "pan higher-TF chart, lower-TF candles do not
 *   compress vertically." Price-axis cross-contamination shipped once already, which is why it belongs in
 *   the permanent set rather than in a one-off run.
 *
 *   This does NOT reinvent the check. `engine-api-guards.js` already ships `snapshotPriceState` and
 *   `diffPriceState`, including the subtlety that after a legitimate visible-range sync a peer re-fits its
 *   own price axis and `autoScale` must stay TRUE. Those exact field names and that exact mode distinction
 *   are reused here. The gauge also records whether the peer's own time window moved, because that decides
 *   which of the two gradings is the honest one: if the peer never moved, ANY price change is contamination.
 */
import fs from 'node:fs';

import { bootConf01Session, readConf01State } from './lib/conf01-session.mjs';
import { PO_TWO_INDICATORS } from './replay-decay-hunt.mjs';

const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};
const WINDOWS = Number(argOf('windows', 5));
const WINDOW_MS = Number(argOf('window-ms', 6_000));
const OUT = argOf('out', 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\PERM-GAUGES-20260731.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = {
  signature: 'PERM-GAUGES-V1',
  artifactFile: OUT.split('\\').pop(),
  ruling: 'PERM-01 permanent set; the 14:00 ruling redefining L1; the 14:25 ruling naming the original bug',
  standingGate: true,
  standingGateNote: 'Under PERM-01 a gate outlives the fix that created it. Both gauges here are written to run on every commit, and disabling either requires the same authority as shipping a defect.',
  bfcacheState: 'ENABLED (Chrome default). Not under test in either gauge; declared because RESET-01 requires it on every artifact.',
  startedAtIso: new Date().toISOString(),
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
save();

/** Per-realm paint counters, wrapping whatever draw entry point this build exposes. */
const installPerRealmPaintCounter = () => {
  if (window.__permPaint) return { already: true, wrapped: window.__permPaint.wrapped };
  const c = { paints: 0, installedAt: Date.now(), wrapped: [], isHost: window.top === window };
  window.__permPaint = c;
  const ch = window.chart;
  for (const name of ['draw', 'render', 'redraw', '_draw', 'paint']) {
    if (ch && typeof ch[name] === 'function' && !ch[name].__permWrapped) {
      const orig = ch[name].bind(ch);
      const wrapped = function (...a) { c.paints += 1; return orig(...a); };
      wrapped.__permWrapped = true;
      try { ch[name] = wrapped; c.wrapped.push(name); } catch { /* frozen */ }
    }
  }
  return { already: false, wrapped: c.wrapped, isHost: c.isHost };
};

const readPerRealmPaints = () => {
  const c = window.__permPaint;
  return c ? { paints: c.paints, isHost: c.isHost, wrapped: c.wrapped } : null;
};

(async () => {
  let session = null;
  let browser = null;
  try {
    session = await bootConf01Session({
      indicators: PO_TWO_INDICATORS,
      replaySpeed: 1,
      placeOrder: false,
      label: 'perm-gauges',
    });
    browser = session.browser;
    const { page } = session;
    report.buildStamp = session.conf01?.buildId ?? null;
    report.conf01 = { panels: session.conf01?.panels ?? null, distinctTimeframes: session.conf01?.distinctTimeframes ?? null };

    // =====================================================================
    // GAUGE 1 — host-realm paints/sec at 1x, static dataset
    // =====================================================================
    // "Static dataset" means nothing is changing. The replay is armed at 1x and then PAUSED, so any paint
    // observed is a paint of unchanged data — which is the whole point. Leaving it playing would measure
    // paints of real work and could not distinguish need from waste.
    const paused = await page.evaluate(() => {
      const out = [];
      for (const w of [window, ...Array.from(window.frames || [])]) {
        try {
          const rs = w.chart?.replaySystem;
          if (rs && typeof rs.pause === 'function') { rs.pause(); out.push('paused'); }
          else if (rs) { rs.isPlaying = false; out.push('flag-cleared'); }
        } catch { /* cross-origin or absent */ }
      }
      return out;
    }).catch(() => []);
    // Pausing from the host cannot reach same-origin iframes reliably through window.frames in every build,
    // so pause each frame directly too and record what actually stopped.
    for (const frame of page.frames()) {
      await frame.evaluate(() => {
        try {
          const rs = window.chart?.replaySystem;
          if (rs && typeof rs.pause === 'function') rs.pause();
          else if (rs) rs.isPlaying = false;
        } catch { /* ignore */ }
      }).catch(() => {});
    }
    await sleep(3_000);
    const stateWhileStatic = await readConf01State(page, { advanceWindowMs: 4_000 }).catch(() => null);
    report.gauge1 = {
      gauge: 'host-realm paints/sec at 1x, static dataset',
      replacesWithdrawnRow: 'paints per candle (141 today, ceiling single digits) — withdrawn because the unfixed build already scores 5.9 at 60x',
      pauseCalls: paused,
      datasetIsStatic: (stateWhileStatic?.advancingPanels ?? null) === 0,
      advancingPanelsWhileStatic: stateWhileStatic?.advancingPanels ?? null,
      staticnessNote: (stateWhileStatic?.advancingPanels ?? null) === 0
        ? 'Confirmed static: zero panels advanced over a 4-second observation window, so every paint counted below is a paint of unchanged data.'
        : `NOT STATIC: ${stateWhileStatic?.advancingPanels} panel(s) still advanced during the observation window. The rate below therefore includes paints of real work and OVERSTATES waste; this is declared rather than hidden.`,
      windows: [],
    };

    for (const frame of page.frames()) {
      await frame.evaluate(installPerRealmPaintCounter).catch(() => {});
    }

    const readAllRealms = async () => {
      const rows = [];
      for (const frame of page.frames()) {
        const r = await frame.evaluate(readPerRealmPaints).catch(() => null);
        if (r) rows.push(r);
      }
      return rows;
    };

    let prev = await readAllRealms();
    for (let w = 1; w <= WINDOWS; w += 1) {
      await sleep(WINDOW_MS);
      const now = await readAllRealms();
      const host = now.find((r) => r.isHost);
      const hostPrev = prev.find((r) => r.isHost);
      const hostDelta = (host && hostPrev) ? host.paints - hostPrev.paints : null;
      const allDelta = now.reduce((s, r, i) => s + Math.max(0, r.paints - (prev[i]?.paints ?? r.paints)), 0);
      const row = {
        window: w,
        seconds: +(WINDOW_MS / 1000).toFixed(1),
        hostPaints: hostDelta,
        hostPaintsPerSec: hostDelta != null ? +(hostDelta / (WINDOW_MS / 1000)).toFixed(1) : null,
        allRealmPaints: allDelta,
        allRealmPaintsPerSec: +(allDelta / (WINDOW_MS / 1000)).toFixed(1),
        hostSharePct: allDelta > 0 && hostDelta != null ? +(100 * hostDelta / allDelta).toFixed(1) : null,
        realmsCounted: now.length,
        wrappedInHost: host?.wrapped ?? null,
      };
      report.gauge1.windows.push(row);
      console.error(`[g1] window ${w}: host ${row.hostPaintsPerSec}/s (${row.hostSharePct}% of ${row.allRealmPaintsPerSec}/s across ${row.realmsCounted} realms)`);
      prev = now;
      save();
    }

    // --- VER-07 negative control: prove the counter still rises when something DOES change ---
    const before = await readAllRealms();
    await page.evaluate(() => {
      // A deliberate change: force the host chart to redraw once via its own entry point.
      try { window.chart?.draw?.() ?? window.chart?.render?.(); } catch { /* ignore */ }
      // And a real user-visible change that must legitimately repaint.
      try { window.dispatchEvent(new Event('resize')); } catch { /* ignore */ }
    }).catch(() => {});
    await sleep(3_000);
    const after = await readAllRealms();
    const hostBefore = before.find((r) => r.isHost)?.paints ?? null;
    const hostAfter = after.find((r) => r.isHost)?.paints ?? null;
    report.gauge1.negativeControl = {
      why: 'VER-07. A gate asserting only that paints/sec is LOW would pass a host that has stopped painting entirely, which is a worse defect. This proves the counter is live.',
      hostPaintsBefore: hostBefore,
      hostPaintsAfter: hostAfter,
      roseOnChange: (hostBefore != null && hostAfter != null) ? hostAfter > hostBefore : null,
      verdict: (hostBefore != null && hostAfter != null && hostAfter > hostBefore)
        ? 'PASS — the counter rose when something changed, so a low reading would mean "does not paint needlessly" rather than "has stopped painting".'
        : 'FAIL — the counter did not rise on a deliberate change, so this gauge cannot distinguish a quiet host from a frozen one and no low reading from it may be trusted.',
    };

    // --- The control that actually matters: does the counter catch the NATURAL paint loop? ---
    // Forcing `chart.render()` proves only that my wrapper increments, which is circular. The honest control
    // is to resume playback at 1x — the exact condition under which the S1 sweep recorded ~131 paints/sec —
    // and show the same counter reads it. If it does, a static reading of zero is a real measurement of the
    // product rather than a silent instrument.
    await page.evaluate(() => {
      for (const w of [window]) {
        try { w.chart?.replaySystem?.play?.(); } catch { /* ignore */ }
      }
    }).catch(() => {});
    for (const frame of page.frames()) {
      await frame.evaluate(() => {
        try {
          const rs = window.chart?.replaySystem;
          if (rs?.play) rs.play();
          else if (rs) rs.isPlaying = true;
        } catch { /* ignore */ }
      }).catch(() => {});
    }
    await sleep(5_000);
    const playingState = await readConf01State(page, { advanceWindowMs: 4_000 }).catch(() => null);
    let prevPlaying = await readAllRealms();
    const playingWindows = [];
    for (let w = 1; w <= 3; w += 1) {
      await sleep(WINDOW_MS);
      const now = await readAllRealms();
      const host = now.find((r) => r.isHost);
      const hostPrev = prevPlaying.find((r) => r.isHost);
      const hostDelta = (host && hostPrev) ? host.paints - hostPrev.paints : null;
      const allDelta = now.reduce((s, r, i) => s + Math.max(0, r.paints - (prevPlaying[i]?.paints ?? r.paints)), 0);
      playingWindows.push({
        window: w,
        hostPaintsPerSec: hostDelta != null ? +(hostDelta / (WINDOW_MS / 1000)).toFixed(1) : null,
        allRealmPaintsPerSec: +(allDelta / (WINDOW_MS / 1000)).toFixed(1),
        hostSharePct: allDelta > 0 && hostDelta != null ? +(100 * hostDelta / allDelta).toFixed(1) : null,
      });
      console.error(`[g1] PLAYING window ${w}: host ${playingWindows[w - 1].hostPaintsPerSec}/s (${playingWindows[w - 1].hostSharePct}% of ${playingWindows[w - 1].allRealmPaintsPerSec}/s)`);
      prevPlaying = now;
    }
    const playRates = playingWindows.map((r) => r.hostPaintsPerSec).filter((v) => v != null);
    const playMean = playRates.length ? playRates.reduce((s, v) => s + v, 0) / playRates.length : null;
    report.gauge1.playingControl = {
      why: 'Forcing chart.render() is circular — it proves the wrapper increments, not that the counter sees the real loop. Resuming playback at 1x reproduces the condition under which S1 recorded ~131 paints/sec in the host.',
      advancingPanelsWhilePlaying: playingState?.advancingPanels ?? null,
      hostPaintsPerSecByWindow: playRates,
      meanHostPaintsPerSecWhilePlaying: playMean != null ? +playMean.toFixed(1) : null,
      meanHostSharePct: (() => {
        const s = playingWindows.map((r) => r.hostSharePct).filter((v) => v != null);
        return s.length ? +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1) : null;
      })(),
      verdict: playMean == null
        ? 'VOID — no host rate readable while playing, so the static zero is UNVALIDATED and must not be reported as green.'
        : (playMean > 1
          ? `VALIDATED: the same counter reads ${playMean.toFixed(1)} host paints/sec while playing at 1x, so it does see the natural loop and the static reading is a real measurement of the product.`
          : `NOT VALIDATED: the counter reads ${playMean.toFixed(1)}/s even while playing, against ~131 recorded by S1 on this build family. The counter is probably attached to an entry point this path does not call, and NO reading from this gauge may be trusted.`),
    };
    console.error(`[g1] playing control: ${report.gauge1.playingControl.verdict}`);
    save();

    const rates = report.gauge1.windows.map((r) => r.hostPaintsPerSec).filter((v) => v != null);
    const mean = rates.length ? rates.reduce((s, v) => s + v, 0) / rates.length : null;
    report.gauge1.hostPaintsPerSecByWindow = rates;
    report.gauge1.meanHostPaintsPerSec = mean != null ? +mean.toFixed(1) : null;
    report.gauge1.meanHostSharePct = (() => {
      const s = report.gauge1.windows.map((r) => r.hostSharePct).filter((v) => v != null);
      return s.length ? +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1) : null;
    })();
    // GATE-01: this must be RED on current source or it is not measuring anything.
    const counterValidated = (report.gauge1.playingControl?.meanHostPaintsPerSecWhilePlaying ?? 0) > 1;
    report.gauge1.gateStatus = mean == null ? 'VOID'
      : (!counterValidated ? 'VOID'
        : (mean > 1 ? 'RED' : 'GREEN'));
    report.gauge1.conditionCaveat = counterValidated && mean != null && mean <= 1
      ? `THE ROW AS WRITTEN WOULD GO GREEN ON THIS BROKEN BUILD. BUDGET-01 records "host paints/sec at 1x, static dataset" with a measured value of ~131, but that 131 was measured at 1x WHILE PLAYING. With the dataset genuinely static the unfixed build scores ${mean.toFixed(1)}/s, while the same counter reads ${report.gauge1.playingControl.meanHostPaintsPerSecWhilePlaying}/s the moment playback resumes. The measured value and the stated condition come from different runs, so the replacement row repeats in a new form exactly the failure that retired the paints-per-candle row. The defect is real and it lives in the PLAYING path: the gate must be host paints/sec at 1x WHILE PLAYING, with the static reading kept as a second row locked at zero.`
      : null;
    report.gauge1.verdict = mean == null
      ? 'VOID — no host paint rate could be read.'
      : (mean > 1
        ? `RED on current source, as a gate should be: the host realm paints ${mean.toFixed(1)} times per second with NOTHING CHANGING, ${report.gauge1.meanHostSharePct}% of all painting. The kill condition is that the host paints only when something changed.`
        : `GREEN: the host paints ${mean.toFixed(1)} times per second on a static dataset. Negative control ${report.gauge1.negativeControl.roseOnChange ? 'confirms the counter is live' : 'FAILED, so this green cannot be trusted'}.`);
    console.error(`[g1] ${report.gauge1.gateStatus}: ${report.gauge1.verdict}`);
    save();

    // =====================================================================
    // GAUGE 2 — the original bug: pan a higher-TF panel, assert a lower-TF peer's price range is untouched
    // =====================================================================
    const tfMinutes = (tf) => {
      const s = String(tf || '').trim().toLowerCase();
      const m = s.match(/^(\d+)\s*(m|h|d|w)?$/);
      if (!m) return null;
      const n = Number(m[1]);
      return { m: n, h: n * 60, d: n * 1440, w: n * 10080 }[m[2] || 'm'] ?? n;
    };

    // Snapshot uses the SAME field names as engine-api-guards.js snapshotPriceState.
    const snapshotSource = () => {
      const ch = window.chart;
      if (!ch) return null;
      const ps = ch.priceScale || {};
      return {
        price: {
          'priceScale.min': ps.min ?? null,
          'priceScale.max': ps.max ?? null,
          'priceScale.autoScale': ps.autoScale ?? null,
          'priceScale.mode': ps.mode ?? null,
          'priceScale.locked': ps.locked ?? null,
          autoScale: ch.autoScale ?? null,
          priceZoom: ch.priceZoom ?? null,
          priceOffset: ch.priceOffset ?? null,
          manualCenterPrice: ch.manualCenterPrice ?? null,
          manualRange: ch.manualRange ?? null,
        },
        // Whether the peer's own time window moved decides which grading is honest.
        timeWindow: {
          visibleStartIndex: ch.visibleStartIndex ?? null,
          visibleEndIndex: ch.visibleEndIndex ?? null,
          bars: Array.isArray(ch.data) ? ch.data.length : null,
        },
        timeframe: ch.currentTimeframe != null ? String(ch.currentTimeframe) : null,
        fileId: ch.currentFileId != null ? String(ch.currentFileId) : null,
      };
    };

    const framesWithCharts = [];
    for (const frame of page.frames()) {
      const snap = await frame.evaluate(snapshotSource).catch(() => null);
      if (snap) framesWithCharts.push({ frame, snap });
    }
    const withTf = framesWithCharts
      .map((f) => ({ ...f, minutes: tfMinutes(f.snap.timeframe) }))
      .filter((f) => f.minutes != null)
      .sort((a, b) => b.minutes - a.minutes);

    report.gauge2 = {
      gauge: 'the original bug — pan a higher-TF panel, assert a lower-TF peer price range does not change',
      provenance: 'homepage/public/chart/multichart/README.md: "Original bug verified absent: pan higher-TF chart, lower-TF candles do not compress vertically." It shipped once, so it is permanent under PERM-01.',
      reusesShippedGuard: 'Field names and the visibleRange-mode subtlety (autoScale must stay TRUE after a legitimate re-fit) are taken from engine-api-guards.js snapshotPriceState/diffPriceState rather than reinvented.',
      realmsWithCharts: framesWithCharts.length,
      timeframesFound: withTf.map((f) => f.snap.timeframe),
    };

    if (withTf.length < 2) {
      report.gauge2.status = 'VOID';
      report.gauge2.void = `needs at least two realms with parseable timeframes; found ${withTf.length} of ${framesWithCharts.length} charts (${framesWithCharts.map((f) => f.snap.timeframe).join(', ')})`;
    } else {
      const higher = withTf[0];
      const lower = withTf[withTf.length - 1];
      report.gauge2.higherTf = higher.snap.timeframe;
      report.gauge2.lowerTfPeer = lower.snap.timeframe;

      const peerBefore = await lower.frame.evaluate(snapshotSource).catch(() => null);

      // Pan the higher-TF panel. A synthetic drag on its canvas is what a user does; if the canvas cannot
      // be located, fall back to the chart's own scroll and record which route was taken, because a pan
      // that did not happen would make this gate pass vacuously.
      let panRoute = null;
      let panned = false;
      try {
        const el = await higher.frame.$('canvas');
        const box = el ? await el.boundingBox() : null;
        if (box && box.width > 50) {
          const cx = box.x + box.width * 0.6;
          const cy = box.y + box.height * 0.5;
          await page.mouse.move(cx, cy);
          await page.mouse.down();
          for (let i = 1; i <= 12; i += 1) await page.mouse.move(cx - i * 18, cy, { steps: 2 });
          await page.mouse.up();
          panRoute = 'synthetic drag on the higher-TF canvas';
          panned = true;
        }
      } catch (err) {
        report.gauge2.dragError = String(err?.message || err).slice(0, 140);
      }
      if (!panned) {
        panned = await higher.frame.evaluate(() => {
          const ch = window.chart;
          if (!ch) return false;
          if (typeof ch.visibleStartIndex === 'number' && typeof ch.visibleEndIndex === 'number') {
            const span = ch.visibleEndIndex - ch.visibleStartIndex;
            ch.visibleStartIndex = Math.max(0, ch.visibleStartIndex - Math.round(span * 0.3));
            ch.visibleEndIndex = ch.visibleStartIndex + span;
            try { ch.draw?.() ?? ch.render?.(); } catch { /* ignore */ }
            return true;
          }
          return false;
        }).catch(() => false);
        if (panned) panRoute = 'chart visibleStartIndex/visibleEndIndex shift (canvas drag unavailable)';
      }
      await sleep(4_000);

      const higherAfter = await higher.frame.evaluate(snapshotSource).catch(() => null);
      const peerAfter = await lower.frame.evaluate(snapshotSource).catch(() => null);
      report.gauge2.panRoute = panRoute;
      report.gauge2.panActuallyMovedHigherTf = (higher.snap.timeWindow?.visibleStartIndex != null && higherAfter?.timeWindow?.visibleStartIndex != null)
        ? higherAfter.timeWindow.visibleStartIndex !== higher.snap.timeWindow.visibleStartIndex
        : null;

      const changed = [];
      for (const k of Object.keys(peerBefore?.price || {})) {
        const a = peerBefore.price[k];
        const b = peerAfter?.price?.[k];
        if (a !== b) changed.push(`${k}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
      }
      const peerTimeMoved = (peerBefore?.timeWindow?.visibleStartIndex != null && peerAfter?.timeWindow?.visibleStartIndex != null)
        ? peerBefore.timeWindow.visibleStartIndex !== peerAfter.timeWindow.visibleStartIndex
        : null;
      // diffPriceState's visibleRange mode: value fields may drift on a legitimate re-fit, modal flags may
      // not, and autoScale must stay TRUE.
      const modalFields = new Set(['priceScale.mode', 'priceScale.locked']);
      const modalViolations = changed.filter((c) => modalFields.has(c.split(':')[0]));
      const autoScaleDisabled = [peerAfter?.price?.autoScale, peerAfter?.price?.['priceScale.autoScale']]
        .some((v, i) => {
          const beforeV = [peerBefore?.price?.autoScale, peerBefore?.price?.['priceScale.autoScale']][i];
          return beforeV === true && v !== true && v != null;
        });

      report.gauge2.peerBefore = peerBefore;
      report.gauge2.peerAfter = peerAfter;
      report.gauge2.peerPriceFieldsChanged = changed;
      report.gauge2.peerTimeWindowMoved = peerTimeMoved;
      report.gauge2.strictGrading = changed.length === 0
        ? 'CLEAN — not one price field on the lower-TF peer moved'
        : `${changed.length} price field(s) on the peer moved`;
      report.gauge2.visibleRangeGrading = (modalViolations.length === 0 && !autoScaleDisabled)
        ? 'CLEAN under the shipped guard semantics — no modal field changed and autoScale was not disabled'
        : `CONTAMINATED: modal violations ${JSON.stringify(modalViolations)}${autoScaleDisabled ? ', and autoScale was disabled by the peer sync' : ''}`;
      report.gauge2.whichGradingIsHonest = peerTimeMoved === false
        ? 'STRICT. The peer\'s own time window did NOT move, so it had no newly-visible candles to re-fit to, and ANY price change is contamination from the panned chart.'
        : (peerTimeMoved === true
          ? 'visibleRange. The peer\'s time window moved too, so it legitimately re-fits its own price axis; only modal flags and autoScale-stays-true are enforceable.'
          : 'UNDETERMINED — the peer\'s visible index was unreadable, so neither grading can be trusted and this gate is VOID rather than green.');

      const honestlyClean = peerTimeMoved === false
        ? changed.length === 0
        : (peerTimeMoved === true ? (modalViolations.length === 0 && !autoScaleDisabled) : null);
      report.gauge2.status = (panned && honestlyClean != null) ? 'OK' : 'VOID';
      report.gauge2.gateStatus = !panned ? 'VOID' : (honestlyClean === null ? 'VOID' : (honestlyClean ? 'GREEN' : 'RED'));
      report.gauge2.verdict = !panned
        ? 'VOID — the higher-TF panel could not be panned by either route, so a clean peer proves nothing. A gate that passes because the action never happened is worse than no gate.'
        : (honestlyClean === null
          ? 'VOID — the peer\'s visible index could not be read, so it is not possible to say whether a price change was a legitimate re-fit or contamination.'
          : (honestlyClean
            ? `GREEN — the original bug is absent: panned the ${higher.snap.timeframe} panel (${panRoute}) and the ${lower.snap.timeframe} peer's price axis held. Graded ${peerTimeMoved === false ? 'strictly, because the peer never moved' : 'under visibleRange semantics, because the peer\'s own window moved'}.`
            : `RED — the original bug is BACK: panning the ${higher.snap.timeframe} panel changed the ${lower.snap.timeframe} peer's price state: ${changed.join('; ')}`));
      console.error(`[g2] ${report.gauge2.gateStatus}: ${report.gauge2.verdict}`);
    }
    report.status = 'OK';
  } catch (err) {
    report.status = 'VOID';
    report.void = String(err?.message || err).slice(0, 300);
  } finally {
    try { await browser?.close?.(); } catch { /* gone */ }
  }
  report.signatureFilenameCheck = OUT.endsWith(report.artifactFile) ? 'PASS' : `FAIL: ${OUT} vs ${report.artifactFile}`;
  save();
  console.error(`\n=== PERM GAUGES ${report.status} build=${report.buildStamp} ===`);
  console.error(`gauge 1 host paints/sec static: ${report.gauge1?.gateStatus} — ${report.gauge1?.meanHostPaintsPerSec}/s, host share ${report.gauge1?.meanHostSharePct}%`);
  console.error(`  negative control: ${report.gauge1?.negativeControl?.verdict}`);
  console.error(`gauge 2 original bug: ${report.gauge2?.gateStatus} — ${report.gauge2?.verdict}`);
  console.error(`signature/filename: ${report.signatureFilenameCheck}`);
  console.error(`artifact ${OUT}`);
  process.exit(0);
})();
