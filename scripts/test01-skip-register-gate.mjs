#!/usr/bin/env node
/**
 * TEST-01 skip register gate.
 *
 * Default: report open money-path skips (exit 0) — allowed on non-freeze stamps.
 * --freeze: FAIL LOUDLY (exit 1) if any moneyPath skip is still open.
 *
 * Usage:
 *   node scripts/test01-skip-register-gate.mjs
 *   node scripts/test01-skip-register-gate.mjs --freeze
 *   node scripts/test01-skip-register-gate.mjs --register docs/plan3/TEST01-SKIP-REGISTER-20260730.json --freeze
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const freeze = process.argv.includes('--freeze') || process.env.TALARIA_FREEZE === '1';
const registerPath = arg(
  '--register',
  resolve(root, 'docs/plan3/TEST01-SKIP-REGISTER-20260730.json'),
);

if (!existsSync(registerPath)) {
  console.error(`[skip-register-gate] MISSING register: ${registerPath}`);
  process.exit(1);
}

const reg = JSON.parse(readFileSync(registerPath, 'utf8'));
const skips = Array.isArray(reg.skips) ? reg.skips : [];
const openMoney = skips.filter((s) => s.moneyPath && s.status === 'open' && s.forbiddenOnFreeze !== false);

const report = {
  schema: 'talaria.test01-skip-register-gate.v1',
  registerPath,
  freeze,
  stamp: reg.stamp,
  openMoneySkips: openMoney.map((s) => ({ ticket: s.ticket, reason: s.reason })),
  openMoneyCount: openMoney.length,
  allSkips: skips.map((s) => ({ ticket: s.ticket, moneyPath: !!s.moneyPath, status: s.status })),
};

console.log(JSON.stringify(report, null, 2));

if (freeze && openMoney.length) {
  console.error('');
  console.error('══════════════════════════════════════════════════════════════');
  console.error(' FREEZE GATE FAILED — money-path rows still skipped');
  console.error('══════════════════════════════════════════════════════════════');
  for (const s of openMoney) {
    console.error(`  • ${s.ticket}: ${s.reason}`);
  }
  console.error('');
  console.error('A silently skipped money row at freeze is the worst available outcome.');
  console.error('Clear skips only when TEST-02 wire audit reads clean for that ticket.');
  console.error('══════════════════════════════════════════════════════════════');
  process.exit(1);
}

if (!freeze) {
  console.error(`[skip-register-gate] ok (non-freeze): ${openMoney.length} open money skip(s) recorded`);
}
