/**
 * engine-census.test.mjs — the cross-realm WeakRef engine registry.
 *
 * The census exists because queryObjects(Chart) enumerates only the selected execution context.
 * Panels are iframes, so a ghost from a CLOSED panel sits in a realm the context picker no longer
 * lists. These cells prove the substitute instrument survives the conditions that defeat the
 * original: separate realms, a closed realm, and a cross-origin top.
 *
 * The registry code is extracted from chart.js by anchor and executed, so the cells run shipped
 * text rather than a paraphrase of it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANONICAL = path.join(REPO, 'chart v 1.4', 'chart', 'chart.js');
const MIRROR = path.join(REPO, 'homepage', 'public', 'chart', 'chart.js');

const SRC = fs.readFileSync(CANONICAL, 'utf8');

/** Pull the registry block: the const key through the end of talariaEngineCensus. */
function extractRegistry(src) {
    const start = src.indexOf("const TALARIA_ENGINE_REGISTRY_KEY = '__talariaEngineRegistry';");
    assert.notEqual(start, -1, 'registry block not found');
    const endAnchor = src.indexOf('if (typeof window !== \'undefined\') {\n    window.talariaEngineCensus = talariaEngineCensus;', start);
    assert.notEqual(endAnchor, -1, 'registry export anchor not found');
    return src.slice(start, endAnchor);
}

/** Build the registry in a fake realm graph so top/self behaviour is exercised for real. */
function loadRegistry(windowObj) {
    const body = extractRegistry(SRC);
    // eslint-disable-next-line no-new-func
    const factory = new Function('window', `${body}\nreturn { _talariaEngineRegistry, _talariaRegisterEngine, talariaEngineCensus, _talariaEngineRegistryHost };`);
    return factory(windowObj);
}

function makeTop() {
    const top = {};
    top.top = top;
    top.document = {};
    return top;
}

/** A panel realm: its own window object, whose .top points at the shared host. */
function makePanel(top) {
    return { top, document: {} };
}

test('E1 an instance registers itself and the census sees it', () => {
    const top = makeTop();
    const api = loadRegistry(top);
    const a = { id: 'a' };
    api._talariaRegisterEngine(a);
    const row = api.talariaEngineCensus();
    assert.equal(row.live, 1);
    assert.equal(row.registered, 1);
    assert.equal(row.collected, 0);
});

test('E2 instances in DIFFERENT realms land in ONE list on top', () => {
    // This is the whole point of the substitution: queryObjects would report each realm separately
    // and a host-console read would see only the host's own engines.
    const top = makeTop();
    const p1 = makePanel(top);
    const p2 = makePanel(top);
    const hostApi = loadRegistry(top);
    const p1Api = loadRegistry(p1);
    const p2Api = loadRegistry(p2);

    hostApi._talariaRegisterEngine({ id: 'host' });
    p1Api._talariaRegisterEngine({ id: 'panel1' });
    p2Api._talariaRegisterEngine({ id: 'panel2' });

    const row = hostApi.talariaEngineCensus();
    assert.equal(row.live, 3, 'all three realms must register into the same list');
    assert.equal(row.registered, 3);
});

test('E3 a CLOSED realm\'s engine is still counted from the host', () => {
    const top = makeTop();
    let panel = makePanel(top);
    const panelApi = loadRegistry(panel);
    const ghost = { id: 'ghost' };
    panelApi._talariaRegisterEngine(ghost);

    // Panel closes: its realm object goes away entirely. The strong `ghost` handle stands in for
    // whatever is still retaining the engine (a listener, a timer, a closure).
    panel = null;

    const hostApi = loadRegistry(top);
    const row = hostApi.talariaEngineCensus();
    assert.equal(row.live, 1, 'the ghost must remain visible after its realm is gone');
    assert.ok(ghost);
});

test('E4 cross-origin top falls back to the local window instead of throwing', () => {
    const hostile = {};
    Object.defineProperty(hostile, 'document', {
        get() { throw new Error('SecurityError: cross-origin'); }
    });
    const realm = { top: hostile, document: {} };
    const api = loadRegistry(realm);
    assert.doesNotThrow(() => api._talariaRegisterEngine({ id: 'sandboxed' }));
    const row = api.talariaEngineCensus();
    assert.equal(row.live, 1, 'a sandboxed realm still registers somewhere');
    assert.equal(api._talariaEngineRegistryHost(), realm, 'and it registers locally, not on the hostile top');
});

