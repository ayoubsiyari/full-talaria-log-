// GATE-01, browser level: a control POST must never outlive its ceiling, measured in a real
// browser against a real socket.
//
// WHY THIS EXISTS ALONGSIDE window-control-fetch-timeout.test.mjs
// That gate proves the mechanism with a stubbed fetch in one realm. C's P0 sighting was different
// in kind: two POSTs on the window-claim path hanging permanently on the deployed build, observed
// by reloading the chart tab and opening a second one. A fetch stub cannot show that, because the
// thing at stake is whether the BROWSER lets go of the socket. So this gate drives Chrome through
// C's exact route — chart tab with four panels on four symbols, reload it, open a second tab —
// against a server that accepts the control POSTs and never answers, and asks the server one
// question: did the client ever release the socket?
//
// MEASURED, both arms, 45s run:
//   genuine pre-fix module (be7bc73a6^):  4 POSTs, 2 released, 2 STILL HELD at end of run
//   fixed module (shipped in b113):       4 POSTs, 4 released, two of them at 10001/10002 ms
// The two still held pre-fix are C's two hung POSTs, reproduced.
//
// The negative control is the real prior code, not the kill-switch. Flipping
// __TALARIA_DISABLE_WINDOW_CONTROL_FETCH_TIMEOUT_V1 leaves the heartbeat in-flight guard in place,
// because that guard sits outside the flag — so a flag-off arm keeps half the fix and is not a
// real negative control. FLAG-01 means testing against the ABSENT property, and the absent
// property is the parent commit's file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const MODULE_FILE = join(HERE, 'chart-window-limit.js');
// The commit that introduced the ceiling. Its parent is the defect.
const FIX_COMMIT = 'be7bc73a6';
const PRE_FIX_REF = `${FIX_COMMIT}^:chart v 1.4/chart/modules/chart-window-limit.js`;

const CONTROL_TIMEOUT_MS = 10000;
const RUN_MS = Number(process.env.SOCKET_GATE_RUN_MS || 40000);
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001',
  'hex');

function loadPuppeteer() {
  try {
    const require = createRequire(join(REPO, 'chart v 1.4', 'chart', 'multichart-prod', 'harness') + '/');
    return require('puppeteer');
  } catch (_e) {
    return null;
  }
}

function preFixSource() {
  try {
    return execFileSync('git', ['show', PRE_FIX_REF], { cwd: REPO, maxBuffer: 1e8 }).toString('utf8');
  } catch (_e) {
    return null;
  }
}

function hostHtml(moduleUrl, preFlag) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>host</title>
<script>window.__imgLog = []; window.__imgRequested = 0;</script>
<script src="${moduleUrl}"></script></head><body><div id="p"></div>
<script>
  var syms = ['EURUSD','GBPUSD','XAUUSD','USDJPY'];
  for (var i = 0; i < 4; i++) {
    var f = document.createElement('iframe');
    f.src = '/panel.html?panelId=' + 'ABCD'[i] + '&symbol=' + syms[i] + '&pre=' + ${preFlag};
    f.width = 160; f.height = 100;
    document.getElementById('p').appendChild(f);
  }
  window.__loadImages = function (n, tag) {
    window.__imgRequested += n;
    for (var k = 0; k < n; k++) {
      var img = new Image();
      img.onload = function () { window.__imgLog.push(1); };
      img.onerror = function () { window.__imgLog.push(0); };
      img.src = '/w80/' + tag + '-' + k + '.png?cb=' + Math.random();
    }
  };
</script></body></html>`;
}

function startServer(fixedSrc, preSrc) {
  const held = [];
  const server = http.createServer((req, res) => {
    const path = req.url.split('?')[0];
    const pre = /[?&]pre=1/.test(req.url);
    if (path === '/host.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(hostHtml(pre ? '/m/pre.js' : '/m/fixed.js', pre ? 1 : 0));
      return;
    }
    if (path === '/panel.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!doctype html><meta charset="utf-8"><script src="${pre ? '/m/pre.js' : '/m/fixed.js'}"></script>panel`);
      return;
    }
    if (path === '/m/fixed.js' || path === '/m/pre.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(path === '/m/pre.js' ? preSrc : fixedSrc);
      return;
    }
    if (path.startsWith('/api/chart/windows/')) {
      // Accepted, never answered. The socket is the instrument.
      const rec = { url: path, at: Date.now(), closedAfterMs: null };
      held.push(rec);
      req.socket.setKeepAlive(true);
      const onGone = () => { if (rec.closedAfterMs === null) rec.closedAfterMs = Date.now() - rec.at; };
      req.on('aborted', onGone);
      req.on('close', onGone);
      res.on('close', onGone);
      return;
    }
    if (path === '/api/auth/me') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }
    if (path.startsWith('/w80/')) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      res.end(PNG);
      return;
    }
    res.writeHead(404); res.end('nf');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, held, port: server.address().port }));
  });
}

