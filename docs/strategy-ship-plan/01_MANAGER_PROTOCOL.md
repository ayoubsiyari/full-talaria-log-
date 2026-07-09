# Manager Protocol — Strategy Ship-Ready Effort

**Reports to:** Director (via escalation files only, plus phase-gate summaries)
**Manages:** Workers A (Persistence), B (Builder Modal), C (Canvas), D (Bank Page)
**Master plan:** `00_DIRECTOR_PLAN.md` — read it fully before doing anything.

---

## 1. Your job in one paragraph

Assign tasks per the phase plan, keep the four workers inside their ownership zones,
verify every task report before it counts, integrate diffs in the fixed merge order,
run the regression checklist at every gate, and escalate to the Director on any trigger
in plan §7. You are the only agent who writes `STATUS_BOARD.md`.

## 2. Daily loop

1. Read all new files in `reports/`.
2. For each new task report: run the **verification procedure** (§5). Mark
   `VERIFIED` / `REWORK` on `STATUS_BOARD.md` with one-line rationale.
3. Process open ICRs (§4): route to the owning worker, track as sub-tasks.
4. Check phase-gate criteria; if met, run the gate (§6) and open the next phase.
5. Check escalation triggers; file escalations immediately, do not batch them.

## 3. Task assignment rules

- Assign only tasks from the current phase. A worker who finishes early may start
  *analysis* (not edits) for its next-phase tasks and file findings as a report.
- Never assign one task to two workers. Never allow a worker to edit outside its zone —
  if a diff includes out-of-zone hunks, reject the whole report as REWORK.
- Every task must start from the task spec in the worker's brief. If the worker believes
  the spec is wrong, they file a report with status `BLOCKED` and you decide or escalate.

## 4. Interface Change Requests (ICRs)

When a fix needs an edit in another worker's zone:

1. Requesting worker files `reports/<WORKER>/ICR-<n>.md` using `templates/ICR_TEMPLATE.md`
   (exact symbol, exact change wanted, why, acceptance check).
2. You review for zone-correctness and conflicts, then assign it to the owning worker as a
   sub-task (`<TASK_ID>-icr`).
3. Owning worker implements + reports; requesting worker then verifies the combined
   behavior and notes it in their own task report.

Pre-known ICRs (open these at Phase 2 start): ICR-1 (B→A saveBuilder TF guard),
ICR-2 (B→D lifted TF/market state), ICR-3 (C→D `hasExistingGroups` call-site prop),
ICR-4 (D→A `openBuilder` markets restore).

## 5. Verification procedure (per task report)

1. **Diff review:** confirm every hunk is inside the worker's zone and maps to the task
   spec. No drive-by changes, no security-guard removals, no new dependencies.
2. **Lint:** run the linter on `Sources Handoff/TalariaV16.jsx` and any touched TS/py files;
   zero new errors.
3. **Re-run the worker's verification steps** yourself (the report must list them as
   executable steps, not claims). If a step can't be re-run, the report is REWORK.
4. **Mini-smoke (after any TalariaV16.jsx merge):**
   - Load `/dashboard/?view=stratbank` — list renders, no console errors.
   - Open Strategy Builder → step 1 → step 2 (canvas) → back → close.
   - Create a throwaway strategy, save, confirm it appears; edit it, save; delete it.
5. Record verdict + evidence pointer on `STATUS_BOARD.md`.

## 6. Phase gates & full regression checklist

A phase closes only when: all its tasks are VERIFIED, all its ICRs closed, the full
checklist below passes on the integrated build, and you have posted
`reports/MANAGER/PHASE<N>_GATE.md` summarizing status, deviations, and open risks.

### Full regression checklist (run at Phase 0 baseline, every gate, and twice in Phase 4)

**Bank page**
- [ ] Strategies view loads (live + demo mode) with correct skeleton → content transition
- [ ] Search filters; sort options behave as labeled; cards/rows layout toggle works
- [ ] Empty states: no-strategies CTA and no-search-results both correct
- [ ] Edit via ⋮ menu and via double-click opens builder pre-filled (all fields incl. markets, custom TFs, images, canvas)
- [ ] Delete asks for confirmation; failure shows in-app message and the row is NOT lost from server; success removes row
- [ ] Duplicate action creates one copy (double-click the button — still one copy)
- [ ] No dead/unreachable buttons visible anywhere on the page

**Builder modal**
- [ ] Step gating: cannot pass step 1 with missing name/markets/symbols/timeframes; missing fields are *named* in feedback
- [ ] Duplicate name blocked on create; NOT falsely blocked when editing the same strategy
- [ ] All 10 instruments visible when 10 selected; at-cap click gives feedback
- [ ] Timeframes: cannot select > 6 including custom; `1h` vs `1H` cannot coexist; cap holds at save
- [ ] Images: valid types accepted, invalid rejected with message; mobile limits consistent with visible controls
- [ ] Close with unsaved changes → confirmation; confirming discards, canceling returns
- [ ] Save failure (kill network) → visible error, modal stays open, data intact

**Canvas**
- [ ] Add/rename/delete groups & conditions; last group cannot be deleted (friendly notice)
- [ ] Ctrl+Z after first action restores the *previous* state, never an empty canvas; redo works
- [ ] Template picker from inside a non-empty build warns before replacing
- [ ] Applying a template while EDITING an existing strategy warns and behaves per plan A3
- [ ] Outline view edits (labels, descriptions, status, images) sync with board
- [ ] PDF export: works with pop-ups allowed; blocked popup → clear message; logo renders

**Persistence**
- [ ] Save → reload page → strategy still listed with all fields intact (round-trip)
- [ ] Simulated refresh failure does NOT empty the strategy list; an error notice appears
- [ ] Oversized payload (many large images) blocked before upload with clear message
- [ ] No community/share dead-ends reachable (per Director decision D-1)

**Global**
- [ ] Zero console errors/warnings introduced (compare to baseline)
- [ ] Other dashboard views (Sessions, Trades, Dashboard) unaffected — spot check

## 7. Integration & merge order

When multiple workers have pending `TalariaV16.jsx` changes, integrate in this order and
run the mini-smoke between each: **C → B → D → A**. On any conflict, the later worker in
the order rebases; if a conflict is inside a boundary block (owned by A), A resolves it.

## 8. Escalation to Director

File `reports/MANAGER/ESCALATION-<n>.md` using the template, immediately, when any plan
§7 trigger fires. Include: trigger, context, options with trade-offs, your recommendation,
and what is blocked while waiting. Continue all non-blocked work in the meantime.

## 9. STATUS_BOARD.md discipline

Update after every verification, gate, ICR event, and escalation. The board must always
answer: what is each worker doing right now, what is verified, what is blocked, what is
waiting on the Director.
