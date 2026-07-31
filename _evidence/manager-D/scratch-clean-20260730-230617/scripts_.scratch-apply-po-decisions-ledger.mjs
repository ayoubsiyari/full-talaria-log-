import { readFileSync, writeFileSync } from 'node:fs';

const p = 'docs/plan3/TICKET-STATUS-LEDGER-20260729.md';
let t = readFileSync(p, 'utf8');
const repl = [
  [
    '| TAL-01784 | needs-info | — | Cluster O feature request | Not a bug gate |',
    '| TAL-01784 | feature-request | — | PO-DECISIONS 23-row: NO | Not wanted |',
  ],
  [
    '| TAL-01814 | needs-info | — | Cluster O feature request | Not a bug gate |',
    '| TAL-01814 | feature-request | — | PO-DECISIONS 23-row: NO | Not wanted |',
  ],
  [
    '| TAL-01849 | needs-info | — | Cluster O feature request | Not a bug gate |',
    '| TAL-01849 | feature-request | — | PO-DECISIONS 23-row: AFTER | Post-canary backlog |',
  ],
  [
    '| TAL-01851 | needs-info | — | Cluster O feature request | Not a bug gate |',
    '| TAL-01851 | feature-request | — | PO-DECISIONS 23-row: AFTER | Post-canary backlog |',
  ],
  [
    '| TAL-01852 | needs-info | — | Cluster O feature request | Not a bug gate |',
    '| TAL-01852 | feature-request | — | PO-DECISIONS 23-row: AFTER | Post-canary backlog |',
  ],
  [
    '| TAL-01906 | needs-info | — | Cluster O feature request | Not a bug gate |',
    '| TAL-01906 | feature-request | — | PO-DECISIONS 23-row: AFTER | Post-canary backlog |',
  ],
  [
    '| TAL-01907 | needs-info | — | Cluster O feature request | Not a bug gate |',
    '| TAL-01907 | feature-request | — | PO-DECISIONS 23-row: AFTER | Post-canary backlog |',
  ],
  [
    '| TAL-01915 | needs-info | — | Cluster O feature request | Not a bug gate |',
    '| TAL-01915 | feature-request | — | PO-DECISIONS 23-row: AFTER | Post-canary backlog |',
  ],
  [
    '| TAL-01891 | needs-info | — | Cluster N memory lag | Soak undefined; no invented click path |',
    '| TAL-01891 | owner-blocked | — | PO-DECISIONS: YES same memory campaign | Owner **A** — folds into 730 MB/h hunt |',
  ],
  [
    '| TAL-01892 | needs-info | — | Cluster N idle lag | Soak/monitor lane |',
    '| TAL-01892 | blocked-on-build | — | PO-DECISIONS: NOT SURE; wait for fix train | Retest after memory/lag stamp |',
  ],
  [
    '| TAL-01677 | owner-blocked | — | Go-To session London→NY error (Cluster D / M8 nav) | Owner A — `chart.js` session nav; not D money-path |',
    '| TAL-01677 | verify-gone | — | PO-DECISIONS: already fixed (PO) | PO asserts fixed; no re-ask |',
  ],
  [
    '| TAL-01854 | closed-scratched | — | PO scratched from M25 | No product gate |',
    '| TAL-01854 | owner-blocked | — | PO-DECISIONS: REAL (auto-follow / TF downshift family) | Owner **A** |',
  ],
  [
    '| TAL-01850 | owner-blocked | — | CANARY BLOCKER — `keyboard-shortcuts.js` / `chart.js` | **Owner A** (TERRITORY). Not D |',
    '| TAL-01850 | owner-blocked | — | PO-DECISIONS: BLOCKER | Owner **A** — canary blocker confirmed |',
  ],
  [
    '| TAL-01913 | owner-blocked | — | Cluster H daily-open lines | Chart overlay owner |',
    '| TAL-01913 | owner-blocked | — | Cluster H daily-open lines | Owner **E** (indicator/overlay grant) |',
  ],
  [
    '| TAL-01914 | owner-blocked | — | Cluster H indicator labels | Chart overlay owner |',
    '| TAL-01914 | owner-blocked | — | Cluster H indicator labels | Owner **E** |',
  ],
  [
    '| TAL-01921 | owner-blocked | — | Cluster H indicator labels | Chart overlay owner |',
    '| TAL-01921 | owner-blocked | — | Cluster H indicator labels | Owner **E** |',
  ],
  [
    '| TAL-01935 | owner-blocked | — | Cluster H indicator labels | Chart overlay owner |',
    '| TAL-01935 | owner-blocked | — | Cluster H indicator labels | Owner **E** |',
  ],
  [
    '| TAL-01938 | owner-blocked | — | Cluster H ORB size | Chart overlay / session calendar |',
    '| TAL-01938 | owner-blocked | — | Cluster H ORB size | Owner **E** |',
  ],
];

const missing = [];
for (const [a, b] of repl) {
  if (!t.includes(a)) missing.push(a);
  else t = t.replace(a, b);
}
if (missing.length) {
  console.error('MISSING', missing);
  process.exit(1);
}
writeFileSync(p, t);
console.log('updated', repl.length);
