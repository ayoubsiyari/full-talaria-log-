#!/usr/bin/env node
/**
 * Flip PO visual-pack scorecard into the ledger.
 * PASS → fixed | FAIL → broken (on b113). Idle until a scorecard path is provided.
 *
 *   node scripts/po-scorecard-flip.mjs --scorecard path/to/scorecard.json
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const ledgerPath = resolve(root, 'docs/plan3/TICKET-STATUS-LEDGER-20260729.md');
const packTickets = [
  'TAL-01724', 'TAL-01734', 'TAL-01735', 'TAL-01755', 'TAL-01768',
  'TAL-01821', 'TAL-01823', 'TAL-01838', 'TAL-01862', 'TAL-01916', 'TAL-01928',
  'TAL-01898', 'TAL-01925', 'TAL-01917', 'TAL-01909', 'TAL-01929', 'TAL-01923',
  'TAL-01700', 'TAL-01934', 'TAL-01717', 'TAL-01696', 'TAL-01698', 'TAL-01617',
  'TAL-01911', 'TAL-01796', 'TAL-01940',
];
const zeroTradeGuardTicket = 'ZERO-TRADE-60X';
const replayGuardedTickets = [
  'TAL-01898', 'TAL-01925', 'TAL-01917',
  'TAL-01909', 'TAL-01929', 'TAL-01923',
  'TAL-01700', 'TAL-01934', 'TAL-01717',
];
const requiredModeAxis = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6'];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const scorePath = arg('--scorecard');
if (!scorePath) {
  console.error('Armed idle: pass --scorecard <json> after Director go + PO return.');
  console.error('See docs/plan3/PO-SCORECARD-FLIP-PROCEDURE-20260730.md');
  process.exit(2);
}

const abs = resolve(scorePath);
if (!existsSync(abs)) {
  console.error('scorecard missing:', abs);
  process.exit(1);
}

const sc = JSON.parse(readFileSync(abs, 'utf8'));
if (sc.stamp && sc.stamp !== '20260730b113') {
  console.error('Refuse flip: scorecard stamp must be 20260730b113, got', sc.stamp);
  process.exit(1);
}
const missingModeAxis = requiredModeAxis.filter((k) => {
  const v = sc.modeAxis && sc.modeAxis[k];
  return !v || String(v).trim().toUpperCase() === 'UNREADABLE';
});
if (missingModeAxis.length) {
  console.error('Refuse flip: CONF-04 mode axis missing/unreadable:', missingModeAxis.join(', '));
  process.exit(1);
}

const byTicket = new Map();
for (const r of sc.results || []) {
  const v = String(r.verdict || '').toUpperCase();
  if (v !== 'PASS' && v !== 'FAIL') continue;
  byTicket.set(r.ticket, v);
}

if (byTicket.get(zeroTradeGuardTicket) === 'FAIL') {
  for (const t of replayGuardedTickets) {
    if (!byTicket.has(t) || byTicket.get(t) === 'PASS') byTicket.set(t, 'FAIL');
  }
}

let ledger = readFileSync(ledgerPath, 'utf8');
const flipped = { fixed: [], broken: [], skipped: [], missingInScorecard: [] };
const packSet = new Set(packTickets);

for (const t of packTickets) {
  if (!byTicket.has(t)) {
    flipped.missingInScorecard.push(t);
    continue;
  }
  const verdict = byTicket.get(t);
  const re = new RegExp(`^(\\| ${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\|) po-eyes(\\|.*)$`, 'm');
  if (!re.test(ledger)) {
    flipped.skipped.push({ ticket: t, reason: 'not-po-eyes-in-ledger' });
    continue;
  }
  if (verdict === 'PASS') {
    ledger = ledger.replace(re, `$1 fixed$2`);
    // Annotate evidence column lightly if still "—"
    ledger = ledger.replace(
      new RegExp(`(\\| ${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\| fixed \\|) — (\\|)`),
      `$1 PO-VISUAL-PACK-26 PASS on b113 $2`,
    );
    flipped.fixed.push(t);
  } else {
    ledger = ledger.replace(re, `$1 broken$2`);
    ledger = ledger.replace(
      new RegExp(`(\\| ${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\| broken \\|) — (\\|)`),
      `$1 PO-VISUAL-PACK-26 FAIL on b113 $2`,
    );
    flipped.broken.push(t);
  }
}

for (const [t] of byTicket) {
  if (t === zeroTradeGuardTicket) continue;
  if (!packSet.has(t)) flipped.skipped.push({ ticket: t, reason: 'not-in-26-pack' });
}

writeFileSync(ledgerPath, ledger);

const evidenceDir = resolve(root, '../_evidence/manager-D');
mkdirSync(evidenceDir, { recursive: true });
const tip = execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
const out = {
  schema: 'talaria.po-scorecard-flip.v1',
  tip,
  stamp: '20260730b113',
  scorecard: abs.replace(/\\/g, '/'),
  modeAxis: sc.modeAxis,
  zeroTradeGuard: byTicket.get(zeroTradeGuardTicket) || 'missing',
  replayGuardedTickets,
  flipped,
  at: new Date().toISOString(),
};
const evidencePath = resolve(evidenceDir, `PO-SCORECARD-FLIP-${Date.now()}.json`);
writeFileSync(evidencePath, JSON.stringify(out, null, 2));
copyFileSync(abs, resolve(evidenceDir, 'PO-SCORECARD-LAST.json'));
writeFileSync(resolve(root, 'docs/plan3/PO-SCORECARD-FLIP-LAST.json'), JSON.stringify(out, null, 2));

console.log(JSON.stringify(out, null, 2));
console.log('evidence:', evidencePath);
