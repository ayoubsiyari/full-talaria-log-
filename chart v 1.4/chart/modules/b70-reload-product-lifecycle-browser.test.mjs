import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const chartRoot = path.resolve(here, '..');
const repoRoot = path.resolve(chartRoot, '..', '..');
const require = createRequire(
  process.env.B70_HARNESS_PACKAGE
    || fileURLToPath(new URL('../multichart-prod/harness/package.json', import.meta.url)),
);
const puppeteer = require('puppeteer');
const buildId = '20260725b70';
const assets = new Map([
  ['/chart.js', ['application/javascript', fs.readFileSync(path.join(chartRoot, 'chart.js'))]],
  ['/guards.js', ['application/javascript', fs.readFileSync(path.join(chartRoot, 'multichart-prod', 'engine-api-guards.js'))]],
  ['/manager.js', ['application/javascript', fs.readFileSync(path.join(chartRoot, 'multichart-prod', 'multichart-manager.js'))]],
  ['/embed.js', ['application/javascript', fs.readFileSync(path.join(chartRoot, 'multichart-prod', 'embed-bridge.js'))]],
]);

function parentHtml(gateOff, failRestore, noFinish) {
  return `<!doctype html><meta charset="utf-8"><body>
<div id="grid"></div><div id="alerts"></div>
<script>
window.__TALARIA_CHART_BUILD_ID=${JSON.stringify(buildId)};
window.__TALARIA_DISABLE_B70_RELOAD_PANEL_BOOT_GATE_V1=${gateOff};
window.waitForD3=Promise.resolve(); window.d3={};
window.__gateListenerAdds=0; window.__gateListenerRemoves=0; window.__wsCount=0;
const _add=window.addEventListener.bind(window), _remove=window.removeEventListener.bind(window);
window.addEventListener=function(t,f,o){if(t==='talariaMultichartHostRestoreState')window.__gateListenerAdds++;return _add(t,f,o)};
window.removeEventListener=function(t,f,o){if(t==='talariaMultichartHostRestoreState')window.__gateListenerRemoves++;return _remove(t,f,o)};
window.WebSocket=function(){window.__wsCount++;};
</script>
<script src="/chart.js"></script><script src="/guards.js"></script><script src="/manager.js"></script>
<script>
const host=Object.create(window.Chart.prototype);
host.currentFileId='25'; host.currentTimeframe='1m'; host.data=[{t:1,o:1,h:2,l:0,c:1,v:1}];
host.rawData=host.data.slice(); host.backtestingSession={startDate:'2025-01-01',endDate:'2025-01-02'};
host.replaySystem={fullRawData:host.data.slice(),isActive:true,replayTimestamp:1};
host.getActiveTradingSessionId=()=> '827';
window.chart=host;
window.__hostFinishAt=0;
const token=host._beginMultichartHostRestore('827','25');
const manager=new window.MultichartManager({
 container:document.getElementById('grid'), silentPanelBoot:true,
 iframeSrcBuilder:(cfg)=>'/panel.html?panelId='+cfg.id+'&fileId=25&tf=1m&sessionId=827&v=${buildId}',
 onPanelCacheReady:(id)=>manager.showPanelFrame(id),
 onChartBootFailed:(id,reason)=>{
   const el=document.createElement('div'); el.role='alert'; el.setAttribute('aria-live','assertive');
   el.dataset.panelId=id; el.textContent=reason; document.getElementById('alerts').appendChild(el);
 }
});
window.__multichartManagerRef=manager; window.__mcManager=manager;
for(const id of ['B','C','D']){const cell=document.createElement('div');document.getElementById('grid').appendChild(cell);manager.addChart({id,tf:'1m',fileId:'25'},cell)}
${noFinish ? '' : `setTimeout(()=>{window.__hostFinishAt=performance.now();host._finishMultichartHostRestore(token,${failRestore ? "'failed','fixture-failure'" : "'ready'"})},120);`}
window.__snapshot=()=>({
 build:window.__TALARIA_CHART_BUILD_ID,hostState:host._multichartHostRestoreState||null,
 hostFinishAt:window.__hostFinishAt,adds:window.__gateListenerAdds,removes:window.__gateListenerRemoves,ws:window.__wsCount,
 hostData:host.data,
 frames:[...document.querySelectorAll('iframe')].map(f=>{
   const canvas=f.contentDocument.getElementById('chartCanvas');
   const pixel=canvas.getContext('2d').getImageData(1,1,1,1).data;
   return {id:f.dataset.chartId,opacity:f.style.opacity,
     build:f.contentWindow.__TALARIA_CHART_BUILD_ID,bars:f.contentWindow.chart.data.length,
     data:f.contentWindow.chart.data,canvasAlpha:pixel[3],
     loads:f.contentWindow.__loads,loadAt:f.contentWindow.__loadAt,replayStarts:f.contentWindow.__replayStarts,
     ws:f.contentWindow.__wsCount};
 }),
 manager:[...manager.charts.entries()].map(([id,c])=>({id,ready:c.ready,timerActive:!!c.bridgeReadyTimer})),
 alerts:[...document.querySelectorAll('[role=alert]')].map(x=>({live:x.getAttribute('aria-live'),text:x.textContent}))
});
</script></body>`;
}

