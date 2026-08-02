/**
 * One-shot: open the canary, read SPEED-01 runtime with the fixed probe names.
 * Does not run a soak — just answers whether the page has a live governor.
 */
import puppeteer from 'puppeteer';
import { readSpeed01Runtime, gradeRuntimeLadder, checkSpeed01Served } from '../../scripts/lib/served-capability.mjs';

const ORIGIN = process.env.TEST_VPS_URL || 'http://31.97.192.82:3000';
const cap = await checkSpeed01Served(ORIGIN);
console.log('served:', cap.state, cap.present?.length + '/5', cap.bytes, 'B');

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(`${ORIGIN}/chart/dist-v9/`, { waitUntil: 'networkidle2', timeout: 60000 });
  // Multichart embeds panels; try main frame then children.
  let runtime = null;
  for (const frame of page.frames()) {
    try {
      const r = await readSpeed01Runtime(frame);
      if (r?.hasReplaySystem) { runtime = r; break; }
    } catch { /* frame not ready */ }
  }
  if (!runtime) {
    // Wait briefly for an embed to boot
    await new Promise((r) => setTimeout(r, 8000));
    for (const frame of page.frames()) {
      try {
        const r = await readSpeed01Runtime(frame);
        if (r?.hasReplaySystem) { runtime = r; break; }
      } catch { /* */ }
    }
  }
  console.log('runtime:', JSON.stringify(runtime, null, 2));
  const grade = gradeRuntimeLadder(runtime);
  console.log('grade:', grade.ok ? 'PASS' : 'FAIL', grade.why || '');
  process.exitCode = grade.ok ? 0 : 1;
} finally {
  await browser.close();
}