// Drives C's route and reports what the server saw, with the tabs still open.
async function runRoute(browser, base, pre, held) {
  held.length = 0;
  const t0 = Date.now();
  const ctx = await browser.createBrowserContext();
  const url = `${base}/host.html${pre ? '?pre=1' : ''}`;
  const tab1 = await ctx.newPage();
  await tab1.goto(url, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 2500));
  await tab1.reload({ waitUntil: 'domcontentloaded' });      // C's step 1
  await new Promise((r) => setTimeout(r, 1500));
  const tab2 = await ctx.newPage();
  await tab2.goto(url, { waitUntil: 'domcontentloaded' });   // C's step 2
  await new Promise((r) => setTimeout(r, 1500));

  while (Date.now() - t0 < RUN_MS) {
    await new Promise((r) => setTimeout(r, 5000));
    for (const [i, t] of [tab1, tab2].entries()) {
      await t.evaluate((n, tag) => window.__loadImages(n, tag), 3, `t${i}`).catch(() => {});
    }
  }

  // Let the last requested batch settle before counting, otherwise images that are merely in
  // flight read as stalled and the assertion measures the race, not the product.
  await new Promise((r) => setTimeout(r, 2500));
  const icons = await Promise.all([tab1, tab2].map((t) =>
    t.evaluate(() => ({ req: window.__imgRequested, done: window.__imgLog.length }))
      .catch(() => ({ req: 0, done: 0 }))));
  // Snapshot BEFORE closing: teardown releases every socket and would mask the defect.
  const snapshot = held.map((h) => ({ url: h.url, closedAfterMs: h.closedAfterMs }));
  await ctx.close();

  return {
    posts: snapshot.length,
    stillHeld: snapshot.filter((h) => h.closedAfterMs === null).length,
    releasedAtCeiling: snapshot.filter((h) =>
      h.closedAfterMs !== null
      && h.closedAfterMs >= CONTROL_TIMEOUT_MS - 1500
      && h.closedAfterMs <= CONTROL_TIMEOUT_MS + 4000).length,
    iconsRequested: icons.reduce((a, c) => a + c.req, 0),
    iconsCompleted: icons.reduce((a, c) => a + c.done, 0),
  };
}

const puppeteer = loadPuppeteer();
const preSrc = preFixSource();
const skip = !puppeteer
  ? 'puppeteer not resolvable from the harness'
  : (!preSrc ? `cannot read ${PRE_FIX_REF} — needed as the negative control` : false);

test('a silent control endpoint cannot hold a browser socket — C\'s route, real Chrome', { skip }, async () => {
  const fixedSrc = readFileSync(MODULE_FILE, 'utf8');
  // The negative control has to actually lack the fix, or this gate proves nothing.
  assert.ok(!/function controlFetch/.test(preSrc),
    'the pre-fix reference still contains controlFetch; it is not a negative control');
  assert.ok(/function controlFetch/.test(fixedSrc), 'the shipped module has lost controlFetch');

  const { server, held, port } = await startServer(fixedSrc, preSrc);
  const base = `http://127.0.0.1:${port}`;
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  let fixed; let pre;
  try {
    pre = await runRoute(browser, base, true, held);
    fixed = await runRoute(browser, base, false, held);
  } finally {
    await browser.close();
    server.close();
  }

  // The cell: on the shipped module nothing outlives the ceiling.
  assert.equal(fixed.stillHeld, 0,
    `${fixed.stillHeld} control POST(s) were still held by the browser at the end of the run; `
    + 'a hung control POST must be impossible, not merely unlikely');
  assert.ok(fixed.releasedAtCeiling >= 1,
    `expected at least one POST released at the ${CONTROL_TIMEOUT_MS}ms ceiling, got `
    + `${fixed.releasedAtCeiling} of ${fixed.posts}`);

  // The negative control: the same route on the pre-fix module DOES leave sockets held. Without
  // this the cell could pass because the route never reached the claim at all.
  assert.ok(pre.stillHeld >= 1,
    'the pre-fix module released every socket too, so this route does not exercise the defect '
    + 'and the cell above proves nothing');

  // Ungated assets keep flowing in both arms. Recorded because C also reported stalled static
  // PNGs: that half does NOT reproduce on this route, and the gate says so rather than implying
  // the fix cured it.
  assert.equal(fixed.iconsCompleted, fixed.iconsRequested,
    'ungated static assets must keep completing while a control POST is stalled');
});
