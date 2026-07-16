#!/usr/bin/env node
/** D-023: probe host vs panel-B predicates under switch arms for H-R02 discriminator search. */
import { ensureBuiltReactStack, launchBrowser, bootReactMultichart, seedDrawing, disarmDrawTool, singleClickDrawing, isDrawingSelected, readSelectionChrome } from './react-parity-lib.mjs';
import { panelFrameMap } from './harness-lib.mjs';

async function readPreds(target, label) {
  return target.evaluate((lbl) => {
    const dm = window.chart?.drawingManager;
    const ch = window.chart;
    return {
      label: lbl,
      buildId: window.__TALARIA_CHART_BUILD_ID,
      lifecycle: dm?._isToolLifecycleV2Enabled?.(),
      legacy: ch?._isLegacySelectionRetireV2Enabled?.(),
      phase1: !window.__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE,
      lifecycleOff: !!window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2,
      legacyOff: !!window.__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2,
      dedupeOff: !!window.__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1,
      embed: typeof ch?._isMultichartEmbedPanel === 'function' ? ch._isMultichartEmbedPanel() : null,
      host: typeof ch?._isMultichartHostPanel === 'function' ? ch._isMultichartHostPanel() : null,
    };
  }, label);
}

async function probeArm(browser, stack, armName, bootOpts) {
  const boot = await bootReactMultichart(browser, stack, bootOpts);
  const { page } = boot;
  const hostFrame = page.mainFrame();
  const panelB = panelFrameMap(page).B;
  const predsHost = await readPreds(hostFrame, 'host');
  const predsB = panelB ? await readPreds(panelB, 'panelB') : null;

  for (const [pid, label] of [['A', 'host'], ['B', 'panelB']]) {
    const tool = await seedDrawing(page, pid, 'rectangle');
    await disarmDrawTool(page, pid);
    await singleClickDrawing(page, pid, tool.id);
    const storeSel = await isDrawingSelected(page, pid, tool.id);
    const chrome = await readSelectionChrome(page, pid, tool.id);
    console.log(JSON.stringify({ arm: armName, leg: label, storeSel, chrome, toolId: tool.id }));
  }
  console.log(JSON.stringify({ arm: armName, predsHost, predsB }));
  await boot.close();
}

async function main() {
  const stack = await ensureBuiltReactStack();
  const browser = await launchBrowser({ headful: false });
  try {
    const arms = [
      ['default', {}],
      ['phase1-off', { phase1Off: true }],
      ['lifecycle-off', { lifecycleOff: true }],
      ['legacy-off', { legacySelectionOff: true }],
      ['p1+lifecycle+legacy', { phase1Off: true, lifecycleOff: true, legacySelectionOff: true }],
    ];
    for (const [name, opts] of arms) {
      await probeArm(browser, stack, name, opts);
    }
  } finally {
    await browser.close();
    await stack.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
