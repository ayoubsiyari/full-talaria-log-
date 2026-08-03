/**
 * ORDER-01B — what happens when Play is pressed at the loaded edge, sub-bar.
 *
 * The read-back canary keeps finding one realm parked on the last loaded bar
 * with `hasMoreRight` true, refusing to play at step=1s while its peers run.
 * Reasoning about it from the outside has been wrong twice, so this parks the
 * host on its own last bar deliberately, presses Play, and traces the engine's
 * state every 200 ms — including the guards that can refuse.
 *
 *   node scripts/order01b-edge-play-probe.mjs
 */
import fs from 'node:fs';
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
import { captureProvenance } from './lib/run-provenance.mjs';
import { acquireRunLockOrExit, writeArtifactAtomic } from './lib/run-lock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[edge-play] ${new Date().toISOString()} ${m}`);

async function trace(page, { step }) {
  return page.evaluate(async (step_) => {
    const sleepIn = (ms) => new Promise((r) => setTimeout(r, ms));
    const rs = window.chart && window.chart.replaySystem;
    if (!rs) return { ok: false, why: 'no replaySystem' };

    if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
      rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
      await sleepIn(1_500);
    }
    if (typeof rs.setPlaybackMode === 'function') rs.setPlaybackMode('candle', { restartPlayback: false });
    if (typeof rs.setSpeed === 'function') rs.setSpeed(10);

    // Park deliberately on the last loaded bar — the condition under test.
    const raw = rs.fullRawData || [];
    const lastIdx = raw.length - 1;
    const last = raw[lastIdx];
    if (last && typeof rs.goToReplayTimestamp === 'function') {
      rs.goToReplayTimestamp(Number(last.t));
      await sleepIn(500);
    }
    const accepted = rs.setStepSeconds(step_);

    const snap = (tag) => ({
      tag,
      playing: !!rs.isPlaying,
      idx: rs.currentIndex ?? null,
      raw: Array.isArray(rs.fullRawData) ? rs.fullRawData.length : null,
      ts: Number(rs.replayTimestamp),
      edgeWait: rs._replayForwardEdgeWait ?? null,
      waits: rs._order01bSubBarEdgeWaits ?? null,
      probeRetries: rs.edgeProbeRetryCount ?? null,
      nextTimer: !!rs._nextCandleTimer,
      hasMoreRight: !!(window.chart._serverCursors && window.chart._serverCursors.hasMoreRight),
      panLoading: !!window.chart._panLoading,
      noOpAtEnd: typeof rs._playWouldBeNoOpAtSessionEnd === 'function' ? rs._playWouldBeNoOpAtSessionEnd() : null,
      subBar: typeof rs._isSubBarStepMode === 'function' ? rs._isSubBarStepMode() : null,
    });

    const frames = [snap('parked')];
    if (typeof rs.play === 'function') rs.play();
    else if (typeof rs.togglePlayback === 'function') rs.togglePlayback();
    // Read synchronously on return from play(). isPlayStarting is true for about
    // two frames, so the 200 ms trace below cannot see it: by the first tick it
    // has already resolved either way. This one reading is what separates a
    // start that was scheduled and then starved from an exit at a guard.
    const onReturn = snap('after play()');
    onReturn.isPlayStartingOnReturn = !!rs.isPlayStarting;
    onReturn.playStartRafScheduled = rs._playStartRaf1 != null;
    frames.push(onReturn);
    for (let i = 0; i < 30; i++) {
      await sleepIn(200);
      frames.push(snap(`t+${(i + 1) * 200}ms`));
    }
    return { ok: true, accepted, frames };
  }, step);
}

async function main() {
  const distIndex = path.resolve(__dirname, '../chart v 1.4/chart/dist-v9/index.html');
  const argOf = (name, dflt = null) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : dflt;
  };
  const out = path.resolve(argOf('out',
    path.join(__dirname, '..', 'docs/plan3/evidence', `order01b-edge-play-${Date.now()}.json`)));
  // Console output is not an artifact: the b124 retirement turned on nobody
  // being able to say afterwards which surface a run had read.
  const lock = acquireRunLockOrExit({
    artifact: out,
    script: 'order01b-edge-play-probe.mjs',
    allowConcurrent: process.argv.includes('--allow-concurrent'),
  });
  const report = {
    signature: 'ORDER01B-EDGE-PLAY-PROBE-V1',
    at: new Date().toISOString(),
    provenance: captureProvenance(distIndex),
    runLock: { state: lock.state, pid: process.pid },
    steps: [],
  };
  const save = () => { writeArtifactAtomic(out, JSON.stringify(report, null, 2)); };
  log(`HEAD ${report.provenance.headSha} distV9 ${report.provenance.distV9BuildIdOnDisk} `
    + `dirtyGoverned=${report.provenance.dirtyGovernedPaths.length}`);

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
    await applyDistV9LayoutViaUi(page, 4);
    await sleep(3_000);

    for (const step of [1, 60]) {
      log(`host parked on its last bar, step=${step}s`);
      const r = await trace(page, { step });
      report.steps.push({ step, ...r });
      save();
      if (!r.ok) { console.log(`  FAILED: ${r.why}`); continue; }
      console.log(`  setStepSeconds(${step}) => ${r.accepted}`);
      console.log('  tag           playing idx/raw       edgeWait waits probe timer more pan noOp subBar');
      let prev = null;
      for (const f of r.frames) {
        const changed = !prev || ['playing', 'idx', 'raw', 'edgeWait', 'waits', 'nextTimer', 'hasMoreRight', 'panLoading']
          .some((k) => prev[k] !== f[k]);
        if (!changed) continue;
        prev = f;
        console.log(
          `  ${String(f.tag).padEnd(13)} ${String(f.playing).padEnd(7)} ${String(`${f.idx}/${f.raw}`).padEnd(14)}`
          + ` ${String(f.edgeWait).padEnd(8)} ${String(f.waits).padEnd(5)} ${String(f.probeRetries).padEnd(5)}`
          + ` ${String(f.nextTimer).padEnd(5)} ${String(f.hasMoreRight).padEnd(4)} ${String(f.panLoading).padEnd(3)}`
          + ` ${String(f.noOpAtEnd).padEnd(4)} ${f.subBar}`,
        );
      }
      const onReturn = r.frames[1] || {};
      const lastFrame = r.frames[r.frames.length - 1];
      console.log(`  on return: isPlayStarting=${onReturn.isPlayStartingOnReturn} rafScheduled=${onReturn.playStartRafScheduled}`);
      console.log(`  ended: playing=${lastFrame.playing} idx=${lastFrame.idx}/${lastFrame.raw}\n`);
    }
  } finally {
    save();
    console.log(`artifact: ${out}`);
    await browser.close().catch(() => {});
    await harness.close?.().catch?.(() => {});
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
