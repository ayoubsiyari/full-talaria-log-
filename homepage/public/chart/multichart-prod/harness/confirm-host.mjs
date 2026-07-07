// One-off confirmation that tile A is a LIVE in-process host and that a
// same-pair panel mirrors it without a self /bars fetch. Not part of the suite.
import { startServer } from './serve.mjs';
import { launchBrowser, bootLayout, readPanels } from './harness-lib.mjs';

const srv = await startServer(0);
const browser = await launchBrowser({});
try {
  const boot = await bootLayout(browser, srv, { pair: 'same', panels: 4, tf: '1m' });
  const page = boot.page;

  const hostInfo = await page.evaluate(() => {
    const ch = window.chart;
    const mgr = window.__harnessManager;
    const hostEntry = mgr && mgr.charts && mgr.charts.get('A');
    return {
      hasWindowChart: !!ch,
      hostDiagPanelId: ch && ch._mcDiag ? ch._mcDiag.panelId : null,
      hostFileId: ch ? String(ch.currentFileId) : null,
      hostDataLen: ch && Array.isArray(ch.data) ? ch.data.length : 0,
      bridgeInstalledOnWindowChart: !!window.__harnessHostBridge
        && typeof window.__harnessHostBridge.deliver === 'function',
      // installBridge monkey-patches broadcastCrosshairSync; presence of the
      // bridge's global sync-apply hook confirms it wired onto window.chart.
      syncApplyHook: typeof window.__multichartSyncApply === 'function',
      mgrKnowsAasHost: !!(hostEntry && hostEntry.host === true && hostEntry.directDeliver),
      mgrChartIds: mgr ? Array.from(mgr.charts.keys()) : [],
    };
  });

  const panels = await readPanels(page);
  const proof = {
    hostBridge: hostInfo,
    hostFetches: panels.A ? panels.A.fetches : null,
    hostOwnerFetches: panels.A ? panels.A.ownerFetches : null,
    peerSelfFetches: ['B', 'C', 'D'].map((id) => ({ id, fetches: panels[id] ? panels[id].fetches : null })),
    barsEqualAtBoot: ['A', 'B', 'C', 'D'].map((id) => ({ id, firstBarT: panels[id] ? panels[id].firstBarT : null })),
  };
  console.log('CONFIRM ' + JSON.stringify(proof, null, 2));
  await boot.close();
} finally {
  await browser.close();
  await srv.close();
}
