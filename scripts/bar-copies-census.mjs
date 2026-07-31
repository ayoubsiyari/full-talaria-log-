#!/usr/bin/env node
/**
 * BAR-COPIES-CENSUS-V1 — B3 of the overnight battery (ruling 776923bde).
 *
 * The one number that discriminates all three of the Director's amplifiers:
 * **resident bar-like objects across every array and every realm, over distinct bars the user
 * could actually see.** Ratio 1-2 kills the retention hypothesis cleanly; ratio 20 finds
 * something large.
 *
 * Three decisions that decide whether this instrument tells the truth:
 *
 * 1. ARRAYS ARE DISCOVERED, NOT LISTED. A hardcoded list of known arrays would miss the copy
 *    that matters and would silently keep missing it. This walks the object graph from `window`
 *    and `window.chart` with a visited set and a node budget, and reports the PATH of every
 *    bar-like array it finds — which is the attribution, not just the count.
 * 2. ALIASING IS SEPARATED FROM COPYING. Two arrays holding the same objects are not two copies.
 *    Slots are counted, and identity-distinct objects are counted separately, so
 *    `slots / distinctObjects` states how much of the multiplier is aliasing. Reporting only
 *    sums is the exact error I made on the excursion lists earlier today.
 * 3. DERIVED SERIES ARE COUNTED SEPARATELY. Indicator output is numbers, not bar objects, so it
 *    would be invisible to a bar-shaped census. Numeric series as long as history are amplifier
 *    3 and get their own count.
 *
 * MEAS-02: this sees JS-visible arrays reachable from `window` in each realm within the node
 * budget. It cannot see objects held only by closures, WeakMaps, or workers, so its ratio is a
 * LOWER BOUND on copies per bar. It states the budget and whether it was exhausted.
 */
import fs from 'node:fs';

