#!/usr/bin/env node
/**
 * A local mirror of the sealed byte set, for the dress rehearsal only.
 *
 * Mid-run seal drift is the one refusal that cannot be exercised against production: proving it would
 * mean changing the bytes real users are served. So the rehearsal seals against a mirror it owns, flips a
 * byte, and watches the live loop stop itself. The soak stamps any run whose sealOrigin differs from its
 * boot origin as REHEARSAL and not publishable, so this can never be mistaken for a measurement.
 *
 * It also serves /chart/build-info.json, which the real origin currently does NOT (it falls through to the
 * app shell). That lets the rehearsal exercise --requireSha=1 on the same path production will use once
 * B's cut lands, rather than rehearsing with the passport switched off.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argOf = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const UPSTREAM = String(argOf('upstream', 'http://31.97.192.82:3000')).replace(/\/$/, '');
const PORT = Number(argOf('port', '8791'));
const CACHE = argOf('cache', path.join(process.cwd(), '.scratch-seal-mirror'));

const SEAL_PATHS = [
  '/chart/dist-v9/index.html',
  '/chart/dist-v9/assets/talaria-v9-live.js',
  '/chart/dist-v9/sw.js',
  '/chart/chart.js',
  '/chart/multichart-prod/multichart-manager.js',
  '/chart/modules/chart-window-limit.js',
];

fs.mkdirSync(CACHE, { recursive: true });
const fileFor = (p) => path.join(CACHE, p.replace(/[\\/:]/g, '_'));

async function prime() {
  for (const p of SEAL_PATHS) {
    const f = fileFor(p);
    if (fs.existsSync(f)) continue;
    const res = await fetch(`${UPSTREAM}${p}`);
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  // Mirror the REAL passport rather than inventing one. My first version wrote a plausible-looking object
  // without the TALARIA_BUILD_INFO_V1 signature, and the soak refused it at exit 3 - correctly, but it
  // rehearsed the failure path when the point was to rehearse the success path. Fetch upstream, and only
  // synthesise if upstream does not serve it.
  const bi = fileFor('/chart/build-info.json');
  if (!fs.existsSync(bi)) {
    let ok = false;
    try {
      const res = await fetch(`${UPSTREAM}/chart/build-info.json`);
      const txt = await res.text();
      if (res.ok && JSON.parse(txt)?.signature === 'TALARIA_BUILD_INFO_V1') { fs.writeFileSync(bi, txt); ok = true; }
    } catch { /* fall through to synthetic */ }
    if (!ok) {
      fs.writeFileSync(bi, JSON.stringify({
        signature: 'TALARIA_BUILD_INFO_V1',
        buildId: 'rehearsal-mirror',
        sourceCommitSha: crypto.createHash('sha1').update('rehearsal').digest('hex'),
        checkpointBuild: true,
        builtAt: new Date().toISOString(),
      }, null, 1));
    }
  }
}

await prime();

const server = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  const f = fileFor(url);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end('not mirrored'); return; }
  const body = fs.readFileSync(f);
  res.writeHead(200, { 'content-type': url.endsWith('.json') ? 'application/json' : (url.endsWith('.html') ? 'text/html' : 'application/javascript'), 'content-length': body.length });
  res.end(body);
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`seal mirror on http://127.0.0.1:${PORT} mirroring ${UPSTREAM}`);
  console.log(`cache ${CACHE}`);
  console.log('ready');
});
