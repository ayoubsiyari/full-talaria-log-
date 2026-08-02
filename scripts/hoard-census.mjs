/**
 * HOARD-CENSUS — a retained-object inventory at three moments on one session.
 *
 * THE REFRAME THIS INSTRUMENT SERVES. A drained floor that rises means the memory is REACHABLE and HELD.
 * The question is therefore not "what escaped the collector" but "what has no release path". A slope test
 * cannot answer that however precisely it is run, so this does not measure a slope. It counts things and
 * says who is holding them.
 *
 * THREE MOMENTS, one session:
 *   M1  PLAYING          — the working set under load
 *   M2  PAUSED + COLLECTED — what survives a real collection
 *   M3  SINGLE CHART + COLLECTED — what survives destroying three of four panels
 * M1->M2 is the release-on-pause question. M2->M3 is the release-on-teardown question, and anything that
 * survives M3 is held by something that outlives the panel that created it.
 *
 * PAUSE IS NOT A DRAIN, and my previous instrument was wrong about this. Every pause reference in
 * replay-system.js is UI state; pausing releases nothing. That is why the last run's floor ROSE during a
 * 60-second pause while I called the reading a "drained floor". Here the drain is an explicit
 * HeapProfiler.collectGarbage, so M2 and M3 count what is genuinely reachable rather than what happened
 * not to have been collected yet.
 *
 * WHAT IT LOOKS FOR, and why entry counts beat byte totals. Eviction is a RESIDENCY WINDOW
 * (EVICT_CONTEXT_BARS 5000, EVICT_SLACK_BARS 2048) and it works: `fullRawData = master.slice(start)`
 * bounds the raw bars. But `slice` is shallow, so an evicted bar OBJECT only dies if nothing else points
 * at it. Anything keyed by bars-SEEN rather than bars-RESIDENT is invisible to that window by
 * construction and pins the bars it references. So the census records, for every collection it finds, the
 * ENTRY COUNT and the KEY KIND — a timestamp-keyed Map with more entries than there are resident bars is
 * the signature being hunted, and it shows up in a count long before it shows up in a byte total.
 *
 * WHAT HOLDS THE REFERENCE. The walk is a breadth-first traversal from the realm roots, so the first path
 * on which a collection is reached IS its shortest retainer path. That is reported verbatim.
 *
 * HONEST SCOPE, stated here so it is not discovered later:
 *   - This walks the JS object graph. My own earlier measurement puts ~41% of per-bar growth OUTSIDE V8
 *     (blink_gc 20.0%, partition_alloc 16.7%), and this instrument is blind to all of it. It can name a
 *     JS hoarder; it cannot account for the whole floor.
 *   - Traversal is capped (nodes, depth, wall time). A truncated walk is reported as truncated, never as
 *     an empty result — an unbounded walk in a jammed renderer is how the last run hung for six minutes.
 *   - Eviction only fires once the playhead passes CONTEXT+SLACK = 7,048 bars. The datasets this
 *     configuration loads are smaller than that, so the sawtooth will NOT be reproduced here and the
 *     bars-seen-vs-bars-resident ratio is correspondingly weak. The RELEASE question is unaffected.
 */

import fs from 'fs';
import path from 'path';
import { bootConf01Session } from './lib/conf01-session.mjs';
import { applyDistV9LayoutViaUi } from './lib/heap-cycle-browser.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { readFootprint } from './lib/footprint.mjs';
import { computeSeal } from './lib/seal.mjs';
import { readBuildInfo } from './lib/build-info.mjs';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

