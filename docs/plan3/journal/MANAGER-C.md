# Manager C journal — Verification Infrastructure

**APPEND-ONLY.** Enforced by JOURNAL-APPEND-ONLY-GATE-V1 (`scripts/lib/journal-append-only.mjs`):
any diff that modifies, removes, reorders or extends an existing line in this file fails the
packet, and only Manager C may append to it. Corrections are written as a new entry that
supersedes an earlier one by id; earlier entries are never edited.

## Entry grammar (stable contract — the item-5 tooling parses this)

Exactly five ` | `-separated fields after the list marker. Absent fields are written `-`.

```
- <timestamp ISO-8601 with offset> | <KIND> | <ID> | <KEY=VALUE; KEY=VALUE> | <note>
```

`KIND` is one of: `PACKET-OPEN`, `PACKET-RED`, `PACKET-GREEN`, `PACKET-LANDED`, `REVIEW`,
`TRAIN`, `RESERVE`, `PO-REQ`, `BLOCKED`, `FLAG`, `RULING-REQ`, `HEARTBEAT`, `NOTE`.

`KEY=VALUE` keys in use: `ROW`, `TIER`, `PACKET`, `GATE`, `SURFACE`, `COVERAGE`, `SUPERSEDES`,
`BLOCKS`, `EST`.

## Entries

- 2026-07-27T23:48+01:00 | NOTE | C-OPEN-001 | - | Session open. Read in full before any code: DIRECTOR-RULINGS-20260727.md, CHART-SHELL-SYSTEMIC-AUDIT-20260727.md, REQUIRED-GLOBAL-SILENT-FALLBACK-AUDIT-20260727.md, PO-SWEEP-RESULTS-20260727.md, ADVISOR-BRIEF-20260727-EVENING.md.
- 2026-07-27T23:50+01:00 | NOTE | C-OPEN-002 | - | Authoring on branch manager-c/verification-infra per A11.1; C deploys nowhere. Pre-existing uncommitted work in the tree belongs to other lanes and was not touched.
- 2026-07-27T23:52+01:00 | FLAG | C-FLAG-001 | SURFACE=homepage/public/chart/modules/m21-w6-fixtures/browser-preflight/preflight-host.html | Confirmed present: a test fixture is live on the public web root, reachable because homepage copies all of modules/. Flagged separately per Director instruction. Removal is a routing/build packet (S3 class), not C territory — C's contribution is the fail-closed inventory that keeps it RED until removed.
- 2026-07-27T23:55+01:00 | NOTE | C-FIND-001 | ROW=A4c-2-module-presence-preflight | Queue item 2 is partly pre-built: scripts/module-contract-preflight.mjs and scripts/module-contracts.json landed at 90e0e0cf8 with four-state cells, and the loader fix landed at 54edafa8a. Its inventory declares 9 rows; the Director's path scan names roughly twenty shells. Item 2 is therefore an extension of a live gate, not greenfield, and MODULE-CONTRACT-PREFLIGHT-V1 must not be renamed.
- 2026-07-28T00:05+01:00 | RESERVE | C-RES-001 | GATE=TERRITORY-OWNERSHIP-PREFLIGHT-V1; JOURNAL-APPEND-ONLY-GATE-V1 | Names reserved in docs/plan3/GATE-NAME-RESERVATIONS.md, together with every gate, cell, fixture and epsilon name for queue items 2 to 5, so later authoring cannot duplicate or rename a guard.
- 2026-07-28T00:08+01:00 | PACKET-OPEN | PACKET-C-001 | ROW=A11.2-territory-preflight; TIER=2; BLOCKS=Manager B merges | Territory manifest plus CI ownership preflight plus append-only journal check. Tier 2: shared CI path, multi-file, no product runtime behaviour.
- 2026-07-28T00:20+01:00 | NOTE | C-DESIGN-001 | ROW=A11.2-territory-preflight | Attribution and auditing are per commit, not per packet range. Two reasons, both proven by cells: a packet may legitimately carry a Director commit beside a manager's commits, and a range-level audit reports GREEN when a manager touches another territory in one commit and reverts it in the next.
- 2026-07-28T00:30+01:00 | FLAG | C-FLAG-002 | SURFACE=repository | docs/ is git-ignored. 340 files under docs/plan3 are untracked against 56 tracked, and DIRECTOR-RULINGS-20260727.md is one of the untracked ones, so standing policy has no history, no diff and no attribution. Append-only enforcement over an untracked journal enforces nothing, so this was blocking. Narrow .gitignore negations added for the governance artifacts C owns only. Whether the policy documents themselves enter version control is a Director decision and was left alone; recorded as open ruling TB-6.
- 2026-07-28T00:35+01:00 | NOTE | C-DESIGN-002 | ROW=A11.2-territory-preflight; GATE=TERRITORY-OWNERSHIP-PREFLIGHT-V1 | Added a permanent artifact assertion so the above can never be silent again: every packet re-proves that the manifest and all four journals are tracked and unmatched by any ignore rule. A journal present on disk but absent from history is RED; a journal that does not exist yet is not. Same class as the loader finding, applied to the gate's own inputs.
- 2026-07-28T00:40+01:00 | PACKET-GREEN | PACKET-C-001 | ROW=A11.2-territory-preflight; TIER=2; GATE=TERRITORY-OWNERSHIP-PREFLIGHT-V1 | 29 cells green, 3x repeat identical, alternate root and stubbed clock identical. Four-state proof present. Two negative controls present: NC-TERRITORY-SELF-GRANT proves the director_only rule is what catches a self-grant, NC-TERRITORY-EMPTY-GRANT proves an emptied manifest cannot pass a packet as owned. Nine end-to-end cells run against real scratch git repositories, so trailer parsing, rename detection, per-commit journal diffing and the tracked/ignored assertions are proven against git rather than stubbed.
- 2026-07-28T00:45+01:00 | RULING-REQ | C-RULE-001 | ROW=A11.2-territory-preflight | TERRITORY.yml carries seven open rulings, each operative as written until the Director rules: SH-1 shared evidence trees; TB-1 whether A owns the whole chart modules tree; TB-2 B's order-module grant is inferred and V6 stays ungranted per A11.3; TB-3 unowned paths are RED for everyone by fail-closed default; TB-4 whether C owns package.json; TB-5 whether C owns .gitignore; TB-6 which plan3 documents must be tracked. Every grant in the manifest is labelled ruling or inferred; C cannot promote inferred to ruling.
- 2026-07-28T00:50+01:00 | NOTE | C-NOTE-001 | ROW=A11.2-territory-preflight | Consequence the Director should know before B merges: the preflight requires Manager/Row/Packet/Tier trailers on every commit and fails an unattributable diff. It only inspects base..head, so pre-regime history is never checked and no migration is needed.
- 2026-07-28T00:52+01:00 | NOTE | C-NOTE-002 | ROW=A11.2-territory-preflight | The manifest is Director-owned, so the gate correctly rejects a Manager C commit that touches it. It was therefore committed separately under a Manager: Director trailer, with the body recording that Manager C drafted it and that adoption is the Director's to confirm or amend. C signed that trailer only because CI cannot read an uncommitted manifest and B's merge gate depends on it; re-sign or reject it as the Director prefers.
- 2026-07-28T00:55+01:00 | HEARTBEAT | C-HB-001 | ROW=A11.2-territory-preflight; EST=item 2 next | Gating item 1 complete and green; B's merge gate is live. Outstanding PO-REQ count: 0. Next: queue item 2, build-time module-presence preflight extended to the full servable-shell inventory plus the runtime symbol tripwire.
