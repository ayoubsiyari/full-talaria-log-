#!/usr/bin/env node
/**
 * M1 load-transient harness.
 *
 * This is intentionally separate from the resident-screenshot harness. Resident
 * screenshots ask what remains after the page settles. The load transient asks
 * what decodes during routine navigation, before stability can hide the peak.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const bAuthRoutePath = resolve(root, '../_evidence/manager-B/m20-j1/talaria-auth-route.mjs');
const puppeteer = require(resolve(root, 'chart v 1.4/chart/multichart-prod/harness/node_modules/puppeteer'));

export const M1_LOAD_TRANSIENT_SIGNATURE = 'TALARIA_M1_B120_LOAD_TRANSIENT_V1';
export const M1_RESIDENT_SCREENSHOTS_SIGNATURE = 'TALARIA_M1_B120_RESIDENT_SCREENSHOTS_V1';

export const B_M1_MEASUREMENT_STAMP = Object.freeze({
  sourceHandoff:
    'manager-b-plan3/docs/plan3/HANDOFF-B-TO-D-M1-RAN-ON-B120-AUTH-IS-SOLVED-AND-THE-HARNESS-MISSES-THE-PEAK-20260731-1935.md',
  sourceEvidence: '_evidence/manager-B/m20-j1/results/m1-peak-capture-result.json',
  measuredAt: '2026-07-31T18:23:36.836Z',
  buildId: '20260731b120',
  sessionId: 936,
  fileId: 677,
  barCount: 6242,
  tradeCount: 182,
  screenshotCount: 395,
});

export const B_HOST_TRANSIENT_LOWER_BOUND = Object.freeze({
  sourceHandoff: B_M1_MEASUREMENT_STAMP.sourceHandoff,
  measuredAt: B_M1_MEASUREMENT_STAMP.measuredAt,
  buildId: B_M1_MEASUREMENT_STAMP.buildId,
  finalUrl: 'http://31.97.192.82:3000/chart/dist-v9/index.html?mode=backtest&sessionId=936&fileId=677',
  measurementStamp: B_M1_MEASUREMENT_STAMP,
  journal: {
    status: 200,
    trades: B_M1_MEASUREMENT_STAMP.tradeCount,
    screenshots: B_M1_MEASUREMENT_STAMP.screenshotCount,
  },
  appReady: {
    label: 'app-ready',
    imageCount: 205,
    dataUrlImages: 28,
    fullResolutionImages: 29,
    thumbnailImages: 160,
    decodedPixelFloorBytes: Math.round(141.57 * 1024 * 1024),
    decodedPixelFloorMB: 141.57,
    largestSingleDecodedBytes: 7_551_884,
  },
  plus1500ms: {
    label: '+1.5s',
    imageCount: 193,
    dataUrlImages: 16,
    fullResolutionImages: 17,
    thumbnailImages: 160,
    decodedPixelFloorBytes: Math.round(83.48 * 1024 * 1024),
    decodedPixelFloorMB: 83.48,
  },
  steady: {
    label: '+6s-stable',
    imageCount: 177,
    dataUrlImages: 0,
    fullResolutionImages: 1,
    thumbnailImages: 160,
    decodedPixelFloorBytes: 6_029_312,
    decodedPixelFloorMB: 5.75,
    journalLikeImages: 0,
  },
});

function decodedMB(bytes) {
  return Math.round((Number(bytes || 0) / 1024 / 1024) * 100) / 100;
}

export function classifyResidentScreenshots({ surface, journal, buildId }) {
  if (!String(buildId || '').includes('b120')) return { status: 'WAITING', reason: 'build-not-b120' };
  if (!journal || journal.status !== 200 || journal.trades < 1 || journal.screenshots < 1) {
    return { status: 'UNPROVEN', reason: 'journal-bearing-session-not-proven' };
  }
  if (!surface) return { status: 'UNPROVEN', reason: 'resident-surface-missing' };
  if (surface.fullResolutionImages > 1) {
    return { status: 'RED', reason: 'resident-full-resolution-images-still-present' };
  }
  if (decodedMB(surface.decodedPixelFloorBytes) > 10) {
    return { status: 'RED', reason: 'resident-decoded-floor-too-high' };
  }
  if (surface.thumbnailImages >= 100 && surface.fullResolutionImages <= 1) {
    return { status: 'PASSED', reason: 'resident-screenshot-surface-settled-to-thumbnails' };
  }
  return { status: 'UNPROVEN', reason: 'resident-thumbnail-surface-not-established' };
}

export function classifyLoadTransient(samples, opts = {}) {
  const thresholdMB = opts.thresholdMB ?? 50;
  const rows = (samples || []).filter(Boolean);
  if (!rows.length) return { status: 'UNPROVEN', reason: 'no-navigation-start-samples' };
  const peak = rows.reduce((best, row) => (
    Number(row.decodedPixelFloorBytes || 0) > Number(best.decodedPixelFloorBytes || 0) ? row : best
  ), rows[0]);
  const peakMB = decodedMB(peak.decodedPixelFloorBytes);
  if (peak.fullResolutionImages > 1 && peakMB >= thresholdMB) {
    return {
      status: 'NEW_DEFECT',
      reason: 'load-transient-full-resolution-images',
      lowerBound: true,
      peak,
      peakDecodedMB: peakMB,
      thresholdMB,
    };
  }
  return {
    status: 'PASSED',
    reason: 'no-routine-load-transient-above-threshold',
    peak,
    peakDecodedMB: peakMB,
    thresholdMB,
  };
}

export function runBHostSplitVerdicts() {
  const resident = classifyResidentScreenshots({
    surface: B_HOST_TRANSIENT_LOWER_BOUND.steady,
    journal: B_HOST_TRANSIENT_LOWER_BOUND.journal,
    buildId: B_HOST_TRANSIENT_LOWER_BOUND.buildId,
  });
  const transient = classifyLoadTransient([
    B_HOST_TRANSIENT_LOWER_BOUND.appReady,
    B_HOST_TRANSIENT_LOWER_BOUND.plus1500ms,
    B_HOST_TRANSIENT_LOWER_BOUND.steady,
  ]);
  return {
    signature: M1_LOAD_TRANSIENT_SIGNATURE,
    residentSignature: M1_RESIDENT_SCREENSHOTS_SIGNATURE,
    source: B_HOST_TRANSIENT_LOWER_BOUND.sourceHandoff,
    buildId: B_HOST_TRANSIENT_LOWER_BOUND.buildId,
    finalUrl: B_HOST_TRANSIENT_LOWER_BOUND.finalUrl,
    journal: B_HOST_TRANSIENT_LOWER_BOUND.journal,
    residentScreenshots: {
      verdict: resident,
      steadySurface: B_HOST_TRANSIENT_LOWER_BOUND.steady,
      boardVerdict: 'PASSED',
      statement: 'Resident screenshots passed on b120 real app: 5.75 MB steady floor, 1 full-res, 160 thumbs, 182 journal trades.',
    },
    loadTransient: {
      verdict: transient,
      samples: [
        B_HOST_TRANSIENT_LOWER_BOUND.appReady,
        B_HOST_TRANSIENT_LOWER_BOUND.plus1500ms,
        B_HOST_TRANSIENT_LOWER_BOUND.steady,
      ],
      boardVerdict: 'NEW_DEFECT',
      statement:
        'Routine page load decodes a lower-bound 141.57 MB transient before the resident surface settles; sample begins at app-ready, so true peak may be higher.',
    },
    rendererMemoryLead: {
      status: 'live-not-confirmed',
      statement:
        'The 4.85 MB-per-screenshot lead remains live for C V8/isolate attribution, but it is not confirmed as the renderer residual cause.',
    },
  };
}

async function collectImageSurface(page, elapsedMs) {
  const rows = await page.evaluate(() => Array.from(document.images || []).map((img) => {
    const src = String(img.currentSrc || img.src || '');
    return {
      naturalWidth: img.naturalWidth || 0,
      naturalHeight: img.naturalHeight || 0,
      srcKind: src.startsWith('data:') ? 'data-url' : src ? 'url' : 'empty',
    };
  })).catch(() => []);
  const decodedPixelFloorBytes = rows.reduce(
    (n, img) => n + Math.max(0, img.naturalWidth) * Math.max(0, img.naturalHeight) * 4,
    0,
  );
  return {
    sampleOrigin: 'navigation-start',
    elapsedMs,
    imageCount: rows.length,
    dataUrlImages: rows.filter((img) => img.srcKind === 'data-url').length,
    fullResolutionImages: rows.filter((img) => img.naturalWidth >= 1000 || img.naturalHeight >= 700).length,
    thumbnailImages: rows.filter((img) => img.naturalWidth > 0 && img.naturalHeight > 0
      && img.naturalWidth <= 320 && img.naturalHeight <= 320).length,
    decodedPixelFloorBytes,
    decodedPixelFloorMB: decodedMB(decodedPixelFloorBytes),
    largestSingleDecodedBytes: rows.reduce(
      (n, img) => Math.max(n, Math.max(0, img.naturalWidth) * Math.max(0, img.naturalHeight) * 4),
      0,
    ),
  };
}

export async function runLiveNavigationStartHarness({
  url = process.env.M1_REAL_APP_URL
    || 'http://31.97.192.82:3000/chart/dist-v9/index.html?mode=backtest&sessionId=936&fileId=677',
  sampleMs = Number(process.env.M1_TRANSIENT_SAMPLE_MS || 250),
  observeMs = Number(process.env.M1_TRANSIENT_OBSERVE_MS || 8000),
} = {}) {
  if (!existsSync(bAuthRoutePath) || !process.env.TEST_PASSWORD) {
    return { status: 'UNPROVEN', reason: 'auth-route-or-host-credential-missing' };
  }
  const route = await import(pathToFileURL(bAuthRoutePath).href);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--js-flags=--expose-gc'],
    defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
  });
  try {
    const page = await browser.newPage();
    const base = new URL(url).origin;
    await route.login(page, {
      email: process.env.M1_EMAIL || 'qa-canary@talaria-log.com',
      password: process.env.TEST_PASSWORD,
      base,
    });
    const started = Date.now();
    const navigation = page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch((error) => ({ error: error.message }));
    const samples = [];
    while (Date.now() - started <= observeMs) {
      samples.push(await collectImageSurface(page, Date.now() - started));
      await new Promise((resolveWait) => setTimeout(resolveWait, sampleMs));
    }
    const navResult = await navigation;
    const journal = await route.readJournal(page, { sessionId: route.JOURNAL_BEARING?.sessionId || '936' });
    return {
      signature: M1_LOAD_TRANSIENT_SIGNATURE,
      url,
      navResult,
      journal,
      samples,
      loadTransient: classifyLoadTransient(samples),
      residentScreenshots: classifyResidentScreenshots({
        surface: samples[samples.length - 1],
        journal: { status: journal.status, trades: journal.trades, screenshots: journal.withScreenshot },
        buildId: await page.evaluate(() => window.__TALARIA_CHART_BUILD_ID || null).catch(() => null),
      }),
    };
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outPath = process.env.M1_TRANSIENT_OUT
    ? resolve(root, process.env.M1_TRANSIENT_OUT)
    : resolve(root, 'docs/plan3/M1-B120-LOAD-TRANSIENT-20260731.json');
  const report = process.argv.includes('--live')
    ? await runLiveNavigationStartHarness()
    : runBHostSplitVerdicts();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  const transientStatus = report.loadTransient?.verdict?.status || report.loadTransient?.status;
  process.exit(transientStatus === 'NEW_DEFECT' ? 1 : 0);
}
