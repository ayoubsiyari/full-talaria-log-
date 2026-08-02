/**
 * PEER-01 — why coarse peers pin at their data end while the 1m host keeps going.
 *
 * C's probe: three of four panels pinned after ten minutes — 5m at 1999/2000,
 * 15m at 3909/3910, 1h at 2493/2494 — while 1m kept advancing through re-base
 * cycles. Three candidate causes were named: prefetch runway, data-floor
 * routing, or a dataset too short for the coarse timeframes.
 *
 * Those three make different predictions, so this measures the things that
 * tell them apart rather than sampling positions and inferring:
 *
 *   too short        -> the peer's own cursors say hasMoreRight=false, and the
 *                       server has genuinely nothing past the last bar
 *   runway           -> forward loads ARE requested for the peer, just too late
 *                       or too small
 *   nobody asks      -> checkViewportLoadMore('forward') is never called on the
 *                       peer at all, whatever the cursors say
 *
 * The third is invisible to a positions-only probe, so every realm's
 * checkViewportLoadMore is counted by direction, at the call.
 *
 *   node scripts/peer-starvation-probe.mjs [--minutes=10] [--speed=10]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyDatasetPlan,
  applyDistV9LayoutViaUi,
  loadPuppeteer,
  readPanelDatasets,
  waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { startServer as startHarnessServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import {
  installBuiltProductBoot,
  reactParityUrlWithLayout,
} from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[peer-01] ${new Date().toISOString()} ${m}`);

const arg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : dflt;
};
const MINUTES = Number(arg('minutes', '10'));
const SPEED = Number(arg('speed', '10'));
const SAMPLE_EVERY_MS = 15_000;
const PLAN_TFS = { A: '1m', B: '5m', C: '15m', D: '1h' };
const OUT = path.resolve(__dirname, '../docs/plan3/evidence/peer-starvation-probe.json');

/** Count every forward/backward load request, in every realm, at the call. */
const INSTRUMENT = () => {
  const realms = [{ w: window, name: 'top' }];
  for (const f of [...document.querySelectorAll('iframe')]) {
    try { if (f.contentWindow) realms.push({ w: f.contentWindow, name: f.id || 'panel' }); } catch (_e) { /* ignore */ }
  }
  const out = [];
  for (const r of realms) {
    const ch = r.w.chart;
    if (!ch || typeof ch.checkViewportLoadMore !== 'function') { out.push({ realm: r.name, armed: false }); continue; }
    if (ch.__peer01Counted) { out.push({ realm: r.name, armed: true, already: true }); continue; }
    ch.__peer01Counted = true;
    ch.__peer01Loads = { forward: 0, backward: 0, forwardAccepted: 0, firstForwardAt: null, lastForwardAt: null };
    const orig = ch.checkViewportLoadMore.bind(ch);
    ch.checkViewportLoadMore = function counted(direction, ...rest) {
      const c = ch.__peer01Loads;
      const now = Math.round(performance.now());
      if (direction === 'forward') {
        c.forward += 1;
        if (c.firstForwardAt === null) c.firstForwardAt = now;
        c.lastForwardAt = now;
      } else if (direction === 'backward') c.backward += 1;
      const res = orig(direction, ...rest);
      // Truthy return means the request was accepted rather than coalesced away.
      if (direction === 'forward' && res) c.forwardAccepted += 1;
      return res;
    };
    out.push({ realm: r.name, armed: true });
  }
  return out;
};

