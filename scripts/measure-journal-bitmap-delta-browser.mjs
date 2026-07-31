#!/usr/bin/env node
/**
 * D-1: real-browser decoded bitmap check for A's journal screenshot thumbnail cut.
 *
 * Compares:
 *  - legacy list: 60 rows * 2 full-resolution <img src=data:...>
 *  - J1 list:    60 rows * 2 full-resolution data URLs decoded off-DOM to raster
 *                thumbnails, then only thumbnail <img> elements remain in DOM.
 *
 * Uses unique real JPEG payloads derived from the Talaria fixture, with bytes appended
 * after JPEG EOI so dimensions are unchanged but Chrome cache keys are not identical.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const evidenceRoot = resolve(root, '../_evidence/manager-D');
const require = createRequire(import.meta.url);
const puppeteer = require(resolve(root, 'chart v 1.4/chart/multichart-prod/harness/node_modules/puppeteer'));

const rows = Number(process.env.D1_ROWS || 60);
const shotsPerRow = Number(process.env.D1_SHOTS_PER_ROW || 2);
const count = rows * shotsPerRow;
const thumbMaxDim = 240;
const fixturePath = resolve(root, 'docs/plan3/fixtures/talaria-chart-median-live-census.dataurl.txt');
const sourceDataUrl = readFileSync(fixturePath, 'utf8').trim();
const [, mimePart, b64Part] = /^data:([^;,]+);base64,(.*)$/s.exec(sourceDataUrl) || [];
if (!b64Part) throw new Error(`fixture is not a base64 data URL: ${fixturePath}`);
const sourceBytes = Buffer.from(b64Part, 'base64');

function jpegDimensions(buf) {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const len = buf.readUInt16BE(i + 2);
    const sof = (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);
    if (sof) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  throw new Error('could not read JPEG dimensions');
}

function uniqueDataUrl(i) {
  const suffix = Buffer.from(`\n#talaria-d1-${i}`);
  const bytes = Buffer.concat([sourceBytes, suffix]);
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

const dim = jpegDimensions(sourceBytes);
const fullDecodedBytesEach = dim.width * dim.height * 4;
const thumbScale = Math.min(1, thumbMaxDim / Math.max(dim.width, dim.height));
const thumbW = Math.max(1, Math.round(dim.width * thumbScale));
const thumbH = Math.max(1, Math.round(dim.height * thumbScale));
const thumbDecodedBytesEach = thumbW * thumbH * 4;

async function rendererPrivateBytes(browser) {
  const session = await browser.target().createCDPSession();
  try {
    const info = await session.send('SystemInfo.getProcessInfo');
    const rows = info.processInfo || [];
    const cdpRenderer = rows.filter((p) => p.type === 'renderer')
      .reduce((n, p) => n + Number(p.privateMemory || 0), 0);
    const cdpGpu = rows.filter((p) => p.type === 'GPU')
      .reduce((n, p) => n + Number(p.privateMemory || 0), 0);
    const os = osProcessMemory(rows);
    return {
      renderer: cdpRenderer || os.rendererPrivate || 0,
      gpu: cdpGpu || os.gpuPrivate || 0,
      rendererWorkingSet: os.rendererWorkingSet || null,
      gpuWorkingSet: os.gpuWorkingSet || null,
      memorySource: cdpRenderer || cdpGpu ? 'cdp-privateMemory' : os.source,
      processInfo: rows,
      osProcessInfo: os.rows,
    };
  } finally {
    await session.detach().catch(() => {});
  }
}

function osProcessMemory(processInfo) {
  if (process.platform !== 'win32') {
    return { source: 'unavailable-non-win32', rows: [] };
  }
  const ids = [...new Set((processInfo || []).map((p) => Number(p.id)).filter(Number.isFinite))];
  if (!ids.length) return { source: 'unavailable-no-pids', rows: [] };
  const command = [
    '$ErrorActionPreference="SilentlyContinue";',
    `$ids=@(${ids.join(',')});`,
    'Get-Process -Id $ids | Select-Object Id,ProcessName,PrivateMemorySize64,WorkingSet64 | ConvertTo-Json -Compress',
  ].join(' ');
  try {
    const raw = execFileSync('powershell', ['-NoProfile', '-Command', command], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const parsed = raw ? JSON.parse(raw) : [];
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const byId = new Map(rows.map((r) => [Number(r.Id), r]));
    let rendererPrivate = 0;
    let rendererWorkingSet = 0;
    let gpuPrivate = 0;
    let gpuWorkingSet = 0;
    for (const p of processInfo || []) {
      const row = byId.get(Number(p.id));
      if (!row) continue;
      const priv = Number(row.PrivateMemorySize64) || 0;
      const ws = Number(row.WorkingSet64) || 0;
      if (p.type === 'renderer') {
        rendererPrivate += priv;
        rendererWorkingSet += ws;
      } else if (p.type === 'GPU') {
        gpuPrivate += priv;
        gpuWorkingSet += ws;
      }
    }
    return {
      source: 'windows-GetProcess',
      rows,
      rendererPrivate,
      rendererWorkingSet,
      gpuPrivate,
      gpuWorkingSet,
    };
  } catch (error) {
    return { source: `unavailable-GetProcess:${error?.message || error}`, rows: [] };
  }
}

async function collectPageMetrics(page) {
  const cdp = await page.target().createCDPSession();
  try {
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    const perf = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
    const dom = await cdp.send('Memory.getDOMCounters').catch(() => ({}));
    const metrics = Object.fromEntries((perf.metrics || []).map((m) => [m.name, m.value]));
    return {
      jsHeapUsed: metrics.JSHeapUsedSize || null,
      jsHeapTotal: metrics.JSHeapTotalSize || null,
      nodes: dom.nodes ?? null,
      documents: dom.documents ?? null,
      jsEventListeners: dom.jsEventListeners ?? null,
    };
  } finally {
    await cdp.detach().catch(() => {});
  }
}

async function runScenario(browser, name, mode) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  const beforeProc = await rendererPrivateBytes(browser);
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>', { waitUntil: 'load' });
  const sources = Array.from({ length: count }, (_, i) => uniqueDataUrl(i));
  await page.evaluate(async ({ sources, mode, thumbMaxDim }) => {
    window.__fullSources = sources; // model hydrated tradeJournal strings in both arms.
    window.__thumbs = [];
    const root = document.getElementById('root');
    root.style.cssText = 'width:900px;display:block;';
    const decodeImg = (src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    if (mode === 'legacy') {
      for (const src of sources) {
        const img = new Image();
        img.src = src;
        img.style.cssText = 'width:120px;height:60px;object-fit:cover;display:block;';
        root.appendChild(img);
      }
      await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => null)));
      return;
    }
    for (const src of sources) {
      const full = await decodeImg(src);
      if (!full) continue;
      const scale = Math.min(1, thumbMaxDim / Math.max(full.naturalWidth || full.width, full.naturalHeight || full.height));
      const w = Math.max(1, Math.round((full.naturalWidth || full.width) * scale));
      const h = Math.max(1, Math.round((full.naturalHeight || full.height) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(full, 0, 0, w, h);
      const thumb = canvas.toDataURL('image/jpeg', 0.72);
      canvas.width = 0;
      canvas.height = 0;
      window.__thumbs.push(thumb);
      const img = new Image();
      img.src = thumb;
      img.style.cssText = 'width:120px;height:60px;object-fit:cover;display:block;';
      root.appendChild(img);
    }
    await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => null)));
  }, { sources, mode, thumbMaxDim });

  await page.waitForNetworkIdle({ idleTime: 500, timeout: 10_000 }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const pageStats = await page.evaluate(() => ({
    imageCount: document.images.length,
    decodedPixelFloorBytes: Array.from(document.images).reduce(
      (n, img) => n + ((img.naturalWidth || 0) * (img.naturalHeight || 0) * 4),
      0,
    ),
    markupChars: document.getElementById('root')?.innerHTML.length || 0,
    fullSourceChars: (window.__fullSources || []).reduce((n, s) => n + s.length, 0),
    thumbChars: (window.__thumbs || []).reduce((n, s) => n + s.length, 0),
  }));
  const metrics = await collectPageMetrics(page);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const afterProc = await rendererPrivateBytes(browser);
  return {
    name,
    mode,
    beforeProcess: beforeProc,
    afterProcess: afterProc,
    rendererPrivateDeltaBytes: afterProc.renderer - beforeProc.renderer,
    gpuPrivateDeltaBytes: afterProc.gpu - beforeProc.gpu,
    pageStats,
    metrics,
  };
}

async function launchBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-extensions',
      '--js-flags=--expose-gc',
      '--enable-precise-memory-info',
    ],
  });
}

async function runScenarioInFreshBrowser(name, mode) {
  const browser = await launchBrowser();
  try {
    return await runScenario(browser, name, mode);
  } finally {
    await browser.close().catch(() => {});
  }
}

{
  const legacy = await runScenarioInFreshBrowser('legacy-full-img-dom', 'legacy');
  const j1 = await runScenarioInFreshBrowser('j1-thumb-raster-dom', 'thumb');
  const tip = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
  const out = {
    schema: 'talaria.d1.journal-bitmap-delta-browser.v1',
    tip,
    measuredAt: new Date().toISOString(),
    rows,
    shotsPerRow,
    imageCount: count,
    fixture: {
      path: fixturePath.replace(/\\/g, '/'),
      declaredMime: mimePart || null,
      actualFormat: 'image/jpeg',
      width: dim.width,
      height: dim.height,
      fullDecodedBytesEach,
      thumbMaxDim,
      thumbWidth: thumbW,
      thumbHeight: thumbH,
      thumbDecodedBytesEach,
    },
    theoreticalDecoded: {
      legacyFullDomBytes: fullDecodedBytesEach * count,
      j1ThumbnailDomBytes: thumbDecodedBytesEach * count,
      deltaBytes: (fullDecodedBytesEach - thumbDecodedBytesEach) * count,
    },
    scenarios: { legacy, j1 },
    caveats: [
      'CDP does not expose Chrome Task Manager image-cache column directly; decoded image cache is bounded by DOM naturalWidth/naturalHeight and cross-checked against renderer process footprint where OS process bytes are available.',
      'Both arms keep hydrated full data-url strings in JS to isolate decoded-bitmap/list-DOM behavior from string retention.',
      'A J1 rasterization may transiently decode full sources; the question here is whether full decoded images remain resident after the list settles.',
    ],
  };
  mkdirSync(resolve(root, 'docs/plan3'), { recursive: true });
  mkdirSync(evidenceRoot, { recursive: true });
  const jsonPath = resolve(root, 'docs/plan3/D1-JOURNAL-BITMAP-DELTA-BROWSER-20260731.json');
  const evidencePath = resolve(evidenceRoot, 'D1-JOURNAL-BITMAP-DELTA-BROWSER-20260731.json');
  writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  writeFileSync(evidencePath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    ok: true,
    jsonPath,
    evidencePath,
    theoreticalDecoded: out.theoreticalDecoded,
    legacyRendererDelta: legacy.rendererPrivateDeltaBytes,
    j1RendererDelta: j1.rendererPrivateDeltaBytes,
    legacyDomDecoded: legacy.pageStats.decodedPixelFloorBytes,
    j1DomDecoded: j1.pageStats.decodedPixelFloorBytes,
  }, null, 2));
}