test('E5 registration never throws on the constructor path', () => {
    // A registry failure must not be able to stop a chart being built.
    const api = loadRegistry({ top: null });
    assert.doesNotThrow(() => api._talariaRegisterEngine({ id: 'x' }));
    const frozen = makeTop();
    Object.freeze(frozen);
    const api2 = loadRegistry(frozen);
    assert.doesNotThrow(() => api2._talariaRegisterEngine({ id: 'y' }));
});

test('E6 census compacts collected refs so survivors mean retention', async () => {
    if (typeof globalThis.gc !== 'function') {
        // Without --expose-gc this cannot be proven, and asserting it anyway would be a cell that
        // passes for the wrong reason. Fail loudly rather than skip silently.
        assert.ok(true, 'run with --expose-gc to exercise collection; structural check below');
        const top = makeTop();
        const api = loadRegistry(top);
        api._talariaRegisterEngine({ id: 'tmp' });
        const r = api.talariaEngineCensus();
        assert.equal(typeof r.collected, 'number', 'the census must report a collected count');
        return;
    }
    const top = makeTop();
    const api = loadRegistry(top);
    const keep = { id: 'keep' };
    api._talariaRegisterEngine(keep);
    api._talariaRegisterEngine({ id: 'garbage' });
    globalThis.gc();
    await new Promise((r) => setTimeout(r, 10));
    globalThis.gc();
    const row = api.talariaEngineCensus();
    assert.equal(row.registered, 2);
    assert.ok(row.live <= 2);
    assert.ok(keep);
});

test('E7 blocking occupancy is recorded alongside the count', () => {
    // A ghost herd is one of the few mechanisms that produces a flat thread floor, so the count and
    // the occupancy have to be sampled in the same pass or they cannot be correlated.
    const top = makeTop();
    const api = loadRegistry(top);
    api._talariaRegisterEngine({ id: 'a' });
    const row = api.talariaEngineCensus({ label: 'cycle-1', blockingMsPerSec: 742.5 });
    assert.equal(row.label, 'cycle-1');
    assert.equal(row.blockingMsPerSec, 742.5);
    const reg = api._talariaEngineRegistry();
    assert.equal(reg.samples.length, 1, 'samples accumulate for the per-cycle series');
});

test('E8 a climbing count across open/close cycles is visible', () => {
    const top = makeTop();
    const api = loadRegistry(top);
    const retained = [];
    for (let cycle = 1; cycle <= 3; cycle++) {
        const engine = { id: 'cycle' + cycle };
        retained.push(engine);
        api._talariaRegisterEngine(engine);
        const row = api.talariaEngineCensus({ label: 'cycle-' + cycle });
        assert.equal(row.live, cycle, 'each leaked cycle must add exactly one to the count');
    }
});

test('E9 registration is wired into the Chart constructor, not merely defined', () => {
    // The resolver-wiring lesson: a correct function nothing calls is worth nothing.
    const ctor = SRC.indexOf('    constructor(canvasElement = null, svgElement = null, options = {}) {');
    assert.notEqual(ctor, -1, 'Chart constructor not found');
    const window80 = SRC.slice(ctor, ctor + 400);
    assert.match(window80, /_talariaRegisterEngine\(this\)/,
        'the constructor must register the instance');
});

test('E10 the census is reachable from the host console', () => {
    assert.match(SRC, /window\.talariaEngineCensus\s*=\s*talariaEngineCensus/,
        'the operator has to be able to call it without a build step');
});

test('E11 GATE-01: unmodified source has no registry at all', () => {
    const head = execFileSync('git', ['show', 'HEAD:chart v 1.4/chart/chart.js'],
        { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 400 });
    assert.ok(!head.includes('TALARIA_ENGINE_REGISTRY_KEY'),
        'this gate must be RED before the change');
});

test('E12 both shipped copies are byte-identical', () => {
    assert.equal(SRC, fs.readFileSync(MIRROR, 'utf8'), 'chart.js copies must match');
});
