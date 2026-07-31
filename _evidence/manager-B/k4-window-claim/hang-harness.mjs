/**
 * K4 — the hang, measured. Runs against any instance; used on the unfixed and fixed scratch alike.
 *
 * Mechanism under test:
 *   auth_middleware is `async def`, so it runs ON the event loop. For every /api/file/* and
 *   /api/sessions/N/state it calls the sync `_require_active_chart_window`, which does
 *   `SessionLocal()` + a query. Checking a connection out of the pool is a BLOCKING call, and the
 *   pool is 10+20 per worker with a 30 s checkout timeout.
 *
 *   Concurrent claims are `def` endpoints, so FastAPI runs them in the threadpool — that was the
 *   previous P0 fix, and it is correct in isolation. But each one takes a FOR UPDATE row lock on
 *   the user with lock_timeout 3 s, so under contention they sit there HOLDING a pool connection.
 *   Enough of them and the pool is empty; the middleware's checkout then blocks the event loop,
 *   and that worker serves nobody — not other tabs, not other users, not static files.
 *
 * The probe is an unauthenticated request that returns 401 in about a millisecond. It touches no
 * database. Any latency it shows is the event loop being unavailable, which is what a user
 * experiences as the app hanging.
 *
 * `reload the tab and open a second one`, and C's 10x run, are both just "several windows claim at
 * once" — the condition below, at a smaller N.
 */
import http from 'node:http';
import fs from 'node:fs';

const PORT = Number(process.env.PORT || 3101);
const HOST = '127.0.0.1';
const CLAIMS = Number(process.env.CLAIMS || 80);
const SECS = Number(process.env.SECS || 12);
const LABEL = process.env.LABEL || `port ${PORT}`;

const env = Object.fromEntries(
  fs.readFileSync('/root/.talaria-test-env', 'utf8').split('\n')
    .filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).replace(/^export\s+/, '').trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }));

function req(path, { port = PORT, method = 'GET', headers = {}, body = null, timeout = 60000 } = {}) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const r = http.request({ host: HOST, port, path, method, headers, timeout }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, ms: Number(process.hrtime.bigint() - t0) / 1e6, headers: res.headers, body: d }));
    });
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, ms: Number(process.hrtime.bigint() - t0) / 1e6, timedOut: true }); });
    r.on('error', () => resolve({ status: 0, ms: Number(process.hrtime.bigint() - t0) / 1e6, err: true }));
    if (body) r.write(body);
    r.end();
  });
}

async function login(port) {
  const b = JSON.stringify({ email: env.TEST_EMAIL, password: env.TEST_PASSWORD });
  const r = await req('/api/auth/login', { port, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) }, body: b });
  const sc = r.headers && r.headers['set-cookie'];
  return sc ? sc.map(c => c.split(';')[0]).join('; ') : null;
}

const pct = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
const probe = () => req('/api/health');    // 401 in ~1ms; no DB. Latency here == loop unavailable.

const cookie = await login(PORT);
if (!cookie) { console.log('ABORT: login failed'); process.exit(2); }

// ---- idle ----
const idle = [];
for (let i = 0; i < 25; i++) { idle.push((await probe()).ms); await new Promise(r => setTimeout(r, 20)); }
console.log(`[${LABEL}] IDLE   loop probe  med ${pct(idle, 0.5).toFixed(1)}ms  p95 ${pct(idle, 0.95).toFixed(1)}ms  max ${Math.max(...idle).toFixed(1)}ms`);

