import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const labels = ['b75', 'b77', 'b78'];
const runs = labels.flatMap((label) => [1, 2, 3].map((run) => {
  const file = `${label}-run-${run}.json`;
  const bytes = fs.readFileSync(path.join(dir, file));
  return { label, run, file, rawArtifactSha256: hash(bytes), data: JSON.parse(bytes) };
}));
const unique = (values) => [...new Set(values)];
const requireOne = (name, values) => {
  const found = unique(values);
  if (found.length !== 1) throw new Error(`FAIL-CLOSED: ${name} differs: ${found.join(', ')}`);
  return found[0];
};
const check = (run, label) => run.data.checks.find((item) => item.label === label);
const parseDetail = (run, label) => JSON.parse(check(run, label).detail);
const coreB = 'H-A8-VP-2 CORE-B: canvas drag moves anchor';
const coreBPrime = 'H-A8-VP-2 CORE-B′: coord tab tracks canvas drag';

const eventShape = (run) => run.data.events.map(({ type, args, state }) => ({
  type,
  args,
  focus: state?.focus,
  activeElement: state?.activeElement,
  dpr: state?.dpr,
  visibility: state?.visibility,
}));
const normalizedChecks = (run) => run.data.checks.map((item) => ({
  ...item,
  detail: item.label === 'H-A8-VP-2 setup: placed' ? '<UUID>' : item.detail,
}));
const rows = runs.map((run) => {
  const b = parseDetail(run, coreB);
  const bp = parseDetail(run, coreBPrime);
  const first = run.data.events[0];
  const last = run.data.events.at(-1);
  const handleStart = run.data.events.find((event) => event.args?.[0] === 468 && event.args?.[1] === 664);
  const dragFirstMove = run.data.events.find((event) => event.seq > handleStart.seq
    && event.type === 'mouse.move.before' && event.args?.[0] !== 468);
  const mouseUps = run.data.events.filter((event) => event.seq > handleStart.seq
    && event.type === 'mouse.up.after');
  const dragEnd = mouseUps[0];
  const recoveryDoubleClickEnd = mouseUps[1];
  const firstGeometryChangeAfterDrag = run.data.events.find((event) => event.seq > dragEnd.seq
    && event.geometry?.price !== 1.10963);
  const coordinatesReady = run.data.events.find((event) => event.seq > recoveryDoubleClickEnd.seq
    && event.coordinates?.inputCount === 2);
  return {
    label: run.label,
    run: run.run,
    requestedCommit: run.data.requestedCommit,
    browserVersion: run.data.browserVersion,
    userAgent: run.data.userAgent,
    durationMs: Date.parse(run.data.endedAt) - Date.parse(run.data.startedAt),
    rawArtifactSha256: run.rawArtifactSha256,
    failureSignatureSha256: run.data.failureSignatureSha256,
    normalizedChecksSha256: hash(JSON.stringify(normalizedChecks(run))),
    eventShapeSha256: hash(JSON.stringify(eventShape(run))),
    eventCount: run.data.events.length,
    firstEventRaf: first.state.raf,
    lastEventRaf: last.state.raf,
    firstEventPerfNow: first.state.now,
    lastEventPerfNow: last.state.now,
    allFocused: run.data.events.every((event) => event.state?.focus === true),
    allDprOne: run.data.events.every((event) => event.state?.dpr === 1),
    geometryBefore: b.geo1,
    geometryAfter: b.geo2,
    coordinateBefore: bp.fields1,
    coordinateAfter: bp.fields2,
    failurePoint: run.data.failures.map((item) => item.label),
    firstExpectedDragFrame: {
      seq: dragFirstMove.seq,
      pointer: dragFirstMove.args,
      geometry: dragFirstMove.geometry,
    },
    dragEnd: { seq: dragEnd.seq, geometry: dragEnd.geometry },
    recoveryDoubleClickEnd: {
      seq: recoveryDoubleClickEnd.seq,
      geometry: recoveryDoubleClickEnd.geometry,
    },
    firstGeometryChangeAfterDrag: firstGeometryChangeAfterDrag ? {
      seq: firstGeometryChangeAfterDrag.seq,
      type: firstGeometryChangeAfterDrag.type,
      geometry: firstGeometryChangeAfterDrag.geometry,
      raf: firstGeometryChangeAfterDrag.state.raf,
    } : null,
    coordinatesReady: {
      seq: coordinatesReady.seq,
      geometry: coordinatesReady.geometry,
      coordinates: coordinatesReady.coordinates,
    },
  };
});

