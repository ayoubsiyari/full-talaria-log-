import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const mirrors = [
  path.join(repoRoot, 'chart v 1.4/chart/chart.js'),
  path.join(repoRoot, 'homepage/public/chart/chart.js'),
];

function extractMethod(src, name) {
  const marker = `\n    ${name}(`;
  const start = src.indexOf(marker);
  assert.notEqual(start, -1, `${name} method exists`);
  let i = start + marker.length - 1;
  let paren = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === '(') paren += 1;
    if (src[i] === ')') {
      paren -= 1;
      if (paren === 0) break;
    }
  }
  const bodyStart = src.indexOf('{', i);
  assert.notEqual(bodyStart, -1, `${name} body starts`);
  let depth = 0;
  for (let j = bodyStart; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    if (src[j] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(bodyStart, j + 1);
    }
  }
  throw new Error(`${name} body did not close`);
}

for (const file of mirrors) {
  test(`smart prefetch cache discipline: ${path.relative(repoRoot, file)}`, () => {
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /_smartPrefetchCacheWindowLimit\(\)\s*\{\s*return 5000 \+ 2048;/);
    assert.match(extractMethod(src, '_setSmartPrefetchCacheEntry'), /_windowSmartPrefetchPayload\(payload\);[\s\S]*_smartPrefetchCache\.set/);
    assert.match(extractMethod(src, 'destroy'), /_clearSmartPrefetchCache\('destroy'\);[\s\S]*_removeSmartPrefetchCacheReleaseHooks\(\);/);
    assert.match(extractMethod(src, '_installSmartPrefetchCacheReleaseHooks'), /addEventListener\('pagehide'[\s\S]*addEventListener\('returnedToSinglePanel'/);
    assert.match(extractMethod(src, '_clearSmartPrefetchCache'), /_smartPrefetchCache\.clear\(\)[\s\S]*startsWith\('smart\|'\)/);
  });
}
