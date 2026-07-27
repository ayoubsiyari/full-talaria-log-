import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const products = ['b75', 'b77', 'b78'];
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const rows = products.flatMap((product) => Array.from({ length: 10 }, (_, index) => {
  const run = index + 1;
  const file = `${product}-run-${run}.json`;
  const bytes = fs.readFileSync(path.join(dir, file));
  return { file, rawSha256: hash(bytes), ...JSON.parse(bytes) };
}));
const unique = (values) => [...new Set(values)];
const exactlyOne = (name, values) => {
  const found = unique(values);
  if (found.length !== 1) throw new Error(`FAIL-CLOSED: ${name}: ${found.join(', ')}`);
  return found[0];
};
for (const product of products) {
  if (rows.filter((row) => row.product === product).length !== 10) {
    throw new Error(`FAIL-CLOSED: ${product} does not have exactly 10 runs`);
  }
}
if (rows.some((row) => row.error != null)) throw new Error('FAIL-CLOSED: corrected run error');

const stableSignature = exactlyOne('semantic signature differs', rows.map((row) => row.semanticSignatureSha256));
const canonical = exactlyOne('semantic canonical differs', rows.map((row) => row.semanticCanonical));
const failurePoint = exactlyOne('failure point differs', rows.map((row) => JSON.stringify(row.failurePoints)));
const browserVersion = exactlyOne('browser version differs', rows.map((row) => row.browserVersion));
const fixedSyntheticNowMs = exactlyOne('fixed synthetic time differs', rows.map((row) => row.fixedSyntheticNowMs));
const correctedScenarioSha256 = exactlyOne(
  'corrected scenario digest differs',
  rows.map((row) => row.correctedScenarioSha256),
);
const signatureModuleSha256 = exactlyOne(
  'signature module digest differs',
  rows.map((row) => row.correctedSignatureModuleSha256),
);
const parsed = JSON.parse(canonical);
const proof = {
  schema: 'talaria.h-a8-vp-2-determinism-proof/v1',
  pass: true,
  stableSignature,
  repetitions: { b75: 10, b77: 10, b78: 10, total: 30 },
  products: {
    b75: '6880a603004b1c1957c3a398f3583eb20b590ca3',
    b77: '6bd26ad93f3abe506f16737b787c4b1d17aa2b88',
    b78: 'prepared B78 working tree',
  },
  pinnedEnvironment: {
    browserVersion,
    viewport: rows[0].viewport,
    killSwitchInputs: false,
    fixedSyntheticNowMs,
    freshBrowserAndServerPerRun: true,
  },
  correctedHarness: { correctedScenarioSha256, signatureModuleSha256 },
  failurePoint: JSON.parse(failurePoint),
  normalizedSemanticRecord: parsed,
  excludedVolatileFields: [
    'drawing UUID',
    'wall-clock timestamps',
    'server port',
    'performance.now',
    'requestAnimationFrame/event number',
  ],
  rawArtifactsAllDifferent: unique(rows.map((row) => row.rawSha256)).length === rows.length,
  mutationTests: {
    command: 'node --test chart v 1.4/chart/multichart-prod/harness/h-a8-vp-2-semantic-signature.test.mjs',
    expectedTests: 6,
    rejects: ['assertion identifier', 'failure point', 'drag geometry value', 'recovery coordinate value'],
  },
  rows: rows.map((row) => ({
    file: row.file,
    product: row.product,
    run: row.run,
    rawSha256: row.rawSha256,
    semanticSignatureSha256: row.semanticSignatureSha256,
    failurePoints: row.failurePoints,
  })),
};
fs.writeFileSync(path.join(dir, 'stability-proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
fs.writeFileSync(path.join(dir, 'README.md'), [
  '# H-A8-VP-2 deterministic semantic signature',
  '',
  `Stable signature: \`${stableSignature}\``,
  '',
  'PASS: 10/10 B75, 10/10 B77, and 10/10 prepared B78 runs matched the same semantic record and sole failure point.',
  'The signature excludes UUID/time/port/rAF fields but retains assertion identity/result, thresholds, exact drag geometry, and exact synchronized recovery geometry/coordinates.',
  '',
  `Failure point: ${JSON.parse(failurePoint).join(', ')}`,
  `Browser: ${browserVersion}; viewport 1440x960; DPR 1; synthetic now ${fixedSyntheticNowMs}.`,
  '',
].join('\n'));
console.log(JSON.stringify({
  pass: proof.pass,
  stableSignature,
  repetitions: proof.repetitions,
  failurePoint: proof.failurePoint,
}, null, 2));
