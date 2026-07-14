# T3 Step 1 — Interaction-Parity Contract Report

---

## 1. Task + RC

- **Task:** T3 step 1 (Lane 2) — draft interaction-parity contract with intake rows 13–15 (2026-07-13 amendments).
- **Worker prompt:** `docs/tickets-overhaul/worker-prompts/T3-step1-parity-contract.md`
- **Deliverable:** `docs/tickets-overhaul/T3-INTERACTION-PARITY-CONTRACT.md` (updated 12 → 15 rows)
- **RC:** **RC-4** (panel interaction parity). Rows 13–14 are shell/state surfaces adjacent to interaction; row 15 is symbol-sync interaction policy.

---

## 2. What I changed — file by file

| File | Change |
| --- | --- |
| `docs/tickets-overhaul/T3-INTERACTION-PARITY-CONTRACT.md` | Added contract **rows 13–15** from `DAILY-INTAKE.md` amendment A2 with today→target owner/transport, file:line evidence, and Director open questions. Updated **row 11** with TAL-01587 reopen (pointer-capture/`mouseleave` hypothesis). Extended per-surface summary table and Director checkpoint (P4). Queued **TAL-01564** as next Lane 2 task. |
| `docs/tickets-overhaul/worker-reports/T3-step1-parity-contract-report.md` | This report (WORKER-REPORT-STANDARD format). |

**No other files touched.** Legacy `chart v 1.4/chart/multichart/` dev-shell not touched. No engine, bridge, or React runtime edits.

---

## 3. Kill-switch (I3 + I13)

N/A — design-only step. Each T3 step-2/3 fix will get its own gated `window.__TALARIA_*` per contract row.

---

## 4. Proof — RED → GREEN

N/A — no code changes. Evidence is static file:line citations in the contract table:

- **Row 13 (layout persistence):** `TalariaV8bLive.jsx:13738, 14139-14185, 34761`; `panel-managerv2.js:113-115, 2414-2446`
- **Row 14 (tile geometry):** `MultichartGrid.jsx:1177-1255, 2274-2309, 2452-2481, 6494-6496`
- **Row 15 (symbol-sync converge):** `MultichartGrid.jsx:2673-2697, 2759-2780, 3863-3914`; `multichart-manager.js:174-198, 852-862` (visibleRange snap exists; symbol snap missing)

---

## 5. Invariants checked

| Invariant | How satisfied |
| --- | --- |
| **I1 (RC-4)** | Contract covers interaction ownership for rows 1–12 plus intake rows 13–15. |
| **I11 (mirror-frame guard tail FROZEN)** | Rows 13–15 are not mirror-frame/data-adoption mechanisms; flagged not DEFER-T8. Row 12 crosshair sync policy note preserved. |
| **L2 (production tree)** | All evidence cites `multichart-prod/` bridges + `MultichartGrid.jsx`; legacy `multichart/` not referenced as fix target. |
| **P2 (one session)** | N/A — docs only. |
| **P4 (Director approval before fix)** | Contract table + per-row owner/transport recommendations submitted for approval; rows 13–15 explicitly in checkpoint. |

---

## 6. What I did NOT do / limits

- **No code fixes** — contract draft only per step-1 STOP CONDITIONS.
- **Row 13 storage key design** left as Director open question (new V9 key vs extend `chart_panel_state`).
- **Row 15 converge source** left as Director open question (focused panel vs host tile A); recommendation documented (focused, host fallback).
- **Row 14** needs screenshot layout from TAL-01574 for RED repro — mechanism hypothesis only (host-slot vs iframe resize lag vs container clip).
- **Row 11 TAL-01587** — live drag-trace not run in this design step; hypothesis recorded only.
- **TAL-01564** queued for next Lane 2 work; not expanded into contract rows (plan-1 SW hygiene, not RC-4 interaction surface).
- Did not re-run retest checklist or gate harness.

---

## 7. Live-verification handoff

Director approval checkpoint — PO confirms target owners for rows 13–15:

| Row | Ticket | PO live check (after step-3 fix) |
| --- | --- | --- |
| 13 | TAL-01571 | Pick 2-up or 4-up layout → hard refresh (F5) → same layout variant restores (not single). |
| 14 | TAL-01574 | Reproduce screenshot layout → no chart dead zone below tile boundary; canvas fills cell. |
| 15 | TAL-01586 | 2+ panels on **different** tickers → enable **Symbol** sync → all panels converge to **focused** panel's ticker within one load cycle. |

Rows 1–12: see `docs/tickets-overhaul/T3-RETEST-CHECKLIST.md` survivor rows.

**Next queued (Lane 2):** TAL-01564 — reload prompt returns after clicking Reload or Cancel (SW version-check hygiene; not in this contract).

---

## 8. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)** — contract draft complete with rows 13–15; awaiting **Director approval (P4)** before T3 step 2 RED scenarios.

---

## Contract rows summary (15)

| # | Surface | T3 fix candidate |
| --- | --- | --- |
| 1 | Panel focus | Verify |
| 2 | Selection (Ctrl-select) | **Yes** — TAL-01498 |
| 3 | Quick Menu | **Yes** — TAL-01499 |
| 4 | Settings dialog | Verify |
| 5 | Keyboard / replay | Harness regression |
| 6 | Order rail + `getActiveChart` | Verify |
| 7 | Drawing target | **Yes** — TAL-01495 |
| 8 | Indicator enable-state | **Yes** — TAL-01500, 01501 |
| 9 | Compare Symbol | **Yes** — TAL-01426 |
| 10 | Context menu | Low priority |
| 11 | Pan drag bounds | **Yes** — TAL-01491, **TAL-01587 REOPENED** |
| 12 | Chrome mirror | If retest reopens |
| **13** | **Layout persistence** | **Yes** — TAL-01571 |
| **14** | **Tile geometry / clip** | **Yes** — TAL-01574 |
| **15** | **Symbol-sync converge** | **Yes** — TAL-01586 |

## New rows — owner + transport (for Director approval)

| # | Target owner | Target transport |
| --- | --- | --- |
| 13 | Parent shell (V9 React) | `userStorage` persist `{ layoutId, panelCount, layoutIndex }` on picker change; hydrate before `MultichartGrid` mount |
| 14 | Parent shell orchestrates tile bbox; each panel resizes canvas | Host: DOM slot overlay (`applyHostSlot`); iframe: `ResizeObserver` → `chart.resize()` + layout-settle `repaintAllPanelSurfaces` |
| 15 | Parent shell on symbol-sync toggle ON; focused panel owns source ticker | `runCommand('loadFile', { fileId })` fan-out to all peer tiles (mirror `setSyncMode` visibleRange snap at `multichart-manager.js:181-198`) |
