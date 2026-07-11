/**
 * probe-1m-axis.mjs — TEMPORARY investigation probe (NOT a gate scenario).
 *
 * PO report (b92): same-pair 2x2 multichart, a PANEL (B) switched to 1m, replay
 * PLAY → the 1m panel's TIME (X) AXIS renders malformed (compressed / wrong
 * spacing / scrollbar-like / out-of-range) while host + other panels look fine.
 *
 * This probe reproduces the setup in the CLEAN harness and SAMPLES the 1m
 * panel's real time-axis state (offsetX, candleWidth/spacing, visible index
 * window, first/last visible bar ts, and the engine's own _timeTicks x/label
 * array) during and after PLAY. It asserts the axis is SANE and A/B toggles the
 * recent replay-follow kill-switches to attribute any malformation.
 *
 * Run: node probe-1m-axis.mjs
 */

import { startServer } from './serve.mjs';
import {
  launchBrowser,
  bootLayout,
  readHost,
  readPanel,
  setSync,
  setIntervalSync,
  panelCmd,
  broadcastCmd,
  hostReplayEnter,
  hostReplaySeek,
  fanOutTf,
  waitBootSettled,
  waitReplayQuiescent,
  panelFrameMap,
  embedFrames,
  sleep,
} from './harness-lib.mjs';

// ── axis snapshot: read the panel's real time-axis geometry ─────────────────
async function readAxis(page, id) {
  const frame = id === 'A' ? page : panelFrameMap(page)[id];
  if (!frame) return null;
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch) return null;
    const data = Array.isArray(ch.data) ? ch.data : [];
    const spacing = (typeof ch.getCandleSpacing === 'function')
      ? Number(ch.getCandleSpacing()) : NaN;
    const vsi = (typeof ch.getVisibleStartIndex === 'function') ? ch.getVisibleStartIndex() : null;
    const vei = (typeof ch.getVisibleEndIndex === 'function') ? ch.getVisibleEndIndex() : null;
    // Force a fresh tick build (full) so we read the actual axis geometry the
    // engine would paint, independent of the interaction-lite cache.
    let ticks = [];
    try {
      const built = (typeof ch._buildTimeTicks === 'function')
        ? ch._buildTimeTicks({ full: true })
        : (ch._timeTicks || []);
      ticks = (Array.isArray(built) ? built : []).map((t) => ({
        idx: Number(t.idx),
        x: Number(t.x),
        label: String(t.label == null ? '' : t.label),
      }));
    } catch (e) { ticks = [{ err: String(e) }]; }
    const rs = ch.replaySystem || null;
    return {
      tf: ch.currentTimeframe != null ? String(ch.currentTimeframe) : '',
      dataLen: data.length,
      offsetX: Number(ch.offsetX),
      candleWidth: Number(ch.candleWidth),
      candleGap: Number(ch.candleGap),
      spacing,
      w: Number(ch.w),
      marginL: ch.margin ? Number(ch.margin.l) : null,
      marginR: ch.margin ? Number(ch.margin.r) : null,
      visibleStartIndex: vsi,
      visibleEndIndex: vei,
      firstVisibleT: (Number.isFinite(vsi) && data[vsi]) ? Number(data[vsi].t) : null,
      lastVisibleT: (Number.isFinite(vei) && data[vei]) ? Number(data[vei].t) : null,
      firstBarT: data.length ? Number(data[0].t) : null,
      lastBarT: data.length ? Number(data[data.length - 1].t) : null,
      playheadIdx: data.length ? data.length - 1 : null,
      replayActive: !!(rs && rs.isActive),
      replayPlaying: !!(rs && rs.isPlaying),
      replayTs: rs && Number.isFinite(Number(rs.replayTimestamp)) ? Number(rs.replayTimestamp) : null,
      userHasPanned: !!(rs && rs.userHasPanned),
      ticks,
    };
  }).catch((e) => ({ err: String(e) }));
}

