/**
 * run.mjs — Phase-4 harness runner.
 *
 * ── BOOT PATH (Task 4.2 fidelity fix — now mirrors PRODUCTION topology) ──
 * The host page (serve.mjs /harness/host.html) reproduces the real
 * MultichartGrid topology instead of the earlier "all four tiles are iframes"
 * skeleton:
 *
 *   • Tile A is the PARENT page's REAL in-process `window.chart` — the exact
 *     engine (chart.js + modules) booted in this top window, NOT an iframe.
 *     The MultichartManager registers it via `addHostChart` and the sync-bridge
 *     (`MultichartBridge.installBridge`) is installed on it, exactly as
 *     MultichartGrid.jsx wires the host (ensureHostBridge + addHostChart +
 *     setSyncModeGate).
 *   • Tiles B/C/D are `chart-embed.html` IFRAMES added via `mgr.addChart`.
 *     chart-embed.html loads the same REAL engine + bridges with no React —
 *     the lightest faithful boot of the exact code under test.
 *
 * Because tile A is a live host owner, the host→panel mirror/clone path
 * (embed-bridge `_multichartMirrorViewportFromHost`) and the host-replay /
 * host-TF fan-out paths are LIVE: same-pair panels mirror the host in-memory
 * (no self /bars fetch) and the host is the single owner that fetches. The
 * previous topology left those paths inert, so H-S2/S3/S6/S10 failed for a
 * HARNESS reason; with this fix they are re-triaged against the real engine.
 * The host lives in the top window and is read/driven via main-frame
 * `page.evaluate` (see harness-lib readHost / hostReplayEnter / fanOutTf);
 * only B/C/D are discoverable as iframe Frames.
 *
 * ── Task 4.2 ──
 * Runs the scenario assertions in scenarios.mjs (H-S2/S3/S5/S6/S7/S8/S10/S11 +
 * H-INV after each). Gestures use REAL puppeteer mouse events; assertions
 * probe fetch counts (serve.mjs per-hit log), first/last bar equality, seam
 * counters, playhead equality, and offset-delta-at-release. Assertions encode
 * the INTENDED contract and are never weakened to force green — a failure that
 * reflects real engine behavior is a harness-CAUGHT defect.
 *
 * CLI flags (all optional):
 *   --runs=N        run the full suite N times (flake check). Default 1.
 *   --only=A,B      run only these scenario ids (comma-separated).
 *   --bug           enable the deliberate-bug kill-switch
 *                   (__TALARIA_DISABLE_SHARED_BAR_STORE) in every document,
 *                   re-enabling the per-panel fetch path. Proves the harness
 *                   catches the ownership bug class (H-S2/H-S3 flip to FAIL).
 *   --headful       run a visible browser (debugging).
 *
 * Per-test machine-readable line:  RESULT <id> PASS | FAIL
 * In multi-run mode the final classification is:
 *   PASS            (PASS in every run)
 *   FAIL-REAL-BUG   (FAIL in every run — stable, real defect)
 *   FAIL-FLAKE      (verdict differs across runs — a flake, itself a bug)
 */

import { startServer } from './serve.mjs';
import { launchBrowser } from './harness-lib.mjs';
import { scenarioList, t8PendingScenarioList } from './scenarios.mjs';

