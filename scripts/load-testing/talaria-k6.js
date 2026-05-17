import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics (same style as your load_test.js)
const errorRate = new Rate('errors');
const pageLoadTime = new Trend('page_load_time');
const rateLimited = new Counter('rate_limited');
const serverErrors = new Counter('server_errors');

// ─── Test configuration (same pattern as load_test.js) ───────────────────────
const BASE_URL = (__ENV.K6_BASE_URL || 'http://31.97.192.82:3000').replace(/\/$/, '');

// Optional: set K6_FILE_ID=36 if /api/files returns nothing
const FILE_ID = __ENV.K6_FILE_ID ? String(__ENV.K6_FILE_ID) : '';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 50 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.10'],
    errors: ['rate<0.30'],
  },
};

// File IDs discovered once in setup (used for /smart)
let chartFileIds = [];

function pickFileId() {
  if (FILE_ID) return FILE_ID;
  if (!chartFileIds.length) return '';
  return String(chartFileIds[Math.floor(Math.random() * chartFileIds.length)]);
}

function recordRequest(res, checksPassed) {
  errorRate.add(!checksPassed);
  pageLoadTime.add(res.timings.duration);
  if (res.status === 429) rateLimited.add(1);
  if (res.status === 0 || res.status >= 500) serverErrors.add(1);
}

// ─── Main test (like your load_test.js + API) ────────────────────────────────
export default function () {
  // 1. Homepage
  const homeRes = http.get(`${BASE_URL}/`, {
    tags: { name: 'homepage' },
    timeout: '15s',
  });

  const homeOk = check(homeRes, {
    'homepage status is 200': (r) => r.status === 200,
    'homepage loads under 5s': (r) => r.timings.duration < 5000,
    'homepage has content': (r) => r.body && r.body.length > 0,
  });

  recordRequest(homeRes, homeOk);
  sleep(1);

  // 2. API health (lightweight)
  const statusRes = http.get(`${BASE_URL}/api/status`, {
    tags: { name: 'api_status' },
    timeout: '15s',
  });

  const statusOk = check(statusRes, {
    'api/status is 200': (r) => r.status === 200,
    'api/status under 3s': (r) => r.timings.duration < 3000,
  });

  recordRequest(statusRes, statusOk);
  sleep(1);

  // 3. Chart data (backtest hot path) — skipped if no file id
  const fid = pickFileId();
  if (fid) {
    const smartUrl =
      `${BASE_URL}/api/file/${fid}/smart?timeframe=1m&limit=2000&anchor=end&response_format=csv`;
    const smartRes = http.get(smartUrl, {
      tags: { name: 'api_smart' },
      timeout: '15s',
    });

    const smartOk =
      smartRes.status === 429 ||
      check(smartRes, {
        'smart status 200 or 429': (r) => r.status === 200 || r.status === 429,
        'smart loads under 5s': (r) => r.timings.duration < 5000,
        'smart has body': (r) => r.status === 429 || ((r.body || '').length > 50),
      });

    recordRequest(smartRes, smartOk);
  }

  sleep(Math.random() * 2 + 1);
}

// ─── Setup (like your load_test.js) ──────────────────────────────────────────
export function setup() {
  console.log('Starting load test against: ' + BASE_URL);

  const res = http.get(BASE_URL, { timeout: '15s' });
  console.log('Server homepage status: ' + res.status);

  const st = http.get(`${BASE_URL}/api/status`, { timeout: '15s' });
  console.log('API /api/status: ' + st.status);

  chartFileIds = [];
  if (FILE_ID) {
    chartFileIds = [FILE_ID];
    console.log('Using K6_FILE_ID=' + FILE_ID);
  } else {
    const filesRes = http.get(`${BASE_URL}/api/files?session_ready=1`, { timeout: '15s' });
    if (filesRes.status === 200) {
      try {
        const data = JSON.parse(filesRes.body);
        chartFileIds = (data.files || [])
          .map(function (f) { return f && f.id ? String(f.id) : ''; })
          .filter(function (id) { return id; })
          .slice(0, 20);
      } catch (e) {
        console.log('Could not parse /api/files JSON');
      }
    }
    if (!chartFileIds.length) {
      const allRes = http.get(`${BASE_URL}/api/files`, { timeout: '15s' });
      if (allRes.status === 200) {
        try {
          const data = JSON.parse(allRes.body);
          chartFileIds = (data.files || [])
            .slice(0, 10)
            .map(function (f) { return String(f.id); });
        } catch (e) { /* ignore */ }
      }
    }
  }

  if (chartFileIds.length) {
    console.log('Chart file IDs for /smart: ' + chartFileIds.slice(0, 5).join(', '));
  } else {
    console.log('WARN: no file IDs — only homepage + /api/status will be tested');
    console.log('Set K6_FILE_ID=36 (or any id from your VPS) to include /smart');
  }

  return { ok: res.status === 200 };
}

// ─── Teardown (like your load_test.js) ───────────────────────────────────────
export function teardown() {
  console.log('Load test complete. Check http_req_failed vs errors (slow pages count in errors).');
}
