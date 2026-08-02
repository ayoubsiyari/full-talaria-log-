/**
 * ORDER-01B — what the engine actually does at a sub-bar step, per mode.
 *
 * The read-back canary went red at step=1s with a rate of zero and no panel
 * observed playing. Zero has three very different causes and the fix depends
 * on which one it is:
 *
 *   - playback never started, so nothing was measured
 *   - playback runs but the market clock only moves at bar boundaries, so the
 *     average is right and the sampling window was too short to see a jump
 *   - playback runs, the clock moves, and the meter is reading the wrong thing
 *
 * So this samples the playhead directly — `replayTimestamp` over wall time,
 * which is the market rate by definition and owes nothing to the meter under
 * test — in three conditions, and prints all three side by side.
 *
 *   node scripts/order01b-substep-probe.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyDistV9LayoutViaUi,
  loadPuppeteer,
  waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { startServer as startHarnessServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import {
  installBuiltProductBoot,
  reactParityUrlWithLayout,
} from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[substep-probe] ${new Date().toISOString()} ${m}`);

const SAMPLE_MS = 9_000;

/** Drive one condition on the host panel and watch the playhead move. */
async function measure(page, { mode, step, speed, whilePlaying = false, atEdge = false }) {
  return page.evaluate(async (mode_, step_, speed_, sampleMs, whilePlaying_, atEdge_) => {
    const sleepIn = (ms) => new Promise((r) => setTimeout(r, ms));
    const rs = window.chart && window.chart.replaySystem;
    if (!rs) return { ok: false, why: 'no replaySystem on host' };

    const out = { mode: mode_, step: step_, speed: speed_, whilePlaying: whilePlaying_ };
    try {
      if (typeof rs.setPlaybackMode === 'function') {
        rs.setPlaybackMode(mode_, { restartPlayback: false });
      }
      out.modeAfter = typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : null;
      if (typeof rs.setSpeed === 'function') rs.setSpeed(speed_);
      // Park the playhead on the last loaded bar on purpose. This is where the
      // canary found the host panel sitting, and the condition a sub-bar step
      // could not get out of: at the loaded edge with more data on the server.
      if (atEdge_) {
        const raw = Array.isArray(rs.fullRawData) ? rs.fullRawData : [];
        const last = raw[raw.length - 1];
        if (last && typeof rs.goToReplayTimestamp === 'function') {
          rs.goToReplayTimestamp(Number(last.t));
        }
        await sleepIn(500);
        out.parkedAt = { index: rs.currentIndex, of: raw.length };
      }
      // The gesture that matters: a user already watching replay picks a step
      // off the menu. The engine restarts playback under it, and a restart that
      // does not come back is a stall the user reads as "the chart froze".
      if (whilePlaying_) {
        if (!rs.isPlaying && typeof rs.play === 'function') rs.play();
        else if (!rs.isPlaying && typeof rs.togglePlayback === 'function') rs.togglePlayback();
        await sleepIn(1_500);
        out.playingBeforeStep = !!rs.isPlaying;
      }
      out.stepAccepted = step_ === null ? null : rs.setStepSeconds(step_);
      if (whilePlaying_) {
        await sleepIn(1_000);
        out.playingAfterStep = !!rs.isPlaying;
      }
      out.stepAfter = typeof rs.getStepSeconds === 'function' ? rs.getStepSeconds() : null;
      out.canServe = typeof rs.canServeStep === 'function' && step_ !== null
        ? rs.canServeStep(step_) : null;
      out.routing = typeof rs.getStepRouting === 'function' ? rs.getStepRouting() : null;
      out.promised = typeof rs.getMarketSecondsPerWallSecond === 'function'
        ? rs.getMarketSecondsPerWallSecond() : null;
      out.cadence = typeof rs.getCandlePlaybackCadence === 'function'
        ? rs.getCandlePlaybackCadence() : null;

      if (!rs.isPlaying && typeof rs.play === 'function') rs.play();
      else if (!rs.isPlaying && typeof rs.togglePlayback === 'function') rs.togglePlayback();
      // Sampled rather than read once: a loop that starts and gives up on its
      // first tick looks identical to one that never started, if you only look
      // afterwards.
      out.trace = [];
      for (const at of [0, 150, 400, 1000, 2500]) {
        if (at) await sleepIn(at - out.trace[out.trace.length - 1].at);
        out.trace.push({
          at,
          playing: !!rs.isPlaying,
          edgeWait: !!rs._replayForwardEdgeWait,
          timer: !!rs._nextCandleTimer,
          waits: rs._loadedEdgeWaits ?? null,
          probes: rs.edgeProbeRetryCount ?? null,
          index: rs.currentIndex ?? null,
        });
      }
      out.isPlaying = !!rs.isPlaying;

      const readHead = () => {
        const t = rs.currentTime != null ? rs.currentTime : rs.replayTimestamp;
        return { t: Number(t), i: rs.currentIndex != null ? Number(rs.currentIndex) : null };
      };
      const t0 = performance.now();
      const h0 = readHead();
      const track = [];
      while (performance.now() - t0 < sampleMs) {
        await sleepIn(500);
        const h = readHead();
        track.push({ ms: Math.round(performance.now() - t0), t: h.t, i: h.i });
      }
      const h1 = readHead();
      const wallSec = (performance.now() - t0) / 1000;
      out.marketSecAdvanced = Number.isFinite(h1.t) && Number.isFinite(h0.t)
        ? (h1.t - h0.t) / 1000 : null;
      out.barsAdvanced = (Number.isFinite(h1.i) && Number.isFinite(h0.i)) ? h1.i - h0.i : null;
      out.wallSec = +wallSec.toFixed(2);
      out.measuredMarketPerWall = out.marketSecAdvanced === null
        ? null : +(out.marketSecAdvanced / wallSec).toFixed(2);
      // Distinct playhead values seen: 1 means the clock never moved at all,
      // which separates "stalled" from "moves in jumps".
      out.distinctHeads = new Set(track.map((x) => x.t)).size;
      out.readBack = window.__talariaEffectiveRate ?? null;
      out.ok = true;
    } catch (e) {
      out.ok = false;
      out.why = String((e && e.message) || e);
    }
    return out;
  }, mode, step, speed, SAMPLE_MS, whilePlaying, atEdge);
}

