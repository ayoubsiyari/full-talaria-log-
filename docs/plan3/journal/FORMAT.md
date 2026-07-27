# Journal format — normative

**Director ruling, 2026-07-28.** Manager C implemented a journal grammar and a gate that parses it (`JOURNAL-APPEND-ONLY-GATE-V1`, landed at `773d9cf9b`) before this file existed. **C's grammar is normative.** An earlier draft of this file specified a different shape; it is superseded and Managers A and B must use the grammar below, not that draft.

## Rules

1. **Append-only.** Never edit, delete, reorder, or extend an existing line. Corrections are new entries that supersede an earlier one **by id**. Enforced by CI; a violating diff fails the packet.
2. **One writer per file.** `MANAGER-A.md`, `MANAGER-B.md`, `MANAGER-C.md`, `DIRECTOR.md`. Only the named author may append.
3. **Newest at the bottom.**
4. Write on **state change**, not on a schedule. Prolonged silence while working is a violation — the Director reads silence as a stall.

## Grammar (exactly five ` | `-separated fields after the list marker; absent fields are `-`)

```
- <timestamp ISO-8601 with offset> | <KIND> | <ID> | <KEY=VALUE; KEY=VALUE> | <note>
```

`ID` is stable and referenceable, e.g. `A-HB-004`, `PACKET-B-002`, `C-FLAG-001`.

## KIND — C's implemented set, plus four Director-mandated additions

Implemented and parsed today: `PACKET-OPEN`, `PACKET-RED`, `PACKET-GREEN`, `PACKET-LANDED`, `REVIEW`, `TRAIN`, `RESERVE`, `PO-REQ`, `BLOCKED`, `FLAG`, `RULING-REQ`, `HEARTBEAT`, `NOTE`.

**Director additions — required by §A11/§A12 and to be added to the parser:**

| KIND | Purpose |
|---|---|
| `ASSUMPTION` | An unverified premise being relied on. **Mandatory whenever one is relied on.** The loader defect existed because "the module is loaded on the host" was never written down and therefore never checked. The Director sweeps open assumptions each train. |
| `VERDICT` | A result. **`SURFACE=` and `COVERAGE=` are mandatory keys.** A cure was believed live for days because a verdict was recorded without its verification context; the format makes that omission structurally impossible. |
| `FALSIFIED` | A stated hypothesis disproven. Must carry `SUPERSEDES=<id>`. Tonight one Director hypothesis was falsified by PO test and one observation withdrawn — unfalsified hypotheses must never harden into cited facts. |
| `DISPATCH` | A subagent launched (§A13). Must state task, tier, model, and the **exact writable file set**, since a brief without one cannot be checked against the territory manifest or against sibling subagents. |

`TERRITORY-REQ` is expressed as `RULING-REQ` with `ROW=territory`.

## KEY=VALUE keys in use

`ROW`, `TIER`, `PACKET`, `GATE`, `SURFACE`, `COVERAGE`, `SUPERSEDES`, `BLOCKS`, `EST`. Additions permitted; reuse an existing key rather than inventing a synonym.

## Examples (real entries from `MANAGER-C.md`)

```
- 2026-07-28T00:05+01:00 | RESERVE | C-RES-001 | GATE=TERRITORY-OWNERSHIP-PREFLIGHT-V1; JOURNAL-APPEND-ONLY-GATE-V1 | Names reserved so later authoring cannot duplicate or rename a guard.
- 2026-07-28T01:45+01:00 | HEARTBEAT | C-HB-002 | ROW=A6-servable-shell-inventory; EST=inventory manifest next | Outstanding PO-REQ count: 0. No PO time consumed to date.
```

Shapes for the mandated additions:

```
- 2026-07-28T02:10+01:00 | ASSUMPTION | A-ASM-001 | ROW=M19-trim | Assuming chart.data is always the pipeline cache result identity; unverified; risk high.
- 2026-07-28T02:30+01:00 | VERDICT | A-VER-001 | ROW=M19-loader; SURFACE=host+panel; COVERAGE=single-chart and 2-panel only, 4-panel saturation not covered | GREEN.
- 2026-07-28T02:35+01:00 | FALSIFIED | A-FAL-001 | SUPERSEDES=A-ASM-001 | Cache identity diverges on the mirror path.
- 2026-07-28T02:40+01:00 | DISPATCH | A-DSP-004 | ROW=A6-session-calendar; TIER=top | model=claude-opus-5-thinking-high; writes=chart v 1.4/chart/chart.js only.
```
