# WORKER PROMPT — T3 step 0 (Lane 2): Multichart retest-triage PREPARATION

> Hand this whole file to the Lane 2 (panel) worker. **This step produces a tester checklist — no fixes.** The tester (PO) executes the retests afterward.

---

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T3 step 0**, Lane 2 (T3→T8). This is the mandatory **retest-first triage** that runs before any T3 diagnostic or fix.

## READ FIRST (binding)
- `docs/tickets-overhaul/README.md`
- `docs/tickets-overhaul/ROOT-CAUSES.md` — **RC-4** (your RC).
- `docs/tickets-overhaul/INVARIANTS.md` — binding; key ones below.
- `docs/tickets-overhaul/TRACKS.md` — **T3**, and the **Lane-2 standing rule** (guard tail is frozen; mirror-frame-policy mechanisms defer to T8, never a new guard — I11).

## BINDING INVARIANTS
- **I1** — discharges **RC-4** (panel interaction parity).
- **I11 — the mirror-frame guard tail is FROZEN.** If, while writing repro steps, you notice a defect whose mechanism is replay mirror-frame application (which parts of data/X/Y a panel adopts), tag it **DEFER-T8** in the checklist — it is NOT a T3 fix and must never become guard #21.
- **L1 — build id confirmed on every frame before any verdict.** Your checklist MUST make the tester confirm the build id (`20260707b105` or later) on the host AND every panel before recording any pass/fail. This is step 0 of every row. (Plan-1's single biggest time sink was stale open tabs producing false "fix didn't work" reports.)
- **L2 — production trees only.** Do not reference or edit the legacy `chart v 1.4/chart/multichart/` dev-shell; production is `multichart-prod/`.
- **P2 Timebox** — one session.

## TASK (produce a tester checklist — no code fixes)
Plan 1 closed on build `20260707b105` **after** the July-4 multichart batch (TAL-01480…01502) was filed. Several of these are likely already fixed as side effects of the b102–b105 boot-commit work. Your job is to prepare the retest so the tester can disposition each ticket efficiently.

1. **Extract the multichart subset** from `docs/tickets-overhaul/TICKET-REGISTRY.csv` (cluster = Multichart / Layouts; include the July-4 batch TAL-01480…01502 and any older multichart rows). Pull the tester's original symptom from `support tickets history/tickets_normalized.json` (translate Arabic).
2. For **each ticket**, write an **exact, deterministic repro script** the tester can follow: starting layout, symbols/timeframes per panel, sync settings, replay state, and the precise gesture sequence, ending with the **observable pass/fail criterion**.
3. Attach a **hypothesis tag** per ticket:
   - `LIKELY-FIXED-b105` — strongest candidates: TAL-01480 (re-render on same symbol), TAL-01502 (first-boot price mismatch); plausibly TAL-01484/01490 (repaint-only-on-click) via the boot/settle work.
   - `LIKELY-SURVIVES` — interaction-layer, untouched by plan 1: TAL-01495 (drawing lands on wrong panel), TAL-01498 (Ctrl-select on 2nd chart), TAL-01499 (Quick Menu on panel), TAL-01500/01501 (indicator state leaks across layouts), TAL-01491 (drag stops at frame box).
   - `DEFER-T8` — if the mechanism smells like mirror-frame application policy (per I11).
4. Produce the output as `docs/tickets-overhaul/T3-RETEST-CHECKLIST.md`: one section per ticket with the repro script, hypothesis tag, and a blank result field (`RESULT: __ / build id confirmed: __`).
5. Prepend the checklist with the **build-id confirmation procedure** (L1): how to read `__TALARIA_CHART_BUILD_ID` on host + each panel frame, expected value `20260707b105`+, and the instruction to clean-reload (unregister SW / clear site data / reload twice) if any frame is stale.

## RC / FAMILY / ROWS
- **RC:** RC-4 | **Family:** multichart-parity | **Registry rows:** the multichart subset (enumerated by this task).

## KILL-SWITCH
- N/A (checklist preparation). T3 fix steps (1–3) for surviving rows will each get their own `__TALARIA_*` flag.

## DELIVER (report back to the PO as a `.md`)
1. `T3-RETEST-CHECKLIST.md` with the build-id procedure + one repro section per multichart ticket + hypothesis tags.
2. A summary table: ticket → hypothesis tag → one-line criterion.
3. Any ticket you tagged `DEFER-T8`, with the one-line reason (do not design a fix).
4. Explicit confirmation: no engine files edited; legacy `multichart/` not touched (L2).

## STOP CONDITIONS
If a ticket's original body is too ambiguous to script a deterministic repro, mark it `NEEDS-TESTER-CLARIFICATION` with the specific question rather than guessing. If you find yourself wanting to fix something, STOP — this step only prepares the retest.