// ── axis sanity evaluation → list of problems (empty = sane) ────────────────
function evalAxisSanity(a) {
  const problems = [];
  if (!a || a.err) return [`no axis snapshot: ${a && a.err}`];
  if (!Number.isFinite(a.offsetX)) problems.push(`offsetX not finite (${a.offsetX})`);
  if (!Number.isFinite(a.candleWidth) || a.candleWidth <= 0) problems.push(`candleWidth bad (${a.candleWidth})`);
  if (!Number.isFinite(a.spacing) || a.spacing <= 0) problems.push(`spacing bad (${a.spacing})`);
  // offsetX must not be absurd: within one full data-width + plot of the origin.
  const plotW = Math.max(1, (a.w || 0) - (a.marginL || 0) - (a.marginR || 0));
  const maxReasonable = a.dataLen * a.spacing + plotW + 5 * a.spacing;
  if (Number.isFinite(a.offsetX) && Math.abs(a.offsetX) > maxReasonable) {
    problems.push(`offsetX absurd: |${a.offsetX}| > ${maxReasonable.toFixed(0)} (dataLen=${a.dataLen} spacing=${a.spacing})`);
  }
  // visible index window sane
  if (Number.isFinite(a.visibleStartIndex) && Number.isFinite(a.visibleEndIndex)) {
    if (a.visibleStartIndex > a.visibleEndIndex) problems.push(`visible start>end (${a.visibleStartIndex}>${a.visibleEndIndex})`);
    if (a.visibleStartIndex < 0) problems.push(`visibleStartIndex<0 (${a.visibleStartIndex})`);
    if (a.dataLen && a.visibleEndIndex > a.dataLen - 1) problems.push(`visibleEndIndex>last (${a.visibleEndIndex}>${a.dataLen - 1})`);
  }
  // first/last visible ts monotonic
  if (Number.isFinite(a.firstVisibleT) && Number.isFinite(a.lastVisibleT)
    && a.lastVisibleT < a.firstVisibleT) {
    problems.push(`visible ts not monotonic (first=${a.firstVisibleT} > last=${a.lastVisibleT})`);
  }
  // tick x monotonic increasing + roughly-uniform spacing
  const ticks = Array.isArray(a.ticks) ? a.ticks.filter((t) => t && Number.isFinite(t.x)) : [];
  if (ticks.length >= 2) {
    const dxs = [];
    for (let i = 1; i < ticks.length; i++) dxs.push(ticks[i].x - ticks[i - 1].x);
    const nonPos = dxs.filter((d) => d <= 0);
    if (nonPos.length) problems.push(`tick x NOT strictly increasing: ${nonPos.length}/${dxs.length} steps <=0 (dxs=${dxs.map((d) => d.toFixed(1)).join(',')})`);
    const pos = dxs.filter((d) => d > 0);
    if (pos.length >= 2) {
      const mn = Math.min(...pos), mx = Math.max(...pos);
      // Malformed = wildly uneven spacing (compressed). Uniform axis: max/min<=~2.
      if (mx / mn > 3.0) problems.push(`tick spacing uneven: min=${mn.toFixed(1)} max=${mx.toFixed(1)} ratio=${(mx / mn).toFixed(2)}`);
    }
    // idx spacing should match a positive constant labelInterval
    const idxs = ticks.map((t) => t.idx).filter((v) => Number.isFinite(v));
    for (let i = 1; i < idxs.length; i++) if (idxs[i] <= idxs[i - 1]) { problems.push(`tick idx not increasing (${idxs[i - 1]}->${idxs[i]})`); break; }
  } else {
    problems.push(`too few ticks to evaluate (${ticks.length})`);
  }
  return problems;
}

function fmtAxis(a) {
  if (!a) return 'null';
  if (a.err) return `err=${a.err}`;
  const t = (a.ticks || []).filter((x) => x && Number.isFinite(x.x));
  const tickXs = t.map((x) => x.x.toFixed(1)).join(',');
  return `tf=${a.tf} dataLen=${a.dataLen} offsetX=${a.offsetX?.toFixed(2)} cw=${a.candleWidth} sp=${a.spacing?.toFixed(3)} `
    + `w=${a.w} vis=[${a.visibleStartIndex},${a.visibleEndIndex}] playheadIdx=${a.playheadIdx} `
    + `replayTs=${a.replayTs} playing=${a.replayPlaying} panned=${a.userHasPanned} ticks(${t.length})=[${tickXs}]`;
}

async function setEngineFlagAll(page, flag, on) {
  const apply = (f, v) => { if (v) window[f] = true; else { try { delete window[f]; } catch (_) { window[f] = false; } } };
  await page.evaluate(apply, flag, !!on).catch(() => {});
  for (const fr of embedFrames(page)) await fr.evaluate(apply, flag, !!on).catch(() => {});
}

async function setHostReplayPlaying(page, playing) {
  return page.evaluate((p) => {
    const rs = window.chart && window.chart.replaySystem;
    if (!rs || !rs.isActive) return false;
    rs.isPlaying = !!p; return rs.isPlaying;
  }, !!playing).catch(() => false);
}

async function replayStartTs(page) {
  return page.evaluate(() => {
    const d = window.chart && window.chart.data;
    if (!Array.isArray(d) || d.length < 10) return null;
    return Number(d[Math.floor(d.length * 0.6)].t);
  }).catch(() => null);
}

/** Stream N host PLAY frames advancing playhead one host bar/frame. */
async function streamHostPlay(page, startTs, frames, stepMs, perFrameMs = 16) {
  await setHostReplayPlaying(page, true);
  let ts = startTs;
  for (let i = 0; i < frames; i++) {
    ts += stepMs;
    await hostReplaySeek(page, ts);
    await broadcastCmd(page, 'replayFrame', { timestamp: ts, isPlaying: true });
    await sleep(perFrameMs);
  }
  return ts;
}

let totalProblems = 0;
function report(label, a) {
  const problems = evalAxisSanity(a);
  const tag = problems.length ? 'MALFORMED' : 'sane';
  console.log(`\n[${tag}] ${label}`);
  console.log(`   ${fmtAxis(a)}`);
  if (problems.length) { totalProblems += problems.length; for (const p of problems) console.log(`     ! ${p}`); }
  return problems;
}

