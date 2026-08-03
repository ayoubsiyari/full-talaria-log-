#!/usr/bin/env node
/**
 * COPY-ABSENCE-01 selftest.
 *
 * The census reported 0 SILENT_ABSENT on its first clean run. That number is
 * worthless on its own — a gate that has never fired is indistinguishable from a
 * passing one in every sweep summary we have, and today alone we found FRAME-01
 * green while replay was exempt, two mirrored gates green while never executing,
 * and two panel-state gates that parsed nothing. So the load-bearing cells here
 * are the ones that make the census go RED: a real 404 over real HTTP from a real
 * discovered shell, and the proof that removing the declaration turns an intended
 * absence into a reported one.
 *
 *   node scripts/copy-absence-census.selftest.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  resolveRef, servedUrlForShell, declaredAbsence, contractNames,
} from './copy-absence-census.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const CENSUS = path.join(HERE, 'copy-absence-census.mjs');

let pass = 0;
let fail = 0;
const cell = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); pass += 1; } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message.split('\n')[0]}`);
    fail += 1;
  }
};
const acell = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); pass += 1; } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message.split('\n')[0]}`);
    fail += 1;
  }
};

/** A server that 200s anything except an explicit absent list. */
function serveWith(absent) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = req.url.replace(/[?#].*$/, '');
      if (absent.includes(url)) { res.writeHead(404); res.end('nope'); return; }
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/** A temp tree the census can discover: one shell, one inventory entry. */
function tempTree({ shellBody, inventoryServable = true, nginx = null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-absence-'));
  const shellRel = 'chart v 1.4/chart/dist-v9/index.html';
  const shellAbs = path.join(dir, ...shellRel.split('/'));
  fs.mkdirSync(path.dirname(shellAbs), { recursive: true });
  fs.writeFileSync(shellAbs, shellBody);
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'scripts/module-contracts.json'), JSON.stringify({
    schema: 'talaria.module-contracts.v1',
    modules: [],
    inventory: [{
      id: 'host', surface: 'host', path: shellRel, status: 'owned-stamped', servable: inventoryServable,
    }],
  }));
  if (nginx) {
    fs.mkdirSync(path.join(dir, 'homepage'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'homepage/nginx.local.conf'), nginx);
  }
  return { dir, shellRel };
}

/**
 * Async on purpose. spawnSync blocks this process's event loop, so the fixture
 * HTTP server above could never answer the child and every end-to-end cell hung
 * forever -- a test that hangs is worse than one that fails, because it looks
 * like slow progress instead of a defect.
 */
function runCensus({ dir, base }) {
  const out = path.join(dir, 'census.json');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      CENSUS, `--base=${base}`, `--repo-root=${dir}`, '--roots=chart v 1.4', `--out=${out}`,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let text = '';
    child.stdout.on('data', (d) => { text += d; });
    child.stderr.on('data', (d) => { text += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('census did not exit within 30s')); }, 30_000);
    child.on('error', reject);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({
        status,
        stdout: text,
        json: fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null,
      });
    });
  });
}

console.log('COPY-ABSENCE-01 selftest\n');

// ---------------------------------------------------------------- pure parts

cell('resolveRef: absolute, relative, dot-dot, query stripped, schemes skipped', () => {
  const shell = '/chart/dist-v9/index.html';
  assert.equal(resolveRef('/chart/modules/a.js', shell), '/chart/modules/a.js');
  assert.equal(resolveRef('a.js', shell), '/chart/dist-v9/a.js');
  assert.equal(resolveRef('./a.js', shell), '/chart/dist-v9/a.js');
  assert.equal(resolveRef('../chart.js', shell), '/chart/chart.js');
  assert.equal(resolveRef('a.js?v=20260803b126', shell), '/chart/dist-v9/a.js');
  assert.equal(resolveRef('https://cdn.example.com/x.js', shell), null);
  assert.equal(resolveRef('//cdn.example.com/x.js', shell), null);
  assert.equal(resolveRef('data:text/javascript,1', shell), null);
  assert.equal(resolveRef('', shell), null);
});

cell('servedUrlForShell: both mirror roots map to /chart/, non-served paths return null', () => {
  assert.equal(servedUrlForShell('chart v 1.4/chart/dist-v9/index.html'), '/chart/dist-v9/index.html');
  assert.equal(servedUrlForShell('homepage/public/chart/modules/x.html'), '/chart/modules/x.html');
  assert.equal(servedUrlForShell('homepage/out/chart/a.html'), '/chart/a.html');
  // A guess here would invent a 404 and make the report untrustworthy.
  assert.equal(servedUrlForShell('chart v 1.4/talaria-design/src/App.jsx'), null);
  assert.equal(servedUrlForShell('docs/plan3/whatever.html'), null);
});

cell('declaredAbsence: the real nginx conf explains the two harness 404s and nothing else', () => {
  const harness = declaredAbsence('/chart/modules/m20-a-favorites-harness/m20-a-favorites-harness.client.mjs');
  assert.ok(harness.length >= 1, 'the harness prefix should be declared absent by nginx');
  assert.match(harness.join(' '), /nginx\.local\.conf/);
  // A product URL must NOT be excusable, or every absence becomes "declared".
  assert.deepEqual(declaredAbsence('/chart/dist-v9/index.html'), []);
  assert.deepEqual(declaredAbsence('/chart/chart.js'), []);
});

cell('declaredAbsence: strip patterns are read from the strip script, not hardcoded here', () => {
  const t = declaredAbsence('/chart/modules/anything.test.mjs');
  assert.ok(t.some((d) => d.includes('strip-nonserved-chart-assets.sh')), `expected strip citation, got ${JSON.stringify(t)}`);
});

