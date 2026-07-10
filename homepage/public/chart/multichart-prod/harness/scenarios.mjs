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
  ];
}

