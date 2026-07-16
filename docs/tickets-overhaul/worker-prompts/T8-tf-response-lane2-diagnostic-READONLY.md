# T8 (Lane 2) — TF-switch response diagnostic (TAL-01597 + TAL-01603a) — READ-ONLY

Freeze-safe read-only diagnostic while Phase 2 waits on Phase-1-GREEN. From the 2026-07-15 intake, one diagnostic covers both tickets (same subsystem).

## Symptoms
- **TAL-01597:** TF switch is slow — only a few candles render until the chart is moved/panned, then it fills.
- **TAL-01603 part a:** Main-chart TF appears "stuck" — only 1D/4h respond; other TFs don't switch (or don't repaint) first time.

Hypothesis (intake): T8 acquisition seam (BL-14/17 family) + an RC-2 stuck-until-interaction render half — the new-TF data arrives but no repaint fires until a user interaction invalidates the viewport.

## Tasks (read-only — no product/harness/registry edits)
1. Trace the **TF-switch → data-acquisition → repaint** path (single-chart main, then note multichart-panel differences). Where does the new-TF fetch land, and what triggers the first paint? Identify why only a partial candle set shows until pan.
2. Separate the two failure modes: **(a) slow/partial acquisition** (data seam) vs **(b) missing invalidation** (data present, no repaint until interaction). Attribute TAL-01597 and TAL-01603a to (a) / (b) / both with evidence.
3. For TAL-01603a "only 1D/4h respond": determine whether coarse TFs take a different code path than intraday TFs (cached vs fetched, different acquisition branch).
4. Name the **fix boundary + file/region**, the proposed kill-switch, and a RED scenario spec (how actuated / what measured, I15) for each mode. Spec only — no implementation.
5. Note collision/overlap with `replay-system.js`, `panel-cmd-bridge.js`, and the Phase-4 keyboard window (so the eventual fix sequences safely).

## Guardrails
- READ-ONLY. No edits to any product file, harness, or `known-failing.json`.
- Do NOT touch chart.js Phase-1 zones (Lane 1) or order-entry.

## Report — WORKER-REPORT-STANDARD.md
Deliverable: `docs/tickets-overhaul/worker-reports/T8-tf-response-diagnostic-report.md` — the two-mode attribution, fix boundary + switch + RED spec per mode, and the collision note. State "fix awaits authorization + a clear lane slot."
