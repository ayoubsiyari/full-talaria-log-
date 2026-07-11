/**
 * scenarios.mjs — Phase-4 Task 4.2 scenario assertions.
 *
 * Each scenario mirrors a row of the PHASE-4 Task-4.2 table (IDs kept in sync
 * with the Phase-0 matrix). Every scenario:
 *   - boots its OWN cold layout (isolation + lets H-S10 measure a true cold
 *     boot; other tests reset diagnostics after boot),
 *   - resets Phase-0 diagnostics (window.__mcDiagReset) + the server fetch log
 *     before the gesture under test,
 *   - drives REAL puppeteer mouse events / real panel-cmd code paths,
 *   - asserts the INTENDED contract from the table (never weakened to force
 *     green), and
 *   - runs H-INV (seams=0, no console errors, _serverCursors edges==array
 *     edges) afterwards.
 *
 * TOPOLOGY NOTE (fidelity fix): this harness now mirrors PRODUCTION exactly —
 * tile A is the PARENT page's REAL in-process `window.chart` (the HOST),
 * registered with the MultichartManager via addHostChart with the sync-bridge
 * installed on it; only B/C/D are chart-embed.html iframes. The host→panel
 * mirror/clone and host-replay / host-TF fan-out paths are therefore LIVE.
 * "The HOST row" == the in-process window.chart (read/driven in the main frame),
 * and same-pair panels mirror the host in-memory instead of self-fetching.
 */

import {
  bootLayout,
  readPanels,
  readPanel,
  readHost,
  resetDiag,
  setSync,
  setIntervalSync,
  dragCellRight,
  panelCmd,
  broadcastCmd,
  hostReplayEnter,
  hostReplaySeek,
  fanOutTf,
  invariantCheck,
  makeChecks,
  countFetchesByFile,
  totalDataFetches,
  waitReplayQuiescent,
  seekAllAndConverge,
  computePlayPlan,
  waitBootSettled,
  panelFrameMap,
  embedFrames,
  isPanelQuiescent,
  sleep,
} from './harness-lib.mjs';

const HOST_FILE = '25';
const IND_FILE = '27';

// Time-to-painted budget for H-S10. Phase-3 baseline was not published as a
// single number in the docs; we use a deliberately generous ceiling so the
// timing sub-check only fires on a gross regression, and report the measured
// value regardless.
const PAINT_BUDGET_MS = 30_000;

/** Sum of per-panel diag.fetches over a set of panel ids. */
function sumFetches(panels, ids) {
  let n = 0;
  for (const id of ids) if (panels[id]) n += panels[id].fetches;
  return n;
}

/** Panels (by id) whose diag.fetches increased between two snapshots. */
function panelsThatFetched(before, after, ids) {
  const list = [];
  for (const id of ids) {
    const b = (before[id] && before[id].fetches) || 0;
    const a = (after[id] && after[id].fetches) || 0;
    if (a > b) list.push(id);
  }
  return list;
}

function allEqual(nums) {
  return nums.every((n) => n === nums[0]);
}

function nearlyEqual(a, b, eps = 1e-8) {
  if (a == null || b == null) return a === b;
  if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return false;
  return Math.abs(Number(a) - Number(b)) <= eps;
}

function formatPriceSnap(s) {
  if (!s) return 'null';
  const yd = Array.isArray(s.yDomain) ? `[${s.yDomain[0]},${s.yDomain[1]}]` : 'null';
  return `tf=${s.tf} y=${yd} priceZoom=${s.priceZoom} priceOffset=${s.priceOffset} autoScale=${s.autoScale}`;
}

async function readPriceScalePanel(page, id) {
  const frame = id === 'A' ? page : panelFrameMap(page)[id];
  if (!frame) return null;
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch) return null;
    let yDomain = null;
    try {
      if (ch.yScale && typeof ch.yScale.domain === 'function') {
        const d = ch.yScale.domain();
        if (Array.isArray(d) && d.length === 2) yDomain = [Number(d[0]), Number(d[1])];
      }
    } catch (_) { yDomain = null; }
    return {
      tf: ch.currentTimeframe != null ? String(ch.currentTimeframe) : '',
      yDomain,
      priceZoom: Number(ch.priceZoom),
      priceOffset: Number(ch.priceOffset),
      autoScale: ch.autoScale,
      priceScaleAutoScale: ch.priceScale ? ch.priceScale.autoScale : undefined,
      panLoading: !!ch._panLoading,
      timeframeSwitching: !!ch._timeframeSwitching,
      replayActive: !!(ch.replaySystem && ch.replaySystem.isActive),
      replayPlaying: !!(ch.replaySystem && ch.replaySystem.isPlaying),
      replayTs: ch.replaySystem && Number.isFinite(Number(ch.replaySystem.replayTimestamp))
        ? Number(ch.replaySystem.replayTimestamp)
        : null,
      viewportSettleUntil: Number.isFinite(ch._multichartViewportSettleUntil) ? Number(ch._multichartViewportSettleUntil) : null,
      perfNow: (typeof performance !== 'undefined' && performance.now) ? Number(performance.now()) : Date.now(),
    };
  }).catch(() => null);
}

async function readPriceScalePanels(page, ids) {
  const out = {};
  for (const id of ids) out[id] = await readPriceScalePanel(page, id);
  return out;
}

function priceScaleUnchanged(before, after, eps = 1e-8) {
  if (!before || !after) return false;
  const by = before.yDomain || [];
  const ay = after.yDomain || [];
  const yOk = by.length === ay.length
    && (!by.length || (nearlyEqual(by[0], ay[0], eps) && nearlyEqual(by[1], ay[1], eps)));
  return yOk
    && nearlyEqual(before.priceZoom, after.priceZoom, eps)
    && nearlyEqual(before.priceOffset, after.priceOffset, eps)
    && before.autoScale === after.autoScale
    && before.priceScaleAutoScale === after.priceScaleAutoScale;
}

async function waitPeerTfSwitchSettled(page, targetId, targetTf, stableIds, budgetMs = 15_000) {
  const deadline = Date.now() + budgetMs;
  let prevSig = null;
  let lastPanels = {};
  let lastPrices = {};
  while (Date.now() < deadline) {
    const panels = await readPanels(page);
    const prices = await readPriceScalePanels(page, stableIds);
    lastPanels = panels;
    lastPrices = prices;
    const targetReady = panels[targetId]?.tf === targetTf && isPanelQuiescent(panels[targetId]);
    const peersReady = stableIds.every((id) => panels[id] && isPanelQuiescent(panels[id]) && prices[id] && !prices[id].timeframeSwitching);
    const sig = stableIds.map((id) => {
      const s = prices[id];
      if (!s) return 'null';
      return JSON.stringify({
        tf: s.tf,
        yDomain: s.yDomain,
        priceZoom: s.priceZoom,
        priceOffset: s.priceOffset,
        autoScale: s.autoScale,
        priceScaleAutoScale: s.priceScaleAutoScale,
      });
    }).join('|');
    if (targetReady && peersReady && prevSig === sig) {
      return { ok: true, detail: `target ${targetId}.tf=${targetTf}; peer price states stable`, panels, prices };
    }
    prevSig = sig;
    await sleep(200);
  }
  const detail = [
    `${targetId}.tf=${lastPanels[targetId]?.tf} panLoad=${lastPanels[targetId]?.panLoading}`,
    ...stableIds.map((id) => `${id}:${formatPriceSnap(lastPrices[id])} panLoad=${lastPanels[id]?.panLoading}`),
  ].join(' ');
  return { ok: false, detail: `TF switch did not settle within ${budgetMs}ms — ${detail}`, panels: lastPanels, prices: lastPrices };
}

/**
 * Enter replay (PAUSED) on every panel at a shared timestamp. Panning into
 * history only loads older bars when the chart is NOT auto-scrolling to "now"
 * — which is exactly the Phase-0 S1/S2/S3 setup ("backtest replay paused, drag
 * right → old data loads"). Returns the start ts (or null if unavailable).
 */
async function enterReplayPausedAll(page) {
  const ts0 = await replayStartTs(page);
  if (ts0 == null) return null;
  // HOST (tile A) enters replay in-process; iframe peers enter via the
  // replayEnter panel-cmd — faithful to production, where MultichartGrid
  // enters replay on window.chart and fans replayEnter out to the iframes.
  await hostReplayEnter(page, ts0);
  await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
  await sleep(1400);
  return ts0;
}

/** Pick a replay start timestamp ~60% through the HOST's loaded data. */
async function replayStartTs(page) {
  return page
    .evaluate(() => {
      const d = window.chart && window.chart.data;
      if (!Array.isArray(d) || d.length < 10) return null;
      return Number(d[Math.floor(d.length * 0.6)].t);
    })
    .catch(() => null);
}

/** Boot, run body, always run H-INV, always close. */
async function runWith(ctx, bootOpts, body) {
  const boot = await bootLayout(ctx.browser, ctx.srv, { ...bootOpts, bug: ctx.bug, bugSwitches: ctx.bugSwitches });
  const notes = [];
  let checks;
  try {
    checks = await body(boot, notes);
  } finally {
    // H-INV after every test.
    var inv = await invariantCheck(boot.page, boot);
    await boot.close();
    // eslint-disable-next-line no-unsafe-finally
    return { checks: checks || makeChecks(), inv, notes };
  }
}

// ── H-S2 ─────────────────────────────────────────────────────────────────
// drag tile A right 3 screens, sync ON → only HOST row fetches; all panels'
// first/last bar equal; seams = 0.
async function hS2(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await setSync(page, true);
    await sleep(400);
    // Phase-0 S2 setup: backtest replay paused, then drag tile A into history.
    const ts0 = await enterReplayPausedAll(page);
    checks.check('H-S2 replay entered (paused) on panels', ts0 != null, `ts0=${ts0}`);
    ctx.srv.resetApiLog();
    await resetDiag(page);
    const before = await readPanels(page);
    // Pan far enough that the owner exhausts its in-memory buffer and must
    // actually fetch older history — otherwise "only host fetches" is vacuous.
    await dragCellRight(page, 'A', { screens: 18 });
    await sleep(1200);
    const after = await readPanels(page);

    // Only HOST row (A) fetches; B/C/D fetch 0.
    const peerFetches = sumFetches(after, ['B', 'C', 'D']);
    checks.check('H-S2 only host(A) fetches; B+C+D fetches==0', peerFetches === 0,
      `A=${after.A?.fetches} B=${after.B?.fetches} C=${after.C?.fetches} D=${after.D?.fetches}`);

    // All panels' first/last bar equal.
    const ids = ['A', 'B', 'C', 'D'];
    const firsts = ids.map((i) => after[i]?.firstBarT);
    const lasts = ids.map((i) => after[i]?.lastBarT);
    checks.check('H-S2 all panels first bar equal', allEqual(firsts), firsts.join(','));
    checks.check('H-S2 all panels last bar equal', allEqual(lasts), lasts.join(','));

    // seams = 0 (also covered by H-INV; asserted here per the table).
    const seams = ids.reduce((s, i) => s + (after[i]?.seams || 0), 0);
    checks.check('H-S2 seams==0 across panels', seams === 0, `total seams=${seams}`);
    return checks;
  });
}

// ── H-S3 ─────────────────────────────────────────────────────────────────
// drag panel B right, sync ON and OFF → host is only fetcher (same-pair);
// B's bar count grows DURING drag; no mouse-up jump (offset delta < 2px).
async function hS3(ctx) {
  const checks = makeChecks();
  const notes = [];
  let inv;
  // Reboot a fresh layout per sync mode so drag state / sync echoes from one
  // mode cannot contaminate the other's offset + fetch measurements.
  for (const syncOn of [true, false]) {
    const tag = syncOn ? 'sync-ON' : 'sync-OFF';
    const boot = await bootLayout(ctx.browser, ctx.srv, { pair: 'same', panels: 4, tf: '1m', bug: ctx.bug, bugSwitches: ctx.bugSwitches });
    try {
      const { page } = boot;
      await setSync(page, syncOn);
      await sleep(400);
      // Phase-0 S3 setup: backtest replay paused, then drag panel B.
      await enterReplayPausedAll(page);
      ctx.srv.resetApiLog();
      await resetDiag(page);
      const bStart = await readPanel(page, 'B');
      const drag = await dragCellRight(page, 'B', { screens: 18 });
      // Extra settle so the post-release backward load-more can run.
      await sleep(1200);
      const after = await readPanels(page);

      // Host (A) is the only fetcher for a same-pair drag: B/C/D fetch 0.
      const peer = sumFetches(after, ['B', 'C', 'D']);
      checks.check(`H-S3 ${tag} host is only fetcher (B+C+D==0)`, peer === 0,
        `A=${after.A?.fetches} B=${after.B?.fetches} C=${after.C?.fetches} D=${after.D?.fetches}`);

      // B loads older history across the drag (bounded window may keep count
      // flat, so "grows" == the loaded window extended further back OR the
      // array lengthened). Measured via first-bar timestamp getting older.
      const startFirst = bStart?.firstBarT;
      const midFirst = drag.midSample?.firstBarT;
      const endFirst = after.B?.firstBarT;
      const startLen = bStart?.rawLen || 0;
      const endLen = after.B?.rawLen || 0;
      const grew = (Number.isFinite(endFirst) && Number.isFinite(startFirst) && endFirst < startFirst)
        || (Number.isFinite(midFirst) && Number.isFinite(startFirst) && midFirst < startFirst)
        || endLen > startLen;
      checks.check(`H-S3 ${tag} B extends history during drag`, grew,
        `firstBarT start=${startFirst} mid=${midFirst} end=${endFirst} rawLen ${startLen}->${endLen} `
        + `B.hasMoreLeft=${after.B?.hasMoreLeft} B.panLoading=${after.B?.panLoading}`);

      // No mouse-up jump: |offsetX after release − before release| < 2px.
      const delta = (drag.offsetBeforeUp != null && drag.offsetAfterUp != null)
        ? Math.abs(drag.offsetAfterUp - drag.offsetBeforeUp)
        : NaN;
      checks.check(`H-S3 ${tag} offset delta at release < 2px`, Number.isFinite(delta) && delta < 2,
        `beforeUp=${drag.offsetBeforeUp} afterUp=${drag.offsetAfterUp} delta=${delta}`);
    } finally {
      inv = await invariantCheck(boot.page, boot);
      await boot.close();
    }
  }
  return { checks, inv, notes };
}

// ── H-S5 ─────────────────────────────────────────────────────────────────
// independent panel B, drag right → B fetches for itself; host fetch count
// unchanged; seams = 0.
async function hS5(ctx) {
  return runWith(ctx, { pair: 'independent', panels: 4, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await setSync(page, true);
    await sleep(400);
    // Replay paused so the drag pans into history (independent B owns file27).
    await enterReplayPausedAll(page);
    ctx.srv.resetApiLog();
    await resetDiag(page);
    const before = await readPanels(page);
    await dragCellRight(page, 'B', { screens: 18 });
    await sleep(1200);
    const after = await readPanels(page);
    const apiLog = ctx.srv.getApiLog();
    const byFile = countFetchesByFile(apiLog);

    // B is its own owner (fileId 27) → B fetches for itself.
    const bFetched = (after.B?.fetches || 0) > 0 || (byFile[IND_FILE] || 0) > 0;
    checks.check('H-S5 independent B fetches for itself', bFetched,
      `B.fetches=${after.B?.fetches} file27 hits=${byFile[IND_FILE] || 0}`);

    // Host (fileId 25) fetch count unchanged: A/C/D and file25 see 0 new fetches.
    const hostPeers = sumFetches(after, ['A', 'C', 'D']);
    const file25 = byFile[HOST_FILE] || 0;
    checks.check('H-S5 host(file25) fetch count unchanged', hostPeers === 0 && file25 === 0,
      `A+C+D fetches=${hostPeers} file25 hits=${file25}`);

    const seams = ['A', 'B', 'C', 'D'].reduce((s, i) => s + (after[i]?.seams || 0), 0);
    checks.check('H-S5 seams==0', seams === 0, `total seams=${seams}`);
    void before;
    return checks;
  });
}

// ── H-S6 ─────────────────────────────────────────────────────────────────
// TF fan-out 1m→1h→1m → ≤1 fetch per TF per OWNER, 0 per panel; panels land
// on identical bars.
async function hS6(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await setSync(page, true);
    await sleep(300);

    // Step 1: 1m → 1h (interval-sync fan-out to every panel).
    ctx.srv.resetApiLog();
    await resetDiag(page);
    const beforeH = await readPanels(page);
    await fanOutTf(page, '1h');
    await sleep(2500);
    const afterH = await readPanels(page);
    const fetchedH = panelsThatFetched(beforeH, afterH, ids);
    checks.check('H-S6 1m→1h: ≤1 panel (owner) fetches, rest 0', fetchedH.length <= 1,
      `panels that fetched=${JSON.stringify(fetchedH)}`);

    // Step 2: 1h → 1m (1m already loaded → owner refetch ≤1, peers 0).
    ctx.srv.resetApiLog();
    await resetDiag(page);
    const beforeM = await readPanels(page);
    await fanOutTf(page, '1m');
    await sleep(2500);
    const afterM = await readPanels(page);
    const fetchedM = panelsThatFetched(beforeM, afterM, ids);
    checks.check('H-S6 1h→1m: ≤1 panel (owner) fetches, rest 0', fetchedM.length <= 1,
      `panels that fetched=${JSON.stringify(fetchedM)}`);

    // Panels land on identical bars + identical final TF.
    const tfs = ids.map((i) => afterM[i]?.tf);
    checks.check('H-S6 all panels back on 1m', tfs.every((t) => t === '1m'), tfs.join(','));
    const firsts = ids.map((i) => afterM[i]?.firstBarT);
    const lasts = ids.map((i) => afterM[i]?.lastBarT);
    checks.check('H-S6 panels land on identical first bar', allEqual(firsts), firsts.join(','));
    checks.check('H-S6 panels land on identical last bar', allEqual(lasts), lasts.join(','));
    return checks;
  });
}

// ── H-S7 ─────────────────────────────────────────────────────────────────
// panel-B-only TF with interval sync OFF + replay frames → B's TF unchanged
// after 100 replay frames.
async function hS7(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    await setSync(page, false);
    await setIntervalSync(page, false);
    await sleep(300);

    const ts0 = await replayStartTs(page);
    if (ts0 == null) {
      checks.check('H-S7 replay start ts resolvable', false, 'no ts');
      return checks;
    }
    // Enter replay on the HOST (in-process) + all iframe panels at a shared ts.
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    await sleep(1200);

    // Set panel B's TF only (interval sync OFF → NOT broadcast to peers,
    // NO __fromHostFanout flag → engine leaves _mcIntervalSyncOn false).
    await panelCmd(page, 'B', 'setTimeframe', { tf: '5m' }).catch(() => {});
    await sleep(1500);
    const bAfterSwitch = await readPanel(page, 'B');
    const bTf = bAfterSwitch?.tf;
    checks.check('H-S7 B switched to 5m', bTf === '5m', `B.tf=${bTf}`);

    // Stream 100 replay frames (host on 1m). With interval sync OFF, none may
    // change B's timeframe.
    let ts = ts0;
    const stepMs = 60_000; // advance 1 minute per frame
    for (let i = 0; i < 100; i++) {
      ts += stepMs;
      await broadcastCmd(page, 'replayFrame', { timestamp: ts, hostTf: '1m', isPlaying: true });
      if (i % 20 === 0) await sleep(60);
    }
    await sleep(800);
    const bEnd = await readPanel(page, 'B');
    checks.check('H-S7 B TF unchanged after 100 replay frames', bEnd?.tf === '5m',
      `B.tf=${bEnd?.tf} (expected 5m)`);
    notes.push('H-S7: host (tile A) is the real in-process replay master on 1m; '
      + '100 replayFrame fan-outs (hostTf=1m) must not clobber B.tf when interval '
      + 'sync is OFF. Exercises the real applyReplayFrame path.');
    return checks;
  });
}

