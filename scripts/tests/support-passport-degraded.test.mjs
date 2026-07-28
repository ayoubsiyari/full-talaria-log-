import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import * as passportLib from '../lib/support-passport-degraded.mjs';
import {
  API_SERVER_RELATIVE_PATH,
  CONSUMER_PIN_DECOYS,
  DEGRADED_MODULE_ID_PATTERN,
  INDICATOR_PERFORMANCE_RELATIVE_PATH,
  MAX_PASSPORT_DEGRADED_MODULES,
  MODULE_PRESENCE_RUNTIME_RELATIVE_PATH,
  REJECTED_DEGRADED_ID_SAMPLES,
  SERVER_CONTEXT_COERCION_FINDING_ID,
  SUPPORT_PASSPORT_ALIASES,
  SUPPORT_PASSPORT_BEHAVIORAL_MUTANTS,
  SUPPORT_PASSPORT_CONSUMERS,
  SUPPORT_UI_RELATIVE_PATH,
  TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
  TEMPORAL_CLOCK_ADVANCE_MS,
  TEMPORAL_DEGRADATION_SEQUENCE,
  countAliasLines,
  createSupportPassportRealm,
  dropAliasFromSupportUi,
  freezeConsumerValueAfterCall,
  hoistConsumerCallToUseMemo,
  inspectConsumerCallPath,
  normalizeLineEndings,
  probeServerContextCoercionFinding,
  reassignConsumerContextAfterPayload,
  resolveTypeScript,
  runBehavioralCells,
  runBehavioralMutantCells,
  runConsumerCallPathCell,
  runNcAliasDropCells,
  runNcConsumerCallDeletedCell,
  runNcConsumerCallHoistedUseMemoCell,
  runNcConsumerContextReassignedCell,
  runNcConsumerPinDecoysCell,
  runNcConsumerValueFrozenCell,
  runPassportDegradedAliasBootCell,
  runPassportDegradedBoundingPropertiesCell,
  runPassportDegradedKeyAlwaysCell,
  runPassportDegradedRealmFidelityCell,
  runPassportDegradedRoundTripCell,
  runPassportDegradedTemporalCell,
  runSupportPassportDegradedGate,
} from '../lib/support-passport-degraded.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => normalizeLineEndings(fs.readFileSync(path.join(root, relative), 'utf8'));

const supportUiSource = read(SUPPORT_UI_RELATIVE_PATH);
const runtimeSource = read(MODULE_PRESENCE_RUNTIME_RELATIVE_PATH);
const indicatorPerfSource = read(INDICATOR_PERFORMANCE_RELATIVE_PATH);
const typescript = resolveTypeScript(root);
const consumerSources = Object.fromEntries(
  SUPPORT_PASSPORT_CONSUMERS.map((consumer) => [consumer.relativePath, read(consumer.relativePath)]),
);
const deps = {
  supportUiSource, runtimeSource, indicatorPerfSource, typescript, consumerSources,
};

test('signature token is TALARIA_SUPPORT_PASSPORT_DEGRADED_V1', () => {
  assert.equal(TALARIA_SUPPORT_PASSPORT_DEGRADED_V1, 'TALARIA_SUPPORT_PASSPORT_DEGRADED_V1');
});

test('a TypeScript compiler is resolvable — the gate cannot run without one', () => {
  assert.ok(typescript, 'run `npm ci` at the workspace root');
  assert.equal(typeof typescript.transpileModule, 'function');
});

test('no hand-copied extractor survives in the gate library', () => {
  // The W40 REJECT carrier: a mirror of buildSupportContext can only prove self-agreement.
  assert.equal(passportLib.extractDegradedModulesForPassport, undefined);
  assert.equal(passportLib.passportDegradedModulesSlice, undefined);
  const libSource = read('scripts/lib/support-passport-degraded.mjs');
  assert.doesNotMatch(libSource, /__TALARIA_DEGRADED_STATE\s*\?\?/);
});

test('the W40 substring source pins are gone, not renamed', () => {
  // R-M6-2: `window.__TALARIA_DEGRADED_STATE` is a prefix of `..._STATE__`, so as a
  // substring pin it could never go missing. Unfalsifiable pins are deleted, not softened.
  assert.equal(passportLib.SUPPORT_UI_DEGRADED_CONTRACT_TOKENS, undefined);
  assert.equal(passportLib.assertSupportUiDegradedSourceContract, undefined);
  assert.equal(passportLib.stripCommentsAndStringLiterals, undefined);
  assert.equal(passportLib.runNcAliasPinCell, undefined);
  assert.equal(passportLib.runNcCommentDoesNotSatisfyPinCell, undefined);
});

