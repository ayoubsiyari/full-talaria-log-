#!/usr/bin/env node
import { ensureBuiltReactStack, launchBrowser } from './react-parity-lib.mjs';
import { reactScenarioList } from './react-parity-scenarios.mjs';

async function main() {
  const stack = await ensureBuiltReactStack();
  const browser = await launchBrowser({ headful: false });
  try {
    const scenario = reactScenarioList().find((s) => s.id === 'H-R07');
    const result = await scenario.run({ browser, stack, phase5Off: true });
    const checks = result.checks;
    const core = checks.items.filter((c) => /CORE/.test(c.label));
    for (const c of core) {
      console.log(`   [${c.ok ? ' ok ' : 'FAIL'}] ${c.label}${c.detail ? ' — ' + c.detail : ''}`);
    }
    const coreFail = core.some((c) => !c.ok);
    console.log(`H-R07 switch-OFF __TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION: ${coreFail ? 'RED (expected)' : 'UNEXPECTED GREEN'}`);
  } finally {
    await browser.close();
    await stack.close();
  }
}

await main();
