import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import * as passportLib from '../lib/support-passport-degraded.mjs';
import {
  API_SERVER_RELATIVE_PATH,
  DEGRADED_MODULE_ID_PATTERN,
  INDICATOR_PERFORMANCE_RELATIVE_PATH,
  MAX_PASSPORT_DEGRADED_MODULES,
  MODULE_PRESENCE_RUNTIME_RELATIVE_PATH,
  REJECTED_DEGRADED_ID_SAMPLES,
  SERVER_CONTEXT_COERCION_FINDING_ID,
  SUPPORT_PASSPORT_BEHAVIORAL_MUTANTS,
  SUPPORT_UI_RELATIVE_PATH,
  TALARIA_SUPPORT_PASSPORT_DEGRADED_V1,
  assertSupportUiDegradedSourceContract,
  createSupportPassportRealm,
  normalizeLineEndings,
  probeServerContextCoercionFinding,
  resolveTypeScript,
  runBehavioralCells,
  runBehavioralMutantCells,
  runNcAliasPinCell,
  runNcCommentDoesNotSatisfyPinCell,
  runPassportDegradedBoundingPropertiesCell,
  runPassportDegradedKeyAlwaysCell,
  runPassportDegradedRoundTripCell,
  runSupportPassportDegradedGate,
  stripCommentsAndStringLiterals,
} from '../lib/support-passport-degraded.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => normalizeLineEndings(fs.readFileSync(path.join(root, relative), 'utf8'));

const supportUiSource = read(SUPPORT_UI_RELATIVE_PATH);
const runtimeSource = read(MODULE_PRESENCE_RUNTIME_RELATIVE_PATH);
const indicatorPerfSource = read(INDICATOR_PERFORMANCE_RELATIVE_PATH);
const typescript = resolveTypeScript(root);
const deps = { supportUiSource, runtimeSource, indicatorPerfSource, typescript };

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

test('SUPPORT-UI-SOURCE-CONTRACT [wiring VER-01]: alias pins hold on stripped source', () => {
  const cell = assertSupportUiDegradedSourceContract(supportUiSource);
  assert.equal(cell.coverage, 'wiring');
  assert.equal(cell.status, 'GREEN');
  assert.equal(cell.scanned, 'comments-and-string-literals-stripped');
});

test('stripCommentsAndStringLiterals erases comment and literal bodies, keeping line count', () => {
  const source = [
    '// window.__TALARIA_DEGRADED_STATE__',
    '/* window.__TALARIA_DEGRADED_MODE__ */',
    'const a = "window.__TALARIA_DEGRADED_STATE";',
    'const b = window.__TALARIA_DEGRADED_STATE;',
  ].join('\n');
  const stripped = stripCommentsAndStringLiterals(source);
  assert.equal(stripped.split('\n').length, source.split('\n').length);
  assert.ok(!stripped.includes('__TALARIA_DEGRADED_STATE__'));
  assert.ok(!stripped.includes('__TALARIA_DEGRADED_MODE__'));
  assert.equal((stripped.match(/window\.__TALARIA_DEGRADED_STATE/g) ?? []).length, 1);
});

test('NC-ALIAS-PIN-REMOVAL [wiring VER-01]: pin is RED while behaviour stays GREEN', () => {
  const cell = runNcAliasPinCell(deps);
  assert.equal(cell.status, 'GREEN');
  assert.equal(cell.baseStatus, 'GREEN');
  assert.equal(cell.mutatedStatus, 'RED');
  assert.deepEqual(cell.missingTokens, ['window.__TALARIA_DEGRADED_STATE__']);
  // This asymmetry is the justification for keeping any source pin at all.
  assert.equal(cell.behaviourUnchanged, true);
});

test('NC-COMMENT-DOES-NOT-SATISFY-PIN [wiring VER-01]: prose and literals cannot pay the pin', () => {
  const cell = runNcCommentDoesNotSatisfyPinCell(deps);
  assert.equal(cell.status, 'GREEN');
  assert.deepEqual(cell.decoysThatSatisfiedThePin, []);
});

const EXPECTED_MUTANT_KILLS = {
  M1: {
    name: 'NC-MUTANT-CAP-ZERO',
    killedBy: ['PASSPORT-DEGRADED-ROUND-TRIP', 'PASSPORT-DEGRADED-BOUNDING-PROPERTIES'],
  },
  M2: {
    name: 'NC-MUTANT-DECOY-REGEX',
    killedBy: ['PASSPORT-DEGRADED-BOUNDING-PROPERTIES'],
  },
  M3: {
    name: 'NC-MUTANT-POST-ASSIGNMENT-CLEAR',
    killedBy: ['PASSPORT-DEGRADED-ROUND-TRIP', 'PASSPORT-DEGRADED-BOUNDING-PROPERTIES'],
  },
  M4: {
    name: 'NC-MUTANT-DEDUPE-DROP',
    killedBy: ['PASSPORT-DEGRADED-BOUNDING-PROPERTIES'],
  },
  M5: {
    name: 'NC-MUTANT-ARRAY-STRING-COERCION',
    killedBy: [
      'PASSPORT-DEGRADED-KEY-ALWAYS',
      'PASSPORT-DEGRADED-ROUND-TRIP',
      'PASSPORT-DEGRADED-BOUNDING-PROPERTIES',
    ],
  },
};

test('behavioural mutants M1-M5 are each applied and each killed by a named cell', () => {
  const cells = runBehavioralMutantCells(deps);
  assert.equal(cells.length, 5);
  for (const cell of cells) {
    const expected = EXPECTED_MUTANT_KILLS[cell.mutant];
    assert.ok(expected, `unexpected mutant ${cell.mutant}`);
    assert.equal(cell.cell, expected.name);
    assert.equal(cell.status, 'GREEN', `${cell.mutant} survived: ${JSON.stringify(cell)}`);
    assert.deepEqual(cell.killedBy, expected.killedBy);
  }
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
  assert.equal(cells.length, 5);
  for (const cell of cells) {
    assert.equal(cell.status, 'RED');
    assert.match(cell.reason, /did not apply/);
  }
});

test('unmutated source passes every behavioural cell', () => {
  const cells = runBehavioralCells(deps);
  assert.equal(cells.length, 3);
  assert.ok(cells.every((c) => c.pass === true), JSON.stringify(cells, null, 2));
});

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
  assert.ok(report.cells.filter((c) => typeof c.pass === 'boolean').length >= 11);
});

test('gate refuses GREEN when no TypeScript compiler is available', () => {
  const report = runSupportPassportDegradedGate({ ...deps, typescript: null });
  assert.equal(report.status, 'RED');
  assert.equal(report.cells[0].cell, 'SUPPORT-PASSPORT-REALM-BOOT');
});
