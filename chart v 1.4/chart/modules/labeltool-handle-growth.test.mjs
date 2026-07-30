/**
 * LabelTool resize-handle DOM growth (flag: __TALARIA_DISABLE_LABEL_HANDLE_WIPE_V1).
 *
 * Behavioural: loads the REAL BaseDrawing and the REAL LabelTool from source and renders
 * repeatedly against a minimal SVG/d3 shim, counting live DOM nodes. The growth only reproduces
 * because the real BaseDrawing._clearGeometryChildren deliberately preserves handle nodes, so the
 * real base class is used rather than a stub.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Minimal DOM + d3-selection shim
// ---------------------------------------------------------------------------

/** Parse a simple selector; throws on anything unsupported so the shim can never fake a match. */
function parseSelector(selector) {
    const s = String(selector).trim();
    if (s === '*') return { any: true };
    const m = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)((?:\[[\w-]+="[^"]*"\])*)$/.exec(s);
    if (!m) throw new Error(`shim: unsupported selector ${JSON.stringify(selector)}`);
    const attrs = [];
    const attrRe = /\[([\w-]+)="([^"]*)"\]/g;
    let a;
    while ((a = attrRe.exec(m[3] || ''))) attrs.push([a[1], a[2]]);
    return { tag: m[1] || null, classes: (m[2] || '').split('.').filter(Boolean), attrs };
}

class FakeNode {
    constructor(tagName) {
        this.tagName = String(tagName);
        this.attributes = new Map();
        this.styles = new Map();
        this.childNodes = [];
        this.parentNode = null;
        this.listeners = [];
        this.textValue = '';
    }

    setAttribute(name, value) { this.attributes.set(name, value == null ? null : String(value)); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    removeAttribute(name) { this.attributes.delete(name); }

    appendChild(child) {
        if (child.parentNode) child.parentNode.removeChild(child);
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
    }

    removeChild(child) {
        const i = this.childNodes.indexOf(child);
        if (i < 0) throw new Error('shim: removeChild on a non-child');
        this.childNodes.splice(i, 1);
        child.parentNode = null;
        return child;
    }

    addEventListener(type, fn, capture) { this.listeners.push({ type, fn, capture }); }
    removeEventListener(type, fn) {
        this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn));
    }

    getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10 }; }

    /** Pre-order descendants, matching d3's document order. */
    descendants(out = []) {
        this.childNodes.forEach((c) => { out.push(c); c.descendants(out); });
        return out;
    }

    matches(selector) {
        const q = parseSelector(selector);
        if (q.any) return true;
        if (q.tag && q.tag.toLowerCase() !== this.tagName.toLowerCase()) return false;
        const tokens = String(this.getAttribute('class') || '').split(/\s+/).filter(Boolean);
        if (!q.classes.every((c) => tokens.includes(c))) return false;
        return q.attrs.every(([k, v]) => this.getAttribute(k) === v);
    }
}

class Selection {
    constructor(nodes) { this._nodes = nodes; }

    empty() { return this._nodes.length === 0; }
    size() { return this._nodes.length; }
    node() { return this._nodes[0] || null; }
    nodes() { return this._nodes.slice(); }

    append(tagName) {
        return new Selection(this._nodes.map((n) => n.appendChild(new FakeNode(tagName))));
    }

    attr(name, value) {
        if (value === undefined) {
            const n = this.node();
            return n ? n.getAttribute(name) : null;
        }
        this._nodes.forEach((n) => (value === null ? n.removeAttribute(name) : n.setAttribute(name, value)));
        return this;
    }

    style(name, value) {
        if (value === undefined) {
            const n = this.node();
            return n ? (n.styles.has(name) ? n.styles.get(name) : null) : null;
        }
        this._nodes.forEach((n) => n.styles.set(name, String(value)));
        return this;
    }

    text(value) {
        if (value === undefined) return this.node() ? this.node().textValue : null;
        this._nodes.forEach((n) => { n.textValue = String(value); });
        return this;
    }

    select(selector) {
        const out = [];
        this._nodes.forEach((n) => {
            const found = n.descendants().find((d) => d.matches(selector));
            if (found) out.push(found);
        });
        return new Selection(out);
    }

    selectAll(selector) {
        const out = [];
        this._nodes.forEach((n) => n.descendants().forEach((d) => { if (d.matches(selector)) out.push(d); }));
        return new Selection(out);
    }