function parseArgs(argv) {
  const args = { runs: 1, only: null, bug: false, headful: false, bugSwitches: null, pending: false, orderMcStateConvergeOff: false, armedDrawFocusForwardOff: false, peerDeselectOff: false };
  for (const a of argv.slice(2)) {
    if (a === '--bug') args.bug = true;
    else if (a === '--headful') args.headful = true;
    else if (a === '--pending') args.pending = true;
    else if (a === '--order-mc-state-converge-off') args.orderMcStateConvergeOff = true;
    else if (a === '--multichart-armed-draw-focus-forward-off') args.armedDrawFocusForwardOff = true;
    else if (a === '--peer-deselect-off') args.peerDeselectOff = true;
    else if (a === '--a8-box-shift-off') { args.bug = true; args.bugSwitches = ['__TALARIA_DISABLE_A8_BOX_SHIFT_SQUARE_PIXEL_FIX']; }
    else if (a === '--a8-stale-transform-off') { args.bug = true; args.bugSwitches = ['__TALARIA_DISABLE_A8_SHIFT_DRAG_STALE_TRANSFORM_FIX']; }
    else if (a === '--a8-live-sync-off') { args.bug = true; args.bugSwitches = ['__TALARIA_DISABLE_A8_SHIFT_LIVE_CROSSPANEL_SYNC_FIX']; }
    else if (a === '--a8-locked-pan-off') { args.bug = true; args.bugSwitches = ['__TALARIA_DISABLE_A8_LOCKED_DRAWING_PAN_PASSTHROUGH_FIX']; }
    else if (a.startsWith('--runs=')) args.runs = Math.max(1, parseInt(a.slice(7), 10) || 1);
    else if (a.startsWith('--only=')) args.only = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--bugswitch=')) {
      args.bug = true;
      args.bugSwitches = a.slice(12).split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return args;
}

function verdictOf(result) {
  const checkFails = result.checks.failures();
  const invFails = result.inv.failures();
  return {
    pass: checkFails.length === 0 && invFails.length === 0,
    checkFails,
    invFails,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const srv = await startServer(0);
  console.log(`[run] stub server: ${srv.url}`);
  console.log(`[run] mode: runs=${args.runs} bug=${args.bug} pending=${args.pending} orderMcStateConvergeOff=${args.orderMcStateConvergeOff} armedDrawFocusForwardOff=${args.armedDrawFocusForwardOff} peerDeselectOff=${args.peerDeselectOff} only=${args.only ? args.only.join(',') : 'ALL'}`);

  let allScenarios = scenarioList();
  if (args.pending) allScenarios = [...allScenarios, ...t8PendingScenarioList()];
  const scenarios = allScenarios.filter((s) => !args.only || args.only.includes(s.id));
  if (!scenarios.length) {
    console.error('[run] no scenarios matched --only filter');
    await srv.close();
    process.exit(2);
  }

  const browser = await launchBrowser({ headful: args.headful });
  // verdicts[id] = array of 'PASS'|'FAIL' per run.
  const verdicts = {};
  const notesById = {};
  for (const s of scenarios) verdicts[s.id] = [];

  try {
    for (let run = 1; run <= args.runs; run++) {
      console.log(`\n========== RUN ${run}/${args.runs}${args.bug ? ' (BUG MODE)' : ''} ==========`);
      for (const s of scenarios) {
        const ctx = { browser, srv, bug: args.bug, bugSwitches: args.bugSwitches, orderMcStateConvergeOff: args.orderMcStateConvergeOff, armedDrawFocusForwardOff: args.armedDrawFocusForwardOff, peerDeselectOff: args.peerDeselectOff };
        let result;
        try {
          result = await s.run(ctx);
        } catch (err) {
          console.log(`[run] ${s.id} threw: ${(err && err.stack) || err}`);
          verdicts[s.id].push('FAIL');
          console.log(`RESULT ${s.id} FAIL`);
          continue;
        }
        const v = verdictOf(result);
        verdicts[s.id].push(v.pass ? 'PASS' : 'FAIL');
        if (result.notes && result.notes.length) notesById[s.id] = result.notes;

        // Per-check detail.
        for (const c of result.checks.items) {
          console.log(`   [${c.ok ? ' ok ' : 'FAIL'}] ${c.label}${c.detail ? ' — ' + c.detail : ''}`);
        }
        for (const c of result.inv.items) {
          if (!c.ok) console.log(`   [FAIL] ${c.label}${c.detail ? ' — ' + c.detail : ''}`);
        }
        console.log(`RESULT ${s.id} ${v.pass ? 'PASS' : 'FAIL'}`);
      }
    }
  } finally {
    await browser.close();
    await srv.close();
  }

  // ── Summary / classification ──
  console.log('\n================= SUMMARY =================');
  let anyFail = false;
  const rows = [];
  for (const s of scenarios) {
    const vs = verdicts[s.id];
    const allPass = vs.every((v) => v === 'PASS');
    const allFail = vs.every((v) => v === 'FAIL');
    let cls;
    if (allPass) cls = 'PASS';
    else if (allFail) cls = 'FAIL-REAL-BUG';
    else cls = 'FAIL-FLAKE';
    if (cls !== 'PASS') anyFail = true;
    rows.push({ id: s.id, runs: vs.join(','), verdict: cls });
  }
  console.table(rows);
  for (const s of scenarios) {
    if (notesById[s.id]) for (const n of notesById[s.id]) console.log(`   note ${s.id}: ${n}`);
  }
  for (const s of scenarios) {
    console.log(`FINAL ${s.id} ${rows.find((r) => r.id === s.id).verdict}`);
  }
  console.log('==========================================');

  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error('[run] FATAL:', (err && err.stack) || err);
  process.exit(1);
});
