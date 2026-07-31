#!/usr/bin/env node
/**
 * STANDING-SCENARIOS-V1 — item 8 and item 10 of the SWEEP-01 matrix. Six scenarios, run once
 * each, several of which close questions that have been carried for days.
 *
 *   idle         Chart open, NOT playing, foreground. Ten minutes. Memory and CPU slope.
 *   background   The same, backgrounded, with Chrome's throttling left ON. The PO measured
 *                1.24 GB and 18.8% CPU on an idle backgrounded tab and nobody explained it.
 *   teardown     Open multichart, close it, ten times. Does anything come back down?
 *   seekrewind   Jump backward repeatedly during replay. Elements, memory, and correctness —
 *                the host panel rewound and stopped mid-run during the duration gate.
 *   pancold      Scroll far back from the playhead. Does data return, and is anything released?
 *                The reversibility half of EVICT-03.
 *   torture      Four panels, four indicators each, drawings, accumulating orders, tick mode,
 *                60x. Not a fair test of anything — an upper bound worth knowing before canary.
 *
 * Each scenario states its own acceptance in the artifact so the verdict is not a matter of taste.
 */
import fs from 'node:fs';

import { bootConf01Session, keepConf01Playing, readConf01State, CONF01_PANEL_IDS } from './lib/conf01-session.mjs';
import { HEAP_CYCLE_PO_INDICATORS } from './lib/heap-cycle-po-workload.mjs';
import { fitTrend } from './lib/duration-trend.mjs';
import { installSweepCounters, readSweepGauges, SWEEP_GAUGE_SCOPE_NOTE } from './lib/sweep-gauges.mjs';
import { readOsFootprints } from './process-memory-census.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EVIDENCE = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C';

const SCENARIOS = {
  idle: {
    minutes: 10,
    question: 'Does an open, non-playing chart grow?',
    acceptance: 'Flat is a design cost and closes the row. Any monotonic climb with no bars advancing is a leak that has nothing to do with replay, which would be a new finding.',
  },
  background: {
    minutes: 10,
    question: 'Why does an idle backgrounded tab burn CPU and hold 1.24 GB?',
    acceptance: 'CPU near zero means the PO measured something we cannot reproduce headless and I say so. CPU materially above zero with no bars advancing names a timer that does not stop when the tab is hidden.',
    allowBackgroundThrottling: true,
  },
  teardown: {
    cycles: 10,
    question: 'Does closing the multichart return memory to its floor?',
    acceptance: 'Floor returning to baseline kills the residue hypothesis. A monotonic floor is the residue, measured cleanly for the first time.',
  },
  seekrewind: {
    seeks: 12,
    question: 'Does repeated backward seeking corrupt state or accumulate?',
    acceptance: 'Playback must still be advancing after every seek, and elements must not ratchet. A panel that stops advancing and never resumes reproduces the duration-gate defect.',
  },
  pancold: {
    pans: 6,
    question: 'Does panning far back return data, and does anything get released?',
    acceptance: 'Bars must be present in the panned-to range (data returns correctly) and resident totals tell us whether panning releases anything or only adds.',
  },
  torture: {
    minutes: 12,
    question: 'How fast can we kill it? Upper bound only.',
    acceptance: 'No acceptance. A number.',
  },
};

async function gauge(page, cdp, browserCdp, extra = {}) {
  const g = await readSweepGauges(page, cdp, browserCdp, { cpuWindowMs: 6_000, readOsFootprints, ...extra });
  return g;
}

function slopePerMin(samples, pick) {
  const pts = samples.map((s, i) => ({ hours: s.atMinutes ?? i, value: pick(s) }))
    .filter((p) => Number.isFinite(p.hours) && Number.isFinite(p.value));
  if (pts.length < 4) return null;
  const f = fitTrend(pts, { label: 'per minute', minSpanHours: 0 });
  return { perMin: f.perHour ?? null, ci: f.slopeCi95 ?? null, verdict: f.verdict, n: pts.length };
}

/** Pauses every realm's replay, so "idle" means idle rather than "quietly playing". */
async function pauseEverything(page) {
  const out = [];
  for (const frame of page.frames()) {
    try {
      out.push(await frame.evaluate(() => {
        const rs = window.chart && window.chart.replaySystem;
        if (!rs) return null;
        for (const m of ['pausePlayback', 'pause', 'stopPlayback', 'stop']) {
          if (typeof rs[m] === 'function') { try { rs[m](); } catch (_) { /* next */ } }
        }
        return { playing: !!rs.isPlaying, index: rs.currentIndex ?? null };
      }));
    } catch { /* frame gone */ }
  }
  return out.filter(Boolean);
}

