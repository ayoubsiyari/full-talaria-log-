/**
 * Static gate: OrderManager.tradeJournal array replacement must go through the
 * M19-D mutation contract (or an explicit M19-D-JOURNAL-WRITE allow marker).
 *
 *   node "chart v 1.4/chart/modules/m19-d-journal-write-gate.test.mjs"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHART_ROOT = path.resolve(__dirname, '..');
const HOMEPAGE_CHART = path.resolve(__dirname, '../../../homepage/public/chart');

const TARGETS = [
  path.join(CHART_ROOT, 'chart.js'),
  path.join(CHART_ROOT, 'modules/order-manager.js'),
  path.join(CHART_ROOT, 'multichart-prod/panel-cmd-bridge.js'),
  path.join(HOMEPAGE_CHART, 'chart.js'),
  path.join(HOMEPAGE_CHART, 'modules/order-manager.js'),
  path.join(HOMEPAGE_CHART, 'multichart-prod/panel-cmd-bridge.js'),
];

const ASSIGN_RE = /\b(?:this|om|orderManager)\.tradeJournal\s*=/;
const ALLOW_RE = /M19-D-JOURNAL-WRITE:/;
const COMMIT_CALL_RE = /\._m19CommitJournalArray\s*\(/;

const violations = [];
const requiredCommitSites = {
  [path.join(CHART_ROOT, 'chart.js')]: ['local-backup-hydrate', 'session-state-hydrate'],
  [path.join(CHART_ROOT, 'multichart-prod/panel-cmd-bridge.js')]: ['host-journal-projection'],
  [path.join(HOMEPAGE_CHART, 'chart.js')]: ['local-backup-hydrate', 'session-state-hydrate'],
  [path.join(HOMEPAGE_CHART, 'multichart-prod/panel-cmd-bridge.js')]: ['host-journal-projection'],
};

for (const file of TARGETS) {
  if (!fs.existsSync(file)) {
    violations.push({ file, line: 0, text: 'missing file' });
    continue;
  }
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((text, i) => {
    if (!ASSIGN_RE.test(text)) return;
    if (ALLOW_RE.test(text)) return;
    // Allow the single assignment inside _m19CommitJournalArray body (tagged).
    violations.push({ file, line: i + 1, text: text.trim() });
  });

  const must = requiredCommitSites[file];
  if (must) {
    const src = lines.join('\n');
    if (!COMMIT_CALL_RE.test(src)) {
      violations.push({ file, line: 0, text: 'missing _m19CommitJournalArray call' });
    }
    for (const reason of must) {
      if (!src.includes(reason)) {
        violations.push({ file, line: 0, text: `missing commit reason '${reason}'` });
      }
    }
  }
}

if (violations.length) {
  process.stdout.write('M19-D journal write gate FAIL\n');
  for (const v of violations) {
    process.stdout.write(`  ${v.file}:${v.line}  ${v.text}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`M19-D journal write gate PASS (${TARGETS.length} files)\n`);
  process.exitCode = 0;
}
