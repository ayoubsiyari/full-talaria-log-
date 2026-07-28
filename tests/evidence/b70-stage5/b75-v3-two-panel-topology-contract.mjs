export function expectedPeerCount(panelCount) {
  if (!Number.isInteger(panelCount) || panelCount < 1) {
    throw new TypeError('panelCount must be a positive integer');
  }
  return panelCount - 1;
}

export function classifyOrganicTopology({
  panelCount,
  managerEntries,
  iframeCount,
  host,
  peers,
}) {
  const expectedPeers = expectedPeerCount(panelCount);
  const hostReady = !!host?.chartPresent
    && !!host?.dataLoaded
    && !!host?.canvasPainted;
  const peerRows = Array.isArray(peers) ? peers : [];
  const peersReady = peerRows.length === expectedPeers
    && peerRows.every((peer) => peer.entryReady
      && peer.frameConnected
      && peer.chartPresent
      && peer.dataLoaded
      && peer.canvasPainted
      && peer.organicBridgeReady);
  return {
    ready: hostReady
      && managerEntries === expectedPeers
      && iframeCount === expectedPeers
      && peersReady,
    expectedPeers,
    hostReady,
    peersReady,
  };
}

export function classifyDeterministicTeardown({
  replayPaused,
  managerEntries,
  iframeCount,
  peerWorkersBefore,
  listenersBefore,
  listenersAfterPeerRemoval,
  jsHeapReleasedAfterPeerRemovalBytes,
  processMemoryReleasedAfterPeerRemovalBytes,
  targetCloseAcknowledged,
  targetDestroyed,
}) {
  const peerReleaseObserved = managerEntries === 0
    && iframeCount === 0
    && Number.isInteger(peerWorkersBefore)
    && peerWorkersBefore >= 0
    && listenersAfterPeerRemoval < listenersBefore
    && jsHeapReleasedAfterPeerRemovalBytes > 0
    && processMemoryReleasedAfterPeerRemovalBytes > 0;
  return {
    complete: replayPaused
      && peerReleaseObserved
      && targetCloseAcknowledged
      && targetDestroyed,
    replayPaused: !!replayPaused,
    peerReleaseObserved,
    targetCloseAcknowledged: !!targetCloseAcknowledged,
    targetDestroyed: !!targetDestroyed,
  };
}