test('the realm evaluates the real supportUi.tsx export over the real runtime window', () => {
  const realm = createSupportPassportRealm({ ...deps, providerPresent: true });
  assert.equal(typeof realm.buildSupportContext, 'function');
  // Provenance: the function under test came from the .tsx on disk, not from this repo's
  // test fixtures — the marker below only exists because supportUi.tsx sets it.
  const ctx = realm.buildSupportContext();
  assert.equal(ctx.app, 'talaria-dashboard');
  assert.equal(ctx.url, 'https://app.talaria.test/dashboard/support');
  // ...and the window it read is the one module-presence-runtime.js published.
  assert.deepEqual(
    Array.from(realm.window.__TALARIA_LOADED_MODULES, (item) => item.module),
    ['ModulePresenceRuntime', 'IndicatorPerf'],
  );
  assert.equal(realm.window.__TALARIA_DEGRADED_STATE__, realm.window.__TALARIA_DEGRADED_STATE);
});

test('PASSPORT-DEGRADED-KEY-ALWAYS [soundness VER-01]: healthy runtime yields an empty array key', () => {
  const cell = runPassportDegradedKeyAlwaysCell(deps);
  assert.equal(cell.coverage, 'soundness');
  assert.equal(cell.ver, 'VER-01');
  assert.equal(cell.status, 'GREEN');
  assert.equal(cell.passportValueType, 'array');
  assert.deepEqual(cell.passportValue, []);
});

test('PASSPORT-DEGRADED-ROUND-TRIP [soundness VER-01]: expectation is read back from the runtime', () => {
  const cell = runPassportDegradedRoundTripCell(deps);
  assert.equal(cell.coverage, 'soundness');
  assert.equal(cell.status, 'GREEN');
  // IndicatorPerf comes from the runtime's own tripwire, OrderOverlay from the product API.
  assert.deepEqual(cell.runtimeModules, ['IndicatorPerf', 'OrderOverlay']);
  assert.deepEqual(cell.passportModules, cell.runtimeModules);
});

test('PASSPORT-DEGRADED-ROUND-TRIP goes RED when the runtime publisher is silenced', () => {
  // Carrier 2: if the cell were comparing an injected literal against itself, neutering the
  // runtime would leave it GREEN. It must not.
  const silenced = runtimeSource.replace(
    'degraded.degradedModules.push(id);',
    '/* publisher removed by negative control */',
  );
  assert.notEqual(silenced, runtimeSource);
  const cell = runPassportDegradedRoundTripCell({ ...deps, runtimeSource: silenced });
  assert.equal(cell.status, 'RED');
  assert.equal(cell.runtimeDidDegrade, false);
});

test('PASSPORT-DEGRADED-BOUNDING-PROPERTIES [soundness VER-01]: subset, dedupe, junk, cap', () => {
  const cell = runPassportDegradedBoundingPropertiesCell(deps);
  assert.equal(cell.coverage, 'soundness');
  assert.equal(cell.status, 'GREEN');
  assert.deepEqual(cell.properties, {
    isArray: true,
    subset: true,
    deduped: true,
    junkRejected: true,
    patternHeld: true,
    capExact: true,
  });
  assert.equal(cell.passportLength, MAX_PASSPORT_DEGRADED_MODULES);
  assert.ok(cell.offeredValidUnique > MAX_PASSPORT_DEGRADED_MODULES);
  assert.ok(REJECTED_DEGRADED_ID_SAMPLES.some((id) => !DEGRADED_MODULE_ID_PATTERN.test(id)));
});

/* ------------------------------------------------------------------ *
 * R-M6-2 item 1 — temporal cell, one realm, three calls.             *
 * ------------------------------------------------------------------ */

