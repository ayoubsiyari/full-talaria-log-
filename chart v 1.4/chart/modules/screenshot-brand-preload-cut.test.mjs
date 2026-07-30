/**
 * SCREENSHOT-BRAND-PRELOAD-CUT-V1 — gate.
 *
 * The defect: ScreenshotManager's constructor called init(), which called
 * getBrandLogoImage(), which fetched modules/logo-05.png at 3684x2234 — 31.4 MB of
 * decoded image bytes — on every chart page load and kept it on the instance for the
 * whole session. Nothing consumed it. The export paths set `src` on cloned <img>
 * elements through resolveAssetUrl(), and getVisibleLogoBounds(image) takes its image as
 * a parameter, so the cache had no reader.
 *
 * b110 stopped calling it behind a kill-switch. b111 removes the method and the
 * session-long fields outright, because the export never needed a resident copy: there
 * was no cache to make smarter, only a cache to delete. What replaces it,
 * loadBrandLogoForExport(), loads on demand and keeps no reference after it settles.
 *
 * The kill-switch is therefore retired: with the code path gone there is no behaviour to
 * toggle. Rollback for this one is the pinned b110 image, not a flag flip, and that is
 * recorded in GATE-NAME-RESERVATIONS.md rather than left as flag theatre.
 *
 * This gate loads the real shipped file in a vm with an instrumented Image, so it
 * exercises the actual module-load-to-constructor chain rather than a re-implementation.
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

function loadInSandbox({ source } = {}) {
    const imageLoads = [];
    const liveImages = [];

    class FakeImage {
        constructor() {
            this.decoding = '';
            this.complete = false;
            this.naturalWidth = 0;
            this._src = '';
            liveImages.push(this);
        }
        set src(value) {
            this._src = value;
            imageLoads.push(value);
        }
        get src() {
            return this._src;
        }
        /** Drive the load the way the browser would, so settle paths are exercised. */
        fireLoad() {
            this.complete = true;
            this.naturalWidth = 600;
            if (typeof this.onload === 'function') this.onload();
        }
        fireError() {
            if (typeof this.onerror === 'function') this.onerror();
        }
    }

    const element = () => ({
        style: { setProperty() {} },
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        setAttribute() {}, getAttribute: () => null,
        appendChild() {}, append() {}, remove() {},
        addEventListener() {}, removeEventListener() {},
        getContext: () => null,
        querySelector: () => null, querySelectorAll: () => [],
        insertAdjacentHTML() {},
        set innerHTML(_v) {}, get innerHTML() { return ''; }
    });

    const documentStub = {
        getElementById: () => null,
        querySelector: () => null, querySelectorAll: () => [],
        createElement: element,
        addEventListener() {}, removeEventListener() {},
        body: element(), head: element(),
        fonts: { load: () => Promise.resolve([]), ready: Promise.resolve() },
        baseURI: 'https://canary.example/chart/dist-v9/'
    };

    const location = {
        href: 'https://canary.example/chart/dist-v9/index.html',
        origin: 'https://canary.example',
        pathname: '/chart/dist-v9/index.html'
    };

    const windowStub = {
        location, document: documentStub, chart: {},
        addEventListener() {}, removeEventListener() {},
        isSecureContext: true, devicePixelRatio: 2,
        Image: FakeImage, URL, setTimeout, clearTimeout,
        navigator: { clipboard: null, userAgent: 'node-gate' }
    };
    windowStub.self = windowStub;
    windowStub.parent = windowStub;
    windowStub.top = windowStub;

    const sandbox = {
        window: windowStub, document: documentStub, location,
        Image: FakeImage, URL, navigator: windowStub.navigator,
        setTimeout, clearTimeout, Promise,
        console: { log() {}, warn() {}, error() {}, info() {} }
    };
    sandbox.globalThis = sandbox;

    const context = vm.createContext(sandbox);
    vm.runInContext(source ?? fs.readFileSync(CANONICAL, 'utf8'), context, {
        filename: 'screenshot-manager.js'
    });

    return { imageLoads, liveImages, manager: windowStub.screenshotManager };
}

const brandLoads = (loads) => loads.filter((u) => /logo-\d+\.png/i.test(u));
const readSource = () => fs.readFileSync(CANONICAL, 'utf8');

/* ── the cut ──────────────────────────────────────────────────────────────── */

test('CELL 1 — page load requests no brand logo at all', () => {
    const { imageLoads } = loadInSandbox();
    assert.deepEqual(brandLoads(imageLoads), [],
        `expected zero brand image requests on load, saw: ${imageLoads.join(', ')}`);
});

test('CELL 2 — the manager still constructs and is published', () => {
    const { manager } = loadInSandbox();
    assert.ok(manager, 'window.screenshotManager should still be created');
    assert.equal(typeof manager.loadBrandLogoForExport, 'function',
        'exports need an on-demand loader');
});