async function runTimed(name, cfg, bootOpts, { play = true, onBooted = null } = {}) {
  const report = {
    signature: `STANDING-${name.toUpperCase()}-V1`,
    ruling: '3df92902c SWEEP-01 item 8',
    scenario: name,
    question: cfg.question,
    acceptance: cfg.acceptance,
    gaugeScope: SWEEP_GAUGE_SCOPE_NOTE,
    startedAtIso: new Date().toISOString(),
    samples: [],
  };
  const outPath = `${EVIDENCE}\\STANDING-${name.toUpperCase()}-20260731.json`;
  const save = () => fs.writeFileSync(outPath, JSON.stringify(report, null, 1));
  let session = null;
  try {
    session = await bootConf01Session(bootOpts);
    const { page, cdp, browserCdp, conf01 } = session;
    report.conf01 = { compliant: conf01?.compliant, failed: conf01?.failed };
    report.build = await page.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null).catch(() => null);
    await installSweepCounters(page);
    if (onBooted) report.setup = await onBooted(page, cdp, browserCdp, report);
    if (!play) report.paused = await pauseEverything(page);

    const startedAt = Date.now();
    let n = 0;
    let prev = null;
    while ((Date.now() - startedAt) / 60_000 < cfg.minutes) {
      n += 1;
      const g = await gauge(page, cdp, browserCdp, { forceGc: n === 1 });
      g.atMinutes = +((Date.now() - startedAt) / 60_000).toFixed(2);
      const st = await readConf01State(page, { advanceWindowMs: 3_000 }).catch(() => null);
      g.advancingPanels = st?.advancingPanels ?? null;
      const hostIdx = g.realms[0]?.replayIndex ?? null;
      if (prev && prev.hostIdx != null && hostIdx != null) {
        const secs = (Date.parse(g.atIso) - Date.parse(prev.atIso)) / 1000;
        g.derived = { barsAdvanced: hostIdx - prev.hostIdx, windowSec: +secs.toFixed(1) };
      }
      report.samples.push(g);
      prev = { atIso: g.atIso, hostIdx };
      console.error(`[${name}] #${n} ${g.atMinutes}min cpu=${g.cpu.rendererCpuPercent}% gpu=${g.cpu.gpuCpuPercent}% footprint=${g.footprint.pageRendererPrivateMB} heap=${g.summed.heapMB} elements=${g.summed.elements} resident=${g.summed.residentBars} bars=${g.derived?.barsAdvanced ?? '-'} adv=${g.advancingPanels} paints/s=${g.summed.paints != null ? 'cum' : '-'}`);
      save();
    }
    report.trends = {
      footprintMBPerMin: slopePerMin(report.samples, (s) => s.footprint?.pageRendererPrivateMB),
      heapMBPerMin: slopePerMin(report.samples, (s) => s.summed?.heapMB),
      elementsPerMin: slopePerMin(report.samples, (s) => s.summed?.elements),
      residentBarsPerMin: slopePerMin(report.samples, (s) => s.summed?.residentBars),
      listenersPerMin: slopePerMin(report.samples, (s) => s.counters?.live?.listeners),
    };
    const mean = (f) => {
      const v = report.samples.map(f).filter(Number.isFinite);
      return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null;
    };
    report.means = {
      rendererCpuPercent: mean((s) => s.cpu?.rendererCpuPercent),
      gpuCpuPercent: mean((s) => s.cpu?.gpuCpuPercent),
      footprintMB: mean((s) => s.footprint?.pageRendererPrivateMB),
      totalPrivateMB: mean((s) => s.footprint?.totalPrivateMB),
      barsAdvancedPerWindow: mean((s) => s.derived?.barsAdvanced),
    };
    report.status = 'OK';
  } catch (e) {
    report.status = 'VOID';
    report.reason = String(e?.message || e).slice(0, 240);
    console.error(`[${name}] VOID — ${report.reason}`);
  } finally {
    report.endedAtIso = new Date().toISOString();
    save();
    if (session) {
      await session.cdp?.detach?.().catch(() => {});
      await session.browser?.close?.().catch(() => {});
    }
  }
  return report;
}