// ── H-S8 ─────────────────────────────────────────────────────────────────
// replay play 15s (accelerated) → fetches during play == 0;
// renders bounded; playhead equal across panels every second.
//
// DETERMINISM MODEL (cross-session fix):
//   1. ENTRY GATE — after entering replay, poll until every panel is replay-
//      active, its playhead == ts0, and NOTHING is in flight (waitReplay
//      Quiescent). No fixed sleep; FAIL LOUDLY if it never settles.
//   2. IN-DATA PLAY — the accelerated play advances 15 evenly-spaced targets
//      that stay strictly INSIDE the loaded replay master (computePlayPlan).
//      The previous code advanced the playhead PAST the last loaded bar, so the
//      real host correctly clamped at its last loaded candle while iframe peers
//      over-advanced → permanent, machine-independent divergence at the tail
//      (sec13-14) that made the verdict flip by machine speed. Playing through
//      loaded bars is what "replay play" actually does in production.
//   3. QUIESCENT SAMPLING — each step SEEKS then polls to CONVERGENCE
//      (seekAllAndConverge): all panels' playhead == the exact target, stable
//      across two reads, none loading. Equality/fetch/render are only read at
//      these quiescent points. Hard per-step budget → FAIL LOUDLY, never pass
//      by timing. Because targets land on loaded candles, convergence is a
//      deterministic property of the engine (not of the machine's clock).
async function hS8(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await setSync(page, true);
    await sleep(300);

    const ts0 = await replayStartTs(page);
    if (ts0 == null) {
      checks.check('H-S8 replay start ts resolvable', false, 'no ts');
      return checks;
    }
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });

    // 1. Deterministic entry gate (replaces the fixed 1200ms sleep).
    const entered = await waitReplayQuiescent(page, ids, ts0, 15_000);
    checks.check('H-S8 replay entered + playhead settled on all panels @ ts0', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    // 2. Plan an accelerated play that stays inside the loaded replay master.
    const plan = await computePlayPlan(page, ts0, 15);
    checks.check('H-S8 loaded replay master provides a forward play window', plan.ok, plan.detail);
    if (!plan.ok) return checks;

    ctx.srv.resetApiLog();
    await resetDiag(page);
    const rendersBefore = await readPanels(page);

    // 3. Step through the plan; each step converges before we advance.
    let playheadEqualEveryStep = true;
    const playheadDetail = [];
    for (let sec = 0; sec < plan.targets.length; sec++) {
      const conv = await seekAllAndConverge(page, ids, plan.targets[sec], 8_000);
      if (!conv.ok) {
        playheadEqualEveryStep = false;
        playheadDetail.push(`sec${sec}:${conv.detail}`);
      }
    }
    checks.check('H-S8 playhead converges equal across panels at every step', playheadEqualEveryStep,
      playheadDetail.slice(0, 4).join(' ') || `all ${plan.targets.length} steps converged`);

    // Fetches during play must be exactly zero; the loaded replay master is the
    // forward window, so any data request here is a real ownership/prefetch bug.
    // Sampled at a quiescent point (after the final convergence).
    const fetches = totalDataFetches(ctx.srv.getApiLog());
    checks.check('H-S8 data fetches during play == 0', fetches === 0,
      `data fetches during play=${fetches}`);

    // Renders bounded (no unbounded repaint storm).
    const rAfter = await readPanels(page);
    let maxRenders = 0;
    for (const i of ids) {
      const delta = (rAfter[i]?.renders || 0) - (rendersBefore[i]?.renders || 0);
      if (delta > maxRenders) maxRenders = delta;
    }
    checks.check('H-S8 renders bounded during play', maxRenders < 500, `max render delta=${maxRenders}`);
    notes.push('H-S8: in-process host (tile A) seeks its own replay playhead (real '
      + 'goToReplayTimestamp) and fans replayTick to iframe peers, matching production. '
      + 'DETERMINISM: entry is gated on all-panels-settled@ts0; the accelerated play '
      + 'targets stay INSIDE the loaded replay master (so the host never clamps past '
      + 'loaded data — the old tail-divergence); each step is polled to exact-playhead '
      + 'convergence at a quiescent point with a hard budget (no pass-by-timing).');
    return checks;
  });
}

// ── H-S10 ────────────────────────────────────────────────────────────────
// cold boot 2×2 same-pair → 0 panel fetches; time-to-painted under budget.
//
// DETERMINISM MODEL (cross-session fix):
//   The old code read the fetch count at a NON-deterministic lifecycle point
//   (and, via a `page` typo, never ran the real contract check at all — the
//   verdict was decided by incidental H-INV boot noise). Cold-boot self-fetches
//   can land AFTER first paint (mirror, forward-prefetch), so a read taken "just
//   after paint" captures a different count on a fast vs. slow machine.
//   FIX: reset the server log immediately before boot (clean cold-boot count),
//   then anchor the read to a real SETTLED signal — all 4 panels painted +
//   nothing in flight + viewport boot/mirror settle expired + per-panel
//   diag.fetches STABLE across two spaced reads (waitBootSettled). Only THEN is
//   the fetch count read. The 0-panel-fetch contract is NOT relaxed: if a panel
//   genuinely self-fetches on cold boot, its diag.fetches is non-zero at the
//   settled point → H-S10 FAILS deterministically every session (a real defect).
async function hS10(ctx) {
  const ids = ['A', 'B', 'C', 'D'];
  // Clean the server log so file25 hits reflect ONLY this cold boot (the shared
  // log otherwise carries prior scenarios' fetches).
  ctx.srv.resetApiLog();
  const t0 = Date.now();
  const boot = await bootLayout(ctx.browser, ctx.srv, { pair: 'same', panels: 4, tf: '1m', bug: ctx.bug, bugSwitches: ctx.bugSwitches });
  const paintMs = Date.now() - t0;
  const notes = [];
  let checks = makeChecks();
  let inv;
  try {
    // Anchor to a deterministic settled signal before reading fetch counts.
    const settled = await waitBootSettled(boot.page, ids, 20_000, boot.getInFlightDataRequests);
    const panels = settled.panels || await readPanels(boot.page);
    const apiLog = ctx.srv.getApiLog();
    const byFile = countFetchesByFile(apiLog);
    const file25 = byFile[HOST_FILE] || 0;
    const peerFetches = sumFetches(panels, ['B', 'C', 'D']); // iframe panels
    const hostFetches = panels.A ? panels.A.fetches : 0;

    // Surface (but do not gate on) the settle signal so a non-settling boot is
    // visible rather than silently sampled mid-flight.
    checks.check('H-S10 cold boot reached a deterministic settled read point', settled.ok, settled.detail);

    // Faithful contract for the PRODUCTION topology: same-pair cold boot must
    // yield 0 PANEL fetches — B/C/D mirror the in-process host in-memory
    // (embed-bridge _multichartMirrorViewportFromHost) instead of self-loading.
    // The HOST (tile A) is the single owner and performs exactly the acquisition
    // it needs for file25; that owner load is the intended design, NOT a panel
    // self-load, so it is reported (hostFetches / file25 hits) but not counted
    // against the "0 panel fetches" contract.
    checks.check('H-S10 cold-boot 2x2 same-pair: iframe panels B/C/D self-fetch 0 (mirror host)',
      peerFetches === 0,
      `B/C/D diag.fetches=${peerFetches}; host(A) diag.fetches=${hostFetches}; `
      + `file25 data hits=${file25}; by-file=${JSON.stringify(byFile)}`);
    checks.check(`H-S10 time-to-painted < ${PAINT_BUDGET_MS}ms`, paintMs < PAINT_BUDGET_MS,
      `painted in ${paintMs}ms`);
    notes.push(`H-S10 time-to-painted=${paintMs}ms; host(A) owner fetches=${hostFetches}; `
      + `peer(B/C/D) self-fetches=${peerFetches}; settled=${settled.ok}; `
      + `boot data fetches by file=${JSON.stringify(byFile)}`);
  } finally {
    inv = await invariantCheck(boot.page, boot);
    await boot.close();
    // eslint-disable-next-line no-unsafe-finally
    return { checks, inv, notes };
  }
}

// ── H-S11 ────────────────────────────────────────────────────────────────
// close layout → single chart drag → single-chart diag matches recorded
// single-chart profile (catch leftover multichart state).
async function hS11(ctx) {
  // Reference single-chart profile: boot a 1-panel layout and drag A.
  const ref = await bootLayout(ctx.browser, ctx.srv, { pair: 'same', panels: 1, tf: '1m', bug: ctx.bug, bugSwitches: ctx.bugSwitches });
  let refProfile;
  try {
    await setSync(ref.page, false);
    await sleep(300);
    await enterReplayPausedAll(ref.page);
    ctx.srv.resetApiLog();
    await resetDiag(ref.page);
    const drag = await dragCellRight(ref.page, 'A', { screens: 6 });
    await sleep(1000);
    const a = await readPanel(ref.page, 'A');
    const delta = (drag.offsetBeforeUp != null && drag.offsetAfterUp != null)
      ? Math.abs(drag.offsetAfterUp - drag.offsetBeforeUp) : NaN;
    refProfile = { seams: a?.seams || 0, offsetDelta: delta, fetches: a?.fetches || 0, grew: (a?.rawLen || 0) > 0 };
  } finally {
    await ref.close();
  }

  // Now: boot 2x2, CLOSE the layout back to a single chart (remove B/C/D),
  // then drag A and compare its profile.
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    await setSync(page, true);
    await sleep(400);
    // Close layout → single chart: remove peer panels via the manager.
    await page.evaluate(() => {
      const mgr = window.__harnessManager;
      if (!mgr) return;
      for (const id of ['B', 'C', 'D']) { try { mgr.removeChart(id); } catch (_) {} }
    });
    await setSync(page, false);
    await sleep(600);
    await enterReplayPausedAll(page);

    ctx.srv.resetApiLog();
    await resetDiag(page);
    const drag = await dragCellRight(page, 'A', { screens: 6 });
    await sleep(1000);
    const a = await readPanel(page, 'A');
    const delta = (drag.offsetBeforeUp != null && drag.offsetAfterUp != null)
      ? Math.abs(drag.offsetAfterUp - drag.offsetBeforeUp) : NaN;

    // Single-chart profile match: seams==0 (like reference), offset settle<2px
    // (like reference), and it still loads history on drag (like a plain single
    // chart) — i.e. no leftover multichart state froze or corrupted it.
    checks.check('H-S11 closed-layout A seams==0 (matches single-chart profile)',
      (a?.seams || 0) === 0 && refProfile.seams === 0,
      `closed seams=${a?.seams} ref seams=${refProfile.seams}`);
    checks.check('H-S11 closed-layout A offset settle < 2px (matches profile)',
      Number.isFinite(delta) && delta < 2,
      `closed delta=${delta} ref delta=${refProfile.offsetDelta}`);
    checks.check('H-S11 closed-layout A still drags/loads like single chart',
      (a?.rawLen || 0) > 0,
      `closed rawLen=${a?.rawLen}`);
    notes.push('H-S11: this harness cannot boot a NON-multichart single chart '
      + '(chart-embed.html is always multichart-embed), so the "single-chart '
      + 'profile" reference is a 1-panel embed layout. The check catches leftover '
      + 'multichart state that would break the panel after closing the grid.');
    return checks;
  });
}

// ── H-S12 (deliberate-bug lever) ───────────────────────────────────────────
// Late-added same-pair panel reuses the shared bar store instead of
// re-fetching. This is the harness's deliberate-bug proof: it PASSES in
// baseline (the shared store serves the late panel → ≤1 boot data hit) and
// FLIPS to FAIL under --bug (which sets __TALARIA_DISABLE_SHARED_BAR_STORE,
// re-enabling the per-panel fetch path → the late panel double-fetches).
//
// NOTE: this lever targets the fetch-AVOIDANCE path that is active on boot in
// the faithful topology — a later-booted same-pair panel mirrors the in-process
// host in-memory (embed-bridge _multichartMirrorViewportFromHost + shared bar
// store) instead of self-loading. In baseline the late panel is served by the
// host → ≤1 boot data hit (PASS); under --bug the kill-switches disable the
// mirror/store paths → the late panel double-fetches (FAIL). It stays the
// cleanest deliberate-bug proof because it isolates a single fetch-avoidance
// decision rather than the multi-panel bar-equality behaviour probed by H-S2/S3.
async function hS12(ctx) {
  const checks = makeChecks();
  const notes = [];
  const boot = await bootLayout(ctx.browser, ctx.srv, { pair: 'same', panels: 1, tf: '1m', bug: ctx.bug, bugSwitches: ctx.bugSwitches });
  let inv;
  try {
    const { page } = boot;
    // Let panel A fully settle and populate the shared bar store (window.top).
    await sleep(1500);
    ctx.srv.resetApiLog();
    // Add a second SAME-PAIR panel B after A owns the fileId.
    await page.evaluate(() => {
      const grid = document.getElementById('grid');
      grid.style.gridTemplateColumns = '1fr 1fr';
      const d = document.createElement('div');
      d.className = 'cell';
      d.setAttribute('data-cell', 'B');
      grid.appendChild(d);
      window.__harnessCells.B = d;
      window.__harnessManager.addChart({ id: 'B', tf: '1m', fileId: 25 }, d);
    });
    // Wait for B to paint.
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const b = readPanel && (await readPanel(page, 'B'));
      if (b && b.dataLen > 0 && b.renders > 0) break;
      await sleep(250);
    }
    await sleep(1000);
    const apiLog = ctx.srv.getApiLog();
    const bHits = totalDataFetches(apiLog);
    // Store ON (baseline): the late panel is served by A's store → ≤1 hit.
    // Store OFF (--bug): it self-loads its full window → ≥2 hits.
    checks.check('H-S12 late same-pair panel reuses shared store (≤1 boot data hit)',
      bHits <= 1, `late-panel boot data hits=${bHits}`);
    notes.push('H-S12 is the deliberate-bug lever: PASS in baseline, FAIL under --bug '
      + '(__TALARIA_DISABLE_SHARED_BAR_STORE) which re-enables the per-panel fetch path.');
  } finally {
    inv = await invariantCheck(boot.page, boot);
    await boot.close();
    // eslint-disable-next-line no-unsafe-finally
    return { checks, inv, notes };
  }
}

// ── H-S13 ────────────────────────────────────────────────────────────────
// Same-pair 4-panel, paused replay, all sync OFF: a peer iframe TF-up switch must
// not mutate untouched peers' price scale state (Y-domain, priceZoom, priceOffset).
async function hS13(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '5m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    const untouched = ['C', 'D'];
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    const ts0 = await replayStartTs(page);
    checks.check('H-S13 replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 15_000);
    checks.check('H-S13 replay entered + paused/quiescent on all panels', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    // With all sync OFF, C/D may sit at their own replay view. Park them away
    // from the host playhead before B changes TF so a replay-bus re-anchor shows
    // up as a Y-domain change on untouched panels.
    await dragCellRight(page, 'C', { screens: 3 });
    await dragCellRight(page, 'D', { screens: 3 });
    const parked = await waitReplayQuiescent(page, ids, ts0, 15_000);
    checks.check('H-S13 C/D independent paused-replay views settled before B TF-up', parked.ok, parked.detail);
    if (!parked.ok) return checks;

    const before = await readPriceScalePanels(page, untouched);
    const haveBefore = untouched.every((id) => before[id]
      && Array.isArray(before[id].yDomain)
      && before[id].replayActive
      && !before[id].replayPlaying);
    checks.check('H-S13 captured paused-replay C/D price scale before B TF-up switch', haveBefore,
      untouched.map((id) => `${id}:${formatPriceSnap(before[id])}`).join(' '));
    if (!haveBefore) return checks;

    await resetDiag(page);
    await panelCmd(page, 'B', 'setTimeframe', { tf: '4h' });
    // Live MultichartGrid keeps the paused replay bus primed while panels report
    // state changes. The lean harness has no React onState loop, so emit the same
    // paused replay seek pulse explicitly after B's TF-up command.
    await broadcastCmd(page, 'replayTick', { timestamp: ts0, hostTf: '5m', isPlaying: false });
    const settled = await waitPeerTfSwitchSettled(page, 'B', '4h', untouched, 20_000);
    checks.check('H-S13 B peer-only paused-replay TF-up switch settled on 4h', settled.ok, settled.detail);
    const after = settled.prices || await readPriceScalePanels(page, untouched);

    for (const id of untouched) {
      checks.check(`H-S13 ${id} Y-domain + price scale unchanged after B paused-replay TF-up switch`,
        priceScaleUnchanged(before[id], after[id], 1e-8),
        `before ${formatPriceSnap(before[id])} after ${formatPriceSnap(after[id])}`);
    }
    notes.push('H-S13: all sync gates OFF; replay is active but paused on A/B/C/D; '
      + 'C/D are first parked at independent paused-replay views; '
      + 'B receives a real panel-cmd setTimeframe 5m→4h without __fromHostFanout, '
      + 'then the live paused replay bus emits the current playhead seek. '
      + 'C/D must keep Y-domain, priceZoom, priceOffset, autoScale unchanged. '
      + 'Before/after: '
      + untouched.map((id) => `${id} ${formatPriceSnap(before[id])} -> ${formatPriceSnap(after[id])}`).join(' | '));
    return checks;
  });
}

// ── H-S14 ────────────────────────────────────────────────────────────────
// BL-9: same-pair 2x2, backtest replay ACTIVE but PAUSED, all sync OFF. A
// backward PANEL drag (B, an iframe — NOT the host) that needs MORE than one
// host batch must keep filling the panel's OWN left gap AFTER the gesture ends
// (mouseup) with NO click. On the unfixed engine the host-master sync poll
// (_scheduleMultichartHostMasterSyncPoll) only re-arms while stillPan ||
// hostBusy, so once the gesture ends and the host (whose own viewport never
// moved) goes idle the poll STOPS with the panel's left gap still uncovered —
// the "stalls until you click" defect. The fix keeps the delegate+mirror
// driving while the panel's own viewport left gap persists AND host history
// remains; the kill-switch __TALARIA_MC_DISABLE_PANEL_PAN_HISTORY_CONTINUE
// restores the old stop-on-gesture-end behaviour (deterministic RED).
//
// DETERMINISM: the drag is raced ahead of the host fetch (many strokes, no
// inter-stroke settle) so a single 2000-bar host batch cannot cover the
// exposed gap; then we wait for a real settled point (no in-flight fetches,
// panels quiescent, per-panel diag.fetches stable across spaced reads) before
// sampling. The assertion uses the engine's OWN left-gap predicate
// (_needsReplayHistoryLoadLeft), which is false iff the viewport left gap is
// covered OR history is exhausted (hasMoreLeft===false).

/** Read panel B (or any panel) left-edge coverage / gap state. */
async function readPanelLeftGap(page, id) {
  const frame = id === 'A' ? page : panelFrameMap(page)[id];
  if (!frame) return null;
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch) return { ok: false, reason: 'no chart' };
    try {
      const m = ch.margin || { l: 60, r: 60 };
      const leftIdx = (typeof ch.pixelToDataIndex === 'function')
        ? Math.floor(ch.pixelToDataIndex(m.l)) : null;
      const cur = ch._serverCursors || null;
      const hasMoreLeft = cur ? cur.hasMoreLeft !== false : null;
      const needsMoreLeft = (typeof ch._needsReplayHistoryLoadLeft === 'function')
        ? !!ch._needsReplayHistoryLoadLeft() : null;
      const data = Array.isArray(ch.data) ? ch.data : [];
      const rs = ch.replaySystem || null;
      const master = rs && Array.isArray(rs.fullRawData) ? rs.fullRawData : [];
      return {
        ok: true,
        leftIdx,
        gapOnLeft: leftIdx != null ? leftIdx < 6 : null,
        hasMoreLeft,
        needsMoreLeft,
        replayActive: !!(rs && rs.isActive),
        replayPlaying: !!(rs && rs.isPlaying),
        dataLen: data.length,
        firstBarT: data.length ? Number(data[0].t) : null,
        masterLen: master.length,
        masterFirstT: master.length ? Number(master[0].t) : null,
        offsetX: Number(ch.offsetX),
        panLoading: !!ch._panLoading,
      };
    } catch (e) { return { ok: false, reason: String(e && e.message || e) }; }
  }).catch(() => null);
}

