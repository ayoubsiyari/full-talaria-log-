#!/usr/bin/env node
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { startServer } from '../../../chart v 1.4/chart/multichart-prod/harness/serve.mjs';

const require = createRequire(new URL('../../../chart v 1.4/chart/multichart-prod/harness/package.json', import.meta.url));
const puppeteer = require('puppeteer');
const repetitions = Math.max(10, Number(process.env.MC_RESTORE_REPETITIONS || 10));
const server = await startServer(0);
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

try {
  const page = await browser.newPage();
  const url = `${server.url}/harness/host.html?panels=4&pair=same&mcRestore=1`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const expected = await page.evaluate(() => {
    const passport = structuredClone(window.__harnessConfig.restorePassport);
    localStorage.setItem('chart_panel_state', JSON.stringify(passport));
    localStorage.setItem('mc_restore_expected_passport', JSON.stringify(passport));
    return passport;
  });
  await page.goto(`${server.url}/harness/host.html?panels=4&pair=same&mcRestore=0`,
    { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const manager = window.__harnessManager;
    return manager?.charts?.size === 4 && [...manager.charts.values()].every((entry) => {
      const win = entry.host ? window : entry.frame?.contentWindow;
      return Array.isArray(win?.chart?.data) && win.chart.data.length > 0;
    });
  }, { timeout: 10_000 });
  const offFiles = await page.evaluate(() => [...window.__harnessManager.charts.values()]
    .map((entry) => String((entry.host ? window : entry.frame.contentWindow).chart.currentFileId)));
  const offRed = offFiles.join(',') !== expected.panels.map((panel) => panel.fileId).join(',');
  const runs = [];
  for (let index = 0; index < repetitions; index += 1) {
    if (index === 0) await page.goto(url, { waitUntil: 'domcontentloaded' });
    else await page.reload({ waitUntil: 'domcontentloaded' });
    try {
      await page.waitForFunction(() => {
      const manager = window.__harnessManager;
      if (!manager || manager.charts.size !== 4) return false;
      const passport = JSON.parse(localStorage.getItem('mc_restore_expected_passport') || 'null');
      if (!passport?.sessionId || !Array.isArray(passport.panels)) return false;
      const entries = [...manager.charts.values()];
      const generation = manager._mcRestoreGeneration;
      return manager._mcRestoreCompletedGeneration === generation
        && entries.every((entry, panelIndex) => {
        const win = entry.host ? window : entry.frame?.contentWindow;
        const chart = win?.chart;
        const wanted = passport.panels[panelIndex];
        return wanted && chart
          && String(chart.currentFileId) === wanted.fileId
          && String(chart.currentSymbol) === wanted.symbol
          && String(chart.activeTradingSessionId) === passport.sessionId
          && String(chart.currentTimeframe) === wanted.timeframe
          && Array.isArray(chart.data) && chart.data.length > 0
          && (entry.host || (entry._mcRestoreAppliedGeneration === generation
            && entry._mcRestoreResult?.generation === generation));
      });
      }, { timeout: 10_000 });
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        expected: localStorage.getItem('mc_restore_expected_passport'),
        generation: window.__harnessManager?._mcRestoreGeneration,
        completed: window.__harnessManager?._mcRestoreCompletedGeneration,
        logs: window.__mgrLog?.filter((entry) => /MC_RESTORE/.test(entry.text)),
        panels: [...(window.__harnessManager?.charts?.values() || [])].map((entry) => {
          const chart = (entry.host ? window : entry.frame?.contentWindow)?.chart;
          return {
            id: entry.id, host: !!entry.host, fileId: chart?.currentFileId,
            ticker: chart?.currentSymbol, sessionId: chart?.activeTradingSessionId,
            timeframe: chart?.currentTimeframe, applied: entry._mcRestoreAppliedGeneration,
            result: entry._mcRestoreResult, failure: entry._mcRestoreFailure,
          };
        }),
      }));
      throw new Error(`strict restore deadline: ${JSON.stringify(diagnostics)}`, { cause: error });
    }
    runs.push(await page.evaluate(() => [...window.__harnessManager.charts.values()].map((entry) => {
      const win = entry.host ? window : entry.frame.contentWindow;
      const chart = win.chart;
      const canvas = win.document.querySelector('#chartCanvas');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let nonblack = 0;
      const step = Math.max(4, Math.floor(pixels.length / 32768 / 4) * 4);
      for (let i = 0; i < pixels.length; i += step) {
        if (pixels[i] || pixels[i + 1] || pixels[i + 2]) nonblack += 1;
      }
      return {
        id: entry.id,
        fileId: String(chart.currentFileId),
        ticker: String(chart.currentSymbol),
        sessionId: String(chart.activeTradingSessionId),
        timeframe: String(chart.currentTimeframe),
        generation: window.__harnessManager._mcRestoreGeneration,
        appliedGeneration: entry.host
          ? window.__harnessManager._mcRestoreCompletedGeneration
          : entry._mcRestoreAppliedGeneration,
        loadResult: entry.host ? window.__harnessHostLoadResult : entry._mcRestoreResult,
        bars: chart.data.length,
        nonblack,
      };
    })));
  }
  const strictIdentity = (panel, wanted, generation) => {
    const values = [panel.ticker, panel.fileId, panel.sessionId, panel.timeframe];
    if (values.some((value) => !value || value === 'null')) return false;
    const result = panel.loadResult || {};
    return panel.fileId === wanted.fileId
      && panel.ticker === wanted.symbol
      && panel.sessionId === expected.sessionId
      && panel.timeframe === wanted.timeframe
      && panel.generation === generation
      && panel.appliedGeneration === generation
      && result.fileId === wanted.fileId
      && result.ticker === wanted.symbol
      && result.sessionId === expected.sessionId
      && result.timeframe === wanted.timeframe
      && (panel.id === 'A' || result.generation === generation)
      && panel.bars > 0 && panel.nonblack > 0;
  };
  const pass = runs.every((run) => {
    const generation = run[0]?.generation;
    return Number.isFinite(generation)
      && run.every((panel, index) => strictIdentity(panel, expected.panels[index], generation));
  });
  const vacuous = { bars: 1, nonblack: 1, ticker: 'null', fileId: '25', sessionId: '', timeframe: '1h' };
  const swapped = { ...runs.at(-1)[1], fileId: expected.panels[2].fileId };
  const oldVacuousProofPasses = vacuous.bars > 0 && vacuous.nonblack > 0;
  const negativeProofs = {
    nullIdentityRejected: !strictIdentity(vacuous, expected.panels[0], 1),
    swappedIdentityRejected: !strictIdentity(swapped, expected.panels[1], swapped.generation),
  };
  const evidence = {
    repetitions, expected, offRed, offFiles, pass, oldVacuousProofPasses,
    negativeProofs, last: runs.at(-1),
  };
  fs.writeFileSync(new URL('./mc-restore-local-identity.json', import.meta.url),
    `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
  if (!offRed || !pass || !oldVacuousProofPasses
      || !Object.values(negativeProofs).every(Boolean)) process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