/**
 * One permutation. hostTf = host/all timeframe at boot fan-out; switchWhen =
 * 'before' | 'after' entering replay; playState = we always sample paused then
 * after play. flags = kill-switches to force ON for this run.
 */
async function runPermutation(ctx, opts) {
  const { hostTf, switchWhen, flags = [], label } = opts;
  const boot = await bootLayout(ctx.browser, ctx.srv, { pair: 'same', panels: 4, tf: '1m' });
  const { page } = boot;
  const ids = ['A', 'B', 'C', 'D'];
  const out = [];
  try {
    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(400);
    await setSync(page, false);
    await setIntervalSync(page, false);
    for (const f of flags) await setEngineFlagAll(page, f, true);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    // Establish host TF (coarser than the 1m panel, or 1m). fanOutTf sets host +
    // broadcasts to peers; we then override panel B back to 1m as the PO did.
    if (hostTf && hostTf !== '1m') {
      await fanOutTf(page, hostTf);
      await sleep(2000);
    }

    const doSwitchB = async () => { await panelCmd(page, 'B', 'setTimeframe', { tf: '1m' }).catch(() => {}); await sleep(2000); };

    if (switchWhen === 'before') await doSwitchB();

    const ts0 = await replayStartTs(page);
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    await waitReplayQuiescent(page, ids, ts0, 15_000).catch(() => {});

    if (switchWhen === 'after') await doSwitchB();

    const bTf = (await readPanel(page, 'B'))?.tf;
    const hTf = (await readHost(page))?.tf;
    console.log(`\n==== ${label} | hostTf=${hTf} panelB.tf=${bTf} switch=${switchWhen} flags=[${flags.join(',') || 'none'}] ====`);

    // Sample PAUSED (post-enter, pre-play).
    out.push(report(`${label} — B 1m PAUSED (pre-play)`, await readAxis(page, 'B')));

    // PLAY: stream host frames. host stepMs = its own bar duration.
    const stepMs = hostTf === '1h' ? 3_600_000 : hostTf === '4h' ? 14_400_000 : 60_000;
    // Bound frames inside loaded master.
    const hostMaster = await readHost(page);
    let frames = 120;
    if (hostMaster && Number.isFinite(hostMaster.replayMasterLastT)) {
      const fwd = Math.floor((hostMaster.replayMasterLastT - ts0) / stepMs) - 2;
      if (Number.isFinite(fwd) && fwd < frames) frames = Math.max(20, fwd);
    }
    const lastTs = await streamHostPlay(page, ts0, frames, stepMs);
    await sleep(400);

    // Sample DURING/AFTER play (playing flag still notionally on).
    out.push(report(`${label} — B 1m AFTER PLAY (${frames} frames)`, await readAxis(page, 'B')));

    // Also sample host A for reference.
    const hostAxis = await readAxis(page, 'A');
    console.log(`   [ref] host A: ${fmtAxis(hostAxis)}`);

    // Stop play, sample settled.
    await setHostReplayPlaying(page, false);
    await broadcastCmd(page, 'replayTick', { timestamp: lastTs });
    await sleep(500);
    out.push(report(`${label} — B 1m AFTER STOP`, await readAxis(page, 'B')));
  } finally {
    await boot.close();
  }
  return out;
}

async function main() {
  const srv = await startServer(0);
  console.log(`[probe] stub server: ${srv.url}`);
  const browser = await launchBrowser({ headful: false });
  const ctx = { browser, srv };
  try {
    // Permutation matrix.
    const perms = [
      { label: 'P1 host1m/B1m switch-before',  hostTf: '1m', switchWhen: 'before', flags: [] },
      { label: 'P2 host1m/B1m switch-after',   hostTf: '1m', switchWhen: 'after',  flags: [] },
      { label: 'P3 host1h/B1m switch-before',  hostTf: '1h', switchWhen: 'before', flags: [] },
      { label: 'P4 host1h/B1m switch-after',   hostTf: '1h', switchWhen: 'after',  flags: [] },
      { label: 'P5 host4h/B1m switch-after',   hostTf: '4h', switchWhen: 'after',  flags: [] },
      // Attribution A/B on the prime suspect (cost guard / eased offset).
      { label: 'P6 host1h/B1m COSTGUARD-OFF',  hostTf: '1h', switchWhen: 'after',  flags: ['__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD'] },
      { label: 'P7 host1h/B1m FOLLOW-OFF',     hostTf: '1h', switchWhen: 'after',  flags: ['__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW'] },
      { label: 'P8 host1m/B1m COSTGUARD-OFF',  hostTf: '1m', switchWhen: 'after',  flags: ['__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD'] },
    ];
    for (const p of perms) {
      try { await runPermutation(ctx, p); }
      catch (e) { console.log(`[probe] ${p.label} THREW: ${(e && e.stack) || e}`); }
    }
  } finally {
    await browser.close();
    await srv.close();
  }
  console.log(`\n[probe] DONE. total axis problems across permutations: ${totalProblems}`);
  process.exit(0);
}

main().catch((e) => { console.error('[probe] FATAL', e); process.exit(1); });
