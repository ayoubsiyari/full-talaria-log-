/**
 * Why do three of four CONF-01 panels boot parked on their last bar?
 *
 * The exhaustion probe established THAT they do, and named the branch that does it — when no bar in a
 * timeframe's data sits at or after the session start, replay-system parks the playhead on `rd.length - 1`.
 * This probe reads the two quantities that decide WHOSE fault that is:
 *
 *   the date range each panel's dataset actually covers, and the session start each panel is asked for.
 *
 * If the session start is a single global value and three datasets simply end before it, this is a
 * configuration mismatch in how the four panels are seeded and I can fix it in the harness. If each panel
 * derives a session start from its own data and still lands outside it, the product is computing a start
 * it cannot reach and the fix is not mine. Those two have the same symptom and opposite owners, which is
 * why this is a read and not an experiment.
 */
import fs from 'fs';
import path from 'path';
import { bootConf01Session } from './lib/conf01-session.mjs';
import { loadConf05Indicators } from './lib/conf05-indicators.mjs';
import { clockOf } from './lib/clock.mjs';

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const OUT = arg('out', `_evidence/manager-C/session-start-probe-${Date.now()}.json`);
const log = (m) => console.log(`[session-start ${clockOf(new Date(), { seconds: true })}] ${m}`);

async function readRealms(page) {
  return page.evaluate(() => {
    const norm = (t) => (Number.isFinite(t) ? (t > 1e12 ? t : t * 1000) : null);
    const out = [];
    const visit = (w, label) => {
      try {
        const chart = w.chart || null;
        const rs = w.replaySystem || (chart && chart.replaySystem) || null;
        if (!rs && !chart) return;
        const rd = (rs && Array.isArray(rs.fullRawData) && rs.fullRawData.length) ? rs.fullRawData
          : (chart && Array.isArray(chart.rawData) ? chart.rawData : null);
        const first = rd && rd.length ? rd[0] : null;
        const last = rd && rd.length ? rd[rd.length - 1] : null;
        const ssIdx = rs ? rs.sessionStartIndex : null;
        const ssBar = (rd && Number.isFinite(ssIdx) && rd[ssIdx]) ? rd[ssIdx] : null;

        // Every route the engine might carry a session start on. Recording WHICH answered matters: a null
        // from the wrong field name has been read as a product fact in this workstream before.
        const startRoutes = [];
        for (const [name, val] of [
          ['rs.sessionStartMs', rs && rs.sessionStartMs],
          ['rs._sessionStartMs', rs && rs._sessionStartMs],
          ['rs.sessionStartTimestamp', rs && rs.sessionStartTimestamp],
          ['rs.replayStartTimestamp', rs && rs.replayStartTimestamp],
          ['rs.initialReplayTimestamp', rs && rs.initialReplayTimestamp],
          ['chart.sessionStartMs', chart && chart.sessionStartMs],
          ['chart.replaySessionStart', chart && chart.replaySessionStart],
        ]) if (val !== undefined && val !== null) startRoutes.push({ route: name, ms: norm(Number(val)) });

        out.push({
          realm: label,
          tf: chart ? (chart.currentTimeframe ?? null) : null,
          datasetId: (chart && (chart.currentFileId ?? chart.fileId ?? chart.datasetId)) ?? null,
          bars: rd ? rd.length : null,
          dataFirstMs: norm(first && (first.t ?? first.time)),
          dataLastMs: norm(last && (last.t ?? last.time)),
          currentIndex: rs ? rs.currentIndex : null,
          parkedAtLastBar: !!(rs && rd && rs.currentIndex === rd.length - 1),
          sessionStartIndex: ssIdx ?? null,
          sessionStartBarMs: norm(ssBar && (ssBar.t ?? ssBar.time)),
          startRoutes,
          isBacktesting: rs ? (rs.isBacktesting ?? null) : null,
        });
      } catch (e) { out.push({ realm: label, error: String(e).slice(0, 140) }); }
    };
    visit(window, 'host');
    for (let i = 0; i < window.frames.length; i++) { try { visit(window.frames[i], 'frame' + i); } catch (_) {} }
    return out;
  });
}

const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) : 'n/a');

async function main() {
  const artifact = { signature: 'SESSION-START-PROBE-V1', startedAt: new Date().toISOString() };
  let session = null;
  try {
    session = await bootConf01Session({ indicators: loadConf05Indicators().pairs, replaySpeed: 10, placeOrder: false, label: 'session-start-probe' });
    await new Promise((r) => setTimeout(r, 5000));
    artifact.realms = await readRealms(session.page);

    console.log('\n=== WHAT EACH PANEL HOLDS vs WHERE IT IS ASKED TO START\n');
    for (const r of artifact.realms) {
      if (r.error) { console.log(`  ${r.realm}: ERROR ${r.error}`); continue; }
      const starts = r.startRoutes.length ? r.startRoutes.map((s) => `${s.route}=${iso(s.ms)}`).join('  ') : 'NO SESSION-START FIELD FOUND ON ANY ROUTE';
      console.log(`  ${String(r.tf).padEnd(4)} dataset ${r.datasetId}  ${r.bars} bars  ${iso(r.dataFirstMs)} -> ${iso(r.dataLastMs)}`);
      console.log(`        index ${r.currentIndex}${r.parkedAtLastBar ? '  <<< PARKED ON LAST BAR' : ''}   sessionStartIndex ${r.sessionStartIndex} (${iso(r.sessionStartBarMs)})   backtesting=${r.isBacktesting}`);
      console.log(`        ${starts}`);
    }

    const asked = artifact.realms.flatMap((r) => (r.startRoutes || []).map((s) => s.ms)).filter(Number.isFinite);
    const distinct = [...new Set(asked)];
    const parked = artifact.realms.filter((r) => r.parkedAtLastBar);
    console.log(`\n  distinct session starts across realms: ${distinct.length} -> ${distinct.map(iso).join(', ') || 'none readable'}`);
    console.log(`  parked on last bar: ${parked.length} of ${artifact.realms.length} (${parked.map((p) => p.tf).join(', ') || 'none'})`);
    for (const p of parked) {
      const s = (p.startRoutes[0] || {}).ms;
      if (Number.isFinite(s) && Number.isFinite(p.dataLastMs)) {
        const daysShort = (s - p.dataLastMs) / 86400000;
        console.log(`    ${p.tf}: data ends ${iso(p.dataLastMs)}, start asked for ${iso(s)} — short by ${daysShort.toFixed(1)} days`);
      }
    }
    artifact.summary = { distinctSessionStarts: distinct, parkedCount: parked.length, realmCount: artifact.realms.length };
    artifact.verdict = 'CAPTURED';
  } catch (e) {
    artifact.verdict = 'ERROR'; artifact.error = String(e && e.stack ? e.stack : e).slice(0, 1200);
    log('ERROR ' + artifact.error.split('\n')[0]);
  } finally {
    try { if (session && session.browser) await session.browser.close(); } catch (_) {}
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2));
    log(`artifact -> ${OUT}`);
  }
}

main();
