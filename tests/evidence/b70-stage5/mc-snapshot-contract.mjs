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

function exactPassport(panel) {
  return panel?.ticker === panel?.expected?.ticker
    && String(panel?.fileId || '') === String(panel?.expected?.fileId || '')
    && panel?.sessionId === panel?.expected?.sessionId
    && panel?.timeframe === panel?.expected?.timeframe;
}

export function isExpectedOffRedSnapshot(snapshot) {
  if (!topologyReady(snapshot) || snapshot.errors?.length) return false;
  const [host, ...iframes] = snapshot.panels;
  if (!host?.host || !exactPassport(host) || host.bars <= 0 || host.nonblack <= 0
      || host.errors?.length) return false;
  return iframes.length === 2 && iframes.every((panel) =>
    !panel.host
      && panel.bars === 0
      && panel.nonblack === 0
      && !panel.ticker
      && !panel.fileId
      && !panel.sessionId
      && !panel.errors?.length);
}

export function classifyOffDeadline(observations, minStableMs = 1_000) {
  if (!Array.isArray(observations) || observations.length === 0) {
    return { pass: false, reason: 'OFF_NO_OBSERVATIONS' };
  }
  const last = observations.at(-1);
  if (last.error) return { pass: false, reason: 'OFF_OBSERVATION_ERROR', last };
  if (!isExpectedOffRedSnapshot(last.value)) {
    return { pass: false, reason: `OFF_UNEXPECTED_DEADLINE_STATE:${stageForSnapshot(last.value)}`, last };
  }
  let firstStable = last;
  for (let index = observations.length - 2; index >= 0; index -= 1) {
    const row = observations[index];
    if (row.error || !isExpectedOffRedSnapshot(row.value)) break;
    firstStable = row;
  }
  const stableMs = last.atMs - firstStable.atMs;
  return stableMs >= minStableMs
    ? { pass: true, reason: 'EXPECTED_OFF_RED', stableMs, firstStableAtMs: firstStable.atMs,
      deadlineAtMs: last.atMs, snapshot: last.value }
    : { pass: false, reason: 'OFF_RED_NOT_STABLE_AT_DEADLINE', stableMs, last };
}

export function transitionAbState(state, event) {
  const transitions = {
    OFF_ARMED: { OFF_RED_WITNESSED: 'ON_ARMING' },
    ON_ARMING: { ON_SWITCH_READBACK: 'ON_ARMED' },
    ON_ARMED: { ON_GREEN: 'COMPLETE' },
  };
  const next = transitions[state]?.[event];
  if (!next) throw new Error(`invalid MC A/B transition ${state} -> ${event}`);
  return next;
}

export function stageForSnapshot(snapshot) {
  if (!snapshot?.navigation?.top) return 'navigation';
  if (!topologyReady(snapshot)) return 'topology';
  if (snapshot.errors?.length || snapshot.panels.some((panel) => panel.errors?.length)) return 'errors';
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