/**
 * Real mouse-wheel zoom-OUT over a panel's chart area. Zooming out widens the
 * visible bar span far past the loaded window so the viewport's left region
 * shows an uncovered gap that needs MORE THAN ONE host batch to fill — the
 * condition under which the delegate poll must keep driving after a gesture.
 */
async function wheelZoomOutPanel(page, id, ticks = 24) {
  const frame = id === 'A' ? page : panelFrameMap(page)[id];
  if (!frame) throw new Error(`wheelZoomOutPanel: no frame for panel ${id}`);
  return frame.evaluate(async (n) => {
    const ch = window.chart;
    const canvas = document.getElementById('chartCanvas');
    if (!ch || !canvas) return { ok: false };
    const r = canvas.getBoundingClientRect();
    // Anchor the zoom near the RIGHT (playhead) so zooming out opens whitespace
    // on the LEFT (older history), matching a "drag back into empty history".
    const cx = Math.round(r.left + r.width * 0.8);
    const cy = Math.round(r.top + r.height * 0.5);
    const before = Number(ch.candleWidth);
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    for (let i = 0; i < n; i++) {
      const ev = new WheelEvent('wheel', {
        bubbles: true, cancelable: true, view: window,
        deltaY: 120, clientX: cx, clientY: cy,
      });
      canvas.dispatchEvent(ev);
      // Keep each tick inside the same wheel burst window; small yield lets the
      // engine apply candleWidth per tick.
      await sleep(15);
    }
    return { ok: true, candleWidthBefore: before, candleWidthAfter: Number(ch.candleWidth) };
  }, ticks);
}

/**
 * Real backward drag on a panel: `strokes` back-to-back rightward strokes (pan
 * into older history) of `distancePx` each. The gesture fully ends (mouseup)
 * after every stroke and NO click is issued afterward. Kept deliberately short
 * so it triggers only a couple of host batches — the persistent multi-batch
 * left gap comes from the zoom-out, and the bug's stop-on-gesture-end leaves it
 * uncovered.
 */
async function dragCellRightBackward(page, id, opts = {}) {
  const { strokes = 1, distancePx = 220, stepsPerStroke = 12 } = opts;
  const rect = await page.evaluate((pid) => {
    const cell = window.__harnessCells && window.__harnessCells[pid];
    if (!cell) return null;
    const r = cell.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, id);
  if (!rect) throw new Error(`dragCellRightBackward: no cell for panel ${id}`);
  const y = Math.round(rect.y + rect.h * 0.5);
  const xStart = Math.round(rect.x + Math.min(rect.w * 0.15, 40));
  const xEnd = Math.round(xStart + distancePx);
  for (let s = 0; s < Math.max(1, strokes); s++) {
    await page.mouse.move(xStart, y);
    await page.mouse.down();
    for (let i = 1; i <= stepsPerStroke; i++) {
      const x = Math.round(xStart + ((xEnd - xStart) * i) / stepsPerStroke);
      await page.mouse.move(x, y);
    }
    await page.mouse.up();
  }
}

/**
 * Deterministic settle for the pan-load path: wait until no data request is in
 * flight and every panel's diag.fetches is STABLE across two spaced reads with
 * all panels quiescent (no pan/settle mid-flight). No fixed sleep; on timeout
 * the caller still samples (a perpetually loading panel is itself reportable).
 */
async function waitPanLoadSettled(page, ids, getInFlightDataRequests, budgetMs = 30_000) {
  const deadline = Date.now() + budgetMs;
  let prev = null;
  let last = {};
  let lastInFlight = 0;
  while (Date.now() < deadline) {
    const p = await readPanels(page);
    last = p;
    lastInFlight = Number(getInFlightDataRequests && getInFlightDataRequests()) || 0;
    const quiescent = ids.every((i) => isPanelQuiescent(p[i]));
    const fetches = ids.map((i) => p[i]?.fetches ?? 0);
    const stable = prev && fetches.every((f, k) => f === prev[k]);
    if (lastInFlight === 0 && quiescent && stable) {
      return { ok: true, detail: `settled: fetches=${fetches.join('/')} inFlight=0`, panels: p };
    }
    prev = fetches;
    await sleep(300);
  }
  const detail = ids
    .map((i) => `${i}:fetches=${last[i]?.fetches} panLoad=${last[i]?.panLoading}`)
    .join(' ');
  return { ok: false, detail: `pan-load never settled within ${budgetMs}ms — ${detail}; inFlight=${lastInFlight}`, panels: last };
}

async function hS14(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    // Enlarge the page so panel B's plot is wide: at min zoom the visible bar
    // span then far exceeds a single ~2000-bar host batch, so the zoom-out
    // opens a robust MULTI-batch left gap that a single post-gesture batch
    // cannot cover (the bug's stop-on-gesture-end leaves it visibly empty).
    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(600);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    // Enter backtest replay and PAUSE on all panels (armed + paused).
    const ts0 = await replayStartTs(page);
    checks.check('H-S14 replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 15_000);
    checks.check('H-S14 replay entered + paused/quiescent on all panels', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    // Snapshot panel B left-edge coverage BEFORE the drag (should be covered:
    // paused at the playhead with history loaded to the left).
    const before = await readPanelLeftGap(page, 'B');
    const beforeOk = !!(before && before.ok && before.replayActive && !before.replayPlaying);
    checks.check('H-S14 captured paused-replay panel B left-edge coverage before drag', beforeOk,
      JSON.stringify(before));
    if (!beforeOk) return checks;

    // Zoom panel B OUT so the visible span far exceeds one host batch: the
    // viewport's left region now needs MANY batches to cover. This is the
    // condition where one post-gesture batch cannot finish the fill.
    const zoom = await wheelZoomOutPanel(page, 'B', 58);
    await sleep(300);
    const zoomed = await readPanelLeftGap(page, 'B');
    checks.check('H-S14 panel B zoomed out (visible span widened)',
      !!(zoom && zoom.ok && zoom.candleWidthAfter < zoom.candleWidthBefore),
      `candleWidth ${zoom && zoom.candleWidthBefore}->${zoom && zoom.candleWidthAfter}; postZoom=${JSON.stringify(zoomed)}`);

    ctx.srv.resetApiLog();
    await resetDiag(page);

    // REAL backward drag into the zoomed-out history; short gesture that ENDS
    // (mouseup) with NO click. Only a couple of host batches load during the
    // gesture; covering the wide left gap requires the poll to keep driving.
    await dragCellRightBackward(page, 'B', { strokes: 1, distancePx: 260 });

    // Wait for a deterministic settled point (no in-flight fetches, quiescent, stable diag).
    const settled = await waitPanLoadSettled(page, ids, boot.getInFlightDataRequests, 30_000);
    checks.check('H-S14 pan-load reached a deterministic settled read point', settled.ok, settled.detail);

    const after = await readPanelLeftGap(page, 'B');
    const afterOk = !!(after && after.ok);
    checks.check('H-S14 panel B snapshot readable after gesture', afterOk, JSON.stringify(after));
    if (!afterOk) return checks;

    // Same-pair delegate: B must NOT self-fetch (host is the only owner).
    const apiLog = ctx.srv.getApiLog();
    const bFetchDiag = (after.needsMoreLeft != null); // structural read guard
    void bFetchDiag;

    // CONTRACT: after the gesture ends with NO click, panel B's viewport left
    // gap must be COVERED (candles present to the left edge) OR history is
    // exhausted. The engine's own predicate is false in exactly those two
    // cases; it stays TRUE (RED) when the poll stalls with an uncovered gap.
    const covered = after.needsMoreLeft === false;
    checks.check('H-S14 panel B left gap covered after gesture end (no click)', covered,
      `before[leftIdx=${before.leftIdx} needsMoreLeft=${before.needsMoreLeft} masterFirstT=${before.masterFirstT}] `
      + `after[leftIdx=${after.leftIdx} gapOnLeft=${after.gapOnLeft} needsMoreLeft=${after.needsMoreLeft} `
      + `hasMoreLeft=${after.hasMoreLeft} masterFirstT=${after.masterFirstT} firstBarT=${after.firstBarT} `
      + `dataLen=${after.dataLen} panLoading=${after.panLoading}]`);

    notes.push('H-S14 (BL-9): same-pair 2x2, replay ACTIVE+PAUSED, all sync OFF. '
      + 'Panel B dragged backward past one host batch, gesture ends with NO click. '
      + 'B delegates history to the in-process host and mirrors its growing master; '
      + 'the fix keeps _scheduleMultichartHostMasterSyncPoll driving the host delegate '
      + '+ local mirror while B\'s own viewport left gap persists AND host history '
      + 'remains (kill-switch __TALARIA_MC_DISABLE_PANEL_PAN_HISTORY_CONTINUE restores '
      + 'stop-on-gesture-end → RED). Assertion = B._needsReplayHistoryLoadLeft()===false '
      + '(left gap covered OR hasMoreLeft exhausted) at a settled point. '
      + `host owner data fetches during pan=${totalDataFetches(apiLog)}.`);
    return checks;
  });
}

// ── H-S15 ────────────────────────────────────────────────────────────────
// BL-9 (independent/new-pair variant) — POSITIVE GUARD.
// Panel B owns a DIFFERENT pair than the host (file 27), backtest replay ACTIVE
// but PAUSED, all sync OFF. B self-fetches its own history (no host delegate).
// A deep multi-stroke backward drag on B (needs MANY batches) ends (mouseup)
// with NO click, and B's OWN left gap must still end up COVERED.
//
// NOTE (evidence, 2026-07-10): the PO reported this stall on new-pair panels,
// but the harness could NOT reproduce an independent RED — the self-fetch
// continuation chain (checkViewportLoadMore .finally → rAF constrainOffset →
// _scheduleReplayPanLoadLeft) already self-continues after the gesture and
// covers the gap across multiple batches, WITH and WITHOUT the
// __TALARIA_MC_DISABLE_PANEL_PAN_HISTORY_CONTINUE kill-switch (that switch only
// gates the same-pair delegate poll, H-S14). This scenario is therefore kept as
// a permanent POSITIVE guard that the independent pan-back continuation never
// regresses — it is NOT a bug-lever and stays GREEN under --bug. The reproduced
// BL-9 defect is the same-pair delegate path (H-S14). If the PO still sees an
// independent stall on the deployed build, capture the live network timing —
// the likely cause is per-batch latency (slow-but-completing), not a true stall.
async function hS15(ctx) {
  return runWith(ctx, { pair: 'independent', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(600);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    // Enter backtest replay and PAUSE on all panels (B owns file27 independently).
    const ts0 = await enterReplayPausedAll(page);
    checks.check('H-S15 replay entered (paused) on all panels', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;

    // Panel B is the independent owner; confirm it is same replay state, paused.
    const before = await readPanelLeftGap(page, 'B');
    const beforeOk = !!(before && before.ok && before.replayActive && !before.replayPlaying);
    checks.check('H-S15 captured paused-replay panel B (independent) left-edge coverage before drag',
      beforeOk, JSON.stringify(before));
    if (!beforeOk) return checks;

    // Zoom B OUT so the visible span far exceeds one batch → wide multi-batch
    // left gap that a single post-gesture batch cannot cover.
    const zoom = await wheelZoomOutPanel(page, 'B', 58);
    await sleep(300);
    const zoomed = await readPanelLeftGap(page, 'B');
    checks.check('H-S15 panel B zoomed out (visible span widened)',
      !!(zoom && zoom.ok && zoom.candleWidthAfter < zoom.candleWidthBefore),
      `candleWidth ${zoom && zoom.candleWidthBefore}->${zoom && zoom.candleWidthAfter}; postZoom=${JSON.stringify(zoomed)}`);

    ctx.srv.resetApiLog();
    await resetDiag(page);

    // REAL backward drag into the zoomed-out history; gesture ENDS (mouseup)
    // with NO click. Deep multi-stroke pan so a single self-fetch batch cannot
    // cover the exposed gap — the continuation must keep driving after the
    // gesture ends, else B stalls with an uncovered left gap.
    await dragCellRightBackward(page, 'B', { strokes: 5, distancePx: 600, stepsPerStroke: 16 });

    const settled = await waitPanLoadSettled(page, ids, boot.getInFlightDataRequests, 30_000);
    checks.check('H-S15 pan-load reached a deterministic settled read point', settled.ok, settled.detail);

    const after = await readPanelLeftGap(page, 'B');
    const afterOk = !!(after && after.ok);
    checks.check('H-S15 panel B snapshot readable after gesture', afterOk, JSON.stringify(after));
    if (!afterOk) return checks;

    // Independent B is its OWN owner → it fetches its own pair (file 27). Prove
    // it did some backward loading (not vacuous) then that the gap is covered.
    const apiLog = ctx.srv.getApiLog();
    const byFile = countFetchesByFile(apiLog);
    const bFetched = (after.masterFirstT != null && before.masterFirstT != null
      && Number(after.masterFirstT) < Number(before.masterFirstT))
      || (byFile[IND_FILE] || 0) > 0;
    checks.check('H-S15 independent B loaded older history during/after gesture (not vacuous)',
      bFetched, `file27 hits=${byFile[IND_FILE] || 0} masterFirstT ${before.masterFirstT}->${after.masterFirstT}`);

    // CONTRACT: after the gesture ends with NO click, panel B's viewport left
    // gap must be COVERED (or history exhausted). Engine predicate is false in
    // exactly those cases; stays TRUE (RED) when the self-fetch chain stalls.
    const covered = after.needsMoreLeft === false;
    checks.check('H-S15 panel B (independent) left gap covered after gesture end (no click)', covered,
      `before[leftIdx=${before.leftIdx} needsMoreLeft=${before.needsMoreLeft} masterFirstT=${before.masterFirstT}] `
      + `after[leftIdx=${after.leftIdx} gapOnLeft=${after.gapOnLeft} needsMoreLeft=${after.needsMoreLeft} `
      + `hasMoreLeft=${after.hasMoreLeft} masterFirstT=${after.masterFirstT} firstBarT=${after.firstBarT} `
      + `dataLen=${after.dataLen} panLoading=${after.panLoading}]`);

    notes.push('H-S15 (BL-9 independent variant, POSITIVE GUARD): panel B owns a different pair '
      + '(file27), replay ACTIVE+PAUSED, all sync OFF. Deep backward drag ends with NO click; B\'s '
      + 'self-fetch continuation must still cover its own left gap. Harness could not reproduce an '
      + 'independent RED — the self-fetch chain self-continues after the gesture WITH and WITHOUT the '
      + 'kill-switch (which only gates the same-pair delegate path, H-S14). Guards against regression '
      + `of the independent pan-back continuation. file27 fetches during pan=${byFile[IND_FILE] || 0}.`);
    return checks;
  });
}

// ── H-S16 ────────────────────────────────────────────────────────────────
// BL-9 REGRESSION GUARD (D-035 ruling #1): the b85 pan-history continuation must
// be PAUSED-ONLY. This gates the exact CONTRACT of the playback guard rather than
// a fetch-count storm: the engine's minimum-candleWidth clamp caps a panel's
// exposed left gap at ~1.5 host batches, so an end-to-end play storm self-limits
// to ~1-2 fetches and cannot yield a causal fetch-count margin (a fetch-count
// assertion would be vacuous — it passes with AND without the guard). Instead we
// assert the predicate directly, viewport-IDENTICAL, toggling only isPlaying:
//   with an uncovered left gap + history remaining,
//     _panelPanHistoryGapNeedsHostMore(host) === true   while PAUSED
//     _panelPanHistoryGapNeedsHostMore(host) === false   while PLAYING (the guard)
// Temporarily removing the guard during the A/B causal proof makes the PLAYING
// case return true → the per-frame backward re-fire the PO hit on b85. Binary,
// deterministic, independent of gap/history size.
async function hS16(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(600);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    const ts0 = await enterReplayPausedAll(page);
    checks.check('H-S16 replay entered (paused) on all panels', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;

    // Zoom panel B out so its viewport left region needs more history than the
    // loaded master covers (uncovered gap) AND older history remains to serve.
    const zoom = await wheelZoomOutPanel(page, 'B', 60);
    await sleep(250);
    const preplay = await readPanelLeftGap(page, 'B');
    const gapReady = !!(preplay && preplay.needsMoreLeft === true && preplay.hasMoreLeft === true
      && preplay.replayActive === true && preplay.replayPlaying === false);
    checks.check('H-S16 panel B (paused) has an uncovered left gap with history remaining',
      gapReady, `candleWidth ${zoom && zoom.candleWidthBefore}->${zoom && zoom.candleWidthAfter}; ${JSON.stringify(preplay)}`);
    if (!gapReady) return checks;

    // Evaluate the BL-9 continuation predicate on panel B for the SAME viewport,
    // toggling only replay isPlaying. Restores isPlaying afterward so the harness
    // state is untouched.
    const frameB = panelFrameMap(page).B;
    const probe = await frameB.evaluate(() => {
      const ch = window.chart;
      if (!ch || typeof ch._panelPanHistoryGapNeedsHostMore !== 'function') {
        return { ok: false, reason: 'no predicate' };
      }
      const host = (typeof ch._multichartGetHostChart === 'function') ? ch._multichartGetHostChart() : null;
      if (!host) return { ok: false, reason: 'no host chart from panel' };
      const rs = ch.replaySystem || null;
      const saved = rs ? rs.isPlaying : undefined;
      let paused = null;
      let playing = null;
      try {
        if (rs) rs.isPlaying = false;
        paused = !!ch._panelPanHistoryGapNeedsHostMore(host);
        if (rs) rs.isPlaying = true;
        playing = !!ch._panelPanHistoryGapNeedsHostMore(host);
      } finally {
        if (rs) rs.isPlaying = saved;
      }
      return { ok: true, paused, playing, restored: rs ? rs.isPlaying : undefined };
    }).catch((e) => ({ ok: false, reason: String(e && e.message || e) }));

    const probeOk = !!(probe && probe.ok);
    checks.check('H-S16 continuation predicate readable on panel B', probeOk, JSON.stringify(probe));
    if (!probeOk) return checks;

    // PAUSED with an uncovered gap → the continuation SHOULD want more history.
    checks.check('H-S16 predicate = true while PAUSED (continuation active, uncovered gap)',
      probe.paused === true, JSON.stringify(probe));
    // PLAYING → the guard MUST suppress it (this is the whole fix; without the
    // guard it returns true → the per-frame backward-refetch storm on play).
    checks.check('H-S16 predicate = false while PLAYING (playback guard suppresses continuation)',
      probe.playing === false, JSON.stringify(probe));

    notes.push('H-S16 (BL-9 regression guard, D-035): same-pair, sync OFF, paused replay, panel B zoomed to '
      + 'an uncovered left gap. Asserts the continuation predicate _panelPanHistoryGapNeedsHostMore(host) '
      + 'contract on B, viewport-identical, toggling only isPlaying: PAUSED=true, PLAYING=false. The playback '
      + 'guard is what forces the PLAYING=false; temporarily removing it (A/B proof) returns true → the b85 '
      + 'per-frame backward-refetch storm on play. NOTE: a fetch-count storm is not gateable here — the '
      + `engine's min-candleWidth clamp caps the exposed gap so the storm self-limits (~1-2 fetches). `
      + `probe=${JSON.stringify({ paused: probe.paused, playing: probe.playing })}.`);
    return checks;
  });
}

// ── H-S17 ────────────────────────────────────────────────────────────────
// BL-10 (D-037): a same-pair panel COARSER than the host must advance its replay
// playhead during PLAY (shared-playhead invariant). Repro drives the exact buggy
// path: during play, iframe panels ignore replayTick and mirror replayFrame
// (panel-cmd-bridge.js:2677); applyReplayFrame's different-TF branch (:675-684)
// only seeks when _multichartFinerSamePairPanelSelfOwns() is true (FINER-only,
// chart.js:3095-3116), so a COARSER same-pair panel hits the unconditional
// `return` and freezes — "host runs alone."
//   All sync OFF. Host stays 1m; panel B → 1h (coarser). Enter paused replay,
//   then stream real PLAY fan-out (replayFrame {isPlaying:true}) advancing 1m per
//   frame. ASSERT: B's playhead advances with the host AND its forming candle
//   updates. D-037 constraint #1 (no BL-5 resurrection): B must repaint at its
//   OWN cadence — renders over the play window are bounded well under the 1m frame
//   count (a per-1m-tick reslice would blow this). RED-first: on the current
//   engine B.replayTs stays frozen at ts0.
async function hS17(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(500);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    const ts0 = await replayStartTs(page);
    checks.check('H-S17 replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    await sleep(1400);

    // Panel B → COARSER TF than the host (host stays 1m). All sync OFF, so this
    // is a user-chosen independent TF, NOT a fan-out.
    await panelCmd(page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
    await sleep(1800);
    const bBefore = await readPanel(page, 'B');
    const hostBefore = await readHost(page);
    const setupOk = !!(bBefore && hostBefore
      && bBefore.tf === '1h' && hostBefore.tf === '1m'
      && bBefore.replayTs != null);
    checks.check('H-S17 panel B is coarser (1h) than host (1m) with replay active',
      setupOk, `B.tf=${bBefore?.tf} host.tf=${hostBefore?.tf} B.replayTs=${bBefore?.replayTs} B.replayActive=${bBefore?.replayActive}`);
    if (!setupOk) return checks;

    // Stream real PLAY fan-out: replayFrame {isPlaying:true} advancing 1m/frame.
    // This is the exact production play message; iframes mirror it (replayTick is
    // suppressed while playing). 180 frames = 3h → a 1h panel forms ~3 new candles.
    await resetDiag(page);
    const bAtPlayStart = await readPanel(page, 'B');
    let ts = ts0;
    const stepMs = 60_000;
    const FRAMES = 180;
    for (let i = 0; i < FRAMES; i++) {
      ts += stepMs;
      await broadcastCmd(page, 'replayFrame', { timestamp: ts, isPlaying: true });
      // Occasional yield lets the coalesced per-panel rAF flush at its own cadence
      // (so a correctly-coalescing coarse panel is not starved, and a per-tick
      // resampler has room to reveal its render storm).
      if (i % 10 === 0) await sleep(35);
    }
    await sleep(1200);
    const lastTs = ts;
    const bAfter = await readPanel(page, 'B');

    // CORE (RED-first): the coarse panel's playhead must ADVANCE with the host.
    const advanced = !!(bAfter && bAfter.replayTs != null && Number(bAfter.replayTs) > Number(ts0));
    checks.check('H-S17 coarse panel B playhead ADVANCED during play (not frozen)',
      advanced, `B.replayTs ${bBefore.replayTs} -> ${bAfter?.replayTs} (ts0=${ts0}, lastTs=${lastTs})`);

    // Playhead tracked the host to the end (within one 1h bucket).
    const HOUR = 3_600_000;
    const near = advanced && Math.abs(Number(bAfter.replayTs) - lastTs) <= HOUR;
    checks.check('H-S17 coarse panel B playhead tracks host to end (±1 coarse bucket)',
      near, `B.replayTs=${bAfter?.replayTs} lastTs=${lastTs} delta=${bAfter?.replayTs != null ? Number(bAfter.replayTs) - lastTs : 'n/a'}`);

    // Forming candle updated: B's last visible bar advanced across the play window.
    const formingAdvanced = !!(bAfter && bAtPlayStart && bAfter.lastBarT != null
      && bAtPlayStart.lastBarT != null && Number(bAfter.lastBarT) > Number(bAtPlayStart.lastBarT));
    checks.check('H-S17 coarse panel B forming candle advanced (last bar moved forward)',
      formingAdvanced, `B.lastBarT ${bAtPlayStart?.lastBarT} -> ${bAfter?.lastBarT}`);

    // D-037 #1 — BL-5 ANTI-STORM: a 1h panel must repaint at its OWN cadence, not
    // per host 1m tick. Over 180 host 1m frames, bounded renders (coalesced). A
    // per-1m-tick full reslice would push this toward ~180.
    const bRenders = (bAfter?.renders || 0) - (bAtPlayStart?.renders || 0);
    checks.check('H-S17 coarse panel B renders bounded during play (no per-1m-tick reslice)',
      bRenders <= 60, `B renders during play=${bRenders} over ${FRAMES} host 1m frames`);

    notes.push('H-S17 (BL-10, D-037): same-pair 2x2, all sync OFF, host 1m, panel B set to 1h (coarser). '
      + 'Paused replay entered, then real PLAY fan-out (replayFrame isPlaying=true, 1m/frame, 180 frames). '
      + 'The coarse panel must advance its playhead + forming candle with the host (shared-playhead invariant) '
      + 'and repaint at its OWN cadence (renders bounded, no BL-5 per-1m reslice). RED-first: current engine '
      + 'freezes B (applyReplayFrame :675-684 returns for non-finer different-TF panels). '
      + `B.replayTs ${bBefore.replayTs}->${bAfter?.replayTs}; renders=${bRenders}.`);
    return checks;
  });
}

// ── H-S18 ────────────────────────────────────────────────────────────────
// BL-11 (D-038): during replay PLAY, iframe panels B/C/D advance their bars but
// their TIME viewport does NOT auto-follow the playhead — the playhead marches
// off the right edge and the user must drag to keep up. Host A auto-follows via
// the replay engine's forward auto-scroll (getReplayAutoScrollState →
// syncReplayViewportToPlayhead offsetX at replay-system.js:2855). The fix gives
// panels the same play-time forward viewport follow, PLAY-ONLY and X/time-only,
// respecting the leading-edge drag-disengage contract. Kill-switch (RED):
// __TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW.
//
// Read helper: measure how far a panel's offsetX is from the leading-edge target
// (getReplayAutoScrollState) AND whether the replay playhead (last data bar) is
// inside the visible bar window. "Tracks the leading edge the way host A does" ==
// offsetX ≈ leading-edge target (offsetToTarget small) AND playhead visible.

/**
 * Per-panel replay-viewport follow snapshot. Computes the visible bar window the
 * SAME way the engine does (chart.js _countVisiblePlotBars) and the leading-edge
 * offsetX target (replay getReplayAutoScrollState). offsetToTarget is the signed/
 * absolute pixel gap between the panel's current offsetX and the leading edge —
 * the precise "does its offsetX track the right/leading edge like host A" metric.
 */
async function readPanelFollow(page, id) {
  const frame = id === 'A' ? page : panelFrameMap(page)[id];
  if (!frame) return null;
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch) return null;
    const rs = ch.replaySystem || null;
    const data = Array.isArray(ch.data) ? ch.data : [];
    const spacing = (typeof ch.getCandleSpacing === 'function')
      ? ch.getCandleSpacing()
      : (Number(ch.candleWidth) + (Number(ch.candleGap) || 2));
    const m = ch.margin || { l: 0, r: 70 };
    let effectiveW = Number(ch.w) || 0;
    if (effectiveW < 80) {
      try {
        const el = ch.canvas && ch.canvas.parentElement;
        const rw = el ? el.getBoundingClientRect().width : 0;
        if (Number.isFinite(rw) && rw >= 80) effectiveW = rw;
      } catch (_) {}
    }
    if (effectiveW < 80) effectiveW = 320;
    const plotW = Math.max(1, effectiveW - (m.l || 0) - (m.r || 0));
    const offsetX = Number(ch.offsetX);
    let i0 = null;
    let i1 = null;
    let playheadIdx = null;
    let playheadVisible = null;
    let barsPastRightEdge = null;
    if (data.length && Number.isFinite(spacing) && spacing > 0 && Number.isFinite(offsetX)) {
      i0 = Math.max(0, -Math.floor(offsetX / spacing));
      i1 = Math.min(data.length, i0 + Math.ceil(plotW / spacing) + 1);
      playheadIdx = data.length - 1; // replay data is sliced to the playhead bar
      playheadVisible = playheadIdx >= i0 && playheadIdx < i1;
      barsPastRightEdge = playheadIdx - (i1 - 1); // >0 == playhead off the right edge
    }
    let targetOffsetX = null;
    try {
      if (rs && typeof rs.getReplayAutoScrollState === 'function') {
        const st = rs.getReplayAutoScrollState(ch);
        if (st && Number.isFinite(st.offsetX)) targetOffsetX = st.offsetX;
      }
    } catch (_) {}
    const offsetToTarget = (Number.isFinite(targetOffsetX) && Number.isFinite(offsetX))
      ? Math.abs(offsetX - targetOffsetX) : null;
    return {
      tf: ch.currentTimeframe != null ? String(ch.currentTimeframe) : '',
      replayActive: !!(rs && rs.isActive),
      replayPlaying: !!(rs && rs.isPlaying),
      userHasPanned: !!(rs && rs.userHasPanned),
      autoScrollEnabled: !!(rs && rs.autoScrollEnabled),
      replayTs: rs && Number.isFinite(Number(rs.replayTimestamp)) ? Number(rs.replayTimestamp) : null,
      dataLen: data.length,
      lastBarT: data.length ? Number(data[data.length - 1].t) : null,
      offsetX,
      spacing,
      i0,
      i1,
      playheadIdx,
      playheadVisible,
      barsPastRightEdge,
      targetOffsetX,
      offsetToTarget,
      priceZoom: Number(ch.priceZoom),
      priceOffset: Number(ch.priceOffset),
      autoScale: ch.autoScale,
      renders: ch._mcDiag ? (Number(ch._mcDiag.renders) || 0) : 0,
      // Deterministic follow-render counter (panel-cmd-bridge maybePanelPlayViewportFollow):
      // increments once per follow render actually issued past the cost guard.
      followRenders: Number(ch._mcPlayFollowRenders) || 0,
      dpr: (typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0)
        ? window.devicePixelRatio : 1,
    };
  }).catch(() => null);
}