test('PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE [soundness VER-01]: later calls see later modules', () => {
  const cell = runPassportDegradedTemporalCell(deps);
  assert.equal(cell.coverage, 'soundness');
  assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
  assert.equal(cell.calls, TEMPORAL_DEGRADATION_SEQUENCE.length + 1);
  // First call is the empty one; each later call reflects one more runtime module.
  assert.deepEqual(cell.observed, [[], ['OrderOverlay'], ['OrderOverlay', 'AlertSystem']]);
  assert.deepEqual(cell.observed, cell.runtimeSeen);
  assert.equal(cell.runtimeAdvanced, true);
  assert.equal(cell.laterCallsSawNewModules, true);
  // W43: post-load readyState + wall-clock steps between tickets.
  assert.equal(cell.readyStateAtTicket, 'complete');
  assert.equal(cell.realmLooksLikePostLoad, true);
  assert.equal(cell.clockAdvancedBetweenTickets, true);
  assert.equal(cell.clockAdvanceMs, TEMPORAL_CLOCK_ADVANCE_MS);
  assert.equal(cell.noUnmodelledReads, true);
  assert.deepEqual(cell.unknownReads, []);
  assert.equal(cell.environmentsAgree, true);
  assert.equal(cell.browserProfileArmed, true);
  assert.equal(cell.productionProfileArmed, true);
  assert.equal(cell.productionHost, 'app.talaria.io');
  assert.deepEqual(cell.browserObserved, cell.observed);
  assert.deepEqual(cell.productionObserved, cell.observed);
  assert.ok(cell.clockMarks.every((mark, i) => (
    i === 0 || mark - cell.clockMarks[i - 1] >= TEMPORAL_CLOCK_ADVANCE_MS
  )));
});

test('PASSPORT-DEGRADED-REALM-FIDELITY [soundness VER-01]: modelled surfaces, no unknown reads', () => {
  const cell = runPassportDegradedRealmFidelityCell(deps);
  assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
  assert.equal(cell.modelledSurfacesPresent, true);
  assert.deepEqual(cell.unknownReads, []);
  assert.equal(cell.visibilityState, 'visible');
});

test('PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE uses ONE realm — the calls share runtime state', () => {
  // The property the cell rests on, asserted directly: a second call on the same realm
  // observes a module that was marked after the first call returned.
  const realm = createSupportPassportRealm({ ...deps, providerPresent: true });
  assert.equal(realm.document.readyState, 'complete');
  const first = Array.from(realm.buildSupportContext().degradedModules);
  realm.clock.advance(TEMPORAL_CLOCK_ADVANCE_MS);
  realm.window.__talariaMarkMissingModule('OrderOverlay');
  const second = Array.from(realm.buildSupportContext().degradedModules);
  assert.deepEqual(first, []);
  assert.deepEqual(second, ['OrderOverlay']);
});

test('the realm advances readyState to complete after boot — R-M6-3 loading hole closed', () => {
  const loading = createSupportPassportRealm({
    ...deps, providerPresent: true, postBootReadyState: 'loading',
  });
  assert.equal(loading.document.readyState, 'loading');
  const postLoad = createSupportPassportRealm({ ...deps, providerPresent: true });
  assert.equal(postLoad.document.readyState, 'complete');
  // Controllable Date.now is what the warm-up mutant reads.
  const t0 = postLoad.clock.now();
  postLoad.clock.advance(TEMPORAL_CLOCK_ADVANCE_MS);
  assert.equal(postLoad.clock.now(), t0 + TEMPORAL_CLOCK_ADVANCE_MS);
});

test('PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE goes RED when the runtime cannot advance', () => {
  // Non-vacuity of the non-vacuity guard: with the publisher silenced the runtime never
  // grows, so the cell must refuse rather than agree with a frozen expectation.
  const silenced = runtimeSource.replace(
    'degraded.degradedModules.push(id);',
    '/* publisher removed by negative control */',
  );
  const cell = runPassportDegradedTemporalCell({ ...deps, runtimeSource: silenced });
  assert.equal(cell.status, 'RED');
  assert.equal(cell.runtimeAdvanced, false);
});

/* ------------------------------------------------------------------ *
 * R-M6-2 item 2 — behavioural alias boot replaces the substring pins. *
 * ------------------------------------------------------------------ */

test('each alias boots alone and the real function still finds the degraded record', () => {
  for (const alias of SUPPORT_PASSPORT_ALIASES) {
    const cell = runPassportDegradedAliasBootCell(deps, alias);
    assert.equal(cell.cell, alias.cell);
    assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
    assert.equal(cell.otherAliasesAbsent, true);
    assert.equal(cell.runtimeDidDegrade, true);
    assert.deepEqual(cell.passportModules, cell.runtimeModules);
    assert.ok(cell.passportModules.includes('OrderOverlay'));
  }
});

test('an alias-only realm really does delete the other two globals', () => {
  const realm = createSupportPassportRealm({
    ...deps,
    providerPresent: false,
    aliasOnly: '__TALARIA_DEGRADED_MODE__',
  });
  assert.equal(realm.window.__TALARIA_DEGRADED_STATE, undefined);
  assert.equal(realm.window.__TALARIA_DEGRADED_STATE__, undefined);
  assert.ok(Array.isArray(realm.window.__TALARIA_DEGRADED_MODE__.degradedModules));
});