/** One reading of every realm, from the top frame. */
const SAMPLE = () => {
  const realms = [{ w: window, name: 'top' }];
  for (const f of [...document.querySelectorAll('iframe')]) {
    try { if (f.contentWindow) realms.push({ w: f.contentWindow, name: f.id || 'panel' }); } catch (_e) { /* ignore */ }
  }
  return realms.map((r) => {
    const ch = r.w.chart;
    if (!ch) return { realm: r.name, absent: true };
    const rs = ch.replaySystem;
    const raw = rs && Array.isArray(rs.fullRawData) ? rs.fullRawData : null;
    const disp = Array.isArray(ch.data) ? ch.data : null;
    const cur = ch._serverCursors || null;
    return {
      realm: r.name,
      tf: ch.currentTimeframe ?? null,
      fileId: ch.currentFileId ?? null,
      playing: !!(rs && rs.isPlaying),
      index: rs ? rs.currentIndex ?? null : null,
      rawLen: raw ? raw.length : null,
      rawLastT: raw && raw.length ? Number(raw[raw.length - 1].t) : null,
      dispLen: disp ? disp.length : null,
      dispLastT: disp && disp.length ? Number(disp[disp.length - 1].t) : null,
      playheadT: rs ? Number(rs.replayTimestamp) : null,
      hasMoreRight: cur ? !!cur.hasMoreRight : null,
      panLoading: !!ch._panLoading,
      loads: ch.__peer01Loads ? { ...ch.__peer01Loads } : null,
      catchUpFails: ch._mcCatchUpFails ?? null,
      catchUpCooldownInMs: Number.isFinite(ch._mcCatchUpCooldownUntil)
        ? Math.round(ch._mcCatchUpCooldownUntil - performance.now()) : null,
      panelRawLen: Array.isArray(ch._panelFullRawData) ? ch._panelFullRawData.length : null,
      viewportSyncOn: ch._multichartVisibleRangeSyncOn ?? null,
    };
  });
};

