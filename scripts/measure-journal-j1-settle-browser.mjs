#!/usr/bin/env node
/**
 * D-1 follow-up: does J1's extra renderer-private cost settle or accumulate?
 *
 * Rebuilds a journal-list-like DOM repeatedly with the same 60 rows * 2 real
 * screenshots. Full hydrated strings stay resident, matching state.journal. A
 * bounded thumbnail cache stays resident across rebuilds, matching M20-J1.
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

const rows = Number(process.env.J1_ROWS || 60);
const shotsPerRow = Number(process.env.J1_SHOTS_PER_ROW || 2);
const cycles = Number(process.env.J1_CYCLES || 12);
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
  const suffix = Buffer.from(`\n#talaria-j1-settle-${i}`);
  const bytes = Buffer.concat([sourceBytes, suffix]);
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
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
    'Get-Process -Id $ids -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,PrivateMemorySize64,WorkingSet64 | ConvertTo-Json -Compress',
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
    return { source: 'windows-GetProcess', rows, rendererPrivate, rendererWorkingSet, gpuPrivate, gpuWorkingSet };
  } catch (error) {
    return { source: `unavailable-GetProcess:${error?.message || error}`, rows: [] };
  }
}

async function processBytes(browser) {
  const session = await browser.target().createCDPSession();
  try {
    const info = await session.send('SystemInfo.getProcessInfo');
    const rows = info.processInfo || [];
    const os = osProcessMemory(rows);
    return {
      rendererPrivate: os.rendererPrivate || 0,
      rendererWorkingSet: os.rendererWorkingSet || 0,
      gpuPrivate: os.gpuPrivate || 0,
      gpuWorkingSet: os.gpuWorkingSet || 0,
      source: os.source,
      processInfo: rows,
      osProcessInfo: os.rows,
    };
  } finally {
    await session.detach().catch(() => {});
  }
}

async function collectGarbage(page) {
  const cdp = await page.target().createCDPSession();
  try {
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  } finally {
    await cdp.detach().catch(() => {});
  }
}

const dim = jpegDimensions(sourceBytes);
const thumbScale = Math.min(1, thumbMaxDim / Math.max(dim.width, dim.height));
const thumbW = Math.max(1, Math.round(dim.width * thumbScale));
const thumbH = Math.max(1, Math.round(dim.height * thumbScale));
const thumbDecodedBytesEach = thumbW * thumbH * 4;

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-extensions', '--js-flags=--expose-gc', '--enable-precise-memory-info'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>', { waitUntil: 'load' });
  const sources = Array.from({ length: count }, (_, i) => uniqueDataUrl(i));
  await page.evaluate(({ sources }) => {
    window.__fullSources = sources;
    window.__thumbCache = new Map();
    window.__renderStats = [];
  }, { sources });

  await collectGarbage(page);
  const baseline = await processBytes(browser);
  const samples = [];

  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    const stats = await page.evaluate(async ({ cycle, thumbMaxDim }) => {
      const root = document.getElementById('root');
      root.innerHTML = '';
      const sources = window.__fullSources || [];
      const cache = window.__thumbCache;
      let hits = 0;
      let misses = 0;
      const decodeImg = (src) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
      for (let i = 0; i < sources.length; i += 1) {
        let thumb = cache.get(i);
        if (thumb) {
          hits += 1;
        } else {
          misses += 1;
          const full = await decodeImg(sources[i]);
          if (!full) continue;
          const scale = Math.min(1, thumbMaxDim / Math.max(full.naturalWidth || full.width, full.naturalHeight || full.height));
          const w = Math.max(1, Math.round((full.naturalWidth || full.width) * scale));
          const h = Math.max(1, Math.round((full.naturalHeight || full.height) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(full, 0, 0, w, h);
          thumb = canvas.toDataURL('image/jpeg', 0.72);
          canvas.width = 0;
          canvas.height = 0;
          cache.set(i, thumb);
        }
        const img = new Image();
        img.src = thumb;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.style.cssText = 'width:120px;height:60px;object-fit:cover;display:block;';
        root.appendChild(img);
      }
      await Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => null)));
      const pageStats = {
        cycle,
        hits,
        misses,
        imageCount: document.images.length,
        decodedPixelFloorBytes: Array.from(document.images).reduce(
          (n, img) => n + ((img.naturalWidth || 0) * (img.naturalHeight || 0) * 4),
          0,
        ),
        markupChars: root.innerHTML.length,
        cacheEntries: cache.size,
        cacheChars: Array.from(cache.values()).reduce((n, s) => n + s.length, 0),
      };
      window.__renderStats.push(pageStats);
      return pageStats;
    }, { cycle, thumbMaxDim });

    await page.waitForNetworkIdle({ idleTime: 250, timeout: 5_000 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 750));
    await collectGarbage(page);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const proc = await processBytes(browser);
    samples.push({
      cycle,
      ...stats,
      rendererPrivateBytes: proc.rendererPrivate,
      rendererPrivateDeltaFromBaseline: proc.rendererPrivate - baseline.rendererPrivate,
      rendererWorkingSetBytes: proc.rendererWorkingSet,
      rendererWorkingSetDeltaFromBaseline: proc.rendererWorkingSet - baseline.rendererWorkingSet,
      gpuPrivateBytes: proc.gpuPrivate,
      gpuPrivateDeltaFromBaseline: proc.gpuPrivate - baseline.gpuPrivate,
      gpuWorkingSetBytes: proc.gpuWorkingSet,
      gpuWorkingSetDeltaFromBaseline: proc.gpuWorkingSet - baseline.gpuWorkingSet,
      memorySource: proc.source,
    });
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  const afterWarm = samples.slice(1);
  const stableTail = samples.slice(Math.min(3, samples.length - 1));
  const afterWarmRendererMin = Math.min(...afterWarm.map((s) => s.rendererPrivateDeltaFromBaseline));
  const afterWarmRendererMax = Math.max(...afterWarm.map((s) => s.rendererPrivateDeltaFromBaseline));
  const afterWarmGpuMin = Math.min(...afterWarm.map((s) => s.gpuPrivateDeltaFromBaseline));
  const afterWarmGpuMax = Math.max(...afterWarm.map((s) => s.gpuPrivateDeltaFromBaseline));
  const tailRendererMin = Math.min(...stableTail.map((s) => s.rendererPrivateDeltaFromBaseline));
  const tailRendererMax = Math.max(...stableTail.map((s) => s.rendererPrivateDeltaFromBaseline));
  const tailGpuMin = Math.min(...stableTail.map((s) => s.gpuPrivateDeltaFromBaseline));
  const tailGpuMax = Math.max(...stableTail.map((s) => s.gpuPrivateDeltaFromBaseline));
  const tip = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
  const out = {
    schema: 'talaria.d1.j1-settle-browser.v1',
    tip,
    measuredAt: new Date().toISOString(),
    rows,
    shotsPerRow,
    imageCount: count,
    cycles,
    fixture: {
      path: fixturePath.replace(/\\/g, '/'),
      declaredMime: mimePart || null,
      actualFormat: 'image/jpeg',
      width: dim.width,
      height: dim.height,
      thumbMaxDim,
      thumbWidth: thumbW,
      thumbHeight: thumbH,
      thumbDecodedBytesEach,
      thumbDomDecodedBytesPerCycle: thumbDecodedBytesEach * count,
    },
    baseline,
    samples,
    summary: {
      cycle1RendererPrivateDelta: first.rendererPrivateDeltaFromBaseline,
      lastRendererPrivateDelta: last.rendererPrivateDeltaFromBaseline,
      lastMinusCycle1RendererPrivate: last.rendererPrivateDeltaFromBaseline - first.rendererPrivateDeltaFromBaseline,
      afterWarmRendererRange: [afterWarmRendererMin, afterWarmRendererMax],
      afterWarmRendererSpread: afterWarmRendererMax - afterWarmRendererMin,
      stableTailCycles: stableTail.map((s) => s.cycle),
      stableTailRendererRange: [tailRendererMin, tailRendererMax],
      stableTailRendererSpread: tailRendererMax - tailRendererMin,
      cycle1GpuPrivateDelta: first.gpuPrivateDeltaFromBaseline,
      lastGpuPrivateDelta: last.gpuPrivateDeltaFromBaseline,
      lastMinusCycle1GpuPrivate: last.gpuPrivateDeltaFromBaseline - first.gpuPrivateDeltaFromBaseline,
      afterWarmGpuRange: [afterWarmGpuMin, afterWarmGpuMax],
      afterWarmGpuSpread: afterWarmGpuMax - afterWarmGpuMin,
      stableTailGpuRange: [tailGpuMin, tailGpuMax],
      stableTailGpuSpread: tailGpuMax - tailGpuMin,
      cacheMissesByCycle: samples.map((s) => s.misses),
      classification: 'computed-by-reader',
    },
    caveats: [
      'Windows process private bytes are coarse and can move with allocator arenas; slope across repeated renders is the leak signal.',
      'The harness keeps the thumbnail cache across rebuilds to model M20-J1. Cycle 1 rasterizes; later cycles should be cache hits.',
      'Full hydrated data-url strings remain resident in JS to isolate bitmap/raster behavior.',
    ],
  };

  mkdirSync(resolve(root, 'docs/plan3'), { recursive: true });
  mkdirSync(evidenceRoot, { recursive: true });
  const jsonPath = resolve(root, 'docs/plan3/D1-J1-SETTLE-BROWSER-20260731.json');
  const evidencePath = resolve(evidenceRoot, 'D1-J1-SETTLE-BROWSER-20260731.json');
  writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  writeFileSync(evidencePath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: true, jsonPath, evidencePath, summary: out.summary }, null, 2));
} finally {
  await browser.close().catch(() => {});
}