test('the canonical alias is uniquely targetable — the prefix is no longer a free pass', () => {
  // The R-M6-2 defect in one assertion: as a bare substring `window.__TALARIA_DEGRADED_STATE`
  // occurs twice (it is a prefix of `..._STATE__`), so a substring pin on it can never fail.
  // The line matcher the alias drop uses counts it exactly once.
  const occurrences = supportUiSource.split('window.__TALARIA_DEGRADED_STATE').length - 1;
  assert.ok(occurrences >= 2, 'the prefix is expected to be ambiguous as a substring');
  assert.equal(countAliasLines(supportUiSource, '__TALARIA_DEGRADED_STATE'), 1);
  assert.equal(countAliasLines(supportUiSource, '__TALARIA_DEGRADED_STATE__'), 1);
  assert.equal(countAliasLines(supportUiSource, '__TALARIA_DEGRADED_MODE__'), 1);
});

test('dropping any single alias leaves supportUi.tsx compiling and one alias short', () => {
  for (const [index, alias] of SUPPORT_PASSPORT_ALIASES.entries()) {
    const mutated = dropAliasFromSupportUi(supportUiSource, index);
    assert.ok(mutated, `${alias.id} drop did not apply`);
    assert.notEqual(mutated, supportUiSource);
    assert.equal(countAliasLines(mutated, alias.global), 0);
    for (const other of SUPPORT_PASSPORT_ALIASES) {
      if (other.global === alias.global) continue;
      assert.equal(countAliasLines(mutated, other.global), 1, `${other.id} was collateral damage`);
    }
    // A syntax error would be a false kill; the mutated source must still transpile.
    assert.doesNotThrow(() => createSupportPassportRealm({ ...deps, supportUiSource: mutated }));
  }
});

test('NC-ALIAS-DROP-* [wiring VER-01]: each alias cell is the sole detector for its alias', () => {
  const cells = runNcAliasDropCells(deps);
  assert.equal(cells.length, SUPPORT_PASSPORT_ALIASES.length);
  for (const [index, cell] of cells.entries()) {
    const alias = SUPPORT_PASSPORT_ALIASES[index];
    assert.equal(cell.cell, `NC-ALIAS-DROP-${alias.id.toUpperCase()}`);
    assert.equal(cell.coverage, 'wiring');
    assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
    assert.equal(cell.detectorCell, alias.cell);
    assert.equal(cell.detectorWentRed, true);
    // No collateral: the other six behavioural cells cannot see the alias go.
    assert.deepEqual(cell.collateralRedCells, []);
  }
});

/* ------------------------------------------------------------------ *
 * R-M6-2 items 3 and 4 — consumer call path, pinned by AST.          *
 * ------------------------------------------------------------------ */

test('SUPPORT-PASSPORT-CONSUMER-CALL-PATH [wiring VER-01]: both consumers import and call it', () => {
  const cell = runConsumerCallPathCell(deps);
  assert.equal(cell.coverage, 'wiring');
  assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
  assert.deepEqual(cell.unwiredConsumers, []);
  assert.equal(cell.consumers.length, SUPPORT_PASSPORT_CONSUMERS.length);
  for (const consumer of cell.consumers) {
    assert.equal(consumer.importsFromSupportUi, true);
    assert.ok(consumer.callCount >= 1);
    assert.ok(consumer.submitHandlerCallCount >= 1, JSON.stringify(consumer.callSites));
    assert.ok(consumer.valueFlowCallCount >= 1, JSON.stringify(consumer.callSites));
    assert.ok(consumer.callLines.every((line) => Number.isInteger(line) && line > 0));
    assert.ok(consumer.callSites.every((site) => site.onSubmitHandler === true));
    assert.ok(consumer.callSites.every((site) => site.valueReachesContext === true));
  }
});

test('the SupportInbox pin names the real send site', () => {
  const relativePath = 'homepage/src/app/dashboard/support/SupportInbox.tsx';
  const facts = inspectConsumerCallPath({
    typescript,
    relativePath,
    source: consumerSources[relativePath],
  });
  assert.equal(facts.callCount, 1);
  assert.equal(facts.submitHandlerCallCount, 1);
  assert.equal(facts.callSites[0].enclosingFunction, 'createThread');
  const line = consumerSources[relativePath].split('\n')[facts.callLines[0] - 1];
  // The passport is what the ticket carries: this call is the `context:` field of the payload.
  assert.match(line, /context:\s*buildSupportContext\(\)/);
});

