/**
 * Crosshair axis badges must resolve to the wrapper DIV, not drawing SVG
 * `<g class="price-label">` that appears earlier under `#drawingSvg`.
 *
 *   node --test "chart v 1.4/chart/modules/crosshair-badge-selector.test.mjs"
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Minimal DOM stand-in matching V9 #chartWrapper child order. */
function makeWrapperDom() {
    const children = [];
    const container = {
        children,
        querySelector(sel) {
            if (sel === ':scope > .price-label') {
                return children.find((c) => c.classList.contains('price-label')) || null;
            }
            if (sel === ':scope > .time-label') {
                return children.find((c) => c.classList.contains('time-label')) || null;
            }
            if (sel === '.price-label') {
                // Depth-first: SVG group wins (the bug)
                return { tag: 'g', classList: { contains: (n) => n === 'price-label' }, isSvg: true };
            }
            if (sel === '.time-label') {
                return children.find((c) => c.classList.contains('time-label')) || null;
            }
            return null;
        },
    };
    const svg = {
        tag: 'svg',
        id: 'drawingSvg',
        classList: { contains: () => false },
        // Nested SVG price-label group (not a direct child of wrapper)
    };
    const priceDiv = {
        tag: 'div',
        classList: { contains: (n) => n === 'price-label' },
        isSvg: false,
        style: { display: 'none' },
    };
    const timeDiv = {
        tag: 'div',
        classList: { contains: (n) => n === 'time-label' },
        isSvg: false,
        style: { display: 'none' },
    };
    children.push({ tag: 'canvas', classList: { contains: () => false } });
    children.push(svg);
    children.push(priceDiv);
    children.push(timeDiv);
    return { container, priceDiv, timeDiv };
}

function queryChartOverlayBadge(container, className) {
    try {
        const scoped = container.querySelector(`:scope > .${className}`);
        if (scoped) return scoped;
    } catch (_e) { /* ignore */ }
    const kids = container.children;
    for (let i = 0; i < kids.length; i++) {
        const el = kids[i];
        if (el && el.classList && el.classList.contains(className)) return el;
    }
    return null;
}

test('scoped badge lookup prefers wrapper div over SVG .price-label', () => {
    const { container, priceDiv, timeDiv } = makeWrapperDom();
    assert.equal(container.querySelector('.price-label').isSvg, true,
        'bare querySelector still hits SVG (documents the collision)');
    assert.equal(queryChartOverlayBadge(container, 'price-label'), priceDiv);
    assert.equal(queryChartOverlayBadge(container, 'time-label'), timeDiv);
});

test('chart.js ships the scoped overlay helper', () => {
    const src = readFileSync(join(__dirname, '../chart.js'), 'utf8');
    assert.match(src, /_queryChartOverlayBadge\s*\(/);
    assert.match(src, /_getCrosshairOverlayElements\s*\(/);
    assert.match(src, /:scope > \.\$\{className\}|:scope > \.price-label/);
});