test('CELL 3 — the on-demand loader fetches only when called', async () => {
    const { imageLoads, liveImages, manager } = loadInSandbox();
    assert.equal(brandLoads(imageLoads).length, 0, 'nothing before the call');

    const pending = manager.loadBrandLogoForExport();
    assert.deepEqual(
        brandLoads(imageLoads).map((u) => u.replace(/^https:\/\/canary\.example/, '')),
        ['/chart/modules/logo-05.png'],
        'the call should request exactly one asset'
    );
    liveImages[liveImages.length - 1].fireLoad();
    const image = await pending;
    assert.ok(image, 'a loaded image should resolve');
});

test('CELL 4 — nothing is retained on the instance after the export settles', async () => {
    const { liveImages, manager } = loadInSandbox();
    const pending = manager.loadBrandLogoForExport();
    liveImages[liveImages.length - 1].fireLoad();
    const image = await pending;

    const retained = Object.entries(manager).filter(([, v]) => v === image);
    assert.deepEqual(retained.map(([k]) => k), [],
        'the manager must not hold the export image for the session');
    assert.equal(manager._brandLogoImage, undefined,
        'the session-long brand field must be gone, not merely unset');
    assert.equal(image.onload, null, 'handlers should be dropped on settle');
    assert.equal(image.onerror, null, 'handlers should be dropped on settle');
});

test('CELL 5 — a failed load resolves null instead of hanging', async () => {
    const { liveImages, manager } = loadInSandbox();
    const pending = manager.loadBrandLogoForExport();
    liveImages[liveImages.length - 1].fireError();
    assert.equal(await pending, null, 'an export must not wait forever on a missing asset');
});

/* ── mutants: prove the cells above are load-bearing ──────────────────────── */

test('CELL 6 — MUTANT: reinstating the init preload fails CELL 1', () => {
    const mutant = readSource().replace(
        /        this\.initDropdown\(\);/,
        '        this.loadBrandLogoForExport();\n        this.initDropdown();'
    );
    assert.notEqual(mutant, readSource(), 'mutation must apply');
    const { imageLoads } = loadInSandbox({ source: mutant });
    assert.equal(brandLoads(imageLoads).length, 1,
        'a preload in init is exactly what CELL 1 forbids');
});

test('CELL 7 — MUTANT: reinstating the session cache fails CELL 4', async () => {
    const mutant = readSource().replace(
        /                image\.__talariaSource = relativePath;/,
        '                image.__talariaSource = relativePath;\n                this._brandLogoImage = image;'
    );
    assert.notEqual(mutant, readSource(), 'mutation must apply');
    const { liveImages, manager } = loadInSandbox({ source: mutant });
    const pending = manager.loadBrandLogoForExport();
    liveImages[liveImages.length - 1].fireLoad();
    const image = await pending;
    assert.equal(manager._brandLogoImage, image,
        'the mutant does retain the image, which is the state CELL 4 rejects');
});

/* ── wiring ───────────────────────────────────────────────────────────────── */

test('CELL 8 — the dead cache is gone from the shipped code', () => {
    // Comments are stripped first: the file deliberately keeps a note about what used to
    // be here, and a history note is not a code path.
    const code = readSource()
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    for (const symbol of ['getBrandLogoImage', '_brandLogoLoadPromise', '_brandLogoImage']) {
        assert.equal(
            code.includes(symbol), false,
            `${symbol} should no longer exist in the shipped module; found it in code, not a comment`
        );
    }
});

test('CELL 9 — mirror is byte-identical to the canonical module', () => {
    assert.ok(fs.existsSync(MIRROR), `mirror missing at ${MIRROR}`);
    assert.equal(
        fs.readFileSync(MIRROR).toString('base64'),
        fs.readFileSync(CANONICAL).toString('base64'),
        'homepage/public mirror has drifted — the served copy is the mirror'
    );
});

/* ── the loader brand, which is the only eager image left ──────────────────── */

const SHELLS = [
    path.resolve(HERE, '../dist-v9/index.html'),
    path.resolve(HERE, '../../talaria-design/live/index.html'),
    path.resolve(HERE, '../../../homepage/public/chart/dist-v9/index.html')
];

test('CELL 10 — the loader brand declares intrinsic width and height', () => {
    // Without these the shell reflows when the brand decodes, on every cold load.
    for (const shell of SHELLS) {
        assert.ok(fs.existsSync(shell), `missing shell ${shell}`);
        const html = fs.readFileSync(shell, 'utf8');
        const tag = /<img[^>]*class="loader-brand"[^>]*>/.exec(html);
        assert.ok(tag, `no loader-brand <img> in ${path.basename(path.dirname(shell))}`);
        assert.match(tag[0], /width="880"/, `loader brand needs width in ${shell}`);
        assert.match(tag[0], /height="822"/, `loader brand needs height in ${shell}`);
    }
});

test('CELL 11 — the declared dimensions match the shipped file exactly', () => {
    // A declared size that disagrees with the bitmap is its own layout bug.
    const file = path.join(HERE, 'logo-04.png');
    const buf = fs.readFileSync(file);
    assert.equal(buf.readUInt32BE(16), 880, 'logo-04.png width');
    assert.equal(buf.readUInt32BE(20), 822, 'logo-04.png height');
});