test('NC-CONSUMER-CALL-DELETED [wiring VER-01]: deleting the call goes RED, import intact', () => {
  const cell = runNcConsumerCallDeletedCell(deps);
  assert.equal(cell.coverage, 'wiring');
  assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
  assert.equal(cell.results.length, SUPPORT_PASSPORT_CONSUMERS.length);
  for (const result of cell.results) {
    assert.equal(result.applied, true);
    assert.equal(result.wentRed, true);
    // Keying on the import alone would survive the deletion; the pin keys on the call.
    assert.equal(result.importSurvived, true);
  }
});

test('NC-CONSUMER-CALL-HOISTED-USEMEMO [wiring VER-01]: mount-time freeze goes RED', () => {
  // R-M6-3: callCount stays ≥1 with the import intact, but the submit handler no longer
  // evaluates the passport — every later ticket carries the mount-time snapshot.
  const cell = runNcConsumerCallHoistedUseMemoCell(deps);
  assert.equal(cell.coverage, 'wiring');
  assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
  for (const result of cell.results) {
    assert.equal(result.applied, true);
    assert.equal(result.callCountSurvived, true);
    assert.equal(result.importSurvived, true);
    assert.equal(result.submitHandlerLost, true);
    assert.equal(result.wentRed, true);
  }
  for (const consumer of SUPPORT_PASSPORT_CONSUMERS) {
    const hoisted = hoistConsumerCallToUseMemo(consumerSources[consumer.relativePath]);
    assert.ok(hoisted);
    const facts = inspectConsumerCallPath({
      typescript,
      relativePath: consumer.relativePath,
      source: hoisted,
    });
    assert.ok(facts.callCount >= 1);
    assert.equal(facts.submitHandlerCallCount, 0);
    assert.ok(facts.callSites.some((site) => site.insideUseMemo === true));
  }
});

test('NC-CONSUMER-VALUE-FROZEN [wiring VER-01]: downstream snapshot freeze goes RED', () => {
  const cell = runNcConsumerValueFrozenCell(deps);
  assert.equal(cell.coverage, 'wiring');
  assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
  for (const result of cell.results) {
    assert.equal(result.applied, true);
    assert.equal(result.callCountSurvived, true);
    assert.equal(result.submitHandlerSurvived, true);
    assert.equal(result.importSurvived, true);
    assert.equal(result.valueFlowLost, true);
    assert.equal(result.wentRed, true);
  }
  for (const consumer of SUPPORT_PASSPORT_CONSUMERS) {
    const frozen = freezeConsumerValueAfterCall(consumerSources[consumer.relativePath]);
    assert.ok(frozen);
    const facts = inspectConsumerCallPath({
      typescript,
      relativePath: consumer.relativePath,
      source: frozen,
    });
    assert.ok(facts.submitHandlerCallCount >= 1);
    assert.equal(facts.valueFlowCallCount, 0);
  }
});

test('NC-CONSUMER-CONTEXT-REASSIGNED [wiring VER-01]: payload.context overwrite goes RED', () => {
  const cell = runNcConsumerContextReassignedCell(deps);
  assert.equal(cell.coverage, 'wiring');
  assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
  for (const result of cell.results) {
    assert.equal(result.applied, true);
    assert.equal(result.reassignmentDetected, true);
    assert.equal(result.valueFlowLost, true);
    assert.equal(result.wentRed, true);
  }
  for (const consumer of SUPPORT_PASSPORT_CONSUMERS) {
    const mutated = reassignConsumerContextAfterPayload(consumerSources[consumer.relativePath]);
    assert.ok(mutated);
    const facts = inspectConsumerCallPath({
      typescript,
      relativePath: consumer.relativePath,
      source: mutated,
    });
    assert.ok(facts.callSites.some((site) => site.contextReassignedAfter === true));
    assert.equal(facts.valueFlowCallCount, 0);
  }
});