async function main() {
  const puppeteer = await loadPuppeteer();
  const harness = await startHarnessServer(0);
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 300_000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 960 },
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180_000);
    await installBuiltProductBoot(page, {});
    await page.goto(
      reactParityUrlWithLayout(`${harness.url}/chart/dist-v9/index.html?mode=backtest`, '1'),
      { waitUntil: 'domcontentloaded', timeout: 180_000 },
    );
    await waitForDistV9SingleReady(page, 180_000);
    await applyDistV9LayoutViaUi(page, 1);
    await sleep(3_000);

    // Enter replay on the host panel before any condition runs.
    await page.evaluate(async () => {
      const rs = window.chart && window.chart.replaySystem;
      if (rs && !rs.isActive && typeof rs.enterReplayMode === 'function') {
        await rs.enterReplayMode();
      }
    });
    await sleep(2_000);
    log('host in replay');

    const conditions = [
      { mode: 'candle', step: 60, speed: 10 },
      { mode: 'candle', step: 1, speed: 10 },
      { mode: 'tick', step: 1, speed: 10 },
      { mode: 'tick', step: 1, speed: 1 },
      { mode: 'candle', step: 1, speed: 10, whilePlaying: true },
      { mode: 'candle', step: 60, speed: 10, whilePlaying: true },
      { mode: 'tick', step: 1, speed: 1, whilePlaying: true },
      // The canary's host case, reproduced deliberately.
      { mode: 'candle', step: 1, speed: 10, atEdge: true },
      { mode: 'candle', step: 60, speed: 10, atEdge: true },
    ];

    const rows = [];
    for (const c of conditions) {
      log(`condition ${c.mode} step=${c.step}s speed=${c.speed}`);
      rows.push(await measure(page, c));
      await sleep(500);
    }

    console.log('\n mode   step speed set-while | play>step playing heads | promised measured readback');
    console.log(' -------------------------- |-------------------------|---------------------------');
    for (const r of rows) {
      console.log(
        ` ${String(r.mode).padEnd(6)} ${String(r.step + 's').padEnd(4)} ${String(r.speed).padEnd(5)} `
        + `${(r.whilePlaying ? 'playing' : 'paused').padEnd(9)} |`
        + ` ${String(r.whilePlaying ? `${r.playingBeforeStep}>${r.playingAfterStep}` : '-').padEnd(9)}`
        + ` ${String(r.isPlaying).padEnd(7)} ${String(r.distinctHeads).padEnd(5)} |`
        + ` ${String(r.promised).padEnd(8)} ${String(r.measuredMarketPerWall).padEnd(8)} ${r.readBack}`,
      );
      if (!r.ok) console.log(`        FAILED: ${r.why}`);
      if (r.parkedAt) console.log(`        parked at index ${r.parkedAt.index} of ${r.parkedAt.of}`);
      if (r.trace && (!r.isPlaying || r.measuredMarketPerWall === 0)) {
        console.log(`        trace: ${r.trace.map((t) => `${t.at}ms play=${t.playing} edgeWait=${t.edgeWait} timer=${t.timer} waits=${t.waits} idx=${t.index}`).join('\n               ')}`);
      }
    }
    console.log('\n  heads = distinct playhead values seen in the window; 1 means the clock never moved.');
    console.log('  measured = market seconds advanced per wall second, read off the playhead itself.');
  } finally {
    await browser.close().catch(() => {});
    await harness.close?.().catch?.(() => {});
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