import { bootConf01Session, keepConf01Playing, readConf01State } from './lib/conf01-session.mjs';
import { PO_TWO_INDICATORS } from './replay-decay-hunt.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs inside a realm. Returns the bar-array census for that realm. */
function censusSource(nodeBudget) {
  const isBarLike = (o) => {
    if (!o || typeof o !== 'object') return false;
    const hasOhlc = ('o' in o && 'h' in o && 'l' in o && 'c' in o)
      || ('open' in o && 'high' in o && 'low' in o && 'close' in o);
    if (!hasOhlc) return false;
    const v = o.o ?? o.open;
    const c = o.c ?? o.close;
    return typeof v === 'number' && typeof c === 'number';
  };
  const timeOf = (o) => {
    const t = o.t ?? o.time ?? o.timestamp ?? o.date ?? null;
    return (typeof t === 'number' || typeof t === 'string') ? t : null;
  };

  const seen = new WeakSet();
  const distinctBarObjects = new WeakSet();
  let distinctBarObjectCount = 0;
  const timestamps = new Set();
  const barArrays = [];
  const numericSeries = [];
  let visited = 0;
  let budgetExhausted = false;

  const roots = [
    ['window.chart', window.chart],
    ['window.chart.replaySystem', window.chart && window.chart.replaySystem],
    ['window.chart.indicators', window.chart && window.chart.indicators],
    ['window.orderManager', window.orderManager],
    ['window.Chart', window.Chart],
  ].filter(([, v]) => v && typeof v === 'object');

  const queue = roots.map(([path, value]) => ({ path, value, depth: 0 }));
  while (queue.length) {
    if (visited++ > nodeBudget) { budgetExhausted = true; break; }
    const { path, value, depth } = queue.shift();
    if (!value || typeof value !== 'object' || depth > 7) continue;
    if (seen.has(value)) continue;
    seen.add(value);

    if (Array.isArray(value)) {
      const n = value.length;
      if (n > 0) {
        // Sampling the ends and the middle is enough to classify an array without walking
        // five million entries, and walking them would change what we are measuring.
        const probes = [0, Math.floor(n / 2), n - 1].map((i) => value[i]);
        const barish = probes.filter(isBarLike).length;
        if (barish >= 2) {
          // Confirmed bar array: count every slot, and identity-count up to a cap so a
          // five-million-entry array cannot stall the realm.
          const idCap = 60_000;
          let counted = 0;
          for (let i = 0; i < n && counted < idCap; i += 1) {
            const el = value[i];
            if (!el || typeof el !== 'object') continue;
            counted += 1;
            if (!distinctBarObjects.has(el)) {
              distinctBarObjects.add(el);
              distinctBarObjectCount += 1;
              const t = timeOf(el);
              if (t != null) timestamps.add(t);
            }
          }
          barArrays.push({
            path, slots: n, identityScanned: counted, identityCapped: n > idCap,
          });
          continue; // do not descend into millions of bar objects
        }
        if (typeof probes[0] === 'number' && typeof probes[2] === 'number' && n > 50) {
          numericSeries.push({ path, slots: n });
          continue;
        }
      }
      // Small or mixed array: descend a bounded number of entries.
      for (let i = 0; i < Math.min(n, 40); i += 1) {
        queue.push({ path: `${path}[${i}]`, value: value[i], depth: depth + 1 });
      }
      continue;
    }

    let keys;
    try { keys = Object.keys(value); } catch { continue; }
    for (const k of keys.slice(0, 200)) {
      let v;
      try { v = value[k]; } catch { continue; }
      if (v && typeof v === 'object') queue.push({ path: `${path}.${k}`, value: v, depth: depth + 1 });
    }
  }

  const chart = window.chart;
  const rs = chart && chart.replaySystem;
  const visible = (() => {
    // Distinct bars the user could actually SEE: the viewport window, if the product exposes it.
    const start = chart && (chart.viewStartIndex ?? chart._viewStart ?? null);
    const end = chart && (chart.viewEndIndex ?? chart._viewEnd ?? null);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) return end - start;
    return null;
  })();

  return {
    realm: `${location.pathname}${location.search}`.slice(-52),
    timeframe: chart && chart.currentTimeframe ? String(chart.currentTimeframe) : null,
    mode: rs && typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : null,
    loopKind: rs && typeof rs.getPlaybackLoopKind === 'function' ? rs.getPlaybackLoopKind() : null,
    replayIndex: rs && rs.currentIndex != null ? rs.currentIndex : null,
    primaryResidentBars: Array.isArray(chart && chart.data) ? chart.data.length : null,
    panelFullRawBars: Array.isArray(chart && chart._panelFullRawData) ? chart._panelFullRawData.length : null,
    visibleBars: visible,
    indicatorsActive: ((chart && chart.indicators && chart.indicators.active) || []).length,
    barArrays: barArrays.sort((a, b) => b.slots - a.slots).slice(0, 25),
    barArrayCount: barArrays.length,
    barSlotsTotal: barArrays.reduce((t, a) => t + a.slots, 0),
    distinctBarObjects: distinctBarObjectCount,
    distinctTimestamps: timestamps.size,
    numericSeries: numericSeries.sort((a, b) => b.slots - a.slots).slice(0, 20),
    numericSeriesCount: numericSeries.length,
    numericSlotsTotal: numericSeries.reduce((t, a) => t + a.slots, 0),
    nodesVisited: visited,
    budgetExhausted,
  };
}

async function censusAllRealms(page, nodeBudget) {
  const rows = [];
  for (const frame of page.frames()) {
    try {
      const r = await frame.evaluate(censusSource, nodeBudget);
      if (r && (r.primaryResidentBars != null || r.barArrayCount > 0)) rows.push(r);
    } catch (e) {
      rows.push({ realm: frame.url().slice(-52), error: String(e?.message || e).slice(0, 140) });
    }
  }
  return rows;
}

