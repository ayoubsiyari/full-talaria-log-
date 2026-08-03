#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  dismissCookieBanner,
  loadPuppeteer,
  uiLoginDeployed,
  waitForDistV9SingleReady,
} from '../scripts/lib/heap-cycle-browser.mjs';
import { reactParityUrlWithLayout } from '../chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';
import {
  matchCoordinatePairs,
  readCandidateCoordinates,
} from '../scripts/lib/a3-speed-fill-journal-parity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function argOf(name, fallback = '') {
  const pref = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pref));
  if (hit) return hit.slice(pref.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const ORIGIN = String(argOf('origin', process.env.TEST_VPS_URL || 'http://31.97.192.82:3000')).replace(/\/$/, '');
const EXPECT = {
  badge: String(argOf('expect-badge', process.env.TAL_PO_UI_EXPECT_BADGE || '20260803b126')),
  digest: String(argOf('expect-digest', process.env.TAL_PO_UI_EXPECT_DIGEST || '4c51e267ffc08e4b12c8bd4af481097c')),
  sourceCommitSha: String(argOf('expect-sha', process.env.TAL_PO_UI_EXPECT_SHA || '5dceb636891f6df58bf7f746dabd37c2d3863838')),
};
const OUT = path.resolve(repoRoot, argOf('out', '.scratch/w1-tick-entry-duration-live.json'));
const RUN_MS = Number(argOf('run-ms', '35000')) || 35000;
const EMAIL = String(process.env.TEST_EMAIL || '').trim();
const PASSWORD = String(process.env.TEST_PASSWORD || '').trim();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function quantile(values, q) {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const idx = Math.min(xs.length - 1, Math.max(0, Math.floor((xs.length - 1) * q)));
  return xs[idx];
}

async function framesWithReplay(page) {
  const out = [];
  for (const frame of page.frames()) {
    let ok = false;
    try {
      ok = await frame.evaluate(() => !!(window.chart && window.chart.replaySystem));
    } catch (_) {
      ok = false;
    }
    if (ok) out.push(frame);
  }
  return out;
}

async function main() {
  const surface = await readCandidateCoordinates(ORIGIN);
  const identity = matchCoordinatePairs(surface, EXPECT);
  if (!identity.ok) {
    throw new Error(`candidate mismatch ${JSON.stringify(identity)}`);
  }
  if (!EMAIL || !PASSWORD) throw new Error('TEST_EMAIL/TEST_PASSWORD required');

  const puppeteer = await loadPuppeteer({
    script: 'w1-tick-entry-duration-live',
    artifact: OUT,
  });
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 300000,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 960 },
  });
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(180000);
    await page.setCacheEnabled(false);
    await uiLoginDeployed(page, ORIGIN, EMAIL, PASSWORD);
    await page.evaluate(() => {
      const ticketFiles = [
        { ticker: 'EURUSD', fileId: 25 },
        { ticker: 'GBPUSD', fileId: 27 },
        { ticker: 'AUDUSD', fileId: 22 },
        { ticker: 'USDJPY', fileId: 29 },
      ];
      const instruments = {};
      ticketFiles.forEach((file, index) => {
        instruments[file.ticker] = {
          ticker: file.ticker,
          fileId: file.fileId,
          tradable: index === 0,
          view_only: index !== 0,
        };
        if (index !== 0) instruments[file.ticker].tradable = false;
      });
      localStorage.setItem('_uid', '1');
      localStorage.setItem('u1_backtestingSession', JSON.stringify({
        type: 'standard',
        startBalance: 10000,
        session_id: `w1-tick-diag-${Date.now()}`,
        instruments,
        supporting_tickers: ticketFiles.slice(1).map((f) => f.ticker),
      }));
    });

    const url = reactParityUrlWithLayout(`${ORIGIN}/chart/dist-v9/index.html?mode=backtest&w1=tick-diag`, '4');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await dismissCookieBanner(page, { timeoutMs: 3000 }).catch(() => {});
    await waitForDistV9SingleReady(page, 90000).catch(() => {});
    await sleep(4000);

    let frames = await framesWithReplay(page);
    if (!frames.length) throw new Error('NO_REPLAY_FRAMES');

    // Pin focus once at the start. Do not touch focus after this point.
    await page.mouse.click(360, 240).catch(() => {});
    await sleep(500);

    frames = await framesWithReplay(page);
    for (const frame of frames) {
      await frame.evaluate(() => {
        const ch = window.chart;
        const rs = ch && ch.replaySystem;
        if (!rs || rs.__w1TickDiagInstalled) return;
        const panelId = (() => {
          try { return ch._getMultichartPanelId?.() || ch.panelId || ch._panelId || null; } catch (_) { return null; }
        })();
        const diag = window.__w1TickDiag = {
          panelId,
          frameUrl: String(location.href),
          installedAt: performance.now(),
          candle: [],
          animate: [],
          lastCandleEntryAt: null,
          lastAnimateEntryAt: null,
        };
        const wrap = (name, bucket, lastKey) => {
          const prev = rs[name];
          if (typeof prev !== 'function') return;
          rs[name] = function w1WrappedTick(...args) {
            const entryAt = performance.now();
            const intervalMs = diag[lastKey] == null ? null : entryAt - diag[lastKey];
            diag[lastKey] = entryAt;
            const row = {
              method: name,
              panelId,
              entryAt,
              intervalMs,
              beforeTs: Number(this.replayTimestamp),
              beforeIndex: Number(this.currentIndex),
              speed: this.speed,
              stepSeconds: typeof this.getStepSeconds === 'function' ? this.getStepSeconds() : null,
              playbackMode: typeof this.getPlaybackMode === 'function' ? this.getPlaybackMode() : null,
              timeframe: ch.currentTimeframe || null,
            };
            const t0 = performance.now();
            try {
              return prev.apply(this, args);
            } finally {
              row.durationMs = performance.now() - t0;
              row.afterTs = Number(this.replayTimestamp);
              row.afterIndex = Number(this.currentIndex);
              bucket.push(row);
            }
          };
        };
        wrap('_runCandlePlaybackTick', diag.candle, 'lastCandleEntryAt');
        wrap('animateTick', diag.animate, 'lastAnimateEntryAt');
        rs.__w1TickDiagInstalled = true;
      });
    }

    const start = await Promise.all(frames.map((frame) => frame.evaluate(() => {
      const ch = window.chart;
      const rs = ch && ch.replaySystem;
      if (!rs) return { ok: false, reason: 'NO_RS' };
      try { rs.pause?.(); } catch (_) {}
      try { rs.setPlaybackMode?.('candle', { restartPlayback: false }); } catch (_) {}
      try { rs.setStepSeconds?.(1); } catch (_) {}
      try { rs.setSpeed?.(10); } catch (_) {}
      try { rs.play?.(); } catch (e) { return { ok: false, reason: String(e?.message || e) }; }
      return {
        ok: true,
        panelId: (() => { try { return ch._getMultichartPanelId?.() || ch.panelId || ch._panelId || null; } catch (_) { return null; } })(),
        mode: rs.getPlaybackMode?.(),
        speed: rs.speed,
        stepSeconds: rs.getStepSeconds?.(),
        tf: ch.currentTimeframe || null,
        currentIndex: rs.currentIndex,
        replayTimestamp: rs.replayTimestamp,
      };
    })));

    await sleep(RUN_MS);

    const diagnostics = await Promise.all(frames.map((frame) => frame.evaluate(() => {
      const ch = window.chart;
      const rs = ch && ch.replaySystem;
      return {
        panelId: (() => { try { return ch?._getMultichartPanelId?.() || ch?.panelId || ch?._panelId || null; } catch (_) { return null; } })(),
        tf: ch?.currentTimeframe || null,
        url: String(location.href),
        isPlaying: !!rs?.isPlaying,
        mode: rs?.getPlaybackMode?.() || null,
        speed: rs?.speed ?? null,
        stepSeconds: rs?.getStepSeconds?.() ?? null,
        currentIndex: rs?.currentIndex ?? null,
        replayTimestamp: rs?.replayTimestamp ?? null,
        diag: window.__w1TickDiag || null,
      };
    })));

    const candle = diagnostics.flatMap((d) => (d.diag?.candle || []).map((r) => ({ ...r, panelId: d.panelId || r.panelId })));
    const animate = diagnostics.flatMap((d) => (d.diag?.animate || []).map((r) => ({ ...r, panelId: d.panelId || r.panelId })));
    const intervals = candle.map((r) => r.intervalMs).filter((v) => Number.isFinite(v));
    const durations = candle.map((r) => r.durationMs).filter((v) => Number.isFinite(v));
    const report = {
      signature: 'W1-TICK-ENTRY-DURATION-LIVE-V1',
      at: new Date().toISOString(),
      origin: ORIGIN,
      surface,
      identity,
      runMs: RUN_MS,
      start,
      counts: { replayFrames: frames.length, candle: candle.length, animate: animate.length },
      summary: {
        candleEntryIntervalMs: {
          count: intervals.length,
          p50: quantile(intervals, 0.5),
          p90: quantile(intervals, 0.9),
          max: intervals.length ? Math.max(...intervals) : null,
        },
        candleEntryDurationMs: {
          count: durations.length,
          p50: quantile(durations, 0.5),
          p90: quantile(durations, 0.9),
          max: durations.length ? Math.max(...durations) : null,
        },
      },
      diagnostics,
      samples: {
        candle: candle.slice(-40),
        animate: animate.slice(-40),
      },
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report.summary, null, 2));
    console.error(`wrote ${OUT}`);
  } finally {
    await browser.close().catch(() => {});
  }
}

await main();
