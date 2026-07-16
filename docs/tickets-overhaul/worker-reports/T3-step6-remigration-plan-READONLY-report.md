# T3 step 6 — RC-1/RC-4 multichart re-migration plan (READ-ONLY)

## 1. Task + RC

- **Task:** `T3-step6-lane2-remigration-plan-READONLY.md` — design consolidated re-migration off fallback-B against the 12 honest `reactParity` RED rows; collision map; unfreeze criteria; Director escalation.
- **RC:** **RC-1** (selection/settings lifecycle) + **RC-4** (multichart parent↔iframe parity). Tooling/diagnostic — **no RC discharged** (plan only).

---

## 2. What I changed — file by file

**No product, harness, or `known-failing.json` edits.**

| File | Change |
|------|--------|
| `docs/tickets-overhaul/T3-REMIGRATION-PLAN.md` | **Primary deliverable** — row→root map, 7-phase plan, collision map, acceptance/unfreeze, registry tags, Director paragraph. |
| `docs/tickets-overhaul/worker-reports/T3-step6-remigration-plan-READONLY-report.md` | This report. |

**Explicit:** `MultichartGrid.jsx`, `TalariaV8bLive.jsx`, `panel-cmd-bridge.js`, `react-parity-lib.mjs`, engine modules — **NOT touched.**

---

## 3. Kill-switch (I3 + I13)

Plan documents **existing** fallback-B switches and **proposed** phase switches (no code changes):

| Phase | Switches (default ON = migration slice active) |
|-------|-----------------------------------------------|
| 1 Engine | `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`, `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` |
| 2 Routing | `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2`, `__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3` |
| 3 Settings | `__TALARIA_DISABLE_MULTICHART_SETTINGS_FLASH_FIX_V2`, `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` |
| 4 Keyboard | `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` (proposed) |
| 5 Peer | `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1` |
| 6 Marquee | `__TALARIA_DISABLE_MULTICHART_PANEL_MARQUEE_V1` (proposed) |
| 7 RC-3 | `__TALARIA_RC3_MC_PARITY_PHASE5` (proposed) |

I13 requirement: each execution phase must gate **every** file touched, React included.

---

## 4. Proof — RED → GREEN

**Read-only step — no RED→GREEN execution.**

**Evidence consulted:**

| Source | Use |
|--------|-----|
| `known-failing.json` → `reactParity` | 13 expected / 10 tracked-red (step-17 audit = **12** honest REDs; H-R07/H-R12 promoted later) |
| `react-parity-scenarios.mjs` | Per-row actuation + measurement (I15) |
| `T1-fallbackB-disable-multichart-migration-report.md` | Fallback-B state matrix |
| `T3-step4-panelB-interaction-root-report.md` | D-011 routing root; partial greens retracted on honest harness |
| `T3-step5-peer-isolation-rows1315-report.md` | H-R07 fix pattern (regressed on b1 honest audit) |
| `T1-step17-panelB-esc-delete-report.md` | H-R05/06 bridge pattern |
| `T0-step14-real-actuation-harness-report.md` | 12-row honest RED baseline |
| `T5-step1-anchoring-diagnostic-report.md` | RC-3 Phase 5 fold |

**Harness command (future phases):**

```text
cd "chart v 1.4/chart/multichart-prod/harness"
npm run test:react -- --only=H-R01,H-R02,H-R03,H-R04,H-R05,H-R06,H-R07,H-R08,H-R09,H-R12,H-R13,H-R14 --runs=10
npm run gate:react
```

---

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| **I14** | Plan restricts parent↔iframe fixes to postMessage bridges (Phases 2–5). |
| **I15** | Row map names real actuation + store/modal end-states per scenario source. |
| **I13** | Per-phase switch coverage specified before any impl. |
| **D-011** | Phase 0 A/B + routing scope fence preserved; no wholesale fallback reversal in one PR. |
| **D-012** | Unfreeze requires built dist + PO checklist; dev-only not sufficient. |
| **Deploy freeze** | Plan explicitly serializes away from T8 `panel-cmd-bridge` replay edits. |

---

## 6. What I did NOT do / limits

- No implementation, no `known-failing.json` updates, no harness edits.
- Did not re-run `gate:react` this step (read-only).
- Did not re-litigate D-011/D-012 (built on them per prompt).
- **T7 closure sweep** noted some rows (H-R05/06/09) were green on **b88** before honest-harness retraction — plan targets **b1 honest 12-row** matrix as authoritative gate.
- Phase 7 (RC-3) scope is high-level; detailed H-S45–50 specs remain in T5 track.

---

## 7. Live-verification handoff

When execution is authorized, PO confirms per `MULTICHART-PARITY-CHECKLIST.md`:

1. Build id identical on host + panel B iframe.
2. Rows 1–9, 9b on **panel B** (single-click, border, Ctrl-click, settings, Esc, Delete, peer isolation, marquee, chain).
3. Row 11: phase master switch OFF → behaviors revert.
4. Row 10: single-chart unchanged.

Until then: **fallback-B stays ON**; deploy freeze holds.

---

## 8. Status

**DIAGNOSTIC-ONLY (plan delivered, execution not started)**

---

## Director escalation summary

Multichart interaction remains on **fallback-B** because T1’s panel migration was deliberately defaulted OFF after D-006/D-012 proved harness-only greens were false; Lane 4’s honest iframe harness now holds **12 stable RED rows** (real mouse/keyboard, store/modal end-states on **b1**). This plan re-migrates in **six gated phases**—engine selection substrate (Lane 1), then parent chrome routing, settings transport, Esc/Delete I14 bridge, peer isolation, and iframe marquee—each with its own kill-switch, D-011 A/B proof, and **10/10** `gate:react` GREEN before the next phase, **serializing** `MultichartGrid.jsx` to one phase per PR and keeping T8 replay edits off `panel-cmd-bridge` until the keyboard slice lands. **RC-3 Phase 5** (anchoring parity, H-S45–50) is folded as a **seventh post-unfreeze** tranche on `sync-bridge.js`, not mixed with interaction. **Unfreeze** requires empty `reactParity.knownFailing`, `gate:react` PASS, PO parity-checklist sign-off on the same build, and promotion of H-S34/35/44—only then may we leave fallback-B and lift the deploy freeze. **Authorization requested** to execute Phases 1–6 under this fence (not a wholesale revert reversal in one change).

---

## Quick reference — root groups → phases

| Group | Rows | Phase |
|-------|------|-------|
| A Engine store | H-R02, H-R03 (+H-R01 store leg) | 1 |
| B Chrome routing | H-R01, H-R12 | 2 |
| C Settings | H-R04, H-R13, H-R09 partial | 3 |
| D Keyboard | H-R05, H-R06, H-R09 Esc | 4 |
| E Peer isolation | H-R07, H-S34/35/44 | 5 |
| F Marquee | H-R08, H-R14 | 6 |
| RC-3 parity | H-S45–50 | 7 (post-unfreeze) |

Full detail: [`T3-REMIGRATION-PLAN.md`](../T3-REMIGRATION-PLAN.md)
