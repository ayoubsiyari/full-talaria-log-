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
