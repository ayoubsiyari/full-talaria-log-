/**
 * Talaria k6 load test
 *
 * REQUIRED:
 *   set K6_TEST_EMAIL=...
 *   set K6_TEST_PASSWORD=...
 *
 * Auth modes (default = shared — one login, all VUs use same session):
 *   K6_SHARED_SESSION=1   → 1 user, many parallel requests (good for API capacity)
 *   K6_SHARED_SESSION=0   → each VU logs in (needs max_sessions >= K6_VUS_MAX on that user)
 *
 *   set K6_BASE_URL=http://31.97.192.82:3000
 *   set K6_FILE_ID=36
 *   set K6_VUS_MAX=200
 *   k6 run load_test.js
 */
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate = new Rate('errors');
const pageLoadTime = new Trend('page_load_time');
const rateLimited = new Counter('rate_limited');
const authFailed = new Counter('auth_failed');

const BASE_URL = (__ENV.K6_BASE_URL || 'http://31.97.192.82:3000').replace(/\/$/, '');
const FILE_ID = __ENV.K6_FILE_ID || '';
const TEST_EMAIL = __ENV.K6_TEST_EMAIL || '';
const TEST_PASSWORD = __ENV.K6_TEST_PASSWORD || '';
const PEAK = parseInt(__ENV.K6_VUS_MAX || '50', 10);
const REQ_TIMEOUT = __ENV.K6_TIMEOUT || '15s';
const SESSION_COOKIE = __ENV.K6_SESSION_COOKIE || 'session_id';
// Default shared session — avoids max_sessions=1 kicking 199 VUs off
const SHARED_SESSION = (__ENV.K6_SHARED_SESSION || '1') !== '0';

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

const vuJars = {};
let sharedCookieHeader = '';

function buildStages(peak) {
  if (peak <= 50) {
    return [
      { duration: '30s', target: 10 },
      { duration: '1m', target: 10 },
      { duration: '30s', target: 50 },
      { duration: '1m', target: 50 },
      { duration: '30s', target: 0 },
    ];
  }
  if (peak <= 200) {
    return [
      { duration: '1m', target: 25 },
      { duration: '1m', target: 50 },
      { duration: '1m', target: 100 },
      { duration: '2m', target: 100 },
      { duration: '1m', target: 200 },
      { duration: '4m', target: 200 },
      { duration: '1m', target: 0 },
    ];
  }
  const p = peak > 500 ? peak : 500;
  return [
    { duration: '1m', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 200 },
    { duration: '2m', target: 200 },
    { duration: '1m', target: p },
    { duration: '3m', target: p },
    { duration: '1m', target: 0 },
  ];
}

function buildThresholds(peak) {
  if (peak <= 50) {
    return {
      http_req_duration: ['p(95)<5000'],
      http_req_failed: ['rate<0.10'],
      errors: ['rate<0.30'],
    };
  }
  if (peak <= 200) {
    return {
      http_req_duration: ['p(95)<8000'],
      http_req_failed: ['rate<0.15'],
      errors: ['rate<0.35'],
      auth_failed: ['count<500'],
    };
  }
  return {
    http_req_duration: ['p(95)<15000'],
    http_req_failed: ['rate<0.20'],
    errors: ['rate<0.50'],
  };
}

export const options = {
  stages: buildStages(PEAK),
  thresholds: buildThresholds(PEAK),
};

let chartFileIds = [];

function cookieHeaderFromResponse(res) {
  const jar = res.cookies || {};
  const entries = jar[SESSION_COOKIE] || jar.session_id;
  if (entries && entries.length) {
    return SESSION_COOKIE + '=' + entries[0].value;
  }
  return '';
}

/** k6 2.x often omits res.cookies — read jar + Set-Cookie header. */
function extractSessionCookie(res, jar) {
  if (jar && typeof jar.cookiesForURL === 'function') {
    try {
      const forUrl = jar.cookiesForURL(BASE_URL);
      const list = forUrl && (forUrl[SESSION_COOKIE] || forUrl.session_id);
      if (list && list.length && list[0].value) {
        return SESSION_COOKIE + '=' + list[0].value;
      }
    } catch (e) {
      /* ignore */
    }
  }

  const fromRes = cookieHeaderFromResponse(res);
  if (fromRes) return fromRes;

  let setCookie = res.headers['Set-Cookie'] || res.headers['set-cookie'];
  if (!setCookie) {
    for (const key of Object.keys(res.headers || {})) {
      if (key.toLowerCase() === 'set-cookie') {
        setCookie = res.headers[key];
        break;
      }
    }
  }
  if (setCookie) {
    const parts = Array.isArray(setCookie) ? setCookie : [String(setCookie)];
    for (let i = 0; i < parts.length; i++) {
      const re = new RegExp(SESSION_COOKIE + '=([^;\\s,]+)', 'i');
      const m = String(parts[i]).match(re);
      if (m) return SESSION_COOKIE + '=' + m[1];
    }
  }

  return '';
}

function loginOnce() {
  const jar = http.cookieJar();
  const res = http.post(
    BASE_URL + '/api/auth/login',
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    Object.assign({}, JSON_HEADERS, { jar: jar, timeout: REQ_TIMEOUT })
  );
  return { res: res, cookie: extractSessionCookie(res, jar), jar: jar };
}

function authParams() {
  if (SHARED_SESSION && sharedCookieHeader) {
    return { headers: { Cookie: sharedCookieHeader }, timeout: REQ_TIMEOUT };
  }
  return { timeout: REQ_TIMEOUT };
}

