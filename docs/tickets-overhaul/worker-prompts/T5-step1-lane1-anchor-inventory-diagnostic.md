# T5 step 1 (Lane 1) — anchor-representation inventory DIAGNOSTIC (read-only bridge)

**Cold-start (read first if you are new to this repo):** self-contained NEW task, not a resumption. Read `docs/tickets-overhaul/INVARIANTS.md`, `docs/tickets-overhaul/WORKER-REPORT-STANDARD.md`, and the T5 track in `docs/tickets-overhaul/TRACKS.md` (RC-3 anchoring unification). The chart engine + drawing modules are **mirrored** across `chart v 1.4/chart/...` and `homepage/public/chart/...` (byte-identical) — but this is **diagnostic only, no edits.**

**Type:** DIAGNOSTIC ONLY — inventory + mechanism, no behavior change. Bridge task while T1 step 12 (b7) deploys/live-confirms; front-loads T5 so the fixes land fast once Lane 1 is clear.
**RC:** RC-3 (anchoring — index vs timestamp+price vs pixel).
**Reporting:** follow `WORKER-REPORT-STANDARD.md` (diagnostic → §2/§3 proposed, §4 how you proved it, §6 limits, §8 DIAGNOSTIC-ONLY).

## Goal
Produce the authoritative inventory of **how every drawing tool anchors its points**, so T5 can migrate index-anchored tools to timestamp+price through the shared resolver. Known offender per TRACKS: anchored VWAP / volume tools (`drawing-tools-advanced-volume.js` ~:834–866, and bar-index mutation ~:525–531).

## What to deliver (no fixes)
1. **Anchor inventory table:** for each drawing tool/module, the anchor representation it stores/reads — `timestamp+price` (correct), `bar-index`, or `pixel` — with file:line evidence.
2. **Shared resolver map:** where the canonical resolve path lives (`drawing-tools-base.js` binary-search resolver) and which tools already route through it vs bypass it.
3. **Failure mechanism per offender:** why an index/pixel anchor drifts on (a) history prepend (drag-to-load), (b) TF switch, (c) replay advance. Cite the TAL tickets each maps to (incl. copy/paste offset TAL-00253 if it rides here).
4. **Proposed migration order + gating:** which tool families migrate together, one `window.__TALARIA_*` switch per family (I3), every file each switch must gate (both mirror trees).

## Constraints
- **No behavior changes**; no committed trace logging.
- Do **not** edit the T1-touched files (`drawing-tools-manager.js`, `drawing-toolbar.js`, `TalariaV8bLive.jsx`) or `chart.js` axis paths (that's the A1 track) while those are mid-deploy.
- L1: state the build id traced on.

## Deliverable
`docs/tickets-overhaul/worker-reports/T5-step1-anchor-inventory-diagnostic-report.md`. Once T1 step 12 live-confirms and the A1 fixes are dispatched/sequenced, T5 fixes dispatch from this inventory (RED-first: draw → prepend/TF-switch/replay → assert tool unmoved).
