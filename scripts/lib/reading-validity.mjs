/**
 * READING-VALIDITY-01 — the five-row validity checklist, evaluated INLINE with the reading.
 *
 * Per the PO's completeness clause: the checklist rides with the number, and **if it fails, a failure
 * sidecar goes in the packet rather than a caveat in prose.** That distinction is the whole design.
 * A caveat is a sentence someone can drop when they quote the figure; a sidecar is a file with a name
 * that has to be deleted on purpose.
 *
 * NOTE ON PROVENANCE OF THIS LIST. The five rows are as enumerated by the Director at 23:19+01:00 —
 * identity lock, phases, sidecars, coverage, capability proof. I searched `docs/` for §1.4 itself and
 * for each of the five terms before writing this; only A's §1.5 checklist and the instrument-checklist
 * ruling are in the tree. If §1.4 carries tighter definitions than the ones below, these are the
 * definitions to reconcile against.
 *
 * Every row is GREEN, RED with a reason, or UNPROVEN. UNPROVEN is not a pass: it is the state for a
 * row whose evidence was never collected, and it blocks quotability exactly as a RED does. A row that
 * cannot be evaluated must not look like a row that passed.
 */

export const ROWS = ['identityLock', 'phases', 'sidecars', 'coverage', 'capabilityProof'];

const MIN_COVERAGE_PCT = 95;

const red = (reason) => ({ state: 'RED', reason });
const green = (evidence) => ({ state: 'GREEN', evidence });
const unproven = (reason) => ({ state: 'UNPROVEN', reason });

/**
 * @param {object} o
 * @param {object|null} o.identity   { buildStamp, commit, expectedSha, servedSha, sealDigest }
 * @param {object|null} o.phaseSummary  from PhaseLog.summary(): { state, timeouts, ... }
 * @param {Array<{path:string, exists:boolean}>|null} o.sidecars
 * @param {object|null} o.coverage   from captureDetailedDump: { covState, arenaCoveragePct, ... }
 * @param {object|null} o.capability { detected:boolean, what, expectedMB, observedMB, artifact }
 */
