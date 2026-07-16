# Multichart Production-React Parity Checklist (standing per-build gate)

**Authorized by:** D-006 (2026-07-13) — ruling 4.
**Why:** the harness (`multichart-prod/harness/multichart-manager.js`) is NOT the production surface. Twice now (T1 steps 4 & 5) a harness-green fix broke the live React `MultichartGrid`. Every multichart fix must pass this checklist on the **live React product** before acceptance. Harness-green alone is an automatic acceptance blocker (I13).

**Scope:** manual per-build now. Lane 4 scopes the automated version after T1 recovery.

---

## Preconditions (L1)
- [ ] **DEPLOY FIRST — a cache bump alone does NOT recompile React, and local builds do NOT reach the server.** The PO tests on the **remote server** (`/opt/talaria`), so the fix reaches the browser only via: (1) local `git commit` + `git push` to `origin/main`; (2) on the server `git pull` then `GIT_COMMIT=<new-id> docker compose up --build -d` (Docker recompiles `MultichartGrid.jsx` and serves the new `chart.js`, stamping the build id). For a purely local dev check instead, `npm run build:live` in `talaria-design` — but that only affects a locally-served chart, never the server.
- [ ] Service worker unregistered + hard reload after the deploy.
- [ ] Live React multichart open (Vite live UI / real `chart-embed`), **not** the harness.
- [ ] Build id confirmed on the host **and every panel frame** = the new id just built (record it here: `__________`).
- [ ] At least two panels open; place two synced drawings in a non-focused panel (panel B).

## Selection surface — run per panel (host + each panel)
| # | Check | Pass? |
|---|---|---|
| 1 | **Single-click select** a tool in a panel → it selects on the **first** click (no dead first click). | ☐ |
| 2 | **Blue selection/preview border** is visible on the selected tool while selected. | ☐ |
| 3 | **Ctrl-click** a second tool → both stay selected, each toggles exactly once (no double-toggle deselect). **H-R03 PO step (panel B, ×5):** open **2v layout** → focus **panel B** → place **2 trendlines** → single-click select **#1** → **Ctrl+click #2** → **both** show resize handles (blue selection border on each). Repeat ×5. Host arm must also pass. | ☐ |
| 4 | **Settings open:** open settings for a selected tool → menu opens and **stays open** for ≥1 event turn (no flash open/close). | ☐ |
| 5 | **Settings close on Esc:** press Esc → tool deselects **and** the settings menu/bar closes together (no orphaned menu). | ☐ |
| 6 | **Delete:** delete a selected tool → no ghost artifact remains; canvas repaints without an extra click. | ☐ |
| 7 | **Peer isolation:** selecting in panel B does not wrongly clear or open UI in other panels beyond the intended cross-panel rule. | ☐ |
| 8 | **Ctrl+drag marquee (added D-007):** hold Ctrl and drag on empty chart → blue marquee-select border draws and multi-selects enclosed tools. Run on **main chart AND a panel**. | ☐ |
| 9 | **Single→double click chain (added D-007):** single-click a tool → selects + quick menu per stated spec; **double-click** → opens settings; **Esc** → deselects and closes settings. Run on **main chart AND a panel**. | ☐ |
| 9b | **Exactly one toolbar (added after b7 step-12 regression):** selecting a drawing shows **one** toolbar (the current V9 quick-bar) — no duplicate/old engine toolbar stacked above it — and **that** toolbar's gear opens settings. Run on **main chart AND a panel**. | ☐ |

## Single-chart regression guard (must stay unchanged)
| # | Check | Pass? |
|---|---|---|
| 10 | Repeat checks 1–6, 8, 9 in single-chart mode → all behave as before (live-confirmed baseline). | ☐ |

## Kill-switch revertibility (I13)
| # | Check | Pass? |
|---|---|---|
| 11 | Set the fix's named switch OFF → the fixed behaviors revert (proves the switch covers **every** file, React included). | ☐ |

### Kill-switch map (re-migration + H-R03 hotfix — unset = fix ON)

Record A/B evidence per build. Harness hooks: `--phase1-off`, `--panel-keyboard-off`, `--peer-deselect-off`, `--phase5-off`, `--iframe-ctrl-dedupe-off` (Lane 4; coordinate on H-R03 fix land).

| Row / phase | One-knob master (preferred) | Child / notes | Revert effect |
|---|---|---|---|
| **P1** (H-R02) | `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` | lifecycle + legacy-retire children | iframe selection substrate OFF |
| **P4** (H-R05/06) | `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` | quickbar subset may overlap | Esc/Delete cross-frame bridge OFF |
| **P5** (H-R07) | `__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION` | `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1` | peer deselect + focus peer UI churn OFF |
| **H-R03** (panel B) | `__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1` | own switch — **not** P1/P4/P5 child | iframe ctrl multi-select reverts to double-toggle-off |

**PO note:** H-R03 switch-OFF A/B is harness-only on combined build; live PO runs row 3 with switches ON (default). Switch row 11 proves one-knob revert on a dev/staging session if directed.

## Observation rows (not pass/fail gates — capture evidence for triage)
| # | Observe | Notes / capture |
|---|---|---|
| O1 | **Panning brightness/quality drop (TAL-01567, GAP-RENDER):** while panning into a region, does the chart visibly dim / lose rendering quality? Suspected interaction-lite LOD threshold, not data. **Attach a screenshot** if seen — this is a live capture the Director needs before scoping. | _______ |

---

**Verdict:** ☐ PASS (all boxes) → eligible for acceptance ☐ FAIL → back to Lane 1 with the failing row(s).
**Tester:** __________  **Date:** __________  **Build:** __________