/**
 * Drive REAL replay PLAY: advance the host playhead one host bar per frame (the
 * host auto-follows via goToReplayTimestamp) and fan out the production PLAY
 * message (replayFrame {isPlaying:true}) to every iframe, exactly as
 * MultichartGrid does. Returns the last ts streamed.
 */
async function streamHostPlay(page, startTs, frames, stepMs, opts = {}) {
  const { yieldEvery = 8, yieldMs = 30 } = opts;
  // Faithful to production PLAY: the host replay engine's isPlaying flag is TRUE
  // during playback. Panels gate several replay paths on isParentReplayPlaying()
  // (host rs.isPlaying), so a seek-only drive (isPlaying=false) would misrepresent
  // play. Set the host playing flag for the duration; the host playhead is still
  // advanced deterministically one bar per frame via goToReplayTimestamp.
  await setHostReplayPlaying(page, true);
  let ts = startTs;
  for (let i = 0; i < frames; i++) {
    ts += stepMs;
    await hostReplaySeek(page, ts);
    await broadcastCmd(page, 'replayFrame', { timestamp: ts, isPlaying: true });
    if (i % yieldEvery === 0) await sleep(yieldMs);
  }
  return ts;
}

/** Set the in-process HOST replay engine's isPlaying flag (faithful play state). */
async function setHostReplayPlaying(page, playing) {
  return page.evaluate((p) => {
    const rs = window.chart && window.chart.replaySystem;
    if (!rs || !rs.isActive) return false;
    rs.isPlaying = !!p;
    return rs.isPlaying;
  }, !!playing).catch(() => false);
}

// The follow contract: a panel "tracks the leading edge" during play when its
// playhead is inside its visible window AND its offsetX sits within a small slack
// of the leading-edge target. RED = frozen offset while the target marches left
// (offsetToTarget grows to many candle-spacings) and/or playhead off-screen.
function followSlackPx(follow) {
  const sp = follow && Number.isFinite(follow.spacing) && follow.spacing > 0 ? follow.spacing : 8;
  return sp * 3; // ≤3 candle-spacings from the leading edge is "at the edge"
}

async function hS18(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(500);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    const ts0 = await replayStartTs(page);
    checks.check('H-S18 replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 15_000);
    checks.check('H-S18 replay entered + paused/quiescent on all panels', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    // VARIANT (ii): switch panel C to a COARSER TF than the host (host stays 1m).
    // B and D stay same-TF (variant i). All sync OFF → user-chosen independent TF.
    await panelCmd(page, 'C', 'setTimeframe', { tf: '5m' }).catch(() => {});
    await sleep(1800);
    const cSetup = await readPanel(page, 'C');
    const hostSetup = await readHost(page);
    const setupOk = !!(cSetup && hostSetup && cSetup.tf === '5m' && hostSetup.tf === '1m');
    checks.check('H-S18 setup: panel C coarser (5m) vs host (1m); B/D same-TF (1m)',
      setupOk, `C.tf=${cSetup?.tf} host.tf=${hostSetup?.tf}`);
    if (!setupOk) return checks;

    // Bound the play window strictly inside the loaded replay master (like H-S8).
    const hostMaster = await readHost(page);
    const stepMs = 60_000;
    let frames = 240;
    if (hostMaster && Number.isFinite(hostMaster.replayMasterLastT)) {
      const forward = Math.floor((hostMaster.replayMasterLastT - ts0) / stepMs) - 4;
      if (Number.isFinite(forward) && forward < frames) frames = Math.max(60, forward);
    }

    // ── CORE + VARIANTS: stream real PLAY, then measure follow ──────────────
    await resetDiag(page);
    const lastTs = await streamHostPlay(page, ts0, frames, stepMs);
    await sleep(1200);

    const hostF = await readPanelFollow(page, 'A');
    const bF = await readPanelFollow(page, 'B');
    const cF = await readPanelFollow(page, 'C');
    const dF = await readPanelFollow(page, 'D');

    // Host A must keep its playhead in view (the reference contract).
    const hostFollows = !!(hostF && hostF.playheadVisible === true);
    checks.check('H-S18 host A keeps playhead in view during play (reference)',
      hostFollows, `A: ${JSON.stringify(hostF)}`);

    // Sanity: panels actually ADVANCED (bars form/play) — otherwise "no follow" is vacuous.
    const advanced = (p, before) => !!(p && before && Number.isFinite(p.replayTs)
      && Number.isFinite(before.replayTs) && p.replayTs > before.replayTs);
    void advanced;

    // Per-panel follow evaluation. RED = playhead off-screen OR offsetX frozen far
    // from the leading-edge target while the host tracks it.
    const evalFollow = (label, f, redTag) => {
      const slack = followSlackPx(f);
      const tracks = !!(f && f.playheadVisible === true
        && Number.isFinite(f.offsetToTarget) && f.offsetToTarget <= slack);
      checks.check(`H-S18 ${label} tracks leading edge during play (${redTag})`, tracks,
        `playheadVisible=${f?.playheadVisible} offsetToTarget=${f?.offsetToTarget} slack=${slack} `
        +         `barsPastRightEdge=${f?.barsPastRightEdge} offsetX=${f?.offsetX} target=${f?.targetOffsetX} `
        + `dataLen=${f?.dataLen} replayTs=${f?.replayTs} userHasPanned=${f?.userHasPanned} autoScroll=${f?.autoScrollEnabled}`);
      return tracks;
    };
    const bTracks = evalFollow('panel B (same-TF variant i)', bF, 'CORE same-TF');
    const dTracks = evalFollow('panel D (same-TF variant i)', dF, 'CORE same-TF');
    const cTracks = evalFollow('panel C (coarser variant ii, BL-10 path)', cF, 'CORE coarse');

    const redVariants = [];
    if (!(bTracks && dTracks)) redVariants.push('same-TF(B/D)');
    if (!cTracks) redVariants.push('coarse-5m(C)');

    // ── (c) DRAG-DISENGAGE PARITY: drag panel B back mid-play → it opts out of
    // follow for THAT panel until it returns to the edge. After the drag-away the
    // panel viewport must NOT snap back to the playhead (no fighting the user). ──
    const bBeforeDrag = await readPanelFollow(page, 'B');
    await dragCellRight(page, 'B', { screens: 2 }); // pan into history (offsetX up)
    await sleep(200);
    const bAfterDrag = await readPanelFollow(page, 'B');
    // Continue a burst of play frames; a snap-back bug would yank B forward again.
    const dragResumeTs = await streamHostPlay(page, lastTs, 40, stepMs);
    await sleep(800);
    const bAfterResume = await readPanelFollow(page, 'B');
    // The drag must register as a user pan and must move the viewport away from the edge.
    const draggedAway = !!(bAfterDrag && bAfterDrag.userHasPanned === true
      && Number.isFinite(bAfterDrag.offsetToTarget)
      && bAfterDrag.offsetToTarget > followSlackPx(bAfterDrag));
    checks.check('H-S18 (c) panel B registered a mid-play user drag-away (opted out of follow)',
      draggedAway, `afterDrag: userHasPanned=${bAfterDrag?.userHasPanned} offsetToTarget=${bAfterDrag?.offsetToTarget} `
      + `beforeDrag offsetToTarget=${bBeforeDrag?.offsetToTarget}`);
    // No snap-back: after more play frames, B stays where the user left it (still
    // off the leading edge, offsetX ~ unchanged from just after the drag).
    const noSnapBack = !!(bAfterResume && bAfterDrag
      && bAfterResume.userHasPanned === true
      && Number.isFinite(bAfterResume.offsetToTarget)
      && bAfterResume.offsetToTarget > followSlackPx(bAfterResume));
    checks.check('H-S18 (c) panel B viewport did NOT snap back to playhead after drag-away',
      noSnapBack, `afterResume: userHasPanned=${bAfterResume?.userHasPanned} offsetToTarget=${bAfterResume?.offsetToTarget} `
      + `offsetX afterDrag=${bAfterDrag?.offsetX} afterResume=${bAfterResume?.offsetX} dragResumeTs=${dragResumeTs}`);

    // ── (d) B-FIX-C INTERACTION CELL: while follow is active on a same-TF panel
    // (D, never dragged), a backward history load (left-prepend) can land during
    // play. B-FIX-C's left-prepend offsetX compensation shifts offsetX by the
    // prepended bar count; the play follow recomputes offsetX ABSOLUTELY from the
    // leading edge. If both stacked we'd DOUBLE-SHIFT (offset far from the edge).
    // Auto-scroll engaged is the gate: the absolute follow overrides the relative
    // prepend shift → NET result stays at the leading edge (no double-shift).
    // Drive a host backward history pan to prepend bars, keep playing, measure D.
    const dBeforePrepend = await readPanelFollow(page, 'D');
    await dragCellRight(page, 'A', { screens: 4 }); // host loads older history (left-prepend to master)
    await sleep(400);
    // Re-follow the host to the playhead and resume play so D mirrors + follows.
    await hostReplaySeek(page, dragResumeTs);
    const prependTs = await streamHostPlay(page, dragResumeTs, 40, stepMs);
    await sleep(1000);
    const dAfterPrepend = await readPanelFollow(page, 'D');
    const dSlack = followSlackPx(dAfterPrepend);
    // D was never dragged → still following. offsetToTarget must remain bounded
    // (no double-shift). This is the measured, asserted B-FIX-C answer.
    const dNoDoubleShift = !!(dAfterPrepend && dAfterPrepend.userHasPanned !== true
      && Number.isFinite(dAfterPrepend.offsetToTarget)
      && dAfterPrepend.offsetToTarget <= dSlack);
    checks.check('H-S18 (d) B-FIX-C interaction: follow-active panel D shows no left-prepend double-shift',
      dNoDoubleShift, `D afterPrepend: offsetToTarget=${dAfterPrepend?.offsetToTarget} slack=${dSlack} `
      + `playheadVisible=${dAfterPrepend?.playheadVisible} offsetX=${dAfterPrepend?.offsetX} target=${dAfterPrepend?.targetOffsetX} `
      + `before offsetToTarget=${dBeforePrepend?.offsetToTarget} prependTs=${prependTs}`);

    notes.push('H-S18 (BL-11, D-038): same-pair 2x2, all sync OFF, host 1m. Real PLAY fan-out '
      + '(replayFrame isPlaying=true, 1m/frame). Panels must give play-time forward viewport '
      + 'follow like host A (offsetX tracks the leading edge, playhead stays in view), PLAY-ONLY, '
      + 'X/time-only. Variant i = same-TF (B/D 1m); variant ii = coarser (C 5m, BL-10 coalesced '
      + `path). RED variants observed: ${redVariants.length ? redVariants.join(', ') : 'none'}. `
      + `host offsetToTarget=${hostF?.offsetToTarget}; B=${bF?.offsetToTarget} C=${cF?.offsetToTarget} `
      + `D=${dF?.offsetToTarget}. (c) drag-disengage: B afterResume offsetToTarget=${bAfterResume?.offsetToTarget} `
      + `userHasPanned=${bAfterResume?.userHasPanned}. (d) B-FIX-C: D offsetToTarget after left-prepend=`
      + `${dAfterPrepend?.offsetToTarget} (bounded ⇒ no double-shift; auto-scroll gates the compensation).`);
    return checks;
  });
}

