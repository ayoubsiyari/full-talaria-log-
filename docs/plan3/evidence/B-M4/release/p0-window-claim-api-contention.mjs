#!/usr/bin/env node
/** Authenticated claim/state contention against live canary — no browser. */
const BASE = process.env.TALARIA_TEST_BASE_URL || 'http://31.97.192.82:3000';
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
if (!email || !password) {
  console.error('TEST_EMAIL and TEST_PASSWORD required');
  process.exit(2);
}

async function login() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const set =
    typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const raw = set.length ? set : [r.headers.get('set-cookie')].filter(Boolean);
  const cookie = raw.map((c) => String(c).split(';')[0]).join('; ');
  if (!r.ok || !cookie) throw new Error(`login ${r.status}`);
  return cookie;
}

async function timed(label, fn) {
  const t0 = Date.now();
  try {
    const out = await fn();
    console.log(label, { ...out, ms: Date.now() - t0 });
    return { label, ...out, ms: Date.now() - t0 };
  } catch (e) {
    console.log(label, { err: e.name || String(e), ms: Date.now() - t0 });
    return { label, err: e.name || String(e), ms: Date.now() - t0 };
  }
}

const cookie = await login();
console.log('login ok');

const cwl = await fetch(`${BASE}/chart/modules/chart-window-limit.js`);
const body = await cwl.text();
console.log('cwl', {
  status: cwl.status,
  bytes: body.length,
  CONTROL_TIMEOUT_MS: body.includes('CONTROL_TIMEOUT_MS'),
  controlFetch: body.includes('controlFetch'),
});

async function claim(id) {
  const res = await fetch(`${BASE}/api/chart/windows/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ client_id: id }),
    signal: AbortSignal.timeout(65000),
  });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, ok: j.ok, evicted: (j.evicted_client_ids || []).length };
}

async function me() {
  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: { cookie },
    signal: AbortSignal.timeout(65000),
  });
  return { status: res.status };
}

const a = `apiA${Date.now().toString(36)}`;
const b = `apiB${Date.now().toString(36)}`;

await timed('claim-A', () => claim(a));
await timed('claim-B', () => claim(b));
await timed('me-idle', () => me());

console.log('--- parallel A+B claims x3 ---');
for (let i = 0; i < 3; i++) {
  const [ra, rb, rm] = await Promise.all([
    timed(`par${i}-A`, () => claim(a)),
    timed(`par${i}-B`, () => claim(b)),
    timed(`par${i}-me`, () => me()),
  ]);
  const slow = [ra, rb, rm].filter((r) => r.ms >= 9000 || r.err);
  if (slow.length) console.log('SLOW', slow);
}
