/**
 * ORDER-01B — renderer-death probe for the four-panel replay workload.
 *
 * The sealed QW-3 re-sample died at t+85s with `Session closed`, which the
 * sampler reports only as a protocol error at the end. That says the page went
 * away but not why, and "why" decides whether the train has a landing blocker
 * or the sampler hit a flake.
 *
 * Boots exactly the workload the sampler boots and keeps every diagnostic
 * channel open: page errors, console errors, and the CDP target-crash signal
 * with its exit status. Reports the last thing said before the page stopped
 * answering rather than the first thing the harness noticed afterwards.
 *
 * Usage:
 *   node scripts/order01b-crash-probe.mjs [--minutes=3]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyDistV9LayoutViaUi,
  loadPuppeteer,
  waitForDistV9SingleReady,
} from './lib/heap-cycle-browser.mjs';
import { startServer as startHarnessServer } from '../chart v 1.4/chart/multichart-prod/harness/serve.mjs';
import {
  installBuiltProductBoot,
  reactParityUrlWithLayout,
} from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';
import { armHeapCyclePoWorkload } from './lib/heap-cycle-po-workload.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argOf = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const RUN_MS = Number(argOf('minutes', '3')) * 60_000;
const BPS = Number(argOf('speed', '10'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[crash-probe] ${new Date().toISOString()} ${m}`);

async function main() {
  const puppeteer = await loadPuppeteer();
  const harness = await startHarnessServer(0);
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: RUN_MS + 120_000,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
    ],
    defaultViewport: { width: 1440, height: 960 },
  });

  const events = [];
  let crashed = null;
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180_000);
    page.on('pageerror', (e) => {
      events.push({ at: Date.now(), kind: 'pageerror', text: String(e && e.message || e) });
    });
    page.on('error', (e) => {
      crashed = crashed || { at: Date.now(), kind: 'page-crash', text: String(e && e.message || e) };
      events.push({ at: Date.now(), kind: 'page-crash', text: String(e && e.message || e) });
    });
    page.on('console', (msg) => {
      if (msg.type() !== 'error' && msg.type() !== 'warning') return;
      events.push({ at: Date.now(), kind: `console:${msg.type()}`, text: msg.text().slice(0, 400) });
    });

    await installBuiltProductBoot(page, {});
    const url = reactParityUrlWithLayout(
      `${harness.url}/chart/dist-v9/index.html?mode=backtest`, '1',
    );
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await waitForDistV9SingleReady(page, 180_000);
    await applyDistV9LayoutViaUi(page, 4);
    const armed = await armHeapCyclePoWorkload(page, { replaySpeed: BPS });
    log(`armed=${armed && armed.armed} playing=${armed && armed.playing}`);

    const started = Date.now();
    const deadline = started + RUN_MS;
    while (Date.now() < deadline && !crashed) {
      await sleep(10_000);
      let alive = null;
      try {
        alive = await page.evaluate(() => ({
          rate: typeof window.__talariaEffectiveRate === 'number'
            ? window.__talariaEffectiveRate : null,
          heapMb: (window.performance && window.performance.memory)
            ? Math.round(window.performance.memory.usedJSHeapSize / (1024 * 1024))
            : null,
          limitMb: (window.performance && window.performance.memory)
            ? Math.round(window.performance.memory.jsHeapSizeLimit / (1024 * 1024))
            : null,
        }));
      } catch (e) {
        crashed = crashed || { at: Date.now(), kind: 'evaluate-failed', text: String(e && e.message || e) };
      }
      const t = Math.round((Date.now() - started) / 1000);
      if (alive) {
        log(`t+${t}s rate=${alive.rate === null ? 'n/a' : alive.rate.toFixed(2)} `
          + `heap=${alive.heapMb}/${alive.limitMb}MB`);
      } else {
        log(`t+${t}s page not answering`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
    await harness.close?.().catch?.(() => {});
  }

  console.log('\n===== ORDER-01B crash probe =====');
  console.log(crashed ? `CRASHED: ${crashed.kind} — ${crashed.text}` : 'survived the window');
  const tail = events.slice(-25);
  console.log(`\nlast ${tail.length} diagnostic event(s):`);
  for (const e of tail) console.log(`  ${e.kind}: ${e.text}`);
  process.exit(crashed ? 1 : 0);
}

main().catch((e) => {
  console.error(`[crash-probe] FAILED: ${e && e.stack || e}`);
  process.exit(2);
});
