# Director merge directive — Intake 2026-07-27 into Plan 3
Date: 2026-07-27 · Author: Director · Binds: Manager + all lanes
Inputs: `TICKETS-INTAKE-20260727.md` (inventory + PO clarifications) · `PLAN3-BOARD.md` § Intake 2026-07-27 (mechanism rows)

## 1. Ruling summary

1. The 2026-07-27 intake (124 tickets + Rayan's 11) merges into Plan 3 as: **member additions to 14 existing mechanism rows** + **four new rows (M23, M24, M25, M26)** + backlog/polish routing. No separate plan.
2. **Already-solved families get a PO visual check, not engineering.** Nearly all reporters were on the OLD website surface; per the standing D-034 first action, every recurrence row starts with a provenance retest. The PO visual scripts are in §4; a PASS closes the member tickets by retest (zero engineering), a FAIL re-flags per the sticky protocol.
3. **Unsolved rows follow the unchanged Plan 3 protocol**: understanding gate → D-033 diagnostic → RED-first gated fix → D-031/D-034 checkpoint → reporter/PO re-verify. No shortcuts because the intake is large.
4. **New Lane 5 (Trade Lifecycle) opens** for M23 + M24. Lanes run in parallel ONLY under the file-ownership matrix in §3 — parallelism stops where file overlap starts.

## 2. Category → Plan 3 mapping (closed form)

| Root-cause category (intake analysis) | Plan 3 home | Mode |
|---|---|---|
| Rollback trade-state | **NEW M23** (Lane 5) | New engineering, P0 |
| Trade registration/ledger integrity | **NEW M24** (Lane 5) | New engineering, P0 |
| Fill/trigger simulation | existing **M10** (Lane 3) | Member additions; M10 landed evidence covers part — PO re-verify first |
| Order-line drag/interaction | existing **M6** (Lane 3) | Member additions + reopens; PO re-verify first |
| Multichart sync/replay runtime | existing **M1/M2/M21** | PO re-verify on lag-cure build; Ibrahim's old-layout tickets = re-verify only |
| Memory/perf lifecycle | existing **M19/M20** | PO soak re-verify (cure landed) |
| User-pref persistence | existing **M15** (Lane 4) | Member additions; PO pin-spec recorded |
| Playhead restore / GoTo | existing **M8 + MC-RESTORE** | Fold as MC-RESTORE acceptance criteria + M8 members |
| Aggregation/session-calendar | existing **M5/M17** (Lane 1) | Member additions (TAL-01922 may split into a calendar row post-diagnostic) |
| Tick-path/stepping pipeline | **NEW M25** (Lane 2) | New engineering, P1, partially absorbed by M21 |
| Viewport/zoom/scale contract | **NEW M26** (Lane 1) | New engineering, P1, **serialized behind B74** |
| Drawing-tool settings | existing **M14** (Lane 4) | Member additions (fib ×4 reporters) |
| Responsive UI / polish | existing **M9** | Polish batch |
| Feature requests | backlog | PO decisions |

## 3. Parallelization ruling (file-ownership matrix)

Rev 2.4 remains controlling: B74 packaging owns the shared tree and the single integration branch; background lanes work ONLY in isolated worktrees and land ONLY through the integration branch after B74.

| Lane | Rows | Owns (exclusive write) | Must NOT touch | May start |
|---|---|---|---|---|
| L5 — Trade Lifecycle (NEW) | M23, M24 | `order-manager.js` (+ mirrors), journal/trade persistence backend paths, order-ledger tests | `chart.js`, `replay-system.js`, indicator modules | NOW (diagnostic + RED harness in isolated worktree) |
| L3 — Orders | M10/M6 additions | (unchanged M6/M10 scope) — but `order-manager.js` write access is TRANSFERRED to L5 while M23/M24 diagnostics run | `order-manager.js` until L5 releases | After PO re-verify sweep marks which members survive |
| L2 — Sync/Replay | M25 | `replay-system.js` tick/step generator + replay-clock calendar | `chart.js`, order files | Diagnostic read-only now; product edits after B74 lands |
| L1 — Rendering | M26 + M5/M17 additions | `chart.js` viewport/interaction paths | everything until B74 lands | RED harness read-only now; product edits STRICTLY after B74 |
| L4 — Interaction/UX | M15/M14 additions | settings/persistence modules, homepage prefs storage | chart engine files | NOW (disjoint files, isolated worktree) |

Hard rules:
- **One writer per file, ever.** M23 and M24 share Lane 5 and share `order-manager.js` — they are one worker or strictly sequenced, never two workers in parallel on that file.
- M23/M24 diagnostics will inevitably read `replay-system.js` (rollback hooks). Reading is free; if a fix needs an edit there, it queues behind M25's owner or the ownership transfers explicitly on this board — no silent co-editing.
- Anything needing `chart.js` (M26, parts of M25 render side) queues behind B74 promotion. No exceptions; this is what Rev 2.4's merge freeze exists for.
- TEST environment stays serialized: one deploy/verification consumer at a time; B74 has priority.

## 4. PO visual-check scripts (families Plan 3 already fixed — retest closes tickets)

Run all on the current accepted TEST build (confirm tripwire badge/build id first — L1/I8-R). Each ≤2 min. Record PASS/FAIL + build id per script; screenshots only on FAIL.

- **V1 — Multichart replay smoothness (M1/M2 members, lag cure):** 2-panel NQ+ES, several indicators on host, replay 60x, 60 seconds. Expect: both panels advance continuously, no panel freeze, no 4–5s indicator cadence. Covers TAL-01939/01733/01910/01887/Rayan #2/01923/01717.
- **V2 — Crosshair during replay (M2):** same session, hold crosshair on host while playing. Expect: time-axis label under the cursor updates as candles advance. Covers TAL-01934/01700.
- **V3 — Memory/idle (M19/M20):** leave the 2-panel session playing 30 min (or fold into a scheduled soak), then interact. Expect: no lag on return; task-manager tab memory bounded (not multi-GB). Covers TAL-01892/01891.
- **V4 — Session resume (MC-RESTORE, after B74/its checkpoint lands):** play to a distinct date, exit to sessions page, re-enter. Expect: exact playhead position restored. Covers TAL-01929/01909 (and feeds M8 GoTo work).
- **V5 — Order execution basics (M10 landed part):** 1m limit order → switch to 1D → Play (the TAL-01815 script); then two-panel TF change with an open order. Expect: no instant break-even close, order survives TF/layout changes. Covers TAL-01905 recurrence check + 01798/01800 class.
- **V6 — Order drag family (M6):** place order with SL/TP, drag entry/SL/TP, stack two TPs, hover a second entry over it. Expect: lines follow drag, no phantom TP1, PnL updates while dragging, stacked TPs separable, no inheritance onto a new order. Covers 01696–01699/01897/01885/01617/01750.
- **V7 — Fib settings (M14):** edit fib levels (add 1.1/1.3/1.5/1.8), OK, reopen. Expect: levels persist on chart and in dialog. Covers 01930/01888/01813 (+01758 thread). Four reporters — if this FAILS on the new build, M14 re-opens as STICKY-candidate immediately.
- **V8 — Preference persistence (M15):** pin 2 timeframes + 2 tools, refresh; exit session, re-enter; open a new session. Expect: pins present in all three states (PO spec). Covers 01792/01895; also check symbol persistence (01865/01747).

Any FAIL → the row re-enters engineering per sticky protocol (stale-surface check → new-mechanism check → fix-failure reopen), with the reporter's exact scenario as the RED.

> **Superseded in part by `DIRECTOR-RULINGS-20260727.md` (2026-07-27, later same day):** M26 and other `chart.js` work now sequence behind the M21 C3a increments rather than behind B74 alone; promotion follows the canary wave in §A3; delivery follows the tier/train policy in §B3–B4.

## 5. Priority and sequencing

1. **B74 finishes first** — nothing in this directive preempts the snapshot-acceptance gate or the integration branch. (Current active blocking gate per dossier Rev 2.4.)
2. **L5/M23+M24 diagnostics start immediately** in an isolated worktree (they touch no B74 files): understanding gate is already satisfied for Rayan's tickets (specs included); D-033 diagnostic prompt is the Manager's next dispatch after B74's current cycle.
3. **PO visual sweep V1–V3, V5–V8** can run as soon as the PO has a free session on the current accepted TEST build; V4 waits for the MC-RESTORE checkpoint.
4. M25/M26 open in their lanes per §3 gating.
5. Production promotion ordering is unchanged: the old website stays as-is; these fixes reach the 100 testers only through the normal checkpoint → TEST → PO validation → production path.

## 6. Manager obligations added by this directive

- Extend the intake ledger: every member ticket listed above appears in the next checkpoint report with its row and state.
- The understanding gate output ("user does X, sees Y, expected Z") for every NEW dispatched row, per README §Intake protocol.
- Sticky-watch: TAL-01718, TAL-01717, TAL-01723, TAL-01617, TAL-01719 all carried "not sloved" reporter follow-ups on the old surface — they enter `RECURRENCE-A-PENDING` and get stale-surface triage FIRST (registry updated, not skipped).
- ~~One open PO question carried forward: TAL-01854 spec~~ — RESOLVED 2026-07-27: PO scratched TAL-01854; it is removed from M25 and gets no dispatch. M25 has four members. No open PO questions remain on this intake.
- PO visual sweep V1–V3, V5–V8 is APPROVED by the PO (2026-07-27) and may run on the PO's next session on the current accepted TEST build; V4 still waits for the MC-RESTORE checkpoint.