function getVuJar() {
  if (SHARED_SESSION) {
    return null;
  }
  if (!vuJars[__VU]) {
    const out = loginOnce();
    vuJars[__VU] = out.jar;
    if (out.res.status !== 200) {
      authFailed.add(1);
    } else {
      sharedCookieHeader = out.cookie;
    }
  }
  return vuJars[__VU];
}

function requestOpts(tags, useAuth) {
  const o = { tags: tags, timeout: REQ_TIMEOUT };
  if (useAuth) {
    if (SHARED_SESSION && sharedCookieHeader) {
      o.headers = { Cookie: sharedCookieHeader };
    } else if (!SHARED_SESSION) {
      const jar = getVuJar();
      if (jar) {
        o.jar = jar;
      }
    }
  }
  return o;
}

function pickFileId() {
  if (FILE_ID) return FILE_ID;
  if (!chartFileIds.length) return '';
  return chartFileIds[Math.floor(Math.random() * chartFileIds.length)];
}

function record(res, ok) {
  errorRate.add(!ok);
  pageLoadTime.add(res.timings.duration);
  if (res.status === 429) rateLimited.add(1);
  if (res.status === 401 || res.status === 403) authFailed.add(1);
}

export default function (data) {
  if (SHARED_SESSION && data && data.cookie) {
    sharedCookieHeader = data.cookie;
  }

  const homeRes = http.get(BASE_URL + '/', requestOpts({ name: 'homepage' }, false));

  const homeOk = check(homeRes, {
    'homepage status is 200': (r) => r.status === 200,
    'homepage loads under 5s': (r) => r.timings.duration < 5000,
    'homepage has content': (r) => r.body && r.body.length > 0,
  });
  record(homeRes, homeOk);
  sleep(1);

  const statusRes = http.get(BASE_URL + '/api/status', requestOpts({ name: 'api_status' }, false));

  const statusOk = check(statusRes, {
    'api/status is 200': (r) => r.status === 200,
  });
  record(statusRes, statusOk);
  sleep(1);

  const fid = pickFileId();
  if (fid) {
    const smartRes = http.get(
      BASE_URL +
        '/api/file/' +
        fid +
        '/smart?timeframe=1m&limit=2000&anchor=end&response_format=csv',
      requestOpts({ name: 'api_smart' }, true)
    );
    const smartOk = check(smartRes, {
      'smart 200 or 429': (r) => r.status === 200 || r.status === 429,
      'smart not 401': (r) => r.status !== 401,
      'smart under 10s': (r) => r.timings.duration < 10000,
    });
    record(smartRes, smartOk);
  }

  sleep(Math.random() * 2 + 1);
}

export function setup() {
  console.log('=== Talaria load test ===');
  console.log('URL:  ' + BASE_URL);
  console.log('Peak: ' + PEAK + ' VUs');
  console.log('Auth: ' + (SHARED_SESSION ? 'shared session (1 login, all VUs)' : 'per-VU login'));
  console.log('');

  if (!TEST_EMAIL || !TEST_PASSWORD) {
    fail('Set K6_TEST_EMAIL and K6_TEST_PASSWORD');
  }

  const home = http.get(BASE_URL, { timeout: REQ_TIMEOUT });
  console.log('Homepage: ' + home.status);

  const login = loginOnce();
  if (login.res.status !== 200) {
    console.log('Login failed: HTTP ' + login.res.status);
    fail('Login failed');
  }
  console.log('Login: OK');

  let cookie = login.cookie;
  if (!cookie) {
    console.log('Login HTTP ' + login.res.status + ' — could not read session cookie.');
    console.log('Tip: upgrade k6 or check Set-Cookie from POST /api/auth/login');
    const sc = login.res.headers['Set-Cookie'] || login.res.headers['set-cookie'];
    if (sc) console.log('Set-Cookie: ' + JSON.stringify(sc).slice(0, 300));
    fail('No session cookie after login (see log above)');
  }
  sharedCookieHeader = cookie;
  console.log('Session cookie: captured (' + SESSION_COOKIE + '=…)');

  if (!SHARED_SESSION && PEAK > 1) {
    console.log('');
    console.log('WARN: K6_SHARED_SESSION=0 with ' + PEAK + ' VUs');
    console.log('  Set user max_sessions >= ' + PEAK + ' in admin, or use K6_SHARED_SESSION=1');
    console.log('');
  }

  if (FILE_ID) {
    chartFileIds = [FILE_ID];
  } else {
    const fr = http.get(BASE_URL + '/api/files?session_ready=1', {
      timeout: REQ_TIMEOUT,
      headers: { Cookie: cookie },
    });
    if (fr.status === 200) {
      try {
        const data = JSON.parse(fr.body);
        chartFileIds = (data.files || []).slice(0, 15).map(function (f) {
          return String(f.id);
        });
      } catch (e) {
        /* ignore */
      }
    }
  }

  const testFid = chartFileIds[0] || FILE_ID;
  if (testFid) {
    const smart = http.get(
      BASE_URL +
        '/api/file/' +
        testFid +
        '/smart?timeframe=1m&limit=500&anchor=end&response_format=csv',
      { timeout: REQ_TIMEOUT, headers: { Cookie: cookie } }
    );
    console.log('/smart probe (file ' + testFid + '): HTTP ' + smart.status);
    if (smart.status === 401) fail('/smart 401 after login');
    if (smart.status === 403) fail('/smart 403 — user needs chart subscription');
  }

  if (chartFileIds.length) {
    console.log('File IDs: ' + chartFileIds.slice(0, 5).join(', '));
  }
  console.log('');

  return { cookie: cookie };
}

export function teardown() {
  console.log('Done.');
}
