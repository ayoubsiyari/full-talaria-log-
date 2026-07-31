#!/usr/bin/env node
/**
 * E-WARMUP-PRESESSION-BUCKETS-V1
 *
 * RED gate for the current source: backtest initial fetch buckets are fixed
 * bar counts and do not satisfy the indicator warm-up contract. It also
 * catches the 1m-master resample defect: 320 master minutes is not 320 display
 * bars at coarser display timeframes.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const chartPath = path.join(root, 'chart v 1.4/chart/chart.js');
const outDir = path.join(root, 'docs/plan3/evidence/E-WARMUP-WINDOWS-20260731');
const outPath = path.join(outDir, 'pre-session-warmup-buckets-red.json');
fs.mkdirSync(outDir, { recursive: true });

const source = fs.readFileSync(chartPath, 'utf8');

function requireSource(pattern, label) {
  const match = source.match(pattern);
  if (!match) throw new Error(`missing source marker: ${label}`);
  return match;
}

requireSource(/_getBacktestInitialFetchRange\s*\(/, '_getBacktestInitialFetchRange');
requireSource(/lookbackBars\s*=\s*80\b/, 'default 80 lookback');
requireSource(/tfMs\s*>=\s*7\s*\*\s*86400000[\s\S]{0,80}lookbackBars\s*=\s*26\b/, 'weekly 26 bucket');
requireSource(/tfMs\s*>=\s*86400000[\s\S]{0,80}lookbackBars\s*=\s*45\b/, 'daily 45 bucket');
requireSource(/tfMs\s*<=\s*3600000[\s\S]{0,80}lookbackBars\s*=\s*320\b/, '<=1h 320 bucket');
requireSource(/requestTimeframe\s*=\s*['"]1m['"]/, 'backtest 1m master request');

function requiredWarmup(maxParam) {
  if (maxParam == null) return 50; // empty-indicator early return in estimateTailLookback
  return Math.min(5000, Math.max(120, Math.max(50, Number(maxParam) || 0) * 4 + 64));
}

const requiredFloor = requiredWarmup(50);
const requiredSma200 = requiredWarmup(200);

const directBuckets = [
  { bucket: 'weekly+', exampleTf: '1w', sourceLookbackBars: 26, displayMinutes: 7 * 24 * 60 },
  { bucket: 'daily', exampleTf: '1d', sourceLookbackBars: 45, displayMinutes: 24 * 60 },
  { bucket: '1h<tf<1d', exampleTf: '4h-direct', sourceLookbackBars: 80, displayMinutes: 4 * 60 },
  { bucket: '<=1h', exampleTf: '1h-direct', sourceLookbackBars: 320, displayMinutes: 60 },
].map((row) => ({
  ...row,
  mode: 'direct-display-tf',
  effectiveDisplayBars: row.sourceLookbackBars,
  floorDeficitBars: Math.max(0, requiredFloor - row.sourceLookbackBars),
  sma200DeficitBars: Math.max(0, requiredSma200 - row.sourceLookbackBars),
}));

const masterRows = [
  { exampleTf: '1m', displayMinutes: 1 },
  { exampleTf: '5m', displayMinutes: 5 },
  { exampleTf: '15m', displayMinutes: 15 },
  { exampleTf: '1h', displayMinutes: 60 },
  { exampleTf: '4h', displayMinutes: 240 },
].map((row) => {
  const effective = 320 / row.displayMinutes;
  return {
    mode: 'backtest-1m-master-resample',
    bucket: '<=1h source bucket forced by requestTimeframe=1m',
    sourceLookbackBars: 320,
    sourceLookbackMinutes: 320,
    ...row,
    effectiveDisplayBars: effective,
    floorDeficitBars: Math.max(0, requiredFloor - effective),
    sma200DeficitBars: Math.max(0, requiredSma200 - effective),
  };
});

const rows = directBuckets.concat(masterRows);
const failing = rows.filter((row) => row.floorDeficitBars > 0 || row.sma200DeficitBars > 0);

const evidence = {
  evidenceClass: 'manager-e-pre-session-warmup-buckets-red-v1',
  capturedAt: new Date().toISOString(),
  source: {
    chartPath,
    markers: {
      weeklyBucketBars: 26,
      dailyBucketBars: 45,
      intradayBucketBars: 80,
      oneHourAndFinerBucketBars: 320,
      backtestMasterTimeframe: '1m',
    },
  },
  contract: {
    formula: 'min(5000, max(120, max(50, maxIndicatorParam) * 4 + 64))',
    requiredFloor,
    requiredSma200,
    note: 'empty-indicator early return is 50; this gate covers non-empty indicator correctness',
  },
  rows,
  verdict: failing.length ? 'RED' : 'GREEN',
  reason: failing.length
    ? 'current backtest initial fetch buckets provide fewer display warm-up bars than the indicator contract requires'
    : 'all buckets satisfy the indicator warm-up contract',
};

fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  outPath,
  verdict: evidence.verdict,
  requiredFloor,
  requiredSma200,
  failing: failing.map((row) => ({
    mode: row.mode,
    bucket: row.bucket,
    exampleTf: row.exampleTf,
    effectiveDisplayBars: row.effectiveDisplayBars,
    floorDeficitBars: row.floorDeficitBars,
    sma200DeficitBars: row.sma200DeficitBars,
  })),
}, null, 2)}\n`);
process.exitCode = failing.length ? 1 : 0;
