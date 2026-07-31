/**
 * Record the exact browser configuration the ~86 ms was measured under, so C's CDP trace can be
 * taken under the same one or, failing that, so the difference is known before the numbers are
 * compared rather than after.
 *
 * Also checks whether renderer peak memory is obtainable on Linux via /proc VmHWM, which would give
 * D the peak M1 needs without having to win a sampling race.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = fs.readFileSync('/root/b-tal01891/CHROME_PATH', 'utf8').trim();
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });
  await page.goto('about:blank', { waitUntil: 'domcontentloaded' });

  console.log('=== browser identity ===');
  console.log('  version        ' + await browser.version());
  console.log('  userAgent      ' + (await browser.userAgent()).slice(0, 120));

  console.log('\n=== rasterisation path (decides whether paint costs transfer to a real user) ===');
  const gl = await page.evaluate(() => {
    try {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!g) return { webgl: false };
      const dbg = g.getExtension('WEBGL_debug_renderer_info');
      return {
        webgl: true,
        vendor: dbg ? g.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : g.getParameter(g.VENDOR),
        renderer: dbg ? g.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER),
      };
    } catch (e) { return { webgl: false, error: String(e).slice(0, 100) }; }
  });
  console.log('  ' + JSON.stringify(gl));

  console.log('\n=== which PerformanceObserver entry types exist here ===');
  const types = await page.evaluate(() => ({
    supported: (PerformanceObserver.supportedEntryTypes || []).join(', '),
    longtaskAvailable: (PerformanceObserver.supportedEntryTypes || []).includes('longtask'),
  }));
  console.log('  longtask supported: ' + types.longtaskAvailable);
  console.log('  all: ' + types.supported);

  console.log('\n=== CDP process list, and whether /proc gives peak RSS on this platform ===');
  const session = await browser.target().createCDPSession();
  const info = await session.send('SystemInfo.getProcessInfo').catch((e) => ({ error: String(e).slice(0, 80) }));
  const rows = info.processInfo || [];
  console.log(`  CDP reports ${rows.length} processes; privateMemory values: `
    + JSON.stringify(rows.map((p) => p.privateMemory).slice(0, 6)));
  for (const p of rows.slice(0, 8)) {
    const pid = Number(p.id || p.pid);
    let vmhwm = null; let vmrss = null;
    try {
      const st = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      vmhwm = (st.match(/VmHWM:\s+(\d+) kB/) || [])[1];
      vmrss = (st.match(/VmRSS:\s+(\d+) kB/) || [])[1];
    } catch (e) { /* process may be gone */ }
    console.log(`    pid=${String(pid).padEnd(8)} type=${String(p.type).padEnd(10)} `
      + `VmRSS=${vmrss ? (vmrss / 1024).toFixed(1) + ' MB' : 'n/a'}  `
      + `VmHWM(peak)=${vmhwm ? (vmhwm / 1024).toFixed(1) + ' MB' : 'n/a'}`);
  }
  await session.detach().catch(() => {});
  console.log('\n  VmHWM is a kernel-maintained high-water mark: it reports the peak RSS the process');
  console.log('  ever reached, with no sampling required. If it is populated above, D can have the');
  console.log('  peak without winning a race against a six-second decay.');
} catch (e) {
  console.log('ERROR ' + String(e && e.stack ? e.stack : e).slice(0, 400));
} finally {
  await browser.close();
}
