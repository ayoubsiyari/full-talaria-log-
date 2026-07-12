# WORKER PROMPT — T0 (Lane 4): Per-bug registry + interactive harness scaffolding

> Hand this whole file to the Lane 4 worker. It is self-contained.

---

## ROLE
You are a worker on the Talaria **tickets-overhaul (Plan 2)**, task **T0**, Lane 4. You start first; the other lanes consume your output.

## READ FIRST (binding)
- `docs/tickets-overhaul/README.md`
- `docs/tickets-overhaul/ROOT-CAUSES.md` — focus on **RC-7** (your RC).
- `docs/tickets-overhaul/INVARIANTS.md` — binding; the key ones are reproduced below.
- `docs/tickets-overhaul/TRACKS.md` — your task is **T0**.

## BINDING INVARIANTS (do not route around; if you cannot satisfy one, STOP and report)
- **I1 Root-cause routing** — this task discharges **RC-7**.
- **I2 RED first** — your 2 proof scenarios must be deterministically RED on b105 (the bugs are real and unfixed).
- **I8 Both engine/harness trees byte-identical** — any harness file you add/edit under `chart v 1.4/chart/multichart-prod/harness/` must be mirrored byte-identical to `homepage/public/chart/multichart-prod/harness/`. Report SHA256 of each pair.
- **I9 Preserve the plan-1 green gate** — the existing 29 scenarios must still pass. Your 2 new RED scenarios are added as **tracked known-failing** (they represent open bugs), so `npm run gate` stays GREEN. Do NOT change any existing scenario's assertions.
- **I10 Security rules stand** — no weakening of `.cursor/rules/security-and-supply-chain.mdc`; no new dependencies without Manager approval + registry verification.
- **P1 No self-certification** — deliverable = artifacts + evidence; the Manager re-runs your verification.
- **P2 Timebox** — one session. If the per-bug split of the long threads can't complete in the session, deliver the long threads (listed below) fully hand-read and the rest by the default rule, and report the boundary.

## TASK (one deliverable set, no fixes)
### Deliverable 1 — Per-bug registry
Split every thread into **one row per distinct bug** (not per ticket). Ticket threads are multi-bug (e.g. TAL-00157 ≈ 20 bugs).
- **Source of bodies:** `support tickets history/tickets_normalized.json` (one record per ticket, message bodies inlined). Cluster/status columns: `docs/tickets-overhaul/TICKET-REGISTRY.csv`.
- **Output file:** create `docs/tickets-overhaul/PER-BUG-REGISTRY.csv` with columns:
  `bug_ref` (e.g. `TAL-00752#3`), `ticket_ref`, `cluster`, `symptom_family` (use the families from `TICKET-ANALYSIS.md` §3), `rc_guess` (RC-1…RC-8), `status` (open / user_replied / resolved / pending), `tester_quote` (short, English), `notes`.
- **Hand-read these long threads bug-by-bug** (do not auto-split): TAL-00157, TAL-00322, TAL-00323, TAL-00752, TAL-00117, TAL-00228, TAL-00245, TAL-00350, TAL-00271. Short threads default to one-bug-per-thread.
- **Arabic bodies must be translated** into the English `tester_quote`/`notes`.
- Symptom families to use as the controlled vocabulary: first-click-fails, stuck-until-click, ghost-after-delete, selection-menu-desync, label-mis-anchor, drag-mis-anchor, visibility-toggle, quick-menu-defect, slow-interaction, replay-interaction, multichart-parity, order-entry, indicator-lifecycle.

### Deliverable 2 — Interactive harness scaffolding
Extend `chart v 1.4/chart/multichart-prod/harness/` (mirror to homepage tree). Add **page-object helpers** for interactive flows:
`placeTool(toolType, points[])`, `selectTool(ref)`, `openSettings(ref)`, `deleteTool(ref)`, `assertCanvasRepainted()`, `assertMenuState(expected)`, `assertNoGhostAfterDelete(ref)`.
- Reuse existing harness plumbing (`harness-lib.mjs`, `run.mjs`, `scenarios.mjs`, `serve.mjs` synthetic data). Do not fork a new harness.

### Deliverable 3 — Two RED proof scenarios (prove the plumbing on real tickets)
1. **`first-click-fails`** (TAL-00322 family): place a tool, single-click it once, assert selection/menu transition happened on the **first** click. Must be **RED** on b105 (first click currently no-ops).
2. **`ghost-after-delete`** (TAL-00157 family): place a tool, open its settings, delete it, assert no residual label/settings-dialog/observer remains. Must be **RED** on b105 (ghost artifacts remain).
- Register both in `scenarioList()` and add to `known-failing.json` as tracked-red (so the gate stays GREEN). Give them stable IDs continuing the H-S series (next free ids after H-S31, e.g. **H-S32**, **H-S33**) — confirm the next free ids from `scenarios.mjs` before assigning.

## RC / FAMILY / ROWS
- **RC:** RC-7 | **Symptom families seeded:** first-click-fails, ghost-after-delete | **Registry rows:** produced by this task (all).

## KILL-SWITCH
- N/A — T0 is scaffolding + data, not a behavior fix. No `__TALARIA_*` flag. (The RED scenarios have no fix yet; that is expected.)

## RED-FIRST EVIDENCE REQUIRED
- Run each new scenario and capture the RED output (assertion + values). Run `npm run gate` and show it still exits GREEN with the 2 new scenarios tracked as known-failing (count 29 → 31 tracked, 0 regressions).

## DELIVER (report back to the PO as a `.md`)
1. `PER-BUG-REGISTRY.csv` — row count, breakdown by RC guess and by symptom family, and the count of hand-read vs auto-split threads.
2. Harness helper diff + the 2 new scenario definitions.
3. RED evidence for H-S32/H-S33 (flake-stable ×3 each) + `npm run gate` GREEN output.
4. SHA256 of every harness file pair (canonical ↔ homepage) proving byte-identical (I8).
5. `node --check` clean on edited `.mjs`; lints clean.
6. Explicit statement: no existing scenario assertion changed (I9); no security/dependency change (I10).

## STOP CONDITIONS
Premise wrong, an invariant conflict, a scenario that cannot be made deterministically RED, or the registry split ambiguous for a thread → STOP and report to the Manager (do not improvise or force a green).
