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

const passport = (panel) => ({
  ticker: panel?.ticker || '',
  fileId: String(panel?.fileId || ''),
  sessionId: panel?.sessionId || '',
  timeframe: panel?.timeframe || '',
});

function samePassport(left, right) {
  const a = passport(left);
  const b = passport(right);
  return a.ticker === b.ticker && a.fileId === b.fileId
    && a.sessionId === b.sessionId && a.timeframe === b.timeframe;
}

export function classifyOffRedSnapshot(snapshot) {
  if (!topologyReady(snapshot) || snapshot.errors?.length) {
    return { pass: false, reason: 'INVALID_TOPOLOGY_OR_ERRORS' };
  }
  const [host, ...iframes] = snapshot.panels;
  if (!host?.host || !exactPassport(host) || host.bars <= 0 || host.nonblack <= 0
      || host.errors?.length) {
    return { pass: false, reason: 'HOST_NOT_EXACT_HEALTHY' };
  }
  const panelModes = [];
  for (const panel of iframes) {
    if (panel.host || panel.errors?.length) return { pass: false, reason: 'PANEL_ERROR' };
    const blank = panel.bars === 0 && panel.nonblack === 0
      && !panel.ticker && !panel.fileId && !panel.sessionId;
    const duplicatedHost = panel.bars > 0 && panel.nonblack > 0
      && panel.sessionId === host.sessionId && samePassport(panel, host);
    if (!blank && !duplicatedHost) {
      return { pass: false, reason: 'FOREIGN_OR_NONCONTRACT_PANEL_IDENTITY' };
    }
    panelModes.push(blank ? 'BLANK' : 'DUPLICATED_HOST');
  }
  if (panelModes.length !== 2) return { pass: false, reason: 'INVALID_PANEL_COUNT' };
  const subtype = panelModes.every((mode) => mode === 'BLANK')
    ? 'BLANK_PANELS' : 'DUPLICATED_HOST_IDENTITY';
  const passports = snapshot.panels.map((panel) => ({
    id: panel.id,
    mode: panel.host ? 'HOST' : panelModes.shift(),
    observed: passport(panel),
    expected: passport(panel.expected),
  }));
  return { pass: true, subtype, passports };
}

export function isExpectedOffRedSnapshot(snapshot) {
  return classifyOffRedSnapshot(snapshot).pass;
}

export function classifyOffDeadline(observations, minStableMs = 1_000) {
  if (!Array.isArray(observations) || observations.length === 0) {
    return { pass: false, reason: 'OFF_NO_OBSERVATIONS' };
  }
  const last = observations.at(-1);
  if (last.error) return { pass: false, reason: 'OFF_OBSERVATION_ERROR', last };
  const lastClassification = classifyOffRedSnapshot(last.value);
  if (!lastClassification.pass) {
    return { pass: false, reason: `OFF_UNEXPECTED_DEADLINE_STATE:${stageForSnapshot(last.value)}`, last };
  }
  const stableFingerprint = JSON.stringify({
    subtype: lastClassification.subtype,
    passports: lastClassification.passports,
  });
  let firstStable = last;
  for (let index = observations.length - 2; index >= 0; index -= 1) {
    const row = observations[index];
    if (row.error) break;
    const classification = classifyOffRedSnapshot(row.value);
    if (!classification.pass || JSON.stringify({
      subtype: classification.subtype,
      passports: classification.passports,
    }) !== stableFingerprint) break;
    firstStable = row;
  }
  const stableMs = last.atMs - firstStable.atMs;
  return stableMs >= minStableMs
    ? { pass: true, reason: 'EXPECTED_OFF_RED', subtype: lastClassification.subtype,
      passports: lastClassification.passports, stableMs, firstStableAtMs: firstStable.atMs,
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
