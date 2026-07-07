import { startServer } from './serve.mjs';
import { launchBrowser, bootLayout, readPanels, hostReplayEnter, broadcastCmd, hostReplaySeek, sleep } from './harness-lib.mjs';

const srv = await startServer(0);
const browser = await launchBrowser({});
const boot = await bootLayout(browser, srv, { pair: 'same', panels: 4, tf: '1m' });
const { page } = boot;

const hostInfo = await page.evaluate(() => {
  const c = window.chart;
  const rs = c && c.replaySystem;
  const d = c.data || [];
  return {
    dataLen: d.length,
    dataFirst: d.length ? d[0].t : null,
    dataLast: d.length ? d[d.length - 1].t : null,
  };
});
console.log('HOST before replay:', JSON.stringify(hostInfo));

const ts0 = await page.evaluate(() => {
  const d = window.chart && window.chart.data;
  return Number(d[Math.floor(d.length * 0.6)].t);
});
console.log('ts0 =', ts0);

await hostReplayEnter(page, ts0);
await broadcastCmd(page, 'replayEnter', { timestamp: ts0 });
await sleep(1500);

const masters = await page.evaluate(() => {
  const c = window.chart;
  const rs = c && c.replaySystem;
  const full = rs && rs.fullRawData;
  return {
    isActive: rs && rs.isActive,
    replayTs: rs && rs.replayTimestamp,
    fullLen: full ? full.length : 0,
    fullFirst: full && full.length ? full[0].t : null,
    fullLast: full && full.length ? full[full.length - 1].t : null,
  };
});
console.log('HOST replay master:', JSON.stringify(masters));

// probe iframe B master
const bMaster = await page.frames().filter(f => f.url().includes('chart-embed.html'))[0].evaluate(() => {
  const c = window.chart;
  const rs = c && c.replaySystem;
  const full = rs && rs.fullRawData;
  return {
    isActive: rs && rs.isActive,
    replayTs: rs && rs.replayTimestamp,
    fullLen: full ? full.length : 0,
    fullFirst: full && full.length ? full[0].t : null,
    fullLast: full && full.length ? full[full.length - 1].t : null,
  };
});
console.log('PANEL B replay master:', JSON.stringify(bMaster));

// Now advance like H-S8 and watch where the host stalls.
let ts = ts0;
const perSecondMs = 60 * 60_000;
for (let sec = 0; sec < 15; sec++) {
  ts += perSecondMs;
  await hostReplaySeek(page, ts);
  await broadcastCmd(page, 'replayTick', { timestamp: ts });
  await sleep(700);
  const p = await readPanels(page);
  const heads = ['A','B','C','D'].map(i => p[i]?.replayTs);
  console.log(`sec${sec} target=${ts} heads=${heads.join('/')} hostFullLast=${await page.evaluate(()=>{const rs=window.chart.replaySystem;const f=rs&&rs.fullRawData;return f&&f.length?f[f.length-1].t:null;})}`);
}

await boot.close();
await browser.close();
await srv.close();
