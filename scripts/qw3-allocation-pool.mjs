#!/usr/bin/env node
/**
 * QW-3 allocation pooling harness.
 *
 * Read-only: consumes A's V8 sampling allocation JSON packets and pools named
 * stack clusters across runs. Defaults to D's QW-3 rows from A's sealed 10 b/s
 * packets: indicator worker result path and MONSTER-2 / _resampleDataFull.
 * Additional top-stack rows can be supplied with:
 *   --stack="label::regex one|regex two"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_INPUTS = [
  'docs/plan3/evidence/speed01-allocation-sealed-10bps-baseline.json',
  'docs/plan3/evidence/speed01-allocation-sealed-10bps-r2.json',
];

const DEFAULT_STACKS = [
  {
    label: 'Indicator worker result path',
    patterns: [
      /w\.onmessage/i,
      /mergeIndicatorTailWindow/i,
      /finishWorkerPass/i,
    ],
  },
  {
    label: 'MONSTER-2 _resampleDataFull',
    patterns: [/_resampleDataFull/i],
  },
];

function args() {
  const out = {
    inputs: [],
    stacks: [],
    out: 'docs/plan3/evidence/qw3-allocation-pool.json',
  };
  for (const raw of process.argv.slice(2)) {
    if (raw.startsWith('--input=')) {
      out.inputs.push(...raw.slice('--input='.length).split(',').map((s) => s.trim()).filter(Boolean));
    } else if (raw.startsWith('--stack=')) {
      out.stacks.push(parseStackArg(raw.slice('--stack='.length)));
    } else if (raw.startsWith('--out=')) {
      out.out = raw.slice('--out='.length);
    } else if (raw === '--json') {
      out.json = true;
    } else if (raw === '--help' || raw === '-h') {
      out.help = true;
    } else {
      throw new Error(`unknown argument: ${raw}`);
    }
  }
  if (!out.inputs.length) out.inputs = DEFAULT_INPUTS.slice();
  if (!out.stacks.length) out.stacks = DEFAULT_STACKS.slice();
  return out;
}

function parseStackArg(value) {
  const sep = value.indexOf('::');
  if (sep < 1) throw new Error(`invalid --stack, expected label::regex: ${value}`);
  const label = value.slice(0, sep).trim();
  const parts = value.slice(sep + 2).split('|').map((s) => s.trim()).filter(Boolean);
  if (!label || !parts.length) throw new Error(`invalid --stack, expected label::regex: ${value}`);
  return { label, patterns: parts.map((p) => new RegExp(p, 'i')) };
}

function resolveInput(p) {
  return path.isAbsolute(p) ? p : path.resolve(repoRoot, p);
}

function readPacket(file) {
  const resolved = resolveInput(file);
  const packet = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const totalMb = Number(packet.totalSampledMb);
  const topSites = Array.isArray(packet.topSites) ? packet.topSites : [];
  if (!(totalMb > 0)) throw new Error(`packet has no positive totalSampledMb: ${file}`);
  return {
    file,
    resolved,
    row: packet.row || null,
    startedAt: packet.startedAt || null,
    finishedAt: packet.finishedAt || null,
    nominalBarsPerSecond: packet.nominalBarsPerSecond ?? null,
    effectiveRateMean: packet.effectiveRate?.mean ?? null,
    replayDutyCycle: packet.replayLiveness?.dutyCycle ?? null,
    totalSampledMb: totalMb,
    topSites,
  };
}

export function poolAllocationPackets({ inputs = DEFAULT_INPUTS, stacks = DEFAULT_STACKS } = {}) {
  const packets = [];
  const missing = [];
  for (const input of inputs) {
    const resolved = resolveInput(input);
    if (!fs.existsSync(resolved)) {
      missing.push(input);
      continue;
    }
    packets.push(readPacket(input));
  }

  const report = {
    signature: 'QW3-ALLOCATION-POOL-V1',
    at: new Date().toISOString(),
    inputs,
    missingInputs: missing,
    status: missing.length ? 'VOID_MISSING_INPUT' : (packets.length ? 'READY' : 'VOID_NO_INPUT'),
    packetCount: packets.length,
    totalSampledMb: Number(packets.reduce((s, p) => s + p.totalSampledMb, 0).toFixed(2)),
    rateMean: null,
    rows: [],
    packets: packets.map((p) => ({
      file: p.file,
      startedAt: p.startedAt,
      finishedAt: p.finishedAt,
      nominalBarsPerSecond: p.nominalBarsPerSecond,
      effectiveRateMean: p.effectiveRateMean,
      replayDutyCycle: p.replayDutyCycle,
      totalSampledMb: p.totalSampledMb,
    })),
  };
  const rates = packets.map((p) => Number(p.effectiveRateMean)).filter((n) => Number.isFinite(n));
  if (rates.length) report.rateMean = Number((rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(3));

  for (const stack of stacks) {
    const perRun = packets.map((packet) => {
      const matches = packet.topSites.filter((site) => {
        const text = `${site.site || ''}`;
        return stack.patterns.some((re) => re.test(text));
      });
      const mb = matches.reduce((s, site) => s + (Number(site.mb) || 0), 0);
      return {
        file: packet.file,
        mb: Number(mb.toFixed(2)),
        pct: packet.totalSampledMb > 0 ? Number(((mb / packet.totalSampledMb) * 100).toFixed(2)) : null,
        matches: matches.map((site) => ({ site: site.site, mb: Number(site.mb) || 0, pct: site.pct ?? null })),
      };
    });
    const pooledMb = perRun.reduce((s, run) => s + run.mb, 0);
    report.rows.push({
      label: stack.label,
      patterns: stack.patterns.map((re) => re.source),
      pooledMb: Number(pooledMb.toFixed(2)),
      pooledPct: report.totalSampledMb > 0 ? Number(((pooledMb / report.totalSampledMb) * 100).toFixed(2)) : null,
      runsWithMatch: perRun.filter((run) => run.mb > 0).length,
      perRun,
    });
  }

  report.rows.sort((a, b) => b.pooledMb - a.pooledMb);
  return report;
}

function printHelp() {
  console.log(`QW-3 allocation pooling harness

Usage:
  node scripts/qw3-allocation-pool.mjs [--input=a.json,b.json] [--stack="label::regex|regex"] [--out=path] [--json]

Defaults:
  inputs: ${DEFAULT_INPUTS.join(', ')}
  stacks: ${DEFAULT_STACKS.map((s) => s.label).join('; ')}
`);
}

async function main() {
  const opts = args();
  if (opts.help) {
    printHelp();
    return;
  }
  const report = poolAllocationPackets(opts);
  const outPath = resolveInput(opts.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`QW-3 allocation pool: ${report.status}`);
  console.log(`packets=${report.packetCount} sampled=${report.totalSampledMb} MB rateMean=${report.rateMean ?? 'n/a'}`);
  const duty = report.packets.map((p) => p.replayDutyCycle).filter((n) => Number.isFinite(Number(n)));
  if (duty.length) console.log(`dutyCycle=${duty.map((n) => Number(n).toFixed(2)).join(',')}`);
  for (const row of report.rows) {
    console.log(`${row.pooledMb.toFixed(2).padStart(7)} MB ${String(row.pooledPct).padStart(6)}% ${row.label}`);
  }
  console.log(`written ${path.relative(process.cwd(), outPath)}`);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`[qw3-pool] FAILED: ${err?.stack || err}`);
    process.exitCode = 1;
  });
}