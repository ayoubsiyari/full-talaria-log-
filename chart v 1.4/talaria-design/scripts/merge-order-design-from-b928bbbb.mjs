#!/usr/bin/env node
/**
 * Graft visual/rendering methods from b928bbbb onto current order-manager (d13007c logic base).
 * Does NOT touch order placement, panel sync, or other behavioral logic.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const rel = 'chart v 1.4/chart/modules/order-manager.js';
const basePath = path.join(root, rel);
const designPath = path.join(root, rel.replace('order-manager.js', 'order-manager.b928bbbb.js'));
const homepage = path.join(root, 'homepage/public/chart/modules/order-manager.js');

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
  if (old === newBody) {
    console.log(`[ok] ${methodName} already matches design source`);
    return source;
  }
  console.log(`[replace] ${methodName} (${old.split(/\r?\n/).length} -> ${newBody.split(/\r?\n/).length} lines)`);
  return source.replace(old, newBody);
}

const DESIGN_METHODS = [
  'positionPendingOrderTargets',
  'drawSLTPLines',
  'updateSLTPLines',
  'drawPendingOrderLine',
  'drawOrderLine',
  'renderPreviewLabel',
  '_appendPreviewMultiModesActivatorButton',
  '_applyPreviewActivator',
  '_positionPendingEntryDragVisuals',
  '_drawExecutedOrderConnectors',
  '_alignAllOrderLabels',
];

let base = fs.readFileSync(basePath, 'utf8');
const design = fs.readFileSync(designPath, 'utf8');

console.log('[merge] base lines:', base.split(/\r?\n/).length);
console.log('[merge] design lines:', design.split(/\r?\n/).length);

for (const name of DESIGN_METHODS) {
  const body = extractMethod(design, name);
  if (!body) {
    console.warn(`[missing in design] ${name}`);
    continue;
  }
  base = replaceMethod(base, name, body);
}

fs.writeFileSync(basePath, base, 'utf8');
fs.mkdirSync(path.dirname(homepage), { recursive: true });
fs.copyFileSync(basePath, homepage);
console.log('[merge] wrote', basePath, 'lines:', base.split(/\r?\n/).length);
console.log('[merge] synced', homepage);