cell('contractNames: matches a contract written as a repo path when asked as a URL', () => {
  const contracts = { paths: new Set(['homepage/public/chart/modules/session-calendar.js']), inventory: new Map() };
  assert.deepEqual(
    contractNames('/chart/modules/session-calendar.js', contracts),
    ['homepage/public/chart/modules/session-calendar.js'],
  );
  assert.deepEqual(contractNames('/chart/modules/unnamed.js', contracts), []);
});

// -------------------------------------------------- end to end, over real HTTP

await acell('DISCRIMINATING: an undeclared 404 is reported SILENT_ABSENT (the census can fire)', async () => {
  const { server, port } = await serveWith(['/chart/modules/ghost.js']);
  try {
    const { dir } = tempTree({
      shellBody: '<script src="/chart/modules/ghost.js"></script><script src="/chart/chart.js"></script>',
    });
    const r = await runCensus({ dir, base: `http://127.0.0.1:${port}` });
    assert.equal(r.json.state, 'SILENT_ABSENT', `state was ${r.json && r.json.state}`);
    assert.equal(r.json.counts.silentAbsent, 1);
    assert.equal(r.json.silentAbsent[0].url, '/chart/modules/ghost.js');
    assert.equal(r.json.silentAbsent[0].status, 404);
    assert.equal(r.json.counts.carried, 1, 'the sibling that 200s must be counted as carried');
    assert.equal(r.status, 1, 'a silent absence must be a non-zero exit');
  } finally { server.close(); }
});

await acell('ANTI-VACUITY: the same 404 becomes ABSENT_DECLARED once nginx declares it', async () => {
  const { server, port } = await serveWith(['/chart/modules/ghost.js']);
  try {
    const { dir } = tempTree({
      shellBody: '<script src="/chart/modules/ghost.js"></script>',
      nginx: 'location ^~ /chart/modules/ghost.js {\n  return 404;\n}\n',
    });
    const r = await runCensus({ dir, base: `http://127.0.0.1:${port}` });
    assert.equal(r.json.counts.silentAbsent, 0, 'a declared absence is not a silent one');
    assert.equal(r.json.counts.absentDeclared, 1);
    assert.match(r.json.absentDeclared[0].declaredBy.join(' '), /returns 404/);
  } finally { server.close(); }
});

await acell('the widened extraction is load-bearing: a worker and a stylesheet are followed too', async () => {
  const { server, port } = await serveWith(['/chart/workers/ghost-worker.js', '/chart/ghost.css']);
  try {
    const { dir } = tempTree({
      shellBody: '<link rel="stylesheet" href="/chart/ghost.css">'
        + '<script>const w = new Worker("/chart/workers/ghost-worker.js");</script>',
    });
    const r = await runCensus({ dir, base: `http://127.0.0.1:${port}` });
    const urls = r.json.silentAbsent.map((s) => s.url).sort();
    assert.deepEqual(urls, ['/chart/ghost.css', '/chart/workers/ghost-worker.js']);
    const via = r.json.silentAbsent.flatMap((s) => s.via).sort();
    assert.deepEqual(via, ['link-href', 'new-Worker']);
  } finally { server.close(); }
});

await acell('a shell the inventory calls not-servable is skipped, not counted', async () => {
  const { server, port } = await serveWith(['/chart/modules/ghost.js']);
  try {
    const { dir } = tempTree({
      shellBody: '<script src="/chart/modules/ghost.js"></script>',
      inventoryServable: false,
    });
    const r = await runCensus({ dir, base: `http://127.0.0.1:${port}` });
    assert.equal(r.json.counts.referencedUrls, 0, 'a not-servable shell contributes no references');
    assert.equal(r.json.state, 'NO_REFERENCES_FOUND', `state was ${r.json && r.json.state}`);
    assert.equal(r.status, 1, 'checking nothing must not exit 0');
  } finally { server.close(); }
});

await acell('BASE_UNREACHABLE: a shut door refuses rather than reporting every URL absent', async () => {
  const { server, port } = await serveWith([]);
  server.close();
  await new Promise((r) => setTimeout(r, 50));
  const { dir } = tempTree({ shellBody: '<script src="/chart/chart.js"></script>' });
  const r = await runCensus({ dir, base: `http://127.0.0.1:${port}` });
  assert.equal(r.status, 2, `expected exit 2, got ${r.status}`);
  assert.match(r.stdout, /BASE_UNREACHABLE/);
  assert.equal(r.json, null, 'no artifact should be written against a shut door');
});

await acell('a 302 is carried, not absent — nginx redirects several chart paths on purpose', async () => {
  const server = await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      if (req.url.startsWith('/chart/legacy')) { res.writeHead(302, { location: '/chart/dist-v9/index.html' }); res.end(); return; }
      res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok');
    });
    s.listen(0, '127.0.0.1', () => resolve({ s, port: s.address().port }));
  });
  try {
    const { dir } = tempTree({ shellBody: '<script src="/chart/legacy-index.html"></script>' });
    const r = await runCensus({ dir, base: `http://127.0.0.1:${server.port}` });
    assert.equal(r.json.counts.silentAbsent, 0, 'a 302 is served, just elsewhere');
    assert.equal(r.json.counts.carried, 1);
  } finally { server.s.close(); }
});

cell('the artifact declares its evidence class and its limits, per SEAL-EVIDENCE-01', () => {
  const src = fs.readFileSync(CENSUS, 'utf8');
  assert.match(src, /evidenceClass:\s*'SERVED_RUNTIME/, 'the artifact must name what it executed against');
  assert.match(src, /limits:\s*\[/, 'a static-blind spot that is not stated is a false green');
  assert.match(src, /assembled inside JavaScript at runtime/, 'the JS-internal blind spot must be stated in the artifact');
});

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
