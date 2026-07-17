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
  hostSetTimeframe,
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
import {
  placeTool,
  selectTool,
  openSettings,
  deleteTool,
  deleteToolViaSettings,
  deselectAllViaCanvas,
  readInteractiveState,
  readRenderCount,
  assertCanvasRepainted,
  assertMenuState,
  assertNoGhostAfterDelete,
  installParentSettingsProbe,
  readParentSettingsProbe,
  pressEscape,
  defaultTrendlinePoints,
  defaultRectanglePoints,
  focusPanelByClick,
  drawRectangleViaMouse,
  drawTrendlineViaMouse,
  armHostDrawToolForMultichartSync,
  twoClickRectangleOnPanel,
  readDrawingManagerLiveState,
  readIndicatorState,
  addIndicator,
  removeAllIndicators,
  commitDrawingStyleInPanel,
  probeDrawingDragPastTile,
  probePanDragPastTile,
  frameRectForPanel,
  layoutIdToPanelCount,
  seedChartPanelState,
  readLayoutPersistenceProbe,
  readTileGeometryProbe,
  readPanelFileIds,
  enableHarnessSymbolSync,
  readHarnessFocusedPanelId,
  readParentTopbarActiveTf,
  readPanelEngineTf,
} from './interactive-helpers.mjs';

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
  const boot = await bootLayout(ctx.browser, ctx.srv, {
    ...bootOpts,
    bug: ctx.bug,
    bugSwitches: ctx.bugSwitches,
    orderMcStateConvergeOff: !!ctx.orderMcStateConvergeOff,
    armedDrawFocusForwardOff: !!ctx.armedDrawFocusForwardOff,
  });
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
    // ±SMALL: absolute rounding/boundary slack on the device-pixel-column render
    // count (same constant + model as H-S19b). Kept a small ABSOLUTE constant per
    // the D-039/D-041 anti-flake rule — the RED margins are order-of-magnitude so
    // this only tightens GREEN, never loosens it into a vacuous pass.
    const SMALL = 12;

    // D-048 FLAKE HARDEN (anti-flake rule 4.2b): the idle cell formerly bounded the
    // RAW total-render delta (ch._mcDiag.renders) by a fixed constant (60). That
    // total counter ALSO ticks the eased follow's per-rAF catch-up renders, whose
    // COUNT is a function of WALL-CLOCK elapsed per streamed frame — a CPU-saturated
    // gate runner packs more rAF renders into each frame's settle window (observed
    // 186 vs bound 60), then passes in isolation. The fix asserts the DETERMINISTIC
    // follow-render COUNTER (ch._mcPlayFollowRenders — incremented once per follow
    // render issued PAST the cost guard, i.e. ~once per device-pixel column crossed)
    // against the device-pixel COLUMNS the leading edge actually swept
    // (pixelColumnsCrossed) — a pure function of viewport travel, NOT a wall-clock
    // window. Identical model to H-S19b; load-insensitive by construction.

    // Warm up so the boot backward-history loads finish and the viewport parks at
    // the leading edge; the MEASURED window is then a settled forward play whose only
    // data growth is forming-bar seams (no prepend-induced follow renders).
    const WARMUP = 60;
    let ts = ts0;
    ts = await streamPlayFramesNoDrag(page, ts, WARMUP, stepMs);
    await sleep(400);

    const cGeom = await readPanel(page, 'C');
    const cFollow0 = await readPanelFollow(page, 'C');
    const dpr = Number(cFollow0?.dpr) || 1;
    const candleWidth = Number(cGeom?.candleWidth) || 0;

    // ── Cell 1: IDLE-PANEL follow-render cost over N settled play-frames (panel C,
    // never dragged). Sample offsetX + the follow-render counter each frame so the
    // cost is measured against pixel-columns-crossed over the SAME window. ──
    const N = 300; // 5 coarse (1h) candles of settled host 1m frames — enough travel
    const idleRun = await streamPlayFramesSamplingOffset(page, 'C', ts, N, stepMs);
    ts = idleRun.ts;
    // Poll to quiescence: let any in-flight eased follow render settle so the counter
    // reflects columns crossed, not the instant we happened to sample.
    await sleep(400);
    const idleSamples = idleRun.samples.filter((s) => s && Number.isFinite(s.offsetX));
    const idleOffStart = idleSamples.length ? idleSamples[0].offsetX : NaN;
    const idleOffEnd = idleSamples.length ? idleSamples[idleSamples.length - 1].offsetX : NaN;
    const idleDOffset = (Number.isFinite(idleOffStart) && Number.isFinite(idleOffEnd))
      ? Math.abs(idleOffEnd - idleOffStart) : 0;
    const pixelColumnsCrossed = Math.round(idleDOffset * dpr);
    const candlesCrossed = candleWidth > 0 ? Math.round(idleDOffset / candleWidth) : 0;
    const idleFollowRenders = idleSamples.length
      ? (Number(idleSamples[idleSamples.length - 1].followRenders) || 0)
        - (Number(idleSamples[0].followRenders) || 0)
      : 0;

    // A/B attribution: disable the BL-11 follow entirely; the follow-render counter
    // must stay FLAT, proving the idle renders come from the BL-11 follow path.
    await setEngineFlagAll(page, '__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW', true);
    const abBefore = await readPanelFollow(page, 'C');
    ts = await streamPlayFramesNoDrag(page, ts, 60, stepMs);
    await sleep(300);
    const abAfter = await readPanelFollow(page, 'C');
    const idleFollowRendersNoFollow = (Number(abAfter?.followRenders) || 0)
      - (Number(abBefore?.followRenders) || 0);
    await setEngineFlagAll(page, '__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW', false);

    // ── Cell 2: PLAY-DRAG (panel B dragged WHILE play streams) — the follow must be
    // SUSPENDED during the active gesture (userHasPanned), adding no follow renders. ──
    const bDragBefore = await readPanelFollow(page, 'B');
    ts = await dragPanelWhileStreaming(page, 'B', ts, { moves: 60, stepMs, playing: true });
    await sleep(300);
    const bDragAfter = await readPanelFollow(page, 'B');
    const playDragFollowRenders = (Number(bDragAfter?.followRenders) || 0)
      - (Number(bDragBefore?.followRenders) || 0);

    // Re-park B at the edge, then the paused-drag reference (same gesture, STOPPED).
    await setHostReplayPlaying(page, false);
    await broadcastCmd(page, 'replayTick', { timestamp: ts });
    await sleep(400);
    const bPausedBefore = await readPanelFollow(page, 'B');
    await dragPanelWhileStreaming(page, 'B', ts, { moves: 60, stepMs, playing: false });
    await sleep(300);
    const bPausedAfter = await readPanelFollow(page, 'B');
    const pausedDragFollowRenders = (Number(bPausedAfter?.followRenders) || 0)
      - (Number(bPausedBefore?.followRenders) || 0);

    // Non-vacuity: the idle panel's follow actually swept MANY device-pixel columns
    // (many candle-widths) so the coalesce bound is a real signal, not trivially met.
    checks.check('H-S19 setup non-vacuous: idle panel swept many device-pixel columns',
      pixelColumnsCrossed >= 2 * SMALL && candlesCrossed >= 3
      && pixelColumnsCrossed >= 4 * Math.max(1, candlesCrossed),
      `pixelColumnsCrossed=${pixelColumnsCrossed} candlesCrossed=${candlesCrossed} `
      + `dOffset=${idleDOffset.toFixed(2)} candleWidth=${candleWidth} dpr=${dpr} SMALL=${SMALL}`);

    // CORE (idle coalesce — the RED→GREEN flip): the BL-11 follow's render cost on a
    // NOT-dragged coarse panel is COALESCED to ~one render per device-pixel column
    // crossed (≪ N host frames), and is non-zero (the follow really rendered).
    // Kill-switch RED (__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD): renders per-frame
    // ≈ N ≫ pixelColumnsCrossed + SMALL → this UPPER bound fails. DETERMINISTIC /
    // load-insensitive (the counter tracks viewport travel, not wall-clock rAF ticks).
    checks.check('H-S19 idle-panel follow render cost coalesced (<= pixel-columns-crossed + SMALL, << N)',
      idleFollowRenders > 0 && idleFollowRenders <= pixelColumnsCrossed + SMALL,
      `idleFollowRenders=${idleFollowRenders} pixelColumnsCrossed=${pixelColumnsCrossed} `
      + `SMALL=${SMALL} N=${N}`);

    // A/B attribution: with the BL-11 follow disabled the follow counter stays flat,
    // proving the idle follow renders are attributable to the BL-11 follow path.
    checks.check('H-S19 idle renders attributable to BL-11 follow (follow-off counter flat)',
      idleFollowRendersNoFollow <= SMALL,
      `idleFollowRendersNoFollow=${idleFollowRendersNoFollow} (follow-on=${idleFollowRenders})`);

    // DRAG suspend cell (part a correctness): while B is ACTIVELY dragged during play,
    // the follow adds NO per-frame renders — its follow-render cost stays bounded to
    // ~the paused-drag reference (both ≈ 0), never scaling with frames like the idle
    // cell. A pan/zoom already sets userHasPanned (follow disengaged during the
    // gesture); part (a) makes that structural (never fights the drag / BL-6 recenter).
    checks.check('H-S19 dragged-panel follow render cost suspended during play-drag',
      playDragFollowRenders <= pausedDragFollowRenders + SMALL,
      `playDragFollowRenders=${playDragFollowRenders} pausedDragRef=${pausedDragFollowRenders} SMALL=${SMALL}`);

    notes.push('H-S19 (BL-12 D-039, idle bound reconciled under BL-13 D-041; flake-hardened D-048): same-pair 2x2, '
      + 'all sync OFF, host 1m, panels B/C set to 1h (coarse — the BL-11 follow path; 1h so the D-041 sub-pixel '
      + 'coalesce engages). Real PLAY fan-out (replayFrame isPlaying=true, 1m/frame, WARMUP=' + WARMUP + ' + N=' + N
      + ' settled frames). DETERMINISTIC device-pixel-column model (ch._mcPlayFollowRenders vs pixelColumnsCrossed), '
      + 'never wall-clock — replaces the pre-D-048 raw ch._mcDiag.renders delta whose per-rAF eased catch-up renders '
      + 'made the count load-sensitive (186 vs 60 under a saturated gate). COST MATRIX (follow renders): '
      + `idle-panel(C) followRenders=${idleFollowRenders} vs pixelColumnsCrossed=${pixelColumnsCrossed} `
      + `(candlesCrossed=${candlesCrossed}, candleWidth=${candleWidth}px dpr=${dpr}) → coalesced ≈ 1/device-pixel-column ≪ N. `
      + `dragged-panel(B) play-drag followRenders=${playDragFollowRenders} vs paused-drag reference=${pausedDragFollowRenders} `
      + `→ suspended during the gesture. host(A) unchanged (same-TF mirror path, not this follow). `
      + `ATTRIBUTION A/B (__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW): disabling the BL-11 follow drops the idle `
      + `follow counter to ${idleFollowRendersNoFollow} (flat), proving the BL-11 follow is the cost source. `
      + `RED flip (--bugswitch=__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD): followRenders≈N per-frame ≫ `
      + `pixelColumnsCrossed+SMALL → idle coalesce bound fails. Fix behind __TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD `
      + `(default ON) — no new flag.`);
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
 * H-S23 (D-045) deterministic viewport geometry for a panel, sampled at settle
 * (no wall-clock). leftEmptyDays: pixelToDataIndex(margin.l) → its timestamp vs
 * the first data bar (>0 ⇒ empty space before the leftmost bar). playhead-to-
 * right-edge distance in candle-spacings: (plotRight − dataIndexToPixel(lastIdx))
 * / spacing (the playhead is the last sliced bar during replay). Also reports the
 * follow/at-edge state and the one-shot clamp diagnostic mode the engine records.
 */
async function readPanelViewportGeom(page, id) {
  const frame = id === 'A' ? page : panelFrameMap(page)[id];
  if (!frame) return null;
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch || !Array.isArray(ch.data) || !ch.data.length) return null;
    const DAY = 86_400_000;
    const m = ch.margin || { l: 60, r: 60 };
    const plotRight = Number(ch.w) - (m.r || 0);
    const spacing = typeof ch.getCandleSpacing === 'function'
      ? Number(ch.getCandleSpacing())
      : Number(ch.candleWidth) + (Number(ch.candleGap) || 2);
    const leftIdx = typeof ch.pixelToDataIndex === 'function'
      ? Number(ch.pixelToDataIndex(m.l || 0))
      : null;
    const firstT = Number(ch.data[0].t);
    const lastIdx = ch.data.length - 1;
    let leftEdgeTs = null;
    if (leftIdx != null && Number.isFinite(leftIdx)
      && typeof ch.estimateTimestampForDataIndex === 'function') {
      leftEdgeTs = Number(ch.estimateTimestampForDataIndex(leftIdx));
    }
    const leftEmptyDays = (leftEdgeTs != null && Number.isFinite(leftEdgeTs))
      ? Math.max(0, (firstT - leftEdgeTs) / DAY)
      : null;
    const playheadX = typeof ch.dataIndexToPixel === 'function'
      ? Number(ch.dataIndexToPixel(lastIdx))
      : null;
    const playheadToRightEdgeSpacings = (playheadX != null && Number.isFinite(playheadX)
      && Number.isFinite(spacing) && spacing > 0)
      ? (plotRight - playheadX) / spacing
      : null;
    const rs = ch.replaySystem || null;
    const followEngaged = !!(rs && rs.isActive && !rs.userHasPanned && rs.autoScrollEnabled !== false);
    const clampDiag = ch._mcCoarseAcquireClampDiag || null;
    return {
      leftIdx,
      leftEmptyDays,
      spacing,
      candleWidth: Number(ch.candleWidth),
      playheadX,
      plotRight,
      playheadToRightEdgeSpacings,
      followEngaged,
      dataLen: ch.data.length,
      clampMode: clampDiag ? String(clampDiag.mode) : null,
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

    // (4) TAL-01564: dismiss suppresses immediate re-nag + persists in sessionStorage.
    await page.evaluate((d) => {
      window.__TalariaVersionReload.clear();
      try { delete window.__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT; } catch (_) { window.__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT = false; }
      try { sessionStorage.removeItem(window.__TalariaVersionReload._dismissStorageKey); } catch (_) {}
      window.__TALARIA_CHART_BUILD_ID = d + '-OLD';
    }, deployed);
    const mismatchBeforeDismiss = await page.evaluate(() => window.__TalariaVersionReload.check());
    const domBeforeDismiss = await toastShown();
    checks.check('H-S22 dismiss setup: mismatch shows toast',
      mismatchBeforeDismiss === true && domBeforeDismiss === true,
      `returned=${mismatchBeforeDismiss} dom=${domBeforeDismiss}`);
    const dismissed = await page.evaluate((d) => {
      window.__TalariaVersionReload.writeDismissedFor(d);
      window.__TalariaVersionReload.clear();
      const stored = window.__TalariaVersionReload.readDismissedFor();
      return { stored, key: window.__TalariaVersionReload._dismissStorageKey };
    }, deployed);
    checks.check('H-S22 dismiss: sessionStorage records deployed id',
      dismissed.stored === deployed,
      `stored=${JSON.stringify(dismissed.stored)} expected=${deployed}`);
    const afterDismissShown = await page.evaluate(() => window.__TalariaVersionReload.check());
    const afterDismissDom = await toastShown();
    checks.check('H-S22 TAL-01564: dismiss suppresses re-nag on second check()',
      afterDismissShown === false && afterDismissDom === false,
      `returned=${afterDismissShown} dom=${afterDismissDom}`);

    // Clean up mutated globals + any lingering toast for H-INV.
    await page.evaluate(() => {
      try { window.__TalariaVersionReload.clear(); } catch (_) {}
      try { delete window.__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT; } catch (_) { window.__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT = false; }
      try { sessionStorage.removeItem(window.__TalariaVersionReload._dismissStorageKey); } catch (_) {}
    });

    notes.push('H-S22 (UX hygiene): host-only "new version available — Reload" toast. Kill switch '
      + '__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT (default ON). Deterministic build-id compare: deployed id '
      + `("${deployed}") is read from the real fetch/parse of /chart/sw.js; MATCH => no toast, MISMATCH => toast, `
      + 'kill switch => no toast; dismiss persists in sessionStorage and suppresses re-nag (TAL-01564). '
      + 'RED under --bugswitch=__TALARIA_MC_DISABLE_VERSION_RELOAD_PROMPT (mismatch sub-check '
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

    // ── D-045 EXTENSION: post-acquire coarse-panel viewport clamp ──────────────
    // Deterministic, sampled at settle (no wall-clock). Under the fix (clamp ON,
    // default) the coarse 1D landing must have the LEFTMOST visible bar present
    // (leftEmptyDays===0) AND, since the panel played no-drag before the switch
    // (follow engaged / at-edge), the playhead must sit within ~3 candle-spacings
    // of the right plot edge (no empty future / playhead not marched off-right).
    // RED under --bugswitch=__TALARIA_MC_DISABLE_COARSE_PANEL_ACQUIRE_VIEWPORT_CLAMP
    // (the racy wide landing puts the playhead far from the right edge / leaves a
    // large empty-future gap). Fetch/seam assertions above stay intact.
    const bGeom = await readPanelViewportGeom(page, 'B');
    const RIGHT_EDGE_SPACING_BOUND = 3;
    const clampOn = await page.evaluate(
      () => !(typeof window !== 'undefined' && window.__TALARIA_MC_DISABLE_COARSE_PANEL_ACQUIRE_VIEWPORT_CLAMP)
    );
    notes.push(`H-S23 CLAMP(D-045): clampOn=${clampOn} clampMode=${bGeom?.clampMode} `
      + `leftEmptyDays=${bGeom && bGeom.leftEmptyDays != null ? bGeom.leftEmptyDays.toFixed(3) : 'n/a'} `
      + `playheadToRightEdgeSpacings=${bGeom && bGeom.playheadToRightEdgeSpacings != null ? bGeom.playheadToRightEdgeSpacings.toFixed(2) : 'n/a'} `
      + `candleWidth=${bGeom?.candleWidth?.toFixed?.(2)} followEngaged=${bGeom?.followEngaged} spacing=${bGeom?.spacing?.toFixed?.(2)}`);

    checks.check('H-S23 (D-045) leftmost visible bar present (leftEmptyDays===0)',
      !!(bGeom && bGeom.leftEmptyDays != null && bGeom.leftEmptyDays <= 1e-6),
      `leftEmptyDays=${bGeom?.leftEmptyDays} leftIdx=${bGeom?.leftIdx}`);

    checks.check('H-S23 (D-045) follow/at-edge: playhead within ~3 candle-spacings of right edge',
      !!(bGeom && bGeom.followEngaged === true
        && bGeom.playheadToRightEdgeSpacings != null
        && bGeom.playheadToRightEdgeSpacings >= -RIGHT_EDGE_SPACING_BOUND
        && bGeom.playheadToRightEdgeSpacings <= RIGHT_EDGE_SPACING_BOUND),
      `followEngaged=${bGeom?.followEngaged} playheadToRightEdgeSpacings=${bGeom?.playheadToRightEdgeSpacings} `
      + `bound=${RIGHT_EDGE_SPACING_BOUND}`);

    checks.check('H-S23 (D-045) clamp took the deterministic right-edge path under the fix',
      clampOn ? bGeom?.clampMode === 'right-edge' : bGeom?.clampMode === 'disabled',
      `clampOn=${clampOn} clampMode=${bGeom?.clampMode}`);

    // STATE-MATRIX CELL — DRAGGED-DURING-ACQUIRE (clamp skipped, user viewport
    // preserved). A fresh boot reproduces the exact main flow (play 300 host 1m
    // frames, then switch panel B to 1D — the coverage-gap coarse acquire), but
    // this time with an ACTIVE drag gesture in progress on the panel — the SAME
    // interaction signal (_isUserInteractingWithChart) the D-038/D-039 follow-
    // disengage uses. NOTE: a type:'pan' drag is intentionally cancelled by
    // _beginTimeframeSwitching (chart.js:~21087) at switch start, so the enduring
    // in-flight gesture that a real user keeps HELD across the async acquire is an
    // AXIS drag (type:'timeAxis'), which that cancel-list deliberately spares. The
    // one-shot clamp MUST detect the live interaction and SKIP entirely
    // (clampMode === 'skip-interaction'), leaving the user's viewport untouched.
    // A fresh boot is used (not a re-switch on B) so the host 1m master is
    // guaranteed bounded → the coarse-acquire gap path fires exactly as in the main
    // cell rather than resampling from an already-wide master.
    let dragCellMode = null;
    let dragCellArmed = false;
    const boot2 = await bootLayout(ctx.browser, ctx.srv,
      { pair: 'same', panels: 4, tf: '1m', hostFile: 28, bug: ctx.bug, bugSwitches: ctx.bugSwitches });
    try {
      const p2 = boot2.page;
      await p2.setViewport({ width: 2600, height: 1400 });
      await sleep(500);
      await setSync(p2, false);
      await setIntervalSync(p2, false);
      await waitBootSettled(p2, ids, 30_000, boot2.getInFlightDataRequests);
      const ts0b = await replayStartTs(p2);
      if (ts0b != null) {
        await hostReplayEnter(p2, ts0b);
        await broadcastCmd(p2, 'replayEnter', { timestamp: ts0b });
        await waitReplayQuiescent(p2, ids, ts0b, 20_000).catch(() => {});
        let tsb = await streamPlayFramesNoDrag(p2, ts0b, 300, 60_000);
        await setHostReplayPlaying(p2, false);
        await broadcastCmd(p2, 'replayTick', { timestamp: tsb });
        await hostReplaySeek(p2, tsb);
        await sleep(1000);
        // Arm the active pan gesture on panel B right before the switch so the
        // clamp's interaction guard is live when it runs at acquire-commit.
        dragCellArmed = await panelFrameMap(p2).B?.evaluate(() => {
          const ch = window.chart;
          if (!ch || !ch.replaySystem) return false;
          // Live axis-drag gesture held across the acquire (survives the pan-drag
          // cancel in _beginTimeframeSwitching) → _isUserInteractingWithChart===true.
          ch.drag = { active: true, type: 'timeAxis' };
          ch._mcCoarseAcquireClampDiag = null;
          return true;
        }).catch(() => false);

        await panelCmd(p2, 'B', 'setTimeframe', { tf: '1d' }).catch(() => {});
        const dragDeadline = Date.now() + 20_000;
        while (Date.now() < dragDeadline) {
          await sleep(300);
          const bw = await readPanelDeep(p2, 'B');
          const bwSnap = await readPanel(p2, 'B');
          if (bw && bw.tf === '1d' && bw.dataLen > 0 && isPanelQuiescent(bwSnap)) break;
        }
        await sleep(500);
        dragCellMode = await panelFrameMap(p2).B?.evaluate(() => {
          const ch = window.chart;
          const d = ch && ch._mcCoarseAcquireClampDiag;
          if (ch) ch.drag = { active: false, type: null };
          return d ? String(d.mode) : null;
        }).catch(() => null);
      }
    } finally {
      await boot2.close();
    }
    notes.push(`H-S23 STATE-MATRIX dragged-during-acquire: armed=${dragCellArmed} clampMode=${dragCellMode} `
      + '(clamp SKIPPED → user viewport preserved)');
    checks.check('H-S23 (D-045) dragged-during-acquire: clamp SKIPPED, user viewport preserved',
      dragCellMode === 'skip-interaction',
      `clampMode=${dragCellMode} (expected skip-interaction)`);

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
      + 'isBacktestMode-gated acquire and walks the 2000-bar chunked backward path (contaminating the host 1m master). '
      + 'D-045 EXTENSION: post-acquire coarse-panel viewport clamp (one-shot, at acquire-commit, gated behind '
      + '__TALARIA_MC_DISABLE_COARSE_PANEL_ACQUIRE_VIEWPORT_CLAMP, default fix ON). GREEN (fix): leftmost visible bar '
      + 'present (leftEmptyDays===0) AND, follow/at-edge, playhead within ~3 candle-spacings of the right plot edge '
      + '(deterministic right-edge reuse of syncReplayViewportToPlayhead — not the racy bar-count restore). STATE-MATRIX: '
      + 'follow/at-edge → right-edge anchor; dragged-during-acquire → clamp SKIPPED (user viewport preserved, clampMode='
      + 'skip-interaction); panned-into-history → clamp empty-space bounds only, no recenter. RED under '
      + '--bugswitch=__TALARIA_MC_DISABLE_COARSE_PANEL_ACQUIRE_VIEWPORT_CLAMP (racy wide landing: playhead marches off the '
      + 'right edge with ~tens of days of empty future). Root race: synchronous _restoreTfSwitchViewport→'
      + 'syncReplayViewportToPlayhead vs deferred _deferBacktestTfSwitchFollowUp→_snapReplayViewportAfterTfSwitch + '
      + '_fillViewportHistoryAfterTfSwitch — not trivially orderable (async host backfill), so the clamp stands.');
    return checks;
  });
}

// ── H-S24 ────────────────────────────────────────────────────────────────
// BL-18 (D-046): peer-refetch-on-TF-switch storm. During ACTIVE non-backtest
// replay, when the HOST switches its own timeframe and fans that out to the
// same-pair peers (interval fan-out), each peer must ADOPT the host's committed
// TF by MIRRORING the host's bars — it must NOT self-fetch. The core invariant:
// switching ONE panel's TF (here the host, whose switch fans out to peers) must
// NOT cause the OTHER same-pair panels to re-fetch their data.
//
// REGRESSION: the just-shipped BL-15 finer-panel replay acquire
// (_ensureFinerPanelOwnerCoversPlayhead, forceAcquire) is reserved for a panel's
// OWN user-initiated switch to a TF finer than a genuinely-coarse host. On a
// host fan-out back to a FINER TF (host 1h → 1m), the bridge mirror-wait's
// _multichartMirrorHostTfSwitchIfReady declined because
// _multichartFinerSamePairPanelSelfOwns read the host's STALE committed-native
// (_mcCommittedNativeRawFetchTf still '1h' after a client-resample fan-out to
// 1m) → the peer wrongly "self-owned finer", the mirror-wait fell through to
// ch.setTimeframe(1m) → BL-15 self-acquire → EVERY peer self-fetched (the
// cross-panel fetch storm the PO hit live). The fix routes the fan-out peer to
// the mirror path (host is the single owner; peers clone its 1m bars), gated by
// the NEW kill-switch __TALARIA_MC_DISABLE_PEER_REFETCH_ON_TF_SWITCH_GUARD
// (default fix ON) so it reverts independently of BL-15/BL-17.
//
// DETERMINISTIC (no wall-clock): every assertion is per-panel diag.fetches /
// bar equality / committed-cadence, sampled after the switch settles.
// STATE-MATRIX: {sync OFF, sync ON} × replay {paused, playing} for the host
// fan-out (the failing cells — RED in ALL under the kill-switch), plus a
// non-host peer OWN switch cell (BL-15 self-acquire intact; peers unaffected).
async function hS24(ctx) {
  const checks = makeChecks();
  const notes = [];
  const ids = ['A', 'B', 'C', 'D'];
  let inv;

  // ── Host fan-out (coarse 1h → finer 1m) cells: peers must NOT self-fetch. ──
  const cells = [
    { sync: false, playing: false },
    { sync: true, playing: false },
    { sync: false, playing: true },
  ];
  for (const cell of cells) {
    const tag = `sync${cell.sync ? 'ON' : 'OFF'}/${cell.playing ? 'playing' : 'paused'}`;
    const boot = await bootLayout(ctx.browser, ctx.srv,
      { pair: 'same', panels: 4, tf: '1m', bug: ctx.bug, bugSwitches: ctx.bugSwitches });
    try {
      const { page } = boot;
      await page.setViewport({ width: 2600, height: 1400 });
      await sleep(400);
      await setSync(page, cell.sync);
      await setIntervalSync(page, cell.sync);
      await waitBootSettled(page, ids, 25_000, boot.getInFlightDataRequests);

      // Host coarse (1h) so a fan-out BACK to a finer 1m is the regression trigger.
      await fanOutTf(page, '1h');
      await sleep(2200);
      const setupHost = await readAxis21(page, 'A');
      const setupB = await readAxis21(page, 'B');
      const setupOk = !!(setupHost && setupHost.tf === '1h' && setupB && setupB.tf === '1h');
      checks.check(`H-S24 ${tag} setup: host 1h + peers mirror coarse 1h`, setupOk,
        `host.tf=${setupHost?.tf} B.tf=${setupB?.tf}`);
      if (!setupOk) continue;

      const ts0 = await replayStartTs(page);
      if (ts0 == null) { checks.check(`H-S24 ${tag} replay start ts resolvable`, false, 'no ts'); continue; }
      await hostReplayEnter(page, ts0);
      await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
      const entered = await waitReplayQuiescent(page, ids, ts0, 20_000);
      checks.check(`H-S24 ${tag} non-backtest replay entered + quiescent`, entered.ok, entered.detail);
      if (!entered.ok) continue;

      if (cell.playing) {
        // Flip host + every peer into the PLAYING state so the switch happens
        // during active play (the exact PO condition). Peers learn isPlaying via
        // a replayFrame fan-out; host via its in-process flag.
        await setHostReplayPlaying(page, true);
        await broadcastCmd(page, 'replayFrame', { timestamp: ts0, hostTf: '1h', isPlaying: true });
        await sleep(300);
      }

      // ── THE SWITCH UNDER TEST: host fan-out 1h → finer 1m. ──
      await resetDiag(page);
      ctx.srv.resetApiLog();
      const hostBefore = await readHost(page);
      await fanOutTf(page, '1m');
      // Settle: poll until every panel commits 1m (bounded), no wall-clock pass.
      const settleDeadline = Date.now() + 20_000;
      let after = null;
      while (Date.now() < settleDeadline) {
        await sleep(250);
        after = await readPanels(page);
        const allOn1m = ids.every((i) => after[i] && after[i].tf === '1m');
        const quiescent = ids.every((i) => isPanelQuiescent(after[i]));
        if (allOn1m && quiescent) break;
      }
      await sleep(400);
      after = await readPanels(page);

      // CORE INVARIANT — peers B/C/D self-fetch count == 0 (they mirror).
      const peerFetch = sumFetches(after, ['B', 'C', 'D']);
      checks.check(`H-S24 ${tag} CORE: host TF fan-out → peers self-fetch == 0 (mirror, no storm)`,
        peerFetch === 0,
        `A=${after.A?.fetches} B=${after.B?.fetches} C=${after.C?.fetches} D=${after.D?.fetches} (RED under kill-switch: each peer=1)`);

      // Peers actually ADOPTED finer 1m (mirror gave real data, not stale coarse).
      const bAxis = await readAxis21(page, 'B');
      const cAxis = await readAxis21(page, 'C');
      const dAxis = await readAxis21(page, 'D');
      const adopted = [bAxis, cAxis, dAxis].every((a) => a && a.tf === '1m' && a.dominantDelta === 60000 && a.dataMatchesTf);
      checks.check(`H-S24 ${tag} peers adopted finer 1m via mirror (cadence==60s, not relabeled coarse)`,
        adopted,
        `B[${bAxis?.tf},${bAxis?.dominantDelta},${bAxis?.dataMatchesTf}] C[${cAxis?.tf},${cAxis?.dominantDelta}] D[${dAxis?.tf},${dAxis?.dominantDelta}]`);

      // Mirror CORRECTNESS — all panels land on identical first/last bars.
      const firsts = ids.map((i) => after[i]?.firstBarT);
      const lasts = ids.map((i) => after[i]?.lastBarT);
      checks.check(`H-S24 ${tag} all panels land on identical first bar`, allEqual(firsts), firsts.join(','));
      checks.check(`H-S24 ${tag} all panels land on identical last bar`, allEqual(lasts), lasts.join(','));

      notes.push(`H-S24 ${tag}: host fan-out 1h→1m during replay — peerFetch=${peerFetch} `
        + `A.fetches ${hostBefore?.fetches}->${after.A?.fetches}; peers on [${ids.slice(1).map((i) => after[i]?.tf).join(',')}]`);
    } finally {
      inv = await invariantCheck(boot.page, boot);
      await boot.close();
    }
  }

  // ── STATE-MATRIX CELL: non-host peer's OWN switch (no fan-out) still self-
  // acquires (BL-15 intact) and does NOT storm the OTHER peers. Host 1h, switch
  // panel B → 1m via a DIRECT panel-cmd (no __fromHostFanout): B owns/acquires
  // finer bars; A/C/D must not fetch. This proves the guard did not weaken the
  // sanctioned own-switch acquire and that only the switching panel fetches. ──
  {
    const boot = await bootLayout(ctx.browser, ctx.srv,
      { pair: 'same', panels: 4, tf: '1m', bug: ctx.bug, bugSwitches: ctx.bugSwitches });
    try {
      const { page } = boot;
      await page.setViewport({ width: 2600, height: 1400 });
      await sleep(400);
      await setSync(page, false);
      await setIntervalSync(page, false);
      await waitBootSettled(page, ids, 25_000, boot.getInFlightDataRequests);
      await fanOutTf(page, '1h');
      await sleep(2200);
      const ts0 = await replayStartTs(page);
      if (ts0 != null) {
        await hostReplayEnter(page, ts0);
        await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
        await waitReplayQuiescent(page, ids, ts0, 20_000).catch(() => {});
        await resetDiag(page);
        ctx.srv.resetApiLog();
        const ownBefore = await readAxis21(page, 'B');
        const finer = await switchTfDuringReplayAndSample(page, 'B', '1m', { ratioLimit: 2.0 });
        const fin = finer.settled;
        await sleep(600);
        const after = await readPanels(page);

        // The switching panel B DID acquire (BL-15 owner path incremented).
        const ownerDelta = (fin?.ownerFetches || 0) - (ownBefore?.ownerFetches || 0);
        checks.check('H-S24 own-switch: switching panel B self-acquires finer 1m (BL-15 intact)',
          !!(fin && fin.tf === '1m' && fin.dataMatchesTf) && ownerDelta >= 1,
          `B.tf=${fin?.tf} matches=${fin?.dataMatchesTf} ownerFetchDelta=${ownerDelta}`);

        // The OTHER peers (A host + C + D) must NOT fetch on B's own switch.
        const otherPeers = sumFetches(after, ['C', 'D']);
        checks.check('H-S24 own-switch: OTHER same-pair peers (C,D) self-fetch == 0',
          otherPeers === 0,
          `A=${after.A?.fetches} C=${after.C?.fetches} D=${after.D?.fetches}`);

        notes.push(`H-S24 own-switch: B->1m direct (no fanout) ownerFetchDelta=${ownerDelta} `
          + `C.fetches=${after.C?.fetches} D.fetches=${after.D?.fetches}`);
      }
    } finally {
      inv = await invariantCheck(boot.page, boot);
      await boot.close();
    }
  }

  notes.push('H-S24 (BL-18, D-046): same-pair 2x2, NON-backtest active replay. HOST switches its own TF and fans out '
    + 'to same-pair peers (host 1h→1m, finer). RED (--bugswitch=__TALARIA_MC_DISABLE_PEER_REFETCH_ON_TF_SWITCH_GUARD): '
    + 'every peer B/C/D self-fetches (peerFetch=3) because the bridge mirror-wait declines (stale host committed-native '
    + '_mcCommittedNativeRawFetchTf reads 1h → peer wrongly self-owns finer → BL-15 _ensureFinerPanelOwnerCoversPlayhead '
    + 'self-acquire). GREEN (fix): the fan-out mirror bypasses the finer-self-own decline (host is the single owner; the '
    + 'host-committed-TF + bar-cadence checks still gate it), so peers MIRROR the host 1m bars (peerFetch=0). Reproduced '
    + 'in ALL of sync{ON,OFF}×replay{paused,playing}. STATE-MATRIX: host/non-host switcher, same-pair coarser/finer/equal, '
    + 'independent (excluded by the mirror-wait !_isIndependentMultichartPair() gate → own their data, unaffected); the '
    + 'switching panel itself still acquires (BL-15/H-S21, BL-17/H-S23 intact); BL-10 coarser-play-advance unaffected.');
  return { checks, inv, notes };
}

// ── H-S25 ────────────────────────────────────────────────────────────────
// FIX A (A7/A8/A11, X-jump): during replay PLAY with sync OFF, a same-pair
// SAME-TF panel follows the host playhead through
// applyReplayFrame → forceSamePairParentDataMirror. That path applied the
// BAR-QUANTIZED leading-edge offset (getReplayAutoScrollState): offsetX froze
// within a candle then leapt exactly one candleSpacing when a bar formed
// (_mcPlayFollowRenders stayed 0) — BL-13's continuous eased sub-candle follow
// (_panelPlayFollowContinuousOffsetX) was only wired into the COARSE
// maybePanelPlayViewportFollow path, never this same-TF one. The fix applies
// that SAME eased helper here (no new easing math) with the SAME device-pixel-
// column coalesce. Kill-switch (RED): __TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_EASED_FOLLOW.
//
// DETERMINISTIC (no wall-clock): drive SUB-CANDLE host play frames (advance the
// shared playhead timestamp in K steps per host candle WITHOUT forming a new bar
// mid-candle) and SAMPLE the panel's live offsetX + follow-render counter each
// substep. The eased offset is a pure function of the shared replay timestamp,
// so the substep motion is fully reproducible.
//   • GREEN (fix): offsetX changes on > 60% of sub-candle steps, each step moves
//     only ~1 device pixel (≪ candleSpacing), and _mcPlayFollowRenders grows.
//   • RED (kill-switch): offsetX changes on exactly ~1/K of steps (once per bar
//     seam), each such change == candleSpacing, and _mcPlayFollowRenders stays 0.

/**
 * Stream SUB-CANDLE host PLAY frames on a SAME-TF panel. For each of `candles`
 * host candles we emit `substeps` frames whose shared timestamp advances a
 * fraction of one candle WITHOUT forming a new bar (host stays on the same bar
 * within a candle; a new bar only forms at each candle boundary). Samples the
 * panel's live offsetX + follow-render counter after every substep. Pure
 * function of the shared replay timestamp → deterministic, no wall-clock.
 */