const panelHtml = `<!doctype html><meta charset="utf-8"><body><canvas id="chartCanvas" width="320" height="180"></canvas>
<script>
window.__TALARIA_CHART_BUILD_ID=new URLSearchParams(location.search).get('v');
window.__loads=0;window.__loadAt=0;window.__replayStarts=0;window.__wsCount=0;
window.WebSocket=function(){window.__wsCount++};
window.MultichartGuards={VERSION:'fixture'};
window.MultichartBridge={installBridge:function(){
 parent.postMessage({type:'bridge-ready',source:new URLSearchParams(location.search).get('panelId')},'*');
 return {};
}};
window.chart={
 data:[],rawData:[],currentFileId:'25',currentTimeframe:'1m',
 backtestingSession:{startDate:'2025-01-01',endDate:'2025-01-02'},
 replaySystem:{isActive:false,enterReplayMode:function(){window.__replayStarts++}},
 loadFileData:function(){return this.loadMultichartPanelFile()},
 loadMultichartPanelFile:function(){
   window.__loads++;window.__loadAt=parent.performance.now();
   const state=parent.chart._multichartHostRestoreState;
   if(!state||state.status!=='ready')return new Promise(()=>{});
   this.data=[{t:1,o:1,h:2,l:0,c:1,v:1}];this.rawData=this.data.slice();
   const c=document.getElementById('chartCanvas'),ctx=c.getContext('2d');ctx.fillStyle='#35c';ctx.fillRect(0,0,c.width,c.height);
   dispatchEvent(new CustomEvent('chartDataLoaded',{detail:{chart:this,fileId:'25'}}));
   return Promise.resolve();
 },
 render:function(){},_multichartMirrorViewportFromHost:function(){return false}
};
</script><script src="/embed.js"></script></body>`;