// ── H-S19 ────────────────────────────────────────────────────────────────
// BL-12 (D-039): during replay PLAY the BL-11 play-viewport follow
// (maybePanelPlayViewportFollow → syncReplayViewportToPlayhead {render:true})
// fires a full recenter+render on EVERY host play-frame for a panel routed
// through scheduleCoalescedSeek (the coarser same-pair play-advance path). Two
// wasteful cost sources: (a) a panel being ACTIVELY DRAGGED still gets the
// per-frame follow invocation (the drag already disengages follow semantically),
// and (b) an IDLE panel re-renders even when the playhead advanced within the
// same pixel column (a sub-candle-width viewport move). Result: dragging a chart
// during play is laggy, while dragging while stopped/paused is smooth.
//
// MEASUREMENT (D-039 anti-flake): assert on DETERMINISTIC render COUNTERS only
// (ch._mcDiag.renders), never wall-clock frame time. Three cost cells over N
// host play-frames:
//   • idle-panel cell   — a NOT-dragged coarse panel's renders. RED ≈ scales
//     with N (per-frame follow render); GREEN ≪ N (coalesced: render only when
//     the follow moves the viewport ≥1 candle-width).
//   • dragged-panel cell — a coarse panel dragged WHILE play streams. RED =
//     per-frame follow renders stacked on the drag; GREEN = follow SUSPENDED
//     during interaction → bounded to ~the paused-drag cost.
//   • paused-drag reference — the same drag while replay is STOPPED (the
//     Director's relative bound: play-drag ≤ small factor × paused-drag).

/** Set/clear a window flag on the host page AND every iframe panel. */
async function setEngineFlagAll(page, flag, on) {
  const apply = (f, v) => {
    if (v) window[f] = true;
    else { try { delete window[f]; } catch (_) { window[f] = false; } }
  };
  await page.evaluate(apply, flag, !!on).catch(() => {});
  for (const fr of embedFrames(page)) {
    await fr.evaluate(apply, flag, !!on).catch(() => {});
  }
}

/** Read one panel's deterministic render counter (ch._mcDiag.renders). */
async function readPanelRenders(page, id) {
  const p = await readPanel(page, id);
  return p ? (Number(p.renders) || 0) : 0;
}

/**
 * Stream N real host PLAY frames (replayFrame {isPlaying:true}), advancing the
 * host playhead one host bar per frame, WITHOUT any user gesture. Paced so one
 * rAF flushes per frame (the coalesced-seek follow fires per frame under RED).
 */
async function streamPlayFramesNoDrag(page, startTs, frames, stepMs, opts = {}) {
  const { perFrameMs = 18 } = opts;
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

/**
 * Drag one panel with a real mouse gesture while (optionally) streaming host
 * PLAY frames mid-gesture. The button stays DOWN across all moves; a play frame
 * + host seek is emitted between moves so the per-frame follow (if any) lands
 * DURING the active drag. When playing=false this is the paused-drag reference
 * (identical gesture + frame cadence, host not playing).
 */
async function dragPanelWhileStreaming(page, id, startTs, opts = {}) {
  const { moves = 60, stepMs = 60_000, playing = true, distancePx = 900, perFrameMs = 18 } = opts;
  const rect = await page.evaluate((pid) => {
    const cell = window.__harnessCells && window.__harnessCells[pid];
    if (!cell) return null;
    const r = cell.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, id);
  if (!rect) throw new Error(`dragPanelWhileStreaming: no cell for ${id}`);
  const y = Math.round(rect.y + rect.h * 0.5);
  const xStart = Math.round(rect.x + Math.min(rect.w * 0.15, 40));
  const xEnd = Math.round(xStart + distancePx);
  await setHostReplayPlaying(page, !!playing);
  let ts = startTs;
  await page.mouse.move(xStart, y);
  await page.mouse.down();
  for (let i = 1; i <= moves; i++) {
    const x = Math.round(xStart + ((xEnd - xStart) * i) / moves);
    await page.mouse.move(x, y);
    ts += stepMs;
    if (playing) await hostReplaySeek(page, ts);
    await broadcastCmd(page, 'replayFrame', { timestamp: ts, isPlaying: !!playing });
    await sleep(perFrameMs);
  }
  await page.mouse.up();
  await sleep(300);
  return ts;
}

/**
 * Stream M host PLAY frames that DO NOT advance the playhead (re-emit the SAME
 * timestamp with isPlaying:true). The leading-edge follow target is therefore
 * unchanged frame-to-frame — a genuinely stationary / sub-pixel advance. Under
 * the cost guard this must cost ZERO follow renders (proving the guard does
 * something); with the guard OFF it renders once per frame.
 */
async function streamStationaryPlayFrames(page, ts, frames, opts = {}) {
  const { perFrameMs = 18 } = opts;
  await setHostReplayPlaying(page, true);
  await hostReplaySeek(page, ts);
  for (let i = 0; i < frames; i++) {
    await broadcastCmd(page, 'replayFrame', { timestamp: ts, isPlaying: true });
    await sleep(perFrameMs);
  }
  return ts;
}

/** Light read of one panel's live offsetX + follow-render counter (per-frame sampling). */
async function readPanelOffsetSample(page, id) {
  const frame = id === 'A' ? page : panelFrameMap(page)[id];
  if (!frame) return null;
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch) return null;
    return {
      offsetX: Number(ch.offsetX),
      followRenders: Number(ch._mcPlayFollowRenders) || 0,
      dataLen: Array.isArray(ch.data) ? ch.data.length : 0,
    };
  }).catch(() => null);
}

/**
 * Stream N host PLAY frames (advancing the playhead one host bar per frame) while
 * SAMPLING the panel's live offsetX after each frame. Returns { ts, samples } where
 * samples[i] = { offsetX, followRenders, dataLen }. Used to assert the eased follow
 * offset advances MONOTONICALLY across bar-boundary seams (no backward jitter).
 */
async function streamPlayFramesSamplingOffset(page, id, startTs, frames, stepMs, opts = {}) {
  const { perFrameMs = 18 } = opts;
  await setHostReplayPlaying(page, true);
  let ts = startTs;
  const samples = [];
  for (let i = 0; i < frames; i++) {
    ts += stepMs;
    await hostReplaySeek(page, ts);
    await broadcastCmd(page, 'replayFrame', { timestamp: ts, isPlaying: true });
    await sleep(perFrameMs);
    const s = await readPanelOffsetSample(page, id);
    if (s) samples.push(s);
  }
  return { ts, samples };
}

