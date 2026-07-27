export const H_A7B_R2_ORACLE = Object.freeze({
  oracle: 'H-A7b-R2 setup contract v1',
  authoredAgainst: '20260727b78',
  mechanism: 'D-029 R2 axis-margin floor after anchored VP',
  lastProvenRedOn: '20260727b78',
  maxBuildDistance: 3,
});

function buildOrdinal(buildId) {
  const match = String(buildId || '').match(/b(\d+)$/i);
  return match ? Number(match[1]) : null;
}

export function hA7bR2OracleStamp(buildId) {
  const current = buildOrdinal(buildId);
  const red = buildOrdinal(H_A7B_R2_ORACLE.lastProvenRedOn);
  const distance = current == null || red == null ? null : Math.max(0, current - red);
  return {
    ...H_A7B_R2_ORACLE,
    observedBuild: String(buildId || 'unknown'),
    buildDistance: distance,
    status: distance != null && distance <= H_A7B_R2_ORACLE.maxBuildDistance
      ? 'PROVEN'
      : 'UNPROVEN',
  };
}

export function validateHA7bR2Setup({
  commandAcknowledged,
  fileIds,
  intendedFile = '27',
  data,
  anchorPoints,
  placement,
} = {}) {
  const stages = [];
  const record = (stage, ok, observed) => stages.push({ stage, ok: Boolean(ok), observed });

  record('load-command-ack', commandAcknowledged === true, commandAcknowledged);
  record('panel-identity',
    fileIds?.A === '25' && fileIds?.B === String(intendedFile),
    { expected: { A: '25', B: String(intendedFile) }, actual: fileIds || null });

  const dataValid = data?.fileId === String(intendedFile)
    && Number(data?.length) > 50
    && Number.isFinite(data?.firstTime)
    && Number.isFinite(data?.lastTime)
    && data.lastTime >= data.firstTime;
  record('panel-data', dataValid, data || null);

  const point = Array.isArray(anchorPoints) && anchorPoints.length === 1 ? anchorPoints[0] : null;
  const anchorValid = Boolean(point
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && point.x >= 0
    && point.x < Number(data?.length));
  record('anchor-input', anchorValid, anchorPoints || null);

  const placementValid = Boolean(placement?.id);
  record('vp-placement', placementValid, placement || null);

  const firstInvalid = stages.find((stage) => !stage.ok) || null;
  return {
    ok: firstInvalid == null,
    classification: firstInvalid ? 'SETUP_INVALID' : 'SETUP_VALID',
    firstInvalidStage: firstInvalid?.stage || null,
    stages,
  };
}
