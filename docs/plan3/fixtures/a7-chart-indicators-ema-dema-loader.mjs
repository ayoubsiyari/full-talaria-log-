/**
 * Read-only extract of chart-indicators EMA/DEMA calculators for A7 parity (M5).
 * Does not modify product sources — parses function bodies from chart-indicators-full.js.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '../../..');

const CHART_INDICATORS_REL = path.join('chart v 1.4', 'chart', 'modules', 'chart-indicators-full.js');

/** @param {string} source @param {string} name */
export function extractNamedFunction(source, name) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`);
  const m = re.exec(source);
  if (!m) {
    throw new Error(`a7-chart-indicators-ema-dema-loader: missing function ${name}`);
  }
  const braceStart = source.indexOf('{', m.index);
  if (braceStart < 0) {
    throw new Error(`a7-chart-indicators-ema-dema-loader: missing body for ${name}`);
  }
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(m.index, i + 1);
      }
    }
  }
  throw new Error(`a7-chart-indicators-ema-dema-loader: unclosed function ${name}`);
}

/**
 * @param {string} [root] Repo root
 * @returns {{ calculateEMA: Function, calculateDEMA: Function, sourceRel: string }}
 */
export function loadChartIndicatorsEmaDema(root = DEFAULT_REPO_ROOT) {
  const abs = path.join(root, CHART_INDICATORS_REL);
  if (!fs.existsSync(abs)) {
    throw new Error(`a7-chart-indicators-ema-dema-loader: missing ${abs}`);
  }
  const source = fs.readFileSync(abs, 'utf8');
  const resolveOhlc = extractNamedFunction(source, 'resolveOhlcSourceValue');
  const calculateEMA = extractNamedFunction(source, 'calculateEMA');
  const calculateDEMA = extractNamedFunction(source, 'calculateDEMA');

  const sandbox = { exports: {} };
  const script = `
${resolveOhlc}
${calculateEMA}
${calculateDEMA}
exports.calculateEMA = calculateEMA;
exports.calculateDEMA = calculateDEMA;
`;
  vm.runInContext(script, vm.createContext(sandbox));
  if (typeof sandbox.exports.calculateEMA !== 'function' || typeof sandbox.exports.calculateDEMA !== 'function') {
    throw new Error('a7-chart-indicators-ema-dema-loader: extract did not yield calculators');
  }
  return {
    calculateEMA: sandbox.exports.calculateEMA,
    calculateDEMA: sandbox.exports.calculateDEMA,
    sourceRel: CHART_INDICATORS_REL,
  };
}

/** @param {ArrayLike<number>} series */
export function seriesToCloseBars(series) {
  const n = series.length;
  const bars = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = series[i];
    bars[i] = { c, close: c, o: c, h: c, l: c, t: i };
  }
  return bars;
}