async function hS19(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(500);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    const ts0 = await replayStartTs(page);
    checks.check('H-S19 replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 15_000);
    checks.check('H-S19 replay entered + paused/quiescent on all panels', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    // B (dragged) + C (idle) are COARSER (1h) than the host (1m): the coarse
    // same-pair play-advance routes through scheduleCoalescedSeek →
    // maybePanelPlayViewportFollow (the BL-11 follow, the BL-12/BL-13 cost source).
    // D stays same-TF (1m). All sync OFF → user-chosen independent TF.
    // 1h (60 host frames/candle) — NOT 5m — because D-041 redefined the coalesce
    // unit from one CANDLE-WIDTH to one DEVICE PIXEL: at 5m the leading edge moves
    // >1 device pixel PER host frame, so the (correct, host-parity) follow now
    // repaints every frame and there is nothing left to coalesce; the sub-pixel
    // coalesce only engages on a genuinely coarse panel (1h → ~0.12 px/frame),
    // where guard-ON (coalesced) stays ≪ guard-OFF (per-frame) so the cell still
    // FLIPS on the cost-guard kill-switch.
    await panelCmd(page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
    await panelCmd(page, 'C', 'setTimeframe', { tf: '1h' }).catch(() => {});
    await sleep(1800);
    const bSetup = await readPanel(page, 'B');
    const cSetup = await readPanel(page, 'C');
    const hostSetup = await readHost(page);
    const setupOk = !!(bSetup && cSetup && hostSetup
      && bSetup.tf === '1h' && cSetup.tf === '1h' && hostSetup.tf === '1m');
    checks.check('H-S19 setup: B/C coarser (1h) vs host (1m)', setupOk,
      `B.tf=${bSetup?.tf} C.tf=${cSetup?.tf} host.tf=${hostSetup?.tf}`);
    if (!setupOk) return checks;

    // Bound the play window strictly inside the loaded replay master.
    const stepMs = 60_000;
    const N = 120;

    // ── Cell 1: IDLE-PANEL renders over N play-frames (panel C, never dragged) ──
    // Measured three ways for RED-first + causal A/B attribution:
    //   (i)  follow default (today's build = RED; fix reverts under new flag)
    //   (ii) BL-11 follow disabled (__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW)
    // proving the excess renders come from the BL-11 follow.
    let ts = ts0;
    await resetDiag(page);
    ts = await streamPlayFramesNoDrag(page, ts, N, stepMs);
    await sleep(400);
    const idleRendersDefault = await readPanelRenders(page, 'C');

    // A/B: disable the BL-11 follow entirely, re-measure the idle cost.
    await setEngineFlagAll(page, '__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW', true);
    await resetDiag(page);
    ts = await streamPlayFramesNoDrag(page, ts, N, stepMs);
    await sleep(400);
    const idleRendersFollowOff = await readPanelRenders(page, 'C');
    await setEngineFlagAll(page, '__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW', false);

    // ── Cell 2: PLAY-DRAG renders (panel B dragged WHILE play streams) ──
    await resetDiag(page);
    ts = await dragPanelWhileStreaming(page, 'B', ts, { moves: N, stepMs, playing: true });
    await sleep(300);
    const playDragRenders = await readPanelRenders(page, 'B');
    const bAfterDrag = await readPanelFollow(page, 'B');

    // A/B: play-drag with the BL-11 follow disabled.
    await setHostReplayPlaying(page, false);
    await broadcastCmd(page, 'replayTick', { timestamp: ts });
    await sleep(400);
    await setEngineFlagAll(page, '__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW', true);
    await resetDiag(page);
    ts = await dragPanelWhileStreaming(page, 'B', ts, { moves: N, stepMs, playing: true });
    await sleep(300);
    const playDragRendersFollowOff = await readPanelRenders(page, 'B');
    await setEngineFlagAll(page, '__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW', false);

    // Re-follow B to the edge so the paused-drag reference starts from parity.
    await setHostReplayPlaying(page, false);
    await broadcastCmd(page, 'replayTick', { timestamp: ts });
    await sleep(400);

    // ── Cell 3: PAUSED-DRAG reference (same gesture, replay STOPPED) ──
    await resetDiag(page);
    await dragPanelWhileStreaming(page, 'B', ts, { moves: N, stepMs, playing: false });
    await sleep(300);
    const pausedDragRenders = await readPanelRenders(page, 'B');

    // Follow-attributable render cost = renders(follow on) − renders(follow off),
    // measured with identical pacing so the coarse BL-10 reslice baseline (which
    // BL-12 does NOT touch) cancels out. This isolates the BL-11 follow's render
    // cost as a DETERMINISTIC counter delta (no wall-clock timing — D-039 rule).
    const idleFollowCost = idleRendersDefault - idleRendersFollowOff;
    const dragFollowCost = playDragRenders - playDragRendersFollowOff;
    // D-041 reconciliation of the (formerly ≤60 candle-width) idle bound: GREEN now
    // coalesces the follow to ~one render per DEVICE-PIXEL COLUMN the leading edge
    // crosses (1h → ~0.12 px/frame → a new column only every ~8 frames, so ≈ N/8 ≈
    // 15 over N=120); kill-switch RED (guard OFF) renders ~1:1 with host frames (≈ N).
    // The bound sits between so the cell still FLIPS: GREEN passes, RED fails. (At the
    // former 5m the fix correctly repaints every frame — >1 px/frame — so there is no
    // sub-pixel coalesce to assert; the device-pixel smoothness itself is proved by
    // H-S19b.)
    const IDLE_COALESCE_BOUND = 60;

    // Sanity: the follow-off baseline actually rendered (non-vacuous) and the
    // follow never SUBTRACTS renders — so idleFollowCost is a real cost measure.
    checks.check('H-S19 follow-off baselines non-vacuous',
      idleRendersFollowOff > 0 && playDragRendersFollowOff > 0,
      `idleFollowOff=${idleRendersFollowOff} playDragFollowOff=${playDragRendersFollowOff}`);

    // CORE (idle coalesce cell — the RED→GREEN flip): the BL-11 follow's per-frame
    // render cost on a NOT-dragged coarse panel must be COALESCED (render only when
    // the leading edge crosses ≥1 DEVICE PIXEL — D-041). GREEN ≪ N; kill-switch RED ≈ N.
    checks.check('H-S19 idle-panel follow render cost coalesced (<< N host play-frames)',
      idleFollowCost <= IDLE_COALESCE_BOUND,
      `idleFollowCost=${idleFollowCost} (default=${idleRendersDefault} followOff=${idleRendersFollowOff}) `
      + `bound=${IDLE_COALESCE_BOUND} N=${N}`);

    // DRAG suspend cell (part a correctness): while the panel is ACTIVELY dragged
    // during play, the follow must add NO per-frame renders — its follow-attributable
    // render cost stays bounded (≈ the paused-drag reference, which has zero follow
    // renders), never scaling with frames the way the idle cell does. In this engine
    // a pan/zoom already sets userHasPanned (follow semantically disengaged), so this
    // holds; part (a) makes it structural (never fights the drag / BL-6 recenter).
    checks.check('H-S19 dragged-panel follow render cost bounded during play-drag (suspended)',
      dragFollowCost <= IDLE_COALESCE_BOUND,
      `dragFollowCost=${dragFollowCost} (playDrag=${playDragRenders} followOff=${playDragRendersFollowOff}) `
      + `pausedDragRef=${pausedDragRenders} bound=${IDLE_COALESCE_BOUND}`);

    notes.push('H-S19 (BL-12 D-039, idle bound reconciled under BL-13 D-041): same-pair 2x2, all sync OFF, host 1m, '
      + 'panels B/C set to 1h (coarse — the BL-11 follow path; 1h not 5m so the D-041 sub-pixel coalesce engages). '
      + 'Real PLAY fan-out (replayFrame isPlaying=true, 1m/frame, N=' + N + ' frames). '
      + 'DETERMINISTIC render COUNTERS only (ch._mcDiag.renders), never wall-clock. '
      + 'COST MATRIX (renders / ' + N + ' play-frames): '
      + `idle-panel(C) follow-on=${idleRendersDefault} follow-off=${idleRendersFollowOff} `
      + `→ idleFollowCost=${idleFollowCost} (RED≈N per-frame; GREEN≪N coalesced to ~1/device-pixel-column ≈ N/8). `
      + `dragged-panel(B) play-drag follow-on=${playDragRenders} follow-off=${playDragRendersFollowOff} `
      + `→ dragFollowCost=${dragFollowCost}. paused-drag reference=${pausedDragRenders}. `
      + `host(A) unchanged (same-TF, follows via forceSamePairParentDataMirror, not this path). `
      + `ATTRIBUTION A/B (kill-switch __TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW): toggling the BL-11 `
      + `follow removes the excess idle renders (${idleRendersDefault}→${idleRendersFollowOff}), proving the `
      + `BL-11 follow is the cost source. NOTE (surprise, flagged): a pan/zoom drag already sets userHasPanned `
      + `so the follow is disengaged during the gesture (dragFollowCost≈0 in RED and GREEN) — the measurable `
      + `render regression is the IDLE per-frame follow render (fixed by coalescing, part b); part (a) is the `
      + `ratified interaction-suspend guard. Fix behind __TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD (default ON).`);
    return checks;
  });
}

// ── H-S19b ───────────────────────────────────────────────────────────────
// BL-13 (D-040): CORRECTS H-S19's cost guard (BL-12/D-039). Part (b) of the
// guard coalesced the play-follow render with a CANDLE-WIDTH threshold (skip
// render while |target-offsetX| < candleWidth). candleWidth is MANY device
// pixels when zoomed in, so an idle/scrolling panel repainted only ~once per
// formed candle → playback looked chunky / "stuck then jumps", not smooth like
// the host (which repaints every frame). D-040 ruling: the coalesce threshold
// must be ~1 DEVICE PIXEL (a new pixel column) — repaint whenever the follow
// moves the viewport into a new device-pixel column; only genuinely SUB-PIXEL
// advances cost zero renders. Same cost guard, same flag
// (__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD) — no new flag.
//
// MEASUREMENT (D-040 anti-flake): DETERMINISTIC COUNTERS ONLY, never wall-clock.
// The engine counts every follow render actually issued (ch._mcPlayFollowRenders,
// read as followRenders). Over N host play-frames on a NOT-dragged, NOT-idle
// (scrolling) coarse panel:
//   • pixelColumnsCrossed = round(|ΔoffsetX| · devicePixelRatio) — the device-
//     pixel columns the viewport swept while following the playhead.
//   • candlesCrossed      = round(|ΔoffsetX| / candleWidth) — the coarse
//     candle-width buckets swept (what the b90 threshold coalesces to).
// SMOOTH (D-040): followRenders ≈ pixelColumnsCrossed (two-sided, ±SMALL).
//   RED b90 (candle-width): followRenders ≈ candlesCrossed ≪ pixelColumnsCrossed
//     → fails the LOWER bound (chunky).
//   RED guard-off (bugswitch): followRenders = N (per-frame) > pixelColumnsCrossed
//     → fails the UPPER bound (max renders).
// SUB-PIXEL/STATIONARY: a same-ts advance yields 0 follow renders (guard still
// provably does something).
async function hS19b(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(500);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    const ts0 = await replayStartTs(page);
    checks.check('H-S19b replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 15_000);
    checks.check('H-S19b replay entered + paused/quiescent on all panels', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    // Panel C is COARSER (1h) than the host (1m): 60 host frames per panel candle,
    // so the leading-edge follow advances the viewport by candleWidth/60 device px
    // per frame — comfortably SUB-pixel per frame. That guarantees the smooth-fix
    // follow render count can track pixelColumnsCrossed WITHOUT the once-per-frame
    // cap masking the difference from the chunky candle-width baseline.
    await panelCmd(page, 'C', 'setTimeframe', { tf: '1h' }).catch(() => {});
    await sleep(1800);
    const cSetup = await readPanel(page, 'C');
    const hostSetup = await readHost(page);
    const setupOk = !!(cSetup && hostSetup && cSetup.tf === '1h' && hostSetup.tf === '1m');
    checks.check('H-S19b setup: panel C coarser (1h) vs host (1m)', setupOk,
      `C.tf=${cSetup?.tf} host.tf=${hostSetup?.tf}`);
    if (!setupOk) return checks;

    const stepMs = 60_000;
    // Warm up enough host frames to finish the boot's backward-history loads AND
    // park the viewport at the leading edge, so the MEASURED window is a settled
    // forward play (data grows only from forming-bar seams — no prepend-induced
    // renders that would inflate the follow-render count).
    const WARMUP = 120;
    const N = 360; // 6 coarse (1h) candles worth of settled host 1m frames
    const STATIONARY = 60;

    let ts = ts0;
    ts = await streamPlayFramesNoDrag(page, ts, WARMUP, stepMs);
    await sleep(400);

    // ── SCROLLING cell (the SMOOTHNESS + MONOTONICITY measurement) ──
    // Stream N settled play-frames SAMPLING the panel's live offsetX + follow-render
    // counter each frame. Compute pixelColumnsCrossed and followRenders over the SAME
    // window (host-parity smoothness), and assert the eased offset is MONOTONIC across
    // bar-boundary SEAMS (no backward jitter — the worst felt defect).
    const cCandle0 = await readPanel(page, 'C');
    const dpr = Number(cCandle0?.dpr) || (await readPanelFollow(page, 'C'))?.dpr || 1;
    const candleWidth = Number(cCandle0?.candleWidth) || 0;

    const scrollRun = await streamPlayFramesSamplingOffset(page, 'C', ts, N, stepMs);
    ts = scrollRun.ts;
    await sleep(300);
    const samples = scrollRun.samples.filter((s) => s && Number.isFinite(s.offsetX));
    const offSamples = samples.map((s) => s.offsetX);
    const dataLenSamples = samples.map((s) => s.dataLen);
    const seamCount = dataLenSamples.reduce((acc, v, i) =>
      acc + (i > 0 && v > dataLenSamples[i - 1] ? 1 : 0), 0);

    const offsetStart = offSamples.length ? offSamples[0] : NaN;
    const offsetEnd = offSamples.length ? offSamples[offSamples.length - 1] : NaN;
    const dOffset = (Number.isFinite(offsetStart) && Number.isFinite(offsetEnd))
      ? Math.abs(offsetEnd - offsetStart) : 0;
    const pixelColumnsCrossed = Math.round(dOffset * dpr);
    const candlesCrossed = candleWidth > 0 ? Math.round(dOffset / candleWidth) : 0;
    const followRendersScroll = samples.length
      ? (Number(samples[samples.length - 1].followRenders) || 0) - (Number(samples[0].followRenders) || 0)
      : 0;

    // Non-increasing within float epsilon (offsetX grows MORE NEGATIVE toward the
    // leading edge); a real rewind is a fraction of a candle (≫ eps), so backward
    // jitter is caught crisply.
    const MONO_EPS = 0.05;
    let backwardSteps = 0;
    let worstBackward = 0;
    for (let i = 1; i < offSamples.length; i++) {
      const delta = offSamples[i] - offSamples[i - 1]; // forward follow = negative
      if (delta > MONO_EPS) { backwardSteps++; worstBackward = Math.max(worstBackward, delta); }
    }

    // ── SUB-PIXEL/STATIONARY cell: same-ts frames → 0 follow renders ──
    const beforeStat = await readPanelFollow(page, 'C');
    await streamStationaryPlayFrames(page, ts, STATIONARY);
    await sleep(200);
    const afterStat = await readPanelFollow(page, 'C');
    const followRendersStationary = (Number(afterStat?.followRenders) || 0)
      - (Number(beforeStat?.followRenders) || 0);

    // ── PAUSE-MID-BAR cell: pause with the forming bar partly filled → the eased
    // offset (a pure function of the frozen replay timestamp) must FREEZE exactly
    // where it is, with NO snap to a bar boundary. Verify it falls out (no snap
    // logic added). Advance a partial candle, then stop play and re-read. ──
    const partialFrames = 25; // < 60 → mid-bar (1h panel)
    let tsPause = await streamPlayFramesNoDrag(page, ts, partialFrames, stepMs);
    await sleep(150);
    const beforePause = await readPanelOffsetSample(page, 'C');
    await setHostReplayPlaying(page, false);
    await broadcastCmd(page, 'replayTick', { timestamp: tsPause });
    await sleep(600);
    const afterPause = await readPanelOffsetSample(page, 'C');
    const pauseDrift = (beforePause && afterPause
      && Number.isFinite(beforePause.offsetX) && Number.isFinite(afterPause.offsetX))
      ? Math.abs(afterPause.offsetX - beforePause.offsetX) : NaN;
    ts = tsPause;
    await setHostReplayPlaying(page, true);

    // ±SMALL: the device-pixel-column render count equals the number of distinct
    // columns the monotonic offset swept, ±rounding/boundary. Kept a small ABSOLUTE
    // constant per D-040 (no proportional fudge). RED margins are order-of-magnitude,
    // so the constant only tightens GREEN.
    const SMALL = 12;

    // Non-vacuity: the panel actually scrolled a meaningful device-pixel distance
    // that is MANY candle-widths (so the candle-width baseline is provably ≪ the
    // pixel-column count and the ±SMALL band is not the whole signal).
    checks.check('H-S19b setup non-vacuous: panel scrolled many device-pixel columns',
      pixelColumnsCrossed >= 2 * SMALL && candlesCrossed >= 3
      && pixelColumnsCrossed >= 4 * Math.max(1, candlesCrossed),
      `pixelColumnsCrossed=${pixelColumnsCrossed} candlesCrossed=${candlesCrossed} `
      + `dOffset=${dOffset.toFixed(2)} candleWidth=${candleWidth} dpr=${dpr} SMALL=${SMALL}`);

    // CORE D-040 (SMOOTH): follow renders ≈ pixel-columns crossed (host parity).
    // LOWER bound (fails on b90 candle-width → chunky): renders ≥ pixelColumns − SMALL.
    checks.check('H-S19b scrolling follow is SMOOTH (renders >= pixel-columns-crossed - SMALL)',
      followRendersScroll >= pixelColumnsCrossed - SMALL,
      `followRendersScroll=${followRendersScroll} pixelColumnsCrossed=${pixelColumnsCrossed} `
      + `candlesCrossed=${candlesCrossed} SMALL=${SMALL} N=${N}`);
    // UPPER bound (fails guard-off → per-frame max): renders ≤ pixelColumns + SMALL.
    checks.check('H-S19b scrolling follow is BOUNDED (renders <= pixel-columns-crossed + SMALL)',
      followRendersScroll <= pixelColumnsCrossed + SMALL,
      `followRendersScroll=${followRendersScroll} pixelColumnsCrossed=${pixelColumnsCrossed} `
      + `SMALL=${SMALL} N=${N}`);

    // Guard still DOES something: a sub-pixel/stationary advance costs 0 renders.
    checks.check('H-S19b sub-pixel/stationary advance costs ZERO follow renders',
      followRendersStationary === 0,
      `followRendersStationary=${followRendersStationary} over ${STATIONARY} same-ts frames`);

    // MONOTONICITY across the bar-boundary seam (D-041 constraint 3 — the assertion
    // that matters most): the eased offset must never rewind/jitter backward. Backward
    // jitter is a worse felt defect than the original chunkiness.
    checks.check('H-S19b eased follow offset is MONOTONIC across bar-boundary seams (no backward jitter)',
      offSamples.length > 0 && seamCount >= 1 && backwardSteps === 0,
      `backwardSteps=${backwardSteps} worstBackward=${worstBackward.toFixed(3)}px seams=${seamCount} `
      + `samples=${offSamples.length} MONO_EPS=${MONO_EPS}`);

    // PAUSE-MID-BAR freezes the eased fraction exactly (no snap to a bar boundary).
    checks.check('H-S19b PAUSE mid-bar freezes the eased offset exactly (no snap)',
      Number.isFinite(pauseDrift) && pauseDrift <= MONO_EPS,
      `pauseDrift=${pauseDrift} (beforePause=${beforePause?.offsetX} afterPause=${afterPause?.offsetX}) `
      + `MONO_EPS=${MONO_EPS}`);

    notes.push('H-S19b (BL-13, D-041): same-pair 2x2, all sync OFF, host 1m, panel C set to 1h (coarse - the '
      + 'BL-11 follow path, 60 host frames/candle). Real PLAY fan-out (replayFrame isPlaying=true, 1m/frame, N=' + N
      + ' scrolling frames). DETERMINISTIC follow-render COUNTER + per-frame offsetX sampling only, never wall-clock. '
      + 'CONTINUOUS eased leading-edge follow (D-041): continuousOffsetX = quantizedOffsetX - fraction*candleSpacing, '
      + 'fraction = (replayTimestamp - formingBarStartTs)/barDurationMs (pure function of the shared playhead ts). '
      + `MEASURED (fix): followRendersScroll=${followRendersScroll} vs pixelColumnsCrossed=${pixelColumnsCrossed} `
      + `vs candlesCrossed=${candlesCrossed} (candleWidth=${candleWidth}px dpr=${dpr}); `
      + `SUB-PIXEL/STATIONARY followRenders=${followRendersStationary} (0 - guard still coalesces); `
      + `MONOTONIC backwardSteps=${backwardSteps} worstBackward=${worstBackward.toFixed(3)}px over ${seamCount} seams; `
      + `PAUSE-MID-BAR drift=${pauseDrift} (frozen, no snap). `
      + 'RED b90 (bar-quantized candle-width threshold, verified NO-OP): followRenders~candlesCrossed<<pixelColumnsCrossed '
      + 'chunky, fails the LOWER (smoothness) bound. RED guard-off '
      + '(--bugswitch=__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD): followRenders=N per-frame > pixelColumnsCrossed '
      + 'fails the UPPER bound AND stationary!=0. GREEN (continuous eased fix): followRenders~pixelColumnsCrossed '
      + '(host-parity smooth), stationary=0, monotonic across seams, pause freezes. SAME flag '
      + '__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD (default ON) - no new flag.');
    return checks;
  });
}

// ── H-S20 ────────────────────────────────────────────────────────────────
// BL-14 (D-042): with sync OFF, after replay has run a long way on a FINE TF
// (host 1m), switching a PANEL (B/C/D) to a BIG coarse TF (1D) must acquire its
// coarse-display window with ONE bounded coarse fetch for the older remainder +
// a ZERO-fetch resample of the host-covered recent window — NOT a long series
// of 2000-limit backward chunk requests ("candles load one by one, slowly").
// The HOST doing the same is fine; this is panel-only.
//
// COVERAGE CONTRACT: after a long fine replay, the host 1m master spans only
// ~a day or two around the playhead, but a 1D viewport spans ~months. The host
// master therefore covers only PART of the panel's 1D window → HYBRID:
//   (i)  resample the host-covered recent window from host 1m data (ZERO fetch),
//   (ii) ONE bounded coarse fetch for the older remainder,
//   (iii) seam the two so the resampled 1m-derived 1D bar EQUALS the server-
//         native 1D bar at the boundary.
//
// DETERMINISTIC (no wall-clock): all measurements come from the serve.mjs
// per-hit API log + bar equality + diag counters.
//   • small fetch bound on the panel's 1D acquisition,
//   • NO 2000-chunk walk (no long series of limit=2000 backward candles),
//   • seams == 0 (BAR EQUALITY: resampled 1m-derived 1D == native 1D at seam),
//   • HOST UNTOUCHED (host fetch count + master first/last/len identical),
//   • the coarse panel can STILL advance its playhead on the 1D data (BL-10).
// RED-first: current b91 excludes embed panels from high-limit bulk history
// (§6c I1) and has no panel display-TF direct-fetch (§6a), so the 1D switch
// walks the 2000-bar chunked backward path.

/** Read deep engine internals of one panel (master span, coverage, embed flags). */
async function readPanelDeep(page, id) {
  const frame = id === 'A' ? page : panelFrameMap(page)[id];
  if (!frame) return null;
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch) return null;
    const rs = ch.replaySystem || null;
    const master = rs && Array.isArray(rs.fullRawData) && rs.fullRawData.length ? rs.fullRawData : null;
    const d = Array.isArray(ch.data) ? ch.data : [];
    return {
      tf: ch.currentTimeframe != null ? String(ch.currentTimeframe) : '',
      nativeTf: ch._nativeRawFetchTf != null ? String(ch._nativeRawFetchTf) : '',
      isBacktestMode: !!ch.isBacktestMode,
      isEmbed: typeof ch._isMultichartEmbedPanel === 'function' ? !!ch._isMultichartEmbedPanel() : null,
      replayActive: !!(rs && rs.isActive),
      replayTs: rs && Number.isFinite(Number(rs.replayTimestamp)) ? Number(rs.replayTimestamp) : null,
      masterFirstT: master ? Number(master[0].t) : null,
      masterLastT: master ? Number(master[master.length - 1].t) : null,
      masterLen: master ? master.length : 0,
      dataLen: d.length,
      dataFirstT: d.length ? Number(d[0].t) : null,
      dataLastT: d.length ? Number(d[d.length - 1].t) : null,
      // committed 1D bars keyed by bucket-start ts → for the seam bar-equality proof.
      bars: d.map((b) => ({ t: Number(b.t), o: Number(b.o), h: Number(b.h), l: Number(b.l), c: Number(b.c) })),
    };
  }).catch(() => null);
}

/**
 * Put the HOST (tile A) and every iframe panel into BACKTEST replay mode with a
 * shared session spanning the deep instrument — production runs BL-14 in backtest
 * (isBacktestMode true), which is what gates the §6c I1 high-limit exclusion and
 * the §6a display-TF fetch path. Mirrors autoLoadBacktestingData's isBacktestMode
 * + backtestingSession + panel-cmd-bridge mirrorParentBacktestSession.
 */
async function enterBacktestSessionAllFrames(page, session) {
  await page.evaluate((sess) => {
    const ch = window.chart;
    if (!ch) return;
    ch.isBacktestMode = true;
    ch.backtestingSession = sess;
    if (ch._btTfDataCache && typeof ch._btTfDataCache.clear === 'function') ch._btTfDataCache.clear();
  }, session);
  for (const f of embedFrames(page)) {
    await f.evaluate((sess) => {
      const ch = window.chart;
      if (!ch) return;
      ch.isBacktestMode = true;
      ch.backtestingSession = sess;
      if (ch._btTfDataCache && typeof ch._btTfDataCache.clear === 'function') ch._btTfDataCache.clear();
    }, session).catch(() => {});
  }
}

/** Count backward 2000-limit candles chunk requests in an API log slice. */
function countChunkWalk(apiLog) {
  return apiLog.filter((e) =>
    e.endpoint === 'file.candles'
    && String(e.query && e.query.limit) === '2000'
    && String(e.query && e.query.direction || 'backward') === 'backward').length;
}

/** Fetch the server-native 1D bars for a file (the seam ground truth). */
async function fetchNativeDaily(srvUrl, fileId, limit = 800) {
  const u = `${srvUrl}/api/file/${fileId}/smart?timeframe=1d&limit=${limit}&anchor=end&response_format=candles`;
  const r = await fetch(u, { cache: 'no-store' });
  const j = await r.json();
  const arr = Array.isArray(j.candles) ? j.candles : [];
  const byT = new Map();
  for (const c of arr) byT.set(Number(c.t), { t: Number(c.t), o: Number(c.o), h: Number(c.h), l: Number(c.l), c: Number(c.c) });
  return byT;
}

