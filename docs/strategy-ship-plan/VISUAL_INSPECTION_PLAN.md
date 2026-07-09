# Visual Inspection Plan — Strategies Page & Strategy Builder (Director Acceptance)

**Inspector:** Director (manual, in-browser)
**Reports to:** Manager (findings filed per §6; Manager dispatches fixes per §7)
**Purpose:** final human acceptance pass over everything the four-phase effort fixed,
plus general UX sanity. Passing this inspection closes the "PHASE 4 GATE / SHIP" and
"M4.3 final ship report" rows on `STATUS_BOARD.md`.

---

## 1. Before you start

- Test in **live mode** (real backend) — that's where persistence fixes matter. Demo mode
  items are marked `[demo]`.
- Open DevTools Console and keep it visible the entire session. Any red error at any step
  is automatically a finding (route: Manager triage).
- You will simulate failures twice (delete + refresh) using DevTools → Network → Offline.
- Known, accepted, **do not re-report**:
  - **ICR-8:** undo/redo may desync after applying a template from the modal header while
    the canvas is mounted (guarded by the Replace confirm).
  - Community/share features absent — intentional (`COMMUNITY_ENABLED=false`).
- Fill the ✅/❌ column inline in this file as you go, with a short note on every ❌.

**Severity to assign each ❌:** `S1` data loss / broken flow · `S2` wrong behavior ·
`S3` misleading UI / feedback gap · `S4` cosmetic.

---

## 2. Section A — Strategy Bank page (owner: Worker D unless noted)

Go to `/dashboard/?view=stratbank`.

| # | Check | Expect | Pass | Notes |
|---|---|---|---|---|
| A-1 | Page load | Skeleton → list transition, no flicker/error; tab badge equals your real strategy count (not templates) | ☐ | |
| A-2 | `[demo]` Demo mode load | Template previews visible but badge counts real rows only | ☐ | |
| A-3 | Search | Filters as you type; clearing restores; "no results" state correct | ☐ | |
| A-4 | Sort menu | Only **Name** and **Net P&L** offered; both directions work; opening it does NOT affect the Sessions page sort (check Sessions after) | ☐ | |
| A-5 | Cards ⇄ Rows layout toggle | Both render all strategies; actions available in both | ☐ | |
| A-6 | Empty state (if reachable: filter to nothing) | Correct message + working "Build Strategy" CTA | ☐ | |
| A-7 | Community absence crawl | Click EVERY visible control on the page (cards, rows, ⋮ menus, empty states, both layouts): zero share/community/save-bookmark dead-ends | ☐ | |
| A-8 | ⋮ menu on own strategy | Edit / Duplicate / New Session / Delete all present and act as labeled | ☐ | |
| A-9 | Duplicate | Exactly ONE copy appears; rapid double-click still one copy (owner: A) | ☐ | |
| A-10 | Template preview action | Says **Hide** (not Delete); hiding works | ☐ | |
| A-11 | Delete happy path | Confirmation dialog → confirm → row gone; reload page → still gone (owner: A) | ☐ | |
| A-12 | **Delete offline** | DevTools Offline → delete → row STAYS + in-app error (no browser alert); back online → delete works (owner: A) | ☐ | |
| A-13 | **Refresh failure** | Offline → trigger a bank refresh (navigate away/back) → list does NOT empty; an error/stale notice appears; online → recovers (owner: A) | ☐ | |
| A-14 | Backtest metrics on cards | Strategies linked to sessions show plausible metrics; unlinked show em-dash/neutral, not fake zeros | ☐ | |

## 3. Section B — Strategy Builder modal, step 1 (owner: Worker B)

Open "Build Strategy" → if the template picker appears, choose blank/Create Your Own.

