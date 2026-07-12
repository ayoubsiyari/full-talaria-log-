# T3 Lane 2 — Retest Triage Report (step 0)

**Task:** T3 step 0 — multichart retest-first triage (RC-4)  
**Worker prompt:** `docs/tickets-overhaul/worker-prompts/T3-lane2-retest-triage.md`  
**Deliverable:** `docs/tickets-overhaul/T3-RETEST-CHECKLIST.md`  
**Date:** 2026-07-12

---

## Scope

| Metric | Count |
| --- | --- |
| `multichart_layouts` rows in `TICKET-REGISTRY.csv` | 100 |
| **Checklist tickets** (enumerated subset) | **24** |
| July-4 batch `TAL-01480`…`TAL-01502` | 21 |
| Older unresolved (`TAL-01426`, `TAL-01440`, `TAL-01536`) | 3 |
| Excluded (pre-July-4 resolved/closed) | 76 |

Build under test: **`20260707b105` or later**. Build-id confirmation (L1) is step 0 of every row in the checklist.

---

## Hypothesis tags (24 tickets)

| Tag | Count | Tickets |
| --- | ---: | --- |
| `LIKELY-FIXED-b105` | 5 | TAL-01481, TAL-01484, TAL-01486, TAL-01490, TAL-01502 |
| `LIKELY-SURVIVES` | 10 | TAL-01426, TAL-01485, TAL-01487, TAL-01491, TAL-01493, TAL-01495, TAL-01498, TAL-01499, TAL-01500, TAL-01501 |
| `DEFER-T8` | 5 | TAL-01480, TAL-01488, TAL-01489, TAL-01496, TAL-01497 |
| `RETEST-CONFIRM` | 1 | TAL-01483 |
| `NEEDS-TESTER-CLARIFICATION` | 1 | TAL-01440 |
| `OUT-OF-SCOPE-FEATURE` | 1 | TAL-01482 |
| `OUT-OF-SCOPE-RC4` | 1 | TAL-01536 |

**T3 fix candidates if retest fails:** 10 `LIKELY-SURVIVES` rows (interaction-parity contract + harness + gated fix).  
**T8 queue if retest fails:** 5 `DEFER-T8` rows (mirror-frame policy table — never guard #21 per I11).  
**Retest may close without new work:** 5 `LIKELY-FIXED-b105` + 1 `RETEST-CONFIRM`.

---

## DEFER-T8 summary

| Ticket | Reason |
| --- | --- |
| TAL-01480 | Same-symbol re-render / replay jump / misalignment — mirror-frame adoption |
| TAL-01488 | Ctrl+R during replay — viewport/playhead re-application |
| TAL-01489 | Tap/layout-switch glitch during replay — frame timing on peers |
| TAL-01496 | Data-range sync click glitches — adopt-X policy |
| TAL-01497 | Price freeze on layout switch during replay — peer playback mirror |

---

## Worker confirmation

- **No engine files edited.** No changes under `chart v 1.4/chart/`, `homepage/public/chart/`, bridges, or `multichart-prod/` runtime code.
- **Legacy `chart v 1.4/chart/multichart/` dev-shell not touched** (L2).
- **Docs only:** `T3-RETEST-CHECKLIST.md` + this report.

---

## Next step

PO/tester executes the checklist on b105+, records `PASS` / `FAIL` / `SKIP` per row. Surviving failures enter T3 steps 1–3; `DEFER-T8` failures queue for T8.
