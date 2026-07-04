/**
 * Stub server for lwc-proto.html testing.
 *
 * Serves the multichart-prod folder statically and emulates the two API
 * endpoints the prototype uses (/api/file/{id}/meta, /api/file/{id}/bars)
 * with deterministic synthetic 1m candles, resampled server-side for coarser
 * timeframes — mirroring the real api_server.py contract, including the
 * anchor="start" truncation when a window exceeds `limit`.
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // multichart-prod/
const PORT = Number(process.env.PORT || 8971);

// ── synthetic dataset: 90 days of continuous 1m bars ending "now" ──
const TF_MS = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '1h': 3600e3, '4h': 14400e3, '1d': 86400e3 };
const END_MS = Math.floor(Date.now() / 60e3) * 60e3;
const START_MS = END_MS - 90 * 86400e3;

function priceAt(tMs) {
  const x = tMs / 3600e3;
  return 1.08 + 0.02 * Math.sin(x / 24) + 0.005 * Math.sin(x / 3.1) + 0.001 * Math.sin(x * 1.7);
}

function bar1m(tMs) {
  const o = priceAt(tMs);
  const c = priceAt(tMs + 60e3);
  const h = Math.max(o, c) + 0.0004;
  const l = Math.min(o, c) - 0.0004;
  return { t: tMs, o, h, l, c, v: 100 + (tMs / 60e3) % 50 };
}

/** All bars of `tf` intersecting [fromMs, toMs], bucket-aligned, ascending. */
function barsInWindow(tf, fromMs, toMs) {
  const step = TF_MS[tf] || 60e3;
  const lo = Math.max(START_MS, Math.floor(fromMs / step) * step);
  const hi = Math.min(END_MS - 60e3, toMs);
  const out = [];
  for (let t = lo; t <= hi; t += step) {
    if (tf === '1m') { out.push(bar1m(t)); continue; }
    // resample: aggregate 1m bars in the bucket (cap iterations for 1d)
    const n = Math.min(step / 60e3, 1440);
    let o = null, h = -Infinity, l = Infinity, c = null, v = 0;
    for (let i = 0; i < n; i++) {
      const b = bar1m(t + i * 60e3);
      if (o === null) o = b.o;
      if (b.h > h) h = b.h;
      if (b.l < l) l = b.l;
      c = b.c; v += b.v;
    }
    out.push({ t, o, h, l, c, v });
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  if (p === '/favicon.ico') { res.statusCode = 204; res.end(); return; }

  let m = p.match(/^\/api\/file\/(\d+)\/meta$/);
  if (m) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      file_id: Number(m[1]),
      original_name: 'SYNTH_EURUSD.csv',
      start_ts: START_MS,
      end_ts: END_MS - 60e3,
      timeframes: {},
    }));
    return;
  }

  m = p.match(/^\/api\/file\/(\d+)\/bars$/);
  if (m) {
    const tf = url.searchParams.get('resolution') || '1m';
    const from = Number(url.searchParams.get('from') || START_MS);
    const to = Number(url.searchParams.get('to') || END_MS);
    const limit = Math.min(2000, Number(url.searchParams.get('limit') || 2000));
    let bars = barsInWindow(tf, from, to);
    let hasMoreRight = false;
    if (bars.length > limit) { bars = bars.slice(0, limit); hasMoreRight = true; } // anchor="start"
    const hasMoreLeft = bars.length > 0 ? bars[0].t > START_MS : from > START_MS;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({
      file_id: Number(m[1]),
      resolution: tf,
      bars,
      returned: bars.length,
      has_more_left: hasMoreLeft,
      has_more_right: hasMoreRight,
      source: 'stub',
    }));
    return;
  }

  // static files from multichart-prod/
  const rel = p.replace(/^\/chart\/multichart-prod\//, '').replace(/^\//, '') || 'lwc-proto.html';
  try {
    const data = await readFile(join(ROOT, rel));
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    res.setHeader('content-type', types[extname(rel)] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('not found: ' + rel);
  }
});

server.listen(PORT, () => console.log(`[stub] listening on http://localhost:${PORT} (dataset ${new Date(START_MS).toISOString()} .. ${new Date(END_MS).toISOString()})`));
