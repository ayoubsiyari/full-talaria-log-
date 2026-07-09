# Director Plan — Strategies Page & Strategy Builder: Ship-Ready

**Author:** Director agent
**Date:** 2026-07-08
**Audience:** Manager agent (this document is your mission brief)
**Status:** ACTIVE — awaiting Phase 0 kickoff

---

## 1. Mission

Make the Strategies page (Strategy Bank, `sessView === "stratbank"`) and the Strategy Builder
(multi-step modal + canvas flow editor) **ship-ready**: no data loss, no dead buttons, no
misleading UI, no silent failures. Work is based on the completed read-only audit
(2026-07-08); all findings referenced by ID below.

**Definition of ship-ready (acceptance bar):**

1. No user action can silently lose saved or in-progress work.
2. Every visible button/control does what its label says, or is removed/hidden.
3. Every failure (network, server, validation) produces a visible, in-app message.
4. All caps/limits are enforced consistently in UI, at save time, and against backend limits.
5. The full happy path (create → build flow → save → edit → re-save → delete) passes the
   regression checklist in `01_MANAGER_PROTOCOL.md` §6 twice in a row with zero console errors.

---

## 2. Ground rules (non-negotiable)

- **All coordination artifacts are `.md` files** inside `docs/strategy-ship-plan/`.
  No other channels count as the record.
- **Security guardrails stay intact.** Never remove/weaken `@jwt_required`, CSRF, redirect
  checks, rate limits, or webhook verification to make something pass
  (per `.cursor/rules/security-and-supply-chain.mdc`). No new dependencies without exact
  registry-name verification; prefer zero new dependencies for this effort.
- **No worker edits outside its ownership zone** (§4). Cross-zone needs go through the
  manager as an Interface Change Request (ICR — see `01_MANAGER_PROTOCOL.md` §4).
- **Workers report after every task** using `templates/TASK_REPORT_TEMPLATE.md`, saved to
  `docs/strategy-ship-plan/reports/<WORKER>/<TASK_ID>.md`. Manager verifies before the task
  counts as done.
- **Manager escalates to the Director** using `templates/ESCALATION_TEMPLATE.md` when any
  trigger in §7 fires. Do not guess on escalation-class decisions.
- Behavior-preserving refactors only where a fix requires them. This is a stabilization
  effort, not a rewrite of `TalariaV16.jsx`.

---

## 3. Codebase map (shared context for everyone)

The entire dashboard is one component file:

- `Sources Handoff/TalariaV16.jsx` (~58,847 lines) — the Strategies page renders when
  internal state `sessView === "stratbank"`.

Supporting files:

