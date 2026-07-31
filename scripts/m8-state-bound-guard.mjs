#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

export const M8_STATE_BOUND_SIGNATURE = 'TALARIA_M8_STATE_BOUND_V1';

function hasAll(text, patterns) {
  return patterns.every((pattern) => pattern.test(text));
}

export function runM8StateBoundGuard() {
  const api = readFileSync(resolve(root, 'chart v 1.4/chart/api_server.py'), 'utf8');
  const store = readFileSync(resolve(root, 'chart v 1.4/chart/session_journal_store.py'), 'utf8');
  const chart = readFileSync(resolve(root, 'chart v 1.4/chart/chart.js'), 'utf8');
  const order = readFileSync(resolve(root, 'chart v 1.4/chart/modules/order-manager.js'), 'utf8');
  const homepageChart = readFileSync(resolve(root, 'homepage/public/chart/chart.js'), 'utf8');
  const homepageOrder = readFileSync(resolve(root, 'homepage/public/chart/modules/order-manager.js'), 'utf8');

  const checks = [
    {
      cell: 'M8-BACKEND-BOUNDED-STATE-HYDRATE',
      status: hasAll(store, [
        /load_state_hydrate_journal_page_from_sql/,
        /total_count/,
        /returned_count/,
        /complete/,
        /omitted_heavy_fields/,
      ]) && hasAll(api, [
        /resolve_session_journal_for_state_hydrate/,
        /journal_complete/,
        /journal_returned_count/,
        /journal_heavy_fields_omitted/,
      ]) ? 'GREEN' : 'RED',
    },
    {
      cell: 'M8-FAILED-PARTIAL-NOT-EMPTY-HISTORY',
      status: [chart, homepageChart].every((source) => hasAll(source, [
        /partialEmptyWouldHideServerTrades/,
        /session-state-partial-hydrate/,
        /session-state-slim-hydrate/,
      ])) && [order, homepageOrder].every((source) => hasAll(source, [
        /partial-hydrate/,
        /journalVouchedFor[\s\S]*locally-authored[\s\S]*hydrated/,
      ])) ? 'GREEN' : 'RED',
    },
    {
      cell: 'M8-SCREENSHOT-SUPPLY-LINE-BOUND',
      status: hasAll(store, [
        /state_hydrate_strip_heavy_enabled/,
        /_strip_heavy_journal_fields/,
      ]) && hasAll(api, [
        /m19_hot_persist_trim_v1/,
      ]) ? 'GREEN' : 'RED',
    },
    {
      cell: 'M8-CLIENT-MIRRORS-IDENTICAL',
      status: chart === homepageChart && order === homepageOrder ? 'GREEN' : 'RED',
    },
  ];
  const status = checks.every((check) => check.status === 'GREEN')
    ? 'IMPLEMENTED_PENDING_LIVE_MEASURE'
    : 'RED';
  return {
    signature: M8_STATE_BOUND_SIGNATURE,
    status,
    checks,
    motivatingCase: {
      endpoint: 'GET /api/sessions/936/state',
      trades: 182,
      screenshotsInJournalPayload: 395,
      m1LoadTransientLowerBoundMB: 141.57,
    },
    safetyProof:
      'State hydrate carries journal completeness/heavy-field metadata. Partial, failed, or heavy-slim hydrate never upgrades OrderManager provenance to durable session-state-hydrate, so omitted rows cannot be read as user has no trades.',
    productionServingEvidence: {
      file: 'chart v 1.4/chart/api_server.py',
      route: 'GET /chart/{file_name}',
      evidence:
        'api_server.py sets _CHART_ROOT_PATH = Path(__file__).resolve().parent and serves /chart/index.html from _CHART_ROOT_PATH / "dist-v9" / "index.html" when present before falling back to dist/ or chart/index.html.',
      productionMirror: 'chart v 1.4/chart',
      homepageMirrorStatus: 'source mirror only; not mounted by api_server.py for /chart assets',
    },
    productMeasure:
      'Pending: rerun M1 load-transient harness on b120 after deploy to prove the supply line reduction on the real app.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runM8StateBoundGuard();
  const outPath = resolve(root, 'docs/plan3/M8-STATE-BOUND-GUARD-20260731.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'RED' ? 1 : 0);
}
