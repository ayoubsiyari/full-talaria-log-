/**
 * M22 / H-S78B — RED acceptance wrapper (meta-test vs product oracle).
 *
 * STATUS: RED-PREP-ONLY-M21-1-LOCKED
 *
 * Meta-test PASS: contract/oracle parity + dual-tree pinlock + runner confirms
 * PRODUCT-RED-CONFIRMED (oracle exit 11) on clean unconfounded gesture cells.
 * Product remains RED — wrapper PASS does NOT imply GREEN.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m22-hs78b-play-pan-optout.red.test.mjs"
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  M22_HS78B_AUDIT_REF,
  M22_HS78B_FORBIDDEN_EDITS,
  M22_HS78B_GESTURE_MATRIX,
  M22_HS78B_GREEN_INVARIANTS,
  M22_HS78B_HUNK_MANIFEST,
  M22_HS78B_KILL_SWITCH,
  M22_HS78B_RED_SIGNATURE,
  M22_HS78B_REQUIRED_GREEN_SUITE,
  M22_HS78B_STATUS,
  m22Hs78bPlayPanMousedownOptoutEnabled,
  probeNonVacuity,
  switchOffRestoresLegacyThresholdOnlyOptout,
} from './m22-hs78b-play-pan-optout-contract.mjs';
import {
  buildDependencyPinlock,
  hashFileSha256,
  resolveDualTree,
} from './m22-hs78b-dual-tree-root.mjs';
import {
  evaluateGestureCell,
  evaluateHs78bObservation,
  ORACLE_EXIT,
} from './m22-hs78b-play-pan-optout-oracle.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(__dirname, 'm22-hs78b-play-pan-optout-runner.mjs');
const REPO_ROOT = resolveDualTree(__dirname).root;

const ARTIFACTS = [
  'm22-hs78b-dual-tree-root.mjs',
  'm22-hs78b-play-pan-optout-contract.mjs',
  'm22-hs78b-play-pan-optout-oracle.mjs',
  'm22-hs78b-play-pan-optout-runner.mjs',
  'm22-hs78b-play-pan-optout.red.test.mjs',
  'm22-hs78b-play-pan-optout-evidence-io.mjs',
  'm22-hs78b-harness-shim.mjs',
];

function syntaxCheck(file) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
}

test('M22-H-S78B contract declares RED-PREP lock + audit + kill-switch semantics', () => {
  assert.equal(M22_HS78B_STATUS, 'RED-PREP-ONLY-M21-1-LOCKED');
  assert.equal(M22_HS78B_AUDIT_REF, '6cb990c8');
  assert.equal(M22_HS78B_KILL_SWITCH, '__TALARIA_MC_DISABLE_PLAY_PAN_MOUSEDOWN_OPTOUT');
  assert.equal(m22Hs78bPlayPanMousedownOptoutEnabled({}), true);
  assert.equal(m22Hs78bPlayPanMousedownOptoutEnabled({ [M22_HS78B_KILL_SWITCH]: true }), false);
  assert.equal(switchOffRestoresLegacyThresholdOnlyOptout({ [M22_HS78B_KILL_SWITCH]: true }), true);
  assert.ok(M22_HS78B_FORBIDDEN_EDITS.length >= 5);
  assert.ok(M22_HS78B_REQUIRED_GREEN_SUITE.some((r) => r.id === 'H-S78B'));
  assert.ok(M22_HS78B_HUNK_MANIFEST.some((h) => h.anchors?.some((a) => a.includes('35721'))));
  assert.equal(M22_HS78B_RED_SIGNATURE.confoundedLegacyPin.status, 'STALE-CONFOUNDED-NOT-GREEN');
  assert.ok(M22_HS78B_GESTURE_MATRIX.some((g) => g.cellId === 'pan-intent-4px'));
});

test('M22-H-S78B oracle RED model vs GREEN model (pure)', () => {
  const mkRedCell = () => evaluateGestureCell({
    meta: { cellId: 'pan-intent-4px', cssDevicePx: 4, role: 'sub-threshold-primary', underCommitThreshold: true },
    probe: {
      chartEvents: [{ type: 'mousedown' }, { type: 'mousemove' }],
      actualMovementCssPx: 4,
      dragDuring: { type: 'pan', active: true, panCommitted: false },
      offsetXDeltaImmediate: 0.2,
    },
    snapshots: {
      before: { spacing: 8, replayPlaying: true, userHasPanned: false, autoScrollEnabled: true },
      immediate: { userHasPanned: false, autoScrollEnabled: true, drag: { panCommitted: false }, offsetX: 100 },
      post50: { offsetX: 120, offsetToTarget: 10, spacing: 8 },
      followRendersDeltaPost50: 3,
      offsetToTargetImmediate: 50,
      offsetToTargetPost50: 10,
      recenters: true,
      followEngagedBefore: true,
    },
  });
  const red = mkRedCell();
  assert.equal(red.redMatch, true);
  assert.equal(red.greenPass, false);
  assert.equal(probeNonVacuity({
    chartEvents: [{ type: 'mousedown' }, { type: 'mousemove' }],
    dragDuring: { type: 'pan', active: true },
    actualMovementCssPx: 4,
  }, 4).ok, true);

  const green = evaluateGestureCell({
    meta: { cellId: 'pan-intent-4px', cssDevicePx: 4, role: 'sub-threshold-primary', underCommitThreshold: true },
    probe: {
      chartEvents: [{ type: 'mousedown' }, { type: 'mousemove' }],
      actualMovementCssPx: 4,
      dragDuring: { type: 'pan', active: true },
    },
    snapshots: {
      immediate: { userHasPanned: true, autoScrollEnabled: false },
      post50: { offsetToTarget: 40, spacing: 8 },
      followRendersDeltaPost50: 0,
      offsetToTargetImmediate: 40,
      offsetToTargetPost50: 41,
      recenters: false,
    },
  });
  assert.equal(green.greenPass, true);
  assert.equal(green.redMatch, false);
});

test('M22-H-S78B dual-tree syntax + artifact pinlock', () => {
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

test('M22-H-S78B chart.js dual-tree parity at pin time', () => {
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

test('M22-H-S78B real product/browser RED cell (dual-tree)', { timeout: 360_000 }, async () => {
  if (process.env.M22_HS78B_SKIP_BROWSER === '1') {
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
      timeout: 340_000,
      env: { ...process.env, M22_HS78B_WRITE_EVIDENCE: '0' },
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
    handoff = JSON.parse(stdout);
  } catch (parseErr) {
    assert.fail(`runner stdout not JSON: ${parseErr.message}\nstdout=${stdout}\nstderr=${stderr}`);
  }

  assert.equal(handoff.status, 'RED-PREP-ONLY-M21-1-LOCKED');
  assert.equal(handoff.productGreen, false);
  assert.equal(exitCode, ORACLE_EXIT.RED_PRODUCT, `expected product RED exit 11; got ${exitCode}\nstderr=${stderr}`);

  const evalResult = evaluateHs78bObservation({
    trees: (handoff.measurements || []).map((t) => ({
      treeKey: t.treeKey,
      chartJsSha256: t.chartJsSha256,
      cells: (t.cells || []).map((c) => ({
        meta: {
          cellId: c.cellId,
          cssDevicePx: c.cssDevicePx,
          role: M22_HS78B_GESTURE_MATRIX.find((g) => g.cellId === c.cellId)?.role,
          underCommitThreshold: M22_HS78B_GESTURE_MATRIX.find((g) => g.cellId === c.cellId)?.underCommitThreshold,
        },
        probe: {
          chartEvents: (c.probeVacuity?.eventTypes || []).flatMap((type) => [{ type }]),
          actualMovementCssPx: c.actualMovementCssPx,
          dragDuring: c.probeVacuity?.panBranch ? { type: 'pan', active: true } : null,
          offsetXDeltaImmediate: c.immediate?.offsetX != null && c.before?.offsetX != null
            ? c.immediate.offsetX - c.before.offsetX : 0,
        },
        snapshots: {
          before: c.before,
          immediate: c.immediate,
          post50: c.post50,
          followRendersDeltaPost50: c.followRendersDeltaPost50,
          offsetToTargetImmediate: c.offsetToTargetImmediate,
          offsetToTargetPost50: c.offsetToTargetPost50,
          recenters: c.recenters,
          followEngagedBefore: t.preGesture?.followEngaged,
        },
      })),
    })),
  });

  assert.equal(evalResult.metaTestShouldPass, true);
  assert.equal(handoff.verdict, 'PRODUCT-RED-CONFIRMED');
  assert.equal(handoff.signature, 'PLAY-PAN-OPTOUT-HOLE');
  assert.ok(handoff.dualTreeParity !== false, 'dual-tree RED signatures must match');
  assert.equal(handoff.confoundedLegacyPin?.status, 'STALE-CONFOUNDED-NOT-GREEN');

  for (const t of handoff.trees || []) {
    const primary = (t.cells || []).filter((c) => c.role === 'sub-threshold-primary');
    assert.ok(primary.length >= 2, 'expected sub-threshold primary cells');
    for (const c of primary) {
      assert.equal(c.userHasPannedImmediate, false, `${c.cellId} must show opt-out hole (userHasPanned false)`);
      assert.ok((c.followRendersDeltaPost50 || 0) >= 1, `${c.cellId} follow must continue on RED product`);
    }
  }
});
