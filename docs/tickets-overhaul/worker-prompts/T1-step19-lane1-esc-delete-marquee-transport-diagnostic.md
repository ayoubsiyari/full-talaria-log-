# T1 step 19 (Lane 1) — diagnostic-first: Esc / Delete / marquee / objects-tree transport roots (D-012)

## Why diagnostic-first
D-012 ruling #5: harness-first with a twist — Lane 4 has **exclusive** ownership of `react-parity-lib.mjs` while it rebuilds the honest harness. You work **in parallel, diagnostic-first**: trace the real transport roots on the **real built product** now, so the fix is ready to land the moment honest measurement exists. Your step-18 settings-open fix (real mouse + honest probe, PO-confirmed) is the template.

## Cold-start context
- Repo: `full-talaria-log--main`. Two mirrored trees (I8). React: `chart v 1.4/talaria-design/src/` (`MultichartGrid.jsx`, `TalariaV8bLive.jsx`); engine: `chart v 1.4/chart/modules/*`, `chart.js`. **I14:** parent↔iframe via postMessage only. **I15:** no proxy greens.
- Acceptance for multichart interaction right now = **PO live-confirm on the real built product** (harness is being rebuilt). So your job here is to find WHY each behaves wrong on the real product, not to prove green on the current (untrustworthy) harness.

## Diagnose these on the REAL built product (2-panel, build id confirmed inside panel B)
Each still fails on the real product for panels (confirmed by PO + honest probe). For each, produce the transport root + the proposed consolidated fix (name the switch, the files, and whether it's one shared root like step 18's settings transport):
1. **Esc** on a selected drawing in a panel — does it clear selection + parent chrome? Trace the real keydown path from iframe → parent.
2. **Delete/Backspace** on a selected drawing in a panel — does it actually remove it from the store? Trace the command path across the boundary.
3. **Ctrl+drag marquee** in a panel — does the blue border draw during drag and multi-select on release, with real mouse+ctrl? Trace where the real ctrl-drag is lost.
4. **PLAN2-FOUND#3 Objects Tree duplication** (4-panel) — why does the shared Objects Tree list the same synced drawing once per panel? Trace the sync-bridge → tree population path; propose dedup/panel-scoping.

## Guardrails
- **Do NOT edit `react-parity-lib.mjs` or the react-parity scenario files** — Lane 4 exclusive (D-012). You may READ them.
- You may prototype product fixes in the React/engine files, but **acceptance is PO live-confirm** until Lane 4's honest harness lands — label per I15 (real actuation + real measurement), never "proven" on the old harness.
- I14 (bridge only), I8 (mirror), I13 (kill-switch per fix).

## Report — WORKER-REPORT-STANDARD.md (8 sections)
For each of the 4 items: the transport root (file:line + mechanism), whether they share a common root (like the settings transport did), the proposed switch-gated fix, and the exact PO live-confirm steps to accept it. Status = **DIAGNOSTIC-ONLY** unless you also landed a fix that PO can live-confirm.
