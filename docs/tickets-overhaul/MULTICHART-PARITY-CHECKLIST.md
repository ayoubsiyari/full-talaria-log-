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
| 3 | **Ctrl-click** a second tool → both stay selected, each toggles exactly once (no double-toggle deselect). | ☐ |
| 4 | **Settings open:** open settings for a selected tool → menu opens and **stays open** for ≥1 event turn (no flash open/close). | ☐ |
| 5 | **Settings close on Esc:** press Esc → tool deselects **and** the settings menu/bar closes together (no orphaned menu). | ☐ |
| 6 | **Delete:** delete a selected tool → no ghost artifact remains; canvas repaints without an extra click. | ☐ |
| 7 | **Peer isolation:** selecting in panel B does not wrongly clear or open UI in other panels beyond the intended cross-panel rule. | ☐ |
| 8 | **Ctrl+drag marquee (added D-007):** hold Ctrl and drag on empty chart → blue marquee-select border draws and multi-selects enclosed tools. Run on **main chart AND a panel**. | ☐ |
| 9 | **Single→double click chain (added D-007):** single-click a tool → selects + quick menu per stated spec; **double-click** → opens settings; **Esc** → deselects and closes settings. Run on **main chart AND a panel**. | ☐ |

## Single-chart regression guard (must stay unchanged)
| # | Check | Pass? |
|---|---|---|
| 10 | Repeat checks 1–6, 8, 9 in single-chart mode → all behave as before (live-confirmed baseline). | ☐ |

## Kill-switch revertibility (I13)
| # | Check | Pass? |
|---|---|---|
| 11 | Set the fix's named switch OFF → the fixed behaviors revert (proves the switch covers **every** file, React included). | ☐ |

## Observation rows (not pass/fail gates — capture evidence for triage)
| # | Observe | Notes / capture |
|---|---|---|
| O1 | **Panning brightness/quality drop (TAL-01567, GAP-RENDER):** while panning into a region, does the chart visibly dim / lose rendering quality? Suspected interaction-lite LOD threshold, not data. **Attach a screenshot** if seen — this is a live capture the Director needs before scoping. | _______ |

---

**Verdict:** ☐ PASS (all boxes) → eligible for acceptance ☐ FAIL → back to Lane 1 with the failing row(s).
**Tester:** __________  **Date:** __________  **Build:** __________
