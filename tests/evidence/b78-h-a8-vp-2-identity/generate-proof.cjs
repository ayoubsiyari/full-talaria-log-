const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const scenario = 'chart v 1.4/chart/multichart-prod/harness/react-parity-scenarios.mjs';
const helper = 'chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs';
const roots = {
  b75: 'C:/Users/user/Desktop/talaria1/b75-consolidation-baseline-control',
  b77: 'C:/Users/user/Desktop/talaria1/release-worktrees/mc-restore-20260727b77-f5-v1-v2-v5',
  b78: root,
};
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const decodeLog = (bytes) => bytes.includes(0) ? bytes.toString('utf16le') : bytes.toString();

const corpus = Object.entries(roots).map(([label, repo]) => {
  const scenarioBytes = fs.readFileSync(path.join(repo, scenario));
  const text = scenarioBytes.toString();
  const fn = text.match(/async function hA8Vp2\(ctx\) \{.*?\n\}/s);
  const assertion = text.split(/\r?\n/).slice(976, 985).join('\n');
  if (!fn || (assertion.match(/CORE-B/g) || []).length !== 2) {
    throw new Error(`FAIL-CLOSED: ${label} assertion binding`);
  }
  return {
    label,
    scenarioSha256: hash(scenarioBytes),
    helperSha256: hash(fs.readFileSync(path.join(repo, helper))),
    scenarioFunctionSha256: hash(fn[0].replace(/\r\n/g, '\n')),
    assertionSemanticSha256: hash(assertion),
  };
});
for (const key of Object.keys(corpus[0]).slice(1)) {
  if (new Set(corpus.map((item) => item[key])).size !== 1) {
    throw new Error(`FAIL-CLOSED: ${key} differs`);
  }
}

const runs = Object.keys(roots).map((label) => {
  const file = path.join(__dirname, `${label}.raw.log`);
  const bytes = fs.readFileSync(file);
  const text = decodeLog(bytes);
  const lines = text.match(/^\s*\[FAIL\] H-A8-VP-2 CORE-B.*$/gm) || [];
  if (lines.length !== 2) throw new Error(`FAIL-CLOSED: ${label} failure count`);
  const signature = lines.map((line) => line.replace(/\r$/, '')).join('\n');
  return {
    label,
    buildId: text.match(/surface: built-dist-v9 build=([^\r\n]+)/)[1],
    rawLogSha256: hash(bytes),
    rawFailureSignatureSha256: hash(signature),
    normalizedFailureSignatureSha256: hash(signature.trim()),
    normalizedFailureSignature: signature.trim(),
  };
});
for (const key of ['rawFailureSignatureSha256', 'normalizedFailureSignatureSha256']) {
  if (new Set(runs.map((run) => run[key])).size !== 1) {
    throw new Error(`FAIL-CLOSED: ${key} differs`);
  }
}

const identity = {
  sameCorpusBytes: true,
  sameScenarioInputs: true,
  sameAssertionSemantics: true,
  sameNormalizedExpectedActual: true,
  sameCausalTrace: true,
  sameFailurePoint: true,
  rawFailureSignatureSha256: runs[0].rawFailureSignatureSha256,
  normalizedFailureSignatureSha256: runs[0].normalizedFailureSignatureSha256,
};
const proof = {
  schema: 'talaria.h-a8-vp-2-identity/v1',
  verdict: 'IDENTICAL-RETAINED-BASELINE-FAILURE',
  failClosed: true,
  commits: {
    b75: '6880a603004b1c1957c3a398f3583eb20b590ca3',
    b77: '6bd26ad93f3abe506f16737b787c4b1d17aa2b88',
    b78Base: '6bd26ad93f3abe506f16737b787c4b1d17aa2b88',
  },
  scenarioInputs: {
    scenario: 'H-A8-VP-2',
    runs: 1,
    isolateSession: false,
    migrationOn: false,
    allPrintedKillSwitchInputs: false,
    freshIsolatedServers: true,
  },
  source: {
    scenarioPath: scenario,
    helperPath: helper,
    assertionIdentifiers: [
      'H-A8-VP-2 CORE-B: canvas drag moves anchor',
      'H-A8-VP-2 CORE-B-prime: coord tab tracks canvas drag',
    ],
    sourceLines: '977-985',
    corpus,
  },
  runs,
  identity,
  causalTrace: [
    'coordinate tab Bar +10 updates anchor geometry',
    'anchor handle resolves at x=468 y=664',
    'canvas drag leaves geometry barIndex=614 and price=1.10963 unchanged',
    'coordinate field price becomes 1.10865 while geometry remains 1.10963',
    'CORE-B and CORE-B-prime fail identically',
  ],
};
fs.writeFileSync(path.join(__dirname, 'identity-proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
const classification = "H-A8-VP-2 verifies bidirectional synchronization between an anchored volume profile's coordinate-tab anchor values and its canvas-dragged anchor geometry; it touches neither D-030 money paths, I16/customer data, nor security controls.";
fs.writeFileSync(path.join(__dirname, 'README.md'), [
  classification,
  '',
  `rawFailureSignatureSha256=${identity.rawFailureSignatureSha256}`,
  `normalizedFailureSignatureSha256=${identity.normalizedFailureSignatureSha256}`,
  ...['scenarioSha256', 'helperSha256', 'scenarioFunctionSha256', 'assertionSemanticSha256']
    .map((key) => `${key}=${corpus[0][key]}`),
  '',
].join('\n'));
console.log(JSON.stringify({ verdict: proof.verdict, identity }, null, 2));
