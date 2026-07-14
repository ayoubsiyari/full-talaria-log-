# T0 step 7 (Lane 4) — RC-4 multichart interaction-parity RED harness family

**Cold-start (read first if you are new to this repo):** this is a self-contained NEW task — not a resumption of anyone's in-progress work. Before starting, read: `docs/tickets-overhaul/INVARIANTS.md`, `docs/tickets-overhaul/WORKER-REPORT-STANDARD.md`, and the existing harness so you match its style — `chart v 1.4/chart/multichart-prod/harness/` (esp. `interactive-helpers.mjs`, `scenarios.mjs`, `known-failing.json`, `serve.mjs`). The harness is **mirrored** into `homepage/public/chart/multichart-prod/harness/`; all copies must stay **byte-identical** (run your changes into every copy). Look at how the existing H-S32/H-S33 scenarios were written and follow that exact pattern. You need no prior-session context; everything is named below.

**Type:** harness/tooling only — no engine or React edits. Pure test scaffolding.
**RC:** RC-4 (multichart interaction parity). This builds the RED acceptance suite that T3's per-row fixes (Lane 2) will turn GREEN — so Lane 4 stays productive and T3 gets its contract ahead of implementation.
**Reporting:** follow `docs/tickets-overhaul/WORKER-REPORT-STANDARD.md` in full.

## Goal
Extend the existing 29→31-scenario panel harness (`multichart-prod/harness/`) with **RED-first** scenarios covering the multichart interaction-parity surfaces, so each surviving T3 contract row has a failing scenario before any fix lands. Mirror the topology and helper style of `interactive-helpers.mjs` and the existing H-S32/H-S33 scenarios.

## Scenarios to add (RED-first — they should FAIL today, proving the defect)
One scenario per surface below; tag each with its registry ticket:
1. **Drawing target = focused panel** (TAL-01495): place a tool while panel B is focused → it lands in B, not the host.
2. **Ctrl-select inside a panel** (TAL-01498): Ctrl-click two tools in a panel → both selected, each toggles once.
3. **Quick menu in a panel** (TAL-01499): selecting a tool in a panel shows the quick menu in that panel.
4. **Indicator state isolation** (TAL-01500/01501): toggling an indicator in panel B does not change panel A/host.
5. **Drag stops at frame box** (TAL-01491 / Row 11 reopen — TAL-01587): dragging a tool while the cursor leaves the tile bounds → drag is retained by the tile (pointer-capture), does not die. Model the `mouseleave`/pointer-capture path, not just rect geometry.
6. **Repaint without extra click** (TAL-01484/01490): a command-driven change in a panel repaints without a follow-up click.

Also add stubs (marked `known-failing`/pending, not yet asserting) for the new intake contract rows so they're tracked:
7. **Layout persistence across refresh** (Row 13, TAL-01571).
8. **Tile clip/visibility geometry** (Row 14, TAL-01574).
9. **Symbol-sync converges panels to focused ticker** (Row 15, TAL-01586).

## Requirements
- All new scenarios **RED ×3** (run three times, consistently failing) and registered in `known-failing.json` with their ticket ids — so the existing gate stays green (I9) while these are pending.
- Do **not** modify the 29 plan-1 scenarios or any engine/React file. Harness files only.
- Keep the 7 harness tree copies byte-identical if the harness is mirrored.
- Each scenario documents: the exact interaction it drives, the assertion, and the expected GREEN state a T3 fix must reach.

## Deliverable
`docs/tickets-overhaul/worker-reports/T0-step7-rc4-parity-family-report.md` listing each scenario, its RED evidence (3× fail), the ticket it maps to, and the `known-failing.json` diff. These feed T3 (Lane 2) acceptance directly.