test('NC-CONSUMER-PIN-DECOYS [wiring VER-01]: comment, string, template, regex and JSX text cannot pay', () => {
  const cell = runNcConsumerPinDecoysCell(deps);
  assert.equal(cell.coverage, 'wiring');
  assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
  assert.deepEqual(cell.decoysThatPaidThePin, []);
  assert.equal(cell.decoysChecked, CONSUMER_PIN_DECOYS.length * SUPPORT_PASSPORT_CONSUMERS.length);
  // The two classes R-M6-2 named specifically must be in the battery.
  const kinds = new Set(CONSUMER_PIN_DECOYS.map((decoy) => decoy.kind));
  assert.ok(kinds.has('regexLiteral'));
  assert.ok(kinds.has('jsxText'));
  // Each decoy is also appended to the intact file: a decoy that broke parsing would show
  // up as a lost call site rather than as a decoy that was correctly ignored.
  for (const result of cell.results) {
    assert.equal(result.decoyCallSites, 0);
    assert.ok(result.intactCallSites >= 1);
  }
});

test('the decoy battery is not vacuous — a real added call site does pay the pin', () => {
  const relativePath = 'homepage/src/app/dashboard/support/SupportInbox.tsx';
  const source = consumerSources[relativePath];
  const withExtraCall = `${source}\nexport const __realCall = buildSupportContext();\n`;
  assert.equal(inspectConsumerCallPath({ typescript, relativePath, source }).callCount, 1);
  assert.equal(
    inspectConsumerCallPath({ typescript, relativePath, source: withExtraCall }).callCount,
    2,
  );
});

test('SUPPORT-PASSPORT-CONSUMER-CALL-PATH is RED when a consumer file cannot be read', () => {
  const cell = runConsumerCallPathCell({ ...deps, consumerSources: {} });
  assert.equal(cell.status, 'RED');
  assert.equal(cell.unwiredConsumers.length, SUPPORT_PASSPORT_CONSUMERS.length);
});

/* ------------------------------------------------------------------ *
 * Behavioural mutants.                                                *
 * ------------------------------------------------------------------ */

const ALIAS_CELLS = SUPPORT_PASSPORT_ALIASES.map((alias) => alias.cell);
const ALL_BEHAVIORAL_CELLS = [
  'PASSPORT-DEGRADED-KEY-ALWAYS',
  'PASSPORT-DEGRADED-ROUND-TRIP',
  'PASSPORT-DEGRADED-BOUNDING-PROPERTIES',
  'PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE',
  'PASSPORT-DEGRADED-REALM-FIDELITY',
  ...ALIAS_CELLS,
];

const EXPECTED_MUTANT_KILLS = {
  M1: {
    name: 'NC-MUTANT-CAP-ZERO',
    killedBy: [
      'PASSPORT-DEGRADED-ROUND-TRIP',
      'PASSPORT-DEGRADED-BOUNDING-PROPERTIES',
      'PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE',
      ...ALIAS_CELLS,
    ],
  },
  M2: {
    name: 'NC-MUTANT-DECOY-REGEX',
    killedBy: ['PASSPORT-DEGRADED-BOUNDING-PROPERTIES'],
  },
  M3: {
    name: 'NC-MUTANT-POST-ASSIGNMENT-CLEAR',
    killedBy: [
      'PASSPORT-DEGRADED-ROUND-TRIP',
      'PASSPORT-DEGRADED-BOUNDING-PROPERTIES',
      'PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE',
      ...ALIAS_CELLS,
    ],
  },
  M4: {
    name: 'NC-MUTANT-DEDUPE-DROP',
    killedBy: ['PASSPORT-DEGRADED-BOUNDING-PROPERTIES'],
  },
  M5: {
    name: 'NC-MUTANT-ARRAY-STRING-COERCION',
    // REALM-FIDELITY only watches unmodelled API reads; a shape coercion does not trip it.
    killedBy: ALL_BEHAVIORAL_CELLS.filter((name) => name !== 'PASSPORT-DEGRADED-REALM-FIDELITY'),
  },
  M6: {
    name: 'NC-MUTANT-MEMOIZED-PASSPORT',
    killedBy: ['PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE'],
  },
  M7: {
    name: 'NC-MUTANT-MEMOIZED-AFTER-WARMUP',
    killedBy: ['PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE'],
  },
  M8: {
    name: 'NC-MUTANT-SESSION-STORAGE-CACHE',
    killedBy: ['PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE'],
  },
  M9: {
    name: 'NC-MUTANT-PERFORMANCE-NOW-WARMUP',
    killedBy: ['PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE'],
  },
  M10: {
    name: 'NC-MUTANT-UNMODELLED-API-READ',
    killedBy: [
      'PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE',
      'PASSPORT-DEGRADED-REALM-FIDELITY',
    ],
  },
  M11: {
    name: 'NC-MUTANT-PERFORMANCE-TIMEORIGIN-WARMUP',
    killedBy: ['PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE'],
  },
  M12: {
    name: 'NC-MUTANT-BODY-DATASET-CACHE',
    killedBy: ['PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE'],
  },
  M13: {
    name: 'NC-MUTANT-SERVICE-WORKER-GATED-CACHE',
    killedBy: [
      'PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE',
      'PASSPORT-DEGRADED-REALM-FIDELITY',
    ],
  },
  M14: {
    name: 'NC-MUTANT-BARE-SESSION-STORAGE-CACHE',
    killedBy: ['PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE'],
  },
  M15: {
    name: 'NC-MUTANT-HOST-GATED-CACHE',
    killedBy: ['PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE'],
  },
  M16: {
    name: 'NC-MUTANT-SETTIMEOUT-TTL-CACHE',
    killedBy: ['PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE'],
  },
};

