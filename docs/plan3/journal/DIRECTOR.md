# Director journal

**APPEND-ONLY.** Grammar: `docs/plan3/journal/FORMAT.md`

## Entries

- 2026-07-28T00:20+01:00 | RULING | DIR-001 | ROW=A11,A12,A13 | Three managers run continuously parallel. Single PO queue, never three streams. Managers dispatch to subagents and do not implement.
- 2026-07-28T00:21+01:00 | RULING | DIR-002 | ROW=A3 | Session-calendar fix and bucket-immutability fix are canary hard gates. Awaiting PO confirmation of the implied canary delay.
- 2026-07-28T01:50+01:00 | RULING | DIR-003 | ROW=journal-format | Manager C's implemented journal grammar is normative; the Director's earlier draft format is superseded. Parser to be extended with ASSUMPTION, VERDICT (SURFACE and COVERAGE mandatory), FALSIFIED, DISPATCH per FORMAT.md.
- 2026-07-28T01:52+01:00 | RULING | DIR-004 | ROW=territory; SUPERSEDES=C-NOTE-002 | Manager C's commit of the Director-owned territory manifest under a Manager: Director trailer is RATIFIED. C acted correctly: CI cannot read an uncommitted manifest and Manager B's merge gate depended on it. C flagged it rather than concealing it, which is the behaviour required.
- 2026-07-28T01:53+01:00 | RULING | DIR-005 | ROW=TB-3 | Fail-closed default CONFIRMED: unowned paths are RED for every manager. An unowned path is a Director assignment gap, resolved by ruling, never by a manager self-granting.
- 2026-07-28T01:54+01:00 | RULING | DIR-006 | ROW=TB-2 | CONFIRMED per A11.3: Manager B's order-module grant remains inferred and V6 stays ungranted until the call-site audit reports which file owns order-line paint, hit-testing and drag preview. If any of it lives in chart.js, V6 stays with Manager A.