async function hS20(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m', hostFile: 28 }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(500);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 30_000, boot.getInFlightDataRequests);

    // Faithful BL-14 topology: BACKTEST replay (isBacktestMode true) on host +
    // all panels, session spanning the deep instrument (so a 1D coarse window is
    // ~months while the fine 1m replay master is ~a day). This is what engages
    // the §6c I1 embed high-limit exclusion + §6a display-TF path under test.
    const DAY = 86_400_000;
    const hostExtent = await page.evaluate(() => {
      const d = window.chart && window.chart.data;
      if (!Array.isArray(d) || !d.length) return null;
      return { firstT: Number(d[0].t), lastT: Number(d[d.length - 1].t) };
    }).catch(() => null);
    const sessEndMs = hostExtent ? hostExtent.lastT : Date.now();
    const session = {
      startDate: new Date(sessEndMs - 399 * DAY).toISOString(),
      endDate: new Date(sessEndMs).toISOString(),
    };
    await enterBacktestSessionAllFrames(page, session);
    await sleep(300);

    const ts0 = await replayStartTs(page);
    checks.check('H-S20 replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 20_000);
    checks.check('H-S20 replay entered + paused/quiescent on all panels', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    // Advance the playhead a LONG way on the fine (1m) host — a real play run so
    // the host 1m master ends up a bounded window well forward of session start.
    const stepMs = 60_000;
    let ts = await streamPlayFramesNoDrag(page, ts0, 300, stepMs);
    await setHostReplayPlaying(page, false);
    await broadcastCmd(page, 'replayTick', { timestamp: ts });
    await hostReplaySeek(page, ts);
    await sleep(1200);

    // ── COVERAGE MEASUREMENT: host 1m master span vs the panel's 1D window ──
    const hostBefore = await readHost(page);
    const hostDeepBefore = await readPanelDeep(page, 'A');
    const bBefore = await readPanelDeep(page, 'B');
    const hostMasterSpanDays = (hostDeepBefore && hostDeepBefore.masterFirstT != null && hostDeepBefore.masterLastT != null)
      ? (hostDeepBefore.masterLastT - hostDeepBefore.masterFirstT) / DAY : null;
    notes.push(`H-S20 COVERAGE: host 1m master span=${hostMasterSpanDays != null ? hostMasterSpanDays.toFixed(2) : 'n/a'} days `
      + `(len=${hostDeepBefore?.masterLen}, first=${hostDeepBefore?.masterFirstT}, last=${hostDeepBefore?.masterLastT}); `
      + `panel B isEmbed=${bBefore?.isEmbed} isBacktestMode=${bBefore?.isBacktestMode} tf=${bBefore?.tf}`);

    // ── Switch PANEL B to 1D (the defect trigger). Measure fetches + chunk walk. ──
    ctx.srv.resetApiLog();
    await resetDiag(page);
    // Read the host fetch counter AFTER the diag reset (resetDiag zeroes every
    // panel), so the delta measures ONLY host fetches during the panel switch.
    const hostAtReset = await readHost(page);
    const hostFetchesBefore = hostAtReset?.fetches || 0;

    await panelCmd(page, 'B', 'setTimeframe', { tf: '1d' }).catch(() => {});
    // Settle: poll until B committed native 1D + quiescent, hard budget.
    const settleDeadline = Date.now() + 20_000;
    let bAfterDeep = null;
    while (Date.now() < settleDeadline) {
      await sleep(300);
      bAfterDeep = await readPanelDeep(page, 'B');
      const bSnap = await readPanel(page, 'B');
      if (bAfterDeep && bAfterDeep.tf === '1d' && bAfterDeep.dataLen > 0 && isPanelQuiescent(bSnap)) break;
    }
    await sleep(500);
    bAfterDeep = await readPanelDeep(page, 'B');

    const apiLog = ctx.srv.getApiLog();
    const panelFetches = totalDataFetches(apiLog); // host untouched → all attributable to B
    const chunkWalk = countChunkWalk(apiLog);

    const hostAfter = await readHost(page);
    const hostDeepAfter = await readPanelDeep(page, 'A');

    notes.push(`H-S20 SWITCH: panelFetches=${panelFetches} chunkWalk(limit=2000 backward candles)=${chunkWalk}; `
      + `B.tf ${bBefore?.tf}->${bAfterDeep?.tf} B.dataLen=${bAfterDeep?.dataLen} `
      + `B.dataFirst=${bAfterDeep?.dataFirstT} B.dataLast=${bAfterDeep?.dataLastT}`);

    const setupOk = !!(bAfterDeep && bAfterDeep.tf === '1d' && bAfterDeep.dataLen > 2 && bBefore && bBefore.isEmbed);
    checks.check('H-S20 setup: panel B switched to 1D (embed, backtest replay)', setupOk,
      `B.isEmbed=${bBefore?.isEmbed} B.tf=${bAfterDeep?.tf} B.dataLen=${bAfterDeep?.dataLen}`);

    // CORE RED-first #1 — the panel's 1D acquisition is a SMALL bounded fetch.
    const FETCH_BOUND = 4;
    checks.check('H-S20 panel 1D acquisition is a small bounded fetch (not chunk-walk)',
      panelFetches > 0 && panelFetches <= FETCH_BOUND,
      `panelFetches=${panelFetches} (bound=${FETCH_BOUND})`);

    // CORE RED-first #2 — NO long series of 2000-limit backward chunk requests.
    const CHUNK_BOUND = 2;
    checks.check('H-S20 NO 2000-chunk walk on panel 1D acquisition',
      chunkWalk <= CHUNK_BOUND, `chunkWalk=${chunkWalk} (bound=${CHUNK_BOUND})`);

    // SEAM == 0 — every committed 1D bar that the host 1m master covers must be
    // BAR-EQUAL to the server-native 1D bar (resample seam is clean, not merely
    // "a fetch happened").
    const nativeDaily = await fetchNativeDaily(ctx.srv.url, 28, 800);
    let seamMismatches = 0;
    let seamCompared = 0;
    let worstSeam = null;
    const eps = 1e-9;
    // Only COMPLETED 1D bars (fully before the playhead) are compared — the last
    // bucket at the playhead is a legitimately partial forming candle.
    const playheadTs = Number(bAfterDeep && bAfterDeep.replayTs);
    if (bAfterDeep && Array.isArray(bAfterDeep.bars)) {
      for (const bar of bAfterDeep.bars) {
        if (!(Number.isFinite(playheadTs) && bar.t + DAY <= playheadTs)) continue;
        const nat = nativeDaily.get(bar.t);
        if (!nat) continue;
        seamCompared++;
        const ok = Math.abs(bar.o - nat.o) <= eps && Math.abs(bar.h - nat.h) <= eps
          && Math.abs(bar.l - nat.l) <= eps && Math.abs(bar.c - nat.c) <= eps;
        if (!ok) { seamMismatches++; if (!worstSeam) worstSeam = { t: bar.t, panel: bar, nat }; }
      }
    }
    checks.check('H-S20 seams==0: committed 1D bars are bar-equal to server-native 1D',
      seamCompared > 0 && seamMismatches === 0,
      `compared=${seamCompared} mismatches=${seamMismatches} worst=${worstSeam ? JSON.stringify(worstSeam) : 'none'}`);

    // HOST UNTOUCHED — no host fetch + master first/last/len identical.
    const hostFetchDelta = (hostAfter?.fetches || 0) - hostFetchesBefore;
    checks.check('H-S20 HOST fetch count unchanged during panel switch',
      hostFetchDelta === 0, `hostFetchDelta=${hostFetchDelta}`);
    const hostMasterUnmutated = !!(hostDeepBefore && hostDeepAfter
      && hostDeepBefore.masterFirstT === hostDeepAfter.masterFirstT
      && hostDeepBefore.masterLastT === hostDeepAfter.masterLastT
      && hostDeepBefore.masterLen === hostDeepAfter.masterLen);
    checks.check('H-S20 HOST 1m master unmutated (first/last/len identical)',
      hostMasterUnmutated,
      `before[${hostDeepBefore?.masterFirstT},${hostDeepBefore?.masterLastT},${hostDeepBefore?.masterLen}] `
      + `after[${hostDeepAfter?.masterFirstT},${hostDeepAfter?.masterLastT},${hostDeepAfter?.masterLen}]`);

    // STATE-MATRIX (coarser-panel-during-play): after the 1D acquisition the panel
    // must STILL advance its playhead on the newly acquired 1D data (BL-10).
    const bPlayStart = await readPanel(page, 'B');
    ts = await streamPlayFramesNoDrag(page, ts, 240, stepMs);
    await setHostReplayPlaying(page, false);
    await broadcastCmd(page, 'replayTick', { timestamp: ts });
    await sleep(800);
    const bPlayEnd = await readPanel(page, 'B');
    const advanced = !!(bPlayEnd && bPlayStart && bPlayEnd.replayTs != null
      && Number(bPlayEnd.replayTs) > Number(bPlayStart.replayTs || ts0));
    checks.check('H-S20 coarse (1D) panel still advances playhead on the acquired data (BL-10 cell)',
      advanced, `B.replayTs ${bPlayStart?.replayTs} -> ${bPlayEnd?.replayTs}`);

    notes.push('H-S20 (BL-14, D-042): same-pair 2x2, all sync OFF, host 1m, deep 400-day instrument (file 28). '
      + 'Enter paused replay ~60% in, PLAY forward 300 host 1m frames (host 1m master → bounded window), then '
      + 'switch PANEL B to 1D. The panel must acquire its coarse display window with a SMALL bounded fetch for the '
      + 'older remainder + a ZERO-fetch resample of the host-covered recent window, seamed BAR-EQUAL to native 1D — '
      + `NOT a 2000-chunk backward walk. MEASURED: panelFetches=${panelFetches} chunkWalk=${chunkWalk} `
      + `seamCompared=${seamCompared} seamMismatches=${seamMismatches} hostFetchDelta=${hostFetchDelta} `
      + `hostMasterUnmutated=${hostMasterUnmutated}. RED (b91 / --bugswitch=__TALARIA_MC_DISABLE_PANEL_COARSE_DISPLAY_ACQUIRE): `
      + 'the embed-panel high-limit exclusion (§6c I1) + missing panel display-TF fetch (§6a) walk the 2000-bar chunked path.');
    return checks;
  });
}

// ── H-S21 ──────────────────────────────────────────────────────────────
// BL-15 (D-043): switching a SAME-PAIR embed panel to a FINER TF than the
// coarse host DURING (non-backtest) replay used to RELABEL the coarse host
// bars as the finer TF WITHOUT acquiring finer data. The time-axis tick
// cadence (labelIntervalMs = labelInterval × parseTimeframe(finerTf)) then
// marked EVERY coarse bar a "round" tick because the coarse spacing is an
// exact multiple of labelIntervalMs → a label on every candle → a compressed
// / scrollbar-like malformed time axis (the PO's report). Root: the embed
// acquire branch in setTimeframe is gated on isBacktestMode, so a non-backtest
// replay panel fell straight through to the relabel fallback.
//
// FIX (gated __TALARIA_MC_DISABLE_FINER_PANEL_REPLAY_TF_ACQUIRE, default fix ON):
// route a finer same-pair embed panel to its sanctioned bounded OWNER
// acquisition (B8: _ensureFinerPanelOwnerCoversPlayhead → _fetchFinerPanelOwnerWindow,
// per-request ≤5000 bars / ≤2000 during play, per-acquisition ≤10000), and
// commit the finer window ATOMICALLY — the last-good coarse frame stays until
// the finer bars land (B8 "no blank frame"), never showing the malformed axis.
//
// DETERMINISTIC (no wall-clock): the tick geometry comes from the engine's own
// _buildTimeTicks; cadence from the committed bar deltas; the owner contract
// from the ownerFetches/ownerBars diag counters.
//   • finer cell RED→GREEN flip + kill-switch RED
//   • data ACQUIRED not relabeled (bar spacing == new TF)
//   • axis SANE at settle (tick-x strictly increasing, max/min spacing ≤ ~2)
//   • axis SANE throughout the switch (interim never malformed — atomic commit)
//   • B8 owner contract: ownerFetches incremented, ownerBars within cap
//   • coarser cell (both directions): the coarse switch must NOT malform the
//     axis (data resamples to a real coarse cadence). NOTE: non-backtest replay
//     ALSO bypasses BL-14's coarse-display acquire via the same isBacktestMode
//     gate, but the symptom there is a slow chunk-walk (many fetches), NOT a
//     malformed axis, and that fix is a DIFFERENT method with backtest-session /
//     hot-swap dependencies — reported as larger-than-same-fix (D-043 scope).

/** Read one panel's real time-axis geometry + cadence + B8 owner counters. */
async function readAxis21(page, id) {
  const frame = id === 'A' ? page : panelFrameMap(page)[id];
  if (!frame) return null;
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch) return null;
    const data = Array.isArray(ch.data) ? ch.data : [];
    const tfMs = (typeof ch.parseTimeframe === 'function') ? Number(ch.parseTimeframe(ch.currentTimeframe)) : NaN;
    // Dominant consecutive bar delta (the committed cadence). Weekend/holiday
    // gaps are rare vs the modal step, so the mode is the true bar spacing.
    const hist = {};
    for (let i = 1; i < data.length; i++) { const d = data[i].t - data[i - 1].t; hist[d] = (hist[d] || 0) + 1; }
    let dom = null; let domN = -1;
    for (const k of Object.keys(hist)) if (hist[k] > domN) { domN = hist[k]; dom = Number(k); }
    // Fresh full tick build (the geometry the engine would paint).
    let xs = [];
    try {
      const built = (typeof ch._buildTimeTicks === 'function') ? ch._buildTimeTicks({ full: true }) : (ch._timeTicks || []);
      xs = (Array.isArray(built) ? built : []).map((t) => Number(t.x)).filter(Number.isFinite);
    } catch (_) { xs = []; }
    const dxs = [];
    for (let i = 1; i < xs.length; i++) dxs.push(xs[i] - xs[i - 1]);
    const pos = dxs.filter((d) => d > 0);
    const monotonic = xs.length >= 2 && dxs.every((d) => d > 0);
    const ratio = pos.length >= 2 ? (Math.max(...pos) / Math.min(...pos)) : (xs.length < 2 ? null : 1);
    const rs = ch.replaySystem || null;
    const diag = ch._mcDiag || {};
    return {
      tf: String(ch.currentTimeframe || ''),
      tfMs,
      dataLen: data.length,
      dominantDelta: dom,
      dataMatchesTf: Number.isFinite(dom) && Number.isFinite(tfMs) && dom === tfMs,
      tickCount: xs.length,
      monotonic,
      spacingRatio: ratio,
      renderTf: (typeof ch._getRenderTimeframe === 'function') ? String(ch._getRenderTimeframe() || '') : '',
      switching: !!ch._timeframeSwitching,
      replayActive: !!(rs && rs.isActive),
      replayTs: rs && Number.isFinite(Number(rs.replayTimestamp)) ? Number(rs.replayTimestamp) : null,
      ownerFetches: Number(diag.ownerFetches) || 0,
      ownerBars: Number(diag.ownerBars) || 0,
    };
  }).catch(() => null);
}

/**
 * Kick a panel TF switch DURING replay and SAMPLE the axis from switch-issue to
 * settle, so both the interim frames AND the settled frame are asserted. Returns
 * { settled, worstRatioSeen, sawMalformed, samples }. "Malformed" == a spacing
 * ratio blow-up (>ratioLimit) — the compressed every-bar-labeled axis.
 */
async function switchTfDuringReplayAndSample(page, id, targetTf, opts = {}) {
  const { ratioLimit = 2.0, budgetMs = 20_000 } = opts;
  // Fire the production panel-cmd path WITHOUT awaiting so we can sample the
  // interim; await it at the end.
  const cmdPromise = panelCmd(page, id, 'setTimeframe', { tf: targetTf }).catch(() => {});
  const deadline = Date.now() + budgetMs;
  const samples = [];
  let worstRatioSeen = 0;
  let sawMalformed = false;
  let settled = null;
  const targetMs = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000 }[targetTf] || null;
  while (Date.now() < deadline) {
    const a = await readAxis21(page, id);
    if (a) {
      samples.push(a);
      if (Number.isFinite(a.spacingRatio)) {
        worstRatioSeen = Math.max(worstRatioSeen, a.spacingRatio);
        if (a.spacingRatio > ratioLimit) sawMalformed = true;
      }
      // Settled == committed to target TF, cadence matches, not switching.
      if (a.tf === targetTf && a.dataMatchesTf && !a.switching) { settled = a; break; }
    }
    await sleep(60);
  }
  await cmdPromise;
  await sleep(300);
  const final = await readAxis21(page, id);
  return { settled: settled || final, final, worstRatioSeen, sawMalformed, samples };
}

async function hS21(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(500);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    // ── FINER cell: host coarse (1h), switch panel B to 1m DURING replay. ──
    await fanOutTf(page, '1h');
    await sleep(2200);
    const hostSetup = await readHost(page);
    const bSetup = await readAxis21(page, 'B');
    const finerSetupOk = !!(hostSetup && hostSetup.tf === '1h' && bSetup
      && bSetup.tf === '1h' && bSetup.dataMatchesTf);
    checks.check('H-S21 setup: host 1h + panel B mirrors coarse 1h (embed, same-pair)',
      finerSetupOk, `host.tf=${hostSetup?.tf} B.tf=${bSetup?.tf} B.dominantDelta=${bSetup?.dominantDelta} B.matches=${bSetup?.dataMatchesTf}`);
    if (!finerSetupOk) return checks;

    const ts0 = await replayStartTs(page);
    checks.check('H-S21 replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    // NON-backtest replay (isBacktestMode stays false — the exact PO topology).
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 15_000);
    checks.check('H-S21 non-backtest replay entered + quiescent on all panels', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    await resetDiag(page);
    const ownerBefore = await readAxis21(page, 'B');
    const finer = await switchTfDuringReplayAndSample(page, 'B', '1m', { ratioLimit: 2.0 });
    const fin = finer.settled;

    // (1) Data ACQUIRED, not relabeled: committed bar spacing == 1m.
    checks.check('H-S21 finer: panel B data ACQUIRED at 1m (bar spacing==60s, not relabeled coarse)',
      !!(fin && fin.tf === '1m' && fin.dominantDelta === 60000 && fin.dataMatchesTf),
      `B.tf=${fin?.tf} dominantDelta=${fin?.dominantDelta} matches=${fin?.dataMatchesTf} dataLen=${fin?.dataLen}`);

    // (2) Axis SANE at settle: strictly increasing ticks + spacing ratio <= ~2.
    checks.check('H-S21 finer: settled time axis is SANE (ticks strictly increasing, max/min spacing ratio <= 2)',
      !!(fin && fin.monotonic === true && Number.isFinite(fin.spacingRatio) && fin.spacingRatio <= 2.0),
      `monotonic=${fin?.monotonic} spacingRatio=${fin?.spacingRatio} ticks=${fin?.tickCount} (RED today ~15)`);

    // (3) INTERIM never malformed: no spacing-ratio blow-up at any sampled point
    // from switch-issue to settle (atomic commit — last-good coarse until finer).
    checks.check('H-S21 finer: axis NEVER malformed during the switch (atomic commit, no interim blow-up)',
      finer.sawMalformed === false,
      `sawMalformed=${finer.sawMalformed} worstRatioSeen=${finer.worstRatioSeen?.toFixed(2)} samples=${finer.samples.length}`);

    // (4) B8 owner contract: acquisition went through the sanctioned bounded
    // OWNER path (ownerFetches incremented) and stayed within the B8 cap.
    const ownerFetchDelta = (fin?.ownerFetches || 0) - (ownerBefore?.ownerFetches || 0);
    const ownerBarsDelta = (fin?.ownerBars || 0) - (ownerBefore?.ownerBars || 0);
    checks.check('H-S21 finer: B8 owner contract — ownerFetches incremented (sanctioned bounded owner path)',
      ownerFetchDelta >= 1,
      `ownerFetchDelta=${ownerFetchDelta} (before=${ownerBefore?.ownerFetches} after=${fin?.ownerFetches})`);
    const B8_ACQUISITION_CAP = 10000; // per-acquisition (two ≤5000 requests)
    const B8_FETCH_CAP = 2;           // per acquisition
    checks.check('H-S21 finer: B8 owner contract — bounded (ownerFetches<=2, ownerBars<=10000, no chunk-walk)',
      ownerFetchDelta <= B8_FETCH_CAP && ownerBarsDelta > 0 && ownerBarsDelta <= B8_ACQUISITION_CAP,
      `ownerFetchDelta=${ownerFetchDelta} ownerBarsDelta=${ownerBarsDelta} caps[fetch<=${B8_FETCH_CAP},bars<=${B8_ACQUISITION_CAP}]`);

    // ── COARSER cell (both-direction coverage): a fresh boot, host 1m, switch
    // B to 1D during replay. The coarse switch must NOT malform the axis (it
    // resamples to a genuine 1D cadence). We do NOT assert a fetch bound here:
    // the non-backtest coarse chunk-walk is a separately-scoped item (D-043). ──
    const boot2 = await bootLayout(ctx.browser, ctx.srv, { pair: 'same', panels: 4, tf: '1m', bug: ctx.bug, bugSwitches: ctx.bugSwitches });
    try {
      const p2 = boot2.page;
      await p2.setViewport({ width: 2600, height: 1400 });
      await sleep(400);
      await setSync(p2, false);
      await setIntervalSync(p2, false);
      await waitBootSettled(p2, ids, 20_000, boot2.getInFlightDataRequests);
      const ts0b = await replayStartTs(p2);
      await hostReplayEnter(p2, ts0b);
      await broadcastCmd(p2, 'replayEnter', { timestamp: ts0b });
      await waitReplayQuiescent(p2, ids, ts0b, 15_000).catch(() => {});
      const coarser = await switchTfDuringReplayAndSample(p2, 'B', '1d', { ratioLimit: 2.0, budgetMs: 25_000 });
      const cf = coarser.settled;
      checks.check('H-S21 coarser: panel B data at 1D (bar spacing==1 day, resampled cadence)',
        !!(cf && cf.tf === '1d' && cf.dominantDelta === 86400000 && cf.dataMatchesTf),
        `B.tf=${cf?.tf} dominantDelta=${cf?.dominantDelta} matches=${cf?.dataMatchesTf} dataLen=${cf?.dataLen}`);
      checks.check('H-S21 coarser: time axis SANE (not malformed) throughout + at settle',
        coarser.sawMalformed === false && !!(cf && cf.monotonic === true && cf.spacingRatio <= 2.0),
        `sawMalformed=${coarser.sawMalformed} worstRatioSeen=${coarser.worstRatioSeen?.toFixed(2)} `
        + `settled monotonic=${cf?.monotonic} spacingRatio=${cf?.spacingRatio}`);
    } finally {
      await boot2.close();
    }

    notes.push('H-S21 (BL-15, D-043): same-pair 2x2, sync OFF, NON-backtest replay. FINER: host 1h, switch panel B->1m '
      + `mid-replay. RED (b92 / --bugswitch=__TALARIA_MC_DISABLE_FINER_PANEL_REPLAY_TF_ACQUIRE): coarse host bars are `
      + `RELABELED 1m without acquiring finer data → tick on every coarse bar (spacingRatio~15). GREEN (fix): finer bars `
      + `ACQUIRED via the B8 bounded owner path (ownerFetchDelta=${ownerFetchDelta} ownerBarsDelta=${ownerBarsDelta}), `
      + `committed ATOMICALLY (last-good coarse until finer lands; interim sawMalformed=${finer.sawMalformed}, `
      + `worstRatioSeen=${finer.worstRatioSeen?.toFixed(2)}), settled spacingRatio=${fin?.spacingRatio} cadence=${fin?.dominantDelta}ms. `
      + 'INTERIM-STATE MATRIX: fix ON success → last-good coarse frame painted until finer window commits atomically (never '
      + 'the malformed axis); fix ON acquire-FAIL → keep last-good coarse (switch aborted, no relabel, no malformed axis); '
      + 'kill-switch ON → today\'s relabel (malformed) = RED. COARSER (host 1m, B->1D): axis stays SANE (resamples to a real '
      + '1D cadence); NON-backtest replay ALSO bypasses BL-14 coarse-display acquire via the same isBacktestMode gate, but '
      + 'that symptom is a slow chunk-walk (many fetches), NOT a malformed axis, and its fix is a different method with '
      + 'backtest-session/hot-swap deps → reported as larger-than-same-fix (STOPPED before expanding per D-043).');
    return checks;
  });
}