test('behavioural mutants M1-M16 are each applied and each killed by a named cell', () => {
  const cells = runBehavioralMutantCells(deps);
  assert.equal(cells.length, 16);
  for (const cell of cells) {
    const expected = EXPECTED_MUTANT_KILLS[cell.mutant];
    assert.ok(expected, `unexpected mutant ${cell.mutant}`);
    assert.equal(cell.cell, expected.name);
    assert.equal(cell.status, 'GREEN', `${cell.mutant} survived: ${JSON.stringify(cell)}`);
    assert.deepEqual(cell.killedBy, expected.killedBy);
  }
});

test('M6 readyState-gated memoisation is killed by the temporal cell and by nothing else', () => {
  // R-M6-3 carrier: cache gated on readyState==="complete" stayed GREEN while the realm
  // was permanently "loading". With post-load readyState the temporal cell is the killer.
  const mutant = SUPPORT_PASSPORT_BEHAVIORAL_MUTANTS.find((m) => m.id === 'M6');
  const mutated = mutant.apply(supportUiSource);
  assert.ok(mutated && mutated !== supportUiSource);
  assert.match(mutated, /document\.readyState === "complete"/);

  const cell = runBehavioralMutantCells(deps).find((c) => c.mutant === 'M6');
  assert.equal(cell.status, 'GREEN');
  assert.deepEqual(cell.killedBy, ['PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE']);
  assert.deepEqual(
    cell.survivedCells,
    ALL_BEHAVIORAL_CELLS.filter((name) => name !== 'PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE'),
    'every single-call cell survives readyState-gated memoisation',
  );

  const realm = createSupportPassportRealm({ ...deps, supportUiSource: mutated, providerPresent: true });
  assert.equal(realm.document.readyState, 'complete');
  assert.deepEqual(Array.from(realm.buildSupportContext().degradedModules), []);
  realm.window.__talariaMarkMissingModule('OrderOverlay');
  assert.deepEqual(Array.from(realm.window.__TALARIA_DEGRADED_STATE.degradedModules), ['OrderOverlay']);
  assert.deepEqual(Array.from(realm.buildSupportContext().degradedModules), []);
});

test('M7 warm-up memoisation is killed by the temporal cell and by nothing else', () => {
  const mutant = SUPPORT_PASSPORT_BEHAVIORAL_MUTANTS.find((m) => m.id === 'M7');
  const mutated = mutant.apply(supportUiSource);
  assert.ok(mutated && mutated !== supportUiSource);
  assert.match(mutated, /Date\.now\(\) - __passportBoot > 30_000/);

  const cell = runBehavioralMutantCells(deps).find((c) => c.mutant === 'M7');
  assert.equal(cell.status, 'GREEN');
  assert.deepEqual(cell.killedBy, ['PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE']);
  assert.deepEqual(
    cell.survivedCells,
    ALL_BEHAVIORAL_CELLS.filter((name) => name !== 'PASSPORT-DEGRADED-TEMPORAL-RECOMPUTE'),
  );

  // Without a clock advance the warm-up gate never arms — proving the advance is load-bearing.
  const realm = createSupportPassportRealm({ ...deps, supportUiSource: mutated, providerPresent: true });
  assert.deepEqual(Array.from(realm.buildSupportContext().degradedModules), []);
  realm.window.__talariaMarkMissingModule('OrderOverlay');
  assert.deepEqual(Array.from(realm.buildSupportContext().degradedModules), ['OrderOverlay']);
  realm.clock.advance(TEMPORAL_CLOCK_ADVANCE_MS);
  realm.window.__talariaMarkMissingModule('AlertSystem');
  // Cache armed after warm-up: later tickets lose modules marked after the first post-warm call.
  assert.deepEqual(Array.from(realm.buildSupportContext().degradedModules), ['OrderOverlay']);
});

