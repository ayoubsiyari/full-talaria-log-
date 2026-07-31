import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const chartSource = readFileSync(resolve(root, 'chart v 1.4/chart/chart.js'), 'utf8');
const orderSource = readFileSync(resolve(root, 'chart v 1.4/chart/modules/order-manager.js'), 'utf8');
const homepageChartSource = readFileSync(resolve(root, 'homepage/public/chart/chart.js'), 'utf8');
const homepageOrderSource = readFileSync(resolve(root, 'homepage/public/chart/modules/order-manager.js'), 'utf8');
const apiSource = readFileSync(resolve(root, 'chart v 1.4/chart/api_server.py'), 'utf8');

test('M8 state response exposes journal completeness metadata', () => {
  assert.match(apiSource, /resolve_session_journal_for_state_hydrate/);
  assert.match(apiSource, /journal_complete/);
  assert.match(apiSource, /journal_returned_count/);
  assert.match(apiSource, /journal_heavy_fields_omitted/);
  assert.match(apiSource, /m19_hot_persist_trim_v1/);
});

test('M8 client mirrors are identical for chart and order-manager guards', () => {
  assert.equal(homepageChartSource, chartSource);
  assert.equal(homepageOrderSource, orderSource);
});

test('M8 partial or slim hydrate is not durable session-state-hydrate provenance', () => {
  for (const source of [chartSource, homepageChartSource]) {
    assert.match(source, /journal_complete/);
    assert.match(source, /journal_heavy_fields_omitted/);
    assert.match(source, /session-state-slim-hydrate/);
    assert.match(source, /session-state-partial-hydrate/);
    assert.match(source, /partialEmptyWouldHideServerTrades/);
  }
  for (const source of [orderSource, homepageOrderSource]) {
    assert.match(source, /partial-hydrate/);
  }

  for (const source of [orderSource, homepageOrderSource]) {
    const durableAllowlist = source.match(/const journalVouchedFor =[\s\S]*?;/)?.[0] || '';
    assert.match(durableAllowlist, /locally-authored/);
    assert.match(durableAllowlist, /hydrated/);
    assert.doesNotMatch(durableAllowlist, /partial-hydrate/);
  }
});