| # | Check | Expect | Pass | Notes |
|---|---|---|---|---|
| B-1 | Required-field gating | Click Next with empty form → blocked AND the missing field **names** are shown (not just red borders) | ☐ | |
| B-2 | Name limits | 80-char cap; duplicate of an existing name blocked with message; case/punctuation variant of an existing name (`My-Strat` vs `my strat`) also blocked (owner: A) | ☐ | |
| B-3 | Description | 500 cap, live counter, counter turns warning color near cap | ☐ | |
| B-4 | Emoji picker | Opens, selects, clears; closes on outside click | ☐ | |
| B-5 | Traded symbols ×10 | Add 10 → ALL 10 visible (wrap/scroll, nothing clipped); 11th click → "Max 10 symbols" feedback | ☐ | |
| B-6 | Support symbols ×10 | Same as B-5 | ☐ | |
| B-7 | Markets auto-derive | Adding symbols derives markets; manually changing markets sticks (not overwritten when you touch symbols after) | ☐ | |
| B-8 | Timeframes cap | Cannot exceed 6; attempt → feedback; select-all respects cap | ☐ | |
| B-9 | Custom timeframe | Add e.g. `90m` → appears, counts toward 6, deletable; garbage input rejected | ☐ | |
| B-10 | TF case dedupe | With a template's `1h` loaded, `1H` cannot coexist as a duplicate | ☐ | |
| B-11 | Tags | Add/remove; 10-tag cap; single tag length capped (~28 chars) | ☐ | |
| B-12 | Cover images | Valid JPEG/PNG/WebP accepted; invalid type rejected WITH message; desktop cap 6 / mobile cap 4 and the Add tile disappears AT the cap | ☐ | |
| B-13 | Style selector | Confirm product intent: currently hidden (`false &&` at ~line 6993). Report which you want: removed for good or restored (decision item, route: Manager→Director) | ☐ | |
| B-14 | **Close with unsaved changes** | Type anything → X or Cancel → "Discard / Keep editing" confirm; Keep returns with everything intact; pristine modal closes silently | ☐ | |

## 4. Section C — Canvas & templates (owner: Worker C)

Proceed to step 2 (flow builder).

