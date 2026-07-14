# A5 (Lane 2 or 3) — independent-symbol multichart replay freeze diagnostic (TAL-01590) — READ-ONLY + one RED scenario

## Priority
**P1 — highest-severity symptom on the board this week.** Full replay freeze on independent-symbol layouts. Per the Director (DAILY-INTAKE 2026-07-14, A5): this runs on the **data/replay path**, which is **NOT under the D-012 interaction freeze**, so it proceeds now. Diagnostic-first; the fix is authorized only after the mechanism report.

## Cold-start context
- Repo: `full-talaria-log--main`. Two mirrored trees (I8). Replay engine: `chart v 1.4/chart/modules/replay-system.js`; multichart sync: `multichart-manager.js`, `sync-bridge.js`, `MultichartGrid.jsx`. Host harness: `chart v 1.4/chart/multichart-prod/harness/` (`scenarios.mjs`, `serve.mjs`, `npm run gate`).
- **Do NOT touch the react-parity harness files** (`react-parity-*`, `react-parity-lib.mjs`) — Lane 4 exclusive (D-012). Host-side replay scenarios (`scenarios.mjs`) are fine.
- Plan-1 proved same-pair replay ownership exhaustively; **independent-symbol panels during replay** were only covered by the ownership table's "self-owned" row — never by a play-advance scenario. That's the gap.

## Symptom (TAL-01590)
Multichart layout with panels on **different symbols**; start replay → only ONE panel advances correctly; the others **freeze entirely** or show gaps.

## Diagnostic (read-only) — deliverable `docs/tickets-overhaul/worker-reports/A5-independent-symbol-replay-freeze-report.md`
Trace and report:
1. How the shared replay **playhead** is distributed to panels during play — the exact path from the replay master tick to each panel's advance.
2. Why an **independent-symbol** panel's playhead-advance differs from the same-pair path. Hypothesis to confirm/refute: the independent panel's advance is gated on **same-pair predicates** (BL-10 family) → it never advances; and/or the self-owned acquisition seam gaps during play.
3. File:line for the branch where independent-symbol advance is dropped.
4. Proposed switch-gated fix (name the switch, files) — but **do not implement yet**; report mechanism first.

## The one RED scenario (host harness — allowed)
Add a RED-first host scenario: **2 panels, different symbols, press play → assert BOTH panels advance** (no freeze, no gaps). It must FAIL on the current build (proving the bug) — that's the point. Mirror to homepage (I8). Report the RED evidence + the row id.

## Guardrails
- Read-only on product code (diagnostic). The only edit allowed is the new host-harness RED scenario + its I8 mirror.
- Do NOT edit react-parity files (Lane 4) or `known-failing.json` (Lane 4 owns it — report the new row for them to track).
- Build-id discipline (L1) on any live repro.

## Report — WORKER-REPORT-STANDARD.md (8 sections)
Mechanism + file:line + proposed fix + the RED scenario evidence. Status = **DIAGNOSTIC-ONLY** (fix authorized post-report).