const proof = {
  schema: 'talaria.h-a8-vp-2-repeat-diagnostic/v1',
  verdict: '(A) same mechanism with environment-dependent/flaky output, identifying nondeterministic field/source',
  repetitionsPerCommit: 3,
  corpus: {
    scenarioSha256: requireOne('scenario digest', runs.map((run) => run.data.source.scenarioSha256)),
    helperSha256: requireOne('helper digest', runs.map((run) => run.data.source.helperSha256)),
    functionSha256: requireOne('function digest', runs.map((run) => run.data.source.functionSha256)),
    assertionSemanticSha256: requireOne('assertion digest', runs.map((run) => run.data.source.assertionSha256)),
    assertionText: requireOne('assertion text', runs.map((run) => run.data.source.assertionText)),
  },
  environment: {
    browserVersion: requireOne('browser version', rows.map((row) => row.browserVersion)),
    userAgent: requireOne('user agent', rows.map((row) => row.userAgent)),
    launch: runs[0].data.launch,
    pinnedInputs: {
      migrationOn: false,
      allScenarioKillSwitches: false,
      freshServerAndBrowserPerRun: true,
    },
  },
  deterministic: {
    failureSignatureSha256: requireOne('failure signature', rows.map((row) => row.failureSignatureSha256)),
    normalizedChecksSha256: requireOne('normalized checks', rows.map((row) => row.normalizedChecksSha256)),
    eventShapeSha256: requireOne('event shape', rows.map((row) => row.eventShapeSha256)),
    eventCount: requireOne('event count', rows.map((row) => row.eventCount)),
    allFocused: rows.every((row) => row.allFocused),
    allDprOne: rows.every((row) => row.allDprOne),
    failurePoint: requireOne('failure point', rows.map((row) => JSON.stringify(row.failurePoint))),
    geometryBefore: requireOne('geometry before', rows.map((row) => JSON.stringify(row.geometryBefore))),
    geometryAfter: requireOne('geometry after', rows.map((row) => JSON.stringify(row.geometryAfter))),
    coordinateBefore: requireOne('coordinate before', rows.map((row) => JSON.stringify(row.coordinateBefore))),
    coordinateAfter: requireOne('coordinate after', rows.map((row) => JSON.stringify(row.coordinateAfter))),
    firstExpectedDragFrame: requireOne('first expected drag frame', rows.map((row) => JSON.stringify(row.firstExpectedDragFrame))),
    dragEnd: requireOne('drag end', rows.map((row) => JSON.stringify(row.dragEnd))),
    coordinatesReady: requireOne('coordinates ready', rows.map((row) => JSON.stringify(row.coordinatesReady))),
  },
  volatility: {
    rawArtifactsAllDifferent: unique(rows.map((row) => row.rawArtifactSha256)).length === rows.length,
    nondeterministicFields: [
      'setup drawing UUID',
      'wall-clock startedAt/endedAt',
      'diagnostic server port',
      'process hostNs',
      'performance.now',
      'requestAnimationFrame counter at each event',
      'frame/event where the asynchronous settings-recovery double-click applies price 1.10865',
    ],
    source: 'browser/process scheduling and generated drawing identity; recovery-update frame varies, but final geometry/coordinates, assertion semantics, event order/arguments, focus, DPR, and failure mechanism do not',
    firstDivergentObservedField: 'events[0].state.raf',
    firstEventRafByRun: rows.map(({ label, run, firstEventRaf }) => ({ label, run, firstEventRaf })),
    durationMsByRun: rows.map(({ label, run, durationMs }) => ({ label, run, durationMs })),
    recoveryGeometryChangeByRun: rows.map(({ label, run, firstGeometryChangeAfterDrag }) => ({
      label,
      run,
      firstGeometryChangeAfterDrag,
    })),
  },
  firstDivergentFrameOrValue: {
    betweenCommits: null,
    mechanism: 'At event 83, the first post-mousedown drag move reaches [462.1666666666667,665.5], but geometry remains barIndex=614 price=1.10963. It remains unchanged through drag mouse-up event 108.',
    recovery: 'The later settings-recovery double-click asynchronously changes geometry price to 1.10865 at a scheduling-dependent event/frame; event 118 exposes coordinates bar=614 price=1.10865. The earlier geo2 assertion snapshot remains 614/1.10963.',
    statement: 'No geometry, coordinate, assertion, focus, DPR, event-order, or event-argument difference between commits or repetitions in 9/9 runs.',
    firstVolatileFrameField: 'The first observed mouse event has differing parent-window rAF counters; ranges overlap across commits.',
  },
  rows,
};

fs.writeFileSync(path.join(dir, 'diagnostic-summary.json'), `${JSON.stringify(proof, null, 2)}\n`);
const readme = [
  '# H-A8-VP-2 repeated identity diagnostic',
  '',
  `Verdict: ${proof.verdict}`,
  '',
  `Nine fresh runs (3 each) produced the same failure signature \`${proof.deterministic.failureSignatureSha256}\`, event shape, focus/DPR state, geometry, coordinates, assertion text, and source digests.`,
  'The full raw artifacts differ through generated UUID, ports, wall/performance time, host monotonic time, rAF counters, and whether the asynchronous recovery update is first observed at event 114 or 115; those timing ranges overlap across B75, B77, and B78.',
  '',
  'Failure: the first expected drag frame is event 83 at pointer [462.1666666666667,665.5], but geometry remains bar=614 price=1.10963 through drag-end event 108. The later settings-recovery double-click applies price=1.10865 at scheduling-dependent event 114/115; by event 118 both live geometry and coordinates are bar=614 price=1.10865, while the earlier geo2 assertion snapshot remains 614/1.10963. CORE-B and CORE-B-prime therefore fail in every run.',
  '',
  'No F5/V1/V2/V5 bisect was run because no commit-specific failure difference was observed.',
  '',
].join('\n');
fs.writeFileSync(path.join(dir, 'README.md'), readme);
console.log(JSON.stringify({ verdict: proof.verdict, deterministic: proof.deterministic, volatility: proof.volatility }, null, 2));
