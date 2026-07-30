#!/usr/bin/env node
/**
 * Behavioural P0 repro — live canary (TEST-02).
 *
 * Director route: reload chart tab, open a second tab. Markers in
 * chart-window-limit.js are NOT the close condition; timings are.
 *
 *   TEST_EMAIL=… TEST_PASSWORD=… node p0-window-claim-behavioural-live.mjs
 *
 * Never logs credentials. Evidence JSON under _evidence/manager-B/ (EVID-02).
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..', '..');
const require = createRequire(
  join(REPO, 'chart v 1.4', 'chart', 'multichart-prod', 'harness') + '/',
);
const puppeteer = require('puppeteer');

const BASE = process.env.TALARIA_TEST_BASE_URL || 'http://31.97.192.82:3000';
const email = process.env.TEST_EMAIL;
const password = process.env.TEST_PASSWORD;
if (!email || !password) {
  console.error('TEST_EMAIL and TEST_PASSWORD required');
  process.exit(2);
}

const OBSERVE_MS = Number(process.env.P0_OBSERVE_MS || 45000);
const NAV_TIMEOUT = Number(process.env.P0_NAV_TIMEOUT_MS || 90000);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir =
  process.env.P0_EVIDENCE_DIR ||
  'c:/Users/user/Desktop/talaria1/_evidence/manager-B/p0-window-claim-behavioural';
mkdirSync(outDir, { recursive: true });

function now() {
  return Date.now();
}

async function loginCookie() {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const set =
    typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const raw = set.length ? set : [r.headers.get('set-cookie')].filter(Boolean);
  const cookie = raw.map((c) => String(c).split(';')[0]).join('; ');
  if (!r.ok || !cookie) throw new Error(`login failed ${r.status}`);
  return cookie;
}

async function wireMarkers() {
  const r = await fetch(`${BASE}/chart/modules/chart-window-limit.js`);
  const body = await r.text();
  return {
    status: r.status,
    bytes: body.length,
    CONTROL_TIMEOUT_MS: body.includes('CONTROL_TIMEOUT_MS'),
    controlFetch: body.includes('controlFetch'),
    AbortController: body.includes('AbortController'),
    kill: body.includes('__TALARIA_DISABLE_WINDOW_CONTROL_FETCH_TIMEOUT_V1'),
  };
}

async function apiClaimBurst(cookie) {
  const rows = [];
  const ids = [
    `behA${Date.now().toString(36)}`,
    `behB${Date.now().toString(36)}`,
  ];
  async function one(id, label) {
    const t0 = now();
    try {
      const res = await fetch(`${BASE}/api/chart/windows/claim`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie,
        },
        body: JSON.stringify({ client_id: id }),
        signal: AbortSignal.timeout(65000),
      });
      const j = await res.json().catch(() => ({}));
      const row = {
        label,
        status: res.status,
        ms: now() - t0,
        ok: j.ok,
        evicted: (j.evicted_client_ids || []).length,
      };
      rows.push(row);
      console.log(`api-claim ${label} status=${row.status} ms=${row.ms}`);
      return row;
    } catch (e) {
      const row = { label, err: e.name || String(e), ms: now() - t0 };
      rows.push(row);
      console.log(`api-claim ${label} ERR ${row.err} ms=${row.ms}`);
      return row;
    }
  }
  await one(ids[0], 'seq-A');
  await one(ids[1], 'seq-B');
  await Promise.all([one(ids[0], 'par-A'), one(ids[1], 'par-B')]);
  await Promise.all([one(ids[0], 'par2-A'), one(ids[1], 'par2-B')]);
  return rows;
}

function attachNet(page, label, sink) {
  page.on('request', (req) => {
    const u = req.url();
    if (!/\/api\/chart\/windows\/(claim|release|heartbeat)/.test(u) &&
        !/\/api\/file\//.test(u) &&
        !/\/api\/sessions\/\d+\/state/.test(u) &&
        !/\/api\/auth\/me/.test(u)) {
      return;
    }
    sink.push({
      t: now(),
      label,
      kind: 'req',
      method: req.method(),
      url: u.replace(BASE, ''),
    });
  });
  page.on('response', async (res) => {
    const u = res.url();
    if (!/\/api\/chart\/windows\/(claim|release|heartbeat)/.test(u) &&
        !/\/api\/file\//.test(u) &&
        !/\/api\/sessions\/\d+\/state/.test(u) &&
        !/\/api\/auth\/me/.test(u)) {
      return;
    }
    sink.push({
      t: now(),
      label,
      kind: 'res',
      status: res.status(),
      url: u.replace(BASE, ''),
    });
  });
  page.on('requestfailed', (req) => {
    const u = req.url();
    if (!/\/api\//.test(u)) return;
    sink.push({
      t: now(),
      label,
      kind: 'fail',
      url: u.replace(BASE, ''),
      err: req.failure()?.errorText || 'fail',
    });
  });
}

async function seedCookies(page, cookieHeader) {
  const parts = cookieHeader.split(';').map((s) => s.trim()).filter(Boolean);
  const cookies = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    cookies.push({
      name: part.slice(0, eq),
      value: part.slice(eq + 1),
      url: BASE,
    });
  }
  await page.setCookie(...cookies);
}

async function chartUrl(page) {
  // Prefer multichart-prod shell if present; fall back to dist-v9.
  const candidates = [
    `${BASE}/chart/multichart-prod/`,
    `${BASE}/chart/dist-v9/`,
    `${BASE}/chart/`,
  ];
  for (const u of candidates) {
    const r = await fetch(u, { redirect: 'manual' });
    if (r.status >= 200 && r.status < 400) return u;
  }
  return candidates[0];
}

async function pageSnapshot(page, label) {
  try {
    return await page.evaluate((lab) => {
      const pin =
        window.__TALARIA_CHART_BUILD_ID ||
        document.documentElement?.dataset?.buildId ||
        null;
      const blocked = !!window.__talariaChartWindowBlocked;
      const overlay = !!document.getElementById('talariaWindowLimitOverlay');
      const title = document.title || '';
      return {
        label: lab,
        href: location.href,
        title,
        pin,
        blocked,
        overlay,
        ready: document.readyState,
      };
    }, label);
  } catch (e) {
    return { label, err: String(e.message || e) };
  }
}

async function timedAuthMe(page) {
  return page.evaluate(async () => {
    const t0 = performance.now();
    try {
      const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
      return { ok: r.ok, status: r.status, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      return { ok: false, err: String(e.message || e), ms: Math.round(performance.now() - t0) };
    }
  });
}

async function timedClaimFromPage(page, clientId) {
  return page.evaluate(async (id) => {
    const t0 = performance.now();
    try {
      const r = await fetch('/api/chart/windows/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: id }),
        cache: 'no-store',
      });
      const j = await r.json().catch(() => ({}));
      return {
        status: r.status,
        ms: Math.round(performance.now() - t0),
        ok: j.ok,
        evicted: (j.evicted_client_ids || []).length,
      };
    } catch (e) {
      return { err: String(e.message || e), ms: Math.round(performance.now() - t0) };
    }
  }, clientId);
}

const report = {
  stamp,
  base: BASE,
  observeMs: OBSERVE_MS,
  markers: null,
  apiClaims: [],
  net: [],
  steps: [],
  snapshots: [],
  authMe: [],
  pageClaims: [],
  pendingAtEnd: [],
  verdict: null,
};

console.log(`base=${BASE} observe=${OBSERVE_MS}ms`);
report.markers = await wireMarkers();
console.log('markers', JSON.stringify(report.markers));

const cookie = await loginCookie();
console.log('login ok');
report.apiClaims = await apiClaimBurst(cookie);

const target = await chartUrl();
console.log('chart target', target);

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-http2'],
});

try {
  const tab1 = await browser.newPage();
  attachNet(tab1, 'tab1', report.net);
  await seedCookies(tab1, cookie);

  console.log('STEP 1: open chart tab');
  const tOpen = now();
  await tab1.goto(target, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch((e) => {
    report.steps.push({ step: 'open', err: String(e.message || e), ms: now() - tOpen });
  });
  report.steps.push({ step: 'open', ms: now() - tOpen, url: tab1.url() });
  await new Promise((r) => setTimeout(r, 4000));
  report.snapshots.push(await pageSnapshot(tab1, 'tab1-after-open'));
  report.authMe.push({ when: 'after-open-tab1', ...(await timedAuthMe(tab1)) });
  report.pageClaims.push({
    when: 'after-open-tab1',
    ...(await timedClaimFromPage(tab1, `pageA${Date.now().toString(36)}`)),
  });

  console.log('STEP 2: reload chart tab');
  const tRel = now();
  await tab1.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch((e) => {
    report.steps.push({ step: 'reload', err: String(e.message || e), ms: now() - tRel });
  });
  report.steps.push({ step: 'reload', ms: now() - tRel, url: tab1.url() });
  await new Promise((r) => setTimeout(r, 4000));
  report.snapshots.push(await pageSnapshot(tab1, 'tab1-after-reload'));

  console.log('STEP 3: open second chart tab');
  const tab2 = await browser.newPage();
  attachNet(tab2, 'tab2', report.net);
  await seedCookies(tab2, cookie);
  const t2 = now();
  await tab2.goto(target, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch((e) => {
    report.steps.push({ step: 'open-tab2', err: String(e.message || e), ms: now() - t2 });
  });
  report.steps.push({ step: 'open-tab2', ms: now() - t2, url: tab2.url() });

  console.log(`STEP 4: observe ${OBSERVE_MS}ms with both tabs live`);
  const observeStart = now();
  while (now() - observeStart < OBSERVE_MS) {
    await new Promise((r) => setTimeout(r, 5000));
    const me1 = await timedAuthMe(tab1).catch((e) => ({ err: String(e) }));
    const me2 = await timedAuthMe(tab2).catch((e) => ({ err: String(e) }));
    report.authMe.push({ when: `t+${now() - observeStart}`, tab1: me1, tab2: me2 });
    console.log(
      `t+${now() - observeStart} auth/me tab1=${JSON.stringify(me1)} tab2=${JSON.stringify(me2)}`,
    );
  }

  // Concurrent page-level claims while both tabs live (the contended lock path).
  const cid1 = `liveA${Date.now().toString(36)}`;
  const cid2 = `liveB${Date.now().toString(36)}`;
  const [c1, c2] = await Promise.all([
    timedClaimFromPage(tab1, cid1),
    timedClaimFromPage(tab2, cid2),
  ]);
  report.pageClaims.push({ when: 'dual-tab-parallel', tab1: c1, tab2: c2 });
  console.log('dual-tab parallel claims', c1, c2);

  report.snapshots.push(await pageSnapshot(tab1, 'tab1-end'));
  report.snapshots.push(await pageSnapshot(tab2, 'tab2-end'));

  for (const [page, label] of [
    [tab1, 'tab1'],
    [tab2, 'tab2'],
  ]) {
    try {
      const pending = await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .filter((e) => /\/api\/(chart\/windows|file\/|sessions\/)/.test(e.name))
          .map((e) => ({
            name: e.name.replace(location.origin, ''),
            duration: Math.round(e.duration),
            transferSize: e.transferSize,
          }))
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 20),
      );
      report.pendingAtEnd.push({ label, pending });
    } catch (e) {
      report.pendingAtEnd.push({ label, err: String(e.message || e) });
    }
  }
} finally {
  await browser.close().catch(() => {});
}

// Summarise hung control / gated responses from net log.
function summariseNet(net) {
  const open = new Map();
  const closed = [];
  for (const ev of net) {
    const key = `${ev.label}|${ev.method || ''}|${ev.url}`;
    if (ev.kind === 'req') {
      open.set(`${key}|${ev.t}`, { ...ev, key });
    } else if (ev.kind === 'res' || ev.kind === 'fail') {
      // match latest open with same label+url
      let best = null;
      let bestK = null;
      for (const [k, v] of open) {
        if (v.label === ev.label && v.url === ev.url) {
          if (!best || v.t > best.t) {
            best = v;
            bestK = k;
          }
        }
      }
      if (bestK) {
        open.delete(bestK);
        closed.push({
          label: ev.label,
          url: ev.url,
          status: ev.status || null,
          err: ev.err || null,
          ms: ev.t - best.t,
        });
      }
    }
  }
  const stillOpen = [...open.values()].map((v) => ({
    label: v.label,
    url: v.url,
    method: v.method,
    openForMs: now() - v.t,
  }));
  return { closed, stillOpen };
}

report.netSummary = summariseNet(report.net);

const slowClosed = (report.netSummary.closed || []).filter((r) => r.ms >= 9000);
const apiSlow = report.apiClaims.filter((r) => (r.ms || 0) >= 9000 || r.err);
const pageSlow = report.pageClaims.filter((r) => {
  if (r.ms >= 9000 || r.err) return true;
  if (r.tab1 && (r.tab1.ms >= 9000 || r.tab1.err)) return true;
  if (r.tab2 && (r.tab2.ms >= 9000 || r.tab2.err)) return true;
  return false;
});
const stillOpen = report.netSummary.stillOpen || [];

const hangSurvived =
  stillOpen.length > 0 ||
  slowClosed.length > 0 ||
  apiSlow.length > 0 ||
  pageSlow.length > 0;

report.verdict = {
  markersPresent:
    report.markers.CONTROL_TIMEOUT_MS &&
    report.markers.controlFetch &&
    report.markers.AbortController &&
    report.markers.kill,
  hangSurvived,
  stillOpenCount: stillOpen.length,
  slowClosedCount: slowClosed.length,
  apiSlowCount: apiSlow.length,
  pageSlowCount: pageSlow.length,
  note: hangSurvived
    ? 'P0 REOPEN CONFIRMED behaviourally: timeout markers present AND path still slow/hangs'
    : 'No ≥9s hang observed in this run — not a close; intermittent stalls need more arms',
};

const outJson = join(outDir, `behavioural-${stamp}.json`);
writeFileSync(outJson, JSON.stringify(report, null, 2));
console.log('\nVERDICT', JSON.stringify(report.verdict, null, 2));
console.log('wrote', outJson);
console.log(
  'stillOpen',
  stillOpen.slice(0, 10),
  'slowClosed',
  slowClosed.slice(0, 10),
);

process.exit(hangSurvived ? 0 : 0);