/** The ratio, with aliasing separated from real duplication. */
export function gradeCopiesPerBar(rows) {
  const good = rows.filter((r) => !r.error);
  const sum = (k) => good.reduce((t, r) => t + (r[k] || 0), 0);
  const barSlots = sum('barSlotsTotal');
  const distinctObjects = sum('distinctBarObjects');
  const distinctTimestamps = good.reduce((t, r) => t + (r.distinctTimestamps || 0), 0);
  const primaryResident = sum('primaryResidentBars');
  const numericSlots = sum('numericSlotsTotal');
  const copiesPerBar = distinctTimestamps > 0 ? +(barSlots / distinctTimestamps).toFixed(2) : null;
  const copiesPerResidentBar = primaryResident > 0 ? +(barSlots / primaryResident).toFixed(2) : null;
  const aliasFactor = distinctObjects > 0 ? +(barSlots / distinctObjects).toFixed(2) : null;
  return {
    realms: good.length,
    barArraysFound: sum('barArrayCount'),
    barSlotsTotal: barSlots,
    distinctBarObjects: distinctObjects,
    distinctTimestamps,
    primaryResidentBarsSummed: primaryResident,
    numericSeriesSlotsTotal: numericSlots,
    derivedSlotsPerResidentBar: primaryResident > 0 ? +(numericSlots / primaryResident).toFixed(2) : null,
    copiesPerDistinctTimestamp: copiesPerBar,
    copiesPerResidentBar,
    aliasFactorSlotsPerDistinctObject: aliasFactor,
    budgetExhaustedInAnyRealm: good.some((r) => r.budgetExhausted),
    verdict: (() => {
      const c = copiesPerResidentBar;
      if (c == null) return 'INDETERMINATE — no resident bar count read';
      if (c <= 2) return 'RETENTION HYPOTHESIS DIES — bar-like residency is 1-2x the bars on screen';
      if (c <= 5) return 'MODEST DUPLICATION — worth naming, not the monster';
      return 'LARGE DUPLICATION — the multiplier is the story';
    })(),
  };
}

