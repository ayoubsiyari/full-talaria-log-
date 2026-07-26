export function topologyReady(snapshot, expectedPanels = 3) {
  return snapshot?.navigation?.top === true
    && snapshot?.panels?.length === expectedPanels
    && snapshot.panels.filter((panel) => panel.host).length === 1
    && snapshot.panels.filter((panel) => !panel.host).length === expectedPanels - 1;
}

export function observableReady(snapshot) {
  return topologyReady(snapshot)
    && snapshot.panels.every((panel) => panel.bars > 0 && panel.nonblack > 0);
}

export function stageForSnapshot(snapshot) {
  if (!snapshot?.navigation?.top) return 'navigation';
  if (!topologyReady(snapshot)) return 'topology';
  if (snapshot.panels.some((panel) => !panel.ticker || !panel.fileId)) return 'identity';
  if (snapshot.panels.some((panel) => panel.bars <= 0)) return 'bars';
  if (snapshot.panels.some((panel) => panel.nonblack <= 0)) return 'paint';
  return 'ready';
}

export function classifyArmPanel(panel, enabled, strictIdentity, classifyPanel) {
  const observable = classifyPanel({
    ...panel,
    nonblank: panel.nonblack > 0,
    paintMs: panel.paintMs,
  }, panel.expected).pass;
  return enabled
    ? observable && strictIdentity(panel, panel.expected, panel.generation)
    : observable;
}