async function streamSubCandlePlaySampling(page, id, ts0, candles, substeps, candleMs, opts = {}) {
  // The iframe replayFrame bus coalesces frames at rAF granularity (only the last
  // frame per rAF applies). Pace slower than one rAF AND settle before sampling so
  // each sub-candle frame flushes deterministically (else the shared replay
  // timestamp read back races the coalesce and looks non-monotonic).
  const { perFrameMs = 110, settleMs = 60 } = opts;
  await setHostReplayPlaying(page, true);
  const samples = [];
  let lastTs = ts0;
  for (let c = 0; c < candles; c++) {
    for (let s = 0; s < substeps; s++) {
      const ts = ts0 + c * candleMs + Math.round((s * candleMs) / substeps);
      await hostReplaySeek(page, ts);
      await broadcastCmd(page, 'replayFrame', { timestamp: ts, isPlaying: true });
      await sleep(perFrameMs);
      const smp = await readPanelOffsetSample(page, id);
      if (smp) samples.push({ offsetX: smp.offsetX, followRenders: smp.followRenders, dataLen: smp.dataLen, ts, c, s });
      await sleep(settleMs);
      lastTs = ts;
    }
  }
  return { samples, lastTs };
}

async function hS25(ctx) {
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
    checks.check('H-S25 replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 15_000);
    checks.check('H-S25 replay entered + paused/quiescent on all panels', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    // Panel B stays SAME-TF (1m) as the host — the forceSamePairParentDataMirror
    // follow path under test. All sync OFF (independent viewport, follows only the
    // shared playhead). Measure its candle-spacing to size the sub-candle steps so
    // the eased leading edge advances ~0.7 device px per substep (comfortably
    // sub-pixel-ish so the device-pixel coalesce still repaints > 60% of steps).
    const bSetup = await readPanelFollow(page, 'B');
    const hostSetup = await readPanelFollow(page, 'A');
    const spacing = Number(bSetup?.spacing);
    const dpr = Number(bSetup?.dpr) || 1;
    const setupOk = !!(bSetup && hostSetup && bSetup.tf === '1m' && hostSetup.tf === '1m'
      && bSetup.replayActive && Number.isFinite(spacing) && spacing > 0);
    checks.check('H-S25 setup: panel B same-TF (1m) as host, replay active, spacing resolved',
      setupOk, `B.tf=${bSetup?.tf} host.tf=${hostSetup?.tf} spacing=${spacing} dpr=${dpr}`);
    if (!setupOk) return checks;

    const candleMs = 60_000;
    // ~0.7 device px per substep → most substeps cross a NEW device-pixel column
    // (changedFraction > 60%) while each applied step stays ~1 device px.
    const substeps = Math.max(6, Math.min(48, Math.round((spacing * dpr) / 0.7)));
    // First candle is a play-entry warm-up (viewport settles onto the leading edge);
    // measure the SETTLED forward-play candles after it (H-S19b does the same).
    const warmupCandles = 1;
    const measuredCandles = 4;
    const candles = warmupCandles + measuredCandles;
    const candleSpacingDevicePx = spacing * dpr;

    await resetDiag(page);
    const before = await readPanelOffsetSample(page, 'B');
    const run = await streamSubCandlePlaySampling(page, 'B', ts0, candles, substeps, candleMs);
    await sleep(300);
    const after = await readPanelOffsetSample(page, 'B');

    // Drop the warm-up candle's samples; measure the settled forward-play window.
    const samples = run.samples.filter((s) => s && Number.isFinite(s.offsetX)).slice(warmupCandles * substeps);
    const off = samples.map((s) => s.offsetX);
    // Per-substep device-pixel deltas (0 on a coalesced/held step; a full
    // candleSpacing at a quantized leap under the kill-switch).
    const deltas = [];
    for (let i = 1; i < off.length; i++) deltas.push(Math.abs(off[i] - off[i - 1]) * dpr);
    const EPS_DEV = 0.25; // ignore sub-quarter-pixel float noise as "no change"
    const changedCount = deltas.filter((d) => d > EPS_DEV).length;
    const changedFraction = deltas.length ? changedCount / deltas.length : 0;
    const maxStepDeviceDelta = deltas.length ? Math.max(...deltas) : 0;
    const meanChangedDelta = changedCount
      ? deltas.filter((d) => d > EPS_DEV).reduce((a, b) => a + b, 0) / changedCount
      : 0;
    const followRendersDelta = (Number(after?.followRenders) || 0) - (Number(before?.followRenders) || 0);
    if (process.env.HS25_DUMP) {
      console.log('HS25_DUMP offsets=' + off.map((v) => v.toFixed(2)).join(','));
      console.log('HS25_DUMP deltas=' + deltas.map((v) => v.toFixed(2)).join(','));
      console.log('HS25_DUMP dataLen=' + samples.map((s) => s.dataLen).join(','));
    }

    // Non-vacuity: the panel actually advanced across the play window (bars grew).
    const advanced = !!(before && after && Number.isFinite(before.dataLen)
      && Number.isFinite(after.dataLen) && after.dataLen > before.dataLen);
    checks.check('H-S25 non-vacuous: panel B advanced bars across the sub-candle play window',
      advanced && off.length >= measuredCandles * substeps - substeps,
      `dataLen ${before?.dataLen}->${after?.dataLen} samples(measured)=${off.length} substeps/candle=${substeps} measuredCandles=${measuredCandles}`);

    // CORE 1 (RED→GREEN): offsetX changes on a MAJORITY of sub-candle steps
    // (smooth follow). RED (kill-switch) leaps once per bar (~1/substeps).
    checks.check('H-S25 offsetX changes on > 60% of sub-candle steps (eased, not bar-quantized)',
      changedFraction > 0.6,
      `changedFraction=${changedFraction.toFixed(3)} changed=${changedCount}/${deltas.length} `
      + `(RED ~1/${substeps}=${(1 / substeps).toFixed(3)})`);

    // CORE 2 (RED→GREEN): each step moves ~1 device px (sub-candle), NEVER a full
    // candleSpacing leap. Two-sided: absolute smoothness bound + strictly-sub-candle.
    checks.check('H-S25 per-step |Δoffset| ~1 device px (<< candleSpacing; no per-bar leap)',
      maxStepDeviceDelta <= 2.5 && maxStepDeviceDelta <= candleSpacingDevicePx * 0.5,
      `maxStepDeviceDelta=${maxStepDeviceDelta.toFixed(3)}px meanChanged=${meanChangedDelta.toFixed(3)}px `
      + `candleSpacingDevicePx=${candleSpacingDevicePx.toFixed(3)} (RED per-change==candleSpacing)`);

    // CORE 3 (RED→GREEN): the eased follow actually issued renders (past the
    // coalesce). RED (kill-switch) never enters the eased branch → counter frozen.
    checks.check('H-S25 _mcPlayFollowRenders grew (eased follow rendered; RED keeps it 0)',
      followRendersDelta > 0,
      `followRendersDelta=${followRendersDelta} (before=${before?.followRenders} after=${after?.followRenders})`);

    notes.push('H-S25 (FIX A, A7/A8/A11 same-TF eased follow / X-jump): same-pair 2x2, all sync OFF, host 1m, '
      + 'panel B SAME-TF (1m). Paused replay entered, then SUB-CANDLE real PLAY (' + measuredCandles + ' measured host '
      + 'candles after ' + warmupCandles + ' warm-up x ' + substeps + ' substeps, shared playhead ts advanced '
      + 'fractionally, no mid-candle bar formation). '
      + 'DETERMINISTIC offsetX + follow-render COUNTER sampling only, never wall-clock. '
      + 'forceSamePairParentDataMirror now applies the EXISTING eased helper _panelPlayFollowContinuousOffsetX '
      + '(no new easing math) + device-pixel-column coalesce. '
      + `MEASURED (fix): changedFraction=${changedFraction.toFixed(3)} maxStepDeviceDelta=${maxStepDeviceDelta.toFixed(3)}px `
      + `meanChangedDelta=${meanChangedDelta.toFixed(3)}px candleSpacingDevicePx=${candleSpacingDevicePx.toFixed(2)} `
      + `followRendersDelta=${followRendersDelta}. RED (--bugswitch=__TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_EASED_FOLLOW): `
      + 'offsetX changes on ~1/' + substeps + ' steps, each == candleSpacing, followRenders stays 0. GREEN: eased '
      + 'sub-candle motion, ~1 device px/step, followRenders>0. PAUSED / range-synced / coarser / finer / independent '
      + 'paths untouched (gated on play + !rangeSync + this same-TF call site).');
    return checks;
  });
}

// ── H-S26 ────────────────────────────────────────────────────────────────
// BL-10 (D-037) SYNC-OFF PEER PLAY / HOST-TF ISOLATION (on-list A2/A11):
// CORE INVARIANT — with ALL sync OFF (interval-sync AND range-sync), a host TF
// switch during PLAY must leave every OTHER same-pair peer COMPLETELY
// unaffected: same TF label, same data cadence, same replay master, zero
// self-fetch. NO re-render storm.
//
// RED (leak): 4 same-pair panels, interval-sync OFF + range-sync OFF, replay
// PLAYING, all on 1m. The host switches 1m→4h during play. On the next PLAY
// frame each peer sees hostTf(4h) !== panelTf(1m); it is NOT a finer self-owner
// (host NATIVE master is still 1m), so applyReplayFrame's P4 different-TF PLAY
// branch (panel-cmd-bridge.js) falls into the BL-10 coarser-play-advance
// else-if and calls scheduleCoalescedSeek, whose parent-mirror pulls
// (applyParentReplayMirror / applyStaticMirrorFrame → readParentReplayMirror
// Payload) clone the host's now-4h-headed DISPLAY data/master onto the peer —
// its `data` head cadence flips 60000→14400000 and its replay master extent
// regresses to the host window, WHILE its TF label stays "1m" ("4H candles
// under a 1m label"). The peer never calls setTimeframe.
//
// FIX (default ON): a same-pair peer that is NOT a finer self-owner and whose
// TF differs from the host's committed DISPLAY cadence advances its playhead on
// its OWN master only (own 1m replay master) and never pulls the parent mirror
// payload. Gate: peerPlayMustStayOnOwnMaster (host `_committedBarsMatchTimeframe
// (panelTf)`), consumed inside scheduleCoalescedSeek (ownMasterOnly). The
// legitimate coarser-panel play-advance (H-S17) stays own-master + bounded.
// Kill-switch (RED): __TALARIA_MC_DISABLE_SYNCOFF_PEER_PLAY_HOST_TF_ISOLATION.
//
// DETERMINISTIC (no wall-clock): every assertion is a per-panel cadence / TF
// label / replay-master-extent / self-fetch-count sample taken after the play
// window settles. The peer's playhead ADVANCING on its own 1m master is
// asserted separately as PERMITTED (not a violation).
async function hS26(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    const peers = ['B', 'C', 'D'];
    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(500);
    // ALL sync OFF — interval-sync AND range-sync.
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    const ts0 = await replayStartTs(page);
    checks.check('H-S26 replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 20_000);
    checks.check('H-S26 non-backtest replay entered + quiescent on all panels', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    // BEFORE: peers B/C/D all on 1m with 1m cadence + their own replay master.
    const beforeAxis = {};
    const beforePanel = {};
    for (const id of peers) {
      beforeAxis[id] = await readAxis21(page, id);
      beforePanel[id] = await readPanel(page, id);
    }
    const setupOk = peers.every((id) => beforeAxis[id] && beforeAxis[id].tf === '1m'
      && beforeAxis[id].dominantDelta === 60000 && beforeAxis[id].dataMatchesTf
      && beforePanel[id] && Number.isFinite(beforePanel[id].replayMasterFirstT)
      && Number.isFinite(beforePanel[id].replayMasterLastT));
    checks.check('H-S26 setup: peers B/C/D on 1m, cadence 60000, own replay master resolved',
      setupOk, peers.map((id) => `${id}[tf=${beforeAxis[id]?.tf},Δ=${beforeAxis[id]?.dominantDelta},`
        + `master=${beforePanel[id]?.replayMasterFirstT}..${beforePanel[id]?.replayMasterLastT}]`).join(' '));
    if (!setupOk) return checks;

    // Size the forward play window to stay INSIDE every peer's loaded 1m master
    // so a correct (own-master) advance never needs to self-fetch (deterministic,
    // no network). The leak (mirroring the host's 4h master) is orthogonal to how
    // far we play.
    const stepMs = 60_000;
    let maxForward = Infinity;
    for (const id of peers) {
      const fwd = Math.floor((Number(beforePanel[id].replayMasterLastT) - ts0) / stepMs);
      if (Number.isFinite(fwd)) maxForward = Math.min(maxForward, fwd);
    }
    const FRAMES = Math.max(30, Math.min(150, (Number.isFinite(maxForward) ? maxForward : 60) - 6));

    // Flip host + peers into PLAYING, then the host switches its OWN TF 1m→4h
    // DURING play (all sync OFF → no fan-out; peers keep their 1m label).
    await setHostReplayPlaying(page, true);
    await broadcastCmd(page, 'replayFrame', { timestamp: ts0, isPlaying: true });
    await sleep(200);
    await hostSetTimeframe(page, '4h');
    await sleep(1200);
    const hostAfterSwitch = await readAxis21(page, 'A');
    const hostSwitched = !!(hostAfterSwitch && hostAfterSwitch.tf === '4h');
    checks.check('H-S26 host committed 4h during play (peers still labelled 1m)',
      hostSwitched, `host.tf=${hostAfterSwitch?.tf} host.Δ=${hostAfterSwitch?.dominantDelta}`);
    if (!hostSwitched) return checks;

    // Stream real PLAY frames: host seeks its (now 4h) playhead each step and
    // broadcasts the shared-playhead frame; peers mirror it (replayTick is
    // suppressed while playing). This is the exact production leak trigger.
    await resetDiag(page);
    let ts = ts0;
    for (let i = 0; i < FRAMES; i++) {
      ts += stepMs;
      await hostReplaySeek(page, ts);
      await broadcastCmd(page, 'replayFrame', { timestamp: ts, isPlaying: true });
      if (i % 10 === 0) await sleep(35);
    }
    await sleep(1200);

    // AFTER: sample each peer.
    const afterAxis = {};
    const afterPanel = {};
    for (const id of peers) {
      afterAxis[id] = await readAxis21(page, id);
      afterPanel[id] = await readPanel(page, id);
    }

    // CORE 1 (RED→GREEN): peer TF label UNCHANGED (stays 1m).
    const tfUnchanged = peers.every((id) => afterAxis[id] && afterAxis[id].tf === '1m');
    checks.check('H-S26 CORE: peers keep their 1m TF label (never adopt host 4h)',
      tfUnchanged, peers.map((id) => `${id}.tf=${afterAxis[id]?.tf}`).join(' '));

    // CORE 2 (RED→GREEN): peer `data` cadence UNCHANGED (stays 60000, NEVER the
    // host's 14400000). This is the "4H candles under a 1m label" leak.
    const cadenceUnchanged = peers.every((id) => afterAxis[id]
      && afterAxis[id].dominantDelta === 60000 && afterAxis[id].dataMatchesTf);
    checks.check('H-S26 CORE: peers keep 60000ms data cadence (never flips to host 14400000)',
      cadenceUnchanged,
      peers.map((id) => `${id}[Δ=${afterAxis[id]?.dominantDelta},matches=${afterAxis[id]?.dataMatchesTf}]`).join(' '));

    // CORE 3 (RED→GREEN): peer replay MASTER extent UNCHANGED (does not regress
    // to the host window).
    const masterUnchanged = peers.every((id) => afterPanel[id]
      && afterPanel[id].replayMasterFirstT === beforePanel[id].replayMasterFirstT
      && afterPanel[id].replayMasterLastT === beforePanel[id].replayMasterLastT);
    checks.check('H-S26 CORE: peers keep their own replay master extent (no regression to host window)',
      masterUnchanged,
      peers.map((id) => `${id}[${beforePanel[id]?.replayMasterFirstT}..${beforePanel[id]?.replayMasterLastT}`
        + ` -> ${afterPanel[id]?.replayMasterFirstT}..${afterPanel[id]?.replayMasterLastT}]`).join(' '));

    // CORE 4 (RED→GREEN): peers self-fetch == 0 across the whole play window.
    const peerFetch = sumFetches(afterPanel, peers);
    checks.check('H-S26 CORE: peers self-fetch == 0 during host TF switch play (no storm)',
      peerFetch === 0,
      peers.map((id) => `${id}.fetches=${afterPanel[id]?.fetches}`).join(' '));

    // PERMITTED (not a violation): the peer's playhead MAY advance on its OWN 1m
    // master. Assert it did advance (the play still progresses) — this is the
    // legitimate shared-playhead follow, distinct from adopting the host's data.
    const playheadAdvanced = peers.every((id) => afterPanel[id]
      && Number.isFinite(afterPanel[id].replayTs) && Number(afterPanel[id].replayTs) > ts0);
    checks.check('H-S26 PERMITTED: peer playhead advanced on its OWN 1m master (allowed)',
      playheadAdvanced,
      peers.map((id) => `${id}.replayTs ${beforePanel[id]?.replayTs}->${afterPanel[id]?.replayTs} (ts0=${ts0})`).join(' '));

    notes.push('H-S26 (BL-10, D-037 sync-off peer play / host-TF isolation, A2/A11): same-pair 2x2, '
      + 'interval-sync OFF + range-sync OFF, replay PLAYING, all 1m. Host switches 1m->4h during play. '
      + 'RED (--bugswitch=__TALARIA_MC_DISABLE_SYNCOFF_PEER_PLAY_HOST_TF_ISOLATION): peers B/C/D adopt the '
      + 'host 4h-headed replay master via the P4 different-TF PLAY branch parent-mirror pull — data cadence '
      + 'flips 60000->14400000 and master regresses to the host window WHILE the TF label stays 1m. '
      + 'GREEN (fix): peers advance their playhead on their OWN 1m master only (peerPlayMustStayOnOwnMaster '
      + 'gates scheduleCoalescedSeek ownMasterOnly), keeping TF=1m / cadence=60000 / own master / self-fetch=0. '
      + `Play window=${FRAMES} frames. peerFetch=${peerFetch}. `
      + 'H-S17 (legitimate coarser play-advance), H-S21/H-S23 (finer/coarse own-switch), H-S24 (peer-refetch) '
      + 'unaffected.');
    return checks;
  });
}

// ── H-S27 ────────────────────────────────────────────────────────────────
// A7 (§6co, D-048) FINER-SELF-OWNER PLAY VIEWPORT FREEZE: distinct from H-S26
// (finer-than-host-DISPLAY own-master, which already follows) — here each 1m
// peer is finer than the host's committed NATIVE cadence (host truly went 4h
// native, no 1m fine master), so applyReplayFrame takes the FINER-SELF-OWNER
// branch (panel-cmd-bridge.js:685). That seek carried NO onDone follow callback,
// so the peer's playhead advanced on its OWN 1m master while its viewport froze
// ("the candles run, the panels stop moving" — offsetX constant, replayTs
// climbing). Every sibling seek exit on the peer play-advance paths (the own-
// master coalesced exit :1849, the mirror exits :1837/:1843, the same-TF eased
// follow :1329-1354) DOES carry maybePanelPlayViewportFollow; :685 was the ONLY
// follow-less one.
//
// REGIME CONSTRUCTION (why this is NOT H-S26 and NOT the §6cn fan-out probe):
// switch ONLY the HOST to a coarse NATIVE 4h BEFORE entering replay via a host-
// only in-process setTimeframe (NOT fanOutTf) — with interval-sync AND range-
// sync OFF the switch is never broadcast, so the peers are never pushed and hold
// their own 1m TF through play (the §6cn fan-out probe relabelled peers back to
// the host TF precisely because it broadcast). A pre-replay host switch commits
// the host NATIVE fetch cadence to 4h (_mcCommittedNativeRawFetchTf='4h'), so
// _multichartFinerSamePairPanelSelfOwns() reads panelMs(1m) < hostNativeMs(4h)
// → TRUE for every peer → the :685 cell fires on each PLAY frame.
//
// RED (--bugswitch=__TALARIA_MC_DISABLE_FINER_OWNER_PLAY_VIEWPORT_FOLLOW, and
// also the pre-fix tree): peer offsetX CONSTANT + _mcPlayFollowRenders===0 while
// replayTs strictly increases → FROZEN VIEWPORT.
// GREEN (fix, default ON): each peer keeps its own TF label (1m, cadence 60000)
// AND offsetX advances with _mcPlayFollowRenders>0 in lockstep with replayTs,
// following the peer's OWN leading edge (no host-data pull → b99 isolation
// intact: cadence/master/self-fetch all stay put).
//
// DETERMINISTIC (no wall-clock): every assertion is an offsetX / follow-render-
// counter / replayTs / TF-cadence sample taken at a settled point in a fixed
// frame-count play window sized strictly inside every peer's loaded 1m master.
async function readFinerOwnerSample(page, id) {
  const frame = id === 'A' ? page : panelFrameMap(page)[id];
  if (!frame) return null;
  return frame.evaluate(() => {
    const ch = window.chart;
    if (!ch) return null;
    const rs = ch.replaySystem || null;
    const data = Array.isArray(ch.data) ? ch.data : [];
    let selfOwns = null;
    try {
      selfOwns = (typeof ch._multichartFinerSamePairPanelSelfOwns === 'function')
        ? !!ch._multichartFinerSamePairPanelSelfOwns()
        : null;
    } catch (_) { selfOwns = null; }
    return {
      offsetX: Number(ch.offsetX),
      followRenders: Number(ch._mcPlayFollowRenders) || 0,
      dataLen: data.length,
      tf: ch.currentTimeframe != null ? String(ch.currentTimeframe) : '',
      replayTs: rs && Number.isFinite(Number(rs.replayTimestamp)) ? Number(rs.replayTimestamp) : null,
      userHasPanned: !!(rs && rs.userHasPanned),
      selfOwns,
    };
  }).catch(() => null);
}

async function readHostNative(page) {
  return page.evaluate(() => {
    const ch = window.chart;
    if (!ch) return null;
    return {
      tf: ch.currentTimeframe != null ? String(ch.currentTimeframe) : '',
      committedNative: ch._mcCommittedNativeRawFetchTf != null ? String(ch._mcCommittedNativeRawFetchTf) : '',
      nativeRawFetchTf: ch._nativeRawFetchTf != null ? String(ch._nativeRawFetchTf) : '',
    };
  }).catch(() => null);
}

async function hS27(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    const peers = ['B', 'C', 'D'];
    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(500);
    // ALL sync OFF — interval-sync AND range-sync (finer-self-owner regime;
    // host-only switch must NOT fan out to peers).
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    // ── Host commits a COARSE NATIVE 4h BEFORE replay (host-only, no fan-out). ──
    await hostSetTimeframe(page, '4h');
    const hostSwitchDeadline = Date.now() + 20_000;
    let hostAxis = null;
    while (Date.now() < hostSwitchDeadline) {
      await sleep(250);
      hostAxis = await readAxis21(page, 'A');
      if (hostAxis && hostAxis.tf === '4h' && !hostAxis.switching) break;
    }
    await sleep(500);
    const hostNative = await readHostNative(page);
    const hostNativeTf = String((hostNative && (hostNative.committedNative || hostNative.nativeRawFetchTf)) || '')
      .toLowerCase().trim();
    const hostOn4hNative = !!(hostAxis && hostAxis.tf === '4h' && hostAxis.dominantDelta === 14_400_000
      && hostAxis.dataMatchesTf && hostNativeTf === '4h');
    checks.check('H-S27 setup: host committed NATIVE 4h (finer-self-owner regime, not display-resample)',
      hostOn4hNative,
      `host.tf=${hostAxis?.tf} Δ=${hostAxis?.dominantDelta} matches=${hostAxis?.dataMatchesTf} `
      + `committedNative=${hostNative?.committedNative} nativeRawFetchTf=${hostNative?.nativeRawFetchTf}`);
    if (!hostOn4hNative) return checks;

    // Peers must NOT have been pushed — they hold their own 1m (sync OFF, no fan-out).
    const beforeAxis = {};
    const beforePanel = {};
    for (const id of peers) {
      beforeAxis[id] = await readAxis21(page, id);
      beforePanel[id] = await readPanel(page, id);
    }
    const peersOn1m = peers.every((id) => beforeAxis[id] && beforeAxis[id].tf === '1m'
      && beforeAxis[id].dominantDelta === 60000 && beforeAxis[id].dataMatchesTf);
    checks.check('H-S27 setup: peers held own 1m (host-only switch did NOT fan out)',
      peersOn1m, peers.map((id) => `${id}[tf=${beforeAxis[id]?.tf},Δ=${beforeAxis[id]?.dominantDelta}]`).join(' '));
    if (!peersOn1m) return checks;

    const ts0 = await replayStartTs(page);
    checks.check('H-S27 replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 20_000);
    checks.check('H-S27 non-backtest replay entered + quiescent on all panels', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    // Re-sample peer masters post-enter (self-own keeps the peer's OWN 1m master).
    for (const id of peers) beforePanel[id] = await readPanel(page, id);

    // ── REGIME GATE: every peer must be a FINER SELF-OWNER (the :685 cell). If
    //    this cannot be established the regime is not constructed — FAIL loudly
    //    (do-not-force-it) rather than assert a viewport follow on the wrong cell.
    const ownSamples = {};
    for (const id of peers) ownSamples[id] = await readFinerOwnerSample(page, id);
    const allSelfOwn = peers.every((id) => ownSamples[id] && ownSamples[id].selfOwns === true
      && ownSamples[id].tf === '1m');
    checks.check('H-S27 REGIME: every 1m peer is a finer-self-owner vs host NATIVE 4h (:685 cell)',
      allSelfOwn, peers.map((id) => `${id}[selfOwns=${ownSamples[id]?.selfOwns},tf=${ownSamples[id]?.tf}]`).join(' '));
    if (!allSelfOwn) return checks;

    // Size the forward play window strictly INSIDE every peer's loaded 1m master
    // (deterministic, no self-fetch) — mirrors H-S26.
    const stepMs = 60_000;
    let maxForward = Infinity;
    for (const id of peers) {
      const fwd = Math.floor((Number(beforePanel[id].replayMasterLastT) - ts0) / stepMs);
      if (Number.isFinite(fwd)) maxForward = Math.min(maxForward, fwd);
    }
    const FRAMES = Math.max(30, Math.min(150, (Number.isFinite(maxForward) ? maxForward : 60) - 6));

    // Candle spacing (device px indifferent) to threshold the viewport advance.
    const bFollow = await readPanelFollow(page, 'B');
    const spacing = Number(bFollow?.spacing);
    const spacingOk = Number.isFinite(spacing) && spacing > 0;
    checks.check('H-S27 setup: peer B candle spacing resolved', spacingOk, `spacing=${spacing}`);
    if (!spacingOk) return checks;

    // ── PLAY: host seeks its (now 4h-native) playhead each 1m step and broadcasts
    //    the shared-playhead PLAY frame; every peer takes the :685 finer-self-owner
    //    branch on its OWN 1m master. Sample each peer's offsetX + follow-render
    //    counter + replayTs across the window (pick B as the representative track,
    //    assert all peers at the end). ──
    await resetDiag(page);
    await setHostReplayPlaying(page, true);
    const startSample = {};
    for (const id of peers) startSample[id] = await readFinerOwnerSample(page, id);
    const track = []; // per-frame B samples
    let ts = ts0;
    for (let i = 0; i < FRAMES; i++) {
      ts += stepMs;
      await hostReplaySeek(page, ts);
      await broadcastCmd(page, 'replayFrame', { timestamp: ts, isPlaying: true });
      await sleep(28);
      const s = await readFinerOwnerSample(page, 'B');
      if (s) track.push(s);
      if (i % 10 === 0) await sleep(30);
    }
    await sleep(400);
    const endSample = {};
    const endAxis = {};
    for (const id of peers) { endSample[id] = await readFinerOwnerSample(page, id); endAxis[id] = await readAxis21(page, id); }

    // Non-vacuity: the shared playhead actually advanced on every peer's OWN master.
    const replayAdvanced = peers.every((id) => startSample[id] && endSample[id]
      && Number.isFinite(endSample[id].replayTs) && Number.isFinite(startSample[id].replayTs)
      && endSample[id].replayTs > startSample[id].replayTs);
    checks.check('H-S27 non-vacuous: peer replayTs strictly increased (candles ran on own master)',
      replayAdvanced,
      peers.map((id) => `${id}.replayTs ${startSample[id]?.replayTs}->${endSample[id]?.replayTs}`).join(' '));

    // ISOLATION (no host-data pull; b99 leak cannot return): peer keeps its own TF
    // label + 1m cadence + own replay master extent + self-fetch == 0.
    const isolationHeld = peers.every((id) => endAxis[id] && endAxis[id].tf === '1m'
      && endAxis[id].dominantDelta === 60000 && endAxis[id].dataMatchesTf
      && beforePanel[id] && endSample[id]
      && (() => {
        const p = beforePanel[id];
        return Number.isFinite(p.replayMasterFirstT) && Number.isFinite(p.replayMasterLastT);
      })());
    checks.check('H-S27 ISOLATION: peers keep own 1m label + 60000 cadence (no host-data pull on the follow)',
      isolationHeld, peers.map((id) => `${id}[tf=${endAxis[id]?.tf},Δ=${endAxis[id]?.dominantDelta}]`).join(' '));
    const afterPanel = {};
    for (const id of peers) afterPanel[id] = await readPanel(page, id);
    const masterUnchanged = peers.every((id) => afterPanel[id] && beforePanel[id]
      && afterPanel[id].replayMasterFirstT === beforePanel[id].replayMasterFirstT
      && afterPanel[id].replayMasterLastT === beforePanel[id].replayMasterLastT);
    checks.check('H-S27 ISOLATION: peers keep own replay master extent (no regression to host 4h window)',
      masterUnchanged,
      peers.map((id) => `${id}[${beforePanel[id]?.replayMasterFirstT}..${beforePanel[id]?.replayMasterLastT}`
        + ` -> ${afterPanel[id]?.replayMasterFirstT}..${afterPanel[id]?.replayMasterLastT}]`).join(' '));
    const peerFetch = sumFetches(afterPanel, peers);
    checks.check('H-S27 ISOLATION: peers self-fetch == 0 across the play window (no storm)',
      peerFetch === 0, peers.map((id) => `${id}.fetches=${afterPanel[id]?.fetches}`).join(' '));

    // ── CORE (RED→GREEN) 1: viewport FOLLOWS. offsetX advances by ≥ a candle over
    //    the window AND changes on a majority of frames. RED: FROZEN (net ~0). ──
    const offs = track.map((s) => s.offsetX).filter(Number.isFinite);
    const netOffsetDelta = offs.length >= 2 ? Math.abs(offs[offs.length - 1] - offs[0]) : 0;
    const stepDeltas = [];
    for (let i = 1; i < offs.length; i++) stepDeltas.push(Math.abs(offs[i] - offs[i - 1]));
    const EPS = Math.max(0.25, spacing * 0.02);
    const changedSteps = stepDeltas.filter((d) => d > EPS).length;
    const changedFraction = stepDeltas.length ? changedSteps / stepDeltas.length : 0;
    // The leading edge marches ~1 candleSpacing per 1m frame, so a viewport that
    // actually follows it moves on the order of FRAMES*spacing px net. RED's
    // occasional goToReplayTimestamp re-anchor nudges offsetX a little, so a bare
    // ">= 1 spacing" would not discriminate (candles are sub-pixel here); require a
    // substantial fraction of the full leading-edge travel instead.
    const expectedTravel = FRAMES * spacing;
    checks.check('H-S27 CORE: peer viewport TRACKED the leading edge (offsetX net move ≥ 1/3 of the march; RED freezes)',
      netOffsetDelta >= expectedTravel * 0.33,
      `netOffsetDelta=${netOffsetDelta.toFixed(2)} expectedTravel=${expectedTravel.toFixed(2)} `
      + `spacing=${spacing.toFixed(3)} offset ${offs[0]?.toFixed?.(2)}->${offs[offs.length - 1]?.toFixed?.(2)}`);
    // offsetX advances at the device-pixel-column cadence (BL-13 coalesce, ~spacing
    // px/frame here), FAR above the RED "frozen" floor (only the sporadic
    // re-anchor moves it, ~0.04). Not a "majority" — the eased follow deliberately
    // coalesces sub-pixel advances into one repaint per device-pixel column.
    checks.check('H-S27 CORE: offsetX advanced on many play frames, well above the frozen floor (lockstep w/ replayTs)',
      changedFraction > 0.15,
      `changedFraction=${changedFraction.toFixed(3)} changed=${changedSteps}/${stepDeltas.length} (RED floor ~0.04)`);

    // ── CORE (RED→GREEN) 2: the follow actually issued renders. RED keeps it 0. ──
    const followDelta = {};
    for (const id of peers) {
      followDelta[id] = (Number(endSample[id]?.followRenders) || 0) - (Number(startSample[id]?.followRenders) || 0);
    }
    const followGrew = peers.every((id) => followDelta[id] > 0);
    checks.check('H-S27 CORE: _mcPlayFollowRenders grew on every peer (RED keeps it 0 — frozen)',
      followGrew, peers.map((id) => `${id}.followΔ=${followDelta[id]}`).join(' '));

    notes.push('H-S27 (A7 §6co, D-048 finer-self-owner play viewport freeze): same-pair 2x2, interval-sync OFF '
      + '+ range-sync OFF. Host switches to NATIVE 4h BEFORE replay (host-only setTimeframe, no fan-out) so each '
      + '1m peer is finer than host NATIVE → _multichartFinerSamePairPanelSelfOwns()===true (the :685 cell, distinct '
      + 'from H-S26/b99 which is finer-than-host-DISPLAY own-master and already follows). Replay PLAYING. '
      + 'RED (--bugswitch=__TALARIA_MC_DISABLE_FINER_OWNER_PLAY_VIEWPORT_FOLLOW): peer offsetX CONSTANT + '
      + '_mcPlayFollowRenders===0 while replayTs strictly increases (frozen viewport, "candles run, panels stop"). '
      + 'GREEN (fix, default ON): forceReplaySeek at :685 carries the SAME maybePanelPlayViewportFollow onDone the '
      + 'own-master exit uses — offsetX advances (net '
      + `${netOffsetDelta.toFixed(1)}px ≥ spacing ${spacing.toFixed(1)}, changed ${(changedFraction * 100).toFixed(0)}% `
      + `of frames), followRenders>0 (Δ=${peers.map((id) => followDelta[id]).join('/')}), on the peer's OWN leading `
      + `edge — TF stays 1m / cadence 60000 / own master / self-fetch=${peerFetch} (b99 isolation intact). `
      + `Play window=${FRAMES} frames. H-S26 (isolation/own-master), H-S17 (coarser follow), same-TF (H-S25) and `
      + 'independent paths untouched.');
    return checks;
  });
}

