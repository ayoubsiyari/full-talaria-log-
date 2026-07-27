export function assessHA7bR2({
  fileA,
  fileB,
  placed,
  probe,
  enforceAfter,
  assertionInverted = false,
} = {}) {
  const inputOk = fileA === '25' && fileB === '27' && placed === true;
  const geometryOk = Boolean(
    probe
      && probe.ok === true
      && probe.crush === false
      && Number(probe.marginR) >= 60
      && Number(probe.marginB) >= 24
      && Number(probe.axisW) >= 60,
  );
  const mechanismOk = Number(enforceAfter) >= 60;
  const ordinaryPass = inputOk && geometryOk && mechanismOk;
  return {
    pass: assertionInverted ? !ordinaryPass : ordinaryPass,
    ordinaryPass,
    inputOk,
    geometryOk,
    mechanismOk,
    firstFailure: !inputOk
      ? 'input'
      : !geometryOk
        ? 'geometry'
        : !mechanismOk
          ? 'mechanism'
          : null,
  };
}

export const FIXED_STATE = Object.freeze({
  fileA: '25',
  fileB: '27',
  placed: true,
  probe: {
    ok: true,
    crush: false,
    marginR: 61,
    marginB: 30,
    axisW: 61,
  },
  enforceAfter: 60,
});
