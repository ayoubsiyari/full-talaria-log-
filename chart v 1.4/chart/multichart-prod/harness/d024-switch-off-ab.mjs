/** D-024 switch-OFF A/B — sets kill-switch before boot. */
import { reactScenarios } from './react-parity-scenarios.mjs';
import { ensureBuiltReactStack, launchBrowser, installBuiltProductBoot } from './react-parity-lib.mjs';
import puppeteer from 'puppeteer-core';

const stack = await ensureBuiltReactStack();
const ids = ['H-R04', 'H-R05'];
for (const id of ids) {
  let fail = 0;
  for (let i = 0; i < 10; i++) {
    const browser = await launchBrowser({ headful: false });
    const page = await browser.newPage();
    await installBuiltProductBoot(page, {});
    await page.evaluateOnNewDocument(() => {
      window.__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4 = true;
    });
    const scenario = reactScenarios().find((s) => s.id === id);
    const ctx = { browser, stack, isolateSession: true, page };
    try {
      const r = await scenario.run(ctx);
      if (!r || r.failed > 0) {
        fail++;
        if (fail <= 2) console.log(`${id} run ${i + 1} FAIL`, r?.results?.filter((x) => !x.ok)?.map((x) => x.label));
      }
    } catch (e) {
      fail++;
      console.log(`${id} run ${i + 1} ERROR`, e.message);
    } finally {
      await browser.close();
    }
  }
  console.log(`${id} switch-OFF: ${10 - fail}/10 pass, ${fail}/10 fail (expect FAIL-REAL-BUG)`);
}
await stack.close();