async function runIdle() {
  return runTimed('idle', SCENARIOS.idle, {
    replaySpeed: 60, indicators: HEAP_CYCLE_PO_INDICATORS.slice(0, 2), placeOrder: false,
  }, { play: false });
}

async function runBackground() {
  return runTimed('background', SCENARIOS.background, {
    replaySpeed: 60,
    indicators: HEAP_CYCLE_PO_INDICATORS.slice(0, 2),
    placeOrder: false,
    allowBackgroundThrottling: true,
  }, {
    play: false,
    onBooted: async (page) => {
      // A second tab brought to the front is what makes the chart tab genuinely hidden; setting
      // visibilityState by script would only lie to the page's own listeners.
      const other = await page.browser().newPage();
      await other.goto('about:blank');
      await other.bringToFront();
      await sleep(3_000);
      const hidden = await page.evaluate(() => ({
        visibilityState: document.visibilityState, hidden: document.hidden,
      })).catch(() => null);
      console.error(`[background] chart tab now ${JSON.stringify(hidden)}`);
      return { backgroundedVia: 'second tab brought to front', throttlingLeftOn: true, hidden };
    },
  });
}

async function runTorture() {
  return runTimed('torture', SCENARIOS.torture, {
    replaySpeed: 60,
    indicators: HEAP_CYCLE_PO_INDICATORS, // all four
    placeOrder: true,
  }, {
    play: true,
    onBooted: async (page) => {
      // Drawings and tick mode are the two ingredients the standing scenarios add on top of
      // CONF-02. Both are best-effort: a missing API is recorded, never fatal.
      const setup = await page.evaluate(() => {
        const out = { tickMode: [], drawings: 0, drawingApi: null };
        const rs = window.chart && window.chart.replaySystem;
        if (rs && typeof rs.setPlaybackMode === 'function') {
          try { rs.setPlaybackMode('tick', { restartPlayback: false }); out.tickMode.push(rs.getPlaybackMode?.() ?? 'set'); } catch (e) { out.tickMode.push(`err:${String(e.message).slice(0, 60)}`); }
        }
        const dt = window.chart && (window.chart.drawingTools || window.chart.drawings);
        if (dt) {
          out.drawingApi = Object.keys(dt).filter((k) => typeof dt[k] === 'function').slice(0, 12);
          const data = window.chart.data || [];
          const add = dt.addDrawing || dt.add || dt.createDrawing;
          if (typeof add === 'function' && data.length > 40) {
            for (let i = 0; i < 8; i += 1) {
              const a = data[Math.max(0, data.length - 40 + i * 3)];
              const b = data[Math.max(0, data.length - 20 + i)];
              if (!a || !b) continue;
              try {
                add.call(dt, { type: 'trendline', points: [{ time: a.t ?? a.time, price: a.c ?? a.close }, { time: b.t ?? b.time, price: b.c ?? b.close }] });
                out.drawings += 1;
              } catch (_) { /* API shape differs; count stays honest */ }
            }
          }
        }
        return out;
      }).catch((e) => ({ error: String(e?.message || e).slice(0, 140) }));
      console.error(`[torture] setup ${JSON.stringify(setup)}`);
      return setup;
    },
  });
}