| # | Check | Expect | Pass | Notes |
|---|---|---|---|---|
| C-1 | Add / rename / delete groups | All work in board view; deleting the LAST group is blocked with a neutral notice (not a red error toast) | ☐ | |
| C-2 | Conditions | Add/delete/move between slots; status menu (mandatory/optional/invalidate) works on board | ☐ | |
| C-3 | AND/OR/OFF connectors | Toggle between adjacent conditions; state persists | ☐ | |
| C-4 | **Undo/redo stress** | Do 10+ mixed ops (add, rename, delete, move, status) then Ctrl+Z all the way back: each step reverses exactly ONE op; canvas NEVER goes blank; Ctrl+Y/redo replays forward | ☐ | |
| C-5 | Board images | Upload valid image to group and condition; invalid type rejected with message (same rule as outline) | ☐ | |
| C-6 | Outline (document) view | Labels/descriptions/status/images edit inline and sync back to board; status dropdown closes on outside click; emptying a group label then blurring restores a default (doesn't stay blank) | ☐ | |
| C-7 | Viewport | Zoom/scroll cannot strand content off-screen; resize window → content stays reachable; compact/mobile pan works | ☐ | |
| C-8 | Template picker (fresh) | From a NEW empty builder: pick template → applies with name "(my version)", groups/conditions/TFs/tags populated; no warning needed | ☐ | |
| C-9 | **Template over existing work** | Build something → Templates button → pick → explicit Replace confirmation; decline → nothing changes | ☐ | |
| C-10 | **Template over an EDIT** | Edit a saved strategy → apply template → confirmation warns you're replacing the edit (owner: A); decline preserves everything | ☐ | |
| C-11 | PDF export happy path | Print/PDF → document opens with logo, title, groups, conditions; special chars in names render escaped, not as HTML | ☐ | |
| C-12 | PDF preflight | Try printing with the name cleared → clear message BEFORE any popup flash; popup-blocker path shows its message | ☐ | |

## 5. Section D — Save, persist, edit round-trip (owner: Worker A)

| # | Check | Expect | Pass | Notes |
|---|---|---|---|---|
| D-1 | Full save | Complete all steps → Save → success; strategy appears at top of bank without reload | ☐ | |
| D-2 | Double-save guard | Hammer the Save button → exactly one strategy created | ☐ | |
| D-3 | **Round-trip fidelity** | Reload the page → edit that strategy → verify EVERY field survived: name, emoji, description, markets (manual ones — not re-derived), traded+support symbols, timeframes INCLUDING custom, tags, images, canvas groups/conditions/connectors/statuses | ☐ | |
| D-4 | Edit → save updates | Change something → save → ONE updated row (no duplicate); reload confirms | ☐ | |
| D-5 | Save failure | Offline → Save → visible in-modal error, modal stays open, data intact; online → retry succeeds | ☐ | |
| D-6 | Oversize payload | Load up max images (large files) → Save → blocked IMMEDIATELY with a size message (no long upload then failure) | ☐ | |
| D-7 | Step-hop integrity | Step 1 → 2 → 3 → back to 1 repeatedly: custom TFs still listed, manual markets untouched, nothing resets | ☐ | |

## 6. Section E — Cross-cutting

| # | Check | Expect | Pass | Notes |
|---|---|---|---|---|
| E-1 | Console hygiene | Zero errors across the whole session; note any warnings that repeat | ☐ | |
| E-2 | Compact/mobile pass | Repeat B-5, B-12, C-7, and one full save at ≤900px width / phone emulation | ☐ | |
| E-3 | Neighbor views unaffected | Sessions, Trades, Dashboard views load and behave normally after all of the above | ☐ | |
| E-4 | Visual consistency | Dialog copy consistent ("Keep editing" / "Discard" / "Replace"); toasts styled per type (info vs error); no layout breakage from long names/tags | ☐ | |

---

## 7. How to report findings (Director → Manager)

For every ❌, add a row here (or file `reports/DIRECTOR/INSPECTION-<n>.md` for anything
S1/S2 using the task-report structure). The Manager consumes this table.

| ID | Item ref | Severity | What happened (exact repro) | Expected | Screenshot/console ref | Route to |
|---|---|---|---|---|---|---|
| F-1 | | | | | | |

**Routing map (Manager: assign by zone, per the ownership contract in `00_DIRECTOR_PLAN.md` §4):**

| Failure area | Owner |
|---|---|
| Bank page list/tabs/sort/menus/badges/community absence (A-*) | **Worker D** |
| Builder step-1 fields, caps, close-confirm, modal gating (B-*) | **Worker B** |
| Canvas board/outline/undo/templates picker/PDF (C-*) | **Worker C** |
| Save/delete/duplicate/refresh/round-trip/openBuilder/template-fill lifecycle (D-*, A-9/11/12/13, B-2 dup-name, C-10) | **Worker A** |
| Console errors, cross-zone, or unclear | **Manager triages first**, then assigns or files an ICR |

**Manager dispatch rules (unchanged from the effort — the clobber incident lesson):**

1. **Serialized editing of `TalariaV16.jsx`:** ONE worker edits at a time; Manager releases
   the next only after the previous returns file + report and is verified. Suggested order
   if multiple fixes queue: C → B → D → A.
2. Workers get a self-contained fix prompt in `prompts/INSPECT_<F-id>_WORKER_<X>.md`
   including: the finding row, exact repro, the owning symbols, and the reminder of their
   zone + no-branch-switching directive.
3. Every fix returns a filled `templates/TASK_REPORT_TEMPLATE.md` to `reports/<X>/FIX-<F-id>.md`;
   Manager re-runs the failed inspection item + the mini-smoke before marking it fixed.
4. Cross-zone needs → ICR as before. Escalate to Director on any `00_DIRECTOR_PLAN.md` §7 trigger.
5. After all findings close, Director re-runs ONLY the failed items + Section E, then the
   Manager closes the Phase-4 gate rows and writes `FINAL_SHIP_REPORT.md`.

---

## 8. Pre-existing open items (carry into this cycle — not new findings)

| # | Item | Action |
|---|---|---|
| P-1 | **SECURITY:** `docker-compose.override.yml` removal is uncommitted; the exposing version was pushed in `cd162b94` | Manager: commit the deletion + `next.config.mjs` revert + doc updates; confirm server redeploy or that the server ignores the file. Director verifies |
| P-2 | Style toggle `{false && <ToggleRow label="Style" …/>}` (~line 6993) | Director decides at B-13: remove cleanly or restore. Route the edit to Worker B |
| P-3 | Status board rows "PHASE 4 GATE / SHIP" + "M4.3 final ship report" still TODO | Manager closes both once this inspection passes and P-1/P-2 are resolved |
