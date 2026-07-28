#!/usr/bin/env node
/**
 * Acceptance (RULING 22:25): /chart/multichart/chart-host.html must fail to
 * serve on the verification surface (default: http://31.97.192.82:3000).
 *
 * Pass = HTTP 404, or 3xx redirect away from /chart/multichart/, or connection
 * that does not return a 200 HTML body for the prototype host.
 *
 *   node deroute-multichart-acceptance.mjs --base-url=http://31.97.192.82:3000
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { baseUrl: 'http://31.97.192.82:3000', timeoutMs: 15000 };
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (!m) throw new Error(`bad arg: ${a}`);
    const [, k, v] = m;
    if (k === 'base-url') out.baseUrl = v;
    else if (k === 'timeout-ms') out.timeoutMs = Number(v);
    else if (k === 'help') {
      console.log('deroute-multichart-acceptance.mjs [--base-url=URL]');
      process.exit(0);
    } else throw new Error(`unknown --${k}`);
  }
  return out;
}

async function headOrGet(url, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: ac.signal });
    // Some stacks skip HEAD on StaticFiles — fall back to GET.
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', redirect: 'manual', signal: ac.signal });
    }
    const body = res.status === 200 ? await res.text() : '';
    return {
      status: res.status,
      location: res.headers.get('location'),
      server: res.headers.get('server'),
      contentType: res.headers.get('content-type'),
      bytes: body ? Buffer.byteLength(body) : 0,
      looksLikeHost: /chart-host|Multichart|engine-api-guards/i.test(body),
    };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const routes = [
    '/chart/multichart/chart-host.html',
    '/chart/multichart/multichart-shell.html',
    '/chart/multichart-prod/chart-embed.html',
  ];
  const rows = [];
  for (const route of routes) {
    const url = new URL(route, opts.baseUrl).toString();
    try {
      rows.push({ route, ...(await headOrGet(url, opts.timeoutMs)) });
    } catch (e) {
      rows.push({ route, error: e?.message || String(e) });
    }
  }

  const host = rows.find((r) => r.route.endsWith('chart-host.html'));
  const embed = rows.find((r) => r.route.includes('chart-embed'));
  const hostClosed =
    host &&
    !host.error &&
    host.status !== 200 &&
    !(host.status >= 300 && host.status < 400 && /\/chart\/multichart\//i.test(host.location || ''));
  // 302 to dist-v9 is success; 404 is success; 200 is fail.
  const hostRedirectOk =
    host &&
    host.status >= 300 &&
    host.status < 400 &&
    host.location &&
    !/\/chart\/multichart\//i.test(new URL(host.location, opts.baseUrl).pathname);

  const pass = Boolean((hostClosed || hostRedirectOk) && embed && embed.status === 200);
  const report = {
    observedAt: new Date().toISOString(),
    ruling: 'RULING-DEROUTE-INCOMPLETE-AND-RETRAIN-20260728-2225',
    baseUrl: opts.baseUrl,
    rows,
    pass,
    verdict: pass
      ? 'PASS — prototype chart-host does not serve; chart-embed still 200'
      : 'FAIL — prototype still reachable (or embed broken) on this surface',
  };

  const outDir = path.join(HERE, 'observations');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `deroute-multichart-acceptance-${report.observedAt.replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ outFile, pass, verdict: report.verdict, host, embedStatus: embed?.status }, null, 2));
  process.exitCode = pass ? 0 : 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