export function assessReading({
  identity = null, phaseSummary = null, sidecars = null, coverage = null, capability = null,
  label = 'reading',
} = {}) {
  const rows = {};

  // --- 1. IDENTITY LOCK -----------------------------------------------------
  if (!identity) rows.identityLock = unproven('no identity block was recorded with the reading');
  else if (!identity.commit || !identity.buildStamp) {
    rows.identityLock = red('the reading does not name both a commit and a build stamp, so it cannot '
      + 'be tied to a tree; a memory number without a build is not attributable to anything');
  } else if (identity.expectedSha && identity.servedSha && identity.expectedSha !== identity.servedSha) {
    rows.identityLock = red(`the served bundle SHA (${String(identity.servedSha).slice(0, 12)}) is not `
      + `the pinned one (${String(identity.expectedSha).slice(0, 12)}); the reading measured a build `
      + 'nobody asked for');
  } else if (!identity.expectedSha || !identity.servedSha) {
    rows.identityLock = unproven('no served-bundle SHA comparison was made, so the tree is named but '
      + 'the bytes are not; presence of a commit is not proof the browser loaded it');
  } else {
    rows.identityLock = green(`commit ${String(identity.commit).slice(0, 12)}, build ${identity.buildStamp}, `
      + `served SHA matches pinned ${String(identity.expectedSha).slice(0, 12)}`);
  }

  // --- 2. PHASES ------------------------------------------------------------
  if (!phaseSummary) rows.phases = unproven('no phase log accompanied the reading');
  else if (Number(phaseSummary.timeouts) > 0) {
    rows.phases = red(`${phaseSummary.timeouts} phase(s) timed out during the reading; a settle curve `
      + 'with a timed-out read has an unmeasured gap in it and its intervals are not what they say');
  } else if (phaseSummary.state && !/COMPLETE/i.test(String(phaseSummary.state))) {
    rows.phases = red(`the phase log ended in ${phaseSummary.state} rather than complete`);
  } else {
    rows.phases = green(`${phaseSummary.state ?? 'PHASES_COMPLETE'}, 0 timeouts`);
  }

  // --- 3. SIDECARS ----------------------------------------------------------
  if (!Array.isArray(sidecars) || sidecars.length === 0) {
    rows.sidecars = unproven('the reading references no sidecar artifacts, so nothing can be re-derived '
      + 'from it; a number whose inputs were not kept cannot be checked by anyone else');
  } else {
    const missing = sidecars.filter((s) => !s?.exists).map((s) => s?.path);
    rows.sidecars = missing.length
      ? red(`${missing.length} referenced sidecar(s) are not on disk: ${missing.slice(0, 3).join(', ')}`)
      : green(`${sidecars.length} sidecar(s) present`);
  }

  // --- 4. COVERAGE ----------------------------------------------------------
  if (!coverage) rows.coverage = unproven('no COV-01 capture accompanied the reading');
  else if (coverage.covState === 'CAPTURE_FAILED' || coverage.captureError) {
    rows.coverage = red(`the detailed-dump capture threw: ${coverage.captureError ?? 'unknown'}; there `
      + 'is no coverage figure to grade, which is not the same as low coverage');
  } else if (coverage.covState === 'DUMP_UNAVAILABLE') {
    rows.coverage = red('no process produced an allocator dump; this is an instrument failure, not zero '
      + 'named memory');
  } else if (coverage.covState === 'TOTAL_ABSENT') {
    rows.coverage = red('the dump carried no total to measure coverage against (TOTAL-01)');
  } else if (coverage.covState === 'OVERLAP_SUSPECTED') {
    rows.coverage = red('named memory exceeds the total, so roots overlapped; coverage is not additive '
      + 'here and must not be quoted');
  } else if (coverage.basisGuard && coverage.basisGuard.ok === false) {
    rows.coverage = red(`BASIS-GUARD-01 refused the coverage ratio: ${coverage.basisGuard.state}`);
  } else if (!(Number(coverage.arenaCoveragePct) >= MIN_COVERAGE_PCT)) {
    rows.coverage = red(`COV-01 is ${coverage.arenaCoveragePct}% against the ${MIN_COVERAGE_PCT}% floor; `
      + `${coverage.arenaUnattributedMB ?? '?'} MB is unattributed`);
  } else {
    rows.coverage = green(`COV-01 ${coverage.arenaCoveragePct}% across ${coverage.processCount} processes, `
      + `basis ${coverage.sizeBasis}`);
  }

  // --- 5. CAPABILITY PROOF --------------------------------------------------
  if (!capability) {
    rows.capabilityProof = unproven('no capability proof was attached; without one, a flat reading and '
      + 'a blind instrument are indistinguishable');
  } else if (capability.detected !== true) {
    rows.capabilityProof = red(`the instrument did not re-detect the known change (${capability.what}); `
      + 'it cannot be trusted to have seen an unknown one');
  } else {
    rows.capabilityProof = green(`re-detected ${capability.what}`
      + (capability.observedMB != null ? ` at ${capability.observedMB} MB` : '')
      + (capability.artifact ? ` — ${capability.artifact}` : ''));
  }

  const reds = ROWS.filter((r) => rows[r].state === 'RED');
  const unprovens = ROWS.filter((r) => rows[r].state === 'UNPROVEN');
  const valid = reds.length === 0 && unprovens.length === 0;

  return {
    check: 'READING-VALIDITY-01',
    label,
    valid,
    quotable: valid,
    state: valid ? 'VALID' : (reds.length ? 'INVALID_RED' : 'INVALID_UNPROVEN'),
    rows,
    redRows: reds,
    unprovenRows: unprovens,
    // The packet row. One line, so it can be pasted without editorialising.
    packetRow: valid
      ? `${label} — VALID — all five rows green (identity lock, phases, sidecars, coverage, capability proof)`
      : `${label} — NOT VALID — ${[...reds, ...unprovens].join(', ')} — failure sidecar attached`,
    why: valid ? null
      : [...reds.map((r) => `[RED ${r}] ${rows[r].reason}`),
        ...unprovens.map((r) => `[UNPROVEN ${r}] ${rows[r].reason}`)].join(' | '),
  };
}

/**
 * The failure sidecar. Deliberately a whole object destined for its own file: the clause says the
 * failure travels in the packet as an artifact, not as a sentence in a paragraph that survives being
 * quoted without it.
 */
export function failureSidecar(verdict, { reading = null, at = new Date().toISOString() } = {}) {
  if (verdict?.valid) return null;
  return {
    sidecar: 'READING-VALIDITY-FAILURE',
    check: 'READING-VALIDITY-01',
    at,
    localOffset: '+01:00',
    label: verdict?.label ?? null,
    state: verdict?.state ?? 'UNKNOWN',
    redRows: verdict?.redRows ?? [],
    unprovenRows: verdict?.unprovenRows ?? [],
    rows: verdict?.rows ?? null,
    reading: reading ?? null,
    instruction: 'This reading is NOT quotable. Do not restate it with a caveat; the caveat is this '
      + 'file. Quoting the number without shipping this sidecar alongside it misrepresents the '
      + 'measurement.',
  };
}