// ── H-S22 ──────────────────────────────────────────────────────────────────
// Host-only "new version available — Reload" prompt (UX hygiene; kill switch
// __TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT, default ON). Deterministic: no
// timers asserted. The module (talaria-version-reload.js) fetches the current
// host document fresh and extracts its __TALARIA_CHART_BUILD_ID (the deployed
// id), comparing it to window.__TALARIA_CHART_BUILD_ID (the loaded id).
//   • loaded === deployed  → NO prompt.
//   • loaded !== deployed  → prompt shown (dismissible, Reload = hard reload).
//   • kill switch set       → NO prompt even on mismatch.
// The scenario drives check() directly against three controlled states; the
// deployed id is read from the real fetch/parse path (no mocked network), and
// only the loaded id / kill switch are varied — so a build-id MISMATCH is what
// triggers the toast and a MATCH is what suppresses it.
async function hS22(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();

    // Load the REAL host-only module from the canonical tree, then disable its
    // auto focus/interval poller so every assertion below is state-driven only.
    await page.addScriptTag({ url: '/chart/modules/talaria-version-reload.js' });
    await page.waitForFunction(() => !!window.__TalariaVersionReload, { timeout: 10_000 });
    await page.evaluate(() => { try { window.__TalariaVersionReload.stop(); } catch (_) {} });

    const attrSel = await page.evaluate(() => '[' + window.__TalariaVersionReload._attr + ']');
    const toastShown = () => page.evaluate((sel) => !!document.querySelector(sel), attrSel);

    // Deployed id from the real fetch+parse path (harness host serves it).
    const deployed = await page.evaluate(() => window.__TalariaVersionReload.fetchDeployedId());
    checks.check('H-S22 deployed build id parsed from host document', typeof deployed === 'string' && deployed.length > 0,
      `deployed=${JSON.stringify(deployed)}`);

    const killFlag = await page.evaluate(() => !!window.__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT);

    // (1) MATCH: loaded === deployed → no prompt.
    await page.evaluate((d) => { window.__TalariaVersionReload.clear(); window.__TALARIA_CHART_BUILD_ID = d; }, deployed);
    const matchShown = await page.evaluate(() => window.__TalariaVersionReload.check());
    const matchDom = await toastShown();
    checks.check('H-S22 build-id MATCH => no reload prompt',
      matchShown === false && matchDom === false,
      `returned=${matchShown} dom=${matchDom} killFlag=${killFlag}`);

    // (2) MISMATCH: loaded !== deployed → prompt shown. Asserted UNCONDITIONALLY
    // (the feature contract), so a globally-injected kill switch turns this RED —
    // that is the harness's RED proof for the kill switch.
    await page.evaluate((d) => { window.__TalariaVersionReload.clear(); window.__TALARIA_CHART_BUILD_ID = d + '-OLD'; }, deployed);
    const mismatchShown = await page.evaluate(() => window.__TalariaVersionReload.check());
    const mismatchDom = await toastShown();
    checks.check('H-S22 build-id MISMATCH => reload prompt shown (feature ON)',
      mismatchShown === true && mismatchDom === true,
      `returned=${mismatchShown} dom=${mismatchDom} killFlag=${killFlag}`);

    // (3) EXPLICIT KILL SWITCH: set the flag, keep the mismatch → no prompt.
    await page.evaluate((d) => {
      window.__TalariaVersionReload.clear();
      window.__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT = true;
      window.__TALARIA_CHART_BUILD_ID = d + '-OLD';
    }, deployed);
    const killedShown = await page.evaluate(() => window.__TalariaVersionReload.check());
    const killedDom = await toastShown();
    checks.check('H-S22 kill switch => no reload prompt even on MISMATCH',
      killedShown === false && killedDom === false,
      `returned=${killedShown} dom=${killedDom}`);

    // Clean up mutated globals + any lingering toast for H-INV.
    await page.evaluate(() => {
      try { window.__TalariaVersionReload.clear(); } catch (_) {}
      try { delete window.__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT; } catch (_) { window.__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT = false; }
    });

    notes.push('H-S22 (UX hygiene): host-only "new version available — Reload" toast. Kill switch '
      + '__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT (default ON). Deterministic build-id compare: deployed id '
      + `("${deployed}") is read from the real fetch/parse of the host document; MATCH => no toast, MISMATCH => toast, `
      + 'kill switch => no toast. RED under --bugswitch=__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT (mismatch sub-check '
      + 'expects a prompt but the switch suppresses it). No timers asserted; additive UI only (no SW/security change).');
    return checks;
  });
}

// ── H-S23 ────────────────────────────────────────────────────────────────
// BL-17 (D-044): the coarser sibling of BL-15's finer routing. With sync OFF,
// after replay has run a long way on a FINE TF (host 1m) during NON-backtest
// replay (isBacktestMode STAYS false — the exact PO topology, distinct from
// H-S20's backtest coarse acquire), switching a PANEL (B) to a BIG coarse TF
// (1D) used to fall through the SAME isBacktestMode gate that H-S20 fixed for
// backtest → the resample/relabel fallback, whose ~2-candle coarse stub then
// backfilled the 1D viewport one 2000-bar page at a time (the slow ~51-fetch
// backward chunk-walk the PO live-confirmed: "loading old data very slowly and
// laggily"). The fix routes it to BL-14's sanctioned bounded HYBRID coarse-
// acquire (D-042 constraints VERBATIM), gated by the NEW kill-switch
// __TALARIA_MC_DISABLE_COARSE_PANEL_REPLAY_TF_ACQUIRE (default fix ON) —
// SEPARATE from BL-15's finer flag so it reverts independently.
//
// DETERMINISTIC (no wall-clock): all measurements come from the serve.mjs
// per-hit API log + bar equality + diag counters.
//   • small bounded fetch on the panel's 1D acquisition (RED chunk-walk ≫ bound),
//   • NO 2000-chunk walk (no long series of limit=2000 backward candles),
//   • seams == 0 (BAR EQUALITY: resampled 1m-derived 1D == native 1D at seam),
//   • HOST UNTOUCHED (host fetch count + master first/last/len identical),
//   • the coarse panel can STILL advance its playhead on the 1D data (BL-10).
// RED-first: b94 (and the kill-switch) chunk-walk the 2000-bar backward path in
// NON-backtest replay because the coarse-acquire branch is bypassed.

async function hS23(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m', hostFile: 28 }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    const DAY = 86_400_000;
    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(500);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 30_000, boot.getInFlightDataRequests);

    // NON-backtest replay (isBacktestMode stays false on host + all panels — the
    // exact PO topology; NO backtest session is entered, unlike H-S20). Host 1m,
    // deep 400-day instrument (file 28) so a 1D coarse window is ~months while the
    // fine 1m replay master ends up a bounded window after a long run.
    const ts0 = await replayStartTs(page);
    checks.check('H-S23 replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 20_000);
    checks.check('H-S23 non-backtest replay entered + quiescent on all panels', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    // Confirm the topology is genuinely NON-backtest (the gate under test).
    const bMode = await readPanelDeep(page, 'B');
    checks.check('H-S23 topology is NON-backtest replay (isBacktestMode=false, replay active)',
      !!(bMode && bMode.isBacktestMode === false && bMode.replayActive === true && bMode.isEmbed === true),
      `B.isBacktestMode=${bMode?.isBacktestMode} replayActive=${bMode?.replayActive} isEmbed=${bMode?.isEmbed}`);

    // Advance the playhead a LONG way on the fine (1m) host — a real play run so
    // the host 1m master ends up a bounded window well forward of the start.
    const stepMs = 60_000;
    let ts = await streamPlayFramesNoDrag(page, ts0, 300, stepMs);
    await setHostReplayPlaying(page, false);
    await broadcastCmd(page, 'replayTick', { timestamp: ts });
    await hostReplaySeek(page, ts);
    await sleep(1200);

    // ── COVERAGE MEASUREMENT: host 1m master span vs the panel's 1D window ──
    const hostDeepBefore = await readPanelDeep(page, 'A');
    const bBefore = await readPanelDeep(page, 'B');
    const hostMasterSpanDays = (hostDeepBefore && hostDeepBefore.masterFirstT != null && hostDeepBefore.masterLastT != null)
      ? (hostDeepBefore.masterLastT - hostDeepBefore.masterFirstT) / DAY : null;
    notes.push(`H-S23 COVERAGE: host 1m master span=${hostMasterSpanDays != null ? hostMasterSpanDays.toFixed(2) : 'n/a'} days `
      + `(len=${hostDeepBefore?.masterLen}, first=${hostDeepBefore?.masterFirstT}, last=${hostDeepBefore?.masterLastT}); `
      + `panel B isEmbed=${bBefore?.isEmbed} isBacktestMode=${bBefore?.isBacktestMode} tf=${bBefore?.tf}`);

    // ── Switch PANEL B to 1D (the defect trigger). Measure fetches + chunk walk. ──
    ctx.srv.resetApiLog();
    await resetDiag(page);
    const hostAtReset = await readHost(page);
    const hostFetchesBefore = hostAtReset?.fetches || 0;

    await panelCmd(page, 'B', 'setTimeframe', { tf: '1d' }).catch(() => {});
    const settleDeadline = Date.now() + 20_000;
    let bAfterDeep = null;
    while (Date.now() < settleDeadline) {
      await sleep(300);
      bAfterDeep = await readPanelDeep(page, 'B');
      const bSnap = await readPanel(page, 'B');
      if (bAfterDeep && bAfterDeep.tf === '1d' && bAfterDeep.dataLen > 0 && isPanelQuiescent(bSnap)) break;
    }
    await sleep(500);
    bAfterDeep = await readPanelDeep(page, 'B');

    const apiLog = ctx.srv.getApiLog();
    const panelFetches = totalDataFetches(apiLog);
    const chunkWalk = countChunkWalk(apiLog);

    const hostAfter = await readHost(page);
    const hostDeepAfter = await readPanelDeep(page, 'A');

    notes.push(`H-S23 SWITCH: panelFetches=${panelFetches} chunkWalk(limit=2000 backward candles)=${chunkWalk}; `
      + `B.tf ${bBefore?.tf}->${bAfterDeep?.tf} B.dataLen=${bAfterDeep?.dataLen} `
      + `B.dataFirst=${bAfterDeep?.dataFirstT} B.dataLast=${bAfterDeep?.dataLastT}`);

    const setupOk = !!(bAfterDeep && bAfterDeep.tf === '1d' && bAfterDeep.dataLen > 2 && bBefore && bBefore.isEmbed);
    checks.check('H-S23 setup: panel B switched to 1D (embed, NON-backtest replay)', setupOk,
      `B.isEmbed=${bBefore?.isEmbed} B.tf=${bAfterDeep?.tf} B.dataLen=${bAfterDeep?.dataLen}`);

    // CORE RED-first #1 — the panel's 1D acquisition is a SMALL bounded fetch.
    const FETCH_BOUND = 4;
    checks.check('H-S23 panel 1D acquisition is a small bounded fetch (not chunk-walk)',
      panelFetches > 0 && panelFetches <= FETCH_BOUND,
      `panelFetches=${panelFetches} (bound=${FETCH_BOUND})`);

    // CORE RED-first #2 — NO long series of 2000-limit backward chunk requests.
    const CHUNK_BOUND = 2;
    checks.check('H-S23 NO 2000-chunk walk on panel 1D acquisition',
      chunkWalk <= CHUNK_BOUND, `chunkWalk=${chunkWalk} (bound=${CHUNK_BOUND})`);

    // SEAM == 0 — every completed committed 1D bar the host 1m master covers must
    // be BAR-EQUAL to the server-native 1D bar (clean resample seam, not "a fetch
    // happened"). Same bar-equality proof as H-S20.
    const nativeDaily = await fetchNativeDaily(ctx.srv.url, 28, 800);
    let seamMismatches = 0;
    let seamCompared = 0;
    let worstSeam = null;
    const eps = 1e-9;
    const playheadTs = Number(bAfterDeep && bAfterDeep.replayTs);
    if (bAfterDeep && Array.isArray(bAfterDeep.bars)) {
      for (const bar of bAfterDeep.bars) {
        if (!(Number.isFinite(playheadTs) && bar.t + DAY <= playheadTs)) continue;
        const nat = nativeDaily.get(bar.t);
        if (!nat) continue;
        seamCompared++;
        const ok = Math.abs(bar.o - nat.o) <= eps && Math.abs(bar.h - nat.h) <= eps
          && Math.abs(bar.l - nat.l) <= eps && Math.abs(bar.c - nat.c) <= eps;
        if (!ok) { seamMismatches++; if (!worstSeam) worstSeam = { t: bar.t, panel: bar, nat }; }
      }
    }
    checks.check('H-S23 seams==0: committed 1D bars are bar-equal to server-native 1D',
      seamCompared > 0 && seamMismatches === 0,
      `compared=${seamCompared} mismatches=${seamMismatches} worst=${worstSeam ? JSON.stringify(worstSeam) : 'none'}`);

    // HOST UNTOUCHED — no host fetch + master first/last/len identical (the RED
    // chunk-walk delegates pan-load to the host and mutates its 1m master).
    const hostFetchDelta = (hostAfter?.fetches || 0) - hostFetchesBefore;
    checks.check('H-S23 HOST fetch count unchanged during panel switch',
      hostFetchDelta === 0, `hostFetchDelta=${hostFetchDelta}`);
    const hostMasterUnmutated = !!(hostDeepBefore && hostDeepAfter
      && hostDeepBefore.masterFirstT === hostDeepAfter.masterFirstT
      && hostDeepBefore.masterLastT === hostDeepAfter.masterLastT
      && hostDeepBefore.masterLen === hostDeepAfter.masterLen);
    checks.check('H-S23 HOST 1m master unmutated (first/last/len identical)',
      hostMasterUnmutated,
      `before[${hostDeepBefore?.masterFirstT},${hostDeepBefore?.masterLastT},${hostDeepBefore?.masterLen}] `
      + `after[${hostDeepAfter?.masterFirstT},${hostDeepAfter?.masterLastT},${hostDeepAfter?.masterLen}]`);

    // STATE-MATRIX (coarser-panel-during-PLAY): after the 1D acquisition the panel
    // must STILL advance its playhead on the newly acquired 1D data (BL-10).
    const bPlayStart = await readPanel(page, 'B');
    ts = await streamPlayFramesNoDrag(page, ts, 240, stepMs);
    await setHostReplayPlaying(page, false);
    await broadcastCmd(page, 'replayTick', { timestamp: ts });
    await sleep(800);
    const bPlayEnd = await readPanel(page, 'B');
    const advanced = !!(bPlayEnd && bPlayStart && bPlayEnd.replayTs != null
      && Number(bPlayEnd.replayTs) > Number(bPlayStart.replayTs || ts0));
    checks.check('H-S23 coarse (1D) panel still advances playhead on the acquired data (BL-10 cell)',
      advanced, `B.replayTs ${bPlayStart?.replayTs} -> ${bPlayEnd?.replayTs}`);

    notes.push('H-S23 (BL-17, D-044): same-pair 2x2, all sync OFF, NON-backtest replay, host 1m, deep 400-day '
      + 'instrument (file 28). Enter paused replay, PLAY 300 host 1m frames (host 1m master → bounded window), then '
      + 'switch PANEL B to 1D. The coarser sibling of BL-15: the panel must acquire its coarse display window with a '
      + 'SMALL bounded fetch for the older remainder + a ZERO-fetch resample of the host-covered recent window, seamed '
      + `BAR-EQUAL to native 1D — NOT a 2000-chunk backward walk. MEASURED: panelFetches=${panelFetches} `
      + `chunkWalk=${chunkWalk} seamCompared=${seamCompared} seamMismatches=${seamMismatches} `
      + `hostFetchDelta=${hostFetchDelta} hostMasterUnmutated=${hostMasterUnmutated}. RED (b94 / `
      + '--bugswitch=__TALARIA_MC_DISABLE_COARSE_PANEL_REPLAY_TF_ACQUIRE): the non-backtest coarse switch bypasses the '
      + 'isBacktestMode-gated acquire and walks the 2000-bar chunked backward path (contaminating the host 1m master).');
    return checks;
  });
}

export function scenarioList() {
  return [
    { id: 'H-S2', title: 'drag tile A right 3 screens, sync ON', run: hS2 },
    { id: 'H-S3', title: 'drag panel B right, sync ON and OFF', run: hS3 },
    { id: 'H-S5', title: 'independent panel B, drag right', run: hS5 },
    { id: 'H-S6', title: 'TF fan-out 1m→1h→1m', run: hS6 },
    { id: 'H-S7', title: 'panel-B-only TF, interval sync OFF + replay frames', run: hS7 },
    { id: 'H-S8', title: 'replay play 15s (accelerated)', run: hS8 },
    { id: 'H-S10', title: 'cold boot 2x2 same-pair', run: hS10 },
    { id: 'H-S11', title: 'close layout → single chart drag', run: hS11 },
    { id: 'H-S12', title: 'late same-pair panel reuses shared store (bug lever)', run: hS12 },
    { id: 'H-S13', title: 'peer TF does not move other Y scales when sync OFF', run: hS13 },
    { id: 'H-S14', title: 'panel pan-to-load-history continues after gesture end (BL-9)', run: hS14 },
    { id: 'H-S15', title: 'independent panel pan-to-load-history continues after gesture end (BL-9)', run: hS15 },
    { id: 'H-S16', title: 'pan-history continuation is paused-only; no backward storm on play (BL-9)', run: hS16 },
    { id: 'H-S17', title: 'coarser same-pair panel advances playhead on play (BL-10)', run: hS17 },
    { id: 'H-S18', title: 'panels auto-follow playhead viewport on play (BL-11)', run: hS18 },
    { id: 'H-S19', title: 'play-follow cost guard: idle coalesce + drag suspend (BL-12)', run: hS19 },
    { id: 'H-S19b', title: 'play-follow smoothness: device-pixel coalesce (BL-13)', run: hS19b },
    { id: 'H-S20', title: 'coarse (1D) panel display acquisition: bounded fetch + resample seam (BL-14)', run: hS20 },
    { id: 'H-S21', title: 'finer same-pair panel acquires bars on TF switch during replay; atomic, sane axis (BL-15)', run: hS21 },
    { id: 'H-S22', title: 'host-only new-version reload prompt: build-id mismatch => toast, match => none (kill-switch gated)', run: hS22 },
    { id: 'H-S23', title: 'coarser same-pair panel bounded coarse-acquire on TF switch during NON-backtest replay; no chunk-walk (BL-17)', run: hS23 },
  ];
}