    remove() {
        this._nodes.forEach((n) => { if (n.parentNode) n.parentNode.removeChild(n); });
        return this;
    }

    /** d3.selection.raise: re-append each node as its parent's last child. */
    raise() {
        this._nodes.forEach((n) => { if (n.parentNode) n.parentNode.appendChild(n); });
        return this;
    }

    on() { return this; }
    each(fn) { this._nodes.forEach((n, i) => fn.call(n, undefined, i)); return this; }
    filter(fn) { return new Selection(this._nodes.filter((n, i) => fn.call(n, undefined, i))); }
}

// ---------------------------------------------------------------------------
// Load the real modules under test
// ---------------------------------------------------------------------------

global.window = {};
global.document = { addEventListener() {}, removeEventListener() {} };
global.d3 = { select: (node) => new Selection([node]) };

const base = require('./drawing-tools-base.js');
global.BaseDrawing = base.BaseDrawing;
const { LabelTool } = require('./drawing-tools-shapes.js');

assert.equal(typeof LabelTool, 'function', 'real LabelTool must load from source');
assert.ok(new LabelTool([{ x: 0, y: 0 }]) instanceof base.BaseDrawing,
    'LabelTool must extend the REAL BaseDrawing (handle preservation lives there)');

const SCALES = { xScale: (v) => v * 10, yScale: (v) => v * 2 };

function newLabel(overrides = {}) {
    const label = new LabelTool([{ x: 3, y: 5 }], {}, 'Hello');
    Object.assign(label, overrides);
    return label;
}

function newContainer() { return new Selection([new FakeNode('svg')]); }

/** Total live descendant nodes under the drawing group. */
function countNodes(label) {
    return label.group.node().descendants().length;
}

function handleGroups(label) {
    return label.group.selectAll('.resize-handle-group').nodes();
}

/** Render `times` times with reuseGroup (the replay/pan hot path) and sample node counts. */
function renderTimes(label, times, opts = { reuseGroup: true }) {
    const container = newContainer();
    const counts = [];
    for (let i = 0; i < times; i++) {
        label.render(container, SCALES, opts);
        counts.push(countNodes(label));
    }
    return counts;
}

function withFlag(value, fn) {
    const had = Object.prototype.hasOwnProperty.call(global.window, '__TALARIA_DISABLE_LABEL_HANDLE_WIPE_V1');
    const prev = global.window.__TALARIA_DISABLE_LABEL_HANDLE_WIPE_V1;
    global.window.__TALARIA_DISABLE_LABEL_HANDLE_WIPE_V1 = value;
    try { return fn(); } finally {
        if (had) global.window.__TALARIA_DISABLE_LABEL_HANDLE_WIPE_V1 = prev;
        else delete global.window.__TALARIA_DISABLE_LABEL_HANDLE_WIPE_V1;
    }
}

const N = 50;

// ---------------------------------------------------------------------------
// HEADLINE: node count is flat across many renders
// ---------------------------------------------------------------------------

test('HEADLINE: node count is flat across N reuse-renders (no per-render handle growth)', () => {
    const counts = renderTimes(newLabel(), N);
    const first = counts[0];
    const last = counts[counts.length - 1];
    console.log(`[measured] FIXED: after 1 render=${first} nodes, after ${N} renders=${last} nodes, delta=${last - first}`);
    assert.equal(last, first,
        `node count must be flat across ${N} renders; grew from ${first} to ${last}`);
    assert.deepEqual([...new Set(counts)], [first],
        'every render must land on the same node count');
});

test('HEADLINE control: legacy path (kill switch on) really does grow ~3 nodes per render', () => {
    const counts = withFlag(1, () => renderTimes(newLabel(), N));
    const first = counts[0];
    const last = counts[counts.length - 1];
    const perRender = (last - first) / (N - 1);
    console.log(`[measured] LEGACY: after 1 render=${first} nodes, after ${N} renders=${last} nodes, delta=${last - first} (${perRender}/render)`);
    assert.ok(last > first, 'positive control: legacy path must grow, else the harness proves nothing');
    assert.equal(perRender, 3, `legacy growth must be +3 nodes per render, saw ${perRender}`);
});