const ORIGIN = arg('origin', 'http://31.97.192.82:3000');
const SPEED = Number(arg('speed', '10'));
const WARM_MS = Number(arg('warmMs', '240000'));
const SETTLE_MS = Number(arg('settleMs', '20000'));
const MIN_ENTRIES = Number(arg('minEntries', '64'));
const NODE_CAP = Number(arg('nodeCap', '120000'));
const DEPTH_CAP = Number(arg('depthCap', '10'));
const TIME_BUDGET_MS = Number(arg('timeBudgetMs', '10000'));
const OUT = arg('out', `_evidence/manager-C/hoard-census-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

const log = (m) => console.log(`[hoard-census ${new Date().toISOString().slice(11, 19)}] ${m}`);

/**
 * The in-page walk. Deliberately defensive: every branch is capped and every access is guarded, because
 * this runs against a renderer that is known to spend 900 ms of every second inside long tasks.
 */
export const WALK = ({ minEntries, nodeCap, depthCap, timeBudgetMs }) => {
  const t0 = Date.now();
  const out = { realms: [], anyTruncated: false };

  const classifyKey = (k) => {
    let n = null;
    if (typeof k === 'number') n = k;
    else if (typeof k === 'string' && /^-?\d+$/.test(k)) n = Number(k);
    if (n == null) return typeof k;
    if (n >= 1e12 && n < 4e12) return 'timestampMs';
    if (n >= 1e9 && n < 4e9) return 'timestampSec';
    if (n >= 0 && n < 1e7) return 'index';
    return 'number';
  };
  const isBarLike = (v) => {
    if (!v || typeof v !== 'object') return false;
    const hasT = 't' in v || 'time' in v || 'timestamp' in v;
    const hasC = 'c' in v || 'close' in v;
    return hasT && hasC;
  };
  const kindOf = (v) => {
    if (v === null) return 'null';
    const t = typeof v;
    if (t !== 'object') return t;
    if (Array.isArray(v)) return 'Array';
    if (v instanceof Map) return 'Map';
    if (v instanceof Set) return 'Set';
    if (ArrayBuffer.isView(v)) return 'TypedArray';
    if (v instanceof Date) return 'Date';
    try { if (v.nodeType) return 'DOMNode'; } catch (_) { return 'opaque'; }
    return (v.constructor && v.constructor.name) || 'Object';
  };

  const censusRealm = (w, label) => {
    const rec = { realm: label, collections: [], visited: 0, truncated: false, context: {}, error: null };

    // Context first: without resident/playhead the entry counts cannot be interpreted.
    try {
      let rs = w.replaySystem || (w.chart && w.chart.replaySystem) || null;
      const chart = w.chart || null;
      rec.context = {
        tf: chart ? (chart.currentTimeframe ?? null) : null,
        playheadIndex: rs && Number.isFinite(rs.currentIndex) ? rs.currentIndex : null,
        residentBars: rs && Array.isArray(rs.fullRawData) ? rs.fullRawData.length : null,
        masterBars: chart && Array.isArray(chart.rawData) ? chart.rawData.length : null,
        playheadTimestamp: (() => {
          try { const b = rs && rs.fullRawData && rs.fullRawData[rs.currentIndex]; return b ? (b.t ?? b.time ?? null) : null; } catch (_) { return null; }
        })(),
        isPlaying: rs ? !!rs.isPlaying : null,
      };
    } catch (e) { rec.error = String(e).slice(0, 120); }

    const seen = new Set();
    // SEEDED ROOTS. Walking from `window` alone reached 835 nodes of library globals and never got to the
    // chart, because window carries >1000 keys and the traversal cap cut it off before `chart`. The
    // subgraph under investigation is named explicitly so it can never be missed, and `window` is still
    // walked afterwards (minus known library globals) so a hoarder held by an unnamed global is not
    // invisible either.
    const LIBRARY_GLOBALS = new Set(['d3', 'React', 'ReactDOM', 'THREE', 'jQuery', '$', '_', 'lodash', 'moment',
      'Chart', 'Plotly', 'echarts', 'webpackChunk', 'regeneratorRuntime']);
    const ROOT_NAMES = ['chart', 'replaySystem', 'multichartManager', 'multiChartManager', 'orderManager',
      'chartManager', 'indicatorManager', 'dataPipeline', 'app', 'talaria', 'TALARIA', 'panelBridge'];
    const queue = [];
    for (const name of ROOT_NAMES) {
      try { const v = w[name]; if (v && typeof v === 'object') queue.push({ obj: v, key: name, path: 'window.' + name, depth: 0 }); }
      catch (_) { /* an accessor that throws is not a root */ }
    }
    queue.push({ obj: w, key: 'window', path: 'window', depth: 0, isRealmRoot: true });
    rec.seededRoots = queue.filter((q) => !q.isRealmRoot).map((q) => q.key);
    let qi = 0; // index pointer: shift() on a long array is quadratic

    while (qi < queue.length) {
      if (rec.visited > nodeCap || Date.now() - t0 > timeBudgetMs) {
        rec.truncated = true; out.anyTruncated = true; break;
      }
      const node = queue[qi++];
      const { obj, path: p, depth } = node;
      // ONE BAD NODE MUST NOT ABORT A REALM. The product exposes accessors and proxies whose traps run
      // product code on plain property reads; the first version of this walk let such a throw escape and
      // lost an entire realm's census while reporting a clean run. Everything per-node is now guarded.
      try {
      if (!obj || typeof obj !== 'object' || depth > depthCap) continue;
      if (seen.has(obj)) continue;
      seen.add(obj);
      rec.visited++;

      let kind;
      try { kind = kindOf(obj); } catch (e) { rec.nodeErrors = (rec.nodeErrors || 0) + 1; continue; }
      if (kind === 'DOMNode' || kind === 'opaque') continue;

      let entries = null; let keySamples = []; let valueSample = null; let traverse = [];

      try {
        if (kind === 'Map') {
          entries = obj.size;
          let i = 0;
          for (const [k, v] of obj) { if (i >= 3) break; keySamples.push(k); if (i === 0) valueSample = v; i++; }
          if (entries < 32) { let j = 0; for (const [, v] of obj) { if (j++ > 32) break; traverse.push(['<mapvalue>', v]); } }
        } else if (kind === 'Set') {
          entries = obj.size;
          let i = 0; for (const v of obj) { if (i >= 3) break; keySamples.push(kindOf(v)); if (i === 0) valueSample = v; i++; }
        } else if (kind === 'Array') {
          entries = obj.length;
          valueSample = obj.length ? obj[0] : null;
          keySamples = ['index'];
          // Never element-walk a bar array: that is 40,000 nodes and no information.
          if (entries < 32) traverse = obj.map((v, i) => [String(i), v]);
        } else if (kind === 'TypedArray') {
          entries = obj.length;
          keySamples = ['index'];
        } else {
          const keys = Object.keys(obj);
          entries = keys.length;
          const numericish = keys.length ? keys.filter((k) => /^-?\d+$/.test(k)).length / keys.length : 0;
          if (keys.length >= minEntries && numericish > 0.8) {
            // A plain object used as a keyed collection. Record it, do not walk its keys.
            keySamples = keys.slice(0, 3);
            valueSample = obj[keys[0]];
          } else {
            keySamples = keys.slice(0, 3);
            const usable = node.isRealmRoot ? keys.filter((k) => !LIBRARY_GLOBALS.has(k)) : keys;
            traverse = usable.slice(0, 1500).map((k) => [k, (() => { try { return obj[k]; } catch (_) { return undefined; } })()]);
          }
        }
      } catch (e) { continue; }

      const keyKinds = [...new Set(keySamples.map((k) => (typeof k === 'string' || typeof k === 'number') ? classifyKey(k) : String(k)))];
      const valueIsBar = isBarLike(valueSample);

      if (entries != null && entries >= minEntries && kind !== 'Window') {
        // SUSPICION RANKING. Sorting by raw size surfaces whatever library happens to be biggest. The
        // signature being hunted is derived data keyed by bars-SEEN: a timestamp-keyed collection, or one
        // whose values are bars, is worth more attention than a larger array of colour names.
        const tsKeyed = keyKinds.some((k) => k === 'timestampMs' || k === 'timestampSec');
        const suspicion = (tsKeyed ? 4 : 0) + (valueIsBar ? 2 : 0) + (kind === 'Map' || kind === 'Set' ? 1 : 0);
        rec.collections.push({
          path: p,
          kind,
          entries,
          keyKinds,
          keySamples: keySamples.map((k) => (typeof k === 'object' ? kindOf(k) : String(k))).slice(0, 3),
          valueKind: kindOf(valueSample),
          valueIsBarLike: valueIsBar,
          timestampKeyed: tsKeyed,
          suspicion,
        });
      }

      for (const [k, v] of traverse) {
        if (!v || typeof v !== 'object') continue;
        queue.push({ obj: v, key: k, path: p + '.' + k, depth: depth + 1 });
      }
      } catch (e) {
        rec.nodeErrors = (rec.nodeErrors || 0) + 1;
        if (!rec.firstNodeError) rec.firstNodeError = `${String(e).slice(0, 100)} @ ${p}`;
      }
    }

    rec.collections.sort((a, b) => b.suspicion - a.suspicion || b.entries - a.entries);
    rec.collectionsTotal = rec.collections.length;
    rec.collections = rec.collections.slice(0, 80);
    out.realms.push(rec);
  };

  try { censusRealm(window, 'host'); } catch (e) { out.realms.push({ realm: 'host', error: String(e).slice(0, 200) }); }
  for (let i = 0; i < window.frames.length; i++) {
    // Report the REAL reason. The previous version hardcoded "cross-origin or unreachable" here, which
    // relabelled a walker bug as an environment fact and hid it in three realms at once.
    try { censusRealm(window.frames[i], 'frame' + i); }
    catch (e) { out.realms.push({ realm: 'frame' + i, error: String(e).slice(0, 200) }); }
  }
  out.walkMs = Date.now() - t0;
  return out;
};

async function forceCollect(cdp, rounds = 3) {
  const done = [];
  for (let i = 0; i < rounds; i++) {
    try { await cdp.send('HeapProfiler.collectGarbage'); done.push('ok'); }
    catch (e) { done.push('fail:' + String(e).slice(0, 60)); }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return done;
}

async function setPlaying(page, want) {
  return page.evaluate((play) => {
    const found = [];
    const visit = (w) => {
      try {
        const rs = w.replaySystem || (w.chart && w.chart.replaySystem);
        if (!rs) return;
        if (play && !rs.isPlaying && typeof rs.play === 'function') rs.play();
        if (!play && rs.isPlaying && typeof rs.pause === 'function') rs.pause();
        found.push(!!rs.isPlaying);
      } catch (_) {}
    };
    visit(window);
    for (let i = 0; i < window.frames.length; i++) { try { visit(window.frames[i]); } catch (_) {} }
    return found;
  }, want);
}

/** Diff two moments by collection path. Growth and, more importantly, SURVIVAL. */
export function diffMoments(a, b) {
  const idx = (m) => {
    const map = new Map();
    for (const r of (m?.realms || [])) for (const c of (r.collections || [])) map.set(r.realm + '|' + c.path, c);
    return map;
  };
  const A = idx(a); const B = idx(b);
  const rows = [];
  for (const [k, ca] of A) {
    const cb = B.get(k);
    rows.push({
      key: k, kind: ca.kind, keyKinds: ca.keyKinds, valueIsBarLike: ca.valueIsBarLike,
      before: ca.entries, after: cb ? cb.entries : 0,
      delta: (cb ? cb.entries : 0) - ca.entries,
      released: !cb ? 'GONE' : (cb.entries < ca.entries ? 'SHRANK' : (cb.entries === ca.entries ? 'HELD' : 'GREW')),
    });
  }
  for (const [k, cb] of B) if (!A.has(k)) rows.push({ key: k, kind: cb.kind, keyKinds: cb.keyKinds, valueIsBarLike: cb.valueIsBarLike, before: 0, after: cb.entries, delta: cb.entries, released: 'NEW' });
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || y.after - x.after);
  return rows;
}

async function main() {
  const seal = await computeSeal(ORIGIN).catch((e) => ({ error: String(e).slice(0, 120) }));
  const info = await readBuildInfo(ORIGIN).catch((e) => ({ error: String(e).slice(0, 120) }));
  const eSel = loadConf05Indicators();
  const walkOpts = { minEntries: MIN_ENTRIES, nodeCap: NODE_CAP, depthCap: DEPTH_CAP, timeBudgetMs: TIME_BUDGET_MS };

  const artifact = {
    signature: 'HOARD-CENSUS-V1',
    startedAt: new Date().toISOString(),
    identity: { buildId: seal.badge ?? null, sealDigest: seal.digest ?? null, sourceCommit: info.sourceCommitSha ?? null, origin: ORIGIN },
    condition: { speed: SPEED, panels: 4, indicatorsPerPanel: 2, trades: 0, warmMs: WARM_MS },
    evictionWindow: { EVICT_CONTEXT_BARS: 5000, EVICT_SLACK_BARS: 2048, firesOncePlayheadExceeds: 7048 },
    scope: {
      blindTo: 'non-V8 arenas; ~41% of per-bar growth measured outside V8 (blink_gc 20.0%, partition_alloc 16.7%)',
      pauseIsNotADrain: 'every pause reference in replay-system.js is UI state; M2/M3 use HeapProfiler.collectGarbage',
    },
    moments: {},
  };

  let session = null;
  try {
    log(`booting CONF-01 speed ${SPEED} against ${ORIGIN} (${seal.badge ?? '?'})`);
    session = await bootConf01Session({ indicators: eSel.pairs, replaySpeed: SPEED, placeOrder: false, label: 'hoard-census' });
    const page = session.page;
    const browser = session.browser;
    const cdp = await page.createCDPSession();
    try { await cdp.send('HeapProfiler.enable'); } catch (_) {}

    log(`warming ${WARM_MS / 1000}s`);
    await new Promise((r) => setTimeout(r, WARM_MS));

    // ---------- M1 PLAYING
    log('M1 playing: census');
    const m1fp = await readFootprint(browser).catch((e) => ({ error: String(e).slice(0, 100) }));
    const m1 = await page.evaluate(WALK, walkOpts);
    artifact.moments.m1_playing = { at: new Date().toISOString(), footprint: m1fp, census: m1, collected: false };
    log(`M1 walked ${m1.realms.map((r) => r.visited).join('/')} nodes in ${m1.walkMs} ms, truncated=${m1.anyTruncated}`);

    // ---------- M2 PAUSED + COLLECTED
    log('M2 pause + forced collection');
    const paused = await setPlaying(page, false);
    const gc2 = await forceCollect(cdp);
    await new Promise((r) => setTimeout(r, 5000));
    const m2fp = await readFootprint(browser).catch((e) => ({ error: String(e).slice(0, 100) }));
    const m2 = await page.evaluate(WALK, walkOpts);
    artifact.moments.m2_paused_collected = { at: new Date().toISOString(), footprint: m2fp, census: m2, collected: true, pauseResult: paused, gc: gc2 };
    log(`M2 footprint ${m2fp.footprintTotalMB ?? '?'} MB (M1 ${m1fp.footprintTotalMB ?? '?'} MB)`);

    // ---------- M3 SINGLE CHART + COLLECTED
    log('M3 returning to single chart');
    let layoutResult = 'ok';
    try { await applyDistV9LayoutViaUi(page, 1, 0); }
    catch (e) { layoutResult = 'FAILED: ' + String(e).slice(0, 140); }
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    const gc3 = await forceCollect(cdp);
    await new Promise((r) => setTimeout(r, 5000));
    const m3fp = await readFootprint(browser).catch((e) => ({ error: String(e).slice(0, 100) }));
    const m3 = await page.evaluate(WALK, walkOpts);
    artifact.moments.m3_single_collected = { at: new Date().toISOString(), footprint: m3fp, census: m3, collected: true, layoutResult, gc: gc3 };
    log(`M3 footprint ${m3fp.footprintTotalMB ?? '?'} MB, layout=${layoutResult}`);

    artifact.diffs = {
      m1_to_m2_releaseOnPause: diffMoments(m1, m2),
      m2_to_m3_releaseOnTeardown: diffMoments(m2, m3),
      m1_to_m3_overall: diffMoments(m1, m3),
    };
    artifact.verdict = (m1.anyTruncated || m2.anyTruncated || m3.anyTruncated) ? 'CAPTURED_TRUNCATED' : 'CAPTURED';
  } catch (err) {
    artifact.verdict = 'ERROR';
    artifact.error = String(err && err.stack ? err.stack : err).slice(0, 1600);
    log('ERROR ' + artifact.error.split('\n')[0]);
  } finally {
    try { if (session && session.browser) await session.browser.close(); } catch (_) {}
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
    log(`artifact -> ${OUT}`);
  }
}

if (!process.argv.includes('--noRun')) main();
