/**
 * SCREENSHOT-BRAND-PRELOAD-CUT-V1 — gate.
 *
 * The defect: ScreenshotManager's constructor called init(), which called
 * getBrandLogoImage(), which fetched modules/logo-05.png at 3684x2234 — 31.4 MB decoded
 * — on every chart page load. Nothing consumed the result. The screenshot paths build
 * their own images through resolveAssetUrl(), and getVisibleLogoBounds() takes its image
 * as a parameter, so the memo had no reader. It was roughly a third of the measured
 * 63,075K image cache, on the critical path of every load.
 *
 * This gate loads the real shipped file into a vm context with an instrumented Image
 * constructor, so it exercises the actual chain (module load -> constructor -> init)
 * rather than a re-implementation of it.
 *
 * Run: node --test "chart v 1.4/chart/modules/screenshot-brand-preload-cut.test.mjs"
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CANONICAL = path.join(HERE, 'screenshot-manager.js');
const MIRROR = path.resolve(HERE, '../../../homepage/public/chart/modules/screenshot-manager.js');

const FLAG = '__TALARIA_DISABLE_SCREENSHOT_BRAND_PRELOAD_CUT_V1';

/**
 * Build a DOM-ish sandbox and evaluate `source` in it.
 *
 * @param {object} opts
 * @param {string} [opts.source] product source to run (defaults to the shipped file)
 * @param {'none'|'self'|'parent'|'top'} [opts.flagOn] which realm carries the kill-switch
 */
function loadInSandbox({ source, flagOn = 'none' } = {}) {
    const imageLoads = [];

    class FakeImage {
        constructor() {
            this.decoding = '';
            this.complete = false;
            this.naturalWidth = 0;
            this._src = '';
        }
        set src(value) {
            this._src = value;
            imageLoads.push(value);
            // Never fire onload/onerror: a real network fetch has not resolved by the
            // time init() returns either, and the assertion is about the request.
        }
        get src() {
            return this._src;
        }
    }

    const element = () => ({
        style: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        setAttribute() {},
        getAttribute: () => null,
        appendChild() {},
        append() {},
        remove() {},
        addEventListener() {},
        removeEventListener() {},
        getContext: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        insertAdjacentHTML() {},
        set innerHTML(_v) {},
        get innerHTML() { return ''; }
    });

    const documentStub = {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: element,
        addEventListener() {},
        removeEventListener() {},
        body: element(),
        head: element(),
        fonts: { load: () => Promise.resolve([]), ready: Promise.resolve() },
        baseURI: 'https://canary.example/chart/dist-v9/'
    };

    const location = {
        href: 'https://canary.example/chart/dist-v9/index.html',
        origin: 'https://canary.example',
        pathname: '/chart/dist-v9/index.html'
    };

    const parentWin = { [FLAG]: flagOn === 'parent' ? true : undefined };
    const topWin = { [FLAG]: flagOn === 'top' ? true : undefined };

    const windowStub = {
        location,
        document: documentStub,
        chart: { /* present so initScreenshotManager() constructs immediately */ },
        addEventListener() {},
        removeEventListener() {},
        isSecureContext: true,
        devicePixelRatio: 2,
        Image: FakeImage,
        URL,
        setTimeout,
        clearTimeout,
        navigator: { clipboard: null, userAgent: 'node-gate' }
    };
    windowStub.self = windowStub;
    windowStub.parent = flagOn === 'parent' ? parentWin : windowStub;
    windowStub.top = flagOn === 'top' ? topWin : windowStub.parent;
    if (flagOn === 'self') windowStub[FLAG] = true;

    const sandbox = {
        window: windowStub,
        document: documentStub,
        location,
        Image: FakeImage,
        URL,
        navigator: windowStub.navigator,
        setTimeout,
        clearTimeout,
        Promise,
        console: { log() {}, warn() {}, error() {}, info() {} }
    };
    sandbox.globalThis = sandbox;

    const context = vm.createContext(sandbox);
    vm.runInContext(source ?? fs.readFileSync(CANONICAL, 'utf8'), context, {
        filename: 'screenshot-manager.js'
    });

    return { imageLoads, sandbox, manager: windowStub.screenshotManager };
}

const brandLoads = (loads) => loads.filter((u) => /logo-0\d|logo-1\d/i.test(u));

/* ── the cut ──────────────────────────────────────────────────────────────── */

test('CELL 1 — by default, page load requests no brand logo at all', () => {
    const { imageLoads } = loadInSandbox();
    assert.deepEqual(
        brandLoads(imageLoads),
        [],
        `expected zero brand image requests on load, saw: ${imageLoads.join(', ')}`
    );
});

test('CELL 2 — the manager still constructs and is published', () => {
    const { manager } = loadInSandbox();
    assert.ok(manager, 'window.screenshotManager should still be created');
    assert.equal(typeof manager.getBrandLogoImage, 'function',
        'getBrandLogoImage must survive the cut so a future caller can still use it');
});

