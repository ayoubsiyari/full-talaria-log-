/**
 * M21-2 — browser-harness static server (W3-owned, NEW FILE, zero-dependency).
 *
 * Serves representative /chart/* paths from a chart tree root so the harness
 * page, the REAL bridge module and the REAL classic worker all load from the
 * exact same-origin URL shapes the product will use. Every response carries a
 * STRICT same-origin CSP (script-src 'self'; worker-src 'self') so the run
 * itself proves blob-free, same-origin worker bootstrap is CSP-compatible
 * (integration-hazard H3). POST /report is the harness result sink.
 *
 * No product/bootstrap/CSP files are touched — this server exists only for
 * the standalone harness. Standalone use:
 *   node "chart v 1.4/chart/modules/m21-2-browser-harness/m21-2-browser-harness-serve.mjs"
 * then open /chart/modules/m21-2-browser-harness/m21-2-browser-harness.html
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HARNESS_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
].join('; ');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/**
 * @param {object} opts
 * @param {string} opts.chartRoot  filesystem dir that /chart/* maps into (the tree's chart/ dir)
 * @param {number} opts.port
 * @param {(report: object) => void} [opts.onReport]  harness POST /report sink
 */
export function startHarnessServer({ chartRoot, port, onReport }) {
  const root = resolve(chartRoot);
  const server = http.createServer(async (req, res) => {
    res.setHeader('content-security-policy', HARNESS_CSP);
    res.setHeader('cache-control', 'no-store');

    if (req.method === 'POST' && req.url === '/report') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          const report = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (onReport) onReport(report);
        } catch (err) {
          if (onReport) onReport({ parseError: String(err) });
        }
        res.statusCode = 204;
        res.end();
      });
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/favicon.ico') { res.statusCode = 204; res.end(); return; }
    if (!url.pathname.startsWith('/chart/')) {
      res.statusCode = 404;
      res.end('harness serves /chart/* only');
      return;
    }
    const rel = url.pathname.slice('/chart/'.length);
    const abs = resolve(join(root, rel));
    if (abs !== root && !abs.startsWith(root + sep)) {
      res.statusCode = 403;
      res.end('forbidden');
      return;
    }
    try {
      const data = await readFile(abs);
      res.setHeader('content-type', TYPES[extname(abs).toLowerCase()] || 'application/octet-stream');
      res.end(data);
    } catch {
      res.statusCode = 404;
      res.end('not found: ' + url.pathname);
    }
  });
  return new Promise((resolveStart) => {
    server.listen(port, '127.0.0.1', () => resolveStart(server));
  });
}

// Standalone mode: serve THIS file's own tree.
const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === selfPath) {
  // harness dir → modules → chart
  const ownChartRoot = dirname(dirname(dirname(selfPath)));
  const port = Number(process.env.PORT || 8975);
  startHarnessServer({
    chartRoot: ownChartRoot,
    port,
    onReport: (r) => console.log('[report]', JSON.stringify(r, null, 2)),
  }).then(() => {
    console.log(`[m21-2-harness] http://127.0.0.1:${port}/chart/modules/m21-2-browser-harness/m21-2-browser-harness.html`);
    console.log(`[m21-2-harness] chartRoot=${ownChartRoot}`);
  });
}