test('legacy path accumulates one orphaned handle group per render', () => {
    const label = newLabel();
    withFlag(1, () => renderTimes(label, N));
    assert.equal(handleGroups(label).length, N,
        'positive control: legacy path leaves one stranded .resize-handle-group per render');
});

// ---------------------------------------------------------------------------
// Kill switch semantics
// ---------------------------------------------------------------------------

for (const truthy of [1, 'yes', 'true', {}, [], -1, '0']) {
    test(`kill switch is TRUTHY not ===true: ${JSON.stringify(truthy)} restores legacy growth`, () => {
        const counts = withFlag(truthy, () => renderTimes(newLabel(), 10));
        assert.ok(counts[9] > counts[0],
            `flag=${JSON.stringify(truthy)} must restore growth (truthy semantics, not === true)`);
        assert.equal(LabelTool.isHandleWipeDisabled(), false, 'flag must be read per call, not cached');
    });
}

for (const falsy of [false, 0, '', null, undefined, NaN]) {
    test(`falsy flag ${String(falsy)} keeps the fix active`, () => {
        const counts = withFlag(falsy, () => renderTimes(newLabel(), 10));
        assert.equal(counts[9], counts[0], `flag=${String(falsy)} must not disable the fix`);
    });
}

test('kill switch is read per call and cannot throw', () => {
    const realWindow = global.window;
    try {
        global.window = undefined;
        assert.equal(LabelTool.isHandleWipeDisabled(), false, 'undefined window must not throw');
        global.window = Object.defineProperty({}, '__TALARIA_DISABLE_LABEL_HANDLE_WIPE_V1', {
            get() { throw new Error('hostile realm'); },
        });
        assert.equal(LabelTool.isHandleWipeDisabled(), false, 'throwing getter must be swallowed');
    } finally {
        global.window = realWindow;
    }

    // Per-call read: flipping the flag between renders must take effect immediately.
    const label = newLabel();
    const container = newContainer();
    label.render(container, SCALES, { reuseGroup: true });
    const flat = countNodes(label);
    label.render(container, SCALES, { reuseGroup: true });
    assert.equal(countNodes(label), flat, 'fix active while flag is unset');
    withFlag('yes', () => label.render(container, SCALES, { reuseGroup: true }));
    assert.ok(countNodes(label) > flat, 'flag flipped mid-session must take effect on the next render');
});

// ---------------------------------------------------------------------------
// _shouldCreateHandles guard
// ---------------------------------------------------------------------------

test('_shouldCreateHandles false (skipHandles) produces no handles', () => {
    const label = newLabel();
    const container = newContainer();
    label.render(container, SCALES, { reuseGroup: true, skipHandles: true });
    assert.equal(label._shouldCreateHandles({ skipHandles: true }), false, 'guard must report false');
    assert.equal(handleGroups(label).length, 0, 'skipHandles must produce zero handle groups');
});

test('_shouldCreateHandles false (locked) produces no handles, and re-enabling restores them', () => {
    const label = newLabel({ locked: true });
    const container = newContainer();
    renderTimes(label, 5);
    assert.equal(label._shouldCreateHandles({}), false, 'locked drawing must fail the guard');
    assert.equal(handleGroups(label).length, 0, 'locked label must render no handle group');

    label.locked = false;
    label.render(container, SCALES, { reuseGroup: true });
    assert.equal(handleGroups(label).length, 1, 'unlocking must bring the handle back');
});

test('guard is honoured: LabelTool consults _shouldCreateHandles like its siblings', () => {
    const label = newLabel();
    const seen = [];
    label._shouldCreateHandles = (opts) => { seen.push(opts); return true; };
    label.render(newContainer(), SCALES, { reuseGroup: true });
    assert.equal(seen.length, 1, 'render must call _shouldCreateHandles exactly once');
    assert.deepEqual(seen[0], { isPreview: false, reuseGroup: true, skipHandles: false },
        'guard must receive the normalised renderOpts');
});

// ---------------------------------------------------------------------------
// ANTI-CHEAT: handles must still EXIST and be usable after every render
// ---------------------------------------------------------------------------

