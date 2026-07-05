# Manager Escalations — Director Decision Log (inbox)

**Purpose.** A dedicated, self-contained report for every **crossroad, risk, or major
plan deviation**. Each entry is written so the Product Owner can hand it directly to the
Director and get a binding decision without needing the rest of the chat context.

**When the Manager MUST write an entry here (not just a §6 finding):**
- A **crossroad**: two or more viable paths with real trade-offs (e.g. A vs B).
- A **risk**: something that could break production, invalidate measurements, or waste
  worker effort if we proceed as planned.
- A **plan deviation**: measured evidence contradicts a plan assumption or a prior
  Director decision (per D-003: record + escalate, never silently re-plan).

**Routing:** raw measurement/verification detail lives in `MANAGER-FINDINGS.md`; the
Director's rulings live in `DIRECTOR-DECISIONS.md`. This file is only the **escalation
request** — the question put to the Director. Each entry links the finding it came from
and is closed by citing the Director decision that resolved it.

---

## Entry template (copy for each new escalation)

```
## ESC-00N — <short title> (YYYY-MM-DD)
**Type:** Crossroad | Risk | Plan deviation
**Source:** MANAGER-FINDINGS §6x (+ any capture/diag doc)
**Status:** OPEN → (resolved by D-0NN)

### Context (what we know, measured)
<1–3 short paragraphs; numbers, not feelings.>

### The decision needed
<the single question the Director must answer.>

### Options
- **A — <name>:** <what it means>. Pro/Con.
- **B — <name>:** <what it means>. Pro/Con.

### Risk if we choose wrong / do nothing
<blast radius, reversibility, kill-switch availability.>

### Manager recommendation
<one option, with the one-line reason.>

### Director ruling
<filled after the fact: D-0NN summary + date.>
```

---

## Escalation history (retro-logged for continuity)

These crossroads were already raised and resolved inline before this file existed;
listed here so the ledger is complete.

| ID | Title | Type | Source | Resolved by |
|----|-------|------|--------|-------------|
| ESC-001 | Option A vs B — plan order vs measured pain | Crossroad | §5, §3 | D-001 (Option B) |
| ESC-002 | B-FIX-2 held pending objective repro (RC1 maybe not-a-bug) | Plan deviation | §6f | D-004 / D-005 / D-006 |
| ESC-003 | Retarget to host pair+TF switch latency | Crossroad | §6h, §6i | D-006 |
| ESC-004 | §6i latency is multichart-only (contradicts "not panel-gated") | Plan deviation | §6j | D-007 |
| ESC-005 | B-FIX-3 partial win — TF-switch path still eager | Plan deviation | §6n | D-011 (B-FIX-3b) |

No OPEN escalations at this time. Next crossroad/risk gets ESC-006.
