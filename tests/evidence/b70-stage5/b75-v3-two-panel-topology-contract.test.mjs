import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  classifyDeterministicTeardown,
  classifyOrganicTopology,
  expectedPeerCount,
} from './b75-v3-two-panel-topology-contract.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('product grid contract excludes host A from manager operations', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'chart v 1.4/talaria-design/src/MultichartGrid.jsx'),
    'utf8',
  );
  assert.match(source, /const desiredIframeIds = new Set\([\s\S]*id !== HOST_PANEL_ID/);
  assert.match(source, /const bootQueue = layout\.tiles\.filter\([\s\S]*t\.id !== HOST_PANEL_ID/);
  assert.match(source, /m\.addChart\(cfg, cellEl\)/);
});

test('N panels map to N-1 manager peer entries', () => {
  for (const panels of [1, 2, 3, 4, 8]) {
    assert.equal(expectedPeerCount(panels), panels - 1);
  }
});

test('two-panel readiness validates host separately plus one organic peer', () => {
  const result = classifyOrganicTopology({
    panelCount: 2,
    managerEntries: 1,
    iframeCount: 1,
    host: { chartPresent: true, dataLoaded: true, canvasPainted: true },
    peers: [{
      entryReady: true,
      frameConnected: true,
      chartPresent: true,
      dataLoaded: true,
      canvasPainted: true,
      organicBridgeReady: true,
    }],
  });
  assert.deepEqual(result, {
    ready: true,
    expectedPeers: 1,
    hostReady: true,
    peersReady: true,
  });
});

test('readiness is not synthesized from topology alone', () => {
  const base = {
    panelCount: 2,
    managerEntries: 1,
    iframeCount: 1,
    host: { chartPresent: true, dataLoaded: true, canvasPainted: true },
    peers: [{
      entryReady: true,
      frameConnected: true,
      chartPresent: true,
      dataLoaded: true,
      canvasPainted: true,
      organicBridgeReady: false,
    }],
  };
  assert.equal(classifyOrganicTopology(base).ready, false);
  assert.equal(classifyOrganicTopology({
    ...base,
    peers: [{ ...base.peers[0], organicBridgeReady: true, canvasPainted: false }],
  }).ready, false);
  assert.equal(classifyOrganicTopology({
    ...base,
    host: { ...base.host, dataLoaded: false },
    peers: [{ ...base.peers[0], organicBridgeReady: true }],
  }).ready, false);
});

test('invalid panel counts fail closed', () => {
  for (const value of [0, -1, 1.5, NaN, '2']) {
    assert.throws(() => expectedPeerCount(value), /positive integer/);
  }
});

test('RED: navigation-only teardown cannot satisfy lifecycle release', () => {
  assert.deepEqual(classifyDeterministicTeardown({
    replayPaused: true,
    managerEntries: 1,
    iframeCount: 1,
    peerWorkersBefore: 1,
    listenersBefore: 200,
    listenersAfterPeerRemoval: 100,
    jsHeapReleasedAfterPeerRemovalBytes: 1,
    processMemoryReleasedAfterPeerRemovalBytes: 1,
    targetCloseAcknowledged: false,
    targetDestroyed: false,
  }), {
    complete: false,
    replayPaused: true,
    peerReleaseObserved: false,
    targetCloseAcknowledged: false,
    targetDestroyed: false,
  });
});

test('RED: target close without peer lifecycle release fails closed', () => {
  assert.equal(classifyDeterministicTeardown({
    replayPaused: true,
    managerEntries: 1,
    iframeCount: 1,
    peerWorkersBefore: 1,
    listenersBefore: 200,
    listenersAfterPeerRemoval: 100,
    jsHeapReleasedAfterPeerRemovalBytes: 1,
    processMemoryReleasedAfterPeerRemovalBytes: 1,
    targetCloseAcknowledged: true,
    targetDestroyed: true,
  }).complete, false);
});

test('control: pause, peer removal, and acknowledged target close completes teardown', () => {
  assert.deepEqual(classifyDeterministicTeardown({
    replayPaused: true,
    managerEntries: 0,
    iframeCount: 0,
    peerWorkersBefore: 1,
    listenersBefore: 200,
    listenersAfterPeerRemoval: 100,
    jsHeapReleasedAfterPeerRemovalBytes: 1,
    processMemoryReleasedAfterPeerRemovalBytes: 1,
    targetCloseAcknowledged: true,
    targetDestroyed: true,
  }), {
    complete: true,
    replayPaused: true,
    peerReleaseObserved: true,
    targetCloseAcknowledged: true,
    targetDestroyed: true,
  });
});

test('RED: peer removal without listener and memory release fails closed', () => {
  assert.equal(classifyDeterministicTeardown({
    replayPaused: true,
    managerEntries: 0,
    iframeCount: 0,
    peerWorkersBefore: 1,
    listenersBefore: 200,
    listenersAfterPeerRemoval: 200,
    jsHeapReleasedAfterPeerRemovalBytes: 0,
    processMemoryReleasedAfterPeerRemovalBytes: 0,
    targetCloseAcknowledged: true,
    targetDestroyed: true,
  }).complete, false);
});
