#!/usr/bin/env node
/**
 * EVID-01 — mechanical status counts from TICKET-STATUS-LEDGER-20260729.md
 * Prose counts are retired. Run:
 *   node scripts/ledger-status-count.mjs
 *   node scripts/ledger-status-count.mjs --json
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const ledgerPath = resolve(root, 'docs/plan3/TICKET-STATUS-LEDGER-20260729.md');
const wantJson = process.argv.includes('--json');

const text = readFileSync(ledgerPath, 'utf8');
const rows = [];
for (const line of text.split(/\r?\n/)) {
  // | Ticket | Status | Commit | Gate | Note |
  if (!line.startsWith('|')) continue;
  const cells = line.split('|').map((c) => c.trim());
  // cells[0] empty, [1]=ticket, [2]=status, ...
  if (cells.length < 4) continue;
  const ticket = cells[1];
  const status = cells[2];
  if (!ticket || ticket === 'Ticket' || /^-+$/.test(ticket)) continue;
  if (!status || status === 'Status' || /^-+$/.test(status)) continue;
  // Skip the summary table (| Status | Count |)
  if (ticket === 'Status' || ticket === 'blocked-on-build' || /^\d+$/.test(status)) continue;
  if (cells[1] === 'Status' && cells[2] === 'Count') continue;
  // Summary rows look like | fixed | 50 |
  if (/^\d+$/.test(cells[2]) && !cells[3]) continue;
  rows.push({ ticket, status: status.toLowerCase() });
}

// Filter out status-count summary table: those have ticket=status-name and status=number
const ticketRows = rows.filter((r) => !/^\d+$/.test(r.status));

const counts = Object.create(null);
for (const r of ticketRows) {
  counts[r.status] = (counts[r.status] || 0) + 1;
}

const fixedTickets = ticketRows.filter((r) => r.status === 'fixed').map((r) => r.ticket);
const total = ticketRows.length;

const out = {
  schema: 'talaria.ledger-status-count.v1',
  ledger: 'docs/plan3/TICKET-STATUS-LEDGER-20260729.md',
  tipHint: 'run from manager-d-trade; tip via git separately',
  totalRows: total,
  counts,
  fixed: counts.fixed || 0,
  fixedTickets,
};

if (wantJson) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`ledger=${out.ledger}`);
  console.log(`total_rows=${total}`);
  for (const k of Object.keys(counts).sort()) {
    console.log(`${k}=${counts[k]}`);
  }
  console.log(`HONEST_FIXED=${out.fixed}`);
}
