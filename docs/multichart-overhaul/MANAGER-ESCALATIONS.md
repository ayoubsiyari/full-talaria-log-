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

## ESC-006 — viewport-first regressed same-pair panel data ownership (2026-07-05)
**Type:** Risk / Regression
**Source:** MANAGER-FINDINGS §6p (build b601)
**Status:** OPEN

### Context (measured)
The viewport-first family (B-FIX-3 pair + B-FIX-3b TF) fixed host switch latency, but
introduced a regression in the same-pair panels. On a 2×2 host TF switch:
- Before (S6 baseline): B/C/D `fetches = 0`, `extendsFromParent = 85–89` — copying host.
- After (b601): B/C/D `fetches = 47–77`, `fetchedBars = 94–150k`, `extendsFromParent = 1–3`
  — each panel self-fetches the full history and re-renders on every host TF switch.
Aggregate fetches increased (host + N panels paging). `seams = 0` (no corruption).
Single chart unaffected. PO-visible symptom: "other panels re-render each time I switch
TF on host A."

Root: viewport-first defers the host's full 1m master to background; same-pair panels
require a COMPLETE host master to clone and fall back to self-fetch when it is incomplete.
The panel-feed contract (DIAG-B4 #2 / D-011 assumption "panels tolerate a short master-lag
window") did NOT hold — panels self-fetch instead of waiting/mirroring.

### The decision needed
How to resolve the ownership regression while keeping the host-latency win?

### Options
- **A — Kill-switch rollback now, then fix panel-feed (recommended):** flip the relevant
  kill-switch(es) to restore panels-copy immediately (no redeploy), then a scoped fix so
  panels adopt the host's viewport-first window / wait for host master instead of
  self-fetching. Pro: instant safety, keeps the process (fix root, measured). Con: host
  fast-switch temporarily reverts where the kill-switch is applied.
- **B — Leave 3/3b on, fix-forward panel-feed directly:** keep host latency win, add the
  panel-side wait/mirror in a new gated task. Pro: no user-visible revert. Con: ships a
  known-regressed behavior to users until the fix lands (violates rollback-first policy).

### Risk if we choose wrong / do nothing
Doing nothing = every same-pair panel re-fetches ~100k bars on each host TF switch:
worse aggregate load than the original bug, constant re-render. Reversible via kill-switch
(no corruption — seams 0).

### Manager recommendation
**A.** Kill-switch first (isolate whether TF-switch flag alone, or both, restores
panels-copy), capture evidence, then a gated panel-feed fix (panels go viewport-first /
wait for host master rather than self-fetch). Do NOT patch-on-patch live.

### Director ruling
**D-013 (2026-07-05): Option A.** Kill-switch isolation first (TF flag alone, then both;
include one pair-switch probe), record the matrix; then B-DIAG-5 (read-only — name the
exact file:line where a same-pair panel decides to self-fetch on incomplete host master);
then B-FIX-3c (panels WAIT-AND-MIRROR host hydration, own kill-switch, re-enabled with
3/3b in the same build). New standing acceptance criterion: same-pair panel `fetches = 0`
in every 2×2 capture. Status → resolved by D-013 pending Step-1 matrix.

**Update (D-014/D-015):** Step-1 matrix run — TF-flag-alone did NOT restore panels-copy;
both-flags-off DID (B/C/D fetches 0). D-015 accepted matrix CONCLUSIVE: viewport-first
family = source, B-FIX-3 pair-load the essential culprit. **ESC-006 step 1 CLOSED.**
Durability ruling = option (a): ship minimal default-OFF build. Remaining fix work under
D-015 sequence: default-OFF build → PO S6 re-capture (settles extendsFromParent=0 anomaly
+ fresh 3c "before") → B-DIAG-5 → B-FIX-3c. **ESC-006 RESOLVED.**