async function main() {
  const puppeteer = await loadPuppeteer();
  const harness = await startHarnessServer(0);
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 600_000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1600, height: 1000 },
  });

  const samples = [];
  let verdict = null;
  const observed = {};
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(240_000);
    await installBuiltProductBoot(page, {});
    await page.goto(
      reactParityUrlWithLayout(`${harness.url}/chart/dist-v9/index.html?mode=backtest`, '1'),
      { waitUntil: 'domcontentloaded', timeout: 240_000 },
    );
    await waitForDistV9SingleReady(page, 240_000);
    await applyDistV9LayoutViaUi(page, 4);
    await sleep(4_000);

    // One dataset, four timeframes: C's condition, where each peer has its own
    // aggregate length and the host's 1m master is the one that grows.
    const seen = await readPanelDatasets(page, ['A', 'B', 'C', 'D']);
    const fileId = seen.find((p) => p.fileId != null)?.fileId;
    if (fileId == null) throw new Error('no panel reported a fileId');
    observed.fileId = fileId;
    const plan = { panels: Object.entries(PLAN_TFS).map(([panelId, timeframe]) => ({ panelId, fileId, timeframe })) };
    log(`applying 1m/5m/15m/1h on file ${fileId}`);
    await applyDatasetPlan(page, plan, { settleMs: 2_000, timeoutMs: 90_000 });
    observed.datasets = await readPanelDatasets(page, ['A', 'B', 'C', 'D']);

    await page.evaluate(INSTRUMENT);

    // Host drives; peers follow. That asymmetry is the thing under test, so the
    // host is the only realm told to play.
    await page.evaluate(async (speed) => {
      const rs = window.chart && window.chart.replaySystem;
      if (!rs) return;
      if (!rs.isActive && typeof rs.enterReplayMode === 'function') await rs.enterReplayMode({ startAtBeginning: true });
      if (typeof rs.setSpeed === 'function') rs.setSpeed(speed);
      const proto = Object.getPrototypeOf(rs);
      // The shell's own play override is inert on the host (see ORDER-01B
      // canary, SHELL_PLAY_OVERRIDE_INERT); the class method is what starts it.
      if (!rs.isPlaying && proto && typeof proto.play === 'function') proto.play.call(rs);
      else if (!rs.isPlaying && typeof rs.play === 'function') rs.play();
    }, SPEED);
    await sleep(2_000);
    // Instrument again: entering replay can rebuild a chart underneath us.
    observed.instrumented = await page.evaluate(INSTRUMENT);

    const totalMs = MINUTES * 60_000;
    const started = Date.now();
    log(`sampling ${MINUTES} min at speed ${SPEED}`);
    while (Date.now() - started < totalMs) {
      const atMs = Date.now() - started;
      const rows = await page.evaluate(SAMPLE);
      samples.push({ atMs, rows });
      const line = rows.filter((r) => !r.absent).map((r) => {
        const pos = `${r.index}/${r.rawLen}`;
        const fw = r.loads ? r.loads.forward : '-';
        return `${String(r.tf).padEnd(3)} ${pos.padEnd(12)} fw=${String(fw).padEnd(4)} more=${r.hasMoreRight}`;
      }).join(' | ');
      log(`t+${String(Math.round(atMs / 1000)).padStart(3)}s  ${line}`);
      await sleep(SAMPLE_EVERY_MS);
    }
    observed.samples = samples;

    /* ---- what the samples say ------------------------------------------- */
    console.log('\n--- per realm, over the whole run ---');
    const last = samples[samples.length - 1].rows;
    const first = samples[0].rows;
    const perRealm = last.filter((r) => !r.absent).map((r) => {
      const f = first.find((x) => x.realm === r.realm && x.tf === r.tf) || {};
      const advancedBars = Number.isFinite(r.index) && Number.isFinite(f.index) ? r.index - f.index : null;
      const grewBars = Number.isFinite(r.rawLen) && Number.isFinite(f.rawLen) ? r.rawLen - f.rawLen : null;
      const movedT = Number.isFinite(r.rawLastT) && Number.isFinite(f.rawLastT) ? r.rawLastT - f.rawLastT : null;
      return {
        realm: r.realm,
        tf: r.tf,
        finalIndex: r.index,
        finalRawLen: r.rawLen,
        atLastBar: Number.isFinite(r.index) && Number.isFinite(r.rawLen) ? r.index >= r.rawLen - 1 : null,
        advancedBars,
        rawGrewBars: grewBars,
        rawEdgeMovedMs: movedT,
        forwardRequests: r.loads ? r.loads.forward : null,
        forwardAccepted: r.loads ? r.loads.forwardAccepted : null,
        hasMoreRight: r.hasMoreRight,
        catchUpFails: r.catchUpFails,
        playing: r.playing,
      };
    });
    for (const r of perRealm) console.log(`        ${JSON.stringify(r)}`);
    observed.perRealm = perRealm;

    const pinned = perRealm.filter((r) => r.atLastBar && (r.advancedBars === 0 || r.rawGrewBars === 0));
    const askers = perRealm.filter((r) => (r.forwardRequests || 0) > 0);
    const silent = perRealm.filter((r) => (r.forwardRequests || 0) === 0);

    console.log('\n--- which of the three candidate causes the readings support ---');
    console.log(`        realms that asked for forward data at all: ${askers.map((r) => r.tf).join(', ') || 'none'}`);
    console.log(`        realms that never asked:                   ${silent.map((r) => r.tf).join(', ') || 'none'}`);
    console.log(`        realms pinned at their last bar:           ${pinned.map((r) => r.tf).join(', ') || 'none'}`);
    for (const r of pinned) {
      console.log(`        ${r.tf}: hasMoreRight=${r.hasMoreRight} forwardRequests=${r.forwardRequests} `
        + `-> ${r.forwardRequests === 0
          ? (r.hasMoreRight ? 'NOBODY ASKED, and the server says there IS more' : 'nobody asked, and cursors claim no more')
          : (r.hasMoreRight ? 'asked and still short: runway or paging' : 'asked; server says the dataset ends here')}`);
    }

    const nobodyAsked = pinned.filter((r) => r.forwardRequests === 0);
    const askedAndMore = pinned.filter((r) => r.forwardRequests > 0 && r.hasMoreRight);
    const trulyShort = pinned.filter((r) => r.hasMoreRight === false && r.forwardRequests > 0);
    verdict = pinned.length === 0
      ? { state: 'NO_STARVATION_REPRODUCED', why: 'every realm kept advancing over the window' }
      : nobodyAsked.length
        ? {
          state: 'PEER_NEVER_REQUESTS_FORWARD',
          why: `${nobodyAsked.map((r) => r.tf).join(', ')} pinned without a single forward request. `
            + `The prefetch that keeps the host alive runs inside an actively playing replay loop, and a `
            + `passive peer has no such loop, so runway size is not the variable.`,
        }
        : askedAndMore.length
          ? { state: 'PEER_ASKS_BUT_STAYS_SHORT', why: `${askedAndMore.map((r) => r.tf).join(', ')} requested forward data and the server still reports more` }
          : { state: 'DATASET_ENDS_HERE', why: `${trulyShort.map((r) => r.tf).join(', ')} reached a real dataset end` };
    console.log(`\n  PEER-01 — ${verdict.state}\n  ${verdict.why}`);
  } finally {
    try { await browser.close(); } catch (_e) { /* ignore */ }
    try { await harness.close?.(); } catch (_e) { /* ignore */ }
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      condition: { minutes: MINUTES, speed: SPEED, timeframes: PLAN_TFS },
      verdict,
      observed,
    }, null, 2)}\n`);
    console.log(`  artifact ${OUT}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
