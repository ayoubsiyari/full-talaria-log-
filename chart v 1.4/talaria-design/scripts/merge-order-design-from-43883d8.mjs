#!/usr/bin/env node
/**
 * Graft order-level VISUAL design from commit 43883d8 onto current order-manager.js.
 * Does NOT replace order placement, panel sync, or other behavioral logic outside these methods.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const rel = 'chart v 1.4/chart/modules/order-manager.js';
const basePath = path.join(root, rel);
const designPath = path.join(root, rel.replace('order-manager.js', 'order-manager.43883d8.js'));
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
    console.log(`[ok] ${methodName} already matches 43883d8`);
    return source;
  }
  console.log(`[replace] ${methodName}`);
  return source.replace(old, newBody);
}

function removeMethod(source, methodName) {
  const body = extractMethod(source, methodName);
  if (!body) return source;
  console.log(`[remove] ${methodName} (not in 43883d8 design)`);
  return source.replace(body, '');
}

const DESIGN_HELPERS = [
  '_tradeMarkerToastTheme',
  '_orderLevelLineStyle',
  '_applyOrderLevelLineStyle',
  '_orderLevelLabelFontFamily',
  '_orderLevelDetailColor',
  '_buildOrderLevelToastLabelInGroup',
  '_styleLegacyOrderLevelToastChrome',
  '_positionLegacyOrderLevelToastAccent',
  '_orderLevelBadgeKindSpec',
  '_wireOrderLevelBadgeHover',
  '_appendOrderLevelBadgeToGroup',
  '_createOrderLevelBadgeOnChart',
  '_refreshPreviewLabelDimensions',
  '_refreshPendingTargetLabelDimensions',
  '_syncPreviewDragVisuals',
  '_positionPendingEntryDragVisuals',
  '_accentColorForTradeMarkerTag',
];

const DESIGN_RENDER_METHODS = [
  'renderPreviewLabel',
  '_appendPreviewMultiModesActivatorButton',
  '_applyPreviewActivator',
  'positionPreviewLabel',
  'drawPreviewLine',
  'drawPreviewBadge',
  '_drawMultiTPPreviewBadges',
  'positionPendingOrderTargets',
  '_updatePendingTargetChartLabelsLive',
  'drawPendingOrderLine',
  'drawOrderLine',
  'drawSLTPLines',
  'updateSLTPLines',
  'updateOrderLines',
  '_drawMultiTPAvgLineOnChart',
  '_updateMultiTPAvgLines',
  '_destroyMultiTPAvgEntry',
  'drawSplitGroupAvgLine',
  '_updateSplitGroupAvgLines',
  '_drawExecutedOrderConnectors',
  '_alignAllOrderLabels',
  '_createCloseCircleButton',
  '_createSplitPlusButton',
];

const REMOVE_EXTRA = [
  '_positionOrderLevelBadgeAtRow',
  '_positionOrderLevelBadgeAtCenter',
  '_positionOrderCloseBtn',
  '_orderLevelBadgeFontSize',
];

let base = fs.readFileSync(basePath, 'utf8');
const design = fs.readFileSync(designPath, 'utf8');

console.log('[merge] base lines:', base.split(/\r?\n/).length);
console.log('[merge] design lines:', design.split(/\r?\n/).length);

for (const name of REMOVE_EXTRA) {
  base = removeMethod(base, name);
}

for (const name of DESIGN_HELPERS) {
  const body = extractMethod(design, name);
  if (!body) {
    console.warn(`[missing in 43883d8] ${name}`);
    continue;
  }
  base = replaceMethod(base, name, body);
}

for (const name of DESIGN_RENDER_METHODS) {
  const body = extractMethod(design, name);
  if (!body) {
    console.warn(`[missing in 43883d8] ${name}`);
    continue;
  }
  base = replaceMethod(base, name, body);
}

// _ORDER_LEVEL_ACTIVE_DASH field
const dashRe = /\n    _ORDER_LEVEL_ACTIVE_DASH = '[^']*';/;
const dashMatch = design.match(dashRe);
if (dashMatch) {
  if (dashRe.test(base)) {
    base = base.replace(dashRe, dashMatch[0]);
    console.log('[replace] _ORDER_LEVEL_ACTIVE_DASH');
  }
}

fs.writeFileSync(basePath, base, 'utf8');
fs.mkdirSync(path.dirname(homepage), { recursive: true });
fs.copyFileSync(basePath, homepage);
console.log('[merge] wrote', basePath, 'lines:', base.split(/\r?\n/).length);
console.log('[merge] synced', homepage);