// ---- load: many windows claiming at once ----
let stop = false;
const claimStats = [];
const claimer = async (n) => {
  while (!stop) {
    const id = `k4w${n}x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const b = JSON.stringify({ client_id: id });
    const r = await req('/api/chart/windows/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b), Cookie: cookie },
    body: b });
    claimStats.push({ status: r.status, ms: r.ms });
  }
};
const claimers = Array.from({ length: CLAIMS }, (_, i) => claimer(i));

// The other half of the condition. Claims drain the pool from the THREADPOOL; these gated
// requests are what makes the EVENT LOOP itself wait for a connection, because their presence
// check runs inline in the async middleware. Neither alone freezes the loop; together they do,
// and together is simply "windows are open and charts are loading", i.e. normal use.
const gatedStats = [];
let fileId = null;
try {
  const fr = await req('/api/files', { headers: { Cookie: cookie } });
  const j = JSON.parse(fr.body);
  const arr = Array.isArray(j) ? j : (j.files || j.data || []);
  fileId = arr.length ? (arr[0].id ?? arr[0].file_id) : null;
} catch { /* fall through */ }
if (!fileId) { console.log('ABORT: no file to make a gated request against'); process.exit(2); }

const GATED = Number(process.env.GATED || 40);
const gatedWindow = 'k4gate' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
{
  const b = JSON.stringify({ client_id: gatedWindow });
  await req('/api/chart/windows/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b), Cookie: cookie },
    body: b });
}
const gater = async () => {
  while (!stop) {
    const r = await req(`/api/file/${fileId}/bars?resolution=1m&limit=10`, {
      headers: { Cookie: cookie, 'X-Talaria-Chart-Window-Id': gatedWindow } });
    gatedStats.push({ status: r.status, ms: r.ms });
  }
};
const gaters = Array.from({ length: GATED }, gater);

await new Promise(r => setTimeout(r, 500));
const under = [];
const canaryDuring = [];
const t0 = Date.now();
while (Date.now() - t0 < SECS * 1000) {
  under.push((await probe()).ms);
  if (under.length % 5 === 0) canaryDuring.push((await req('/api/health', { port: 3000 })).ms);
  await new Promise(r => setTimeout(r, 30));
}
stop = true;
await Promise.all([...claimers, ...gaters]);

const codes = claimStats.reduce((a, s) => { a[s.status] = (a[s.status] || 0) + 1; return a; }, {});
const gcodes = gatedStats.reduce((a, s) => { a[s.status] = (a[s.status] || 0) + 1; return a; }, {});
console.log(`[${LABEL}] LOAD   ${CLAIMS} concurrent claimers, ${claimStats.length} claims ${JSON.stringify(codes)}` +
            `  claim med ${pct(claimStats.map(s => s.ms), 0.5).toFixed(0)}ms max ${Math.max(...claimStats.map(s => s.ms)).toFixed(0)}ms`);
console.log(`[${LABEL}]        ${GATED} concurrent gated readers, ${gatedStats.length} reqs ${JSON.stringify(gcodes)}` +
            `  gated med ${pct(gatedStats.map(s => s.ms), 0.5).toFixed(0)}ms max ${Math.max(...gatedStats.map(s => s.ms)).toFixed(0)}ms`);
console.log(`[${LABEL}] UNDER  loop probe  med ${pct(under, 0.5).toFixed(1)}ms  p95 ${pct(under, 0.95).toFixed(1)}ms  max ${Math.max(...under).toFixed(1)}ms   (n=${under.length})`);

const over1s = under.filter(m => m >= 1000).length;
const over5s = under.filter(m => m >= 5000).length;
console.log(`[${LABEL}]        probes over 1s: ${over1s}/${under.length}   over 5s: ${over5s}/${under.length}`);
console.log(`[${LABEL}] canary on :3000 during the run  med ${pct(canaryDuring, 0.5).toFixed(1)}ms  max ${Math.max(...canaryDuring).toFixed(1)}ms  (isolation check)`);

const verdict = over1s > 0
  ? `K4_HANG_PRESENT  (${over1s} probes over 1s, worst ${Math.max(...under).toFixed(0)}ms)`
  : 'K4_NO_HANG';
console.log(`[${LABEL}] ${verdict}`);

fs.appendFileSync('/root/b-k4/hang-harness.jsonl', JSON.stringify({
  label: LABEL, port: PORT, CLAIMS, SECS,
  idle: { med: pct(idle, 0.5), p95: pct(idle, 0.95), max: Math.max(...idle) },
  under: { med: pct(under, 0.5), p95: pct(under, 0.95), max: Math.max(...under), n: under.length, over1s, over5s },
  claims: { n: claimStats.length, codes },
  gated: { n: gatedStats.length, codes: gcodes, med: pct(gatedStats.map(s => s.ms), 0.5), max: Math.max(...gatedStats.map(s => s.ms)) },
  canaryDuring: { med: pct(canaryDuring, 0.5), max: Math.max(...canaryDuring) },
  ts: new Date().toISOString(),
}) + '\n');

process.exit(over1s > 0 ? 1 : 0);