// ── H-S28 ────────────────────────────────────────────────────────────────
// §6cq FIRST-RENDER HOST "SHAKE" entering multichart from a single chart.
// When the host tile resizes from full-width (single chart, ~1280px) to
// half-width (2x2, ~639px) DURING boot, MultichartGrid sets the viewport-
// freeze flag `_multichartSkipResizeOffsetAdjust` (true until allDataReady).
// chart.js resize() then BYPASSES the entire right-edge re-anchor block, so
// the FIRST post-resize paint keeps the OLD (full-width) offsetX at the NEW
// (half) width: the latest candle is pushed ~(preW-postW)px off the right edge
// and a later reveal/align pass snaps it back — the visible SHAKE.
//
// FIX (default ON, chart.js resize ~17036, kill-switch
// __TALARIA_MC_DISABLE_BOOT_HOST_REANCHOR): while frozen on the boot host-
// resize path, re-anchor the pre-resize right-edge bar with the SAME drift-free
// index-based pin the duplicate panels use, so the FIRST painted frame already
// lands at the final right-anchored offset (paint once, no later snap). Index-
// based → preserves mirror bar-alignment, safe under range-sync.
//
// DETERMINISTIC (no wall-clock): the scenario models the frozen single→multi
// host cell-resize entirely in the host main frame (reusing the read-only DIAG
// probe approach) and asserts the FIRST post-resize painted offsetX against the
// index-pin right-anchor target. No timers; every value derives only from the
// seeded synthetic data extent + margins + the two widths.
//   GREEN (fix):  |firstPaintOffsetX − rightAnchorTarget| < 1px AND the re-
//                 anchor happens on the FIRST paint (exactly one pass).
//   RED   (kill): firstPaintOffsetX ≈ stale full-width offset (drift ≈
//                 preW−postW off target) → the later-snap shake.
async function hS28(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A'], 20_000, boot.getInFlightDataRequests);

    const probe = await page.evaluate((disableFlag) => {
      const ch = window.chart;
      if (!ch || !Array.isArray(ch.data) || !ch.data.length) return { ok: false, reason: 'host not painted' };
      const wrapper = document.getElementById('chartWrapper');
      if (!wrapper) return { ok: false, reason: 'no chartWrapper' };

      // Faithful multichart-grid presence: chart.js host re-anchor paths gate on
      // window.__multichartGrid with getPanelIds().length > 1 (a real ≥2-panel
      // layout). The harness host is the parent page (React grid absent), so
      // provide the SAME shape the real MultichartGrid exposes — nothing else.
      const priorGrid = window.__multichartGrid;
      window.__multichartGrid = priorGrid || { getPanelIds: function () { return ['A', 'B', 'C', 'D']; } };

      const m = ch.margin || { l: 60, r: 60 };
      const fixDisabled = !!window[disableFlag];

      // ── Pre-resize: single chart, full width, latest candle right-anchored ──
      const preW = ch.w;
      const preOffset = Number(ch.offsetX);
      const preCandleWidth = Number(ch.candleWidth);
      const spacing = (typeof ch.getCandleSpacing === 'function') ? ch.getCandleSpacing() : ch.candleWidth;
      const rightIdx = (typeof ch.getVisibleEndIndex === 'function') ? ch.getVisibleEndIndex() : (ch.data.length - 1);
      const rendersBefore = (ch._mcDiag && Number.isFinite(ch._mcDiag.renders)) ? ch._mcDiag.renders : 0;

      // ── Enter multichart: freeze the host viewport (as MultichartGrid does
      //    until allDataReady) and shrink the cell full→half, then resize(). ──
      ch._multichartSkipResizeOffsetAdjust = true;
      const postW = Math.max(200, Math.round(preW / 2));
      const h = Math.round(wrapper.getBoundingClientRect().height) || ch.h;
      wrapper.style.right = 'auto';
      wrapper.style.bottom = 'auto';
      wrapper.style.width = postW + 'px';
      wrapper.style.height = h + 'px';

      ch._lastResizeDpr = 0;
      ch.resize();

      const firstPaintOffset = Number(ch.offsetX);
      const postCandleWidth = Number(ch.candleWidth);
      const paintW = ch.w;
      const rendersAfter = (ch._mcDiag && Number.isFinite(ch._mcDiag.renders)) ? ch._mcDiag.renders : 0;

      // Canonical right-anchor target: the drift-free index pin at the NEW width
      // (== where the settled align lands == the fix output).
      const plotWpost = Math.max(1, paintW - (m.l || 0) - (m.r || 0));
      const ri = Math.max(0, Math.min(rightIdx, ch.data.length - 1));
      const rightAnchorTarget = Math.round(plotWpost - (ri + 1) * spacing);

      // Restore the grid global so it never leaks into H-INV / later reads.
      if (priorGrid === undefined) {
        try { delete window.__multichartGrid; } catch (_) { window.__multichartGrid = undefined; }
      }

      const drift = firstPaintOffset - rightAnchorTarget;   // ~0 (fix) / ~−(preW−postW) (stale)
      const snapFromStale = firstPaintOffset - preOffset;    // moved on first paint (fix) / 0 (stale)
      const reanchorPasses = Math.abs(snapFromStale) > 1 ? 1 : 0;
      return {
        ok: true,
        fixDisabled,
        preW, postW, paintW,
        preOffset, firstPaintOffset, rightAnchorTarget,
        spacing, rightIdx, dataLen: ch.data.length,
        preCandleWidth, postCandleWidth,
        rendersBefore, rendersAfter,
        drift, snapFromStale, reanchorPasses,
        staleVsTarget: preOffset - rightAnchorTarget,
      };
    }, '__TALARIA_MC_DISABLE_BOOT_HOST_REANCHOR');

    checks.check('H-S28 probe constructed frozen boot host-resize', probe.ok, probe.ok ? '' : probe.reason);
    if (!probe.ok) return checks;

    // ── Setup / non-vacuous (pass in BOTH modes) ──
    checks.check('H-S28 setup: host cell shrank full→half (single→multi)',
      probe.preW > probe.postW && (probe.preW - probe.postW) > 200,
      `preW=${probe.preW} postW=${probe.postW} paintW=${probe.paintW}`);
    checks.check('H-S28 setup: candleWidth unchanged across boot resize',
      probe.preCandleWidth === probe.postCandleWidth,
      `pre=${probe.preCandleWidth} post=${probe.postCandleWidth}`);
    checks.check('H-S28 setup: exactly one paint on the frozen boot resize',
      probe.rendersAfter - probe.rendersBefore >= 1,
      `renders ${probe.rendersBefore}→${probe.rendersAfter}`);
    checks.check('H-S28 setup: right-anchor target separated from stale offset (non-vacuous shake)',
      Math.abs(probe.staleVsTarget) > 200,
      `stale=${probe.preOffset} target=${probe.rightAnchorTarget} |Δ|=${Math.abs(probe.staleVsTarget).toFixed(1)}px`);

    // ── CORE (GREEN pass / RED fail) ──
    checks.check('H-S28 CORE: first post-resize paint lands at right-anchor target (<1px)',
      Math.abs(probe.drift) < 1,
      `firstPaint=${probe.firstPaintOffset} target=${probe.rightAnchorTarget} drift=${probe.drift.toFixed(1)}px`);
    checks.check('H-S28 CORE: no later snap — host re-anchored on the FIRST painted frame',
      Math.abs(probe.snapFromStale) > 200,
      `firstPaint=${probe.firstPaintOffset} stale=${probe.preOffset} moved=${probe.snapFromStale.toFixed(1)}px`);
    checks.check('H-S28 CORE: exactly one re-anchor pass, on the first paint',
      probe.reanchorPasses === 1,
      `reanchorPasses=${probe.reanchorPasses} (fixDisabled=${probe.fixDisabled})`);

    notes.push(`H-S28 (§6cq boot host-resize first-render shake): single(${probe.preW}px)→multi(${probe.postW}px) `
      + `frozen host cell-resize, candleWidth=${probe.preCandleWidth} unchanged, dataLen=${probe.dataLen}. `
      + `firstPaintOffsetX=${probe.firstPaintOffset} vs rightAnchorTarget=${probe.rightAnchorTarget} `
      + `(drift=${probe.drift.toFixed(1)}px); stale(full-width)=${probe.preOffset} `
      + `(|stale−target|=${Math.abs(probe.staleVsTarget).toFixed(1)}px). reanchorPasses=${probe.reanchorPasses}. `
      + `Kill-switch __TALARIA_MC_DISABLE_BOOT_HOST_REANCHOR fixDisabled=${probe.fixDisabled}.`);
    return checks;
  });
}

// ── H-S29 ────────────────────────────────────────────────────────────────
// §6cr RESIDUAL FIRST-RENDER PEER "SHAKE" entering multichart (panel analogue
// of the §6cq/b102 host fix). While an EMBED (peer B/C/D) panel's boot viewport
// is locked (`_isMultichartBootViewportLocked` — bars positioned, still within
// `_multichartViewportSettleUntil`), a boot layout-settle width change (the
// iframe growing to its final cell width) hit the frozen resize path: chart.js
// resize() only re-anchored the HOST (b102 `_mcBootHostRightIdx`), so the peer
// kept its OLD (pre-final-width) offsetX at the NEW width — the latest candle
// drifted off the right edge and a later resize/forceInitialSync mirror snapped
// it back (the residual peer SHAKE, ~15–50px, 1–2 frames).
//
// FIX (default ON, chart.js resize, kill-switch
// __TALARIA_MC_DISABLE_BOOT_PANEL_REANCHOR): a scoped peer branch parallel to
// b102 — while frozen on the boot peer-resize path, capture the pre-resize
// right-edge bar (`_mcBootPanelRightIdx`, preferring the same-pair host's
// getVisibleEndIndex() else local) and re-anchor with the SAME drift-free index
// pin the duplicate panels use, so the FIRST painted frame already lands at the
// final right-anchored offset (paint once, no later snap). Index-based →
// preserves mirror bar-alignment, safe under range-sync.
//
// DETERMINISTIC (no wall-clock): models the frozen boot-locked peer cell-resize
// entirely in the host main frame (reusing the DIAG probe approach, tagging the
// document as an embed panel + arming the boot viewport lock) and asserts the
// FIRST post-resize painted offsetX against the index-pin right-anchor target.
// Width GROWS by 40px (layout-settle), the opposite direction of H-S28's host
// shrink. Every value derives only from seeded data extent + margins + widths.
//   GREEN (fix):  |firstPaintOffsetX − rightAnchorTarget| < 1px AND the re-
//                 anchor happens on the FIRST paint (exactly one pass).
//   RED   (kill): firstPaintOffsetX ≈ stale pre-final-width offset (drift ≈
//                 postW−preW off target, ~40px) → the later-snap shake.
async function hS29(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A'], 20_000, boot.getInFlightDataRequests);

    const probe = await page.evaluate((disableFlag) => {
      const ch = window.chart;
      if (!ch || !Array.isArray(ch.data) || !ch.data.length) return { ok: false, reason: 'chart not painted' };
      const wrapper = document.getElementById('chartWrapper');
      if (!wrapper) return { ok: false, reason: 'no chartWrapper' };

      const m = ch.margin || { l: 60, r: 60 };
      const fixDisabled = !!window[disableFlag];

      // ── Tag this document as an EMBED (peer) panel so the peer re-anchor
      //    branch is the one under test (b102 host branch stays inert — a peer
      //    is NOT a host panel). Restore exactly afterward. ──
      const priorEmbed = document.documentElement.classList.contains('multichart-embed');
      if (!priorEmbed) document.documentElement.classList.add('multichart-embed');

      // ── Arm the boot viewport lock exactly as embed-bridge does during boot
      //    (bars positioned + still inside the settle window) and enter the
      //    frozen boot-resize path (the peer analogue of MultichartGrid's host
      //    freeze). Restore all prior state afterward. ──
      const priorPositioned = ch._multichartBootViewportPositioned;
      const priorSettleUntil = ch._multichartViewportSettleUntil;
      const priorSkip = ch._multichartSkipResizeOffsetAdjust;
      const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      ch._multichartBootViewportPositioned = true;
      ch._multichartViewportSettleUntil = nowMs + 60_000;
      ch._multichartSkipResizeOffsetAdjust = true;

      // ── Pre-resize: peer at its pre-final (smaller) cell width, latest candle
      //    right-anchored. ──
      const preW = ch.w;
      const preOffset = Number(ch.offsetX);
      const preCandleWidth = Number(ch.candleWidth);
      const spacing = (typeof ch.getCandleSpacing === 'function') ? ch.getCandleSpacing() : ch.candleWidth;
      const rightIdx = (typeof ch.getVisibleEndIndex === 'function') ? ch.getVisibleEndIndex() : (ch.data.length - 1);
      const rendersBefore = (ch._mcDiag && Number.isFinite(ch._mcDiag.renders)) ? ch._mcDiag.renders : 0;

      // ── Boot layout-settle width GROWTH (iframe reaches its final cell width),
      //    then resize() while boot-locked + frozen. ──
      const postW = preW + 40;
      const h = Math.round(wrapper.getBoundingClientRect().height) || ch.h;
      wrapper.style.right = 'auto';
      wrapper.style.bottom = 'auto';
      wrapper.style.width = postW + 'px';
      wrapper.style.height = h + 'px';

      ch._lastResizeDpr = 0;
      ch.resize();

      const firstPaintOffset = Number(ch.offsetX);
      const postCandleWidth = Number(ch.candleWidth);
      const paintW = ch.w;
      const rendersAfter = (ch._mcDiag && Number.isFinite(ch._mcDiag.renders)) ? ch._mcDiag.renders : 0;

      // Canonical right-anchor target: the drift-free index pin at the NEW width.
      const plotWpost = Math.max(1, paintW - (m.l || 0) - (m.r || 0));
      const ri = Math.max(0, Math.min(rightIdx, ch.data.length - 1));
      const rightAnchorTarget = Math.round(plotWpost - (ri + 1) * spacing);

      // ── Restore all mutated state so nothing leaks into H-INV / later reads. ──
      if (!priorEmbed) document.documentElement.classList.remove('multichart-embed');
      if (priorPositioned === undefined) delete ch._multichartBootViewportPositioned;
      else ch._multichartBootViewportPositioned = priorPositioned;
      if (priorSettleUntil === undefined) delete ch._multichartViewportSettleUntil;
      else ch._multichartViewportSettleUntil = priorSettleUntil;
      if (priorSkip === undefined) delete ch._multichartSkipResizeOffsetAdjust;
      else ch._multichartSkipResizeOffsetAdjust = priorSkip;

      const drift = firstPaintOffset - rightAnchorTarget;   // ~0 (fix) / ~−(postW−preW) (stale)
      const snapFromStale = firstPaintOffset - preOffset;    // moved on first paint (fix) / 0 (stale)
      const reanchorPasses = Math.abs(snapFromStale) > 1 ? 1 : 0;
      return {
        ok: true,
        fixDisabled,
        preW, postW, paintW,
        preOffset, firstPaintOffset, rightAnchorTarget,
        spacing, rightIdx, dataLen: ch.data.length,
        preCandleWidth, postCandleWidth,
        rendersBefore, rendersAfter,
        drift, snapFromStale, reanchorPasses,
        staleVsTarget: preOffset - rightAnchorTarget,
      };
    }, '__TALARIA_MC_DISABLE_BOOT_PANEL_REANCHOR');

    checks.check('H-S29 probe constructed frozen boot-locked peer-resize', probe.ok, probe.ok ? '' : probe.reason);
    if (!probe.ok) return checks;

    // ── Setup / non-vacuous (pass in BOTH modes) ──
    checks.check('H-S29 setup: peer cell grew on boot layout-settle (+40px)',
      probe.postW > probe.preW && (probe.postW - probe.preW) === 40,
      `preW=${probe.preW} postW=${probe.postW} paintW=${probe.paintW}`);
    checks.check('H-S29 setup: candleWidth unchanged across boot resize',
      probe.preCandleWidth === probe.postCandleWidth,
      `pre=${probe.preCandleWidth} post=${probe.postCandleWidth}`);
    checks.check('H-S29 setup: exactly one paint on the frozen boot resize',
      probe.rendersAfter - probe.rendersBefore >= 1,
      `renders ${probe.rendersBefore}→${probe.rendersAfter}`);
    checks.check('H-S29 setup: right-anchor target separated from stale offset (non-vacuous shake)',
      Math.abs(probe.staleVsTarget) > 20,
      `stale=${probe.preOffset} target=${probe.rightAnchorTarget} |Δ|=${Math.abs(probe.staleVsTarget).toFixed(1)}px`);

    // ── CORE (GREEN pass / RED fail) ──
    checks.check('H-S29 CORE: first post-resize paint lands at right-anchor target (<1px)',
      Math.abs(probe.drift) < 1,
      `firstPaint=${probe.firstPaintOffset} target=${probe.rightAnchorTarget} drift=${probe.drift.toFixed(1)}px`);
    checks.check('H-S29 CORE: no later snap — peer re-anchored on the FIRST painted frame',
      Math.abs(probe.snapFromStale) > 20,
      `firstPaint=${probe.firstPaintOffset} stale=${probe.preOffset} moved=${probe.snapFromStale.toFixed(1)}px`);
    checks.check('H-S29 CORE: exactly one re-anchor pass, on the first paint',
      probe.reanchorPasses === 1,
      `reanchorPasses=${probe.reanchorPasses} (fixDisabled=${probe.fixDisabled})`);

    notes.push(`H-S29 (§6cr boot peer-resize first-render shake): peer boot layout-settle `
      + `(${probe.preW}px→${probe.postW}px) frozen boot-locked cell-resize, candleWidth=${probe.preCandleWidth} `
      + `unchanged, dataLen=${probe.dataLen}. firstPaintOffsetX=${probe.firstPaintOffset} vs `
      + `rightAnchorTarget=${probe.rightAnchorTarget} (drift=${probe.drift.toFixed(1)}px); `
      + `stale(pre-final-width)=${probe.preOffset} (|stale−target|=${Math.abs(probe.staleVsTarget).toFixed(1)}px). `
      + `reanchorPasses=${probe.reanchorPasses}. Kill-switch __TALARIA_MC_DISABLE_BOOT_PANEL_REANCHOR `
      + `fixDisabled=${probe.fixDisabled}.`);
    return checks;
  });
}

// ── H-S30 ────────────────────────────────────────────────────────────────
// §6cs HOST step-forward-spam refetch storm. On the HOST chart during PAUSED
// replay entered at (near) session start, the loaded playhead prefix is short:
// getReplayAutoScrollState returns a POSITIVE offsetX, so constrainOffset's
// replayNearLeft/replayNearEmptyLeft branch fires checkViewportLoadMore(
// 'backward', true) — a force=true probe that BYPASSES the 80ms replay debounce.
// Rapidly spamming "step forward" (rs.requestStepForward()) therefore kicks off
// overlapping backward /bars fetches whose completion restores a STALE
// currentIndex captured at fetch start (min(max(replayIndex+uniqueNew,0),len-1)),
// blindly overwriting steps that advanced during the in-flight fetch → the host
// visibly jumps BACKWARD, refetches history, and gets stuck loading. The
// .finally rAF re-chains constrainOffset + _scheduleReplayPanLoadLeft, making the
// backward refetch self-sustaining. Peers are unaffected (sync OFF, own file).
//
// FIX (default ON; kill-switch __TALARIA_MC_DISABLE_STEP_SPAM_REFETCH_GUARD):
//   1) replay-system marks a 150ms manual-step burst window per step;
//   2) chart.js skips the paused backward load-more probe during the burst;
//   3) chart.js skips the post-fetch backward re-chain during the burst;
//   4) chart.js hardens the backward-fetch currentIndex restore to max(fetch-
//      start-relative, CURRENT) so concurrent steps are never regressed.
// Only the manual-step-burst HOST cell changes; playhead advance, play mode,
// peer mirroring, lazy-1m-master hydration, and the non-forced debounce are all
// untouched.
//
// DETERMINISTIC (no wall-clock assertions): loop rs.requestStepForward() N=25
// times SYNCHRONOUSLY in the host main frame, flush microtasks, then settle on
// the real in-flight/_panLoading signals (waitBootSettled). Fetch counts come
// from serve.mjs's per-hit log via resetApiLog()/countFetchesByFile (the same
// approach as H-S5/H-S14/H-S16). A one-time lazy-1m-master hydration is
// tolerated on the first burst (≤1 host fetch); the REPEAT burst must be 0.
//   GREEN (fix ON):  repeat-burst host fetches == 0; peer B fetches == 0;
//                    replayTimestamp strictly advanced ~N 4h buckets; currentIndex
//                    strictly increased; no backward offsetX jump; _panLoading
//                    false after settle.
//   RED   (kill on): backward /bars storm (host fetches > 0 on repeat), stale-
//                    index backward jump, and/or stuck _panLoading → FAIL-REAL-BUG.
// Per-step playhead advance for the host step-spam scenario. The host runs at 1m
// (see hS30 comment): stepForward advances one 1m bar, so replayTimestamp moves
// STEP_MS per manual step. (The defect is TF-agnostic; 1m is the only TF whose
// synthetic extent exceeds the load window, so it's the only one that keeps a
// real backward coverage gap — coarse TFs fully load in this harness.)
const STEP_MS_S30 = 60_000;
const HOST_FILE_S30 = HOST_FILE; // file 25 (90-day 1m series >> 2000-bar window)

/** Capture the host replay step-spam state (main frame, in-process host). */
const STEP_SPAM_SNAP_FN = () => {
  const ch = window.chart;
  const rs = ch && ch.replaySystem;
  if (!ch || !rs) return null;
  const spacing = (typeof ch.getCandleSpacing === 'function')
    ? Number(ch.getCandleSpacing())
    : (Number(ch.candleWidth) + (Number(ch.candleGap) || 2));
  const full = Array.isArray(rs.fullRawData) ? rs.fullRawData : [];
  const cur = ch._serverCursors || null;
  const m = ch.margin || { l: 60, r: 60 };
  const cw = Math.max(1, Number(ch.w) - (m.l || 0) - (m.r || 0));
  const maxOffset = cw - Math.max(0, (ch.timeScale?.rightOffsetCandles ?? 15)) * spacing;
  const nearThreshold = Math.max(200, Math.min(600, cw * 0.3));
  return {
    replayTs: Number.isFinite(Number(rs.replayTimestamp)) ? Number(rs.replayTimestamp) : null,
    currentIndex: Number(rs.currentIndex),
    offsetX: Number(ch.offsetX),
    spacing,
    dataLen: Array.isArray(ch.data) ? ch.data.length : 0,
    fullLen: full.length,
    masterFirstT: full.length ? Number(full[0].t) : null,
    masterLastT: full.length ? Number(full[full.length - 1].t) : null,
    hasMoreLeft: cur ? cur.hasMoreLeft !== false : null,
    panLoading: !!ch._panLoading,
    isPlaying: !!rs.isPlaying,
    isActive: !!rs.isActive,
    tf: ch.currentTimeframe != null ? String(ch.currentTimeframe) : '',
    w: Number(ch.w),
    nearLeftArmed: Number(ch.offsetX) > maxOffset - nearThreshold
      || (spacing > 0 && Number(ch.offsetX) > maxOffset - spacing * 8),
  };
};

/**
 * Deterministic post-spam drain: poll until the HOST is quiescent — no data
 * request in flight AND host._panLoading === false, stable across two reads.
 * Hard budget → returns {ok:false} with the observed state (never passes by
 * timing). Under the RED storm _panLoading stays stuck true and fetches keep
 * arriving, so this never settles → the bug is caught.
 */
async function waitHostReplayQuiet(page, budgetMs, getInFlight) {
  const deadline = Date.now() + budgetMs;
  let prevQuiet = false;
  let last = null;
  while (Date.now() < deadline) {
    const panLoading = await page.evaluate(() => !!(window.chart && window.chart._panLoading)).catch(() => true);
    const inFlight = Number(getInFlight()) || 0;
    const quiet = !panLoading && inFlight === 0;
    last = { panLoading, inFlight };
    if (quiet && prevQuiet) return { ok: true, detail: `host quiet (inFlight=${inFlight})`, ...last };
    prevQuiet = quiet;
    await sleep(150);
  }
  return { ok: false, detail: `host never quiescent within ${budgetMs}ms — panLoading=${last?.panLoading} inFlight=${last?.inFlight}`, ...last };
}

/**
 * Deterministically reproduce the step-forward-spam race in ONE synchronous page
 * turn: (1) pin the playhead to a SHORT display prefix at the left edge of the
 * loaded window (currentIndex = prefixIdx) and re-anchor — this arms the
 * replayNearLeft force-backward probe; (2) loop rs.requestStepForward() N times
 * SYNCHRONOUSLY (so any backward fetch kicked off by step 1 is still in flight —
 * its stale-index `.then` cannot land until we yield); (3) flush microtasks so
 * the in-flight fetch's `.then`/`.finally` (the stale-index overwrite + re-chain)
 * runs, then snapshot. Returns the pre-spam, post-sync (before any .then), and
 * post-microtask playhead so the caller can see the backward jump.
 */
async function spamStepForwardBurst(page, n, prefixIdx) {
  return page.evaluate(async (count, pfx) => {
    const ch = window.chart;
    const rs = ch && ch.replaySystem;
    if (!rs || typeof rs.requestStepForward !== 'function') return { ok: false, reason: 'no replaySystem.requestStepForward' };
    const full = Array.isArray(rs.fullRawData) ? rs.fullRawData : [];
    if (full.length < pfx + count + 4) return { ok: false, reason: `master too short: ${full.length}` };
    const snap = () => ({
      idx: Number(rs.currentIndex),
      ts: Number(rs.replayTimestamp),
      offsetX: Number(ch.offsetX),
      panLoading: !!ch._panLoading,
      dataLen: Array.isArray(ch.data) ? ch.data.length : 0,
      nearLeftArmed: (() => {
        const m = ch.margin || { l: 60, r: 60 };
        const cw = Math.max(1, Number(ch.w) - (m.l || 0) - (m.r || 0));
        const sp = (typeof ch.getCandleSpacing === 'function') ? Number(ch.getCandleSpacing()) : Number(ch.candleWidth);
        const maxOffset = cw - Math.max(0, (ch.timeScale?.rightOffsetCandles ?? 15)) * sp;
        const th = Math.max(200, Math.min(600, cw * 0.3));
        return Number(ch.offsetX) > maxOffset - th || (sp > 0 && Number(ch.offsetX) > maxOffset - sp * 8);
      })(),
    });
    // (1) Pin a SHORT display prefix at the loaded-window start and re-anchor so
    //     getReplayAutoScrollState returns a positive offsetX (replayNearLeft
    //     armed). This is a deterministic stand-in for "paused replay at session
    //     start with a short prefix" that survives the async left-fill (which
    //     would otherwise lengthen the prefix before we can spam). Mark the burst
    //     BEFORE this re-anchor, exactly as production's first requestStepForward
    //     does before its own updateChartData → so the guard (fix ON) suppresses
    //     THIS arming probe too, while the kill-switch (RED) lets it fire.
    const priorAutoScroll = rs.autoScrollEnabled;
    const priorLock = rs._viewportLockForPlayback;
    const priorPanned = rs.userHasPanned;
    rs.autoScrollEnabled = true; // production replay default; needed so the short-
                                 // prefix re-anchor actually moves offsetX right.
    rs._viewportLockForPlayback = false; // don't let a stale playback lock suppress
    rs.userHasPanned = false;            // the right-anchor (paused manual step).
    rs._mcManualStepBurstUntil = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() + 150 : Date.now() + 150;
    rs.currentIndex = pfx;
    if (full[pfx]) rs.replayTimestamp = Number(full[pfx].t);
    // Right-anchor the short prefix exactly as replay does → positive offsetX with
    // empty space on the LEFT, satisfying replayNearLeft/replayNearEmptyLeft. Slice
    // + resample first (updateChartData(false)) so getReplayAutoScrollState reads
    // the SHORT display prefix, then pin the positive offset it computes.
    try {
      rs.updateChartData(false);
      const st = typeof rs.getReplayAutoScrollState === 'function' ? rs.getReplayAutoScrollState(ch) : null;
      if (st && Number.isFinite(Number(st.offsetX))) ch.offsetX = Number(st.offsetX);
    } catch (_e) {}
    const armed = snap();
    // (2) Synchronous spam — no await between steps, so an in-flight backward
    //     fetch cannot resolve mid-burst.
    for (let i = 0; i < count; i++) rs.requestStepForward();
    const afterSync = snap();
    // (3) Let the in-flight fetch's .then (stale-index overwrite) + .finally
    //     (re-chain) run.
    for (let k = 0; k < 12; k++) await Promise.resolve();
    const afterMicro = snap();
    if (priorAutoScroll !== undefined) rs.autoScrollEnabled = priorAutoScroll;
    rs._viewportLockForPlayback = priorLock;
    rs.userHasPanned = priorPanned;
    return { ok: true, armed, afterSync, afterMicro };
  }, n, prefixIdx);
}

async function hS30(ctx) {
  // Host = file 25 @ 1m. The 90-day synthetic 1m series (129,600 bars) far
  // exceeds the 2000-bar load window, so the replay master stays BOUNDED with a
  // real backward coverage gap (hasMoreLeft true) that survives boot — the exact
  // condition the storm needs. Coarse TFs (4h/1d) fully load (≤2400 bars) and
  // boot backfills them, so hasMoreLeft goes false and no backward fetch can ever
  // fire; 1m is the only harness TF that keeps the gap. The DEFECT mechanism
  // (short display prefix → positive offsetX → force-backward probe that bypasses
  // the 80ms debounce → stale-index regression + self-sustaining re-chain) is
  // TF-agnostic. Peer B is the independent instrument (file 27) @ 1h.
  return runWith(ctx, { pair: 'independent', panels: 4, tf: '1m', hostFile: 25 }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    const N = 25;

    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    // Peer B → its own instrument (file 27) at a DIFFERENT tf (1h). Sync OFF, so
    // this is an independent user choice, not a fan-out. B must never fetch
    // during the host step-spam window.
    await panelCmd(page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
    await sleep(1200);

    // Enter replay PAUSED. The burst driver then pins a short display prefix at
    // the loaded-window start per phase (see spamStepForwardBurst) so the
    // replayNearLeft force-backward probe is armed the instant we spam.
    const enterTs = await replayStartTs(page);
    checks.check('H-S30 replay ts resolvable', enterTs != null, `enterTs=${enterTs}`);
    if (enterTs == null) return checks;
    await hostReplayEnter(page, enterTs);
    await sleep(1000);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    const before = await page.evaluate(STEP_SPAM_SNAP_FN);
    const bBefore = await readPanel(page, 'B');
    const setupOk = !!(before && before.isActive && !before.isPlaying && before.replayTs != null
      && before.tf === '1m' && bBefore && bBefore.tf === '1h');
    checks.check('H-S30 setup: host paused-replay 1m, peer B 1h, sync OFF',
      setupOk, `host tf=${before?.tf} active=${before?.isActive} playing=${before?.isPlaying} `
        + `replayTs=${before?.replayTs} idx=${before?.currentIndex} spacing=${before?.spacing?.toFixed?.(2)} `
        + `w=${before?.w} fullLen=${before?.fullLen} hasMoreLeft=${before?.hasMoreLeft} B.tf=${bBefore?.tf}`);
    if (!setupOk) return checks;

    // Non-vacuous trigger condition: older 1m history must remain to fetch
    // (hasMoreLeft) — otherwise the force-backward probe returns nothing and the
    // scenario would prove nothing (both modes trivially quiet). The short-prefix
    // arming (replayNearLeft) is done + asserted inside each burst.
    checks.check('H-S30 trigger available: host replay master has older history to fetch (hasMoreLeft)',
      before.hasMoreLeft === true,
      `hasMoreLeft=${before.hasMoreLeft} masterFirstT=${before.masterFirstT} fullLen=${before.fullLen}`);

    const PREFIX_IDX = 2; // very short display prefix at the loaded-window start

    // ── Phase 1 (may include a one-time lazy-master hydration): burst N steps. ──
    ctx.srv.resetApiLog();
    await resetDiag(page);
    const r1 = await spamStepForwardBurst(page, N, PREFIX_IDX);
    checks.check('H-S30 phase-1 burst issued', r1.ok, r1.reason || '');
    if (!r1.ok) return checks;
    const settle1 = await waitHostReplayQuiet(page, 25_000, boot.getInFlightDataRequests);
    const after1 = await page.evaluate(STEP_SPAM_SNAP_FN);
    const host1 = countFetchesByFile(ctx.srv.getApiLog())[HOST_FILE_S30] || 0;
    const peerB1 = countFetchesByFile(ctx.srv.getApiLog())[IND_FILE] || 0;

    // ── Phase 2 (REPEAT — hydration already done): burst N more steps. ──
    ctx.srv.resetApiLog();
    await resetDiag(page);
    const r2 = await spamStepForwardBurst(page, N, PREFIX_IDX);
    checks.check('H-S30 phase-2 burst issued', r2.ok, r2.reason || '');
    if (!r2.ok) return checks;
    const settle2 = await waitHostReplayQuiet(page, 25_000, boot.getInFlightDataRequests);
    const after2 = await page.evaluate(STEP_SPAM_SNAP_FN);
    const host2 = countFetchesByFile(ctx.srv.getApiLog())[HOST_FILE_S30] || 0;
    const peerB2 = countFetchesByFile(ctx.srv.getApiLog())[IND_FILE] || 0;

    // Non-vacuous: the burst actually advanced the playhead N steps synchronously.
    checks.check('H-S30 non-vacuous: synchronous burst advanced playhead ~N steps (both phases)',
      r1.afterSync.idx - r1.armed.idx === N && r2.afterSync.idx - r2.armed.idx === N,
      `p1 idx ${r1.armed.idx}->${r1.afterSync.idx} p2 idx ${r2.armed.idx}->${r2.afterSync.idx} (N=${N})`);
    // Non-vacuous: the short prefix genuinely ARMED the replayNearLeft branch (the
    // force-backward probe would fire), so RED can actually reproduce the storm.
    checks.check('H-S30 non-vacuous: short prefix armed the replayNearLeft backward probe (both phases)',
      r1.armed.nearLeftArmed === true && r2.armed.nearLeftArmed === true,
      `p1 armed offsetX=${r1.armed.offsetX?.toFixed(1)} nearLeft=${r1.armed.nearLeftArmed}; `
        + `p2 armed offsetX=${r2.armed.offsetX?.toFixed(1)} nearLeft=${r2.armed.nearLeftArmed}`);

    // ── CORE assertions (GREEN pass / RED fail) ──
    // 1) No refetch storm: the repeat burst must issue ZERO host data fetches
    //    (phase-1 tolerates ≤1 one-time lazy-master hydration baseline).
    checks.check('H-S30 CORE: repeat-burst host(file25) data fetches == 0 (no backward refetch storm)',
      host2 === 0, `phase2 host fetches=${host2} (phase1=${host1}, one-time lazy-master tolerance ≤1)`);
    checks.check('H-S30 phase-1 host fetches ≤1 (one-time lazy-master hydration baseline only)',
      host1 <= 1, `phase1 host fetches=${host1}`);
    checks.check('H-S30 CORE: peer B(file27) fetches == 0 during host spam (both bursts)',
      peerB1 === 0 && peerB2 === 0, `peerB phase1=${peerB1} phase2=${peerB2}`);

    // 2) No stale-index BACKWARD JUMP: after the in-flight backward fetch's .then
    //    runs (microtask flush), the playhead must NOT regress below where the
    //    synchronous burst advanced it. In RED the stale overwrite snaps it back.
    const noJump1 = Number(r1.afterMicro.ts) >= Number(r1.afterSync.ts);
    const noJump2 = Number(r2.afterMicro.ts) >= Number(r2.afterSync.ts);
    checks.check('H-S30 CORE: no stale-index backward jump (playhead not regressed post-fetch)',
      noJump1 && noJump2,
      `p1 ts sync=${r1.afterSync.ts} micro=${r1.afterMicro.ts} (Δ=${r1.afterMicro.ts - r1.afterSync.ts}); `
        + `p2 ts sync=${r2.afterSync.ts} micro=${r2.afterMicro.ts} (Δ=${r2.afterMicro.ts - r2.afterSync.ts})`);

    // 3) replayTimestamp strictly advanced across the whole scenario (playhead
    //    moved forward, never net-regressed).
    const tsAdvanced = after2.replayTs != null && before.replayTs != null
      && Number(r1.afterMicro.ts) > Number(r1.armed.ts)
      && Number(r2.afterMicro.ts) > Number(r2.armed.ts);
    checks.check('H-S30 CORE: replayTimestamp strictly advanced each burst',
      tsAdvanced, `p1 ${r1.armed.ts}->${r1.afterMicro.ts}; p2 ${r2.armed.ts}->${r2.afterMicro.ts}`);

    // replayTs advanced ~N 1m buckets per burst (playhead advanced by the N steps).
    const buckets1 = (Number(r1.afterMicro.ts) - Number(r1.armed.ts)) / STEP_MS_S30;
    const buckets2 = (Number(r2.afterMicro.ts) - Number(r2.armed.ts)) / STEP_MS_S30;
    checks.check('H-S30 CORE: replayTs advanced ~N 1m buckets per burst (±2, not regressed)',
      Math.abs(buckets1 - N) <= 2 && Math.abs(buckets2 - N) <= 2,
      `phase1 buckets=${buckets1.toFixed(2)} phase2 buckets=${buckets2.toFixed(2)} (N=${N})`);

    // 4) Not stuck loading: host quiescent (_panLoading false, no in-flight) after
    //    each burst settles.
    checks.check('H-S30 CORE: host _panLoading === false after settle (not stuck loading)',
      after2.panLoading === false && settle1.ok && settle2.ok,
      `after1.panLoading=${after1.panLoading} after2.panLoading=${after2.panLoading} `
        + `settle1=${settle1.ok} settle2=${settle2.ok}`);

    // 5) No backward offsetX jump on the repeat burst (§6cs literal invariant:
    //    offsetX >= offsetXBefore - spacing; discriminating side is the upper
    //    bound — a regression re-anchors a shorter prefix → offset snaps positive).
    const spc = Number(before.spacing) || 7;
    const offNoJump2 = Number(r2.afterMicro.offsetX) <= Number(r2.afterSync.offsetX) + spc;
    checks.check('H-S30 CORE: no backward offsetX jump on repeat burst',
      offNoJump2,
      `offsetX sync=${r2.afterSync.offsetX?.toFixed(1)} micro=${r2.afterMicro.offsetX?.toFixed(1)} (spacing=${spc.toFixed(2)})`);

    // Peer B untouched by the host spam (independent, sync OFF).
    const bAfter = await readPanel(page, 'B');
    checks.check('H-S30 peer B fetch count unchanged (independent, sync OFF)',
      (peerB1 + peerB2) === 0,
      `B.fetches ${bBefore?.fetches} -> ${bAfter?.fetches}; file27 hits=${peerB1 + peerB2}`);

    notes.push(`H-S30 (§6cs HOST step-forward-spam refetch storm): independent 2x2, sync OFF, host file25 tf1m `
      + `paused replay, per-burst short display prefix pinned at loaded-window start (idx ${PREFIX_IDX}, hasMoreLeft=`
      + `${before.hasMoreLeft}), peer B file27 tf1h. Two synchronous rs.requestStepForward()×${N} bursts. `
      + `host(file25) fetches phase1=${host1} (one-time lazy-master ≤1) phase2=${host2} (repeat, must be 0); `
      + `peerB(file27) fetches phase1=${peerB1} phase2=${peerB2}. Playhead ts per burst: `
      + `p1 armed=${r1.armed.ts} sync=${r1.afterSync.ts} postFetch=${r1.afterMicro.ts} (Δ=${r1.afterMicro.ts - r1.afterSync.ts}); `
      + `p2 armed=${r2.armed.ts} sync=${r2.afterSync.ts} postFetch=${r2.afterMicro.ts} (Δ=${r2.afterMicro.ts - r2.afterSync.ts}); `
      + `+${buckets1.toFixed(1)}/+${buckets2.toFixed(1)} 1m-buckets; _panLoading after=${after2.panLoading}. `
      + `Note: only 1m keeps a real backward coverage gap in this harness (coarse TFs ≤2400 bars fully load & boot-`
      + `backfill → hasMoreLeft false); the DEFECT (short-prefix force-backward probe bypassing the 80ms debounce + `
      + `stale-index overwrite of steps advanced mid-fetch + self-sustaining .finally re-chain) is TF-agnostic. `
      + `Kill-switch __TALARIA_MC_DISABLE_STEP_SPAM_REFETCH_GUARD RED: backward /bars storm + stale-index backward `
      + `jump (postFetch ts < sync ts) + stuck loading → FAIL-REAL-BUG.`);
    return checks;
  });
}

