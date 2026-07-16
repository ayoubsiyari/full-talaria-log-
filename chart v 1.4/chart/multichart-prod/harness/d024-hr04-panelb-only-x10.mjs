/** Isolated panel-B H-R04 only (no host leg) for D-024 proof. */
import { reactScenarios } from './react-parity-scenarios.mjs';
import { ensureBuiltReactStack, launchBrowser } from './react-parity-lib.mjs';

const stack = await ensureBuiltReactStack();
const scenarios = reactScenarios().filter((s) => s.id === 'H-R04');
let pass = 0;
for (let i = 0; i < 10; i++) {
  const browser = await launchBrowser({ headful: false });
  try {
    const ctx = { browser, stack, isolateSession: true };
    const r = await scenarios[0].run(ctx);
    const ok = r && r.failed === 0;
    if (ok) pass++;
    else console.log(`run ${i + 1} FAIL`, r?.failures || r);
  } finally {
    await browser.close();
  }
}
console.log(`panelB-only H-R04: ${pass}/10`);
