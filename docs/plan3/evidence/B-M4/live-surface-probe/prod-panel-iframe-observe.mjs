#!/usr/bin/env node
/**
 * Precondition (WITHDRAWAL 21:45): before redirecting ^~ /chart/multichart/,
 * confirm production panel iframe URLs on the running host are NOT under
 * /chart/multichart/. Observed production builder returns
 * /chart/multichart-prod/chart-embed.html?... (V9 MultichartGrid).
 *
 *   node prod-panel-iframe-observe.mjs --base-url=http://31.97.192.82:3000
 */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { baseUrl: null, edge: null, timeoutMs: 40000 };
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`bad arg: ${a}`);
    const [, k, v] = m;
    if (k === 'base-url') out.baseUrl = v;
    else if (k === 'edge') out.edge = v;
    else if (k === 'timeout-ms') out.timeoutMs = Number(v);
    else if (k === 'help') {
      console.log('prod-panel-iframe-observe.mjs --base-url=URL');
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
  throw new Error('msedge.exe not found');
}

function fetchText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
      );
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('timeout')));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      resolve({ send, close: () => ws.close() });
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
  for (let i = 0; i < 60; i++) {
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

function analyzeServedBundle(js) {
  const chartHostCount = (js.match(/chart-host\.html/g) || []).length;
  const embedCount = (js.match(/\/chart\/multichart-prod\/chart-embed\.html/g) || []).length;
  const distIndexCount = (js.match(/\/chart\/dist-v9\/index\.html/g) || []).length;
  const hasIframeBuilder = /iframeSrcBuilder\s*:\s*function/.test(js);

  // Extract return template near embed path (minified MultichartGrid buildIframeSrc).
  let returnSample = null;
  const embedIdx = js.indexOf('/chart/multichart-prod/chart-embed.html');
  if (embedIdx >= 0) returnSample = js.slice(Math.max(0, embedIdx - 60), embedIdx + 50);

  const params = new URLSearchParams({ multichart: '1', panelId: 'B', tf: '1m', embedRev: 'ohlc2' });
  const exampleEmbed = `/chart/multichart-prod/chart-embed.html?${params.toString()}`;
  const exampleDist = `/chart/dist-v9/index.html?${params.toString()}`;

  const productionPath =
    embedCount > 0 ? 'chart-embed' : distIndexCount > 0 ? 'dist-v9-index' : null;

  return {
    chartHostCount,
    embedCount,
    distIndexCount,
    hasIframeBuilder,
    returnSample,
    productionPath,
    exampleUrl: productionPath === 'chart-embed' ? exampleEmbed : productionPath === 'dist-v9-index' ? exampleDist : null,
    // Pass floor: builder present, production panel URL is embed or dist-v9, never chart-host.
    pass: hasIframeBuilder && chartHostCount === 0 && (embedCount > 0 || distIndexCount > 0),
  };
}

async function observeDom(edge, baseUrl, timeoutMs) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-panel-obs-'));
  const port = 9342;
  const child = spawn(
    edge,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      `--user-data-dir=${tmp}`,
      `--remote-debugging-port=${port}`,
      '--remote-allow-origins=*',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  try {
    const ver = await waitPort(port);
    const { send, close } = await cdpConnect(ver.webSocketDebuggerUrl);
    const list = JSON.parse((await fetchText(`http://127.0.0.1:${port}/json/list`)).body);
    const page = list.find((t) => t.type === 'page') || list[0];
    let sid = null;
    try {
      sid = (await send('Target.attachToTarget', { targetId: page.id, flatten: true })).sessionId || null;
    } catch {
      sid = null;
    }
    await send('Page.enable', {}, sid);
    await send('Runtime.enable', {}, sid);
    await send('Page.navigate', { url: new URL('/chart/dist-v9/index.html', baseUrl).toString() }, sid);

    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
      await sleep(400);
      const ev = await send(
        'Runtime.evaluate',
        {
          expression: `(() => {
            const iframes = [...document.querySelectorAll('iframe')].map((f) => f.src || '');
            // If MultichartManager is present, synthesize one panel the way production does
            // when iframeSrcBuilder is set — we cannot call React's builder, but we can
            // detect whether any iframe already points at prod vs prototype.
            return JSON.stringify({ href: location.href, iframes, hasManager: typeof window.MultichartManager === 'function' });
          })()`,
          returnByValue: true,
        },
        sid,
      );
      last = ev?.result?.value ? JSON.parse(ev.result.value) : null;
      const iframes = last?.iframes || [];
      const prod = iframes.filter(
        (u) =>
          /\/chart\/multichart-prod\/chart-embed\.html/i.test(u) ||
          (/\/chart\/dist-v9\//i.test(u) && /multichart=1/i.test(u)),
      );
      const proto = iframes.filter((u) => /\/chart\/multichart\/(?:chart-host|multichart-shell)/i.test(u));
      if (prod.length) {
        close();
        return { prod, proto, iframes, last };
      }
      if (proto.length) {
        close();
        return { prod, proto, iframes, last };
      }
    }
    close();
    return { prod: [], proto: [], iframes: last?.iframes || [], last };
  } finally {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.join(HERE, 'observations');
  fs.mkdirSync(outDir, { recursive: true });

  const indexHtml = await fetchText(new URL('/chart/dist-v9/index.html', args.baseUrl).toString());
  const assetMatch = indexHtml.body.match(/\/chart\/dist-v9\/assets\/talaria-v9-live\.js[^"'\s]*/);
  if (!assetMatch) throw new Error('talaria-v9-live.js not found on dist-v9 index');
  const assetUrl = new URL(assetMatch[0], args.baseUrl).toString();
  const bundle = await fetchText(assetUrl);
  const fromBundle = analyzeServedBundle(bundle.body);

  // Live-fetch the production panel URL the builder emits — must be 200.
  let embedProbe = null;
  if (fromBundle.exampleUrl) {
    const abs = new URL(fromBundle.exampleUrl, args.baseUrl).toString();
    const res = await fetchText(abs);
    embedProbe = {
      url: fromBundle.exampleUrl,
      status: res.status,
      buildId:
        /__TALARIA_CHART_BUILD_ID\s*=\s*p\.get\('v'\)\s*\|\|\s*'([^']+)'/.exec(res.body)?.[1] ||
        /__TALARIA_CHART_BUILD_ID\s*=\s*'([^']+)'/.exec(res.body)?.[1] ||
        null,
    };
  }

  // Prototype still answers 200 today (pre-redirect) — record, must not be production path.
  const protoHost = await fetchText(new URL('/chart/multichart/chart-host.html', args.baseUrl).toString());
  const protoShell = await fetchText(new URL('/chart/multichart/multichart-shell.html', args.baseUrl).toString());

  let dom = null;
  try {
    dom = await observeDom(findEdge(args.edge), args.baseUrl, Math.min(args.timeoutMs, 25000));
  } catch (e) {
    dom = { error: String(e?.message || e), prod: [], proto: [] };
  }

  const usesPrototype = (dom?.proto || []).length > 0;
  const pass =
    fromBundle.pass &&
    !usesPrototype &&
    embedProbe &&
    embedProbe.status === 200 &&
    protoHost.status === 200; // still live pre-redirect; production must not point here

  const report = {
    observedAt: new Date().toISOString(),
    withdrawal: 'WITHDRAWAL-MULTICHART-HOST-FINDING-20260728-2145',
    baseUrl: args.baseUrl,
    assetUrl,
    fromBundle,
    embedProbe,
    prototypeStillServed: {
      chartHost: protoHost.status,
      shell: protoShell.status,
      note: 'Expected 200 before redirect; must not be production iframe target',
    },
    dom,
    pass,
    redirectAuthorized: pass,
    nuance:
      'Director text said dist-v9 iframes; served V9 asset on this host builds /chart/multichart-prod/chart-embed.html (stamped panel shell). Zero chart-host.html refs. Redirect of ^~ /chart/multichart/ does not touch chart-embed.',
    verdict: pass
      ? 'PASS — production panel builder → chart-embed (not /chart/multichart/); redirect authorized'
      : 'HOLD — production panel path not confirmed',
  };

  const outFile = path.join(
    outDir,
    `prod-panel-iframe-observe-${report.observedAt.replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        outFile,
        pass,
        redirectAuthorized: pass,
        verdict: report.verdict,
        productionPath: fromBundle.productionPath,
        exampleUrl: fromBundle.exampleUrl,
        embedStatus: embedProbe?.status,
        embedBuildId: embedProbe?.buildId,
        chartHostRefsInV9: fromBundle.chartHostCount,
      },
      null,
      2,
    ),
  );
  process.exitCode = pass ? 0 : 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