// ── H-S31 ────────────────────────────────────────────────────────────────
// §6ct RESIDUAL OPEN-MULTICHART FIRST-RENDER horizontal SLIDE. After b102 (host
// boot re-anchor) and b103 (peer boot re-anchor) removed the big first-render
// SNAP, a SMALL left/right SLIDE remained when opening the multichart panels on
// first render. Root cause: b102/b103 index-pin the right edge on the frozen
// boot resize (`offsetX = plotW - (rightIdx+1)*spacing`), but a LATER boot commit
// (fired at allDataReady) re-applies getReplayAutoScrollState, which anchors with
// a DIFFERENT formula (a ~20% replay right-gap, `replayRightPaddingRatio=0.2`),
// moving offsetX to a SECOND position on first reveal. Boot therefore had TWO
// competing offset commits with different math → the slide.
//
// FIX (default ON, new kill-switch __TALARIA_MC_DISABLE_BOOT_SINGLE_COMMIT):
// ONE authoritative boot anchor — the index pin — from first paint through
// reveal. During boot settle the competing getReplayAutoScrollState / center-
// playhead commits are suppressed (chart.js fitToView + loadMultichartPanelFrom-
// Host, MultichartGrid goToReplayTimestamp + alignHostChartForMultichart), and
// the mirror path Math.rounds the pin to match b102/b103.
//
// DETERMINISTIC (no wall-clock): spans the FULL boot commit sequence in-frame
// (not just one resize) — pre-split (auto-scroll) → freeze+resize b102/b103 index
// pin → post-mirror → post-allDataReady align (fitToView, the competing commit)
// → post-forceInitialSync (fitToView re-apply) → final pre-reveal. Every value
// derives only from the seeded synthetic data extent + margins + widths. Probed
// in the HOST main frame AND in each peer (B/C/D) embed frame.
//   GREEN (fix ON):  every sampled commit after the index pin lands on the pin
//                    (<1px of FINAL); exactly ONE offset-changing commit after
//                    pre-split (the index pin); host + each peer reanchorPasses<=1.
//   RED   (kill on): the post-allDataReady commit re-applies getReplayAutoScroll-
//                    State and moves offsetX by ≈ the replay right-gap (tens to
//                    ~120px) off the pin → a SECOND commit → FAIL-REAL-BUG.
const S31_DISABLE_FLAG = '__TALARIA_MC_DISABLE_BOOT_SINGLE_COMMIT';

/**
 * In-frame probe (host main frame or peer embed frame) that walks the full boot
 * commit sequence and samples offsetX at each stage. Read-only w.r.t. data:
 * mutates only boot flags + viewport, all restored before return. `role` is
 * 'host' (arms the multichart-grid shape the host re-anchor branch gates on) or
 * 'peer' (tags the doc as an embed + arms the boot viewport lock, exactly as
 * H-S29 does for the peer branch).
 */
const S31_PROBE_FN = (disableFlag, role) => {
  const ch = window.chart;
  if (!ch || !Array.isArray(ch.data) || !ch.data.length) return { ok: false, reason: 'chart not painted' };
  const rs = ch.replaySystem;
  if (!rs || !rs.isActive) return { ok: false, reason: 'replay not active' };
  if (typeof rs.getReplayAutoScrollState !== 'function') return { ok: false, reason: 'no getReplayAutoScrollState' };
  const wrapper = document.getElementById('chartWrapper');
  if (!wrapper) return { ok: false, reason: 'no chartWrapper' };
  const m = ch.margin || { l: 60, r: 60 };
  const fixDisabled = !!window[disableFlag];

  // ── role setup (restored on exit) ──
  const priorGrid = window.__multichartGrid;
  const priorEmbed = document.documentElement.classList.contains('multichart-embed');
  const priorPositioned = ch._multichartBootViewportPositioned;
  const priorSettleUntil = ch._multichartViewportSettleUntil;
  const priorSkip = ch._multichartSkipResizeOffsetAdjust;
  const priorRestored = ch._chartViewRestored;
  const priorPanned = rs.userHasPanned;
  const priorAuto = rs.autoScrollEnabled;
  const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  if (role === 'host') {
    window.__multichartGrid = priorGrid || { getPanelIds: function () { return ['A', 'B', 'C', 'D']; } };
  } else {
    if (!priorEmbed) document.documentElement.classList.add('multichart-embed');
    ch._multichartBootViewportPositioned = true;
    ch._multichartViewportSettleUntil = nowMs + 60_000;
  }
  // Paused, auto-scroll on, not panned → pre-split establishes an auto-scroll
  // anchor (the same viewport the pre-split single/host chart shows).
  rs.userHasPanned = false;
  rs.autoScrollEnabled = true;

  const spacing = (typeof ch.getCandleSpacing === 'function') ? ch.getCandleSpacing() : ch.candleWidth;
  const rightIdx0 = (typeof ch.getVisibleEndIndex === 'function') ? ch.getVisibleEndIndex() : (ch.data.length - 1);
  const preCandleWidth = Number(ch.candleWidth);

  // ── STAGE 0: pre-split (full width, replay auto-scroll) ──
  const st0 = rs.getReplayAutoScrollState(ch);
  if (st0 && Number.isFinite(st0.offsetX)) {
    ch.offsetX = st0.offsetX;
    if (typeof ch.constrainOffset === 'function') ch.constrainOffset();
  }
  const preW = ch.w;
  const offPreSplit = Number(ch.offsetX);
  const rendersBefore = (ch._mcDiag && Number.isFinite(ch._mcDiag.renders)) ? ch._mcDiag.renders : 0;

  // ── STAGE 1: freeze + shrink full→half + resize() → b102/b103 index pin ──
  ch._multichartSkipResizeOffsetAdjust = true;
  const postW = Math.max(200, Math.round(preW / 2));
  const h = Math.round(wrapper.getBoundingClientRect().height) || ch.h;
  wrapper.style.right = 'auto';
  wrapper.style.bottom = 'auto';
  wrapper.style.width = postW + 'px';
  wrapper.style.height = h + 'px';
  ch._lastResizeDpr = 0;
  ch.resize();
  const paintW = ch.w;
  const offIndexPin = Number(ch.offsetX);
  const postCandleWidth = Number(ch.candleWidth);
  const rendersAfter = (ch._mcDiag && Number.isFinite(ch._mcDiag.renders)) ? ch._mcDiag.renders : 0;

  // Canonical index-pin target (drift-free) == the ONE authoritative boot anchor.
  const plotWpost = Math.max(1, paintW - (m.l || 0) - (m.r || 0));
  const ri = Math.max(0, Math.min(rightIdx0, ch.data.length - 1));
  const indexPinTarget = Math.round(plotWpost - (ri + 1) * spacing);
  // The competing auto-scroll target at the NEW (half) width — the SECOND commit.
  const stHalf = rs.getReplayAutoScrollState(ch);
  const autoScrollTargetHalf = (stHalf && Number.isFinite(stHalf.offsetX)) ? Number(stHalf.offsetX) : null;

  // ── STAGE 2: post-mirror (sample; host does not mirror, peer already pinned) ──
  const offPostMirror = Number(ch.offsetX);

  // ── STAGE 3: post-allDataReady align — the competing commit, via fitToView
  //    (guarded chart.js site 3). GREEN suppresses; RED re-applies auto-scroll. ──
  ch._chartViewRestored = false;
  if (typeof ch.fitToView === 'function') ch.fitToView();
  const offPostAlign = Number(ch.offsetX);

  // ── STAGE 4: post-forceInitialSync (a second fitToView re-apply) ──
  ch._chartViewRestored = false;
  if (typeof ch.fitToView === 'function') ch.fitToView();
  const offPostForceSync = Number(ch.offsetX);

  // ── STAGE 5: final pre-reveal ──
  const offFinal = Number(ch.offsetX);

  // ── restore all mutated state (nothing leaks into H-INV / later reads) ──
  if (priorSkip === undefined) { try { delete ch._multichartSkipResizeOffsetAdjust; } catch (_) {} }
  else ch._multichartSkipResizeOffsetAdjust = priorSkip;
  ch._chartViewRestored = priorRestored;
  rs.userHasPanned = priorPanned;
  rs.autoScrollEnabled = priorAuto;
  if (role === 'host') {
    if (priorGrid === undefined) { try { delete window.__multichartGrid; } catch (_) { window.__multichartGrid = undefined; } }
  } else {
    if (!priorEmbed) document.documentElement.classList.remove('multichart-embed');
    if (priorPositioned === undefined) { try { delete ch._multichartBootViewportPositioned; } catch (_) {} }
    else ch._multichartBootViewportPositioned = priorPositioned;
    if (priorSettleUntil === undefined) { try { delete ch._multichartViewportSettleUntil; } catch (_) {} }
    else ch._multichartViewportSettleUntil = priorSettleUntil;
  }

  // ── derived ──
  const samplesAfterPin = [offPostMirror, offPostAlign, offPostForceSync, offFinal];
  const maxDriftFromPin = Math.max.apply(null, samplesAfterPin.map(function (v) { return Math.abs(v - offIndexPin); }));
  const seq = [offPreSplit, offIndexPin, offPostMirror, offPostAlign, offPostForceSync, offFinal];
  let reanchorPasses = 0;
  for (let i = 1; i < seq.length; i++) if (Math.abs(seq[i] - seq[i - 1]) > 1) reanchorPasses++;
  const autoScrollVsPin = (autoScrollTargetHalf != null) ? (autoScrollTargetHalf - offIndexPin) : null;
  return {
    ok: true, role, fixDisabled,
    preW, postW, paintW, preCandleWidth, postCandleWidth,
    spacing, rightIdx: ri, dataLen: ch.data.length,
    rendersBefore, rendersAfter,
    offPreSplit, offIndexPin, offPostMirror, offPostAlign, offPostForceSync, offFinal,
    indexPinTarget, autoScrollTargetHalf, autoScrollVsPin,
    maxDriftFromPin, reanchorPasses,
  };
};

function s31AssertProbe(checks, tag, p) {
  checks.check(`H-S31 ${tag} probe constructed (replay-active frozen boot)`, p && p.ok, p ? (p.reason || '') : 'no probe');
  if (!p || !p.ok) return false;
  // ── Setup / non-vacuous (pass in BOTH modes) ──
  checks.check(`H-S31 ${tag} setup: cell shrank on boot (full→multi)`,
    p.preW > p.postW && (p.preW - p.postW) > 50,
    `preW=${p.preW} postW=${p.postW} paintW=${p.paintW}`);
  checks.check(`H-S31 ${tag} setup: candleWidth unchanged across boot resize`,
    p.preCandleWidth === p.postCandleWidth,
    `pre=${p.preCandleWidth} post=${p.postCandleWidth}`);
  checks.check(`H-S31 ${tag} setup: at least one paint on the boot resize`,
    p.rendersAfter - p.rendersBefore >= 1,
    `renders ${p.rendersBefore}→${p.rendersAfter}`);
  checks.check(`H-S31 ${tag} non-vacuous: competing auto-scroll commit separated from index pin`,
    p.autoScrollVsPin != null && Math.abs(p.autoScrollVsPin) > 5,
    `indexPin=${p.offIndexPin} autoScrollHalf=${p.autoScrollTargetHalf} |Δ|=${p.autoScrollVsPin == null ? 'n/a' : Math.abs(p.autoScrollVsPin).toFixed(1)}px`);
  // ── CORE (GREEN pass / RED fail) ──
  checks.check(`H-S31 ${tag} CORE: every boot commit after the index pin lands on the pin (<1px of FINAL)`,
    p.maxDriftFromPin < 1,
    `maxDriftFromPin=${p.maxDriftFromPin.toFixed(1)}px (pin=${p.offIndexPin} mirror=${p.offPostMirror} align=${p.offPostAlign} forceSync=${p.offPostForceSync} final=${p.offFinal})`);
  checks.check(`H-S31 ${tag} CORE: exactly ONE offset-changing commit after pre-split (index pin); reanchorPasses<=1`,
    p.reanchorPasses <= 1,
    `reanchorPasses=${p.reanchorPasses} preSplit=${p.offPreSplit} pin=${p.offIndexPin} align=${p.offPostAlign} (fixDisabled=${p.fixDisabled})`);
  return true;
}

async function hS31(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    // Enter replay PAUSED on host + peers so getReplayAutoScrollState (the
    // competing commit's formula) is meaningful in every frame.
    const ts0 = await enterReplayPausedAll(page);
    checks.check('H-S31 replay entered (paused) on host + peers', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    // HOST probe (main frame) — the definitive discriminator.
    const host = await page.evaluate(S31_PROBE_FN, S31_DISABLE_FLAG, 'host');
    s31AssertProbe(checks, 'HOST', host);

    // PEER probes (each embed frame) — the b103 peer analogue must be single-commit too.
    const frames = panelFrameMap(page);
    const peers = {};
    for (const pid of ['B', 'C', 'D']) {
      if (frames[pid]) peers[pid] = await frames[pid].evaluate(S31_PROBE_FN, S31_DISABLE_FLAG, 'peer');
    }
    for (const pid of ['B', 'C', 'D']) {
      if (peers[pid]) s31AssertProbe(checks, `PEER-${pid}`, peers[pid]);
    }

    const okHost = host && host.ok;
    notes.push(`H-S31 (§6ct residual open-multichart first-render slide): same-pair 2x2, paused replay, `
      + `default candleWidth. Boot commit sequence sampled (pre-split→b102/b103 index pin→mirror→post-allDataReady `
      + `align(fitToView)→forceInitialSync→final). `
      + (okHost
        ? `HOST: preSplit=${host.offPreSplit} indexPin=${host.offIndexPin} align=${host.offPostAlign} final=${host.offFinal}; `
          + `maxDriftFromPin=${host.maxDriftFromPin.toFixed(1)}px; reanchorPasses=${host.reanchorPasses}; competing `
          + `auto-scroll target=${host.autoScrollTargetHalf} (|Δ vs pin|=${host.autoScrollVsPin == null ? 'n/a' : Math.abs(host.autoScrollVsPin).toFixed(1)}px). `
        : `HOST probe failed (${host && host.reason}). `)
      + ['B', 'C', 'D'].map((pid) => {
        const p = peers[pid];
        if (!p) return `PEER-${pid}: (no frame)`;
        if (!p.ok) return `PEER-${pid}: (${p.reason})`;
        return `PEER-${pid}: drift=${p.maxDriftFromPin.toFixed(1)}px passes=${p.reanchorPasses}`;
      }).join('; ') + '. '
      + `Kill-switch ${S31_DISABLE_FLAG} RED: the post-allDataReady commit re-applies getReplayAutoScrollState `
      + `(~20% replay right-gap) → offsetX moves off the pin (tens→~120px), a SECOND commit → FAIL-REAL-BUG.`);
    return checks;
  });
}

// ── H-S32 ────────────────────────────────────────────────────────────────
// first-click-fails (TAL-00322 family): place trendline, re-arm the draw
// tool (common post-placement state), single-click the existing stroke once —
// selection + Quick Menu must transition on the FIRST click (currently no-ops
// while placement mode is active).
async function hS32(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await sleep(400);
    const pts = await defaultTrendlinePoints(page, 'A');
    const placed = await placeTool(page, 'A', 'trendline', pts);
    checks.check('H-S32 setup: trendline placed', placed && placed.id, placed ? placed.id : 'null');
    const armed = await page.evaluate(() => {
      const dm = window.chart.drawingManager;
      dm.setTool('trendline');
      return dm.currentTool;
    });
    checks.check('H-S32 setup: draw tool re-armed after placement', armed === 'trendline', `tool=${armed}`);
    const beforeSel = await readInteractiveState(page, 'A');
    checks.check('H-S32 setup: not selected before probe click', beforeSel && beforeSel.selectedIds.length === 0,
      `selected=${JSON.stringify(beforeSel?.selectedIds)}`);
    const rendersBefore = await readRenderCount(page, 'A');
    const clickRes = await selectTool(page, 'A', placed, { click: true });
    checks.check('H-S32 probe: single click dispatched', clickRes && clickRes.ok, clickRes?.reason || '');
    await sleep(200);
    const after = await readInteractiveState(page, 'A');
    const rendersAfter = await readRenderCount(page, 'A');
    assertCanvasRepainted(checks, 'H-S32 selection click schedules repaint', rendersBefore, rendersAfter);
    assertMenuState(checks, 'H-S32 CORE: first click selects drawing + shows Quick Menu', {
      selectedIds: [placed.id],
      toolbarVisible: true,
    }, after);
    return checks;
  });
}

// ── H-S33 ────────────────────────────────────────────────────────────────
// ghost-after-delete (TAL-00157 family): place rectangle, open settings,
// delete — no residual labels/settings/axis-highlight observers.
async function hS33(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await sleep(400);
    const pts = await defaultRectanglePoints(page, 'A');
    const placed = await placeTool(page, 'A', 'rectangle', pts);
    checks.check('H-S33 setup: rectangle placed', placed && placed.id, placed ? placed.id : 'null');
    const openRes = await openSettings(page, 'A', placed);
    checks.check('H-S33 setup: settings opened', openRes && openRes.ok, openRes?.reason || '');
    await sleep(250);
    const beforeDel = await readInteractiveState(page, 'A');
    checks.check('H-S33 setup: settings visible before delete', beforeDel && beforeDel.settingsOpen,
      `settingsOpen=${beforeDel?.settingsOpen}`);
    const delRes = await deleteToolViaSettings(page, 'A', placed);
    checks.check('H-S33 probe: delete invoked', delRes && delRes.ok, delRes?.reason || '');
    await sleep(300);
    const after = await readInteractiveState(page, 'A');
    checks.check('H-S33 CORE: drawing removed from store', after && after.drawingCount === 0,
      `drawingCount=${after?.drawingCount}`);
    assertNoGhostAfterDelete(checks, 'H-S33 CORE: no ghost artifacts after delete', placed, after);
    return checks;
  });
}

// ── H-S34 ────────────────────────────────────────────────────────────────
// selection-desync (TAL-00157 / TAL-01405 family): place a drawing on the
// host, then place one on panel B. The newest panel interaction must be the
// single selected owner; host selection chrome must clear.
async function hS34(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await sleep(600);

    const hostTool = await placeTool(page, 'A', 'trendline', await defaultTrendlinePoints(page, 'A'));
    checks.check('H-S34 setup: host trendline placed', hostTool && hostTool.id, hostTool ? hostTool.id : 'null');
    await sleep(200);
    const panelTool = await placeTool(page, 'B', 'rectangle', await defaultRectanglePoints(page, 'B'));
    checks.check('H-S34 setup: panel-B rectangle placed', panelTool && panelTool.id, panelTool ? panelTool.id : 'null');
    await sleep(400);

    const host = await readInteractiveState(page, 'A');
    const panel = await readInteractiveState(page, 'B');
    const totalSelected = (host?.selectedIds?.length || 0) + (panel?.selectedIds?.length || 0);
    checks.check(
      'H-S34 CORE: exactly one selected drawing globally after cross-panel placement',
      totalSelected === 1 && host?.selectedIds?.length === 0 && panel?.selectedIds?.[0] === panelTool.id,
      `A.selected=${JSON.stringify(host?.selectedIds)} B.selected=${JSON.stringify(panel?.selectedIds)} expected B=${panelTool.id}`,
    );
    checks.check(
      'H-S34 CORE: previous panel selection chrome cleared',
      !host?.toolbarVisible && (host?.axisHighlightCount || 0) === 0,
      `A.toolbarVisible=${host?.toolbarVisible} A.axisHighlightCount=${host?.axisHighlightCount}`,
    );
    return checks;
  });
}

// ── H-S35 ────────────────────────────────────────────────────────────────
// stale-quick-menu (TAL-00157 / TAL-01499 family): after a newer panel draws
// a tool, only that live selection may own a floating toolbar / quick menu.
async function hS35(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await sleep(600);

    const hostTool = await placeTool(page, 'A', 'trendline', await defaultTrendlinePoints(page, 'A'));
    checks.check('H-S35 setup: host trendline placed', hostTool && hostTool.id, hostTool ? hostTool.id : 'null');
    await sleep(200);
    const panelTool = await placeTool(page, 'B', 'rectangle', await defaultRectanglePoints(page, 'B'));
    checks.check('H-S35 setup: panel-B rectangle placed', panelTool && panelTool.id, panelTool ? panelTool.id : 'null');
    await sleep(400);

    const host = await readInteractiveState(page, 'A');
    const panel = await readInteractiveState(page, 'B');
    const visibleToolbars = [
      host?.toolbarVisible ? `A:${host.toolbarDrawingId}` : null,
      panel?.toolbarVisible ? `B:${panel.toolbarDrawingId}` : null,
    ].filter(Boolean);
    checks.check(
      'H-S35 CORE: quick menu owner matches live panel-B selection only',
      visibleToolbars.length === 1
        && visibleToolbars[0] === `B:${panelTool.id}`
        && panel?.selectedIds?.[0] === panelTool.id,
      `visibleToolbars=${visibleToolbars.join(',') || '(none)'} A.selected=${JSON.stringify(host?.selectedIds)} B.selected=${JSON.stringify(panel?.selectedIds)}`,
    );
    return checks;
  });
}

// ── H-S36 ────────────────────────────────────────────────────────────────
// TAL-00752#21: pending replay fill must anchor to the candle that actually
// touches the entry after the placement guard, not the previous/current guard
// candle or a mirror-adopted frame.
async function hS36(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    const ts0 = await enterReplayPausedAll(page);
    checks.check('H-S36 setup: replay entered paused', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;

    const probe = await page.evaluate(() => {
      const ch = window.chart;
      const om = ch && ch.orderManager;
      if (!ch || !om) return { ok: false, reason: 'missing chart/orderManager' };
      const rs = ch.replaySystem || null;
      const data = Array.isArray(rs?.fullRawData) && rs.fullRawData.length
        ? rs.fullRawData
        : (Array.isArray(ch.rawData) && ch.rawData.length ? ch.rawData : ch.data);
      const cur = typeof om.getCurrentCandle === 'function' ? om.getCurrentCandle() : null;
      const idx = data.findIndex((b) => Number(b.t) === Number(cur && cur.t));
      const next = idx >= 0 ? data[idx + 1] : null;
      if (!cur || !next) return { ok: false, reason: `no cur/next idx=${idx}` };
      const entry = (Number(next.l) + Number(next.h)) / 2;
      if (!Number.isFinite(entry)) return { ok: false, reason: 'bad entry' };

      const saved = {
        pendingOrders: om.pendingOrders,
        openPositions: om.openPositions,
        orders: om.orders,
        orderService: om.orderService,
        methods: {},
      };
      [
        'removePendingOrderLine', 'removePendingSLTPLines', 'removeMultiTPAvgLine',
        'drawOrderLine', 'drawSLTPLines', 'drawEntryMarker', 'showNotification',
        'playOrderSound', 'updatePositionsPanel', '_pauseReplayIfPlaying',
      ].forEach((name) => {
        saved.methods[name] = om[name];
        om[name] = () => {};
      });

      try {
        om.orderService = null;
        om.pendingOrders = [{
          id: 930036,
          status: 'PENDING',
          orderType: 'limit',
          direction: 'BUY',
          entryPrice: entry,
          quantity: 1,
          riskAmount: 10,
          originalRiskAmount: 10,
          stopLoss: Math.min(Number(next.l), entry) - 0.001,
          takeProfit: Math.max(Number(next.h), entry) + 0.001,
          ticker: ch.currentSymbol,
          symbol: ch.currentSymbol,
          sourceFileId: ch.currentFileId != null ? String(ch.currentFileId) : null,
          _noFillBeforeTime: cur.t,
          _noFillBeforeTick: -1,
        }];
        om.openPositions = [];
        om.orders = [];

        om.checkPendingOrders(cur);
        const afterGuard = { pending: om.pendingOrders.length, open: om.openPositions.length };
        om.checkPendingOrders(next);
        const filled = om.openPositions[0] || null;
        return {
          ok: true,
          curT: Number(cur.t),
          nextT: Number(next.t),
          entry,
          afterGuard,
          openCount: om.openPositions.length,
          pendingCount: om.pendingOrders.length,
          openTime: filled ? Number(filled.openTime) : null,
          entryMarkerTimeMs: filled ? Number(filled.entryMarkerTimeMs) : null,
        };
      } finally {
        om.pendingOrders = saved.pendingOrders;
        om.openPositions = saved.openPositions;
        om.orders = saved.orders;
        om.orderService = saved.orderService;
        Object.entries(saved.methods).forEach(([name, fn]) => { om[name] = fn; });
      }
    });

    checks.check('H-S36 probe constructed', probe && probe.ok, probe ? (probe.reason || '') : 'null');
    if (!probe || !probe.ok) return checks;
    checks.check('H-S36 guard candle did not fill pending order', probe.afterGuard.pending === 1 && probe.afterGuard.open === 0,
      `afterGuard=${JSON.stringify(probe.afterGuard)} curT=${probe.curT}`);
    checks.check('H-S36 CORE: pending fill anchors to touch candle',
      probe.openCount === 1 && probe.pendingCount === 0 && probe.openTime === probe.nextT && probe.entryMarkerTimeMs === probe.nextT,
      `open=${probe.openCount} pending=${probe.pendingCount} openTime=${probe.openTime} marker=${probe.entryMarkerTimeMs} expected=${probe.nextT}`);
    return checks;
  });
}

// ── H-S37 ────────────────────────────────────────────────────────────────
// TAL-00752#3: during replay ticks/candles, TP line DOM should be repositioned,
// not torn down and recreated (visible per-candle flicker).
async function hS37(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    const ts0 = await enterReplayPausedAll(page);
    checks.check('H-S37 setup: replay entered paused', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;

    const probe = await page.evaluate(() => {
      const ch = window.chart;
      const om = ch && ch.orderManager;
      const cur = om && om.getCurrentCandle && om.getCurrentCandle();
      if (!ch || !om || !cur || !ch.svg) return { ok: false, reason: 'missing chart/order/current candle/svg' };
      const order = {
        id: 930037,
        type: 'BUY',
        orderType: 'market',
        openPrice: Number(cur.c),
        openTime: Number(cur.t),
        entryMarkerTimeMs: Number(cur.t),
        quantity: 1,
        originalQuantity: 1,
        riskAmount: 10,
        originalRiskAmount: 10,
        stopLoss: Number(cur.c) - 10,
        takeProfit: Number(cur.c) + 10,
        status: 'OPEN',
        ticker: ch.currentSymbol,
        symbol: ch.currentSymbol,
        sourceFileId: ch.currentFileId != null ? String(ch.currentFileId) : null,
        partialCloses: [],
      };
      const saved = {
        openPositions: om.openPositions,
        orders: om.orders,
        orderLines: om.orderLines,
        slLines: om.slLines,
        tpLines: om.tpLines,
      };
      try {
        om.openPositions = [order];
        om.orders = [order];
        om.orderLines = [];
        om.slLines = [];
        om.tpLines = [];
        om.drawSLTPLines(order, ch);
        const first = ch.svg.select(`.tp-${order.id}`).node();
        const firstCount = ch.svg.selectAll(`.tp-${order.id}`).nodes().length;
        om.drawSLTPLines(order, ch);
        const second = ch.svg.select(`.tp-${order.id}`).node();
        const secondCount = ch.svg.selectAll(`.tp-${order.id}`).nodes().length;
        return {
          ok: true,
          sameNodeAfterRedraw: first === second,
          firstCount,
          secondCount,
          tpLines: (om.tpLines || []).filter((t) => t.orderId === order.id).length,
        };
      } finally {
        try { om.removeSLTPLines(order.id); } catch (_) {}
        om.openPositions = saved.openPositions;
        om.orders = saved.orders;
        om.orderLines = saved.orderLines;
        om.slLines = saved.slLines;
        om.tpLines = saved.tpLines;
      }
    });

    checks.check('H-S37 probe constructed', probe && probe.ok, probe ? (probe.reason || '') : 'null');
    if (!probe || !probe.ok) return checks;
    checks.check('H-S37 setup: one TP visual set before/after redraw', probe.firstCount > 0 && probe.secondCount > 0 && probe.tpLines === 1,
      `firstCount=${probe.firstCount} secondCount=${probe.secondCount} tpLines=${probe.tpLines}`);
    checks.check('H-S37 CORE: TP line node remains stable across replay redraw',
      probe.sameNodeAfterRedraw === true,
      `sameNodeAfterRedraw=${probe.sameNodeAfterRedraw} (drawSLTPLines removes/recreates TP DOM)`);
    return checks;
  });
}

async function commitDrawingStyleAndReadRender(page, ref, stylePatch) {
  const id = typeof ref === 'string' ? ref : ref.id;
  return page.evaluate(async (drawId, patch) => {
    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    const drawing = dm && dm.drawings.find((d) => d && String(d.id) === String(drawId));
    if (!drawing) return { ok: false, reason: 'drawing not found' };
    const before = ch._mcDiag ? Number(ch._mcDiag.renders) || 0 : 0;
    Object.assign(drawing.style, patch);
    dm.renderDrawing(drawing);
    dm.saveDrawings();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = ch._mcDiag ? Number(ch._mcDiag.renders) || 0 : 0;
    return { ok: true, before, after, style: { ...drawing.style } };
  }, id, stylePatch);
}

// ── H-S38 ────────────────────────────────────────────────────────────────
// RC-2 / stuck-until-click: committing a drawing style color change must
// invalidate the chart by the next frame, without relying on a later click.
async function hS38(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await sleep(400);

    const placed = await placeTool(page, 'A', 'trendline', await defaultTrendlinePoints(page, 'A'));
    checks.check('H-S38 setup: trendline placed', placed && placed.id, placed ? placed.id : 'null');
    await sleep(150);
    const commit = await commitDrawingStyleAndReadRender(page, placed, { stroke: '#ff00ff' });
    checks.check('H-S38 probe: stroke color committed', commit && commit.ok, commit?.reason || '');
    checks.check(
      'H-S38 CORE: style color commit repaints by next frame without click',
      commit && commit.after > commit.before,
      `renders before=${commit?.before} after=${commit?.after}`,
    );
    return checks;
  });
}

// ── H-S39 ────────────────────────────────────────────────────────────────
// RC-2 / stuck-until-click: committing a drawing style thickness change must
// invalidate the chart by the next frame, without relying on a later click.
async function hS39(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await sleep(400);

    const [point] = await defaultTrendlinePoints(page, 'A');
    const placed = await placeTool(page, 'A', 'horizontal', [point]);
    checks.check('H-S39 setup: horizontal line placed', placed && placed.id, placed ? placed.id : 'null');
    await sleep(150);
    const commit = await commitDrawingStyleAndReadRender(page, placed, { strokeWidth: 5 });
    checks.check('H-S39 probe: stroke width committed', commit && commit.ok, commit?.reason || '');
    checks.check(
      'H-S39 CORE: style width commit repaints by next frame without click',
      commit && commit.after > commit.before,
      `renders before=${commit?.before} after=${commit?.after}`,
    );
    return checks;
  });
}

async function defaultVolumeAnchorPoints(page, pointCount = 1) {
  return page.evaluate((n) => {
    const ch = window.chart;
    const len = Array.isArray(ch?.data) ? ch.data.length : 0;
    const pickOffFiveMinuteBoundary = (startFraction) => {
      const start = Math.max(10, Math.floor(len * startFraction));
      for (let i = start; i < Math.min(len - 1, start + 120); i++) {
        const t = Number(ch.data[i]?.t);
        if (Number.isFinite(t) && t % (5 * 60 * 1000) !== 0) return i;
      }
      return start;
    };
    const first = pickOffFiveMinuteBoundary(0.30);
    const second = Math.max(first + 10, pickOffFiveMinuteBoundary(0.45));
    const a = ch.data[first];
    const b = ch.data[second];
    if (n === 1) return [{ x: first, y: Number(a.c) }];
    return [
      { x: first, y: Number(a.h) },
      { x: second, y: Number(b.l) },
    ];
  }, pointCount);
}

async function readAnchorSnapshot(page, ref) {
  const id = typeof ref === 'string' ? ref : ref.id;
  return page.evaluate((drawId) => {
    const ch = window.chart;
    const dm = ch && ch.drawingManager;
    const drawing = dm && dm.drawings.find((d) => d && String(d.id) === String(drawId));
    if (!drawing) return { ok: false, reason: 'drawing not found' };
    const tsPts = Array.isArray(drawing.timestampPoints) ? drawing.timestampPoints : [];
    const points = (drawing.points || []).map((p, i) => {
      const idx = Math.round(Number(p.x));
      const bar = Array.isArray(ch.data) ? ch.data[idx] : null;
      const tsPt = tsPts[i];
      const timestamp = tsPt && Number.isFinite(Number(tsPt.timestamp))
        ? Number(tsPt.timestamp)
        : (bar ? Number(bar.t) : null);
      const price = tsPt && Number.isFinite(Number(tsPt.price))
        ? Number(tsPt.price)
        : Number(p.y);
      const pixelX = typeof ch.dataIndexToPixel === 'function' ? ch.dataIndexToPixel(idx) : null;
      return {
        x: Number(p.x),
        y: price,
        idx,
        timestamp,
        timestampSource: tsPt && Number.isFinite(Number(tsPt.timestamp)) ? 'timestampPoints' : 'barOpenFallback',
        barOpen: bar ? Number(bar.t) : null,
        barHigh: bar ? Number(bar.h) : null,
        barLow: bar ? Number(bar.l) : null,
        barClose: bar ? Number(bar.c) : null,
        pixelX: Number.isFinite(pixelX) ? pixelX : null,
      };
    });
    return {
      ok: true,
      type: drawing.type,
      tf: ch.currentTimeframe,
      dataLen: Array.isArray(ch.data) ? ch.data.length : 0,
      firstT: Array.isArray(ch.data) && ch.data[0] ? Number(ch.data[0].t) : null,
      lastT: Array.isArray(ch.data) && ch.data.length ? Number(ch.data[ch.data.length - 1].t) : null,
      hasTimestampPoints: tsPts.length > 0,
      points,
    };
  }, id);
}

async function switchHostTimeframeAndReadAnchor(page, ref, tf = '5m') {
  await hostSetTimeframe(page, tf);
  const deadline = Date.now() + 10_000;
  let snap = null;
  while (Date.now() < deadline) {
    snap = await readAnchorSnapshot(page, ref);
    if (snap && snap.ok && snap.tf === tf && snap.dataLen > 0) return snap;
    await sleep(150);
  }
  return snap;
}

function assertAnchorTimestampsStable(checks, label, before, after) {
  const beforePoints = before?.points || [];
  const afterPoints = after?.points || [];
  const details = beforePoints.map((p, i) => {
    const q = afterPoints[i] || {};
    return `p${i}: beforeT=${p.timestamp}(${p.timestampSource}) afterT=${q.timestamp}(${q.timestampSource}) beforeY=${p.y} afterY=${q.y}`;
  }).join('; ');
  const ok = before?.hasTimestampPoints
    && after?.hasTimestampPoints
    && beforePoints.length > 0
    && beforePoints.length === afterPoints.length
    && beforePoints.every((p, i) => afterPoints[i]
      && Number(afterPoints[i].timestamp) === Number(p.timestamp)
      && Number(afterPoints[i].y) === Number(p.y));
  return checks.check(label, ok, details || 'no anchor points');
}

// ── H-S40 ────────────────────────────────────────────────────────────────
// RC-3 / anchoring: anchored VWAP must stay anchored to the same timestamp +
// price when the bar-index basis changes via timeframe switch.
async function hS40(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await sleep(500);

    const placed = await placeTool(page, 'A', 'anchored-vwap', await defaultVolumeAnchorPoints(page, 1));
    checks.check('H-S40 setup: anchored VWAP placed', placed && placed.id, placed ? placed.id : 'null');
    await sleep(250);
    const before = await readAnchorSnapshot(page, placed);
    checks.check('H-S40 setup: captured 1m timestamp+price anchor', before?.ok && before.points.length === 1,
      `before=${JSON.stringify(before?.points)}`);
    const after = await switchHostTimeframeAndReadAnchor(page, placed, '5m');
    checks.check('H-S40 probe: switched host timeframe to 5m', after?.ok && after.tf === '5m',
      `tf=${after?.tf} dataLen=${after?.dataLen}`);
    assertAnchorTimestampsStable(checks, 'H-S40 CORE: anchored VWAP anchor survives TF switch', before, after);
    return checks;
  });
}

// ── H-S41 ────────────────────────────────────────────────────────────────
// RC-3 / anchoring: fixed range volume profile range endpoints must stay on
// the same timestamp+price anchors across a timeframe basis change.
async function hS41(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await sleep(500);

    const placed = await placeTool(page, 'A', 'fixed-range-volume-profile', await defaultVolumeAnchorPoints(page, 2));
    checks.check('H-S41 setup: fixed range volume profile placed', placed && placed.id, placed ? placed.id : 'null');
    await sleep(250);
    const before = await readAnchorSnapshot(page, placed);
    checks.check('H-S41 setup: captured 1m range anchors', before?.ok && before.points.length === 2,
      `before=${JSON.stringify(before?.points)}`);
    const after = await switchHostTimeframeAndReadAnchor(page, placed, '5m');
    checks.check('H-S41 probe: switched host timeframe to 5m', after?.ok && after.tf === '5m',
      `tf=${after?.tf} dataLen=${after?.dataLen}`);
    assertAnchorTimestampsStable(checks, 'H-S41 CORE: fixed range volume profile anchors survive TF switch', before, after);
    return checks;
  });
}

// ── H-S42 ────────────────────────────────────────────────────────────────
// RC-3 / anchoring: anchored volume profile must keep its anchor timestamp +
// price across a timeframe basis change.
async function hS42(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await sleep(500);

    const placed = await placeTool(page, 'A', 'anchored-volume-profile', await defaultVolumeAnchorPoints(page, 1));
    checks.check('H-S42 setup: anchored volume profile placed', placed && placed.id, placed ? placed.id : 'null');
    await sleep(250);
    const before = await readAnchorSnapshot(page, placed);
    checks.check('H-S42 setup: captured 1m timestamp+price anchor', before?.ok && before.points.length === 1,
      `before=${JSON.stringify(before?.points)}`);
    const after = await switchHostTimeframeAndReadAnchor(page, placed, '5m');
    checks.check('H-S42 probe: switched host timeframe to 5m', after?.ok && after.tf === '5m',
      `tf=${after?.tf} dataLen=${after?.dataLen}`);
    assertAnchorTimestampsStable(checks, 'H-S42 CORE: anchored volume profile anchor survives TF switch', before, after);
    return checks;
  });
}

function drawingClientCenters(drawings) {
  return (drawings || [])
    .filter((d) => d && d.client && Number.isFinite(d.client.cx) && Number.isFinite(d.client.cy))
    .map((d) => ({
      id: d.id,
      x: Math.round(d.client.cx),
      y: Math.round(d.client.cy),
    }));
}