test('every mutant really edits supportUi.tsx — none is a no-op that fakes a kill', () => {
  for (const mutant of SUPPORT_PASSPORT_BEHAVIORAL_MUTANTS) {
    const mutated = mutant.apply(supportUiSource);
    assert.ok(mutated, `${mutant.id} did not apply`);
    assert.notEqual(mutated, supportUiSource, `${mutant.id} is a no-op`);
  }
});

test('a mutant that no longer applies is RED, not a silent pass', () => {
  const cells = runBehavioralMutantCells({ ...deps, supportUiSource: 'export const nothing = 1;\n' });
  assert.equal(cells.length, 16);
  for (const cell of cells) {
    assert.equal(cell.status, 'RED');
    assert.match(cell.reason, /did not apply/);
  }
});

test('an alias drop that cannot be aimed is RED, not a silent pass', () => {
  const cells = runNcAliasDropCells({ ...deps, supportUiSource: 'export const nothing = 1;\n' });
  assert.equal(cells.length, SUPPORT_PASSPORT_ALIASES.length);
  for (const cell of cells) {
    assert.equal(cell.status, 'RED');
    assert.match(cell.reason, /could not be aimed/);
  }
});

test('unmutated source passes every behavioural cell', () => {
  const cells = runBehavioralCells(deps);
  assert.equal(cells.length, ALL_BEHAVIORAL_CELLS.length);
  assert.deepEqual(cells.map((c) => c.cell), ALL_BEHAVIORAL_CELLS);
  assert.ok(cells.every((c) => c.pass === true), JSON.stringify(cells, null, 2));
});

/* ------------------------------------------------------------------ *
 * Out-of-territory finding and aggregation.                           *
 * ------------------------------------------------------------------ */

test('FINDING-SERVER-CONTEXT-STR-COERCION is non-blocking and names the persistence site', () => {
  const apiServerSource = read(API_SERVER_RELATIVE_PATH);
  const finding = probeServerContextCoercionFinding(apiServerSource);
  assert.equal(finding.findingId, SERVER_CONTEXT_COERCION_FINDING_ID);
  assert.equal(finding.blocking, false);
  assert.equal(finding.pass, null, 'a finding must never contribute to allPass');
  assert.ok(['OPEN', 'RESOLVED'].includes(finding.state));
  if (finding.state === 'OPEN') {
    assert.match(finding.location, /^chart v 1\.4\/chart\/api_server\.py:\d+$/);
    assert.match(finding.snippet, /str\(v\)\[:500\]/);
    // The client passport this gate proves is an array; the server stores its repr.
    const roundTrip = runPassportDegradedRoundTripCell(deps);
    assert.ok(Array.isArray(roundTrip.passportModules));
  }
});

test('the finding probe reports RESOLVED once the coercion is gone, still non-blocking', () => {
  const patched = 'extra["context"] = {str(k)[:64]: _support_json_safe(v) for k, v in items}\n';
  const finding = probeServerContextCoercionFinding(patched);
  assert.equal(finding.state, 'RESOLVED');
  assert.equal(finding.pass, null);
});

test('the finding probe is UNPROVEN rather than GREEN when api_server.py is unreadable', () => {
  const finding = probeServerContextCoercionFinding(null);
  assert.equal(finding.state, 'UNPROVEN');
  assert.equal(finding.pass, null);
});

test('gate aggregate is GREEN on the repo sources and excludes findings from allPass', () => {
  const report = runSupportPassportDegradedGate({
    ...deps,
    apiServerSource: read(API_SERVER_RELATIVE_PATH),
  });
  assert.equal(report.signature, TALARIA_SUPPORT_PASSPORT_DEGRADED_V1);
  assert.equal(report.status, 'GREEN', JSON.stringify(report.cells, null, 2));
  assert.equal(report.allPass, true);
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].cell, 'FINDING-SERVER-CONTEXT-STR-COERCION');
  // 8 behavioural + 16 mutants + 3 alias drops + 6 consumer wiring cells.
  assert.equal(report.cells.filter((c) => typeof c.pass === 'boolean').length, 33);
});

test('gate refuses GREEN when no TypeScript compiler is available', () => {
  const report = runSupportPassportDegradedGate({ ...deps, typescript: null });
  assert.equal(report.status, 'RED');
  assert.equal(report.cells[0].cell, 'SUPPORT-PASSPORT-REALM-BOOT');
});