export async function runBarCopiesCensus({
  minutes = 16, speed = 60, nodeBudget = 40_000, outPath = null,
} = {}) {
  const report = {
    signature: 'BAR-COPIES-CENSUS-V1',
    startedAtIso: new Date().toISOString(),
    ruling: '776923bde B3',
    scopeNote: 'Sees JS-visible arrays reachable from window/chart within the node budget in each realm. Blind to closure-held, WeakMap-held and worker-held bars, so every ratio here is a LOWER BOUND.',
    plan: { minutes, speed, nodeBudget },
    samples: [],
  };
  const save = () => { if (outPath) fs.writeFileSync(outPath, JSON.stringify(report, null, 1)); };
  save();

  // Amplifier 2 on its own: resident bars at first paint, before any playback or layout change.
  const coldRead = async (page) => {
    report.firstPaintColdRead = await page.evaluate(() => {
      const ch = window.chart;
      const rs = ch && ch.replaySystem;
      return {
        timeframe: ch && ch.currentTimeframe ? String(ch.currentTimeframe) : null,
        residentBars: Array.isArray(ch && ch.data) ? ch.data.length : null,
        rawBars: Array.isArray(ch && ch.rawData) ? ch.rawData.length : null,
        panelFullRawBars: Array.isArray(ch && ch._panelFullRawData) ? ch._panelFullRawData.length : null,
        totalBarsKnown: ch && (ch.totalBars ?? ch._totalBars ?? ch.availableBars ?? null),
        replayActive: !!(rs && rs.isActive),
        replayPlaying: !!(rs && rs.isPlaying),
        note: 'read at first paint of a single chart, before layout change, arming or playback',
      };
    }).catch((e) => ({ error: String(e?.message || e).slice(0, 140) }));
    console.error(`[b3] FIRST PAINT COLD READ: ${JSON.stringify(report.firstPaintColdRead)}`);
    save();
  };

  const { browser, page, cdp, conf01 } = await bootConf01Session({
    replaySpeed: speed,
    indicators: PO_TWO_INDICATORS,
    placeOrder: false,
    onSingleReady: coldRead,
  });
  try {
    report.build = await page.evaluate(() => {
      const s = [...document.querySelectorAll('script[src]')]
        .map((x) => /[?&]v=([\w.\-]+)/.exec(x.getAttribute('src') || '')).find(Boolean);
      return s ? s[1] : null;
    }).catch(() => null);
    report.conf01 = { compliant: conf01?.compliant, failed: conf01?.failed };
    const st0 = await readConf01State(page, { advanceWindowMs: 1_500 }).catch(() => null);
    report.zeroTrades = (st0?.panels || []).map((p) => p.closedTrades);
    console.error(`[b3] build=${report.build} closedTrades=${JSON.stringify(report.zeroTrades)}`);

    const startedAt = Date.now();
    const marks = [0, 5, 15].filter((m) => m < minutes);
    for (const mark of marks) {
      const waitMs = mark * 60_000 - (Date.now() - startedAt);
      if (waitMs > 0) {
        // Keep playing across the wait, re-arming only when a realm has actually stalled.
        const until = Date.now() + waitMs;
        while (Date.now() < until) {
          await sleep(Math.min(30_000, until - Date.now()));
          const st = await readConf01State(page, { advanceWindowMs: 2_000 }).catch(() => null);
          if ((st?.advancingPanels ?? 0) < 4) {
            const k = await keepConf01Playing(page, speed).catch(() => null);
            if (k && k.reseeksThatDidNotMove) {
              console.error(`[b3] WARNING ${k.reseeksThatDidNotMove} re-seek(s) did not move the playhead`);
            }
          }
        }
      }
      const rows = await censusAllRealms(page, nodeBudget);
      const grade = gradeCopiesPerBar(rows);
      const st = await readConf01State(page, { advanceWindowMs: 2_000 }).catch(() => null);
      report.samples.push({
        atMinutes: +((Date.now() - startedAt) / 60_000).toFixed(2),
        mark,
        advancingPanels: st?.advancingPanels ?? null,
        modePerRealm: rows.map((r) => r.mode),
        loopKindPerRealm: rows.map((r) => r.loopKind),
        rows,
        grade,
      });
      console.error(`[b3] ${mark}min copiesPerResidentBar=${grade.copiesPerResidentBar} (slots ${grade.barSlotsTotal} / resident ${grade.primaryResidentBarsSummed}) distinctObjects=${grade.distinctBarObjects} alias=${grade.aliasFactorSlotsPerDistinctObject} derivedPerBar=${grade.derivedSlotsPerResidentBar} arrays=${grade.barArraysFound} — ${grade.verdict}`);
      save();
    }

    const last = report.samples.at(-1);
    const first = report.samples[0];
    report.verdict = {
      copiesPerResidentBar: last?.grade?.copiesPerResidentBar ?? null,
      copiesPerResidentBarAtStart: first?.grade?.copiesPerResidentBar ?? null,
      aliasFactor: last?.grade?.aliasFactorSlotsPerDistinctObject ?? null,
      derivedSlotsPerResidentBar: last?.grade?.derivedSlotsPerResidentBar ?? null,
      residentBarsAtFirstPaint: report.firstPaintColdRead?.residentBars ?? null,
      residentBarsGrowthOverRun: (last && first)
        ? last.grade.primaryResidentBarsSummed - first.grade.primaryResidentBarsSummed : null,
      topArraysBySlots: (last?.rows || []).flatMap((r) => (r.barArrays || [])
        .map((a) => ({ realm: r.realm, tf: r.timeframe, path: a.path, slots: a.slots })))
        .sort((a, b) => b.slots - a.slots).slice(0, 12),
      answer: last?.grade?.verdict ?? 'INDETERMINATE — no sample completed',
    };
    console.error(`[b3] VERDICT ${JSON.stringify(report.verdict.answer)} copiesPerResidentBar=${report.verdict.copiesPerResidentBar} residentAtFirstPaint=${report.verdict.residentBarsAtFirstPaint}`);
    save();
    return report;
  } finally {
    await cdp.detach().catch(() => {});
    await browser.close().catch(() => {});
    save();
  }
}

function parseArgs(argv) {
  const o = {};
  for (const a of argv) {
    const [k, v] = a.replace(/^--/, '').split('=');
    if (k === 'minutes') o.minutes = Number(v);
    else if (k === 'speed') o.speed = Number(v);
    else if (k === 'node-budget') o.nodeBudget = Number(v);
    else if (k === 'out') o.outPath = v;
  }
  return o;
}

const invokedDirectly = process.argv[1] && /bar-copies-census\.mjs$/.test(process.argv[1].replace(/\\/g, '/'));
if (invokedDirectly) await runBarCopiesCensus(parseArgs(process.argv.slice(2)));
