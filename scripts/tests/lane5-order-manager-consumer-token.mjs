import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const LANE5_ACCEPTED_COMMIT = '1f9ec3275';
export const CANONICAL_DEGRADED_STATE_TOKEN = '__TALARIA_DEGRADED_STATE';

const surfaces = [
  'chart v 1.4/chart/modules/order-manager.js',
  'homepage/public/chart/modules/order-manager.js',
];

function acceptedSource(file) {
  return execFileSync('git', ['show', `${LANE5_ACCEPTED_COMMIT}:${file}`], {
    cwd: path.resolve(import.meta.dirname, '../..'),
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
}

export const actualOrderManagerConsumerTokens = surfaces.map((file) => {
  const source = acceptedSource(file);
  const helperAt = source.indexOf('function _canonicalMissingCorrectnessModules()');
  const captureAt = source.indexOf('\nfunction _captureDegradedTradeAudit', helperAt);
  assert.ok(helperAt >= 0 && captureAt > helperAt, `${file}: Lane-5 consumer helper missing`);
  const helper = source.slice(helperAt, captureAt);
  const match = /window\.([A-Za-z0-9_]+)\s*;/.exec(helper);
  assert.ok(match, `${file}: Lane-5 global token missing`);
  return { file, token: match[1], helper };
});