/** Ten open/close cycles. The floor after each close is the residue measurement. */
async function runTeardown() {
  const cfg = SCENARIOS.teardown;
  const report = {
    signature: 'STANDING-TEARDOWN-V1',
    ruling: '3df92902c SWEEP-01 item 8',
    scenario: 'teardown',
    question: cfg.question,
    acceptance: cfg.acceptance,
    gaugeScope: SWEEP_GAUGE_SCOPE_NOTE,
    startedAtIso: new Date().toISOString(),
    cycles: [],
  };
  const outPath = `${EVIDENCE}\\STANDING-TEARDOWN-20260731.json`;
  const save = () => fs.writeFileSync(outPath, JSON.stringify(report, null, 1));
  let session = null;
  try {
    session = await bootConf01Session({ replaySpeed: 60, indicators: [], placeOrder: false });
    const { page, cdp, browserCdp } = session;
    report.build = await page.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null).catch(() => null);
    await installSweepCounters(page);
    const { applyDistV9LayoutViaUi } = await import('./lib/heap-cycle-browser.mjs');

    for (let cycle = 1; cycle <= cfg.cycles; cycle += 1) {
      // Close to single, settle, then read the floor. The floor is the number that matters.
      await applyDistV9LayoutViaUi(page, 1, 0).catch(() => {});
      await sleep(6_000);
      const floor = await gauge(page, cdp, browserCdp, { forceGc: true });
      floor.cycle = cycle;
      floor.phase = 'floor-after-close';
      report.cycles.push(floor);
      console.error(`[teardown] cycle ${cycle} FLOOR footprint=${floor.footprint.pageRendererPrivateMB} heap=${floor.counters.collected?.jsHeapMB} nodes=${floor.counters.collected?.nodes} docs=${floor.counters.collected?.documents} listeners=${floor.counters.collected?.listeners} elements=${floor.summed.elements} resident=${floor.summed.residentBars}`);
      save();
      if (cycle < cfg.cycles) {
        await applyDistV9LayoutViaUi(page, 4, 0).catch(() => {});
        await sleep(8_000);
      }
    }
    const pick = (f) => report.cycles.map((c, i) => ({ hours: i + 1, value: f(c) })).filter((p) => Number.isFinite(p.value));
    const fit = (f, label) => {
      const pts = pick(f);
      return pts.length >= 4 ? { ...fitTrend(pts, { label, minSpanHours: 0 }), perCycle: fitTrend(pts, { label, minSpanHours: 0 }).perHour } : null;
    };
    report.trends = {
      footprintMBPerCycle: fit((c) => c.footprint?.pageRendererPrivateMB, 'footprint'),
      postGcHeapMBPerCycle: fit((c) => c.counters?.collected?.jsHeapMB, 'heap'),
      nodesPerCycle: fit((c) => c.counters?.collected?.nodes, 'nodes'),
      documentsPerCycle: fit((c) => c.counters?.collected?.documents, 'documents'),
      listenersPerCycle: fit((c) => c.counters?.collected?.listeners, 'listeners'),
      residentBarsPerCycle: fit((c) => c.summed?.residentBars, 'resident bars'),
    };
    report.status = 'OK';
  } catch (e) {
    report.status = 'VOID';
    report.reason = String(e?.message || e).slice(0, 240);
    console.error(`[teardown] VOID — ${report.reason}`);
  } finally {
    report.endedAtIso = new Date().toISOString();
    save();
    if (session) {
      await session.cdp?.detach?.().catch(() => {});
      await session.browser?.close?.().catch(() => {});
    }
  }
  return report;
}

