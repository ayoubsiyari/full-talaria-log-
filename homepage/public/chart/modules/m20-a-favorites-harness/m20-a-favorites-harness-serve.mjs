/**
 * M20-A favorites harness — static server + /report sink (zero-install).
 * Serves the repo root read-only so the harness page can load the authentic
 * pre-fix blob AND both trees' current favorites-manager.js by URL.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

export function startHarnessServer({ repoRoot, port, onReport }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/report') {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          try {
            onReport(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end('{"ok":true}');
          } catch (err) {
            res.writeHead(400);
            res.end(String(err));
          }
        });
        return;
      }
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const abs = path.normalize(path.join(repoRoot, urlPath));
      if (!abs.startsWith(path.normalize(repoRoot)) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(fs.readFileSync(abs));
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}