test('CELL 3 — an explicit call still loads the brand (the method is not broken)', () => {
    const { imageLoads, manager } = loadInSandbox();
    manager.getBrandLogoImage();
    assert.deepEqual(
        brandLoads(imageLoads).map((u) => u.replace(/^https:\/\/canary\.example/, '')),
        ['/chart/modules/logo-05.png'],
        'calling it directly should still request the first candidate'
    );
});

/* ── FLAG-02: the negative control must really restore the old behaviour ──── */

for (const realm of ['self', 'parent', 'top']) {
    test(`CELL 4.${realm} — kill-switch set on ${realm} restores the eager preload`, () => {
        const { imageLoads } = loadInSandbox({ flagOn: realm });
        assert.deepEqual(
            brandLoads(imageLoads).map((u) => u.replace(/^https:\/\/canary\.example/, '')),
            ['/chart/modules/logo-05.png'],
            `flag on ${realm} must reinstate the preload, or the negative control is inert`
        );
    });
}

/* ── mutants: prove the cells above are load-bearing ──────────────────────── */

test('CELL 5 — MUTANT: unconditional preload (the pre-cut code) fails CELL 1', () => {
    const mutant = fs.readFileSync(CANONICAL, 'utf8').replace(
        /if \(_talariaScreenshotFlagTruthy\('__TALARIA_DISABLE_SCREENSHOT_BRAND_PRELOAD_CUT_V1'\)\) \{\s*this\.getBrandLogoImage\(\);\s*\}/,
        'this.getBrandLogoImage();'
    );
    assert.notEqual(mutant, fs.readFileSync(CANONICAL, 'utf8'), 'mutation must apply');
    const { imageLoads } = loadInSandbox({ source: mutant });
    assert.equal(brandLoads(imageLoads).length, 1,
        'the pre-cut code preloads, which is exactly what CELL 1 forbids');
});

test('CELL 6 — MUTANT: own-realm-only flag read fails the parent/top cells', () => {
    const mutant = fs.readFileSync(CANONICAL, 'utf8').replace(
        /if \(_talariaScreenshotFlagTruthy\('__TALARIA_DISABLE_SCREENSHOT_BRAND_PRELOAD_CUT_V1'\)\) \{/,
        `if (!!window['${FLAG}']) {`
    );
    assert.notEqual(mutant, fs.readFileSync(CANONICAL, 'utf8'), 'mutation must apply');
    const { imageLoads } = loadInSandbox({ source: mutant, flagOn: 'parent' });
    assert.equal(brandLoads(imageLoads).length, 0,
        'a host-only read cannot see the parent flag — this is the B-0185 defect and the ' +
        'realm climb is what CELL 4.parent proves');
});

/* ── wiring ───────────────────────────────────────────────────────────────── */

test('CELL 7 — mirror is byte-identical to the canonical module', () => {
    assert.ok(fs.existsSync(MIRROR), `mirror missing at ${MIRROR}`);
    assert.equal(
        fs.readFileSync(MIRROR).toString('base64'),
        fs.readFileSync(CANONICAL).toString('base64'),
        'homepage/public mirror has drifted from chart v 1.4 — the served copy is the mirror'
    );
});

test('CELL 8 — the guard and its comment are present in the shipped file', () => {
    const src = fs.readFileSync(CANONICAL, 'utf8');
    assert.match(src, /_talariaScreenshotFlagTruthy\(/, 'realm-climbing helper must exist');
    assert.match(src, new RegExp(FLAG), 'kill-switch name must appear');
    assert.equal(
        (src.match(/this\.getBrandLogoImage\(\)/g) || []).length,
        1,
        'exactly one call site (inside the guard) is expected'
    );
});

/* ── the asset half of the same packet ────────────────────────────────────── */

const LOADER_BRAND_COPIES = [
    path.join(HERE, 'logo-04.png'),
    path.resolve(HERE, '../../../homepage/public/chart/modules/logo-04.png'),
    path.resolve(HERE, '../../../homepage/public/logo-04.png')
];

/** IHDR carries width/height as big-endian u32 at byte 16 and 20. */
function pngDimensions(file) {
    const buf = fs.readFileSync(file);
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

test('CELL 9 — the loader brand is not shipped above 1024px on any edge', () => {
    // .loader-brand renders at 440 CSS px. 1024 covers 2x device pixel ratio with room
    // spare; the original 2391x2234 was 5.4x the displayed size and cost 20.4 MB decoded.
    for (const file of LOADER_BRAND_COPIES) {
        assert.ok(fs.existsSync(file), `missing ${file}`);
        const { width, height } = pngDimensions(file);
        assert.ok(
            Math.max(width, height) <= 1024,
            `${path.basename(path.dirname(file))}/logo-04.png is ${width}x${height}; ` +
            `decoded that is ${((width * height * 4) / 1048576).toFixed(1)} MB`
        );
    }
});

test('CELL 10 — every loader-brand copy is byte-identical', () => {
    const hashes = LOADER_BRAND_COPIES.map((f) => fs.readFileSync(f).toString('base64'));
    assert.equal(new Set(hashes).size, 1,
        'logo-04.png copies have diverged; the chart and the homepage would ship different art');
});
