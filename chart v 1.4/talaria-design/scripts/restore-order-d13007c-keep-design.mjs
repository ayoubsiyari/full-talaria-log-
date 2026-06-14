#!/usr/bin/env node
/**
 * Restore order-manager.js logic from commit d13007c, keep visual design layer from current file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const rel = 'chart v 1.4/chart/modules/order-manager.js';
const basePath = path.join(root, rel);
const currentPath = path.join(root, rel.replace('order-manager.js', 'order-manager.current.js'));
const d13007cPath = path.join(root, rel.replace('order-manager.js', 'order-manager.d13007c.js'));
const outPath = basePath;

function sliceLines(text, start, end) {
  return text.split(/\r?\n/).slice(start - 1, end).join('\n');
}

function extractMethod(source, methodName) {
  const re = new RegExp(`\\n    ${methodName}\\([^)]*\\)\\s*\\{`, 'm');
  const m = re.exec(source);
  if (!m) return null;
  let i = m.index + 1;
  let depth = 0;
  let started = false;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '{') {
      depth++;
      started = true;
    } else if (ch === '}') {
      depth--;
      if (started && depth === 0) {
        return source.slice(m.index + 1, i + 1);
      }
    }
    i++;
  }
  return null;
}

function replaceMethod(source, methodName, newBody) {
  const old = extractMethod(source, methodName);
  if (!old || !newBody) {
    console.warn(`[skip] could not replace ${methodName}`);
    return source;
  }
  return source.replace(old, newBody);
}

function insertBeforeClosingBrace(source, insertBlock) {
  const exportIdx = source.indexOf('// Export for use in main chart');
  if (exportIdx === -1) throw new Error('export marker not found');
  const head = source.slice(0, exportIdx);
  const m = head.match(/\r?\n}\s*$/);
  if (!m) throw new Error('class closing brace not found');
  const idx = head.length - m[0].length;
  return source.slice(0, idx) + '\n' + insertBlock + source.slice(idx);
}

function removeMethod(source, methodName) {
  const body = extractMethod(source, methodName);
  if (!body) return source;
  return source.replace(body, '');
}

// --- main ---
const current = fs.readFileSync(currentPath, 'utf8');
let base = fs.readFileSync(d13007cPath, 'utf8');

console.log('[restore] base from d13007c, lines:', base.split(/\r?\n/).length);

// Design layer block (skip duplicate _ensureMarkerGlowFilter — keep d13007c version)
const designBlock = sliceLines(current, 33278, 33778);

// Remove old inline close/split button implementations from d13007c base
base = removeMethod(base, '_createCloseCircleButton');
base = removeMethod(base, '_createSplitPlusButton');

// --- design wiring on d13007c order draw paths (visual only) ---
const facades = sliceLines(current, 40254, 40269);
base = insertBeforeClosingBrace(base, designBlock + '\n' + facades);

// Swap preview label rendering to current (toast + circle badges)
for (const name of [
  'renderPreviewLabel',
  '_appendPreviewMultiModesActivatorButton',
  '_applyPreviewActivator',
]) {
  const body = extractMethod(current, name);
  if (body) base = replaceMethod(base, name, body);
}

// --- design wiring on d13007c order draw paths (visual only) ---
const patches = [
  // pending entry line: dashed active style + toast chrome on label
  [
    `.attr('stroke-dasharray', null)
            .attr('opacity', 0.85)
            .style('pointer-events', 'all')
            .style('cursor', 'ns-resize');`,
    `.style('pointer-events', 'none');
        this._applyOrderLevelLineStyle(line, false);`,
  ],
  [
    `        const labelBox = chart.svg.append('rect')
            .attr('class', \`pending-order-label-box pending-\${pendingOrder.id}\`)
            .attr('fill', lineColor)
            .attr('stroke', lineColor)
            .attr('stroke-width', 1)
            .attr('rx', 3)
            .style('pointer-events', 'all')
            .style('cursor', 'ns-resize');
        
        // Label text showing order type and direction (white text on colored background)
        const orderTypeLabel = pendingOrder.orderType === 'limit' ? 'LIMIT' : 'STOP';
        const directionLabel = pendingOrder.direction; // BUY or SELL
        const labelText = chart.svg.append('text')
            .attr('class', \`pending-order-label-text pending-\${pendingOrder.id}\`)
            .attr('fill', '#ffffff')
            .attr('font-size', '11px')
            .attr('font-weight', '700')
            .attr('font-family', "'Trebuchet MS', 'Roboto Condensed', sans-serif")
            .attr('letter-spacing', '0')
            .style('cursor', 'pointer')
            .text(\`\${orderTypeLabel} \${directionLabel} \${this.formatQuantity(pendingOrder.quantity || 0)}\`);`,
    `        const labelBox = chart.svg.append('rect')
            .attr('class', \`pending-order-label-box pending-\${pendingOrder.id}\`)
            .style('pointer-events', 'all')
            .style('cursor', 'ns-resize');

        const labelAccent = chart.svg.append('rect')
            .attr('class', \`pending-order-label-accent pending-\${pendingOrder.id}\`)
            .attr('width', 3)
            .style('pointer-events', 'none');

        const orderTypeLabel = pendingOrder.orderType === 'limit' ? 'LIMIT' : 'STOP';
        const directionLabel = pendingOrder.direction;
        const labelText = chart.svg.append('text')
            .attr('class', \`pending-order-label-text pending-\${pendingOrder.id}\`)
            .attr('font-size', '11px')
            .attr('font-weight', '700')
            .style('cursor', 'pointer')
            .text(\`\${orderTypeLabel} \${directionLabel} \${this.formatQuantity(pendingOrder.quantity || 0)}\`);

        this._styleLegacyOrderLevelToastChrome(
            { labelBox, labelText, labelAccent },
            lineColor,
            { isPreview: false }
        );`,
  ],
  // open order line styling
  [
    `.attr('stroke-width', 1)
            .attr('stroke-dasharray', null)
            .attr('opacity', 0.85)
            .style('pointer-events', 'all')
            .style('cursor', 'ns-resize');`,
    `.attr('stroke-width', 1)
            .style('pointer-events', 'none');
        this._applyOrderLevelLineStyle(line, false);`,
  ],
];

for (const [from, to] of patches) {
  if (base.includes(from)) {
    base = base.replace(from, to);
    console.log('[patch] applied wiring block');
  } else {
    console.warn('[patch] pattern not found (may already differ)');
  }
}

// Generic: preview lines use _applyOrderLevelLineStyle where current does
if (!base.includes('_applyOrderLevelLineStyle(this.previewLines.be.line')) {
  base = base.replace(
    "this.previewLines.be.line\n                    .attr('opacity', 0.6);",
    "this.previewLines.be.line\n                    .attr('opacity', 0.6);\n                this._applyOrderLevelLineStyle(this.previewLines.be.line, true);"
  );
}

fs.writeFileSync(outPath, base, 'utf8');
console.log('[restore] wrote', outPath, 'lines:', base.split(/\r?\n/).length);

// sync homepage copy
const homepage = path.join(root, 'homepage/public/chart/modules/order-manager.js');
fs.mkdirSync(path.dirname(homepage), { recursive: true });
fs.copyFileSync(outPath, homepage);
console.log('[restore] synced', homepage);
