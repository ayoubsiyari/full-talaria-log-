#!/usr/bin/env node
/**
 * BROWSER-SURVIVAL-CANARY — is something outside my process killing Chrome?
 *
 * Two runs have now died the same way. The ten-hour soak stopped at sample 4 with no exception path taken,
 * which means the node process was killed rather than failing. The RESET-01 reload arm died two minutes
 * into its heavy phase with "Session closed. Most likely the browser has been closed" — a BROWSER-level
 * failure, not a renderer one, at 1,116 MB with 7 GB of RAM free. Another manager's release rehearsal was
 * running 21 Chrome processes on this machine an hour ago.
 *
 * This canary does nothing except exist. No login, no chart, no trades, no playback — just a blank browser
 * reporting every fifteen seconds. If it dies anyway, the cause is external and no measurement I take is
 * safe until that is fixed. If it survives, the fault is in my own workload and I own it.
 */
import fs from 'node:fs';

import { loadPuppeteer } from './lib/heap-cycle-browser.mjs';

const OUT = 'c:\\Users\\user\\Desktop\\talaria1\\_evidence\\manager-C\\BROWSER-SURVIVAL-CANARY-20260731.json';
const MINUTES = Number((process.argv.find((a) => a.startsWith('--minutes=')) || '').split('=')[1] || 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const report = {
  signature: 'BROWSER-SURVIVAL-CANARY-V1',
  artifactFile: 'BROWSER-SURVIVAL-CANARY-20260731.json',
  ruling: 'RESET-01 — separating an external killer from my own workload before blaming either',
  bfcacheState: 'not applicable — blank page, no navigation under test',
  question: 'Does a Chrome that does NOTHING survive on this machine for the length of a measurement?',
  plannedMinutes: MINUTES,
  startedAtIso: new Date().toISOString(),
  probes: [],
};
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

(async () => {
  let browser = null;
  try {
    const puppeteer = await loadPuppeteer();
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    report.browserPid = browser.process()?.pid ?? null;
    const page = await browser.newPage();
    await page.goto('about:blank');
    save();

    const deadline = Date.now() + MINUTES * 60_000;
    let n = 0;
    while (Date.now() < deadline) {
      n += 1;
      const row = { probe: n, minutes: +((Date.now() - (new Date(report.startedAtIso)).getTime()) / 60_000).toFixed(2) };
      try {
        row.title = await page.title();
        row.connected = browser.connected ?? browser.isConnected?.() ?? null;
        row.targets = (await browser.targets()).length;
        row.alive = true;
      } catch (err) {
        row.alive = false;
        row.why = String(err?.message || err).slice(0, 160);
      }
      report.probes.push(row);
      save();
      console.error(`[canary] #${n} ${row.minutes}min alive=${row.alive} targets=${row.targets ?? '-'}${row.why ? ' WHY: ' + row.why : ''}`);
      if (!row.alive) break;
      await sleep(15_000);
    }
    report.status = 'OK';
  } catch (err) {
    report.status = 'VOID';
    report.void = String(err?.message || err).slice(0, 200);
  } finally {
    try { await browser?.close?.(); } catch { /* gone */ }
  }

  const died = report.probes.find((p) => !p.alive);
  const lastAlive = [...report.probes].reverse().find((p) => p.alive);
  report.verdict = died
    ? `EXTERNAL KILLER CONFIRMED: a Chrome doing NOTHING died after ${died.minutes} minutes — "${died.why}". No workload of mine was running, so my measurements are being destroyed by something else on this machine. This is a P0 for whoever owns the cleanup.`
    : `Chrome doing nothing SURVIVED ${lastAlive?.minutes ?? 0} minutes across ${report.probes.length} probes. An external killer is NOT indicated, so the deaths belong to my own workload and I own them.`;
  report.signatureFilenameCheck = OUT.endsWith(report.artifactFile) ? 'PASS' : 'FAIL';
  save();
  console.error(`\n${report.verdict}`);
  console.error(`artifact ${OUT}`);
})();
