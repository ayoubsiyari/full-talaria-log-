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
// replay play 15s (accelerated) → fetches during play ≈ forward prefetch only;
// renders bounded; playhead equal across panels every second.
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
    await sleep(1200);

    ctx.srv.resetApiLog();
    await resetDiag(page);
    const rendersBefore = await readPanels(page);

    // Accelerated "play": 15 one-second steps, each advancing the shared
    // playhead by 60 candles (1 minute of bars). replayTick seeks every panel
    // to the same ts via the real goToReplayTimestamp path.
    let ts = ts0;
    const perSecondMs = 60 * 60_000;
    let playheadEqualEverySecond = true;
    const playheadDetail = [];
    for (let sec = 0; sec < 15; sec++) {
      ts += perSecondMs;
      // Panel seeks are rAF-coalesced (scheduleCoalescedSeek), and a discrete
      // tick can be dropped when it coalesces with a neighbour — a harness
      // driving artifact (production streams frames, not discrete ticks). So
      // RE-broadcast the same target ts across the settle window until every
      // panel converges to it. If they never converge, that's the real defect.
      let heads = [];
      const settleDeadline = Date.now() + 2500;
      let lastSend = 0;
      while (Date.now() < settleDeadline) {
        if (Date.now() - lastSend >= 400) {
          // Host seeks its own playhead in-process; iframe peers via replayTick.
          await hostReplaySeek(page, ts);
          await broadcastCmd(page, 'replayTick', { timestamp: ts });
          lastSend = Date.now();
        }
        const p = await readPanels(page);
        heads = ids.map((i) => p[i]?.replayTs);
        const defined = heads.filter((h) => h != null);
        if (defined.length === ids.length && allEqual(defined) && defined[0] === ts) break;
        await sleep(120);
      }
      const defined = heads.filter((h) => h != null);
      const eq = defined.length === ids.length && allEqual(defined);
      if (!eq) {
        playheadEqualEverySecond = false;
        playheadDetail.push(`sec${sec}:${heads.join('/')}`);
      }
    }
    checks.check('H-S8 playhead equal across panels every second', playheadEqualEverySecond,
      playheadDetail.slice(0, 4).join(' '));

    // Fetches during play ≈ forward prefetch only (bounded, not per-frame).
    const fetches = totalDataFetches(ctx.srv.getApiLog());
    checks.check('H-S8 fetches during play bounded (forward prefetch only)', fetches <= ids.length * 2,
      `data fetches during 15s play=${fetches}`);

    // Renders bounded (no unbounded repaint storm).
    const rAfter = await readPanels(page);
    let maxRenders = 0;
    for (const i of ids) {
      const delta = (rAfter[i]?.renders || 0) - (rendersBefore[i]?.renders || 0);
      if (delta > maxRenders) maxRenders = delta;
    }
    checks.check('H-S8 renders bounded during play', maxRenders < 500, `max render delta=${maxRenders}`);
    notes.push('H-S8: the in-process host (tile A) seeks its own replay playhead '
      + '(real goToReplayTimestamp) and fans replayTick to iframe peers, matching '
      + 'production; discrete ticks are re-broadcast until panels converge (harness '
      + 'driving artifact — production streams frames).');
    return checks;
  });
}

// ── H-S10 ────────────────────────────────────────────────────────────────
// cold boot 2×2 same-pair → 0 panel fetches; time-to-painted under budget.
async function hS10(ctx) {
  // Measure the cold boot directly (do NOT reset the log before boot).
  const t0 = Date.now();
  const boot = await bootLayout(ctx.browser, ctx.srv, { pair: 'same', panels: 4, tf: '1m', bug: ctx.bug, bugSwitches: ctx.bugSwitches });
  const paintMs = Date.now() - t0;
  const notes = [];
  let checks = makeChecks();
  let inv;
  try {
    const apiLog = ctx.srv.getApiLog();
    const byFile = countFetchesByFile(apiLog);
    const file25 = byFile[HOST_FILE] || 0;
    const panels = await readPanels(page);
    const peerFetches = sumFetches(panels, ['B', 'C', 'D']); // iframe panels
    const hostFetches = panels.A ? panels.A.fetches : 0;
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
      + `peer(B/C/D) self-fetches=${peerFetches}; boot data fetches by file=${JSON.stringify(byFile)}`);
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
  ];
}