| Area | File |
|---|---|
| Live boot / API globals | `homepage/src/app/dashboard/v16/useV16LiveBootstrap.ts` |
| Strategy REST client | `homepage/src/app/dashboard/v16/v16StrategyApi.ts` |
| Community REST client | `homepage/src/app/dashboard/v16/v16CommunityApi.ts` |
| Journal mappers | `homepage/src/app/dashboard/v16/v16JournalMappers.ts` |
| Strategy lab helpers | `homepage/src/app/dashboard/strategies/**` (mappers, auth, lib/*) |
| Backend strategy routes | `journal-backend/routes/strategy_routes.py` |
| Backend community routes | `journal-backend/routes/template_routes.py` |
| Backend limits | `journal-backend/config.py` (16 MB `MAX_CONTENT_LENGTH`), `journal-backend/schemas/strategy_lab.py` |

Key landmarks inside `TalariaV16.jsx` (line numbers as of audit date — re-verify before
editing; they will drift as edits land):

| Lines (approx) | Content |
|---|---|
| 40–100 | Boot bank helpers: `getV16StrategyBank`, `mergeV16StrategyBankRows`, `strategyRowKey`, `parseStratApiId` |
| 392–430 | Timeframe/custom-TF parsing, `normalizeStrategyBankNameKey`, `findStrategyBankNameDuplicate` |
| 1524–3134 | Canvas node components (group ~1524–2460, condition ~2461–3012), label helpers, viewport clamp, `MIN_STRATEGY_FLOW_GROUPS` |
| 3135–4049 | `STRATEGY_TEMPLATES` data + `TemplatePickerModal` |
| 4050–5680 | `StrategyCanvasWorkspaceInner` (board, outline, PDF export, toolbar, footer) |
| 5680–6245 | Image validation/compression helpers, payload estimation |
| 6246–8127 | `GeneralInfoStepContent` (step-1 form: name, emoji, desc, markets, instruments, timeframes, tags, images) |
| 8128–8421 | `StrategyBuilderModal` (step navigation, gating, save button, error boundary) |
| 11720–11970 | Strategy-related state declarations (myStrategies, savedCommunity*, stratB* state, refresh effects) |
| 15179–15260 | Left-nav wiring for `stratbank` |
| 45400–46015 | Strategy Bank page: sources, filters, sorts, skeletons, cards/rows renderers |
| 46016–46392 | Builder lifecycle handlers: `resetStrategyBuilderForm`, `fillStrategyBuilderFromTemplate`, `openBuilder`, `copyStrategyIntoBank`, `deleteStrategyFromBank`/`runDelete`, `saveBuilder` |
| 46393–46930 | Tab bar, list render, action menus, share modal, `TemplatePickerModal` + `StrategyBuilderModal` instantiation |

---

## 4. Ownership zones (the anti-conflict contract)

Four workers run **in parallel**. Conflicts are prevented by exclusive write-ownership.
A worker may READ anything, but may WRITE only inside its zone.

| Worker | Codename | Writes allowed in |
|---|---|---|
| **A** | Persistence & Lifecycle | `TalariaV16.jsx` lines **1–1523** and **46016–46392**; all files under `homepage/src/app/dashboard/v16/`; `homepage/src/app/dashboard/strategies/**`; `journal-backend/**` (strategy/template routes + schemas only) |
| **B** | Builder Modal | `TalariaV16.jsx` lines **5680–8421** |
| **C** | Canvas & Templates | `TalariaV16.jsx` lines **1524–5679** |
| **D** | Bank Page & UI Surface | `TalariaV16.jsx` lines **8422–46015** (only the strategy-related blocks listed in its brief) and **46393–46930** |

Rules that make this work:

1. **Line numbers drift.** Zones are defined by the *named symbols* listed in each worker
   brief, not raw numbers. Each worker re-locates its symbols before editing and records
   the current line ranges in its report.
2. **Boundary blocks:** `fillStrategyBuilderFromTemplate`, `saveBuilder`, `runDelete`, and
   `openBuilder` are owned by **A** even though the Bank page (D) and Modal (B) call them.
   B/C/D request changes to these via ICR.
3. **Shared state declarations** (~11720–11970) are owned by **D**. If A/B/C need a new
   piece of parent state (e.g., lifting `sbTfCustom`), they file an ICR; D adds the state
   and the prop plumbing at the instantiation site; the requester consumes it in their zone.
4. **Merge order** when the manager integrates concurrent edits to `TalariaV16.jsx`:
   C → B → D → A (bottom-of-file owner last is wrong — A owns both top and mid-file blocks;
   the manager rebases each worker's diff in this order and re-runs the smoke check between
   each). If workers operate in a shared working tree instead of separate branches, the
   manager serializes their *commits* in this order per phase.

---

## 5. Work plan — phases and tasks

Findings carry the audit IDs. Severity: 🔴 critical, 🟠 high, 🟡 medium, ⚪ polish.
Full per-task specs (symptoms, exact symbols, acceptance criteria, verification steps)
are in each worker brief (`workers/WORKER_*.md`). This section is the dependency map.

### Phase 0 — Setup (Manager, ~half day)

- M0.1 Create `STATUS_BOARD.md` from the skeleton; verify all workers can read/write their briefs and the reports folder.
- M0.2 Record a baseline: run the app, walk the regression checklist (§6 of manager protocol), and file `reports/MANAGER/BASELINE.md` documenting current broken behavior (so "fixed" is provable).
- M0.3 Confirm Director decisions D-1 and D-2 (§7). **Do not start Phase 2 D-tasks without D-1 resolved.**

### Phase 1 — Critical data-loss fixes (all four workers in parallel)

| Task | Worker | Finding | Summary |
|---|---|---|---|
| A1 | A | 🔴 merge-drop | Failed/empty bank refresh must not vanish persisted strategies; distinguish "fetch failed" from "bank is truly empty"; surface an error state flag |
| A2 | A | 🔴 optimistic delete | Delete becomes pessimistic (or rolls back); replace `window.alert` with in-app notice; refresh failures surfaced |
| A3 | A | 🔴 template-wipes-edit | `fillStrategyBuilderFromTemplate` must confirm before discarding an active edit session, and must not silently null `stratEditId` |
| C1 | C | 🔴 undo-to-empty | Seed undo history with the mounted canvas; extend history push to add/delete group/condition, rename, template load |
| B1 | B | 🟠 close-loses-work | Dirty-check + confirm dialog on modal close/cancel |
| D1 | D | 🟠 dead share surface | Execute Director decision D-1 (default: cleanly remove/flag the unreachable Share modal, hidden action bar, dead `StrategyRowAction`, ephemeral `saveCommunity`) |

Phase 1 gate: manager verifies all six reports + reruns regression checklist. Escalate any failure.

### Phase 2 — High-severity correctness (parallel)

| Task | Worker | Finding | Summary |
|---|---|---|---|
| A4 | A | 🟠 payload | Pre-save payload budget check vs backend 16 MB; block with clear message before upload; improve estimator accuracy |
| A5 | A | 🟠 root conditions | Sync canvas conditions into `strategy_definition.conditions` at save; load `tree` back on edit |
| A6 | A | 🟠 silent fetch fail | Bank fetch non-OK → error surfaced to Strategies page (works with A1's flag) |
| B2 | B | 🟠 timeframe cap | Enforce 6-TF cap at save-gating level; normalize `1h`/`1H` case; ICR to A for the `saveBuilder` guard line |
| B3 | B | 🟠 instrument grids | Fix clipped symbol grids (show all 10); add at-cap feedback message |
| B4 | B | 🟠 edit restoration | Restore custom timeframes on edit; persist manual-market intent across step navigation (ICR to D for lifted state) |
| C2 | C | 🟠 template overwrite | `hasExistingGroups` computed from real canvas (sections OR conditions); "Create Your Own" respects confirm; ICR to D for call-site prop at instantiation |
| D2 | D | 🟠 edit markets | Coordinate with A: `openBuilder` must prefer saved `markets` over derived (implementation lands in A's zone via ICR; D verifies UI) |

### Phase 3 — Medium & polish (parallel)

| Task | Worker | Summary |
|---|---|---|
| A7 | A | Align duplicate-name check with `normalizeStrategyBankNameKey`; (optional, per D-3) backend name-uniqueness per user |
| B5 | B | Required-field messages rendered (not border-only); mobile cover add-tile limit consistency; per-tag length cap |
| C3 | C | Group-delete notice styling (stop reusing image-error toast); outline status menu outside-click dismiss; board image validation parity with outline; execute Director decision D-2 on edge-connect handles |
| C4 | C | PDF print: avoid popup flash when name missing (validate before opening popup) |
| D3 | D | Sort menu: remove/disable misleading options on My Strategies; sort the Saved list; separate sort-dropdown state from Sessions page; demo-mode badge count |
| D4 | D | Remove remaining dead code in zone: unused `stratStyleFilter`, hidden "Use Strategy" buttons, unused aliases (only what D-1 didn't already cover) |

### Phase 4 — Integration, regression, sign-off (Manager + all workers)

- M4.1 Manager integrates final diffs in merge order (§4.4), reruns lints, reruns full regression checklist **twice**.
- M4.2 Each worker runs the cross-cutting verification in its brief §5 against the integrated build and files a final `PHASE4_VERIFY.md` report.
- M4.3 Manager compiles `FINAL_SHIP_REPORT.md`: findings→fix mapping, verification evidence, known remaining issues (if any), and requests Director sign-off.

---

## 6. Dependencies & sequencing summary

```
Phase 0 (M) ──► Phase 1 (A1,A2,A3 ∥ B1 ∥ C1 ∥ D1) ──► gate ──►
Phase 2 (A4,A5,A6 ∥ B2,B3,B4 ∥ C2 ∥ D2) ──► gate ──►
Phase 3 (A7 ∥ B5 ∥ C3,C4 ∥ D3,D4) ──► Phase 4 (integrate, verify, sign-off)
```

ICRs that are already known (manager should pre-open these):

- **ICR-1** (B→A): one guard clause in `saveBuilder` for the timeframe cap (B2).
- **ICR-2** (B→D): lift `sbTfCustom` + `marketsManualFilter` into parent state + props (B4).
- **ICR-3** (C→D): call-site prop `hasExistingGroups={...}` at `TemplatePickerModal` instantiation (C2).
- **ICR-4** (D→A): `openBuilder` markets-restoration change (D2).

---

## 7. Director decisions (escalation anchors)

The manager MUST NOT let workers improvise on these. Defaults apply only if the Director
does not answer within the phase window.

| ID | Decision | Options | Director default |
|---|---|---|---|
| **D-1** | Community/Share feature fate | (a) strip/flag all dead community-share surface for this release; (b) finish the feature (share entry point, persisted bookmarks, author unpublish, publish dedupe) | **(a) strip/flag.** Finishing community is a separate project; shipping dangling UI fails the acceptance bar |
| **D-2** | Canvas edge drag-connect (no `<Handle>`s) | (a) accept that connectors are the AND/OR/OFF buttons and remove dead `onConnect`/edge plumbing from user reach; (b) implement handles | **(a).** The in-section connector UX already works; adding handles is new feature work |
| **D-3** | Backend name-uniqueness constraint | (a) client-only alignment; (b) add server-side per-user uniqueness (migration risk) | **(a)** for this release; log (b) as follow-up |

**Mandatory escalation triggers** (manager → Director via `templates/ESCALATION_TEMPLATE.md`):

1. Any fix that requires touching auth, security middleware, or payload/security limits beyond what a task spec says.
2. Any worker needing to write outside its zone where an ICR can't cleanly resolve it.
3. Any regression-checklist item that a fix breaks and can't be resolved within one rework cycle.
4. Discovery of a new critical-severity bug not in this plan.
5. Any proposal to add a dependency, run a DB migration, or change API contracts.
6. Schedule slip: any phase exceeding 2× its estimate.

---

## 8. Reporting & verification (summary — full protocol in 01_MANAGER_PROTOCOL.md)

- Worker completes task → writes `reports/<WORKER>/<TASK_ID>.md` (template provided) with:
  what changed (symbols + new line ranges), why, verification evidence (steps actually run
  + results), risks, and any ICRs raised.
- Manager verifies each report **before** marking the task done on `STATUS_BOARD.md`:
  reads the diff, re-runs the task's verification steps, runs the mini-smoke check.
- Manager updates `STATUS_BOARD.md` after every verification and posts a phase summary
  at each gate.
- Director reviews at phase gates and on escalation only.

---

## 9. File manifest for this plan

```
docs/strategy-ship-plan/
├── 00_DIRECTOR_PLAN.md            ← this file
├── 01_MANAGER_PROTOCOL.md         ← manager operating manual, gates, regression checklist
├── STATUS_BOARD.md                ← live status (manager-maintained)
├── workers/
│   ├── WORKER_A_PERSISTENCE.md
│   ├── WORKER_B_BUILDER.md
│   ├── WORKER_C_CANVAS.md
│   └── WORKER_D_BANK.md
├── templates/
│   ├── TASK_REPORT_TEMPLATE.md
│   ├── ICR_TEMPLATE.md
│   └── ESCALATION_TEMPLATE.md
└── reports/                       ← created by workers/manager as work lands
    └── MANAGER/BASELINE.md (first artifact)
```
