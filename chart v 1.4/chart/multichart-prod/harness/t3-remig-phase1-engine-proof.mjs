#!/usr/bin/env node
/**
 * T3 remig Phase 1 — engine substrate proof (dev-only, I15).
 * Predicate flip + programmatic select path (real mouse hit coords broken in harness — see report).
 */
import { ensureBuiltReactStack, launchBrowser, bootReactMultichart, seedDrawing, disarmDrawTool } from './react-parity-lib.mjs';
import { panelFrameMap } from './harness-lib.mjs';

async function readPredicates(frame) {
  return frame.evaluate(() => {
    const dm = window.chart?.drawingManager;
    const ch = window.chart;
    const store = window.ToolLifecycleStore && dm
      ? new window.ToolLifecycleStore(dm)
      : null;
    return {
      lifecycle: dm?._isToolLifecycleV2Enabled?.(),
      legacy: ch?._isLegacySelectionRetireV2Enabled?.(),
      storeEnabled: store?.isEnabled?.(),
      phase1Active: !window.__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE,
    };
  });
}

async function probeSelect(frame, toolId, addToSelection = false) {
  return frame.evaluate((id, add) => {
    const dm = window.chart?.drawingManager;
    const d = dm?.drawings?.find((x) => x && String(x.id) === String(id));
    if (!dm || !d) return { ok: false, reason: 'drawing missing' };
    dm.selectDrawing(d, add);
    const inSel = (dm.selectedDrawings || []).some((x) => x && String(x.id) === String(id));
    return { ok: inSel || !!d.selected, selectedDrawings: dm.selectedDrawings.map((x) => x.id) };
  }, toolId, addToSelection);
}

async function runPhase1On(browser, stack) {
  const boot = await bootReactMultichart(browser, stack, {});
  const frameB = panelFrameMap(boot.page).B;
  const preds = await readPredicates(frameB);
  const t1 = await seedDrawing(boot.page, 'B', 'rectangle');
  await disarmDrawTool(boot.page, 'B');
  const sel1 = await probeSelect(frameB, t1.id, false);
  const t2 = await seedDrawing(boot.page, 'B', 'trendline');
  await disarmDrawTool(boot.page, 'B');
  const sel2a = await probeSelect(frameB, t2.id, false);
  const sel2b = await probeSelect(frameB, t1.id, true);
  await boot.close();
  return {
    preds,
    singleSelect: sel1,
    multiSelect: { first: sel2a, second: sel2b },
    pass: preds.lifecycle === true && preds.legacy === true && preds.storeEnabled === true
      && sel1.ok && sel2a.ok && sel2b.ok
      && sel2b.selectedDrawings.includes(t1.id) && sel2b.selectedDrawings.includes(t2.id),
  };
}

async function runPhase1Off(browser, stack) {
  const boot = await bootReactMultichart(browser, stack, { phase1Off: true });
  const frameB = panelFrameMap(boot.page).B;
  const preds = await readPredicates(frameB);
  await boot.close();
  return {
    preds,
    pass: preds.lifecycle === false && preds.legacy === false && preds.storeEnabled === false
      && preds.phase1Active === false,
  };
}

async function main() {
  const stack = await ensureBuiltReactStack();
  const browser = await launchBrowser({ headful: false });
  try {
    console.log('=== T3 remig Phase 1 engine proof ===');
    const off = await runPhase1Off(browser, stack);
    console.log('A/B phase1Off (fallback-B iframe):', JSON.stringify(off, null, 2));
    if (!off.pass) {
      console.error('PHASE1-OFF-AB failed');
      process.exit(1);
    }
    console.log('PHASE1-OFF-AB CONFIRMED');

    const on = await runPhase1On(browser, stack);
    console.log('Phase1 ON (default):', JSON.stringify(on, null, 2));
    if (!on.pass) {
      console.error('PHASE1-ON failed');
      process.exit(1);
    }
    console.log('PHASE1-ON CONFIRMED');
    console.log('FINAL T3-remig-phase1-engine-proof PASS');
  } finally {
    await browser.close();
    await stack.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
