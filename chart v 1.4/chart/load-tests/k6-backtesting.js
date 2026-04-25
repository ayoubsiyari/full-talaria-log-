import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const FILE_ID = __ENV.FILE_ID || '1';
const TF = __ENV.TIMEFRAME || '1m';
const CANDLE_LIMIT = Number(__ENV.CANDLE_LIMIT || 3000);

export const options = {
  scenarios: {
    candles_pan: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.CANDLES_RPS || 15),
      timeUnit: '1s',
      duration: __ENV.DURATION || '2m',
      preAllocatedVUs: Number(__ENV.CANDLES_VUS || 25),
      maxVUs: Number(__ENV.CANDLES_MAX_VUS || 100),
      exec: 'panCandles',
    },
    tiles_stream: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.TILES_RPS || 50),
      timeUnit: '1s',
      duration: __ENV.DURATION || '2m',
      preAllocatedVUs: Number(__ENV.TILES_VUS || 30),
      maxVUs: Number(__ENV.TILES_MAX_VUS || 120),
      exec: 'fetchTile',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:candles}': ['p(95)<450', 'p(99)<900'],
    'http_req_duration{endpoint:tiles}': ['p(95)<200', 'p(99)<500'],
  },
};

export function setup() {
  const tileMetaRes = http.get(`${BASE_URL}/api/file/${FILE_ID}/tile-meta/${TF}`);
  check(tileMetaRes, {
    'tile-meta status 200': (r) => r.status === 200,
  });

  let tileCount = 1;
  try {
    if (tileMetaRes.status === 200) {
      const parsed = tileMetaRes.json();
      tileCount = Math.max(1, Number(parsed.tile_count || 1));
    }
  } catch (_) {
    tileCount = 1;
  }

  const candlesRes = http.get(
    `${BASE_URL}/api/file/${FILE_ID}/candles?timeframe=${encodeURIComponent(TF)}&limit=${CANDLE_LIMIT}`
  );
  check(candlesRes, {
    'initial candles status 200': (r) => r.status === 200,
  });

  let seedCursor = null;
  try {
    if (candlesRes.status === 200) {
      const payload = candlesRes.json();
      seedCursor = payload?.prev_cursor || payload?.next_cursor || null;
    }
  } catch (_) {
    seedCursor = null;
  }

  return { tileCount, seedCursor };
}

export function panCandles(data) {
  const direction = Math.random() < 0.7 ? 'backward' : 'forward';
  const cursor = data?.seedCursor ? `&cursor=${encodeURIComponent(String(data.seedCursor))}` : '';
  const url =
    `${BASE_URL}/api/file/${FILE_ID}/candles?timeframe=${encodeURIComponent(TF)}` +
    `&limit=${CANDLE_LIMIT}&direction=${direction}${cursor}`;

  const res = http.get(url, { tags: { endpoint: 'candles' } });
  check(res, {
    'candles status 200': (r) => r.status === 200,
    'candles has payload': (r) => {
      try {
        const body = r.json();
        return !!body && Array.isArray(body?.data?.t);
      } catch (_) {
        return false;
      }
    },
  });

  sleep(0.05);
}

export function fetchTile(data) {
  const maxTiles = Math.max(1, Number(data?.tileCount || 1));
  const idx = Math.floor(Math.random() * maxTiles);
  const url = `${BASE_URL}/api/file/${FILE_ID}/tile/${encodeURIComponent(TF)}/${idx}`;

  const res = http.get(url, { tags: { endpoint: 'tiles' } });
  check(res, {
    'tile status 200 or 307': (r) => r.status === 200 || r.status === 307,
  });

  sleep(0.02);
}
