/**
 * react-run.mjs — T0 step 8b runner for built-product React parity scenarios.
 *
 * Boots real dist-v9 MultichartGrid (mcLayout=2v) via react-parity-lib.
 * CLI flags: --runs=N, --only=H-R01,H-R12, --headful
 */

import { ensureBuiltReactStack, launchBrowser, sleep } from './react-parity-lib.mjs';
import { reactScenarioList } from './react-parity-scenarios.mjs';

function parseArgs(argv) {
  const args = {
    runs: 1, only: null, headful: false,
    migrationOn: false, phase1Off: false, phase5Off: false,
    panelKeyboardOff: false, peerDeselectOff: false,
    iframeCtrlDedupeOff: false, lifecycleOff: false, legacySelectionOff: false,
    drawingLocalInvalidationOff: false, chromeRoutingOff: false, hr02ActuationMiss: false,
    isolateSession: false, chromeDomReadyOff: false,
    panelBSettingsTransportOff: false, panelBSettingsTransportAOff: false,
    orderMcStateConvergeOff: false,
    v9QuickbarLiveResolveOff: false,
    vpV9AvLabelBridgeOff: false,
    vpV9AvCoordRepositionOff: false,
    axisMarginFloorOff: false,
  };
  for (const a of argv.slice(2)) {
    if (a === '--headful') args.headful = true;
    else if (a === '--migration-on') args.migrationOn = true;
    else if (a === '--phase1-off') args.phase1Off = true;
    else if (a === '--phase5-off') args.phase5Off = true;
    else if (a === '--panel-keyboard-off') args.panelKeyboardOff = true;
    else if (a === '--peer-deselect-off') args.peerDeselectOff = true;
    else if (a === '--iframe-ctrl-dedupe-off') args.iframeCtrlDedupeOff = true;
    else if (a === '--lifecycle-off') args.lifecycleOff = true;
    else if (a === '--legacy-selection-off') args.legacySelectionOff = true;
    else if (a === '--drawing-local-invalidation-off') args.drawingLocalInvalidationOff = true;
    else if (a === '--chrome-routing-off') args.chromeRoutingOff = true;
    else if (a === '--chrome-dom-ready-off') args.chromeDomReadyOff = true;
    else if (a === '--panelb-settings-transport-off') args.panelBSettingsTransportOff = true;
    else if (a === '--panelb-settings-transport-a-off') args.panelBSettingsTransportAOff = true;
    else if (a === '--order-mc-state-converge-off') args.orderMcStateConvergeOff = true;
    else if (a === '--v9-quickbar-live-resolve-off') args.v9QuickbarLiveResolveOff = true;
    else if (a === '--vp-v9-av-label-bridge-off') args.vpV9AvLabelBridgeOff = true;
    else if (a === '--vp-v9-av-coord-reposition-off') args.vpV9AvCoordRepositionOff = true;
    else if (a === '--axis-margin-floor-off') args.axisMarginFloorOff = true;
    else if (a === '--hr02-actuation-miss' || a === '--hr02-discriminator-off') args.hr02ActuationMiss = true;
    else if (a === '--isolate-session') args.isolateSession = true;
    else if (a.startsWith('--runs=')) args.runs = Math.max(1, parseInt(a.slice(7), 10) || 1);
    else if (a.startsWith('--only=')) args.only = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return args;
}

function verdictOf(result) {
  const checkFails = result.checks.failures();
  return {
    pass: checkFails.length === 0,
    checkFails,
  };
}

function buildScenarioCtx(args, browser, stack) {
  return {
    browser, stack,
    migrationOn: args.migrationOn,
    phase1Off: args.phase1Off,
    phase5Off: args.phase5Off,
    panelKeyboardOff: args.panelKeyboardOff,
    switchOffPeerDeselect: args.peerDeselectOff,
    iframeCtrlDedupeOff: args.iframeCtrlDedupeOff,
    lifecycleOff: args.lifecycleOff,
    legacySelectionOff: args.legacySelectionOff,
    drawingLocalInvalidationOff: args.drawingLocalInvalidationOff,
    chromeRoutingOff: args.chromeRoutingOff,
    hr02ActuationMiss: args.hr02ActuationMiss,
    chromeDomReadyOff: args.chromeDomReadyOff,
    panelBSettingsTransportOff: args.panelBSettingsTransportOff,
    panelBSettingsTransportAOff: args.panelBSettingsTransportAOff,
    orderMcStateConvergeOff: args.orderMcStateConvergeOff,
    v9QuickbarLiveResolveOff: args.v9QuickbarLiveResolveOff,
    vpV9AvLabelBridgeOff: args.vpV9AvLabelBridgeOff,
    vpV9AvCoordRepositionOff: args.vpV9AvCoordRepositionOff,
    axisMarginFloorOff: args.axisMarginFloorOff,
  };
}

async function runScenarioOnce(s, ctx, verdicts, runIndex = null) {
  let result;
  const scenarioCtx = { ...ctx, scenarioId: s.id, runIndex };
  try {
    result = await s.run(scenarioCtx);
  } catch (err) {
    console.log(`[react-run] ${s.id} threw: ${(err && err.stack) || err}`);
    verdicts[s.id].push('FAIL');
    console.log(`RESULT ${s.id} FAIL`);
    return;
  }
  const v = verdictOf(result);
  verdicts[s.id].push(v.pass ? 'PASS' : 'FAIL');
  for (const c of result.checks.items) {
    console.log(`   [${c.ok ? ' ok ' : 'FAIL'}] ${c.label}${c.detail ? ' — ' + c.detail : ''}`);
  }
  if (result.d032Tripwire) {
    console.log(`   [D-032] tripwireClass=${result.d032Tripwire.tripwireClass} sig=${JSON.stringify(result.d032Tripwire.signature)}`);
  }
  console.log(`RESULT ${s.id} ${v.pass ? 'PASS' : 'FAIL'}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const scenarios = reactScenarioList().filter((s) => !args.only || args.only.includes(s.id));
  if (!scenarios.length) {
    console.error('[react-run] no scenarios matched --only filter');
    process.exit(2);
  }

  const stack = await ensureBuiltReactStack();
  const isolateSession = args.isolateSession
    || process.env.REACT_PARITY_ISOLATE_SESSION === '1'
    || (!args.only && scenarios.length > 1);
  console.log(`[react-run] built-product url: ${stack.url}`);
  console.log(`[react-run] surface: ${stack.surface} build=${stack.buildId}`);
  console.log(`[react-run] mode: runs=${args.runs} only=${args.only ? args.only.join(',') : 'ALL'} isolateSession=${isolateSession} migrationOn=${args.migrationOn} phase1Off=${args.phase1Off} phase5Off=${args.phase5Off} panelKeyboardOff=${args.panelKeyboardOff} peerDeselectOff=${args.peerDeselectOff} iframeCtrlDedupeOff=${args.iframeCtrlDedupeOff} lifecycleOff=${args.lifecycleOff} legacySelectionOff=${args.legacySelectionOff} hr02ActuationMiss=${args.hr02ActuationMiss} chromeDomReadyOff=${args.chromeDomReadyOff} panelBSettingsTransportOff=${args.panelBSettingsTransportOff} panelBSettingsTransportAOff=${args.panelBSettingsTransportAOff} orderMcStateConvergeOff=${args.orderMcStateConvergeOff} v9QuickbarLiveResolveOff=${args.v9QuickbarLiveResolveOff} vpV9AvLabelBridgeOff=${args.vpV9AvLabelBridgeOff} vpV9AvCoordRepositionOff=${args.vpV9AvCoordRepositionOff}`);

  const verdicts = {};
  const notesById = {};
  for (const s of scenarios) verdicts[s.id] = [];

  try {
    if (isolateSession) {
      for (let run = 1; run <= args.runs; run++) {
        console.log(`\n========== REACT RUN ${run}/${args.runs} (isolate-session) ==========`);
        for (const s of scenarios) {
          const browser = await launchBrowser({ headful: args.headful });
          try {
            const ctx = buildScenarioCtx(args, browser, stack);
            await runScenarioOnce(s, ctx, verdicts, run);
          } finally {
            await browser.close().catch(() => {});
            await sleep(2000);
          }
        }
      }
    } else {
      const browser = await launchBrowser({ headful: args.headful });
      try {
        for (let run = 1; run <= args.runs; run++) {
          console.log(`\n========== REACT RUN ${run}/${args.runs} ==========`);
          for (const s of scenarios) {
            const ctx = buildScenarioCtx(args, browser, stack);
            await runScenarioOnce(s, ctx, verdicts, run);
            await sleep(1500);
          }
        }
      } finally {
        await browser.close();
      }
    }
  } finally {
    await stack.close();
  }

  console.log('\n================= REACT SUMMARY =================');
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
    console.log(`FINAL ${s.id} ${rows.find((r) => r.id === s.id).verdict}`);
  }
  console.log('=================================================');

  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error('[react-run] FATAL:', (err && err.stack) || err);
  process.exit(1);
});
