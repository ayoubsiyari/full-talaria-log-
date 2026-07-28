/**
 * M22 / H-S6 — RED acceptance wrapper (meta-test vs product oracle).
 *
 * STATUS: RED-PREP-ONLY-M21-1-LOCKED
 *
 * Meta-test PASS: contract/oracle parity + dual-tree pinlock + runner confirms
 * PRODUCT-RED-CONFIRMED (oracle exit 11) with identical ABCD signature.
 * Product remains RED — wrapper PASS does NOT imply GREEN.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m22-hs6-owner-fetch.red.test.mjs"
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  M22_HS6_AUDIT_REF,
  M22_HS6_FORBIDDEN_EDITS,
  M22_HS6_GREEN_INVARIANTS,
  M22_HS6_HANDOFF_MARKER,
  M22_HS6_HUNK_MANIFEST,
  M22_HS6_KILL_SWITCH,
  M22_HS6_RED_SIGNATURE,
  M22_HS6_REQUIRED_GREEN_SUITE,
  M22_HS6_STATUS,
  m22Hs6HostFanoutFinerSelfOwnGuardEnabled,
  switchOffRestoresLegacyFanoutStorm,
} from './m22-hs6-owner-fetch-contract.mjs';
import {
  buildDependencyPinlock,
  hashFileSha256,
  resolveDualTree,
} from './m22-hs6-dual-tree-root.mjs';
import {
  evaluateFanOutStep,
  evaluateHs6Observation,
  ORACLE_EXIT,
} from './m22-hs6-owner-fetch-oracle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(__dirname, 'm22-hs6-owner-fetch-runner.mjs');
const REPO_ROOT = resolveDualTree(__dirname).root;

function parseRunnerHandoff(stdout) {
  const lines = String(stdout || '').split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith(M22_HS6_HANDOFF_MARKER)) {
      return JSON.parse(line.slice(M22_HS6_HANDOFF_MARKER.length));
    }
  }
  throw new Error('handoff marker not found in runner stdout');
}

const ARTIFACTS = [
  'm22-hs6-dual-tree-root.mjs',
  'm22-hs6-owner-fetch-contract.mjs',
  'm22-hs6-owner-fetch-oracle.mjs',
  'm22-hs6-owner-fetch-runner.mjs',
  'm22-hs6-owner-fetch.red.test.mjs',
  'm22-hs6-owner-fetch-evidence-io.mjs',
];

function syntaxCheck(file) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

test('M22-H-S6 contract declares RED-PREP lock + audit + kill-switch semantics', () => {
  assert.equal(M22_HS6_STATUS, 'RED-PREP-ONLY-M21-1-LOCKED');
  assert.equal(M22_HS6_AUDIT_REF, 'db9ddd96');
  assert.equal(M22_HS6_KILL_SWITCH, '__TALARIA_MC_DISABLE_HOST_FANOUT_FINER_SELFOWN_GUARD');
  assert.equal(m22Hs6HostFanoutFinerSelfOwnGuardEnabled({}), true);
  assert.equal(m22Hs6HostFanoutFinerSelfOwnGuardEnabled({ [M22_HS6_KILL_SWITCH]: true }), false);
  assert.equal(switchOffRestoresLegacyFanoutStorm({ [M22_HS6_KILL_SWITCH]: true }), true);
  assert.ok(M22_HS6_FORBIDDEN_EDITS.length >= 5);
  assert.ok(M22_HS6_REQUIRED_GREEN_SUITE.some((r) => r.id === 'H-S6'));
  assert.ok(M22_HS6_HUNK_MANIFEST.some((h) => h.anchors?.some((a) => a.includes('_applyFinerPanelHostCommit'))));
});

test('M22-H-S6 oracle GREEN model vs RED signature (pure)', () => {
  const ids = ['A', 'B', 'C', 'D'];
  const mk = (fetchedList, apiSpec, peerSelfOwn) => {
    const before = Object.fromEntries(ids.map((id) => [id, { fetches: 0 }]));
    const after = Object.fromEntries(ids.map((id) => [id, {
      fetches: fetchedList.includes(id) ? 1 : 0,
    }]));
    const apiLog = [];
    for (let i = 0; i < (apiSpec.h1 || 0); i += 1) {
      apiLog.push({ endpoint: 'file.bars', query: { resolution: '1h' } });
    }
    for (let i = 0; i < (apiSpec.peerSmart1m || 0); i += 1) {
      apiLog.push({ endpoint: 'file.smart', query: { timeframe: '1m' } });
    }
    return evaluateFanOutStep({
      before,
      after,
      apiLog,
      peerSelfOwn,
    }, '1m_to_1h');
  };

  const green = mk(['A'], { h1: 1, peerSmart1m: 0 }, { A: false, B: false, C: false, D: false });
  assert.equal(green.greenPass, true);
  assert.equal(green.redMatch, false);

  const red = mk(['A', 'B', 'C', 'D'], { h1: 1, peerSmart1m: 3 }, { B: true, C: true, D: true });
  assert.equal(red.greenPass, false);
  assert.equal(red.redMatch, true);
  assert.deepEqual(red.fetched, ['A', 'B', 'C', 'D']);
});

test('M22-H-S6 dual-tree syntax + artifact pinlock', () => {
  for (const name of ARTIFACTS) {
    const abs = path.join(__dirname, name);
    assert.ok(fs.existsSync(abs), `missing ${name}`);
    syntaxCheck(abs);
  }
  const pin = buildDependencyPinlock(__dirname);
  assert.equal(pin.status, 'RED-PREP-ONLY-M21-1-LOCKED');
  assert.equal(pin.m22Artifacts.length, ARTIFACTS.length);
  for (const a of pin.m22Artifacts) {
    assert.ok(a.sha256, a.rel);
  }
});

test('M22-H-S6 chart.js dual-tree parity at pin time', () => {
  const dual = resolveDualTree(__dirname);
  const v14 = dual.trees.v14.chartJs;
  const home = dual.trees.homepage.chartJs;
  assert.ok(fs.existsSync(v14));
  assert.ok(fs.existsSync(home));
  const pin = buildDependencyPinlock(__dirname);
  assert.equal(
    pin.chartJsParity.byteIdentical,
    hashFileSha256(v14) === hashFileSha256(home),
  );
});

test('M22-H-S6 real product/browser RED cell (dual-tree)', { timeout: 240_000 }, async () => {
  if (process.env.M22_HS6_SKIP_BROWSER === '1') {
    return;
  }

  let stdout;
  let stderr;
  let exitCode;
  try {
    stdout = execFileSync(process.execPath, [RUNNER], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 220_000,
      env: { ...process.env, M22_HS6_WRITE_EVIDENCE: '0' },
    });
    exitCode = 0;
    stderr = '';
  } catch (err) {
    stdout = err.stdout || '';
    stderr = err.stderr || '';
    exitCode = err.status ?? ORACLE_EXIT.SETUP_FAIL;
  }

  let handoff;
  try {
    handoff = parseRunnerHandoff(stdout);
  } catch (parseErr) {
    assert.fail(`runner handoff parse failed: ${parseErr.message}\nstdout tail=${stdout.slice(-500)}\nstderr=${stderr}`);
  }

  assert.equal(handoff.status, 'RED-PREP-ONLY-M21-1-LOCKED');
  assert.equal(handoff.productGreen, false);
  assert.equal(exitCode, ORACLE_EXIT.RED_PRODUCT, `expected product RED exit 11; got ${exitCode}\nstderr=${stderr}`);

  const evalResult = evaluateHs6Observation({
    trees: (handoff.trees || []).map((t) => ({
      treeKey: t.treeKey,
      chartJsSha256: t.chartJsSha256,
      fanOut1mTo1h: {
        before: Object.fromEntries(['A', 'B', 'C', 'D'].map((id) => [id, { fetches: 0 }])),
        after: Object.fromEntries(['A', 'B', 'C', 'D'].map((id) => [id, {
          fetches: (t.fanOut1mTo1h?.fetched || []).includes(id) ? 1 : 0,
        }])),
        apiLog: [
          ...Array.from({ length: 1 }, () => ({ endpoint: 'file.bars', query: { resolution: '1h' } })),
          ...Array.from({ length: 3 }, () => ({ endpoint: 'file.smart', query: { timeframe: '1m' } })),
        ],
        peerSelfOwn: t.fanOut1mTo1h?.peerSelfOwn,
      },
      fanOut1hTo1m: {
        before: Object.fromEntries(['A', 'B', 'C', 'D'].map((id) => [id, { fetches: 0 }])),
        after: Object.fromEntries(['A', 'B', 'C', 'D'].map((id) => [id, {
          fetches: (t.fanOut1hTo1m?.fetched || []).includes(id) ? 1 : 0,
        }])),
        apiLog: [],
      },
    })),
  });

  assert.equal(evalResult.metaTestShouldPass, true);
  assert.equal(handoff.verdict, 'PRODUCT-RED-CONFIRMED');
  assert.equal(handoff.signature, 'ABCD-4FETCH-STORM');
  assert.ok(handoff.dualTreeParity !== false, 'dual-tree RED signatures must match');

  for (const t of handoff.trees || []) {
    assert.deepEqual(
      [...(t.fanOut1mTo1h?.fetched || [])].sort(),
      [...M22_HS6_RED_SIGNATURE.fanOut1mTo1h.expectedPanelsThatFetched].sort(),
    );
    assert.ok(
      (t.fanOut1mTo1h?.peerSelfOwn?.B && t.fanOut1mTo1h?.peerSelfOwn?.C && t.fanOut1mTo1h?.peerSelfOwn?.D),
      'peer finer-self-own B/C/D expected on RED product',
    );
  }
});