/** Repeated backward seeks during replay: accumulation AND correctness. */
async function runSeekRewind() {
  const cfg = SCENARIOS.seekrewind;
  const report = {
    signature: 'STANDING-SEEKREWIND-V1',
    ruling: '3df92902c SWEEP-01 item 8',
    scenario: 'seekrewind',
    question: cfg.question,
    acceptance: cfg.acceptance,
    gaugeScope: SWEEP_GAUGE_SCOPE_NOTE,
    startedAtIso: new Date().toISOString(),
    seeks: [],
  };
  const outPath = `${EVIDENCE}\\STANDING-SEEKREWIND-20260731.json`;
  const save = () => fs.writeFileSync(outPath, JSON.stringify(report, null, 1));
  let session = null;
  try {
    session = await bootConf01Session({ replaySpeed: 60, indicators: HEAP_CYCLE_PO_INDICATORS.slice(0, 2), placeOrder: false });
    const { page, cdp, browserCdp } = session;
    report.build = await page.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null).catch(() => null);
    await installSweepCounters(page);
    report.before = await gauge(page, cdp, browserCdp, { forceGc: true });

    for (let i = 1; i <= cfg.seeks; i += 1) {
      const seek = await page.evaluate(() => {
        const rs = window.chart && window.chart.replaySystem;
        if (!rs) return { ok: false, why: 'no replay system' };
        const before = rs.currentIndex ?? null;
        const data = window.chart.data || [];
        // Jump back roughly 300 bars, the scale a user drags.
        const target = Math.max(5, (before ?? data.length) - 300);
        const bar = data[target];
        let method = null;
        try {
          if (typeof rs.goToReplayTimestamp === 'function' && bar) {
            rs.goToReplayTimestamp(bar.t ?? bar.time); method = 'goToReplayTimestamp';
          } else if (typeof rs.seekToIndex === 'function') { rs.seekToIndex(target); method = 'seekToIndex'; }
        } catch (e) { return { ok: false, why: String(e.message).slice(0, 80) }; }
        return { ok: true, method, before, requested: target };
      }).catch((e) => ({ ok: false, why: String(e?.message || e).slice(0, 80) }));

      await sleep(6_000);
      const st = await readConf01State(page, { advanceWindowMs: 4_000 }).catch(() => null);
      const g = await gauge(page, cdp, browserCdp, { forceGc: false });
      const row = {
        seek: i,
        request: seek,
        advancingPanels: st?.advancingPanels ?? null,
        indexAfter: g.realms[0]?.replayIndex ?? null,
        movedBackwards: (seek.before != null && g.realms[0]?.replayIndex != null)
          ? g.realms[0].replayIndex < seek.before : null,
        elements: g.summed.elements,
        residentBars: g.summed.residentBars,
        footprintMB: g.footprint.pageRendererPrivateMB,
        heapMB: g.summed.heapMB,
        listeners: g.counters.live?.listeners ?? null,
      };
      report.seeks.push(row);
      console.error(`[seekrewind] ${i}/${cfg.seeks} ${seek.method ?? 'FAILED'} back=${row.movedBackwards} adv=${row.advancingPanels}/4 elements=${row.elements} resident=${row.residentBars} footprint=${row.footprintMB}`);
      save();
      // The correctness half: replay must still be advancing. Re-arm if not, and record that it
      // needed re-arming, because needing it IS the duration-gate defect reproducing.
      if ((st?.advancingPanels ?? 0) < 1) {
        row.neededReArm = true;
        await keepConf01Playing(page, 60).catch(() => {});
      }
    }
    const fitOver = (f) => {
      const pts = report.seeks.map((s, i) => ({ hours: i + 1, value: f(s) })).filter((p) => Number.isFinite(p.value));
      return pts.length >= 4 ? fitTrend(pts, { label: 'per seek', minSpanHours: 0 }) : null;
    };
    report.trends = {
      elementsPerSeek: fitOver((s) => s.elements),
      residentBarsPerSeek: fitOver((s) => s.residentBars),
      footprintMBPerSeek: fitOver((s) => s.footprintMB),
      listenersPerSeek: fitOver((s) => s.listeners),
    };
    report.correctness = {
      seeksAttempted: report.seeks.length,
      seeksThatMovedBackwards: report.seeks.filter((s) => s.movedBackwards === true).length,
      seeksThatFailed: report.seeks.filter((s) => !s.request?.ok).length,
      timesPlaybackStopped: report.seeks.filter((s) => (s.advancingPanels ?? 4) < 1).length,
      timesNeededReArm: report.seeks.filter((s) => s.neededReArm).length,
      panelsAdvancingAtEnd: report.seeks.at(-1)?.advancingPanels ?? null,
    };
    report.status = 'OK';
  } catch (e) {
    report.status = 'VOID';
    report.reason = String(e?.message || e).slice(0, 240);
    console.error(`[seekrewind] VOID — ${report.reason}`);
  } finally {
    report.endedAtIso = new Date().toISOString();
    save();
    if (session) {
      await session.cdp?.detach?.().catch(() => {});
      await session.browser?.close?.().catch(() => {});
    }
  }
  return report;
}

