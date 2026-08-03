/**
 * SHELL-PLAY-01 — which guard actually refuses the start.
 *
 * A's edge probe answered the first question: `isPlayStarting` is FALSE on
 * return, so `play()` never reached the deferred-start block and this is not
 * start starvation. It cannot answer the second, because it samples the guard
 * inputs BEFORE the call, and `play()` mutates cadence state at its head
 * (`_onFinestTfCadencePanelsChanged`, `_shouldUseTickAnimation`) before it
 * evaluates them. A guard input read a microsecond early is not the value the
 * guard saw.
 *
 * So this instrument does not read the inputs at all. It wraps each of the four
 * exits that can return without setting `isPlayStarting` and records which one
 * fired, in order, with the value it returned:
 *
 *   1. !isActive
 *   2. window.__talariaChartWindowBlocked
 *   3. _playWouldBeNoOpAtSessionEnd()   — also emits a user-visible toast
 *   4. _isReplayPageHidden()            — sets isPlaying = true and returns
 *
 * BIND-01. The states are reported separately and a run that reaches the
 * deferred start reports GUARD_NONE rather than collapsing into the same red:
 *
 *   GUARD_NONE            no guard fired and isPlayStarting was set — the start
 *                         was scheduled, and any inertness is downstream
 *   GUARD_<n>_<name>      that guard returned, naming the exit
 *   PROBE_INERT           play() was never reached, so nothing was observed and
 *                         no conclusion may be drawn either way
 *
 * The instance-identity arm is separate and deliberate: `play()` can trigger a
 * forward prefetch that reseeds the window, and if a reseed replaces the
 * ReplaySystem the caller holds, then every reading taken afterwards through
 * the held reference describes a dead object. That would make the symptom and
 * the measurement of it the same artifact, so it is checked rather than assumed.
 *
 *   node scripts/shellplay-guard-attribution-probe.mjs
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[shellplay-guard] ${new Date().toISOString()} ${m}`);

async function attribute(page, { step }) {
  return page.evaluate(async (step_) => {
    const sleepIn = (ms) => new Promise((r) => setTimeout(r, ms));
    const rs = window.chart && window.chart.replaySystem;
    if (!rs) return { state: 'PROBE_INERT', why: 'no replaySystem on window.chart' };

    if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
      rs.enterReplayMode({ startAtBeginning: true, userInitiated: true });
      await sleepIn(1_500);
    }
    if (typeof rs.setPlaybackMode === 'function') rs.setPlaybackMode('candle', { restartPlayback: false });
    if (typeof rs.setSpeed === 'function') rs.setSpeed(10);

    // Park on the last loaded bar — the condition under test.
    const raw = rs.fullRawData || [];
    const last = raw[raw.length - 1];
    if (last && typeof rs.goToReplayTimestamp === 'function') {
      rs.goToReplayTimestamp(Number(last.t));
      await sleepIn(500);
    }
    const accepted = typeof rs.setStepSeconds === 'function' ? rs.setStepSeconds(step_) : null;

    const calls = [];
    const originals = {};
    const wrap = (name) => {
      if (typeof rs[name] !== 'function') { calls.push({ guard: name, absent: true }); return; }
      originals[name] = rs[name];
      rs[name] = function wrapped(...args) {
        const out = originals[name].apply(this, args);
        calls.push({ guard: name, returned: out === undefined ? null : !!out });
        return out;
      };
    };
    wrap('_playWouldBeNoOpAtSessionEnd');
    wrap('_isReplayPageHidden');

    const toasts = [];
    const origToast = rs._maybeNotifyReplayToast;
    if (typeof origToast === 'function') {
      rs._maybeNotifyReplayToast = function wrappedToast(msg, ...rest) {
        toasts.push(String(msg));
        return origToast.call(this, msg, ...rest);
      };
    }

    const before = {
      isActive: !!rs.isActive,
      windowBlocked: !!(typeof window !== 'undefined' && window.__talariaChartWindowBlocked),
      isPlaying: !!rs.isPlaying,
      idx: rs.currentIndex ?? null,
      rawLen: Array.isArray(rs.fullRawData) ? rs.fullRawData.length : null,
      subBar: typeof rs._isSubBarStepMode === 'function' ? rs._isSubBarStepMode() : null,
      // Sampled early on purpose, so it can be COMPARED with the wrapped value.
      noOpSampledEarly: typeof originals._playWouldBeNoOpAtSessionEnd === 'function'
        ? !!originals._playWouldBeNoOpAtSessionEnd.call(rs) : null,
    };
    calls.length = 0; // the sample above must not count as a guard evaluation

    const playIsOwn = Object.prototype.hasOwnProperty.call(rs, 'play');
    const playSrc = typeof rs.play === 'function' ? String(rs.play).slice(0, 160) : null;

    // RECEIVER ARM. The override forwards either to `this` or to a receiver
    // captured when it was installed. Those are indistinguishable from outside
    // unless the prototype records which object it actually ran on, so tag the
    // caller and let the class method report its own `this`.
    rs.__probeId = 'CALLER';
    const proto = Object.getPrototypeOf(rs);
    const protoPlay = proto && proto.play;
    const receivers = [];
    let protoWrapped = false;
    if (typeof protoPlay === 'function' && !Object.prototype.hasOwnProperty.call(rs, 'play') === false) {
      proto.play = function receiverRecordingPlay(...a) {
        receivers.push({
          isCaller: this === rs,
          probeId: this && this.__probeId ? this.__probeId : null,
          isActiveOnReceiver: !!(this && this.isActive),
        });
        return protoPlay.apply(this, a);
      };
      protoWrapped = true;
    }

    if (typeof rs.play === 'function') rs.play();
    else return { state: 'PROBE_INERT', why: 'rs.play is not a function' };

    if (protoWrapped) proto.play = protoPlay;

    const after = {
      // Guards 1 and 2 are plain reads inside play(), so they leave no call to
      // wrap. They are re-read at call time, and the window-blocked flag is a
      // global another window can set between the sample and the call.
      isActiveAfter: !!rs.isActive,
      windowBlockedAfter: !!(typeof window !== 'undefined' && window.__talariaChartWindowBlocked),
      isPlayStarting: !!rs.isPlayStarting,
      rafScheduled: rs._playStartRaf1 != null,
      isPlaying: !!rs.isPlaying,
      idx: rs.currentIndex ?? null,
      rawLen: Array.isArray(rs.fullRawData) ? rs.fullRawData.length : null,
    };

    // Did the object we hold survive the call?
    const liveRs = window.chart && window.chart.replaySystem;
    const identity = {
      sameInstance: liveRs === rs,
      liveIsPlayStarting: liveRs ? !!liveRs.isPlayStarting : null,
      liveIsPlaying: liveRs ? !!liveRs.isPlaying : null,
    };

    await sleepIn(1_200);
    const settled = {
      heldIsPlaying: !!rs.isPlaying,
      heldRawLen: Array.isArray(rs.fullRawData) ? rs.fullRawData.length : null,
      liveIsPlaying: (window.chart && window.chart.replaySystem)
        ? !!window.chart.replaySystem.isPlaying : null,
      sameInstance: (window.chart && window.chart.replaySystem) === rs,
    };

    for (const [name, fn] of Object.entries(originals)) rs[name] = fn;
    if (typeof origToast === 'function') rs._maybeNotifyReplayToast = origToast;

    let state;
    if (!before.isActive) state = 'GUARD_1_NOT_ACTIVE';
    else if (before.windowBlocked) state = 'GUARD_2_WINDOW_BLOCKED';
    else {
      const noOp = calls.find((c) => c.guard === '_playWouldBeNoOpAtSessionEnd' && c.returned === true);
      const hidden = calls.find((c) => c.guard === '_isReplayPageHidden' && c.returned === true);
      if (after.windowBlockedAfter) state = 'GUARD_2_WINDOW_BLOCKED_AT_CALL';
      else if (noOp) state = 'GUARD_3_NOOP_AT_SESSION_END';
      else if (hidden) state = 'GUARD_4_PAGE_HIDDEN';
      else if (after.isPlayStarting || after.rafScheduled) state = 'GUARD_NONE';
      else state = 'GUARD_UNATTRIBUTED';
    }

    return {
      state, accepted, before, after, identity, settled, calls, toasts,
      playIsOwn, playSrc, receivers, protoWrapped,
    };
  }, step);
}

async function main() {
  const distIndex = path.resolve(__dirname, '../chart v 1.4/chart/dist-v9/index.html');
  const argOf = (name, dflt = null) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : dflt;
  };
  const out = path.resolve(argOf('out',
    path.join(__dirname, '..', 'docs/plan3/evidence', `shellplay-guard-attribution-${Date.now()}.json`)));

  const report = {
    signature: 'SHELLPLAY-GUARD-ATTRIBUTION-V1',
    at: new Date().toISOString(),
    provenance: captureProvenance(distIndex),
    steps: [],
  };
  const save = () => {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
  };
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
      log(`attributing the refusal at step=${step}s`);
      const r = await attribute(page, { step });
      report.steps.push({ step, ...r });
      save();
      console.log(`  STATE: ${r.state}`);
      if (r.before) {
        console.log(`  before:  isActive=${r.before.isActive} windowBlocked=${r.before.windowBlocked}`
          + ` subBar=${r.before.subBar} noOpSampledEarly=${r.before.noOpSampledEarly}`
          + ` idx=${r.before.idx}/${r.before.rawLen}`);
        console.log(`  guards:  ${JSON.stringify(r.calls)}`);
        console.log(`  after:   isPlayStarting=${r.after.isPlayStarting} raf=${r.after.rafScheduled}`
          + ` isPlaying=${r.after.isPlaying} isActiveAfter=${r.after.isActiveAfter} windowBlockedAfter=${r.after.windowBlockedAfter} idx=${r.after.idx}/${r.after.rawLen}`);
        console.log(`  identity: sameInstance=${r.identity.sameInstance}`
          + ` liveIsPlayStarting=${r.identity.liveIsPlayStarting} liveIsPlaying=${r.identity.liveIsPlaying}`);
        console.log(`  settled:  held=${r.settled.heldIsPlaying}/${r.settled.heldRawLen}`
          + ` live=${r.settled.liveIsPlaying} same=${r.settled.sameInstance}`);
        console.log(`  toasts:  ${JSON.stringify(r.toasts)}`);
        console.log(`  play is own-property: ${r.playIsOwn}  protoWrapped=${r.protoWrapped}`);
        console.log(`  RECEIVERS the class method ran on: ${JSON.stringify(r.receivers)}`);
      } else {
        console.log(`  ${r.why}`);
      }
      console.log('');
    }
  } finally {
    save();
    console.log(`artifact: ${out}`);
    await browser.close().catch(() => {});
    await harness.close?.().catch?.(() => {});
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