async function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
      const body = parentHtml(
        url.searchParams.get('off') === '1',
        url.searchParams.get('fail') === '1',
        url.searchParams.get('timeout') === '1',
      );
      res.writeHead(200, { 'content-type': 'text/html' }); res.end(body); return;
    }
    if (url.pathname === '/panel.html') {
      res.writeHead(200, { 'content-type': 'text/html' }); res.end(panelHtml); return;
    }
    const asset = assets.get(url.pathname);
    if (asset) { res.writeHead(200, { 'content-type': asset[0] }); res.end(asset[1]); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

async function waitSnapshot(page) {
  await page.waitForFunction(() => window.__snapshot && document.querySelectorAll('iframe').length === 3, { timeout: 10_000 });
  await new Promise((resolve) => setTimeout(resolve, 700));
  return page.evaluate(() => window.__snapshot());
}

test('actual product host methods + manager + embed are RED OFF and 6/6 GREEN ON', { timeout: 120_000 }, async () => {
  const { server, origin } = await startServer();
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 30_000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-background-networking'],
  });
  try {
    const page = await browser.newPage();
    const browserErrors = [];
    page.on('pageerror', (err) => browserErrors.push(String(err.stack || err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') browserErrors.push(msg.text());
    });
    await page.goto(`${origin}/?off=1`, { waitUntil: 'load', timeout: 30_000 });
    let red;
    try {
      red = await waitSnapshot(page);
    } catch (error) {
      throw new Error(`${error.message}; browserErrors=${JSON.stringify(browserErrors)}`);
    }
    assert.equal(red.frames.length, 3);
    assert.ok(
      red.frames.every((f) => f.loads === 1 && f.bars === 0 && f.opacity === '0'),
      JSON.stringify(red),
    );
    assert.ok(red.frames.every((f) => f.loadAt < red.hostFinishAt), 'OFF must load before authoritative completion');

    const greens = [];
    for (let cycle = 1; cycle <= 6; cycle += 1) {
      await page.goto(`${origin}/?cycle=${cycle}`, { waitUntil: 'load', timeout: 30_000 });
      const snap = await waitSnapshot(page);
      greens.push(snap);
      assert.equal(snap.build, buildId);
      assert.equal(snap.hostState.status, 'ready');
      assert.equal(snap.frames.length, 3);
      assert.ok(snap.frames.every((f) => f.build === buildId && f.loads === 1 && f.bars === 1 && f.opacity === '1'));
      assert.ok(snap.frames.every((f) => f.canvasAlpha > 0));
      assert.ok(snap.frames.every((f) => JSON.stringify(f.data) === JSON.stringify(snap.hostData)));
      assert.ok(snap.frames.every((f) => f.loadAt >= snap.hostFinishAt), 'ON panel load must follow host completion');
      assert.ok(snap.frames.every((f) => f.replayStarts === 0 && f.ws === 0));
      assert.equal(snap.ws, 0);
      assert.equal(snap.adds, snap.removes, 'restore listeners must be fully removed');
      assert.ok(snap.manager.every((entry) => entry.ready && !entry.timerActive));
      assert.deepEqual(snap.alerts, []);
    }
    assert.equal(greens.length, 6);
    const removed = await page.evaluate(() => {
      window.__mcManager.removeChart('B');
      return {
        hasB: window.__mcManager.charts.has('B'),
        frameB: !!document.querySelector('iframe[data-chart-id="B"]'),
      };
    });
    assert.deepEqual(removed, { hasB: false, frameB: false });

    await page.goto(`${origin}/?fail=1`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll('[role=alert]').length === 3, { timeout: 10_000 });
    const failed = await page.evaluate(() => window.__snapshot());
    assert.equal(failed.frames.length, 3);
    assert.ok(failed.frames.every((f) => f.opacity === '0' && f.loads === 0 && f.bars === 0));
    assert.equal(failed.alerts.length, 3);
    assert.ok(failed.alerts.every((a) => a.live === 'assertive' && /host session restore failed/.test(a.text)));

    await page.goto(`${origin}/?timeout=1`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll('[role=alert]').length === 3, { timeout: 35_000 });
    const timedOut = await page.evaluate(() => window.__snapshot());
    assert.ok(timedOut.frames.every((f) => f.opacity === '0' && f.loads === 0 && f.bars === 0));
    assert.ok(timedOut.alerts.every((a) => a.live === 'assertive' && /timed out/.test(a.text)));
    assert.equal(timedOut.adds, timedOut.removes);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('terminal product manager failure is an assertive live alert contract', () => {
  const jsx = fs.readFileSync(path.join(repoRoot, 'chart v 1.4', 'talaria-design', 'src', 'MultichartGrid.jsx'), 'utf8');
  assert.match(jsx, /className="multichart-loading-overlay multichart-error-overlay"[\s\S]*?role="alert"/);
  assert.match(jsx, /role="alert"[\s\S]*?aria-live="assertive"[\s\S]*?aria-atomic="true"/);
});