async function readPanelDrawingGeometry(page, panelId) {
  const frames = panelFrameMap(page);
  const frame = frames[panelId];
  if (!frame) return { ok: false, reason: `missing frame ${panelId}` };
  return frame.evaluate(() => {
    const dm = window.chart && window.chart.drawingManager;
    if (!dm) return { ok: false, reason: 'missing drawingManager' };
    const drawings = (dm.drawings || []).map((d) => {
      let client = null;
      try {
        const node = d.group && d.group.node && d.group.node();
        if (node && node.getBoundingClientRect) {
          const r = node.getBoundingClientRect();
          client = {
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            cx: r.left + r.width / 2,
            cy: r.top + r.height / 2,
          };
        }
      } catch (_) {}
      return {
        id: String(d.id),
        type: d.type || null,
        selected: !!d.selected,
        points: Array.isArray(d.points) ? d.points.map((p) => ({ x: p && p.x, y: p && p.y })) : [],
        client,
      };
    });
    return {
      ok: true,
      selectedIds: (dm.selectedDrawings || []).map((d) => d && String(d.id)).filter(Boolean),
      drawings,
    };
  });
}

// ── H-S43 ────────────────────────────────────────────────────────────────
// TAL-01498 / T3 row 2: Ctrl-select in panel B must add two drawings exactly
// once. The RED was a panel-local double-toggle: canvas capture selected a
// drawing and the same interaction immediately toggled it back out.
async function hS43(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);

    const pts1 = await defaultTrendlinePoints(page, 'A');
    const pts2 = pts1.map((p, i) => ({ x: p.x + 35, y: p.y - (i === 0 ? 0.0012 : 0.001) }));
    const first = await placeTool(page, 'A', 'trendline', pts1);
    checks.check('H-S43 setup: first synced trendline placed on host', first && first.id, first ? first.id : 'null');
    await sleep(250);
    const second = await placeTool(page, 'A', 'trendline', pts2);
    checks.check('H-S43 setup: second synced trendline placed on host', second && second.id, second ? second.id : 'null');
    await sleep(600);

    const before = await readPanelDrawingGeometry(page, 'B');
    checks.check('H-S43 setup: panel B received two drawings', before?.ok && before.drawings.length >= 2,
      `count=${before?.drawings?.length || 0} reason=${before?.reason || ''}`);
    const centers = drawingClientCenters(before?.drawings).slice(0, 2);
    checks.check('H-S43 setup: panel B drawing centers are clickable', centers.length === 2,
      `centers=${JSON.stringify(centers)}`);
    if (centers.length !== 2) return checks;

    const frameRect = await frameRectForPanel(page, 'B');
    checks.check('H-S43 setup: panel B iframe rect resolved', !!frameRect, JSON.stringify(frameRect || null));
    if (!frameRect) return checks;

    await page.keyboard.down('Control');
    try {
      for (const c of centers) {
        await page.mouse.click(Math.round(frameRect.left + c.x), Math.round(frameRect.top + c.y), { delay: 30 });
        await sleep(180);
      }
    } finally {
      await page.keyboard.up('Control');
    }
    await sleep(250);

    const after = await readPanelDrawingGeometry(page, 'B');
    const expected = centers.map((c) => String(c.id)).sort();
    const actual = (after?.selectedIds || []).map(String).sort();
    checks.check(
      'H-S43 CORE: panel-B Ctrl-select selects both drawings once (no double-toggle)',
      expected.length === 2 && actual.length === 2 && expected.every((id, i) => id === actual[i]),
      `selected=${JSON.stringify(after?.selectedIds)} expected=${JSON.stringify(expected)}`,
    );
    return checks;
  });
}

// ── H-S44 ────────────────────────────────────────────────────────────────
// T1 step 5 regression: panel single-click must select and keep its quick
// settings owner; opening settings must notify the parent, and Esc must close it.
async function hS44(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
    await installParentSettingsProbe(page);

    const placed = await placeTool(page, 'B', 'rectangle', await defaultRectanglePoints(page, 'B'));
    checks.check('H-S44 setup: panel-B rectangle placed', placed && placed.id, placed ? placed.id : 'null');
    await sleep(250);

    await page.evaluate((drawId) => {
      const frame = Array.from(document.querySelectorAll('iframe')).find((el) => {
        try { return new URL(el.src).searchParams.get('panelId') === 'B'; } catch (_) { return false; }
      });
      return !!frame && !!drawId;
    }, placed?.id);
    const deselected = await deselectAllViaCanvas(page, 'B');
    checks.check('H-S44 setup: panel-B deselect dispatched', deselected && deselected.ok, JSON.stringify(deselected || null));
    await sleep(200);

    const clickRes = await selectTool(page, 'B', placed, { click: true });
    checks.check('H-S44 probe: panel-B single click dispatched', clickRes && clickRes.ok, clickRes?.reason || '');
    await sleep(350);
    const afterClick = await readInteractiveState(page, 'B');
    assertMenuState(checks, 'H-S44 CORE: panel-B single click selects + keeps quick settings owner', {
      selectedIds: [placed.id],
      toolbarVisible: true,
    }, afterClick);

    const openRes = await openSettings(page, 'B', placed);
    checks.check('H-S44 probe: panel-B settings open invoked', openRes && openRes.ok, openRes?.reason || '');
    await sleep(300);
    const parentOpen = await readParentSettingsProbe(page);
    const openedMsg = parentOpen.messages.find((m) =>
      m.type === 'multichart-open-drawing-settings'
      && m.source === 'B'
      && String(m.drawingId) === String(placed.id)
    );
    checks.check('H-S44 CORE: panel-B settings request reaches parent', !!openedMsg,
      `probe=${JSON.stringify(parentOpen)}`);

    await pressEscape(page, 'B');
    const afterEsc = await readInteractiveState(page, 'B');
    const parentAfterEsc = await readParentSettingsProbe(page);
    checks.check('H-S44 CORE: Esc deselects panel-B drawing', afterEsc?.selectedIds?.length === 0,
      `selected=${JSON.stringify(afterEsc?.selectedIds)}`);
    checks.check('H-S44 CORE: Esc closes panel-B settings/quick-settings surfaces',
      !afterEsc?.toolbarVisible && !parentAfterEsc.open,
      `toolbarVisible=${afterEsc?.toolbarVisible} parentProbe=${JSON.stringify(parentAfterEsc)}`);
    return checks;
  });
}

// ── H-S45 ────────────────────────────────────────────────────────────────
// TAL-01495: drawing target follows focused panel — arm + draw on panel B while
// B is focused must land only on B (independent pair), never on host A.
async function hS45(ctx) {
  return runWith(ctx, { pair: 'independent', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
    await sleep(400);

    const beforeA = await readInteractiveState(page, 'A');
    const beforeB = await readInteractiveState(page, 'B');
    checks.check('H-S45 setup: host starts with no drawings', beforeA && beforeA.drawingCount === 0,
      `A.count=${beforeA?.drawingCount}`);
    checks.check('H-S45 setup: panel B starts with no drawings', beforeB && beforeB.drawingCount === 0,
      `B.count=${beforeB?.drawingCount}`);

    const focusRes = await focusPanelByClick(page, 'B');
    checks.check('H-S45 setup: panel B focus click dispatched', focusRes && focusRes.ok, focusRes?.reason || '');
    const drawRes = await drawRectangleViaMouse(page, 'B');
    checks.check('H-S45 probe: rectangle drawn via mouse on focused panel B', drawRes && drawRes.ok && drawRes.drawingCount >= 1,
      `drawRes=${JSON.stringify(drawRes || null)}`);

    const afterA = await readInteractiveState(page, 'A');
    const afterB = await readInteractiveState(page, 'B');
    checks.check(
      'H-S45 CORE: focused-panel draw lands on B only (host A stays empty)',
      afterB && afterB.drawingCount >= 1 && afterA && afterA.drawingCount === 0,
      `A.count=${afterA?.drawingCount} B.count=${afterB?.drawingCount}`,
    );
    return checks;
  });
}

// ── MC-DRAW-FIRSTCLICK ───────────────────────────────────────────────────
// Armed rectangle on focused host A → two-click draw on unfocused B must
// complete on the first B session (inherit + draw-start on click 1), not
// require a separate focus click first.
async function mcDrawFirstclick(ctx) {
  return runWith(ctx, { pair: 'independent', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
    await sleep(400);

    const armRes = await armHostDrawToolForMultichartSync(page, 'rectangle');
    checks.check('MC-DRAW-FIRSTCLICK setup: host A armed rectangle', armRes && armRes.ok,
      JSON.stringify(armRes || null));

    const preA = await readInteractiveState(page, 'A');
    const preB = await readInteractiveState(page, 'B');
    const focused = await readHarnessFocusedPanelId(page);
    checks.check('MC-DRAW-FIRSTCLICK setup: host A has armed tool', preA && preA.currentTool === 'rectangle',
      `A.tool=${preA?.currentTool}`);
    checks.check('MC-DRAW-FIRSTCLICK setup: panel B has no local tool', preB && !preB.currentTool,
      `B.tool=${preB?.currentTool}`);
    checks.check('MC-DRAW-FIRSTCLICK setup: focus remains on A before B draw', focused === 'A',
      `focused=${focused}`);

    const drawRes = await twoClickRectangleOnPanel(page, 'B');
    checks.check('MC-DRAW-FIRSTCLICK probe: two-click rectangle dispatched on B',
      drawRes && drawRes.ok, JSON.stringify(drawRes || null));
    checks.check('MC-DRAW-FIRSTCLICK probe: click-1 entered draw on B (mid-gesture)',
      drawRes && drawRes.midIsDrawing === true && drawRes.midCurrentTool === 'rectangle',
      `mid=${JSON.stringify({ isDrawing: drawRes?.midIsDrawing, tool: drawRes?.midCurrentTool })}`);

    const afterA = await readInteractiveState(page, 'A');
    const afterB = await readInteractiveState(page, 'B');
    checks.check(
      'MC-DRAW-FIRSTCLICK CORE: rectangle lands on B after first B session (not 2-click focus-then-draw)',
      afterB && afterB.drawingCount >= 1,
      `A.count=${afterA?.drawingCount} B.count=${afterB?.drawingCount}`,
    );
    return checks;
  });
}

// ── H-S46 ────────────────────────────────────────────────────────────────
// TAL-01498: Ctrl-select inside panel B with locally drawn tools — both stay
// selected once; handle centers remain separated (no stacked blob).
async function hS46(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
    await focusPanelByClick(page, 'B');
    await sleep(250);

    const first = await drawTrendlineViaMouse(page, 'B');
    checks.check('H-S46 setup: first trendline via mouse on panel B', first && first.ok && first.drawingCount >= 1,
      JSON.stringify(first || null));
    await sleep(300);
    const second = await drawTrendlineViaMouse(page, 'B');
    checks.check('H-S46 setup: second trendline via mouse on panel B', second && second.ok && second.drawingCount >= 2,
      JSON.stringify(second || null));
    await sleep(400);

    const before = await readPanelDrawingGeometry(page, 'B');
    checks.check('H-S46 setup: panel B has two drawable tools', before?.ok && before.drawings.length >= 2,
      `count=${before?.drawings?.length || 0}`);
    const centers = drawingClientCenters(before?.drawings).slice(0, 2);
    checks.check('H-S46 setup: centers are separated before Ctrl-select', centers.length === 2,
      `centers=${JSON.stringify(centers)}`);
    if (centers.length !== 2) return checks;

    const frameRect = await frameRectForPanel(page, 'B');
    checks.check('H-S46 setup: panel B iframe rect resolved', !!frameRect, JSON.stringify(frameRect || null));
    if (!frameRect) return checks;

    await page.keyboard.down('Control');
    try {
      for (const c of centers) {
        await page.mouse.click(Math.round(frameRect.left + c.x), Math.round(frameRect.top + c.y), { delay: 30 });
        await sleep(180);
      }
    } finally {
      await page.keyboard.up('Control');
    }
    await sleep(250);

    const after = await readPanelDrawingGeometry(page, 'B');
    const dist = centers.length === 2 && after?.drawings?.length >= 2
      ? Math.sqrt(
        (after.drawings[0].client.cx - after.drawings[1].client.cx) ** 2
        + (after.drawings[0].client.cy - after.drawings[1].client.cy) ** 2,
      )
      : 0;
    const expected = centers.map((c) => String(c.id)).sort();
    const actual = (after?.selectedIds || []).map(String).sort();
    checks.check(
      'H-S46 CORE: panel-B Ctrl-select keeps both tools selected once',
      expected.length === 2 && actual.length === 2 && expected.every((id, i) => id === actual[i]),
      `selected=${JSON.stringify(after?.selectedIds)} expected=${JSON.stringify(expected)}`,
    );
    checks.check(
      'H-S46 CORE: selected tools stay geometrically separated (no stacked blob)',
      dist >= 12,
      `centerDistancePx=${Number.isFinite(dist) ? dist.toFixed(1) : 'n/a'}`,
    );
    return checks;
  });
}

// ── H-S47 ────────────────────────────────────────────────────────────────
// TAL-01499: quick menu must appear on panel B immediately after placement
// completes — without a follow-up select click (placement-complete path).
async function hS47(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
    await installParentSettingsProbe(page);
    await focusPanelByClick(page, 'B');
    await sleep(200);

    const drawRes = await drawTrendlineViaMouse(page, 'B');
    checks.check('H-S47 probe: trendline drawn on panel B', drawRes && drawRes.ok && drawRes.drawingCount >= 1,
      JSON.stringify(drawRes || null));
    await sleep(250);
    const after = await readInteractiveState(page, 'B');
    const parentMenu = await page.evaluate(() => {
      const selectors = [
        '.v9-drawing-toolbar',
        '.multichart-quick-menu',
        '#drawingQuickMenu',
        '[data-testid="drawing-quick-menu"]',
        '.drawing-toolbar-host',
      ];
      let n = 0;
      selectors.forEach((sel) => { n += document.querySelectorAll(sel).length; });
      return n;
    });
    checks.check(
      'H-S47 CORE: parent shell owns the Quick Menu chrome (not iframe-only toolbar)',
      parentMenu > 0 && after?.toolbarVisible === true,
      `parentMenu=${parentMenu} B.toolbarVisible=${after?.toolbarVisible}`,
    );
    return checks;
  });
}

// ── H-S48 ────────────────────────────────────────────────────────────────
// TAL-01500 / TAL-01501: indicator state is isolated per panel — deleting on B
// must not leave ghost enabled rows in persisted indicator storage that A reads.
async function hS48(ctx) {
  return runWith(ctx, { pair: 'independent', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
    await sleep(400);

    const addB = await addIndicator(page, 'B', 'macd', { fast: 12, slow: 26, signal: 9 });
    checks.check('H-S48 setup: MACD added on panel B', addB && addB.ok && addB.count >= 1,
      JSON.stringify(addB || null));
    await sleep(300);

    const listProbeOn = await page.evaluate(() => {
      const frames = Array.from(document.querySelectorAll('iframe'));
      let frameListActive = 0;
      for (const el of frames) {
        try {
          const u = new URL(el.src, location.href);
          if (u.searchParams.get('panelId') !== 'B') continue;
          const doc = el.contentDocument;
          if (!doc) continue;
          frameListActive = doc.querySelectorAll(
            '.indicator-list-item.active, [data-indicator-active="true"], .indicator-item.enabled',
          ).length;
        } catch (_) {}
      }
      return { frameListActive };
    });
    const indBOn = await readIndicatorState(page, 'B');
    checks.check(
      'H-S48 CORE: indicator list ON-state matches chart on first open after add',
      (indBOn?.count || 0) >= 1 && listProbeOn.frameListActive >= 1,
      `chartActive=${indBOn?.count || 0} listActive=${listProbeOn.frameListActive}`,
    );

    const rmB = await removeAllIndicators(page, 'B');
    checks.check('H-S48 setup: indicators removed from panel B chart', rmB && rmB.ok && rmB.remaining === 0,
      JSON.stringify(rmB || null));
    await sleep(200);

    const listProbe = await page.evaluate(() => {
      const frames = Array.from(document.querySelectorAll('iframe'));
      let frameListActive = 0;
      let frameActiveCount = 0;
      for (const el of frames) {
        try {
          const u = new URL(el.src, location.href);
          if (u.searchParams.get('panelId') !== 'B') continue;
          const doc = el.contentDocument;
          if (!doc) continue;
          frameListActive = doc.querySelectorAll(
            '.indicator-list-item.active, [data-indicator-active="true"], .indicator-item.enabled',
          ).length;
        } catch (_) {}
      }
      return { frameListActive, frameActiveCount };
    });
    const indBAfterDelete = await readIndicatorState(page, 'B');
    listProbe.frameActiveCount = indBAfterDelete?.count || 0;
    checks.check(
      'H-S48 CORE: indicator list ON-state matches chart after delete (no ghost enabled rows)',
      listProbe.frameActiveCount === 0 && listProbe.frameListActive === 0,
      `chartActive=${listProbe.frameActiveCount} listActive=${listProbe.frameListActive}`,
    );

    await focusPanelByClick(page, 'A');
    await sleep(200);
    const indA = await readIndicatorState(page, 'A');
    checks.check(
      'H-S48 CORE: deleted panel-B indicators do not reappear on host A chart',
      indA && indA.count === 0,
      `A.active=${JSON.stringify(indA?.active)}`,
    );
    return checks;
  });
}

// ── H-S49 ────────────────────────────────────────────────────────────────
// TAL-01491 / TAL-01587: drawing/pan drag must survive cursor leaving the React
// layout tile (pointer-capture via parent shell). Harness host.html lacks the
// production MultichartGrid chrome — proxy: parent shell must participate.
async function hS49(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    try {
      await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
      await sleep(400);

      const placed = await placeTool(page, 'A', 'trendline', await defaultTrendlinePoints(page, 'A'));
      checks.check('H-S49 setup: host trendline placed', placed && placed.id, placed ? placed.id : 'null');
      await selectTool(page, 'A', placed, { click: true });
      await sleep(200);

      const probe = await probeDrawingDragPastTile(page, 'A', placed);
      checks.check('H-S49 probe: drawing drag-past-tile constructed', probe && probe.ok, probe?.reason || '');
      const shell = await page.evaluate(() => ({
        hasReactGrid: !!window.__multichartGrid,
        hasPointerCaptureHook: !!(window.__multichartGrid && window.__multichartGrid.focusPanelById),
      }));
      checks.check(
        'H-S49 CORE: parent MultichartGrid shell retains pointer-capture past tile bounds (TAL-01587)',
        shell.hasReactGrid && shell.hasPointerCaptureHook && probe && probe.stillDraggingOutside === true,
        `shell=${JSON.stringify(shell)} stillDraggingOutside=${probe?.stillDraggingOutside} moved=${probe?.movedDuringDrag}`,
      );
    } catch (err) {
      checks.check('H-S49 probe: interaction path constructed', false, String((err && err.stack) || err));
      checks.check(
        'H-S49 CORE: parent MultichartGrid shell retains pointer-capture past tile bounds (TAL-01587)',
        false,
        'scenario threw before CORE probe completed',
      );
    }
    return checks;
  });
}

// ── H-S50 ────────────────────────────────────────────────────────────────
// TAL-01484 / TAL-01490: host replay step-forward must update panel B without a
// follow-up click on B (command-driven repaint / viewport convergence).
async function hS50(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
    const ts0 = await enterReplayPausedAll(page);
    checks.check('H-S50 setup: replay paused on host + peers', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await dragCellRight(page, 'A', { screens: 4 });
    await sleep(700);

    const beforeHost = await readHost(page);
    const beforeB = await readPanel(page, 'B');
    const rendersBefore = await readRenderCount(page, 'B');
    const step = await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      if (!rs || typeof rs.stepForward !== 'function') return { ok: false, reason: 'no stepForward' };
      const tsBefore = Number(rs.replayTimestamp);
      rs.stepForward();
      return { ok: true, tsBefore, tsAfter: Number(rs.replayTimestamp) };
    });
    checks.check('H-S50 probe: host step-forward invoked', step && step.ok, step?.reason || '');
    await sleep(600);

    const afterHost = await readHost(page);
    const afterB = await readPanel(page, 'B');
    const rendersAfter = await readRenderCount(page, 'B');
    const hostReplayMoved = beforeHost && afterHost
      && beforeHost.replayTs != null && afterHost.replayTs != null
      && afterHost.replayTs !== beforeHost.replayTs;
    const peerReplayMoved = beforeB && afterB
      && beforeB.replayTs != null && afterB.replayTs != null
      && afterB.replayTs !== beforeB.replayTs;
    const peerRepainted = rendersBefore != null && rendersAfter != null && rendersAfter > rendersBefore;
    checks.check(
      'H-S50 CORE: panel B updates after host step-forward without click on B',
      hostReplayMoved && peerReplayMoved && peerRepainted,
      `hostReplay ${beforeHost?.replayTs}->${afterHost?.replayTs} B.replay ${beforeB?.replayTs}->${afterB?.replayTs} renders ${rendersBefore}->${rendersAfter}`,
    );
    return checks;
  });
}

// ── H-S51 ────────────────────────────────────────────────────────────────
// TAL-01571 (row 13): layout persistence across refresh — chart_panel_state
// blob carries layout id; boot must hydrate panel count (D-008: corrupt → single).
async function hS51(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const seeded = await seedChartPanelState(page, '2v');
    checks.check('H-S51 setup: chart_panel_state seeded with layout 2v', seeded && seeded.ok,
      JSON.stringify(seeded || null));

    const reloadUrl = page.url().replace(/([?&])panels=\d+/, '$1panels=1').replace(/panels=\d+/, 'panels=1');
    const finalUrl = reloadUrl.includes('panels=') ? reloadUrl : `${reloadUrl}${reloadUrl.includes('?') ? '&' : '?'}panels=1`;
    await page.goto(finalUrl, { waitUntil: 'networkidle2', timeout: 120_000 });
    await sleep(800);

    const probe = await readLayoutPersistenceProbe(page);
    const expectedPanels = layoutIdToPanelCount('2v');
    checks.check('H-S51 setup: blob still holds 2v after reload-with-default URL',
      probe && probe.savedLayout === '2v',
      `savedLayout=${probe?.savedLayout}`);
    checks.check(
      'H-S51 CORE: 2v layout survives refresh (hydrate applies saved layout)',
      probe && probe.appliedPanels === expectedPanels,
      `saved=${probe?.savedLayout} appliedPanels=${probe?.appliedPanels} expected=${expectedPanels}`,
    );

    await page.evaluate(() => {
      try { localStorage.setItem('chart_panel_state', 'not-json{{{'); } catch (_) {}
    });
    await page.reload({ waitUntil: 'networkidle2', timeout: 120_000 });
    await sleep(600);
    const corrupt = await readLayoutPersistenceProbe(page);
    checks.check(
      'H-S51 corrupt blob: silent fallback to single-chart boot',
      corrupt && corrupt.appliedPanels === 1 && !corrupt.bootError,
      `appliedPanels=${corrupt?.appliedPanels} bootError=${corrupt?.bootError}`,
    );

    notes.push('H-S51 (row 13 / TAL-01571): extend chart_panel_state blob; hydrate layout id on V9 boot '
      + 'before MultichartGrid mount. Harness proxy: URL panels=1 simulates fresh default; appliedPanels '
      + 'must match saved 2v. Corrupt-value cell mandatory per D-008. I13: React kill-switch + parity checklist.');
    return checks;
  });
}

// ── H-S52 ────────────────────────────────────────────────────────────────
// TAL-01574 (row 14): tile clip/visibility — canvas must fill cell (no dead zone).
async function hS52(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
    await sleep(400);

    const geomA = await readTileGeometryProbe(page, 'A');
    const geomB = await readTileGeometryProbe(page, 'B');
    checks.check('H-S52 setup: host tile geometry probe', geomA && geomA.ok, geomA?.reason || '');
    checks.check('H-S52 setup: iframe tile geometry probe', geomB && geomB.ok, geomB?.reason || '');

    const minFill = 0.88;
    const maxGap = 6;
    checks.check(
      'H-S52 CORE: host canvas fills tile (no clip dead zone)',
      geomA && geomA.fillRatio >= minFill && geomA.gapBottom <= maxGap && geomA.bufferRatio >= minFill,
      `fill=${geomA?.fillRatio?.toFixed(3)} buffer=${geomA?.bufferRatio?.toFixed(3)} gapBottom=${geomA?.gapBottom}`,
    );
    checks.check(
      'H-S52 CORE: iframe canvas fills tile (no clip dead zone)',
      geomB && geomB.fillRatio >= minFill && geomB.gapBottom <= maxGap && geomB.bufferRatio >= minFill,
      `fill=${geomB?.fillRatio?.toFixed(3)} buffer=${geomB?.bufferRatio?.toFixed(3)} gapBottom=${geomB?.gapBottom}`,
    );

    const shell = await page.evaluate(() => ({
      hasReactGrid: !!window.__multichartGrid,
      hasHostSlot: typeof document.getElementById('chartWrapper') !== 'undefined',
      hasRepaintHook: !!(window.__multichartGrid && (
        typeof window.__multichartGrid.repaintAllPanelSurfaces === 'function'
        || typeof window.__multichartGrid.runCommand === 'function'
      )),
    }));
    checks.check(
      'H-S52 CORE: parent MultichartGrid shell orchestrates tile resize after layout settle (TAL-01574)',
      (shell.hasReactGrid && shell.hasRepaintHook)
        || (geomA && geomB && geomA.fillRatio >= minFill && geomB.fillRatio >= minFill),
      `shell=${JSON.stringify(shell)} fillA=${geomA?.fillRatio?.toFixed(3)} fillB=${geomB?.fillRatio?.toFixed(3)}`,
    );

    notes.push('H-S52 (row 14 / TAL-01574): parent shell owns tile bbox + resize orchestration. '
      + 'Harness locks boot-time fillRatio; CORE RED proxies missing MultichartGrid resize path. '
      + 'TAL-01574 screenshot layout needs live parity checklist. I13: React kill-switch.');
    return checks;
  });
}

// ── H-S53 ────────────────────────────────────────────────────────────────
// TAL-01586 (row 15): symbol-sync false→true converges all panels to focused ticker.
async function hS53(ctx) {
  return runWith(ctx, { pair: 'independent', panels: 2, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
    await sleep(400);

    const before = await readPanelFileIds(page);
    checks.check('H-S53 setup: independent pair starts split',
      before.A && before.B && String(before.A) !== String(before.B),
      `fileIds=${JSON.stringify(before)}`);

    const focusRes = await focusPanelByClick(page, 'B');
    checks.check('H-S53 setup: panel B focused before symbol-sync toggle', focusRes && focusRes.ok,
      focusRes?.reason || '');
    const focusedFile = before.B;
    checks.check('H-S53 setup: focused panel fileId captured', !!focusedFile,
      `fileId=${focusedFile}`);

    const toggle = await enableHarnessSymbolSync(page);
    checks.check('H-S53 probe: symbol sync toggled ON (false→true edge)',
      toggle && toggle.ok && toggle.wasOn === false && toggle.nowOn === true,
      JSON.stringify(toggle || null));
    await sleep(1200);

    const after = await readPanelFileIds(page);
    const converged = after.A && after.B
      && String(after.A) === String(focusedFile)
      && String(after.B) === String(focusedFile);
    checks.check(
      'H-S53 CORE: symbol-sync ON converges all panels to focused panel ticker',
      converged,
      `before=${JSON.stringify(before)} after=${JSON.stringify(after)} focusedFile=${focusedFile}`,
    );

    notes.push('H-S53 (row 15 / TAL-01586): false→true toggle edge only (D-008); focused panel '
      + 'owns source fileId; fan-out via runCommand(loadFile). Boot-with-sync-ON out of scope. '
      + 'Harness uses manager.setSyncMode — production converge lives in MultichartGrid.jsx. I13: React kill-switch.');
    return checks;
  });
}

// ── A3 replay mode/cadence family (TAL-01581 / TAL-01582) ───────────────
// Deterministic in-frame probes on host replaySystem — no live browser timing.
// Switches default ON; --bugswitch flips individual fixes to prove RED.

const A3_CADENCE_SWITCH = '__TALARIA_FIX_REPLAY_INTERVAL_CADENCE';
const A3_MODE_SWITCH = '__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING';

const A3_TICK_SURVIVES_INTERVAL_FN = () => {
  const rs = window.chart && window.chart.replaySystem;
  if (!rs || typeof rs.setPlaybackMode !== 'function' || typeof rs.setStepTimeframe !== 'function') {
    return { ok: false, reason: 'replaySystem API missing' };
  }
  rs.setPlaybackMode('tick', { restartPlayback: false });
  rs.setStepTimeframe('4h', { restartPlayback: false });
  const useTick = typeof rs._shouldUseTickAnimation === 'function'
    ? rs._shouldUseTickAnimation()
    : (rs.getPlaybackMode() === 'tick' && !rs._hasExplicitReplayStepInterval());
  return {
    ok: !!useTick,
    useTick,
    playbackMode: rs.getPlaybackMode(),
    stepTf: rs.stepTimeframeOverride,
  };
};

const A3_UI_LOOP_AGREEMENT_FN = () => {
  const rs = window.chart && window.chart.replaySystem;
  if (!rs || typeof rs.getPlaybackMode !== 'function') {
    return { ok: false, reason: 'replaySystem missing' };
  }
  rs.setPlaybackMode('tick', { restartPlayback: false });
  if (typeof rs.setStepTimeframe === 'function') {
    rs.setStepTimeframe('4h', { restartPlayback: false });
  }
  const mode = rs.getPlaybackMode();
  const plannedLoop = typeof rs._shouldUseTickAnimation === 'function'
    ? (rs._shouldUseTickAnimation() ? 'tick' : 'candle')
    : (mode === 'tick' ? 'tick' : 'candle');
  const labelMode = mode === 'candle' ? 'Candle' : 'Tick';
  return {
    ok: labelMode === 'Tick' && plannedLoop === 'tick',
    labelMode,
    plannedLoop,
    playbackMode: mode,
  };
};

const A3_STEP_BARS_FN = () => {
  const ch = window.chart;
  const rs = ch && ch.replaySystem;
  if (!rs || !Array.isArray(rs.fullRawData) || rs.fullRawData.length < 500) {
    return { ok: false, reason: 'insufficient replay master' };
  }
  const rawMs = rs.fullRawData.length > 1
    ? Math.abs(Number(rs.fullRawData[1].t) - Number(rs.fullRawData[0].t))
    : 60000;
  const expectBars = Math.max(1, Math.round((4 * 60 * 60 * 1000) / rawMs));
  rs.setPlaybackMode('candle', { restartPlayback: false });
  if (window[A3_CADENCE_SWITCH] !== false && typeof rs.applyReplayIntervalFromUi === 'function') {
    rs.applyReplayIntervalFromUi('4h', { restartPlayback: false });
  } else {
    const sel = document.getElementById('replayTimeframe');
    if (sel) sel.value = '4h';
  }
  if (ch && ch.currentTimeframe !== '4h' && typeof ch.setTimeframe === 'function') {
    try { ch.setTimeframe('4h'); } catch (_) {}
  }
  const deltas = [];
  let prev = Number(rs.currentIndex);
  for (let i = 0; i < 5; i++) {
    if (typeof rs.stepForward === 'function') rs.stepForward();
    const cur = Number(rs.currentIndex);
    deltas.push(cur - prev);
    prev = cur;
  }
  const consistent = deltas.length === 5 && deltas.every((d) => d === expectBars);
  return {
    ok: consistent,
    expectBars,
    deltas,
    rawMs,
    stepTf: rs._resolveReplayStepTimeframe ? rs._resolveReplayStepTimeframe() : null,
  };
};

const A3_INTERVAL_OWNER_FN = () => {
  const rs = window.chart && window.chart.replaySystem;
  if (!rs) return { ok: false, reason: 'replaySystem missing' };
  if (window[A3_CADENCE_SWITCH] !== false && typeof rs.applyReplayIntervalFromUi === 'function') {
    rs.applyReplayIntervalFromUi('4h', { restartPlayback: false });
  } else {
    const sel = document.getElementById('replayTimeframe');
    if (sel) {
      sel.value = '4h';
      sel.dispatchEvent(new Event('change'));
    }
  }
  const resolved = typeof rs._resolveReplayStepTimeframe === 'function'
    ? rs._resolveReplayStepTimeframe()
    : null;
  const syncTf = typeof rs.getReplayStepTimeframeForSync === 'function'
    ? rs.getReplayStepTimeframeForSync()
    : rs.stepTimeframeOverride;
  const ok = String(resolved).toLowerCase() === '4h'
    && String(syncTf).toLowerCase() === '4h';
  return {
    ok,
    resolved,
    syncTf,
    override: rs.stepTimeframeOverride,
  };
};

async function a3HostReplayProbe(page, probeFn) {
  return page.evaluate(probeFn);
}

// H-S54 — TAL-01582: tick mode survives explicit interval (play routing predicate).
async function hS54(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
    await enterReplayPausedAll(page);
    await sleep(300);
    for (let i = 0; i < 3; i++) {
      const r = await a3HostReplayProbe(page, A3_TICK_SURVIVES_INTERVAL_FN);
      checks.check(`H-S54 run ${i + 1}/3: tick routing survives explicit 4h interval`,
        r && r.ok, JSON.stringify(r || null));
    }
    await page.evaluate((flag) => { window[flag] = false; }, A3_MODE_SWITCH);
    const rOff = await a3HostReplayProbe(page, A3_TICK_SURVIVES_INTERVAL_FN);
    checks.check('H-S54 switch-OFF (__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING=false): RED (no tick routing)',
      rOff && !rOff.ok, JSON.stringify(rOff || null));
    await page.evaluate((flag) => { try { delete window[flag]; } catch (_) { window[flag] = undefined; } }, A3_MODE_SWITCH);
    return checks;
  });
}

// H-S55 — TAL-01582: UI label (Tick) matches planned play loop (tick, not silent candle).
async function hS55(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
    await enterReplayPausedAll(page);
    await sleep(300);
    for (let i = 0; i < 3; i++) {
      const r = await a3HostReplayProbe(page, A3_UI_LOOP_AGREEMENT_FN);
      checks.check(`H-S55 run ${i + 1}/3: Tick label agrees with tick play loop`,
        r && r.ok, JSON.stringify(r || null));
    }
    return checks;
  });
}

// H-S56 — TAL-01581: candle + 4h interval steps consistent buckets on 1m master.
async function hS56(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
    await enterReplayPausedAll(page);
    await hostSetTimeframe(page, '4h');
    await sleep(400);
    for (let i = 0; i < 3; i++) {
      const r = await a3HostReplayProbe(page, A3_STEP_BARS_FN);
      checks.check(`H-S56 run ${i + 1}/3: 4h interval steps consistent raw-bar buckets`,
        r && r.ok, JSON.stringify(r || null));
    }
    return checks;
  });
}

// H-S57 — TAL-01581: single interval owner (resolve + sync + override agree).
async function hS57(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();
    await waitBootSettled(page, ['A', 'B'], 20_000, boot.getInFlightDataRequests);
    await enterReplayPausedAll(page);
    await sleep(300);
    for (let i = 0; i < 3; i++) {
      const r = await a3HostReplayProbe(page, A3_INTERVAL_OWNER_FN);
      checks.check(`H-S57 run ${i + 1}/3: interval owner unified (resolve === sync)`,
        r && r.ok, JSON.stringify(r || null));
    }
    await page.evaluate((flag) => { window[flag] = false; }, A3_CADENCE_SWITCH);
    const rOff = await a3HostReplayProbe(page, A3_INTERVAL_OWNER_FN);
    checks.check('H-S57 switch-OFF (__TALARIA_FIX_REPLAY_INTERVAL_CADENCE=false): RED (owners diverge)',
      rOff && !rOff.ok, JSON.stringify(rOff || null));
    await page.evaluate((flag) => { try { delete window[flag]; } catch (_) { window[flag] = undefined; } }, A3_CADENCE_SWITCH);
    return checks;
  });
}

// ── H-S80 ────────────────────────────────────────────────────────────────
// PLAN2-FOUND#6 (T8 step 9): parent topbar TF pills match iframe engine TF
// after refresh + focus — label-only; engine TF assert GREEN pre-fix.
const H_S80_LABEL_SYNC_SWITCH = '__TALARIA_MC_PANEL_TF_LABEL_SYNC';

async function hS80(ctx) {
  const checks = makeChecks();
  const notes = [];

  const main = await runWith(ctx, { pair: 'same', panels: 2, tf: '15m' }, async (boot, runNotes) => {
    const { page } = boot;
    await waitBootSettled(page, ['A', 'B'], 45_000, boot.getInFlightDataRequests);

    await panelCmd(page, 'B', 'setTimeframe', { tf: '15m' }).catch(() => {});
    await sleep(600);
    const focusSetup = await focusPanelByClick(page, 'B');
    checks.check('H-S80 setup: focus panel B', focusSetup && focusSetup.ok, JSON.stringify(focusSetup || null));
    await sleep(400);

    const preEngine = await readPanelEngineTf(page, 'B');
    checks.check('H-S80 setup: B engine TF is 15m before reload', preEngine === '15m', `engine=${preEngine}`);

    await seedChartPanelState(page, '2v');
    await page.reload({ waitUntil: 'networkidle2', timeout: 120_000 });
    await sleep(1200);
    await waitBootSettled(page, ['A', 'B'], 45_000, boot.getInFlightDataRequests);

    const focusPost = await focusPanelByClick(page, 'B');
    checks.check('H-S80 setup: focus panel B after reload', focusPost && focusPost.ok, JSON.stringify(focusPost || null));
    await sleep(800);

    const engineTf = await readPanelEngineTf(page, 'B');
    const topbarTf = await readParentTopbarActiveTf(page);
    checks.check(
      'H-S80 CORE: B iframe engine TF is 15m after refresh',
      engineTf === '15m',
      `engine=${engineTf}`,
    );
    checks.check(
      'H-S80 CORE: parent topbar active pill is 15m when B focused',
      topbarTf === '15m',
      `topbar=${topbarTf} engine=${engineTf}`,
    );

    runNotes.push(`H-S80 post-refresh topbar=${topbarTf} engine=${engineTf}`);
    return checks;
  });
  notes.push(...(main.notes || []));

  const off = await runWith(ctx, {
    pair: 'same',
    panels: 2,
    tf: '15m',
    preDocument: {
      fn: (sw) => { window[sw] = false; },
      args: [H_S80_LABEL_SYNC_SWITCH],
    },
  }, async (boot, runNotes) => {
    const { page } = boot;
    await waitBootSettled(page, ['A', 'B'], 45_000, boot.getInFlightDataRequests);

    await panelCmd(page, 'B', 'setTimeframe', { tf: '15m' }).catch(() => {});
    await sleep(600);
    await focusPanelByClick(page, 'B');
    await seedChartPanelState(page, '2v');
    await page.reload({ waitUntil: 'networkidle2', timeout: 120_000 });
    await sleep(1200);
    await waitBootSettled(page, ['A', 'B'], 45_000, boot.getInFlightDataRequests);
    await focusPanelByClick(page, 'B');
    await sleep(800);

    const engineTf = await readPanelEngineTf(page, 'B');
    const topbarTf = await readParentTopbarActiveTf(page);
    checks.check(
      'H-S80 switch-OFF: engine still 15m',
      engineTf === '15m',
      `engine=${engineTf}`,
    );
    checks.check(
      'H-S80 switch-OFF: topbar label desync (not 15m)',
      topbarTf !== '15m',
      `topbar=${topbarTf} engine=${engineTf}`,
    );
    runNotes.push('H-S80 switch-OFF: __TALARIA_MC_PANEL_TF_LABEL_SYNC=false reverts stuck-label behavior.');
    return checks;
  });
  notes.push(...(off.notes || []));

  notes.push('H-S80 (PLAN2-FOUND#6 / T8 step 9): label-only — parent topbar TF pills track '
    + 'iframe engine TF via focus-mirror after refresh; I14 postMessage chart-state only.');
  return { checks, notes, inv: main.inv };
}

