/**
 * K4 — locate the hang. Not the marker, the hang.
 *
 * The claim ENDPOINT was made a sync `def` in the last P0 pass precisely so its FOR UPDATE row
 * lock would run in FastAPI's threadpool and not on the event loop. I verified that endpoint,
 * found 503 in 3.03 s under a held lock, and closed the ticket. The markers were on the wire and
 * the hang survived, because there is a SECOND site doing the same blocking work and it was never
 * moved:
 *
 *   api_server.py:3606  async def auth_middleware(...)          <- runs ON the event loop
 *   api_server.py:3726      _require_active_chart_window(...)   <- sync def
 *   api_server.py:14299         db = SessionLocal()             <- blocking psycopg query
 *
 * Every request to /api/file/* and /api/sessions/N/state therefore performs a synchronous database
 * round-trip on the event loop thread. While it runs, that worker cannot progress ANY other
 * request — not other tabs, not other users, not static assets. That is a whole-app freeze with no
 * console error and no server log, which is the symptom as reported, and it gets worse with the
 * number of open windows, which is why it voided a 10x measurement.
 *
 * This measures it the way a user feels it: put concurrent GATED load on the server, and from a
 * separate connection ask a trivial endpoint how long it takes to answer. That trivial latency IS
 * the hang. An equal volume of UNGATED load is the control: if the loop only stalls under gated
 * load, the gate is the cause and not general load.
 */
import http from 'node:http';
import fs from 'node:fs';

const HOST = '127.0.0.1', PORT = 3000;
const CONC = Number(process.env.CONC || 12);
const PROBES = Number(process.env.PROBES || 40);

const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8').split('\n')
    .filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));

function req(path, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const r = http.request({ host: HOST, port: PORT, path, method, headers }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({
        status: res.statusCode,
        ms: Number(process.hrtime.bigint() - t0) / 1e6,
        headers: res.headers, body: d,
      }));
    });
    r.on('error', (e) => resolve({ status: 0, ms: Number(process.hrtime.bigint() - t0) / 1e6, err: String(e) }));
    if (body) r.write(body);
    r.end();
  });
}

async function login(email, password) {
  const b = JSON.stringify({ email, password });
  const r = await req('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) },
    body: b,
  });
  const sc = r.headers && r.headers['set-cookie'];
  if (!sc) return null;
  return sc.map(c => c.split(';')[0]).join('; ');
}

const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;

/**
 * Hold `CONC` requests to `loadPath` in flight while repeatedly timing `/api/health`.
 * The health endpoint touches nothing; any latency it shows is the event loop being unavailable.
 */
async function measureUnderLoad(label, loadPath, cookie, windowId) {
  const headers = { Cookie: cookie };
  if (windowId) headers['X-Talaria-Chart-Window-Id'] = windowId;

  let stop = false;
  const loadStats = [];
  const pump = async () => {
    while (!stop) {
      const r = await req(loadPath, { headers });
      loadStats.push({ status: r.status, ms: r.ms });
    }
  };
  const pumps = Array.from({ length: CONC }, pump);

  await new Promise(r => setTimeout(r, 400));           // let load establish
  const probes = [];
  for (let i = 0; i < PROBES; i++) {
    const h = await req('/api/health');
    probes.push(h.ms);
    await new Promise(r => setTimeout(r, 25));
  }
  stop = true;
  await Promise.all(pumps);

  const codes = loadStats.reduce((a, s) => { a[s.status] = (a[s.status] || 0) + 1; return a; }, {});
  return {
    label,
    health: { med: pct(probes, 0.5), p95: pct(probes, 0.95), max: Math.max(...probes) },
    load: { n: loadStats.length, codes, med: pct(loadStats.map(s => s.ms), 0.5) },
  };
}

// ---- setup ----
const cookie = await login(env.TEST_EMAIL, env.TEST_PASSWORD);
if (!cookie) { console.log('ABORT: login failed'); process.exit(2); }

const windowId = 'k4probe' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const cb = JSON.stringify({ client_id: windowId });
const claimed = await req('/api/chart/windows/claim', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cb), Cookie: cookie },
  body: cb,
});
console.log(`claim -> ${claimed.status}   window ${windowId}`);

const filesRes = await req('/api/files', { headers: { Cookie: cookie } });
let fileId = null;
try {
  const j = JSON.parse(filesRes.body);
  const arr = Array.isArray(j) ? j : (j.files || j.data || []);
  fileId = arr.length ? (arr[0].id ?? arr[0].file_id) : null;
} catch {}
if (!fileId) { console.log('ABORT: no file'); process.exit(2); }
console.log(`fileId ${fileId}   concurrency ${CONC}   ${PROBES} health probes per arm`);
console.log('');

// ---- idle baseline ----
const idle = [];
for (let i = 0; i < 20; i++) { idle.push((await req('/api/health')).ms); await new Promise(r => setTimeout(r, 20)); }
console.log(`IDLE           /api/health  med ${pct(idle, 0.5).toFixed(1)}ms  p95 ${pct(idle, 0.95).toFixed(1)}ms  max ${Math.max(...idle).toFixed(1)}ms`);

// ---- control: ungated load of the same volume ----
const ungated = await measureUnderLoad('UNGATED LOAD', '/api/files', cookie, windowId);
console.log(`UNGATED  load  /api/health  med ${ungated.health.med.toFixed(1)}ms  p95 ${ungated.health.p95.toFixed(1)}ms  max ${ungated.health.max.toFixed(1)}ms` +
            `   | ${ungated.load.n} reqs ${JSON.stringify(ungated.load.codes)}`);

// ---- the gated path: same volume, plus the middleware's blocking DB query ----
const gated = await measureUnderLoad('GATED LOAD', `/api/file/${fileId}/bars?resolution=1m&limit=10`, cookie, windowId);
console.log(`GATED    load  /api/health  med ${gated.health.med.toFixed(1)}ms  p95 ${gated.health.p95.toFixed(1)}ms  max ${gated.health.max.toFixed(1)}ms` +
            `   | ${gated.load.n} reqs ${JSON.stringify(gated.load.codes)}`);

console.log('');
const ratio = gated.health.p95 / Math.max(1, ungated.health.p95);
console.log('=== reading ===');
console.log(`  a trivial endpoint that touches nothing answers in ${pct(idle, 0.5).toFixed(1)}ms when the server is idle.`);
console.log(`  under equal-volume UNGATED load it answers in ${ungated.health.p95.toFixed(1)}ms at p95.`);
console.log(`  under GATED load it answers in ${gated.health.p95.toFixed(1)}ms at p95  (${ratio.toFixed(1)}x the control).`);
console.log('');
console.log(gated.health.p95 > 250 && ratio > 3
  ? 'K4_EVENT_LOOP_STALL_CONFIRMED — gated traffic makes the whole worker unresponsive.'
  : 'K4_NO_STALL_AT_THIS_CONCURRENCY');

fs.writeFileSync('/root/b-k4/stall-evidence.json', JSON.stringify({ CONC, PROBES, idle, ungated, gated }, null, 2));
