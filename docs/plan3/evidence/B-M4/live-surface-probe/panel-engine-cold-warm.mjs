#!/usr/bin/env node
/**
 * Defect-one probe (FINDING 21:10): chart-host loads ../chart.js with no ?v=.
 * Cold Edge profile hits origin; warm profile is seeded with a stale chart.js
 * via a one-shot proxy so the unstamped URL can stick in disk cache.
 *
 *   node panel-engine-cold-warm.mjs --base-url=http://31.97.192.82:3000
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { baseUrl: null, edge: null, keep: false };
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`bad arg: ${a}`);
    const [, k, v] = m;
    if (k === 'base-url') out.baseUrl = v;
    else if (k === 'edge') out.edge = v;
    else if (k === 'keep') out.keep = true;
    else if (k === 'help') {
      console.log('panel-engine-cold-warm.mjs --base-url=URL [--edge=path]');
      process.exit(0);
    } else throw new Error(`unknown --${k}`);
  }
  if (!out.baseUrl) throw new Error('--base-url required');
  return out;
}

function findEdge(explicit) {
  if (explicit && fs.existsSync(explicit)) return explicit;
  for (const c of [
    process.env.EDGE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean)) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('msedge.exe not found; pass --edge=');
}

function fetchText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: buf.toString('utf8'),
          bytes: buf.length,
          sha256: createHash('sha256').update(buf).digest('hex'),
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(45000, () => req.destroy(new Error('timeout')));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractEngineBuild(js) {
  return /const\s+CHART_ENGINE_BUILD\s*=\s*'([^']+)'/.exec(js)?.[1] || null;
}

function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 0;
    const pending = new Map();
    ws.addEventListener('open', () => {
      const send = (method, params = {}, sessionId = null) => {
        const id = ++nextId;
        const msg = { id, method, params };
        if (sessionId) msg.sessionId = sessionId;
        ws.send(JSON.stringify(msg));
        return new Promise((res, rej) => {
          pending.set(id, { res, rej });
          setTimeout(() => {
            if (pending.has(id)) {
              pending.delete(id);
              rej(new Error(`cdp timeout ${method}`));
            }
          }, 60000);
        });
      };
      resolve({
        send,
        close: () => ws.close(),
      });
    });
    ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(JSON.stringify(msg.error)));
        else res(msg.result);
      }
    });
    ws.addEventListener('error', (e) => reject(e.error || e));
  });
}

async function waitPort(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const ver = await fetchText(`http://127.0.0.1:${port}/json/version`);
      if (ver.status === 200) return JSON.parse(ver.body);
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  throw new Error(`debug port ${port} not ready`);
}

async function withEdge(edgePath, userDataDir, port, fn) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const child = spawn(
    edgePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${port}`,
      '--remote-allow-origins=*',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d.toString();
  });
  try {
    const ver = await waitPort(port);
    const { send, close } = await cdpConnect(ver.webSocketDebuggerUrl);
    const list = JSON.parse((await fetchText(`http://127.0.0.1:${port}/json/list`)).body);
    const page = list.find((t) => t.type === 'page') || list[0];
    if (!page) throw new Error(`no page target; stderr=${stderr.slice(0, 300)}`);
    let sid = null;
    try {
      const attached = await send('Target.attachToTarget', { targetId: page.id, flatten: true });
      sid = attached.sessionId || null;
    } catch {
      sid = null;
    }
    const out = await fn({ send, sid });
    close();
    return out;
  } finally {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    await sleep(200);
  }
}

async function readPanelEngine({ send, sid }, panelUrl) {
  await send('Page.enable', {}, sid);
  await send('Runtime.enable', {}, sid);
  await send('Network.enable', {}, sid);
  await send('Page.navigate', { url: panelUrl }, sid);
  let last = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    const ev = await send(
      'Runtime.evaluate',
      {
        expression: `(() => {
          const scripts = [...document.scripts].map(s => s.getAttribute('src') || s.src);
          const engineSrc = scripts.find(s => /chart\\.js/i.test(s || '')) || null;
          return JSON.stringify({
            build: (typeof CHART_ENGINE_BUILD !== 'undefined') ? CHART_ENGINE_BUILD : null,
            engineSrc,
            href: location.href,
            readyState: document.readyState,
          });
        })()`,
        returnByValue: true,
      },
      sid,
    );
    last = ev?.result?.value ? JSON.parse(ev.result.value) : null;
    if (last?.build) return last;
  }
  return { ...(last || {}), error: 'CHART_ENGINE_BUILD never appeared' };
}

function startProxy(originBase, staleBody) {
  let chartHits = 0;
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, originBase).pathname;
      if (pathname === '/chart/chart.js') {
        chartHits += 1;
        if (chartHits === 1) {
          res.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            ETag: '"stale-seed-panel-engine"',
          });
          res.end(staleBody);
          return;
        }
      }
      const upstream = await fetchText(new URL(req.url, originBase).toString());
      res.writeHead(upstream.status || 200, {
        'Content-Type': upstream.headers['content-type'] || 'application/octet-stream',
        'Cache-Control': upstream.headers['cache-control'] || 'public, max-age=3600',
      });
      res.end(upstream.body);
    } catch (e) {
      res.writeHead(502);
      res.end(String(e?.message || e));
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        chartHits: () => chartHits,
        close: () => server.close(),
      });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const edge = findEdge(args.edge);
  const outDir = path.join(HERE, 'observations');
  fs.mkdirSync(outDir, { recursive: true });

  const hostHtml = await fetchText(new URL('/chart/multichart/chart-host.html', args.baseUrl).toString());
  const tags = [...hostHtml.body.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
  const engineTag = tags.find((s) => /chart\.js/i.test(s)) || null;
  const engineHasQuery = /\?/.test(engineTag || '');

  const originEngine = await fetchText(new URL('/chart/chart.js', args.baseUrl).toString(), {
    'cache-control': 'no-cache',
  });
  const originBuild = extractEngineBuild(originEngine.body);
  const staleBuild = '20260524a10-SEED';
  const staleBody = originEngine.body.replace(
    /const\s+CHART_ENGINE_BUILD\s*=\s*'[^']+'/,
    `const CHART_ENGINE_BUILD = '${staleBuild}'`,
  );

  const proxy = await startProxy(args.baseUrl, staleBody);
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-panel-engine-'));
  let cold;
  let warm;
  try {
    cold = await withEdge(edge, path.join(tmpRoot, 'cold'), 9331, (ctx) =>
      readPanelEngine(ctx, new URL('/chart/multichart/chart-host.html', args.baseUrl).toString()),
    );
    warm = await withEdge(edge, path.join(tmpRoot, 'warm'), 9332, async (ctx) => {
      // Seed cache with stale unstamped chart.js, then reload same URL.
      await readPanelEngine(ctx, new URL('/chart/multichart/chart-host.html', proxy.baseUrl).toString());
      return readPanelEngine(ctx, new URL('/chart/multichart/chart-host.html', proxy.baseUrl).toString());
    });
  } finally {
    proxy.close();
    if (!args.keep) {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  const diverge = Boolean(cold?.build && warm?.build && cold.build !== warm.build);
  const report = {
    observedAt: new Date().toISOString(),
    finding: 'FINDING-MULTICHART-HOST-SHELL-STALE-20260728-2110',
    baseUrl: args.baseUrl,
    engineTag,
    engineHasQuery,
    missingIndicatorPerf: !/indicator-performance\.js/i.test(hostHtml.body),
    missingModulePresence: !/module-presence-runtime\.js/i.test(hostHtml.body),
    a10Pins: [...hostHtml.body.matchAll(/\?v=(20260524a10)/g)].map((m) => m[1]),
    origin: {
      build: originBuild,
      cacheControl: originEngine.headers['cache-control'] || null,
      etag: originEngine.headers.etag || null,
    },
    coldProfile: cold,
    warmProfile: warm,
    proxyChartHits: proxy.chartHits(),
    diverge,
    defectOneLive: diverge || (!engineHasQuery && /max-age/i.test(String(originEngine.headers['cache-control'] || ''))),
    verdict: diverge
      ? 'LIVE — cold and warm panel profiles observed different CHART_ENGINE_BUILD'
      : !engineHasQuery
        ? 'STRUCTURAL — unstamped engine + cacheable /chart/chart.js (warm seed result below)'
        : 'UNEXPECTED — engine tag has a query',
  };

  const outFile = path.join(
    outDir,
    `panel-engine-cold-warm-${report.observedAt.replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, diverge, defectOneLive: report.defectOneLive, verdict: report.verdict, cold: cold?.build, warm: warm?.build, engineTag, originBuild, originCache: report.origin.cacheControl }, null, 2));
  process.exitCode = 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