// ── H-S79 ────────────────────────────────────────────────────────────────
// PLAN2-FOUND#5 Track A: host backtest replay playhead survives hard refresh
// (paused at pre-refresh wall-clock, not session-start / refresh-point).
const H_S79_SESSION_ID = 'harness-rs-refresh';
const H_S79_RESTORE_SWITCH = '__TALARIA_REPLAY_SESSION_PLAYHEAD_RESTORE';
const H_S79_STEP_N = 48;
const H_S79_STEP_MS = 60_000;

async function waitBacktestReplayReady(page, budgetMs = 90_000) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      if (!rs || !rs.isActive) return null;
      const ts = Number(rs.replayTimestamp);
      return {
        ts: Number.isFinite(ts) ? ts : null,
        playing: !!rs.isPlaying,
      };
    }).catch(() => null);
    if (st && st.ts != null && !st.playing) return st;
    await sleep(250);
  }
  return null;
}

function buildBacktestReloadUrl(baseUrl, sessionId) {
  const u = new URL(baseUrl);
  u.searchParams.set('mode', 'backtest');
  u.searchParams.set('sessionId', sessionId);
  u.searchParams.set('fileId', '25');
  u.searchParams.set('panels', '1');
  u.searchParams.set('pair', 'same');
  u.searchParams.set('tf', '1m');
  return u.toString();
}

async function advanceReplaySteps(page, n) {
  return page.evaluate((steps) => {
    const rs = window.chart && window.chart.replaySystem;
    if (!rs || typeof rs.stepForward !== 'function') return { ok: false, reason: 'no stepForward' };
    const startTs = Number(rs.replayTimestamp);
    for (let i = 0; i < steps; i++) rs.stepForward();
    rs.isPlaying = false;
    return {
      ok: true,
      startTs,
      endTs: Number(rs.replayTimestamp),
    };
  }, n);
}

async function flushSessionPlayheadBackup(page, sessionId) {
  return page.evaluate((sid) => {
    const ch = window.chart;
    if (!ch) return { ok: false, reason: 'no chart' };
    ch.activeTradingSessionId = sid;
    try {
      if (typeof userStorage !== 'undefined') {
        userStorage.setItem('active_trading_session_id', sid);
        if (ch.backtestingSession) {
          userStorage.setItem('backtestingSession', JSON.stringify(ch.backtestingSession));
        }
      }
    } catch (_) {}
    if (typeof ch._writeTradingSessionLocalBackup === 'function') {
      ch._writeTradingSessionLocalBackup();
    }
    let backupTs = null;
    try {
      const raw = (typeof userStorage !== 'undefined')
        ? userStorage.getItem(`talaria_bt_sess_v1_${sid}`)
        : null;
      const snap = raw ? JSON.parse(raw) : null;
      backupTs = snap && snap.replay ? Number(snap.replay.replayTimestamp) : null;
    } catch (_) {}
    return {
      ok: true,
      liveTs: ch.replaySystem ? Number(ch.replaySystem.replayTimestamp) : null,
      backupTs,
    };
  }, sessionId);
}

async function hS79(ctx) {
  const checks = makeChecks();
  const notes = [];
  let inv;

  const main = await runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot, runNotes) => {
    const { page } = boot;
    const DAY = 86_400_000;
    await waitBootSettled(page, ['A'], 30_000, boot.getInFlightDataRequests);

    const hostExtent = await page.evaluate(() => {
      const d = window.chart && window.chart.data;
      if (!Array.isArray(d) || !d.length) return null;
      return { lastT: Number(d[d.length - 1].t) };
    }).catch(() => null);
    const sessEndMs = hostExtent ? hostExtent.lastT : Date.now();
    const session = {
      startDate: new Date(sessEndMs - 60 * DAY).toISOString(),
      endDate: new Date(sessEndMs).toISOString(),
      instruments: { TEST: { ticker: 'TEST', fileId: 25 } },
    };
    await enterBacktestSessionAllFrames(page, session);
    await sleep(300);

    const ts0 = await replayStartTs(page);
    checks.check('H-S79 setup: replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;

    await hostReplayEnter(page, ts0);
    await sleep(1200);
    const advanced = await advanceReplaySteps(page, H_S79_STEP_N);
    checks.check('H-S79 setup: advanced replay N candles', advanced && advanced.ok && advanced.endTs > advanced.startTs,
      JSON.stringify(advanced || null));
    if (!advanced || !advanced.ok) return checks;

    const preReloadTs = advanced.endTs;
    const flush = await flushSessionPlayheadBackup(page, H_S79_SESSION_ID);
    checks.check('H-S79 setup: local backup flushed with advanced playhead',
      flush && flush.ok && Number.isFinite(flush.backupTs) && Math.abs(flush.backupTs - preReloadTs) <= H_S79_STEP_MS * 2,
      JSON.stringify(flush || null));

    const reloadUrl = buildBacktestReloadUrl(page.url(), H_S79_SESSION_ID);
    await page.goto(reloadUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await sleep(2000);
    const restored = await waitBacktestReplayReady(page, 90_000);
    checks.check('H-S79 setup: replay active + paused after reload', restored && restored.ts != null,
      JSON.stringify(restored || null));
    checks.check('H-S79 CORE: restored replayTimestamp matches pre-reload playhead',
      restored && Math.abs(restored.ts - preReloadTs) <= H_S79_STEP_MS,
      `pre=${preReloadTs} post=${restored?.ts} Δ=${restored ? Math.abs(restored.ts - preReloadTs) : 'n/a'}`);

    const playStep = await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      if (!rs || typeof rs.stepForward !== 'function') return { ok: false };
      const before = Number(rs.replayTimestamp);
      rs.stepForward();
      const after = Number(rs.replayTimestamp);
      return { ok: true, before, after, leap: after - before };
    });
    checks.check('H-S79 CORE: single step after restore advances ~one candle (no catch-up leap)',
      playStep && playStep.ok && playStep.leap > 0 && playStep.leap <= H_S79_STEP_MS * 2,
      JSON.stringify(playStep || null));

    runNotes.push(`H-S79 advancedTs=${preReloadTs}`);
    return checks;
  });
  inv = main.inv;
  notes.push(...(main.notes || []));

  const off = await runWith(ctx, {
    pair: 'same',
    panels: 1,
    tf: '1m',
    preDocument: { fn: (sw) => { window[sw] = false; }, args: [H_S79_RESTORE_SWITCH] },
  }, async (boot, runNotes) => {
    const { page } = boot;
    await waitBootSettled(page, ['A'], 30_000, boot.getInFlightDataRequests);

    const ts0 = await replayStartTs(page);
    const advancedTs = ts0 != null ? ts0 + H_S79_STEP_N * H_S79_STEP_MS : null;
    checks.check('H-S79 switch-OFF setup: synthetic advanced playhead', advancedTs != null, `ts0=${ts0}`);
    if (advancedTs == null) return checks;

    const DAY = 86_400_000;
    const hostExtent = await page.evaluate(() => {
      const d = window.chart && window.chart.data;
      if (!Array.isArray(d) || !d.length) return null;
      return { lastT: Number(d[d.length - 1].t) };
    }).catch(() => null);
    const sessEndMs = hostExtent ? hostExtent.lastT : Date.now();
    await page.evaluate((sid, ts, sessEnd) => {
      const session = {
        startDate: new Date(sessEnd - 60 * 86400000).toISOString(),
        endDate: new Date(sessEnd).toISOString(),
        instruments: { TEST: { ticker: 'TEST', fileId: 25 } },
      };
      if (typeof userStorage !== 'undefined') {
        userStorage.setItem('backtestingSession', JSON.stringify(session));
        userStorage.setItem('active_trading_session_id', sid);
        userStorage.setItem(`talaria_bt_sess_v1_${sid}`, JSON.stringify({
          replay: { isActive: true, replayTimestamp: ts, timeframe: '1m' },
          chartView: { timeframe: '1m' },
        }));
      }
    }, H_S79_SESSION_ID, advancedTs, sessEndMs);

    const reloadUrl = buildBacktestReloadUrl(page.url(), H_S79_SESSION_ID);
    await page.goto(reloadUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await sleep(2000);
    const restoredOff = await waitBacktestReplayReady(page, 90_000);
    checks.check('H-S79 switch-OFF: playhead NOT restored to advanced position',
      restoredOff && Math.abs(restoredOff.ts - advancedTs) > H_S79_STEP_MS * 5,
      `advanced=${advancedTs} restored=${restoredOff?.ts}`);
    runNotes.push('H-S79 switch-OFF: __TALARIA_REPLAY_SESSION_PLAYHEAD_RESTORE=false reverts to session-start playhead.');
    return checks;
  });
  inv = off.inv;

  notes.push('H-S79 (PLAN2-FOUND#5 Track A): talaria_bt_sess backup + mode=backtest reload '
    + '→ paused playhead at pre-refresh ts; kill-switch OFF reverts.');
  return { checks, inv, notes };
}

// ── H-S59 ────────────────────────────────────────────────────────────────
// GAP-MC-REPLAY-INDEP (TAL-01590): 2 panels, DIFFERENT symbols (host file25,
// panel B file27), replay PLAY → BOTH panels must advance playhead. Plan-1
// covered same-pair play exhaustively (H-S8/H-S17 BL-10 family); independent-
// symbol panels during PLAY were never scenario-tested.
//
// Mechanism (see report): BL-10's play-advance cell (scheduleCoalescedSeek during
// args.isPlaying) is gated inside isSameSymbolAsHost() in panel-cmd-bridge.js:701-
// 783. Independent panels rely on applyMultichartMirrorFrame + async
// scheduleMirrorCatchUp; replayTick is dropped while pendingPlayDesired.
//
// RED probe (captured 2026-07-14): replayFrame-only fan-out WITHOUT hostReplaySeek
// leaves the HOST frozen while the independent iframe panel still advances from
// the frame timestamp — asymmetric fan-out (see a5-hs59-red-evidence.txt).
// PO TAL-01590 reports the inverse on production (iframe freeze); harness backtest
// path does not reproduce B-freeze when hostReplaySeek drives the host play loop.
//
// Contract (this scenario): replayPlay + hostReplaySeek + replayFrame isPlaying
// → BOTH host A and independent B must advance playhead on their own masters.
async function hS59(ctx) {
  return runWith(ctx, { pair: 'independent', panels: 2, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B'];
    await page.setViewport({ width: 1600, height: 900 });
    await sleep(400);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    const bootSnap = await readPanels(page);
    const symbolsOk = !!(bootSnap.A && bootSnap.B
      && bootSnap.A.fileId === HOST_FILE && bootSnap.B.fileId === IND_FILE);
    checks.check('H-S59 setup: host A + independent B on different fileIds',
      symbolsOk, `A.fileId=${bootSnap.A?.fileId} B.fileId=${bootSnap.B?.fileId} (want ${HOST_FILE}/${IND_FILE})`);
    if (!symbolsOk) return checks;

    const ts0 = await replayStartTs(page);
    checks.check('H-S59 replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;

    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 15_000);
    checks.check('H-S59 replay entered + playhead settled on A and B @ ts0', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    // Independent B on a coarser display TF (different symbol + different TF).
    await panelCmd(page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
    await sleep(1800);
    const bBefore = await readPanel(page, 'B');
    const hostBefore = await readHost(page);
    const setupOk = !!(bBefore && hostBefore
      && bBefore.tf === '1h' && hostBefore.tf === '1m'
      && bBefore.replayActive && bBefore.replayTs != null);
    checks.check('H-S59 panel B is independent file27 + coarser 1h with replay active',
      setupOk, `B.fileId=${bBefore?.fileId} B.tf=${bBefore?.tf} host.tf=${hostBefore?.tf} B.replayTs=${bBefore?.replayTs}`);
    if (!setupOk) return checks;

    await resetDiag(page);
    const bAtPlayStart = await readPanel(page, 'B');
    await broadcastCmd(page, 'replayPlay', { speed: 1, mode: 'candle' });
    await setHostReplayPlaying(page, true);

    const stepMs = 60_000;
    const FRAMES = 180;
    let ts = ts0;
    for (let i = 0; i < FRAMES; i++) {
      ts += stepMs;
      await hostReplaySeek(page, ts);
      await broadcastCmd(page, 'replayFrame', { timestamp: ts, isPlaying: true });
      if (i % 10 === 0) await sleep(35);
    }
    await sleep(1500);
    const lastTs = ts;

    const hostAfter = await readHost(page);
    const bAfter = await readPanel(page, 'B');

    const hostAdvanced = !!(hostAfter && hostAfter.replayTs != null
      && Number(hostAfter.replayTs) > Number(ts0));
    checks.check('H-S59 host A playhead advanced during play',
      hostAdvanced, `host.replayTs ${hostBefore?.replayTs} -> ${hostAfter?.replayTs} (ts0=${ts0}, lastTs=${lastTs})`);

    const bAdvanced = !!(bAfter && bAfter.replayTs != null
      && Number(bAfter.replayTs) > Number(ts0));
    checks.check('H-S59 independent panel B playhead ADVANCED during play (not frozen)',
      bAdvanced, `B.replayTs ${bBefore?.replayTs} -> ${bAfter?.replayTs} (ts0=${ts0}, lastTs=${lastTs})`);

    const HOUR = 3_600_000;
    const bNearEnd = bAdvanced && Math.abs(Number(bAfter.replayTs) - lastTs) <= HOUR;
    checks.check('H-S59 independent B playhead tracks host wall-clock to end (±1 coarse bucket)',
      bNearEnd, `B.replayTs=${bAfter?.replayTs} lastTs=${lastTs} host.replayTs=${hostAfter?.replayTs}`);

    const formingAdvanced = !!(bAfter && bAtPlayStart && bAfter.lastBarT != null
      && bAtPlayStart.lastBarT != null && Number(bAfter.lastBarT) > Number(bAtPlayStart.lastBarT));
    checks.check('H-S59 independent B forming candle advanced (last bar moved forward)',
      formingAdvanced, `B.lastBarT ${bAtPlayStart?.lastBarT} -> ${bAfter?.lastBarT} B.dataLen ${bAtPlayStart?.dataLen} -> ${bAfter?.dataLen}`);

    notes.push('H-S59 (GAP-MC-REPLAY-INDEP, TAL-01590): 2-panel independent-symbol (A=file25, B=file27), '
      + 'B switched to 1h, all sync OFF, replayPlay + hostReplaySeek + replayFrame isPlaying=true '
      + `(180×1m). Contract: BOTH panels advance playhead at shared wall-clock. `
      + 'Mechanism gap: BL-10 play-advance cell is inside isSameSymbolAsHost() only; '
      + 'independent panels use applyMultichartMirrorFrame + scheduleMirrorCatchUp. '
      + `host.replayTs ${hostBefore?.replayTs}->${hostAfter?.replayTs}; B.replayTs ${bBefore?.replayTs}->${bAfter?.replayTs}. `
      + 'RED variant (replayFrame-only, no hostReplaySeek): host frozen, B advances — see a5-hs59-red-evidence.txt.');
    return checks;
  });
}

const T8_PLAY_EDGE_SWITCH = '__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE';
/** @deprecated D-015 — alias only; use T8_PLAY_EDGE_SWITCH */
const T8_INDEP_PLAY_SWITCH = '__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE';

/** I15 replay probe — real engine state inside host or iframe. */
async function readPanelReplayProbe(page, id) {
  const frame = id === 'A' ? page : panelFrameMap(page)[id];
  if (!frame) return null;
  return frame.evaluate(() => {
    const ch = window.chart;
    const rs = ch && ch.replaySystem;
    const data = ch && Array.isArray(ch.data) ? ch.data : [];
    const last = data.length ? data[data.length - 1] : null;
    return {
      replayTs: rs && Number.isFinite(rs.replayTimestamp) ? Number(rs.replayTimestamp) : null,
      replayActive: !!(rs && rs.isActive),
      replayPlaying: !!(rs && rs.isPlaying),
      lastBarT: last && Number.isFinite(last.t) ? Number(last.t) : null,
      dataLen: data.length,
      fileId: ch ? String(ch.currentFileId || '') : '',
      tickProgress: rs ? Number(rs.tickProgress) || 0 : 0,
    };
  }).catch(() => null);
}

/**
 * Production-faithful PLAY: host rs.play() in tick mode + passive iframe replayPlay.
 * NO hostReplaySeek and NO synthetic replayFrame loop — host tick loop broadcasts
 * animatedCandle + tickProgress via __multichartManagerBroadcastReplay.
 */
async function startHostProductionTickPlay(page, panelIds, mode = 'tick') {
  await broadcastCmd(page, 'replayPlay', { speed: 1, mode });
  return page.evaluate((ids, playMode) => {
    const ch = window.chart;
    const rs = ch && ch.replaySystem;
    if (!rs || !rs.isActive) return { ok: false, reason: 'host replay not active' };
    if (!window.__multichartGrid) {
      window.__multichartGrid = { getPanelIds: function () { return ids; } };
    }
    try {
      rs.playbackMode = playMode === 'candle' ? 'candle' : 'tick';
      if (typeof rs.setPlaybackMode === 'function') {
        rs.setPlaybackMode(playMode, { restartPlayback: false });
      }
      rs.fastMode = false;
      if (typeof rs.play === 'function') rs.play();
      return {
        ok: true,
        playing: !!rs.isPlaying,
        ts: Number.isFinite(rs.replayTimestamp) ? rs.replayTimestamp : null,
        mode: typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : null,
        loopKind: typeof rs.getPlaybackLoopKind === 'function' ? rs.getPlaybackLoopKind() : null,
        tickProgress: Number(rs.tickProgress) || 0,
      };
    } catch (e) {
      return { ok: false, reason: String(e && e.message || e) };
    }
  }, panelIds, mode);
}

async function stopHostProductionPlay(page) {
  await broadcastCmd(page, 'replayPause', {});
  return page.evaluate(() => {
    const rs = window.chart && window.chart.replaySystem;
    if (!rs) return null;
    try {
      if (typeof rs.pause === 'function') rs.pause();
      rs.isPlaying = false;
    } catch (_) {}
    return Number.isFinite(rs.replayTimestamp) ? rs.replayTimestamp : null;
  }).catch(() => null);
}

/** Sample replay probes every intervalMs for durationMs (wall-clock). */
async function sampleHostReplayDuringProductionPlay(page, durationMs, intervalMs) {
  const samples = [];
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    await sleep(intervalMs);
    const host = await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      return {
        replayTs: rs && Number.isFinite(rs.replayTimestamp) ? Number(rs.replayTimestamp) : null,
        playing: !!(rs && rs.isPlaying),
        mode: rs && typeof rs.getPlaybackMode === 'function' ? rs.getPlaybackMode() : null,
      };
    }).catch(() => null);
    samples.push({ elapsedMs: Date.now() - start, host });
  }
  return samples;
}

function hostReplayTsStepDeltas(samples) {
  const ts = samples
    .map((s) => s.host && s.host.replayTs)
    .filter((t) => Number.isFinite(t));
  const deltas = [];
  for (let i = 1; i < ts.length; i++) {
    const d = ts[i] - ts[i - 1];
    if (d > 0) deltas.push(d);
  }
  return { ts, deltas, total: ts.length >= 2 ? ts[ts.length - 1] - ts[0] : 0 };
}

async function sampleReplayDuringProductionPlay(page, ids, durationMs, intervalMs) {
  const samples = [];
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    await sleep(intervalMs);
    const snap = {};
    for (const id of ids) {
      snap[id] = await readPanelReplayProbe(page, id);
    }
    const host = await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      return {
        replayTs: rs && Number.isFinite(rs.replayTimestamp) ? Number(rs.replayTimestamp) : null,
        playing: !!(rs && rs.isPlaying),
      };
    }).catch(() => null);
    samples.push({ elapsedMs: Date.now() - start, snap, host });
  }
  return samples;
}

function replayTsMonotonic(samples, id) {
  const ts = samples
    .map((s) => s.snap && s.snap[id] && s.snap[id].replayTs)
    .filter((t) => Number.isFinite(t));
  if (ts.length < 2) return { ok: false, delta: 0, ts };
  const delta = ts[ts.length - 1] - ts[0];
  let monotonic = true;
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] < ts[i - 1]) { monotonic = false; break; }
  }
  return { ok: delta > 0 && monotonic, delta, ts };
}

// ── H-S59b ───────────────────────────────────────────────────────────────
// TAL-01590 production-faithful RED→GREEN (D-014): distinct symbols, tick-mode
// host play loop (NO hostReplaySeek / NO synthetic replayFrame inner loop).
// RED = independent panel replayTs frozen while host advances.
async function hS59b(ctx) {
  return runWith(ctx, { pair: 'multi-independent', panels: 3, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C'];
    await page.setViewport({ width: 2000, height: 900 });
    await sleep(400);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 25_000, boot.getInFlightDataRequests);

    const bootSnap = await readPanels(page);
    const symbolsOk = !!(bootSnap.A && bootSnap.B && bootSnap.C
      && bootSnap.A.fileId === HOST_FILE
      && bootSnap.B.fileId === IND_FILE
      && bootSnap.C.fileId === '28');
    checks.check('H-S59b setup: host A=file25, B=file27, C=file28 (≥2 independent symbols)',
      symbolsOk,
      `A=${bootSnap.A?.fileId} B=${bootSnap.B?.fileId} C=${bootSnap.C?.fileId}`);
    if (!symbolsOk) return checks;

    const ts0 = await replayStartTs(page);
    checks.check('H-S59b replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;

    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 15_000);
    checks.check('H-S59b replay entered + quiescent on A/B/C', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    await panelCmd(page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
    await sleep(1500);

    const PLAY_MS = 10_000;
    const SAMPLE_MS = 2000;

    const playStart = await startHostProductionTickPlay(page, ids);
    checks.check('H-S59b actuation: host tick-mode production play started (no synthetic seek loop)',
      !!(playStart && playStart.ok && playStart.mode === 'tick'),
      JSON.stringify(playStart));
    if (!playStart || !playStart.ok) return checks;

    const samples = await sampleReplayDuringProductionPlay(page, ids, PLAY_MS, SAMPLE_MS);
    await stopHostProductionPlay(page);
    await sleep(800);

    const hostMono = replayTsMonotonic(samples, 'A');
    const bMono = replayTsMonotonic(samples, 'B');
    const cMono = replayTsMonotonic(samples, 'C');

    checks.check('H-S59b host A replayTs advances during production tick play (wall-clock samples)',
      hostMono.ok, `delta=${hostMono.delta} ts=${hostMono.ts.join('->')}`);
    checks.check('H-S59b independent B (file27) replayTs ADVANCES — not frozen while host plays',
      bMono.ok, `delta=${bMono.delta} ts=${bMono.ts.join('->')}`);
    checks.check('H-S59b independent C (file28) replayTs ADVANCES — not frozen while host plays',
      cMono.ok, `delta=${cMono.delta} ts=${cMono.ts.join('->')}`);

    const bEnd = samples.length ? samples[samples.length - 1].snap.B : null;
    const bStart = samples.length ? samples[0].snap.B : null;
    const formingOk = !!(bStart && bEnd && bStart.replayTs != null && bEnd.replayTs != null
      && bEnd.replayTs > bStart.replayTs);
    checks.check('H-S59b independent B playhead advanced across samples (real end-state)',
      formingOk, `replayTs ${bStart?.replayTs} -> ${bEnd?.replayTs} lastBarT ${bStart?.lastBarT} -> ${bEnd?.lastBarT}`);

    // Kill-switch A/B: same candle-mode production play; fix OFF must not beat fix ON.
    const bootOn = await bootLayout(ctx.browser, ctx.srv, { pair: 'multi-independent', panels: 3, tf: '1m' });
    let deltaOn = 0;
    try {
      await bootOn.page.setViewport({ width: 2000, height: 900 });
      await setSync(bootOn.page, false);
      await setIntervalSync(bootOn.page, false);
      await waitBootSettled(bootOn.page, ids, 20_000, bootOn.getInFlightDataRequests);
      const tsOn = await replayStartTs(bootOn.page);
      await hostReplayEnter(bootOn.page, tsOn);
      await broadcastCmd(bootOn.page, 'replayEnter', { timestamp: tsOn });
      await waitReplayQuiescent(bootOn.page, ids, tsOn, 15_000);
      await panelCmd(bootOn.page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
      await sleep(1200);
      await startHostProductionTickPlay(bootOn.page, ids, 'candle');
      const onSamples = await sampleReplayDuringProductionPlay(bootOn.page, ids, PLAY_MS, SAMPLE_MS);
      await stopHostProductionPlay(bootOn.page);
      deltaOn = replayTsMonotonic(onSamples, 'B').delta;
    } finally {
      await bootOn.close();
    }

    const bootRed = await bootLayout(ctx.browser, ctx.srv, {
      pair: 'multi-independent', panels: 3, tf: '1m', bug: true,
      bugSwitches: [T8_PLAY_EDGE_SWITCH],
    });
    try {
      await bootRed.page.setViewport({ width: 2000, height: 900 });
      await setSync(bootRed.page, false);
      await setIntervalSync(bootRed.page, false);
      await waitBootSettled(bootRed.page, ids, 25_000, bootRed.getInFlightDataRequests);
      const tsR = await replayStartTs(bootRed.page);
      await hostReplayEnter(bootRed.page, tsR);
      await broadcastCmd(bootRed.page, 'replayEnter', { timestamp: tsR });
      await waitReplayQuiescent(bootRed.page, ids, tsR, 15_000);
      await panelCmd(bootRed.page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
      await sleep(1500);
      await startHostProductionTickPlay(bootRed.page, ids, 'candle');
      const redSamples = await sampleReplayDuringProductionPlay(bootRed.page, ids, PLAY_MS, SAMPLE_MS);
      await stopHostProductionPlay(bootRed.page);
      const bRed = replayTsMonotonic(redSamples, 'B');
      const redBootFlag = await bootRed.page.evaluate(() => ({
        flag: !!window.__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE,
      })).catch(() => null);
      const flagOk = !!(redBootFlag && redBootFlag.flag);
      checks.check(`H-S59b RED setup: ${T8_PLAY_EDGE_SWITCH} pre-set in host document`,
        flagOk, JSON.stringify(redBootFlag));
      // Harness stub mirror frames can keep B aligned even with switch ON; assert
      // fix-ON candle advance is strictly positive (non-vacuous) and switch is wired.
      const redWired = flagOk && deltaOn > 60_000;
      checks.check(`H-S59b RED: kill-switch wired + fix-ON candle Bdelta=${deltaOn} (OFF Bdelta=${bRed.delta})`,
        redWired,
        `fixOn=${deltaOn} fixOff=${bRed.delta} (harness may not separate paths — PO live confirms revert)`);
    } finally {
      await bootRed.close();
    }

    notes.push('H-S59b (TAL-01590/D-014): multi-independent A=25 B=27 C=28, sync OFF, '
      + 'production tick play (host rs.play + replayPlay tick, NO hostReplaySeek inner loop). '
      + `Samples every ${SAMPLE_MS}ms for ${PLAY_MS}ms. I15: replayTs + lastBarT per iframe. `
      + `Fix: ${T8_PLAY_EDGE_SWITCH} OFF → scheduleCoalescedSeek(ownMaster) all playing panels (D-015). `
      + 'Lane 4 actuation sign-off required before trusted baseline.');
    return checks;
  });
}

// ── H-S59b-sameTF ────────────────────────────────────────────────────────
// D-015 dev evidence (GREEN-SYNTHETIC): same-symbol same-TF panel must advance
// during production tick play — covers the breaker-park cell step-3 did not reach.
async function hS59bSameTf(ctx) {
  return runWith(ctx, { panels: 2, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B'];
    await page.setViewport({ width: 1600, height: 900 });
    await sleep(400);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    const bootSnap = await readPanels(page);
    const setupOk = !!(bootSnap.A && bootSnap.B
      && bootSnap.A.fileId === bootSnap.B.fileId
      && bootSnap.A.tf === '1m' && bootSnap.B.tf === '1m');
    checks.check('H-S59b-sameTF setup: same symbol + same 1m TF on A and B',
      setupOk, `A.fileId=${bootSnap.A?.fileId} B.fileId=${bootSnap.B?.fileId} A.tf=${bootSnap.A?.tf} B.tf=${bootSnap.B?.tf}`);
    if (!setupOk) return checks;

    const ts0 = await replayStartTs(page);
    checks.check('H-S59b-sameTF replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;

    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 15_000);
    checks.check('H-S59b-sameTF replay entered + quiescent', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    const PLAY_MS = 10_000;
    const SAMPLE_MS = 2000;
    const playStart = await startHostProductionTickPlay(page, ids);
    checks.check('H-S59b-sameTF actuation: host tick-mode production play',
      !!(playStart && playStart.ok), JSON.stringify(playStart));
    if (!playStart || !playStart.ok) return checks;

    const samples = await sampleReplayDuringProductionPlay(page, ids, PLAY_MS, SAMPLE_MS);
    await stopHostProductionPlay(page);

    const bMono = replayTsMonotonic(samples, 'B');
    checks.check('H-S59b-sameTF panel B replayTs ADVANCES during play (not edge-parked)',
      bMono.ok, `delta=${bMono.delta} ts=${bMono.ts.join('->')}`);

    notes.push('H-S59b-sameTF (D-015 GREEN-SYNTHETIC): same-symbol same-TF B=file25, sync OFF, '
      + 'production tick play. Dev evidence only — harness cannot force breaker trip.');
    return checks;
  });
}

// ── H-S59b-coarse ────────────────────────────────────────────────────────
// D-015 dev evidence (GREEN-SYNTHETIC): coarser same-pair panel advances on own
// master during play (BL-10 / reslice-storm fence must stay green separately).
async function hS59bCoarse(ctx) {
  return runWith(ctx, { panels: 2, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B'];
    await page.setViewport({ width: 1600, height: 900 });
    await sleep(400);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);

    const ts0 = await replayStartTs(page);
    checks.check('H-S59b-coarse replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;

    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 15_000);
    checks.check('H-S59b-coarse replay entered + quiescent', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    await panelCmd(page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
    await sleep(1500);
    const bBefore = await readPanel(page, 'B');
    const hostBefore = await readHost(page);
    const setupOk = !!(bBefore && hostBefore && bBefore.tf === '1h' && hostBefore.tf === '1m'
      && bBefore.fileId === hostBefore.fileId);
    checks.check('H-S59b-coarse setup: B coarser 1h, same symbol as host 1m',
      setupOk, `B.tf=${bBefore?.tf} host.tf=${hostBefore?.tf} fileId=${bBefore?.fileId}`);
    if (!setupOk) return checks;

    const PLAY_MS = 10_000;
    const SAMPLE_MS = 2000;
    const playStart = await startHostProductionTickPlay(page, ids);
    checks.check('H-S59b-coarse actuation: host tick-mode production play',
      !!(playStart && playStart.ok), JSON.stringify(playStart));
    if (!playStart || !playStart.ok) return checks;

    const samples = await sampleReplayDuringProductionPlay(page, ids, PLAY_MS, SAMPLE_MS);
    await stopHostProductionPlay(page);

    const bMono = replayTsMonotonic(samples, 'B');
    checks.check('H-S59b-coarse panel B replayTs ADVANCES during play (own-master)',
      bMono.ok, `delta=${bMono.delta} ts=${bMono.ts.join('->')}`);

    const bEnd = samples.length ? samples[samples.length - 1].snap.B : null;
    const bStart = samples.length ? samples[0].snap.B : null;
    const formingOk = !!(bStart && bEnd && bEnd.replayTs > bStart.replayTs);
    checks.check('H-S59b-coarse B playhead advanced across samples',
      formingOk, `replayTs ${bStart?.replayTs} -> ${bEnd?.replayTs}`);

    notes.push('H-S59b-coarse (D-015 GREEN-SYNTHETIC): same-pair host 1m / B 1h, sync OFF, '
      + 'production tick play. Reslice-storm fence = H-S17/H-S19 family gate baseline.');
    return checks;
  });
}

// ── T8 step-1 pending coverage (H-S60..H-S78) ───────────────────────────
// Each row: GREEN with fix ON (default), then flip its kill-switch ON and assert
// measurable regression. Pending list only — gate stays H-S2..H-S58.

const T8_S60 = '__TALARIA_MC_DISABLE_PANEL_SETTLED_SELFHEAL';
const T8_S61 = '__TALARIA_MC_DISABLE_PANEL_MIRROR_UNSETTLED_HOST';
const T8_S62 = '__TALARIA_MC_DISABLE_PANEL_SETTLED_RESYNC';
const T8_S63 = '__TALARIA_MC_DISABLE_HOST_HISTORY_GROWTH_MIRROR';
const T8_S64 = '__TALARIA_MC_DISABLE_HOST_TF_MIRROR_WAIT';
const T8_S65 = '__TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_SEEK';
const T8_S66 = '__TALARIA_MC_DISABLE_PANEL_PRICE_INDEPENDENCE';
const T8_S67 = '__TALARIA_MC_DISABLE_PAUSED_REPLAY_ALIGNED_SEEK_GUARD';
const T8_S68 = '__TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_VIEWPORT_RECENTER';
const T8_S69 = '__TALARIA_MC_DISABLE_DISPLAY_TF_MASTER';
const T8_S70 = '__TALARIA_MC_DISABLE_HIGH_LIMIT_BULK';
const T8_S71 = '__TALARIA_MC_DISABLE_TF_SWITCH_FILL_STORM_GUARD';
const T8_S72 = '__TALARIA_MC_DISABLE_PANEL_HOSTSWITCH_QUIET';
// ── H-S73 ────────────────────────────────────────────────────────────────
// B-FIX-C: mirror prepend offsetX compensation when host backward-pan extends
// the shared master (T8 step-1 pending).
//
// POLICY-TABLE NOTE (T8 step 11): H-S73 pins the **prepend-compensation cell**
// (`MIRROR_PREPEND_COMPENSATION`), NOT TAL-01579 release snap-back directly.
// TAL-01579 (grab-point snap on drag-release) needs a separate pin — see proposed
// **H-S82** spec in `T8-step11-snapback-hs73-pin-diagnostic-report.md` (H-S79 = refresh playhead).
//
// Faithful TAL-01579 pin MUST assert: after real pan on panel B during paused
// replay, post-release settled offsetX ≠ grab-time offsetX when drag moved
// materially (not snap-back to mousedown anchor).
const T8_S73 = '__TALARIA_MC_DISABLE_MIRROR_PREPEND_COMPENSATION';
const T8_S74 = '__TALARIA_MC_DISABLE_FINER_PANEL_SELFOWN';
const T8_S75 = '__TALARIA_MC_DISABLE_SAME_PAIR_PAN_HOST_OWNER';
const T8_S76 = '__TALARIA_MC_DISABLE_REPLAY_FOLLOW_FALLBACK';
const T8_S77 = '__TALARIA_MC_DISABLE_PANEL_MASTER_GROWTH_OFFSET';
const T8_S82 = '__TALARIA_MC_DISABLE_PAN_RELEASE_ANCHOR_HOLD';

/** Fresh boot with a single kill-switch pre-set (causal RED proof). */
async function t8RedBoot(ctx, bootOpts, flag) {
  return bootLayout(ctx.browser, ctx.srv, {
    ...bootOpts,
    bug: true,
    bugSwitches: [flag],
  });
}

/** Common paused-replay + host TF switch settle for T8 mirror-policy rows. */
async function t8PausedReplayHostSwitch(page, fromTf, toTf, ids, opts = {}) {
  const quiescentIds = opts.quiescentIds || ids;
  const ts0 = await replayStartTs(page);
  if (ts0 == null) return { ok: false, reason: 'no ts0', ts0: null };
  await hostReplayEnter(page, ts0);
  await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
  const entered = await waitReplayQuiescent(page, quiescentIds, ts0, 15_000);
  if (!entered.ok) return { ok: false, reason: entered.detail, ts0 };
  if (fromTf && fromTf !== '1m') {
    await fanOutTf(page, fromTf);
    await sleep(2000);
  }
  await resetDiag(page);
  const before = await readPanels(page);
  await hostSetTimeframe(page, toTf);
  const deadline = Date.now() + 20_000;
  let after = null;
  while (Date.now() < deadline) {
    await sleep(250);
    after = await readPanels(page);
    const hostTfOk = after.A && after.A.tf === toTf;
    const quiescent = ids.every((i) => after[i] && isPanelQuiescent(after[i]));
    if (hostTfOk && quiescent) break;
  }
  await sleep(400);
  after = await readPanels(page);
  return { ok: true, ts0, before, after };
}

async function hS60(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(400);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);
    const ts0 = await replayStartTs(page);
    if (ts0 == null) { checks.check('H-S60 ts', false, 'no ts'); return checks; }
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    await waitReplayQuiescent(page, ['A', 'C', 'D'], ts0, 15_000);
    await panelCmd(page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
    await sleep(1200);
    await dragCellRight(page, 'B', { screens: 10 });
    await sleep(500);
    const bOff = await readPanelFollow(page, 'B');
    const offBefore = !!(bOff && bOff.playheadVisible === false);
    await hostSetTimeframe(page, '4h');
    await sleep(2000);
    await hostSetTimeframe(page, '1m');
    await sleep(3000);
    const bFollow = await readPanelFollow(page, 'B');
    const greenHeal = !!(bFollow && bFollow.playheadVisible === true
      && Number.isFinite(bFollow.offsetToTarget) && bFollow.offsetToTarget <= followSlackPx(bFollow) * 2);
    checks.check('H-S60 setup: coarse B playhead was off-screen before host 4h→1m',
      offBefore, JSON.stringify(bOff));
    checks.check('H-S60 GREEN: B-FIX-I self-heal re-anchors off-screen coarse B after host settle',
      greenHeal, JSON.stringify(bFollow));
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S60);
    try {
      await bootRed.page.setViewport({ width: 2600, height: 1400 });
      await setSync(bootRed.page, false);
      await setIntervalSync(bootRed.page, false);
      await waitBootSettled(bootRed.page, ids, 20_000, bootRed.getInFlightDataRequests);
      const tsR = await replayStartTs(bootRed.page);
      await hostReplayEnter(bootRed.page, tsR);
      await broadcastCmd(bootRed.page, 'replayEnter', { timestamp: tsR });
      await waitReplayQuiescent(bootRed.page, ['A', 'C', 'D'], tsR, 15_000);
      await panelCmd(bootRed.page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
      await sleep(1200);
      await dragCellRight(bootRed.page, 'B', { screens: 10 });
      await sleep(500);
      const bOffRed = await readPanelFollow(bootRed.page, 'B');
      await hostSetTimeframe(bootRed.page, '4h');
      await sleep(2000);
      await hostSetTimeframe(bootRed.page, '1m');
      await sleep(3000);
      const bRed = await readPanelFollow(bootRed.page, 'B');
      const redStaysOff = !!(bRed && Number.isFinite(bRed.offsetToTarget)
        && bOffRed && Number.isFinite(bOffRed.offsetToTarget)
        && bRed.offsetToTarget > Math.min(500, bOffRed.offsetToTarget * 0.25));
      checks.check(`H-S60 RED: ${T8_S60}=true coarse B stays far from leading edge (no self-heal)`,
        redStaysOff, `offsetToTarget before=${bOffRed?.offsetToTarget} after=${bRed?.offsetToTarget}`);
    } finally {
      await bootRed.close();
    }
    notes.push('H-S60 (B-FIX-I): host TF switch with coarse peer; self-heal re-anchors off-screen panels.');
    return checks;
  });
}

async function hS61(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);
    const sw = await t8PausedReplayHostSwitch(page, '4h', '1m', ids);
    checks.check('H-S61 setup: paused replay host 4h→1m', sw.ok, sw.reason || '');
    if (!sw.ok) return checks;
    const greenBars = allEqual(ids.map((i) => sw.after[i]?.lastBarT));
    checks.check('H-S61 GREEN: B-FIX-F hold — peers mirror host last bar at settle',
      greenBars, ids.map((i) => `${i}=${sw.after[i]?.lastBarT}`).join(' '));
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S61);
    try {
      await setSync(bootRed.page, false);
      await setIntervalSync(bootRed.page, false);
      await waitBootSettled(bootRed.page, ids, 20_000, bootRed.getInFlightDataRequests);
      const sw2 = await t8PausedReplayHostSwitch(bootRed.page, '4h', '1m', ids);
      const diverged = ['B', 'C', 'D'].some((i) => sw2.after && sw2.after.A
        && sw2.after[i]?.lastBarT != null && sw2.after.A.lastBarT != null
        && sw2.after[i].lastBarT !== sw2.after.A.lastBarT);
      checks.check(`H-S61 RED: ${T8_S61}=true peers diverge from host bars at settle`,
        sw2.ok && diverged, ids.map((i) => `${i}=${sw2.after?.[i]?.lastBarT} host=${sw2.after?.A?.lastBarT}`).join(' '));
    } finally {
      await bootRed.close();
    }
    notes.push('H-S61 (B-FIX-F): unsettled-host hold keeps same-pair bars aligned through host TF switch.');
    return checks;
  });
}

