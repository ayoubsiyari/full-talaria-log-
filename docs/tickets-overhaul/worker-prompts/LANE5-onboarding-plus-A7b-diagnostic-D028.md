# Worker 5 / Lane 5 — ONBOARDING + first assignment (D-028)

Welcome. You are the fifth worker, held to the **identical discipline** as Workers 1–4. Read this charter fully before touching anything.

## Standing invariants (non-negotiable)
- **I8:** both chart trees stay byte-identical — `chart v 1.4/chart/` (source of truth) and `homepage/public/chart/` mirror. Any product edit lands in both.
- **I13:** every fix behind a `window.__TALARIA_*` kill-switch; prove with a switch-OFF diff.
- **I15:** honest actuation only. No proxy assertions. Every GREEN names how it actuated + what it measured. Synthetic green = GREEN-SYNTHETIC, never "proven."
- **D-023:** every trusted row has a named discriminator (switch-OFF → honest RED).
- File-scoped commits; diff against the manifest; one concern per commit.
- Security rule: never weaken security guards or bypass the freeze to make something pass.

## HARD FENCE (Lane 5-specific, binding until the combined build ships)
- **Freeze-safe surfaces ONLY.** You may NOT touch: `chart.js` core, or any re-migration file (`MultichartGrid.jsx`, `TalariaV8bLive.jsx`, `panel-cmd-bridge` interaction paths).
- **You must never create a bless blocker.** If a fix would require a frozen/re-migration surface, STOP and hand back to the Manager for escalation — do not half-implement.
- Freeze-safe territory for you: indicator modules, tool/drawing modules, order-entry modules, UI-polish, keyboard/shortcut handlers that don't cross the iframe boundary.

## Assignment queue (in order)
1. **A7b — volume-profile defect cluster (FIRST). Diagnostic before any fix.**
2. A8 — Shift-modifier drag family + locked-tool pass-through (TAL-01652) + keyboard-zoom anchor (TAL-01624).
3. UI-polish batch (TAL-01576/01580/01607/01623/01627/01656/01657/01668) as fill work.

---

## FIRST TASK — A7b volume-profile DIAGNOSTIC (read-only)

Per TRACKS.md A7b amendment. The cluster:
- **Scale-vanish + control loss:** anchored / fixed-range Volume Profile makes the price+time scales disappear and the chart becomes uncontrollable until the tool is removed (TAL-01665/01666/01667).
- **Cross-layout leak:** the tool leaks onto other layouts while drawing (TAL-01661) — this leg is multichart/re-migration territory (parked Phase-5/RC-4 tranche); **diagnose only, do NOT fix here** (fence).
- **Labels non-functional:** price/time labels don't work on these tools (TAL-01662/01664).
- **Excess control points:** chrome polish (TAL-01656/01657).

**Do:** reproduce the scale-vanish honestly (real tool placement in the real chart), then **split the root: engine defect (freeze-safe, yours) vs. multichart leak (re-migration, NOT yours)**. Name file:line mechanisms. For the freeze-safe engine defects, propose gated fixes (switch names, discriminators). Flag the cross-layout leak leg back to Manager for the parked tranche.

**Deliverable:** `docs/tickets-overhaul/worker-reports/A7b-volume-profile-diagnostic-report.md` — repro recipe, ranked roots with file:line, engine-vs-multichart split, proposed gated fix scope per freeze-safe root, and the tickets each root discharges. NO product code changes in this diagnostic step.