test('ANTI-CHEAT: after N renders exactly one functional handle still exists', () => {
    const label = newLabel({ selected: true });
    renderTimes(label, N);

    const groups = handleGroups(label);
    assert.equal(groups.length, 1, 'exactly one handle group must survive (not zero — that is the cheat)');

    const group = label.group.select('.resize-handle-group');
    const handle = group.select('circle.resize-handle');
    const glow = group.select('circle.resize-handle-glow');
    assert.ok(!handle.empty(), 'the draggable .resize-handle circle must exist');
    assert.ok(!glow.empty(), 'the .resize-handle-glow circle must exist');

    // Geometry must match the rendered point, and the drag hit-test contract must hold.
    assert.equal(Number(handle.attr('cx')), SCALES.xScale(3), 'handle cx tracks the label point');
    assert.equal(Number(handle.attr('cy')), SCALES.yScale(5), 'handle cy tracks the label point');
    assert.equal(handle.attr('data-point-index'), '0', 'manager reads data-point-index to start a drag');
    assert.equal(handle.style('opacity'), '1', 'selected label must show its handle');
    assert.equal(Number(glow.attr('opacity')), 0.2, 'selected label must show the glow');
});

test('ANTI-CHEAT: handle stays the top-most child so it remains the pointer hit target', () => {
    const label = newLabel({ selected: true });
    for (let i = 1; i <= 5; i++) {
        renderTimes(label, 1);
        const kids = label.group.node().childNodes;
        assert.equal(kids[kids.length - 1].getAttribute('class'), 'resize-handle-group',
            `render ${i}: handle group must be the last child, otherwise the marker circle covers it`);
    }
});

test('handle geometry follows the label when the point moves', () => {
    const label = newLabel({ selected: true });
    const container = newContainer();
    label.render(container, SCALES, { reuseGroup: true });
    label.points[0] = { x: 8, y: 9 };
    label.render(container, SCALES, { reuseGroup: true });

    const handle = label.group.select('.resize-handle-group').select('circle.resize-handle');
    assert.equal(Number(handle.attr('cx')), SCALES.xScale(8), 'reused handle must be repositioned in x');
    assert.equal(Number(handle.attr('cy')), SCALES.yScale(9), 'reused handle must be repositioned in y');
    assert.equal(handleGroups(label).length, 1, 'repositioning must not add a second handle group');
});

// ---------------------------------------------------------------------------
// Node identity: a live drag / hover binding must not be stranded
// ---------------------------------------------------------------------------

test('handle DOM node identity survives renders so a live drag binding is not stranded', () => {
    const label = newLabel({ selected: true });
    const container = newContainer();
    label.render(container, SCALES, { reuseGroup: true });

    const handleNode = label.group.select('.resize-handle-group').select('circle.resize-handle').node();
    const groupNode = label.group.select('.resize-handle-group').node();
    let dragged = 0;
    handleNode.addEventListener('mousedown', () => { dragged += 1; }, true);

    for (let i = 0; i < N; i++) label.render(container, SCALES, { reuseGroup: true });

    assert.equal(label.group.select('.resize-handle-group').node(), groupNode,
        'handle group node must be the same object after renders');
    assert.equal(label.group.select('.resize-handle-group').select('circle.resize-handle').node(), handleNode,
        'handle circle node must be the same object after renders');
    assert.equal(handleNode.parentNode, groupNode, 'handle circle must still be attached');
    assert.equal(groupNode.parentNode, label.group.node(), 'handle group must still be in the drawing group');

    handleNode.listeners.filter((l) => l.type === 'mousedown').forEach((l) => l.fn());
    assert.equal(dragged, 1, 'the listener bound before the renders must still be on the live node');
});

test('legacy residue is collapsed once the fix takes over', () => {
    const label = newLabel();
    withFlag(1, () => renderTimes(label, 10));
    assert.equal(handleGroups(label).length, 10, 'precondition: legacy run left 10 handle groups');

    renderTimes(label, 1);
    assert.equal(handleGroups(label).length, 1,
        'first fixed render must collapse the stranded groups instead of leaving them forever');
});

// ---------------------------------------------------------------------------
// Non-reuse renders must be unaffected
// ---------------------------------------------------------------------------

test('fresh (non-reuse) render still produces exactly one handle group', () => {
    const label = newLabel({ selected: true });
    const container = newContainer();
    for (let i = 0; i < 5; i++) label.render(container, SCALES, { reuseGroup: false });
    assert.equal(handleGroups(label).length, 1, 'non-reuse render must yield one handle group');
    assert.equal(container.node().childNodes.length, 1, 'non-reuse render must not leak drawing groups');
});