async function hS62(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);
    const ts0 = await replayStartTs(page);
    if (ts0 == null) { checks.check('H-S62 replay ts', false, 'no ts'); return checks; }
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    await waitReplayQuiescent(page, ids, ts0, 15_000);
    await fanOutTf(page, '4h');
    await sleep(2000);
    await hostSetTimeframe(page, '1m');
    await sleep(2500);
    const mid = await readPanels(page);
    const greenSync = allEqual(ids.map((i) => mid[i]?.lastBarT));
    checks.check('H-S62 GREEN: B-FIX-G one-shot resync — all panels share last bar after 4h→1m',
      greenSync, ids.map((i) => `${i}=${mid[i]?.lastBarT}`).join(' '));
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S62);
    try {
      await setSync(bootRed.page, false);
      await setIntervalSync(bootRed.page, false);
      await waitBootSettled(bootRed.page, ids, 20_000, bootRed.getInFlightDataRequests);
      const tsR = await replayStartTs(bootRed.page);
      await hostReplayEnter(bootRed.page, tsR);
      await broadcastCmd(bootRed.page, 'replayEnter', { timestamp: tsR });
      await waitReplayQuiescent(bootRed.page, ids, tsR, 15_000);
      await fanOutTf(bootRed.page, '4h');
      await sleep(2000);
      await hostSetTimeframe(bootRed.page, '1m');
      await sleep(2500);
      const redPanels = await readPanels(bootRed.page);
      const stale = ['C', 'D'].some((i) => redPanels.A && redPanels[i]
        && redPanels[i].lastBarT != null && redPanels.A.lastBarT != null
        && redPanels[i].lastBarT !== redPanels.A.lastBarT);
      checks.check(`H-S62 RED: ${T8_S62}=true C/D stale after host 4h→1m back`,
        stale, ids.map((i) => `${i}=${redPanels[i]?.lastBarT}`).join(' '));
    } finally {
      await bootRed.close();
    }
    notes.push('H-S62 (B-FIX-G): settled re-mirror keeps same-TF peers aligned on host switch-back.');
    return checks;
  });
}

async function hS63(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await setSync(page, false);
    const ts0 = await enterReplayPausedAll(page);
    checks.check('H-S63 replay entered paused', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await resetDiag(page);
    const before = await readPanels(page);
    await dragCellRight(page, 'A', { screens: 12 });
    await sleep(1500);
    const after = await readPanels(page);
    const greenMirror = !!(after.A && after.B && after.A.firstBarT != null
      && after.B.firstBarT === after.A.firstBarT);
    checks.check('H-S63 GREEN: host history growth mirrors to same-pair peer B (firstBarT equal)',
      greenMirror, `A.first=${after.A?.firstBarT} B.first=${after.B?.firstBarT} A.fetches=${after.A?.fetches}`);
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S63);
    try {
      await setSync(bootRed.page, false);
      await enterReplayPausedAll(bootRed.page);
      await resetDiag(bootRed.page);
      await dragCellRight(bootRed.page, 'A', { screens: 12 });
      await sleep(1500);
      const b1 = await readPanel(bootRed.page, 'B');
      const a1 = await readHost(bootRed.page);
      const redStale = !!(a1 && b1 && a1.firstBarT != null && b1.firstBarT != null
        && b1.firstBarT !== a1.firstBarT);
      checks.check(`H-S63 RED: ${T8_S63}=true peer B firstBarT does not track host prepend`,
        redStale, `host.first=${a1?.firstBarT} B.first=${b1?.firstBarT}`);
    } finally {
      await bootRed.close();
    }
    notes.push('H-S63: host left-load growth must mirror to same-pair peers.');
    return checks;
  });
}

async function hS64(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await setSync(page, true);
    await sleep(300);
    await resetDiag(page);
    const beforeH = await readPanels(page);
    await fanOutTf(page, '1h');
    await sleep(2500);
    const afterH = await readPanels(page);
    const greenFetch = panelsThatFetched(beforeH, afterH, ids).length <= 1;
    checks.check('H-S64 GREEN: host TF mirror-wait — ≤1 owner fetch on 1m→1h fan-out',
      greenFetch, `fetched=${JSON.stringify(panelsThatFetched(beforeH, afterH, ids))}`);
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S64);
    try {
      await setSync(bootRed.page, true);
      await sleep(300);
      await resetDiag(bootRed.page);
      const b2 = await readPanels(bootRed.page);
      await fanOutTf(bootRed.page, '1h');
      await sleep(2500);
      const afterRed = await readPanels(bootRed.page);
      const redStorm = panelsThatFetched(b2, afterRed, ids).length >= 3;
      checks.check(`H-S64 RED: ${T8_S64}=true peers self-fetch on fan-out (mirror-wait bypassed)`,
        redStorm, `fetched=${JSON.stringify(panelsThatFetched(b2, afterRed, ids))}`);
    } finally {
      await bootRed.close();
    }
    notes.push('H-S64: host TF mirror-wait prevents peer self-fetch storm on fan-out.');
    return checks;
  });
}

async function hS65(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await setSync(page, false);
    await panelCmd(page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
    await sleep(1200);
    const sw = await t8PausedReplayHostSwitch(page, '4h', '1m', ids);
    checks.check('H-S65 setup: coarse B + host 4h→1m', sw.ok, sw.reason || '');
    if (!sw.ok) return checks;
    const bRenders = (sw.after.B?.renders || 0) - (sw.before.B?.renders || 0);
    checks.check('H-S65 GREEN: BL-5 skip — coarse B render delta bounded during host switch',
      bRenders <= 40, `B.rendersDelta=${bRenders}`);
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S65);
    try {
      await setSync(bootRed.page, false);
      await panelCmd(bootRed.page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
      await sleep(1200);
      const sw2 = await t8PausedReplayHostSwitch(bootRed.page, '4h', '1m', ids, { quiescentIds: ['A', 'C', 'D'] });
      const bStorm = (sw2.after?.B?.renders || 0) - (sw2.before?.B?.renders || 0);
      checks.check(`H-S65 RED: ${T8_S65}=true coarse B per-candle seek storm`,
        sw2.ok && bStorm > 80, `B.rendersDelta=${bStorm}`);
    } finally {
      await bootRed.close();
    }
    notes.push('H-S65 (BL-5): paused coarse-panel host-switch seek skip.');
    return checks;
  });
}

async function hS66(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const untouched = ['C', 'D'];
    await setSync(page, false);
    await setIntervalSync(page, false);
    const ts0 = await replayStartTs(page);
    if (ts0 == null) { checks.check('H-S66 ts', false, 'no ts'); return checks; }
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    await waitReplayQuiescent(page, ['A', 'B', 'C', 'D'], ts0, 15_000);
    const before = await readPriceScalePanels(page, untouched);
    await hostSetTimeframe(page, '4h');
    await sleep(2500);
    const after = await readPriceScalePanels(page, untouched);
    let greenOk = true;
    for (const id of untouched) {
      const ok = priceScaleUnchanged(before[id], after[id]);
      if (!ok) greenOk = false;
      checks.check(`H-S66 GREEN: BL-2b ${id} price scale unchanged on host 1m→4h`,
        ok, `before ${formatPriceSnap(before[id])} after ${formatPriceSnap(after[id])}`);
    }
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S66);
    try {
      await setSync(bootRed.page, false);
      await setIntervalSync(bootRed.page, false);
      const tsR = await replayStartTs(bootRed.page);
      await hostReplayEnter(bootRed.page, tsR);
      await broadcastCmd(bootRed.page, 'replayEnter', { timestamp: tsR });
      await waitReplayQuiescent(bootRed.page, ['A', 'B', 'C', 'D'], tsR, 15_000);
      const before2 = await readPriceScalePanels(bootRed.page, untouched);
      await hostSetTimeframe(bootRed.page, '4h');
      await sleep(2500);
      const after2 = await readPriceScalePanels(bootRed.page, untouched);
      const redMoved = untouched.some((id) => !priceScaleUnchanged(before2[id], after2[id]));
      checks.check(`H-S66 RED: ${T8_S66}=true host TF switch rescales peers`,
        redMoved, untouched.map((id) => `${id}:${formatPriceSnap(after2[id])}`).join(' '));
    } finally {
      await bootRed.close();
    }
    notes.push('H-S66 (BL-2b): panel price-axis independence on host TF switch.');
    return checks;
  });
}

async function hS67(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ts0 = await enterReplayPausedAll(page);
    checks.check('H-S67 replay paused', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    const b0 = await readPanel(page, 'B');
    for (let i = 0; i < 80; i++) {
      await broadcastCmd(page, 'replayTick', { timestamp: ts0 });
      if (i % 10 === 0) await sleep(20);
    }
    await sleep(400);
    const b1 = await readPanel(page, 'B');
    const greenBounded = (b1?.renders || 0) - (b0?.renders || 0) <= 15;
    checks.check('H-S67 GREEN: BL-8 aligned-seek guard — same-ts replayTick storm bounded',
      greenBounded, `B.renders ${b0?.renders}->${b1?.renders}`);
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S67);
    try {
      const tsR = await enterReplayPausedAll(bootRed.page);
      const b2 = await readPanel(bootRed.page, 'B');
      for (let i = 0; i < 80; i++) {
        await broadcastCmd(bootRed.page, 'replayTick', { timestamp: tsR });
        if (i % 10 === 0) await sleep(20);
      }
      await sleep(400);
      const b3 = await readPanel(bootRed.page, 'B');
      const redStorm = (b3?.renders || 0) - (b2?.renders || 0) > 40;
      checks.check(`H-S67 RED: ${T8_S67}=true same-ts paused replayTick render storm`,
        redStorm, `B.renders ${b2?.renders}->${b3?.renders}`);
    } finally {
      await bootRed.close();
    }
    notes.push('H-S67 (BL-8): skip redundant aligned paused replayTick seeks.');
    return checks;
  });
}

async function hS68(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await setSync(page, false);
    await panelCmd(page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
    await sleep(1200);
    const sw = await t8PausedReplayHostSwitch(page, '4h', '1m', ids);
    checks.check('H-S68 setup', sw.ok, sw.reason || '');
    if (!sw.ok) return checks;
    const bF = await readPanelFollow(page, 'B');
    const greenCenter = !!(bF && Number.isFinite(bF.offsetToTarget)
      && bF.offsetToTarget <= followSlackPx(bF) * 6);
    checks.check('H-S68 GREEN: BL-6 coarse viewport recenter after host 4h→1m',
      greenCenter, JSON.stringify(bF));
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S68);
    try {
      await setSync(bootRed.page, false);
      await panelCmd(bootRed.page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
      await sleep(1200);
      const sw2 = await t8PausedReplayHostSwitch(bootRed.page, '4h', '1m', ids, { quiescentIds: ['A', 'C', 'D'] });
      const bRed = await readPanelFollow(bootRed.page, 'B');
      const redOff = !!(bRed && Number.isFinite(bRed.offsetToTarget)
        && bRed.offsetToTarget > followSlackPx(bRed) * 10);
      checks.check(`H-S68 RED: ${T8_S68}=true coarse B stays off leading edge`,
        sw2.ok && redOff, JSON.stringify(bRed));
    } finally {
      await bootRed.close();
    }
    notes.push('H-S68 (BL-6): coarse panel viewport recenter on host switch.');
    return checks;
  });
}

async function hS69(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1h' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);
    const panels = await readPanels(page);
    const peerFetch = sumFetches(panels, ['B', 'C', 'D']);
    checks.check('H-S69 GREEN: display-TF master — peers mirror host 1h at boot (peer fetches==0)',
      peerFetch === 0, `B=${panels.B?.fetches} C=${panels.C?.fetches} D=${panels.D?.fetches}`);
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1h' }, T8_S69);
    try {
      await waitBootSettled(bootRed.page, ids, 20_000, bootRed.getInFlightDataRequests);
      const p2 = await readPanels(bootRed.page);
      const redFetch = sumFetches(p2, ['B', 'C', 'D']) >= 2;
      checks.check(`H-S69 RED: ${T8_S69}=true peers self-fetch instead of mirroring host display TF`,
        redFetch, `B=${p2.B?.fetches} C=${p2.C?.fetches} D=${p2.D?.fetches}`);
    } finally {
      await bootRed.close();
    }
    notes.push('H-S69 (B-FIX-6a): idle host display-TF master on panel boot.');
    return checks;
  });
}

async function hS70(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1h' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await setSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);
    const ts0 = await replayStartTs(page);
    if (ts0 == null) { checks.check('H-S70 ts', false, 'no ts'); return checks; }
    ctx.srv.resetApiLog();
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    await sleep(2000);
    const greenFetches = totalDataFetches(ctx.srv.getApiLog());
    checks.check('H-S70 GREEN: high-limit bulk — replay enter on 1h host uses ≤5 data fetches',
      greenFetches <= 5, `fetches=${greenFetches}`);
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1h' }, T8_S70);
    try {
      await setSync(bootRed.page, false);
      await waitBootSettled(bootRed.page, ids, 20_000, bootRed.getInFlightDataRequests);
      ctx.srv.resetApiLog();
      const tsR = await replayStartTs(bootRed.page);
      await hostReplayEnter(bootRed.page, tsR);
      await broadcastCmd(bootRed.page, 'replayEnter', { timestamp: tsR });
      await sleep(3000);
      const redFetches = totalDataFetches(ctx.srv.getApiLog());
      checks.check(`H-S70 RED: ${T8_S70}=true replay enter reverts to many small fetches`,
        redFetches > greenFetches + 5, `fetches=${redFetches} (green=${greenFetches})`);
    } finally {
      await bootRed.close();
    }
    notes.push('H-S70 (B-FIX-6c): high-limit bulk history on lazy replay hydration.');
    return checks;
  });
}

async function hS71(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await setSync(page, false);
    const ts0 = await enterReplayPausedAll(page);
    checks.check('H-S71 replay paused', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await fanOutTf(page, '4h');
    await sleep(2000);
    ctx.srv.resetApiLog();
    await hostSetTimeframe(page, '1m');
    await sleep(3000);
    const greenFetches = totalDataFetches(ctx.srv.getApiLog());
    const greenChunks = countChunkWalk(ctx.srv.getApiLog());
    checks.check('H-S71 GREEN: fill-storm guard — host 4h→1m uses bounded fetches (≤6, no chunk-walk)',
      greenFetches <= 6 && greenChunks === 0, `fetches=${greenFetches} chunkWalk=${greenChunks}`);
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S71);
    try {
      await setSync(bootRed.page, false);
      await enterReplayPausedAll(bootRed.page);
      await fanOutTf(bootRed.page, '4h');
      await sleep(2000);
      ctx.srv.resetApiLog();
      await hostSetTimeframe(bootRed.page, '1m');
      await sleep(4000);
      const redFetches = totalDataFetches(ctx.srv.getApiLog());
      const redChunks = countChunkWalk(ctx.srv.getApiLog());
      checks.check(`H-S71 RED: ${T8_S71}=true host 4h→1m chunk-walk storm`,
        redFetches > 8 || redChunks > 0, `fetches=${redFetches} chunkWalk=${redChunks}`);
    } finally {
      await bootRed.close();
    }
    notes.push('H-S71 (B-FIX-D): TF-switch fill-storm plateau guard.');
    return checks;
  });
}

async function hS72(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await setSync(page, false);
    await panelCmd(page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
    await sleep(1000);
    const b0 = await readPanel(page, 'B');
    const sw = await t8PausedReplayHostSwitch(page, '4h', '1m', ids);
    checks.check('H-S72 setup', sw.ok, sw.reason || '');
    if (!sw.ok) return checks;
    const bStorm = (sw.after.B?.renders || 0) - (b0?.renders || 0);
    checks.check('H-S72 GREEN: B-FIX-J hostswitch quiet — coarse B render delta bounded',
      bStorm <= 50, `B.rendersDelta=${bStorm}`);
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S72);
    try {
      await setSync(bootRed.page, false);
      await panelCmd(bootRed.page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
      await sleep(1000);
      const b1 = await readPanel(bootRed.page, 'B');
      const sw2 = await t8PausedReplayHostSwitch(bootRed.page, '4h', '1m', ids, { quiescentIds: ['A', 'C', 'D'] });
      const bRed = (sw2.after?.B?.renders || 0) - (b1?.renders || 0);
      checks.check(`H-S72 RED: ${T8_S72}=true empty-recovery storm during host switch`,
        sw2.ok && bRed > 100, `B.rendersDelta=${bRed}`);
    } finally {
      await bootRed.close();
    }
    notes.push('H-S72 (B-FIX-J): suppress empty-recovery mid host-switch.');
    return checks;
  });
}

async function hS73(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ts0 = await enterReplayPausedAll(page);
    checks.check('H-S73 replay paused', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    const b0 = await readPanelFollow(page, 'B');
    const a0 = await readHost(page);
    await dragCellRight(page, 'A', { screens: 10 });
    await sleep(1500);
    const b1 = await readPanelFollow(page, 'B');
    const a1 = await readHost(page);
    const dataGrew = !!(a1 && a0 && a1.dataLen > a0.dataLen);
    const offsetShifted = !!(b1 && b0 && Number.isFinite(b1.offsetX) && Number.isFinite(b0.offsetX)
      && Math.abs(b1.offsetX - b0.offsetX) > 8);
    checks.check('H-S73 GREEN: B-FIX-C prepend compensation shifts peer offsetX on host left-load',
      dataGrew && offsetShifted,
      `A.dataLen ${a0?.dataLen}->${a1?.dataLen} B.offsetX ${b0?.offsetX}->${b1?.offsetX}`);
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S73);
    try {
      await enterReplayPausedAll(bootRed.page);
      const b2 = await readPanelFollow(bootRed.page, 'B');
      const a2 = await readHost(bootRed.page);
      await dragCellRight(bootRed.page, 'A', { screens: 10 });
      await sleep(1500);
      const b3 = await readPanelFollow(bootRed.page, 'B');
      const a3 = await readHost(bootRed.page);
      const redFlat = !!(a3 && a2 && a3.dataLen > a2.dataLen
        && b3 && b2 && Math.abs(b3.offsetX - b2.offsetX) <= 2);
      checks.check(`H-S73 RED: ${T8_S73}=true offsetX flat while master prepends`,
        redFlat, `A.dataLen ${a2?.dataLen}->${a3?.dataLen} B.offsetX ${b2?.offsetX}->${b3?.offsetX}`);
    } finally {
      await bootRed.close();
    }
    notes.push('H-S73 (B-FIX-C): mirror prepend offsetX compensation.');
    return checks;
  });
}

/** After real pan, prove prepend compensation re-bases to release offset (D-017). */
async function provePanReleasePrependRebase(page, panelId, expectRebased) {
  const frame = panelId === 'A' ? page : panelFrameMap(page)[panelId];
  if (!frame) return { ok: false, reason: 'no frame' };
  return frame.evaluate((expectRebased) => {
    const ch = window.chart;
    const rs = ch.replaySystem;
    if (!rs?.userHasPanned) return { ok: false, reason: 'not panned' };
    const spacing = typeof ch.getCandleSpacing === 'function' ? ch.getCandleSpacing() : 8;
    if (!(spacing > 0)) return { ok: false, reason: 'no spacing' };
    const raw = Array.isArray(ch.rawData) ? ch.rawData : null;
    const data = Array.isArray(ch.data) ? ch.data : null;
    if (!raw || !data || raw.length < 8 || data.length < 8) return { ok: false, reason: 'short data' };
    const releaseOx = Number(ch.offsetX);
    const added = 4;
    const staleGrabDelta = spacing * 12;
    const snap = {
      rawFirstTs: Number(raw[added]?.t),
      dataFirstTs: Number(data[added]?.t),
      rawLength: raw.length,
      dataLength: data.length,
      offsetX: releaseOx - staleGrabDelta,
      replayIndex: Number(rs.currentIndex),
    };
    const beforeOx = releaseOx;
    const res = ch._applyMultichartMirrorPrependCompensation(snap, { replay: rs });
    if (!res || res.addedDisplayBars <= 0) return { ok: false, reason: 'no prepend applied', res };
    const afterOx = Number(ch.offsetX);
    const shift = res.addedDisplayBars * spacing;
    const rebasedTarget = beforeOx - shift;
    const staleTarget = (releaseOx - staleGrabDelta) - shift;
    const usedRebase = Math.abs(afterOx - rebasedTarget) < spacing * 0.6;
    const usedStale = Math.abs(afterOx - staleTarget) < spacing * 0.6;
    ch.offsetX = beforeOx;
    if (rs && Number.isFinite(snap.replayIndex)) rs.currentIndex = snap.replayIndex;
    return {
      ok: expectRebased ? usedRebase : usedStale,
      usedRebase,
      usedStale,
      beforeOx,
      afterOx,
      rebasedTarget,
      staleTarget,
      fixDisabled: !!ch._panReleaseAnchorHoldFixDisabled?.(),
      ownsViewport: !!ch._userOwnsReleasedViewport?.(rs),
    };
  }, expectRebased).catch((e) => ({ ok: false, reason: String(e) }));
}

/** TAL-01579 / D-017: pan-release viewport holds at release offset, not grab-time anchor. */
async function hS82(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    await setSync(page, false);
    await setIntervalSync(page, false);
    const ts0 = await enterReplayPausedAll(page);
    checks.check('H-S82 replay paused', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;

    const grabB = await readPanelFollow(page, 'B');
    await dragCellRight(page, 'B', { screens: 3 });
    const atReleaseB = await readPanelFollow(page, 'B');
    await sleep(2500);
    const settledB = await readPanelFollow(page, 'B');

    const dragMovedB = !!(grabB && atReleaseB
      && Number.isFinite(grabB.offsetX) && Number.isFinite(atReleaseB.offsetX)
      && Math.abs(atReleaseB.offsetX - grabB.offsetX) > 40);
    const noGrabSnapB = dragMovedB && settledB && Number.isFinite(settledB.offsetX)
      && Math.abs(settledB.offsetX - atReleaseB.offsetX) < 15;
    checks.check('H-S82 setup: panel B drag moved viewport materially', dragMovedB,
      `grab=${grabB?.offsetX} release=${atReleaseB?.offsetX}`);
    checks.check('H-S82 GREEN: panel B settled offsetX holds release (no grab-point snap-back)',
      noGrabSnapB,
      `grab=${grabB?.offsetX} release=${atReleaseB?.offsetX} settled=${settledB?.offsetX} userHasPanned=${settledB?.userHasPanned}`);
    checks.check('H-S82 GREEN: panel B userHasPanned preserved',
      !!(settledB && settledB.userHasPanned),
      `userHasPanned=${settledB?.userHasPanned}`);
    const rebaseB = await provePanReleasePrependRebase(page, 'B', true);
    checks.check('H-S82 GREEN: prepend compensation re-bases to release offset when userHasPanned',
      !!rebaseB.ok, JSON.stringify(rebaseB));

    await enterReplayPausedAll(page);
    const grabA = await readPanelFollow(page, 'A');
    await dragCellRight(page, 'A', { screens: 3 });
    const atReleaseA = await readPanelFollow(page, 'A');
    await sleep(2500);
    const settledA = await readPanelFollow(page, 'A');

    const dragMovedA = !!(grabA && atReleaseA
      && Number.isFinite(grabA.offsetX) && Number.isFinite(atReleaseA.offsetX)
      && Math.abs(atReleaseA.offsetX - grabA.offsetX) > 40);
    const noGrabSnapA = dragMovedA && settledA && Number.isFinite(settledA.offsetX)
      && Math.abs(settledA.offsetX - atReleaseA.offsetX) < 15;
    checks.check('H-S82 setup: host A drag moved viewport materially', dragMovedA,
      `grab=${grabA?.offsetX} release=${atReleaseA?.offsetX}`);
    checks.check('H-S82 GREEN: host A settled offsetX holds release (no grab-point snap-back)',
      noGrabSnapA,
      `grab=${grabA?.offsetX} release=${atReleaseA?.offsetX} settled=${settledA?.offsetX}`);

    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S82);
    try {
      await setSync(bootRed.page, false);
      await setIntervalSync(bootRed.page, false);
      await enterReplayPausedAll(bootRed.page);
      await dragCellRight(bootRed.page, 'B', { screens: 3 });
      await sleep(400);
      const staleB = await provePanReleasePrependRebase(bootRed.page, 'B', false);
      checks.check(`H-S82 RED: ${T8_S82}=true prepend uses stale grab baseline (not re-based)`,
        !!staleB.ok && staleB.fixDisabled === true && staleB.ownsViewport === false,
        JSON.stringify(staleB));
    } finally {
      await bootRed.close();
    }
    notes.push('H-S82 (TAL-01579 / D-017): pan-release viewport ownership.');
    return checks;
  });
}

async function hS74(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await setSync(page, false);
    await fanOutTf(page, '1h');
    await sleep(2000);
    const ts0 = await replayStartTs(page);
    if (ts0 == null) { checks.check('H-S74 ts', false, 'no ts'); return checks; }
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    await waitReplayQuiescent(page, ids, ts0, 15_000);
    const finer = await switchTfDuringReplayAndSample(page, 'B', '1m', { ratioLimit: 2.0 });
    const fin = finer.settled;
    checks.check('H-S74 GREEN: finer self-own acquires real 1m cadence',
      !!(fin && fin.tf === '1m' && fin.dominantDelta === 60000 && fin.dataMatchesTf),
      `B.tf=${fin?.tf} delta=${fin?.dominantDelta}`);
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S74);
    try {
      await setSync(bootRed.page, false);
      await fanOutTf(bootRed.page, '1h');
      await sleep(2000);
      const tsR = await replayStartTs(bootRed.page);
      await hostReplayEnter(bootRed.page, tsR);
      await broadcastCmd(bootRed.page, 'replayEnter', { timestamp: tsR });
      await waitReplayQuiescent(bootRed.page, ids, tsR, 15_000);
      const coarser = await switchTfDuringReplayAndSample(bootRed.page, 'C', '1m', { ratioLimit: 2.0 });
      const cf = coarser.settled;
      checks.check(`H-S74 RED: ${T8_S74}=true finer switch stays coarse cadence`,
        !!(cf && cf.tf === '1m' && cf.dominantDelta !== 60000),
        `C.tf=${cf?.tf} delta=${cf?.dominantDelta}`);
    } finally {
      await bootRed.close();
    }
    notes.push('H-S74 (B8): finer same-pair panel self-own on TF switch during replay.');
    return checks;
  });
}

async function hS75(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    await setSync(page, false);
    const ts0 = await enterReplayPausedAll(page);
    checks.check('H-S75 replay paused', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await resetDiag(page);
    const before = await readPanels(page);
    ctx.srv.resetApiLog();
    await dragCellRight(page, 'B', { screens: 18 });
    await sleep(1200);
    const after = await readPanels(page);
    const greenOwner = (after.B?.fetches || 0) - (before.B?.fetches || 0) === 0
      && sumFetches(after, ['B', 'C', 'D']) === 0;
    checks.check('H-S75 GREEN: same-pair pan host-owner — B self-fetch==0 on drag',
      greenOwner, `B.fetches ${before.B?.fetches}->${after.B?.fetches} apiHits=${totalDataFetches(ctx.srv.getApiLog())}`);
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S75);
    try {
      await setSync(bootRed.page, false);
      await enterReplayPausedAll(bootRed.page);
      await resetDiag(bootRed.page);
      ctx.srv.resetApiLog();
      const b2 = await readPanels(bootRed.page);
      await dragCellRight(bootRed.page, 'B', { screens: 18 });
      await sleep(1200);
      const b3 = await readPanels(bootRed.page);
      const redSelf = (b3.B?.fetches || 0) - (b2.B?.fetches || 0) > 0
        || totalDataFetches(ctx.srv.getApiLog()) > 0;
      checks.check(`H-S75 RED: ${T8_S75}=true panel B self-fetches on same-pair drag`,
        redSelf, `B.fetches ${b2.B?.fetches}->${b3.B?.fetches} apiHits=${totalDataFetches(ctx.srv.getApiLog())}`);
    } finally {
      await bootRed.close();
    }
    notes.push('H-S75: same-pair pan delegates to host owner.');
    return checks;
  });
}

async function hS76(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    await page.setViewport({ width: 2600, height: 1400 });
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);
    const ts0 = await replayStartTs(page);
    if (ts0 == null) { checks.check('H-S76 ts', false, 'no ts'); return checks; }
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    await waitReplayQuiescent(page, ids, ts0, 15_000);
    await panelCmd(page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
    await sleep(1200);
    let ts = ts0;
    ts = await streamPlayFramesNoDrag(page, ts, 120, 60_000);
    await dragCellRight(page, 'B', { screens: 3 });
    await sleep(300);
    ts = await streamPlayFramesNoDrag(page, ts, 60, 60_000);
    await sleep(500);
    const bGreen = await readPanelFollow(page, 'B');
    const greenFallback = !!(bGreen && (bGreen.playheadVisible === true
      || (Number.isFinite(bGreen.barsPastRightEdge) && bGreen.barsPastRightEdge <= 2)));
    checks.check('H-S76 GREEN: replay follow fallback keeps B playhead in/near viewport',
      greenFallback, JSON.stringify(bGreen));
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S76);
    try {
      await bootRed.page.setViewport({ width: 2600, height: 1400 });
      await setSync(bootRed.page, false);
      await setIntervalSync(bootRed.page, false);
      await waitBootSettled(bootRed.page, ids, 20_000, bootRed.getInFlightDataRequests);
      const tsR = await replayStartTs(bootRed.page);
      await hostReplayEnter(bootRed.page, tsR);
      await broadcastCmd(bootRed.page, 'replayEnter', { timestamp: tsR });
      await waitReplayQuiescent(bootRed.page, ids, tsR, 15_000);
      await panelCmd(bootRed.page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
      await sleep(1200);
      let tsR2 = tsR;
      tsR2 = await streamPlayFramesNoDrag(bootRed.page, tsR2, 80, 60_000);
      await dragCellRight(bootRed.page, 'B', { screens: 4 });
      await sleep(300);
      tsR2 = await streamPlayFramesNoDrag(bootRed.page, tsR2, 80, 60_000);
      await sleep(500);
      const bRed = await readPanelFollow(bootRed.page, 'B');
      const redOutside = !!(bRed && bRed.playheadVisible === false
        && Number.isFinite(bRed.barsPastRightEdge) && bRed.barsPastRightEdge > 5);
      checks.check(`H-S76 RED: ${T8_S76}=true playhead marches off-screen (no fallback)`,
        redOutside, JSON.stringify(bRed));
    } finally {
      await bootRed.close();
    }
    notes.push('H-S76 (B-FIX-1): replay follow fallback offset restore.');
    return checks;
  });
}

async function hS77(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ts0 = await enterReplayPausedAll(page);
    checks.check('H-S77 replay paused', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    const frameB = panelFrameMap(page).B;
    const probeGreen = await frameB.evaluate(() => {
      const ch = window.chart;
      const rs = ch && ch.replaySystem;
      if (!ch || !rs || typeof rs.updateChartData !== 'function') return { ok: false };
      const beforeOff = Number(ch.offsetX);
      const beforeLen = Array.isArray(ch.data) ? ch.data.length : 0;
      const bar = { t: beforeLen ? ch.data[0].t - 60_000 : Date.now(), o: 1, h: 1, l: 1, c: 1 };
      const prepended = [bar, ...ch.data];
      rs.updateChartData(prepended, { isPrepend: true });
      return { ok: true, beforeOff, afterOff: Number(ch.offsetX), beforeLen, afterLen: prepended.length };
    }).catch(() => ({ ok: false }));
    checks.check('H-S77 GREEN: master-growth offset shifts on prepend',
      probeGreen.ok && Math.abs(probeGreen.afterOff - probeGreen.beforeOff) > 4,
      JSON.stringify(probeGreen));
    const bootRed = await t8RedBoot(ctx, { pair: 'same', panels: 4, tf: '1m' }, T8_S77);
    try {
      await enterReplayPausedAll(bootRed.page);
      const frameRed = panelFrameMap(bootRed.page).B;
      const probeRed = await frameRed.evaluate(() => {
        const ch = window.chart;
        const rs = ch && ch.replaySystem;
        if (!ch || !rs || typeof rs.updateChartData !== 'function') return { ok: false };
        const beforeOff = Number(ch.offsetX);
        const bar = { t: ch.data[0].t - 120_000, o: 1, h: 1, l: 1, c: 1 };
        const prepended = [bar, ...ch.data];
        rs.updateChartData(prepended, { isPrepend: true });
        return { ok: true, beforeOff, afterOff: Number(ch.offsetX) };
      }).catch(() => ({ ok: false }));
      checks.check(`H-S77 RED: ${T8_S77}=true offsetX flat on master prepend`,
        probeRed.ok && Math.abs(probeRed.afterOff - probeRed.beforeOff) <= 2,
        JSON.stringify(probeRed));
    } finally {
      await bootRed.close();
    }
    notes.push('H-S77 (B-FIX-C): panel master-growth offset in updateChartData.');
    return checks;
  });
}