/** Pan far back into cold history: does data return, and does anything get released? */
async function runPanCold() {
  const cfg = SCENARIOS.pancold;
  const report = {
    signature: 'STANDING-PANCOLD-V1',
    ruling: '3df92902c SWEEP-01 item 8 (EVICT-03 reversibility half)',
    scenario: 'pancold',
    question: cfg.question,
    acceptance: cfg.acceptance,
    gaugeScope: SWEEP_GAUGE_SCOPE_NOTE,
    startedAtIso: new Date().toISOString(),
    pans: [],
  };
  const outPath = `${EVIDENCE}\\STANDING-PANCOLD-20260731.json`;
  const save = () => fs.writeFileSync(outPath, JSON.stringify(report, null, 1));
  let session = null;
  try {
    session = await bootConf01Session({ replaySpeed: 60, indicators: HEAP_CYCLE_PO_INDICATORS.slice(0, 2), placeOrder: false });
    const { page, cdp, browserCdp } = session;
    report.build = await page.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null).catch(() => null);
    await installSweepCounters(page);
    report.before = await gauge(page, cdp, browserCdp, { forceGc: true });

    for (let i = 1; i <= cfg.pans; i += 1) {
      const step = 1500 * i;
      const pan = await page.evaluate((back) => {
        const ch = window.chart;
        if (!ch) return { ok: false, why: 'no chart' };
        const start = ch.visibleStartIndex;
        const end = ch.visibleEndIndex;
        if (!Number.isFinite(start) || !Number.isFinite(end)) return { ok: false, why: 'no viewport indices' };
        const width = end - start;
        const newStart = Math.max(0, start - back);
        let method = null;
        try {
          if (typeof ch.setVisibleRange === 'function') { ch.setVisibleRange(newStart, newStart + width); method = 'setVisibleRange'; }
          else { ch.visibleStartIndex = newStart; ch.visibleEndIndex = newStart + width; method = 'direct assignment'; if (typeof ch.draw === 'function') ch.draw(); }
        } catch (e) { return { ok: false, why: String(e.message).slice(0, 80) }; }
        return { ok: true, method, from: start, to: newStart, width };
      }, step).catch((e) => ({ ok: false, why: String(e?.message || e).slice(0, 80) }));

      await sleep(5_000);
      // Correctness: are there real bars in the range we panned to?
      const present = await page.evaluate(() => {
        const ch = window.chart;
        const s = ch.visibleStartIndex;
        const e = ch.visibleEndIndex;
        const d = ch.data || [];
        if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
        let filled = 0;
        for (let i = Math.max(0, s); i < Math.min(d.length, e); i += 1) {
          const b = d[i];
          if (b && Number.isFinite(b.c ?? b.close)) filled += 1;
        }
        return { visibleStartIndex: s, visibleEndIndex: e, span: e - s, barsPresent: filled, residentBars: d.length };
      }).catch(() => null);
      const g = await gauge(page, cdp, browserCdp, { forceGc: true });
      const row = {
        pan: i, barsBack: step, request: pan, viewport: present,
        dataReturned: present ? present.barsPresent > 0 && present.barsPresent >= Math.min(present.span, 1) * 0.9 : null,
        residentBars: g.summed.residentBars,
        barSlots: g.summed.barSlots,
        footprintMB: g.footprint.pageRendererPrivateMB,
        postGcHeapMB: g.counters.collected?.jsHeapMB ?? null,
        elements: g.summed.elements,
      };
      report.pans.push(row);
      console.error(`[pancold] pan ${i} back ${step} → ${pan.method ?? 'FAILED'} viewport=${present ? `${present.visibleStartIndex}-${present.visibleEndIndex}` : '?'} barsPresent=${present?.barsPresent} resident=${row.residentBars} footprint=${row.footprintMB} postGcHeap=${row.postGcHeapMB}`);
      save();
    }
    const first = report.pans[0];
    const last = report.pans.at(-1);
    report.verdict = {
      pansAttempted: report.pans.length,
      pansThatFailed: report.pans.filter((p) => !p.request?.ok).length,
      dataReturnedEveryPan: report.pans.every((p) => p.dataReturned === true),
      residentBarsFirst: first?.residentBars ?? null,
      residentBarsLast: last?.residentBars ?? null,
      // Panning back adds cold bars. If resident never falls, nothing is released on the pan
      // path either, which is the reversibility half of EVICT-03.
      anythingReleased: (first && last) ? last.residentBars < first.residentBars : null,
      footprintFirstMB: first?.footprintMB ?? null,
      footprintLastMB: last?.footprintMB ?? null,
    };
    report.status = 'OK';
  } catch (e) {
    report.status = 'VOID';
    report.reason = String(e?.message || e).slice(0, 240);
    console.error(`[pancold] VOID — ${report.reason}`);
  } finally {
    report.endedAtIso = new Date().toISOString();
    save();
    if (session) {
      await session.cdp?.detach?.().catch(() => {});
      await session.browser?.close?.().catch(() => {});
    }
  }
  return report;
}

const RUNNERS = {
  idle: runIdle,
  background: runBackground,
  teardown: runTeardown,
  seekrewind: runSeekRewind,
  pancold: runPanCold,
  torture: runTorture,
};

const which = (process.argv.find((a) => a.startsWith('--scenario=')) || '').split('=')[1];
if (!which || !RUNNERS[which]) {
  console.error(`usage: standing-scenarios.mjs --scenario=<${Object.keys(RUNNERS).join('|')}>`);
  process.exit(2);
}
const out = await RUNNERS[which]();
console.error(`\n[${which}] ${out.status}${out.reason ? ` — ${out.reason}` : ''}`);
console.error(JSON.stringify(out.trends ?? out.verdict ?? out.correctness ?? {}, null, 1));