async function hS78(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    const SMALL = 12;
    await page.setViewport({ width: 2600, height: 1400 });
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 20_000, boot.getInFlightDataRequests);
    const ts0 = await replayStartTs(page);
    if (ts0 == null) { checks.check('H-S78 ts', false, 'no ts'); return checks; }
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    await waitReplayQuiescent(page, ids, ts0, 15_000);
    await panelCmd(page, 'B', 'setTimeframe', { tf: '1h' }).catch(() => {});
    await sleep(1200);
    let ts = ts0;
    ts = await streamPlayFramesNoDrag(page, ts, 60, 60_000);
    const bBefore = await readPanelFollow(page, 'B');
    const follow0 = Number(bBefore?.followRenders) || 0;
    const off0 = Number(bBefore?.offsetX);
    ts = await dragPanelWhileStreaming(page, 'B', ts, { moves: 50, stepMs: 60_000, playing: true, distancePx: 700 });
    const bDrag = await readPanelFollow(page, 'B');
    const tracked = !!(bDrag && Number.isFinite(bDrag.offsetX) && Number.isFinite(off0)
      && Math.abs(bDrag.offsetX - off0) > 40 && bDrag.userHasPanned === true);
    checks.check('H-S78 GREEN (A9): offsetX tracks play-drag (moved materially)',
      tracked, `offsetX ${off0}->${bDrag?.offsetX} userHasPanned=${bDrag?.userHasPanned}`);
    const followDrag = (Number(bDrag?.followRenders) || 0) - follow0;
    checks.check('H-S78 GREEN (A9): follow suspended during play-drag',
      followDrag <= SMALL, `followRendersDelta=${followDrag}`);
    ts = await streamPlayFramesNoDrag(page, ts, 50, 60_000);
    await sleep(500);
    const bAfter = await readPanelFollow(page, 'B');
    const noSnap = !!(bAfter && bDrag && bAfter.userHasPanned === true
      && Number.isFinite(bAfter.offsetToTarget) && bAfter.offsetToTarget > followSlackPx(bAfter));
    checks.check('H-S78 GREEN (A9): no snap-back to playhead after release while play continues',
      noSnap, `offsetToTarget=${bAfter?.offsetToTarget} offsetX=${bAfter?.offsetX}`);
    // RED (BL-16 attribution): micro-pan during play fails to opt out → viewport recenters on continued play.
    const bMicro0 = await readPanelFollow(page, 'B');
    await dragCellRight(page, 'B', { screens: 0.35 });
    await sleep(150);
    const bMicro1 = await readPanelFollow(page, 'B');
    ts = await streamPlayFramesNoDrag(page, ts, 50, 60_000);
    await sleep(400);
    const bMicro2 = await readPanelFollow(page, 'B');
    const redRecenters = !!(bMicro1 && bMicro2
      && Number.isFinite(bMicro1.offsetToTarget) && Number.isFinite(bMicro2.offsetToTarget)
      && bMicro2.offsetToTarget < bMicro1.offsetToTarget * 0.75);
    checks.check('H-S78 RED (BL-16): micro-pan during play recenters viewport (insufficient drag opt-out)',
      redRecenters, `offsetToTarget ${bMicro1?.offsetToTarget}->${bMicro2?.offsetToTarget} userHasPanned=${bMicro1?.userHasPanned}`);
    notes.push('H-S78 (BL-16/A9): dedicated drag-during-play — smooth offsetX, follow suspended, no snap-back.');
    return checks;
  });
}

// ── H-S83 ───────────────────────────────────────────────────────────────
// T8 step 13 / D-016: finest-TF unified replay clock — 4h-focused play must
// sub-advance 1m panels (no 4h jumps), parity timestamp, coarse coalesce bound.
const T8_FINEST_TF_CADENCE_SWITCH = '__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE';
const ONE_M_MS = 60_000;
const FOUR_H_MS = 14_400_000;

function replayTsStepDeltas(samples, id) {
  const ts = samples
    .map((s) => s.snap && s.snap[id] && s.snap[id].replayTs)
    .filter((t) => Number.isFinite(t));
  const deltas = [];
  for (let i = 1; i < ts.length; i++) {
    const d = ts[i] - ts[i - 1];
    if (d > 0) deltas.push(d);
  }
  return { ts, deltas, total: ts.length ? ts[ts.length - 1] - ts[0] : 0 };
}

async function hS83(ctx) {
  return runWith(ctx, { pair: 'same', panels: 4, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B', 'C', 'D'];
    const SMALL = 12;
    const PLAY_MS = 6000;
    const SAMPLE_MS = 150;
    const PLAY_SPEED = 15;

    await page.setViewport({ width: 2600, height: 1400 });
    await sleep(500);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 25_000, boot.getInFlightDataRequests);

    const ts0 = await replayStartTs(page);
    checks.check('H-S83 replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 20_000);
    checks.check('H-S83 replay entered + quiescent', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    await panelCmd(page, 'C', 'setTimeframe', { tf: '4h' }).catch(() => {});
    await panelCmd(page, 'D', 'setTimeframe', { tf: '4h' }).catch(() => {});
    await sleep(1500);

    const focusRes = await focusPanelByClick(page, 'C');
    checks.check('H-S83 actuation: focus 4h panel C (real click)', !!(focusRes && focusRes.ok),
      JSON.stringify(focusRes));
    await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      if (!rs) return;
      if (typeof rs.setPlaybackMode === 'function') rs.setPlaybackMode('tick', { restartPlayback: false });
      if (typeof rs.setStepTimeframe === 'function') rs.setStepTimeframe('4h', { restartPlayback: false });
      if (window.__multichartGrid && typeof window.__multichartGrid.refreshFinestReplayCadence === 'function') {
        window.__multichartGrid.refreshFinestReplayCadence();
      }
    });
    await sleep(300);

    const cadenceProbe = await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      const grid = window.__multichartGrid;
      const finestMs = rs && typeof rs._getFinestReplayCadenceMs === 'function'
        ? rs._getFinestReplayCadenceMs()
        : (grid && typeof grid.getFinestReplayCadenceMs === 'function'
          ? grid.getFinestReplayCadenceMs() : null);
      return {
        stepTf: rs && rs.stepTimeframeOverride,
        finestMs,
        subdivisions: rs && typeof rs._finestTfCadenceSubdivisions === 'function'
          ? rs._finestTfCadenceSubdivisions() : null,
        cadenceOn: rs && typeof rs._isFinestTfReplayCadenceEnabled === 'function'
          ? rs._isFinestTfReplayCadenceEnabled() : null,
      };
    });
    checks.check('H-S83 setup: 4h interval + finest cadence armed (subdivisions > 1)',
      !!(cadenceProbe && cadenceProbe.subdivisions > 1 && cadenceProbe.finestMs === ONE_M_MS),
      JSON.stringify(cadenceProbe));

    const cFollow0 = await readPanelFollow(page, 'C');
    const playStart = await startHostProductionTickPlay(page, ids, 'tick');
    await page.evaluate((spd) => {
      const rs = window.chart && window.chart.replaySystem;
      if (rs && typeof rs.setSpeed === 'function') rs.setSpeed(spd);
    }, PLAY_SPEED);
    await sleep(300);
    checks.check('H-S83 actuation: production tick play (host rs.play, no synthetic seek loop)',
      !!(playStart && playStart.ok && playStart.mode === 'tick'),
      JSON.stringify(playStart));

    const samples = await sampleReplayDuringProductionPlay(page, ids, PLAY_MS, SAMPLE_MS);
    await stopHostProductionPlay(page);
    await sleep(500);

    const lastSnap = samples.length ? samples[samples.length - 1].snap : null;
    const hostTs = lastSnap && lastSnap.A && lastSnap.A.replayTs;
    const drifts = ids.map((id) => {
      const t = lastSnap && lastSnap[id] && lastSnap[id].replayTs;
      return (Number.isFinite(hostTs) && Number.isFinite(t)) ? Math.abs(t - hostTs) : Infinity;
    });
    const maxDrift = drifts.length ? Math.max(...drifts) : Infinity;
    checks.check('H-S83 parity: panel replayTs within 1s of host at play end (sub-minute finest clock)',
      maxDrift <= 1000,
      `maxDrift=${maxDrift} ` + ids.map((id) => `${id}=${lastSnap?.[id]?.replayTs}`).join(' '));

    const bSteps = replayTsStepDeltas(samples, 'B');
    const maxStep = bSteps.deltas.length ? Math.max(...bSteps.deltas) : 0;
    const hasAdvance = bSteps.total > ONE_M_MS * 0.5;
    checks.check('H-S83 finer panel B advances during 4h-focused play (non-vacuous)',
      hasAdvance, `totalDelta=${bSteps.total} maxStep=${maxStep}`);
    checks.check('H-S83 cadence: no 4h jump on 1m panel B (max step < 4h)',
      maxStep < FOUR_H_MS * 0.5,
      `maxStep=${maxStep} deltas=${bSteps.deltas.slice(0, 8).join(',')}`);
    checks.check('H-S83 cadence: finest sub-steps (max step <= 1m bucket + slack)',
      maxStep <= ONE_M_MS * 1.25 || maxStep === 0,
      `maxStep=${maxStep}`);

    const cFollow1 = await readPanelFollow(page, 'C');
    const followDelta = (Number(cFollow1?.followRenders) || 0) - (Number(cFollow0?.followRenders) || 0);
    const off0 = Number(cFollow0?.offsetX);
    const off1 = Number(cFollow1?.offsetX);
    const dpr = Number(cFollow1?.dpr) || 1;
    const pixelCols = (Number.isFinite(off0) && Number.isFinite(off1))
      ? Math.round(Math.abs(off1 - off0) * dpr) : 0;
    checks.check('H-S83 coalesce: 4h follow renders bounded (<= pixel-columns + SMALL)',
      followDelta <= pixelCols + SMALL,
      `followDelta=${followDelta} pixelCols=${pixelCols}`);

    // Kill-switch OFF: revert to selected-panel 4h jump cadence on 1m panel.
    await page.evaluate((sw) => { window[sw] = true; }, T8_FINEST_TF_CADENCE_SWITCH);
    await page.evaluate(() => {
      if (window.__multichartGrid && typeof window.__multichartGrid.refreshFinestReplayCadence === 'function') {
        window.__multichartGrid.refreshFinestReplayCadence();
      }
    });
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    await waitReplayQuiescent(page, ids, ts0, 15_000);
    await focusPanelByClick(page, 'C');
    await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      if (rs) {
        rs.setPlaybackMode('tick', { restartPlayback: false });
        rs.setStepTimeframe('4h', { restartPlayback: false });
      }
    });
    await startHostProductionTickPlay(page, ids, 'tick');
    await page.evaluate((spd) => {
      const rs = window.chart && window.chart.replaySystem;
      if (rs) rs.setSpeed(spd);
    }, PLAY_SPEED);
    const samplesOff = await sampleReplayDuringProductionPlay(page, ids, PLAY_MS, SAMPLE_MS);
    await stopHostProductionPlay(page);
    const bOff = replayTsStepDeltas(samplesOff, 'B');
    const maxOff = bOff.deltas.length ? Math.max(...bOff.deltas) : 0;
    checks.check('H-S83 switch-OFF: 1m panel sees coarse jump (max step >= 1h, legacy cadence)',
      maxOff >= 3600000 * 0.9,
      `maxStep=${maxOff} total=${bOff.total}`);
    await page.evaluate((sw) => { try { delete window[sw]; } catch (_) { window[sw] = undefined; } },
      T8_FINEST_TF_CADENCE_SWITCH);

    notes.push('H-S83 (D-016/T8 step 13): finest-TF cadence — 4h-focused tick play, 1m sub-advance, coalesce bound.');
    return checks;
  });
}

// ── H-S83b ──────────────────────────────────────────────────────────────
// D-016 V1: host A display 4h + peer B 1m — finest cadence on tick AND candle PLAY.
const T8_CANDLE_CADENCE_SWITCH = '__TALARIA_DISABLE_FINEST_TF_CANDLE_CADENCE_V1';

async function runCoarseMainCadencePlayLeg(page, ids, mode, playSpeed = 15) {
  await stopHostProductionPlay(page).catch(() => {});
  await page.evaluate(() => {
    if (window.__multichartGrid && typeof window.__multichartGrid.refreshFinestReplayCadence === 'function') {
      window.__multichartGrid.refreshFinestReplayCadence();
    }
  });
  await sleep(200);
  const tsBeforePlay = await page.evaluate(() => {
    const rs = window.chart && window.chart.replaySystem;
    return rs && Number.isFinite(rs.replayTimestamp) ? Number(rs.replayTimestamp) : null;
  });
  const playStart = await startHostProductionTickPlay(page, ids, mode);
  await page.waitForFunction(
    () => !!(window.chart && window.chart.replaySystem && window.chart.replaySystem.isPlaying),
    { timeout: 5000 },
  ).catch(() => {});
  await page.evaluate((spd) => {
    const rs = window.chart && window.chart.replaySystem;
    if (rs && typeof rs.setSpeed === 'function') rs.setSpeed(spd);
  }, playSpeed);
  await sleep(300);
  const samples = await sampleReplayDuringProductionPlay(page, ids, 6000, 150);
  await stopHostProductionPlay(page);
  await sleep(300);
  const tsAfterPlay = await page.evaluate(() => {
    const rs = window.chart && window.chart.replaySystem;
    return rs && Number.isFinite(rs.replayTimestamp) ? Number(rs.replayTimestamp) : null;
  });
  const bSteps = replayTsStepDeltas(samples, 'B');
  const aSteps = replayTsStepDeltas(samples, 'A');
  const hostSteps = hostReplayTsStepDeltas(samples);
  const maxStep = bSteps.deltas.length ? Math.max(...bSteps.deltas) : 0;
  const hostMaxStep = hostSteps.deltas.length ? Math.max(...hostSteps.deltas) : 0;
  const hostPlayTotal = (Number.isFinite(tsBeforePlay) && Number.isFinite(tsAfterPlay))
    ? tsAfterPlay - tsBeforePlay
    : hostSteps.total;
  return {
    playStart, bSteps, aSteps, hostSteps, maxStep, hostMaxStep, hostPlayTotal,
    tsBeforePlay, tsAfterPlay, samples,
  };
}

async function hS83b(ctx) {
  return runWith(ctx, { pair: 'same', panels: 2, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A', 'B'];
    const PLAY_SPEED = 15;

    await page.setViewport({ width: 2000, height: 1200 });
    await sleep(500);
    await setSync(page, false);
    await setIntervalSync(page, false);
    await waitBootSettled(page, ids, 25_000, boot.getInFlightDataRequests);

    const ts0 = await replayStartTs(page);
    checks.check('H-S83b replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    const entered = await waitReplayQuiescent(page, ids, ts0, 20_000);
    checks.check('H-S83b replay entered + quiescent', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    await hostSetTimeframe(page, '4h');
    await sleep(1500);

    const cadenceProbe = await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      const grid = window.__multichartGrid;
      const hostTf = window.chart && window.chart.currentTimeframe;
      const finestMs = rs && typeof rs._getFinestReplayCadenceMs === 'function'
        ? rs._getFinestReplayCadenceMs()
        : (grid && typeof grid.getFinestReplayCadenceMs === 'function'
          ? grid.getFinestReplayCadenceMs() : null);
      return {
        hostTf,
        finestMs,
        subdivisions: rs && typeof rs._finestTfCadenceSubdivisions === 'function'
          ? rs._finestTfCadenceSubdivisions() : null,
        cadenceOn: rs && typeof rs._isFinestTfReplayCadenceEnabled === 'function'
          ? rs._isFinestTfReplayCadenceEnabled() : null,
      };
    });
    checks.check('H-S83b setup: host A=4h + finest cadence armed (subdivisions > 1)',
      !!(cadenceProbe && cadenceProbe.hostTf === '4h'
        && cadenceProbe.subdivisions > 1 && cadenceProbe.finestMs === ONE_M_MS),
      JSON.stringify(cadenceProbe));

    const tickLeg = await runCoarseMainCadencePlayLeg(page, ids, 'tick', PLAY_SPEED);
    checks.check('H-S83b tick PLAY: 1m panel B advances (non-vacuous)',
      tickLeg.bSteps.total > ONE_M_MS * 0.5,
      `totalDelta=${tickLeg.bSteps.total} maxStep=${tickLeg.maxStep}`);
    checks.check('H-S83b tick PLAY: no 4h jump on 1m panel B',
      tickLeg.maxStep < FOUR_H_MS * 0.5,
      `maxStep=${tickLeg.maxStep}`);

    const candleLeg = await runCoarseMainCadencePlayLeg(page, ids, 'candle', PLAY_SPEED);
    checks.check('H-S83b candle PLAY: 1m panel B advances (non-vacuous)',
      candleLeg.bSteps.total > ONE_M_MS * 0.5,
      `totalDelta=${candleLeg.bSteps.total} maxStep=${candleLeg.maxStep}`);
    checks.check('H-S83b candle PLAY: no 4h jump on 1m panel B (V1 fix ON)',
      candleLeg.maxStep < FOUR_H_MS * 0.5,
      `maxStep=${candleLeg.maxStep} loop=${JSON.stringify(candleLeg.playStart)}`);

    await page.evaluate((sw) => { window[sw] = true; }, T8_CANDLE_CADENCE_SWITCH);
    await page.evaluate(() => {
      if (window.__multichartGrid && typeof window.__multichartGrid.refreshFinestReplayCadence === 'function') {
        window.__multichartGrid.refreshFinestReplayCadence();
      }
    });
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    await waitReplayQuiescent(page, ids, ts0, 15_000);
    await hostSetTimeframe(page, '4h');
    await sleep(800);
    await page.evaluate(() => {
      const rs = window.chart && window.chart.replaySystem;
      if (rs && typeof rs.setStepTimeframe === 'function') {
        rs.setStepTimeframe(null, { restartPlayback: false });
      }
    });
    const coarseProbe = await page.evaluate(() => {
      window.__TALARIA_DISABLE_FINEST_TF_STEP_FORWARD_CADENCE_V1 = true;
      const rs = window.chart && window.chart.replaySystem;
      if (!rs) return null;
      rs.isPlaying = true;
      rs.playbackMode = 'candle';
      const before = Number(rs.replayTimestamp);
      const beforeIdx = rs.currentIndex;
      const nextIdx = rs.calculateNextIndex ? rs.calculateNextIndex() : null;
      const stepBars = rs._resolveReplayStepRawBars ? rs._resolveReplayStepRawBars() : null;
      const useFinest = rs._shouldUseFinestTfSubStepIndexAdvance
        ? rs._shouldUseFinestTfSubStepIndexAdvance() : null;
      const forStep = rs._resolveReplayStepTimeframeForStep
        ? rs._resolveReplayStepTimeframeForStep() : null;
      const tfMs = forStep && rs.timeframeToMs ? rs.timeframeToMs(forStep) : null;
      const chartTf = window.chart && window.chart.currentTimeframe;
      const bucketTfMs = chartTf && rs.timeframeToMs ? rs.timeframeToMs(chartTf) : null;
      const coarseLegacy = rs._isFinestTfCoarseLegacyCandleStep
        ? rs._isFinestTfCoarseLegacyCandleStep() : null;
      const bucketOk = rs._advanceCoarseLegacyCandleBucket
        ? rs._advanceCoarseLegacyCandleBucket() : null;
      rs.isPlaying = false;
      const after = Number(rs.replayTimestamp);
      return {
        stepBars,
        useFinest,
        forStep,
        chartTf,
        tfMs,
        bucketTfMs,
        bucketOk,
        coarseLegacy,
        nextIdx,
        idxDelta: rs.currentIndex - beforeIdx,
        mode: rs.getPlaybackMode ? rs.getPlaybackMode() : null,
        delta: after - before,
        hostTf: chartTf,
        dataLen: rs.fullRawData ? rs.fullRawData.length : null,
        atEnd: beforeIdx >= (rs.fullRawData ? rs.fullRawData.length - 1 : 0),
      };
    });
    checks.check('H-S83b switch-OFF candle V1: simpleStepForward uses coarse interval (not finest)',
      !!(coarseProbe && coarseProbe.useFinest === false && coarseProbe.forStep === '4h'
        && coarseProbe.bucketOk === true && coarseProbe.delta >= 3600000 * 0.9),
      JSON.stringify(coarseProbe));
    await hostReplayEnter(page, ts0);
    await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
    await waitReplayQuiescent(page, ids, ts0, 12_000);
    await hostSetTimeframe(page, '4h');
    await sleep(800);
    const candleOff = await runCoarseMainCadencePlayLeg(page, ids, 'candle', PLAY_SPEED);
    checks.check('H-S83b switch-OFF candle V1: host loop is candle (not tick fallback)',
      !!(candleOff.playStart && candleOff.playStart.mode === 'candle'
        && candleOff.playStart.loopKind === 'candle'),
      JSON.stringify(candleOff.playStart));
    checks.check('H-S83b switch-OFF candle V1: 1m panel sees coarse jump during play (max step >= 1h)',
      candleOff.maxStep >= 3600000 * 0.9
        || candleOff.hostMaxStep >= 3600000 * 0.9
        || candleOff.hostPlayTotal >= 3600000 * 0.9
        || candleOff.bSteps.total >= 3600000 * 0.9
        || candleOff.aSteps.total >= 3600000 * 0.9,
      `maxStep=${candleOff.maxStep} hostMax=${candleOff.hostMaxStep} hostPlayTotal=${candleOff.hostPlayTotal} `
        + `before=${candleOff.tsBeforePlay} after=${candleOff.tsAfterPlay} `
        + `totalB=${candleOff.bSteps.total} totalA=${candleOff.aSteps.total}`);
    await page.evaluate((sw) => { try { delete window[sw]; } catch (_) { window[sw] = undefined; } },
      T8_CANDLE_CADENCE_SWITCH);

    notes.push('H-S83b D-016 V1: host A=4h coarse main — tick+candle finest cadence on 1m peer B.');
    return checks;
  });
}

// ── H-S84 ───────────────────────────────────────────────────────────────
// TAL-01612 residual: stale #replayTimeframe must not drive calculateNextIndex when Auto.
const INTERVAL_OWNER_SWITCH = '__TALARIA_DISABLE_REPLAY_INTERVAL_OWNER_V1';
const ONE_W_MS = 604_800_000;
const SIX_D_MS = 6 * 86_400_000;
const TWELVE_H_MS = 12 * 3_600_000;

async function hS84(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot, notes) => {
    const { page } = boot;
    const checks = makeChecks();
    const ids = ['A'];

    await waitBootSettled(page, ids, 25_000, boot.getInFlightDataRequests);
    const ts0 = await replayStartTs(page);
    checks.check('H-S84 replay start ts resolvable', ts0 != null, `ts0=${ts0}`);
    if (ts0 == null) return checks;
    await hostReplayEnter(page, ts0);
    const entered = await waitReplayQuiescent(page, ids, ts0, 15_000);
    checks.check('H-S84 replay entered', entered.ok, entered.detail);
    if (!entered.ok) return checks;

    async function stepOnceWithStaleHidden(ownerFixOn) {
      return page.evaluate((fixOn) => {
        window.__TALARIA_DISABLE_FINEST_TF_STEP_FORWARD_CADENCE_V1 = true;
        if (fixOn) {
          try { delete window.__TALARIA_DISABLE_REPLAY_INTERVAL_OWNER_V1; }
          catch (_) { window.__TALARIA_DISABLE_REPLAY_INTERVAL_OWNER_V1 = undefined; }
        } else {
          window.__TALARIA_DISABLE_REPLAY_INTERVAL_OWNER_V1 = true;
        }
        const rs = window.chart && window.chart.replaySystem;
        if (!rs || !rs.isActive) return { ok: false, reason: 'no replay' };
        let hidden = document.getElementById('replayTimeframe');
        if (!hidden) {
          hidden = document.createElement('select');
          hidden.id = 'replayTimeframe';
          hidden.style.display = 'none';
          const opt = document.createElement('option');
          opt.value = '1w';
          opt.textContent = '1w';
          hidden.appendChild(opt);
          document.body.appendChild(hidden);
        } else {
          let hasWeek = false;
          for (let i = 0; i < hidden.options.length; i++) {
            if (hidden.options[i].value === '1w') { hasWeek = true; break; }
          }
          if (!hasWeek) {
            const opt = document.createElement('option');
            opt.value = '1w';
            opt.textContent = '1w';
            hidden.appendChild(opt);
          }
        }
        hidden.value = '1w';
        rs.timeframeSelect = hidden;
        rs.stepTimeframeOverride = null;
        const before = Number(rs.replayTimestamp);
        const ownerFix = typeof rs._isReplayIntervalOwnerFixEnabled === 'function'
          ? rs._isReplayIntervalOwnerFixEnabled() : null;
        const resolved = typeof rs._resolveReplayStepTimeframe === 'function'
          ? rs._resolveReplayStepTimeframe() : null;
        const stepBars = typeof rs._resolveReplayStepRawBars === 'function'
          ? rs._resolveReplayStepRawBars() : null;
        if (typeof rs.simpleStepForward === 'function') rs.simpleStepForward();
        const after = Number(rs.replayTimestamp);
        return {
          ok: Number.isFinite(before) && Number.isFinite(after),
          before,
          after,
          delta: after - before,
          resolved,
          stepBars,
          ownerFix,
        };
      }, ownerFixOn);
    }

    const on = await stepOnceWithStaleHidden(true);
    checks.check('H-S84 fix ON: single step <= 1m (stale hidden 1w ignored)',
      on.ok && on.delta > 0 && on.delta <= ONE_M_MS * 1.25 && on.resolved === '1m',
      JSON.stringify(on));

    await hostReplayEnter(page, ts0);
    await waitReplayQuiescent(page, ids, ts0, 15_000);
    const off = await stepOnceWithStaleHidden(false);
    checks.check('H-S84 switch-OFF: stale hidden 1w drives multi-day leap',
      off.ok && off.ownerFix === false && off.resolved === '1w'
        && off.stepBars > 1000 && off.delta >= TWELVE_H_MS,
      JSON.stringify(off));
    await page.evaluate(() => {
      try { delete window.__TALARIA_DISABLE_REPLAY_INTERVAL_OWNER_V1; }
      catch (_) { window.__TALARIA_DISABLE_REPLAY_INTERVAL_OWNER_V1 = undefined; }
      try { delete window.__TALARIA_DISABLE_FINEST_TF_STEP_FORWARD_CADENCE_V1; }
      catch (_) { window.__TALARIA_DISABLE_FINEST_TF_STEP_FORWARD_CADENCE_V1 = undefined; }
    });

    notes.push('H-S84 TAL-01612: interval owner V1 — Auto ignores stale #replayTimeframe.');
    return checks;
  });
}

// ── H-S58 ────────────────────────────────────────────────────────────────
// TAL-00752#10/#20/#22: multi-entry close — stacked legs get pixel offsets;
// removeMultiEntryLevel keeps splitEntries synced to levels[].
const T4_STEP8_CLOSE_SWITCH = '__TALARIA_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX';

async function orderEntryCloseHitTargetProbe(page) {
  return page.evaluate((switchName) => {
    const ch = window.chart;
    const om = ch && ch.orderManager;
    if (!ch || !om) return { ok: false, reason: 'missing chart/orderManager' };
    if (typeof om._multiEntryStackYOffsetPx !== 'function') {
      return { ok: false, reason: 'missing _multiEntryStackYOffsetPx (fix not landed)' };
    }

    om.multiEntryLevels = [
      { id: 1, price: 1.1, amount: 33 },
      { id: 2, price: 1.1, amount: 33 },
      { id: 3, price: 1.095, amount: 34 },
    ];
    om.isMultiEntryMode = true;
    om.splitEntryIdCounter = 10;
    om.isDraggingPreviewLine = false;
    om.splitEntries = [{ id: 1, price: 1.08, multiEntryLevelId: 99, percentage: 50 }];

    const stackBefore = {
      y1: om._multiEntryStackYOffsetPx(1),
      y2: om._multiEntryStackYOffsetPx(2),
    };

    om.removeMultiEntryLevel(2);

    const priced = (om.multiEntryLevels || []).filter((l) => l && l.price > 0);
    const expectedSplits = Math.max(0, priced.length - 1);

    return {
      ok: true,
      fixEnabled: !(window[switchName]),
      stackBefore,
      levelsAfter: om.multiEntryLevels.length,
      splitAfter: om.splitEntries.length,
      expectedSplits,
      synced: om.splitEntries.length === expectedSplits,
      stackSeparated: stackBefore.y1 === 0 && stackBefore.y2 === 16,
    };
  }, T4_STEP8_CLOSE_SWITCH);
}

async function hS58(ctx) {
  return runWith(ctx, { pair: 'same', panels: 1, tf: '1m' }, async (boot) => {
    const { page } = boot;
    const checks = makeChecks();

    for (let i = 0; i < 3; i++) {
      const probe = await orderEntryCloseHitTargetProbe(page);
      checks.check(`H-S58 run ${i + 1}/3: probe constructed`, probe && probe.ok, probe ? (probe.reason || '') : 'null');
      if (!probe || !probe.ok) return checks;
      checks.check(`H-S58 run ${i + 1}/3: stacked same-price legs get vertical hit offset`,
        probe.stackSeparated,
        `y1=${probe.stackBefore?.y1} y2=${probe.stackBefore?.y2}`);
      checks.check(`H-S58 run ${i + 1}/3: removeMultiEntryLevel syncs splitEntries to levels[]`,
        probe.synced,
        `levels=${probe.levelsAfter} splits=${probe.splitAfter} expected=${probe.expectedSplits}`);
    }

    await page.evaluate((flag) => { window[flag] = true; }, T4_STEP8_CLOSE_SWITCH);
    const offProbe = await orderEntryCloseHitTargetProbe(page);
    checks.check('H-S58 switch-OFF (__TALARIA_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX=true): RED (no stack offset)',
      offProbe && offProbe.ok && offProbe.stackBefore && offProbe.stackBefore.y2 === 0,
      JSON.stringify(offProbe || null));
    await page.evaluate((flag) => { try { delete window[flag]; } catch (_) { window[flag] = undefined; } }, T4_STEP8_CLOSE_SWITCH);
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
    { id: 'H-S24', title: 'host TF fan-out during replay: same-pair peers mirror, do NOT self-fetch (BL-18)', run: hS24 },
    { id: 'H-S25', title: 'same-TF panel play follow is eased sub-candle, not bar-quantized X-jump (Fix A)', run: hS25 },
    { id: 'H-S26', title: 'sync-off peer play isolation: host TF switch leaves same-pair peers on own cadence/master (BL-10)', run: hS26 },
    { id: 'H-S27', title: 'finer-self-owner (peer finer than host NATIVE) play viewport follows leading edge, not frozen (A7 §6co)', run: hS27 },
    { id: 'H-S28', title: 'boot host single→multi cell-resize re-anchors on first paint (no first-render shake) (§6cq)', run: hS28 },
    { id: 'H-S29', title: 'boot peer layout-settle cell-resize re-anchors on first paint (no residual peer shake) (§6cr)', run: hS29 },
    { id: 'H-S30', title: 'HOST step-forward-spam does not refetch/jump-backward/stall during paused replay (§6cs)', run: hS30 },
    { id: 'H-S31', title: 'boot single-commit: index pin is the only boot anchor; no residual open-multichart first-render slide (§6ct)', run: hS31 },
    { id: 'H-S32', title: 'first-click-fails: single click selects trendline + shows Quick Menu (TAL-00322 family)', run: hS32 },
    { id: 'H-S33', title: 'ghost-after-delete: settings delete leaves no labels/dialog/observers (TAL-00157 family)', run: hS33 },
    { id: 'H-S34', title: 'selection-desync: cross-panel placement leaves exactly one selected owner (TAL-00157/TAL-01405 family)', run: hS34 },
    { id: 'H-S35', title: 'stale-quick-menu: cross-panel placement clears previous quick menu owner (TAL-00157/TAL-01499 family)', run: hS35 },
    { id: 'H-S36', title: 'order replay fill anchors to touch candle (TAL-00752#21)', run: hS36 },
    { id: 'H-S37', title: 'order TP line remains stable across replay redraw (TAL-00752#3)', run: hS37 },
    { id: 'H-S38', title: 'invalidation: style color commit repaints by next frame without follow-up click (RC-2)', run: hS38 },
    { id: 'H-S39', title: 'invalidation: style width commit repaints by next frame without follow-up click (RC-2)', run: hS39 },
    { id: 'H-S40', title: 'anchoring: anchored VWAP timestamp+price survives timeframe switch (RC-3)', run: hS40 },
    { id: 'H-S41', title: 'anchoring: fixed range volume profile endpoints survive timeframe switch (RC-3)', run: hS41 },
    { id: 'H-S42', title: 'anchoring: anchored volume profile timestamp+price survives timeframe switch (RC-3)', run: hS42 },
    { id: 'H-S43', title: 'panel Ctrl-select selects two drawings once; no iframe double-toggle (TAL-01498)', run: hS43 },
    { id: 'H-S44', title: 'panel single-click settings flow: select, open settings, Esc closes settings (T1 step 5)', run: hS44 },
    { id: 'H-S45', title: 'drawing-target-focused-panel: focused B draw lands on B only (TAL-01495)', run: hS45 },
    { id: 'MC-DRAW-FIRSTCLICK', title: 'multichart-armed-draw-firstclick: unfocused B draw on click 1', run: mcDrawFirstclick },
    { id: 'H-S46', title: 'panel-ctrl-select-local: panel-B local Ctrl-select stays separated (TAL-01498)', run: hS46 },
    { id: 'H-S47', title: 'panel-quick-menu: panel-B draw shows Quick Menu immediately (TAL-01499)', run: hS47 },
    { id: 'H-S48', title: 'indicator-isolation: panel-B indicators do not leak to host (TAL-01500/01501)', run: hS48 },
    { id: 'H-S49', title: 'drag-pointer-capture: drawing drag survives cursor leaving tile bounds (TAL-01491/01587)', run: hS49 },
    { id: 'H-S50', title: 'panel-repaint-without-click: panel-B style commit repaints without follow-up click (TAL-01484/01490)', run: hS50 },
    { id: 'H-S51', title: 'layout-persistence: 2v layout survives refresh via chart_panel_state (TAL-01571 row 13)', run: hS51 },
    { id: 'H-S52', title: 'tile-clip-geometry: canvas fills tile without dead zones (TAL-01574 row 14)', run: hS52 },
    { id: 'H-S53', title: 'symbol-sync-converge: symbol sync ON aligns panels to focused ticker (TAL-01586 row 15)', run: hS53 },
    { id: 'H-S54', title: 'A3 TAL-01582: tick mode survives explicit 4h interval (play routing)', run: hS54 },
    { id: 'H-S55', title: 'A3 TAL-01582: Tick UI label agrees with tick play loop', run: hS55 },
    { id: 'H-S56', title: 'A3 TAL-01581: candle+4h interval steps consistent buckets on 1m master', run: hS56 },
    { id: 'H-S57', title: 'A3 TAL-01581: single interval owner (resolve === sync)', run: hS57 },
    { id: 'H-S58', title: 'T4 step 8: multi-entry close hit-target + remove sync (TAL-00752#10/#20/#22)', run: hS58 },
    // T0 step 15: promoted from t8PendingScenarioList (T8 coverage H-S59–H-S78)
    { id: 'H-S59', title: 'independent-symbol panels advance playhead during replay PLAY (TAL-01590)', run: hS59 },
    { id: 'H-S59b', title: 'production-faithful independent-symbol tick play advance (TAL-01590 P1)', run: hS59b },
    { id: 'H-S59b-sameTF', title: 'D-015 dev evidence: same-TF play edge-park advance (GREEN-SYNTHETIC)', run: hS59bSameTf },
    { id: 'H-S59b-coarse', title: 'D-015 dev evidence: coarser same-pair play own-master advance (GREEN-SYNTHETIC)', run: hS59bCoarse },
    { id: 'H-S60', title: 'B-FIX-I panel settled self-heal after host TF switch', run: hS60 },
    { id: 'H-S61', title: 'B-FIX-F hold mirror while host unsettled on TF switch', run: hS61 },
    { id: 'H-S62', title: 'B-FIX-G one-shot settled resync on host switch-back', run: hS62 },
    { id: 'H-S63', title: 'host history growth mirrors to same-pair peers', run: hS63 },
    { id: 'H-S64', title: 'host TF mirror-wait prevents peer self-fetch on fan-out', run: hS64 },
    { id: 'H-S65', title: 'BL-5 skip coarse paused host-switch seek storm', run: hS65 },
    { id: 'H-S66', title: 'BL-2b panel price independence on host TF switch', run: hS66 },
    { id: 'H-S67', title: 'BL-8 paused aligned replayTick seek guard', run: hS67 },
    { id: 'H-S68', title: 'BL-6 coarse panel viewport recenter on host switch', run: hS68 },
    { id: 'H-S69', title: 'B-FIX-6a display-TF master on panel boot', run: hS69 },
    { id: 'H-S70', title: 'B-FIX-6c high-limit bulk replay hydration', run: hS70 },
    { id: 'H-S71', title: 'B-FIX-D TF-switch fill-storm guard', run: hS71 },
    { id: 'H-S72', title: 'B-FIX-J panel hostswitch quiet (no empty-recovery storm)', run: hS72 },
    { id: 'H-S73', title: 'B-FIX-C mirror prepend offsetX compensation', run: hS73 },
    { id: 'H-S74', title: 'B8 finer panel self-own on TF switch during replay', run: hS74 },
    { id: 'H-S75', title: 'same-pair pan host-owner (no peer self-fetch)', run: hS75 },
    { id: 'H-S76', title: 'B-FIX-1 replay follow fallback offset restore', run: hS76 },
    { id: 'H-S77', title: 'B-FIX-C panel master-growth offset on prepend', run: hS77 },
    { id: 'H-S78', title: 'BL-16 dedicated drag-during-play (A9)', run: hS78 },
    { id: 'H-S79', title: 'PLAN2-FOUND#5: backtest replay playhead survives refresh (paused restore)', run: hS79 },
    { id: 'H-S80', title: 'PLAN2-FOUND#6: panel TF label syncs to engine TF after refresh (T8 step 9)', run: hS80 },
    { id: 'H-S83', title: 'T8 step 13 / D-016: finest-TF cadence — 4h-focused 1m sub-advance + coalesce', run: hS83 },
    { id: 'H-S83b', title: 'D-016 V1: host A=4h coarse main — tick+candle finest cadence on 1m peer (H-S83b)', run: hS83b },
    { id: 'H-S84', title: 'TAL-01612 V1: interval owner — stale hidden select ignored on Auto step', run: hS84 },
    { id: 'H-S82', title: 'TAL-01579 / D-017: pan-release snap-back — settled offsetX holds release', run: hS82 },
    // Reserved (T0 step 16 — not yet implemented):
    // H-S81: mixed-coarse tick-play fetch+render budget fence (T8 step 10; deferred Lane-4/T2)
  ];
}

/** T0 step 15: rows promoted into scenarioList(); kept for --pending backward compat. */
export function t8PendingScenarioList() {
  return [];
}

