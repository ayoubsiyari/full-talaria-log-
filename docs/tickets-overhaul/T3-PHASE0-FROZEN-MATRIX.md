# T3 Phase 0 — FROZEN authoritative RED matrix (D-018 #2)

**Frozen:** 2026-07-16 (Lane 4 `T3-remig-phase0-freeze-plus-regate`)  
**Build:** `20260715b2` (react parity gate; was `20260715b1` at step-17 audit)  
**Posture:** fallback-B default — migration switches OFF unless `--migration-on` / per-phase master OFF  
**Evidence:** T0 step 17 honest actuation audit + phase-0 re-gate (`remig-phase0-gate-pass3.txt`, `remig-phase0-gate-react.txt`)

This document is the **binding scope** for Phases 1–6. Do not re-fix rows adjudicated **GENUINELY-GREEN-ON-FALLBACK**.

---

## Dropped greens (not in re-migration scope)

| Row | Verdict | Evidence | Phase impact |
|-----|---------|----------|--------------|
| **H-R07** | **GENUINELY-GREEN-ON-FALLBACK (b1 only)** — **b2 reverted to RED** | b1: `gate:react` PASS step 17; b2: isolated 0/3 FAIL (`remig-phase0-hr07-x3.txt`) | **Phase 5:** shrink **reverted** on b2 — reactParity row back in scope + **H-S34/35/44** |
| **H-R12** | **GENUINELY-GREEN-ON-FALLBACK** | `gate:react` PASS on b1+b2; panel-B gear opens real settings modal | **Phase 2 shrinks:** **H-R12 chrome leg removed** from Phase 2 discharges; Phase 2 targets **H-R01 panel V9 bar leg only** |

**Not dropped (stay in roster, not counted as RED):** **H-R12A** (host gear — always green), **H-S80** (react harness TF label — green).

**Reconciliation:** Plan §1 listed **12** honest REDs at step-17 audit time (b1). Authoritative set on **b2** = **11** honest REDs (H-R12 dropped; H-R07 **re-promoted** RED on b2).

---

## 10 authoritative honest-RED rows (b2: 11 — H-R07 restored)

| Row | Symptom (one line) | Honest actuation (I15) | Measures (end-state) | Phase |
|-----|-------------------|------------------------|----------------------|-------|
| **H-R01** | Real click does not select in store / surface parent V9 on panel B | `page.mouse.click` at iframe-translated bar hit (host + panel B) | `isDrawingSelected` + parent V9 `#tl-sett` visible | **P1** (store) + **P2** (V9 chrome leg only) |
| **H-R02** | Orphan handles: chrome visible, store `selected=false` | Real single-click rectangle (host + panel B) | `readDrawingSelectedInStore` + `readSelectionChrome.hasBlueBorder` | **P1** |
| **H-R03** | Ctrl+click does not multi-select in store | Real Ctrl+click second trendline after first select | Both ids in `dm.selectedDrawings` | **P1** |
| **H-R04** | Dbl-click does not open real parent settings modal | Real dbl-click after select + V9 settle | `waitForParentDrawingSettingsOpen` — `hasStyleSection`, not `quickBarShellOnly` | **P3** |
| **H-R05** | Settings never open before Esc chain (setup leg) | Real dbl-click → `page.keyboard` Esc | Store deselect + parent settings closed | **P4** (blocked on P3 setup) |
| **H-R06** | Delete does not remove drawing from store | Real Delete after select | `drawingExists` false + repaint delta | **P4** |
| **H-R07** | Cross-panel select: store empty after real click (b2 RED) | Real click panel-B after host place | Global `selected` exactly one id | **P5** |
| **H-R08** | Ctrl+drag marquee inactive; store multi-select fails (host leg) | `page.mouse` Ctrl+drag at iframe canvas coords | `readCtrlMarqueeState` active w/h>8 + store multi-select | **P6** |
| **H-R09** | Select → settings → Esc chain breaks | Real single → dbl → Esc | Full chain store + V9 + settings asserts | **P2+P3+P4** (composite) |
| **H-R13** | Panel-B dbl-click does not open/persist settings | Real panel-B dbl-click | Settings open + still open 400ms (no flash-close) | **P3** |
| **H-R14** | Panel-B Ctrl+drag marquee inactive + no store multi-select | Real panel-B Ctrl+drag | Marquee border active + both drawings store-selected | **P6** |

**Suspect flag (harness only, not dropped):** H-R08 panel-B store read may leak host ids — host leg remains authoritative RED.

---

## Row → phase map (binding)

| Phase | Discharges (frozen) | Rows |
|-------|---------------------|------|
| **P1** Engine selection substrate | H-R02, H-R03; unblocks H-R01 store leg | 3 rows touch P1 |
| **P2** Parent chrome routing | **H-R01 V9 bar only** (H-R12 **dropped**) | 1 primary + H-R09 partial |
| **P3** Settings transport | H-R04, H-R13; H-R09 settings leg | 3 rows |
| **P4** Esc/Delete I14 bridge | H-R05, H-R06; H-R09 Esc leg | 3 rows |
| **P5** Peer isolation | **H-R07** (b2) + **H-S35, H-S44** (H-S34 promoted green) | 1 react + 2 manager rows |
| **P6** Iframe marquee | H-R08, H-R14 | 2 rows |

---

## Harness A/B hooks (Lane 4 — wired)

| Hook | CLI / env | Effect |
|------|-----------|--------|
| **Fallback-B default** | (none) | All `__TALARIA_DISABLE_*` migration switches at fallback posture |
| **Migration ON (D-011)** | `react-run --migration-on` or `REACT_PARITY_MIGRATION_ON=1` | Sets ownership V2 + lifecycle V2 + legacy-retire V2 **false** in panel boot |
| **Phase 1 OFF (A/B revert)** | `react-run --phase1-off` or `REACT_PARITY_PHASE1_OFF=1` | Sets `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE=true` — restores P1 RED posture for switch-OFF proof |

**Phase 1 implementer contract:** After Lane 1 lands P1, GREEN = `gate:react` with default boot; RED restoration = `--phase1-off` on H-R02/H-R03 (and H-R01 store leg).

---

## Baseline snapshot (frozen)

| Surface | expected | knownFailing | Notes |
|---------|----------|--------------|-------|
| Host `gate` | 83 | **32** | H-S34/H-S83 promoted pass3; H-S17 tracked flake; H-S40/41/42 in-session PASS |
| `gate:react` | 14 (incl. H-S80) | **11** | H-R12 green; H-R07 restored RED on b2 |

SHA256 at freeze: `known-failing.json` `B6135539BCEF0DCB9B097F10BC3C4246BFEE4A31869E277B6844EE44531A7A5B`; `react-parity-lib.mjs` `4CCA8752440AACE06F0558411F34FAC689301E7635EEED20424AB4BD80AA835C`

---

## Phase 1 dispatch gate

Phase 1 may prove against a **clean manager `gate`** only after:

1. This matrix frozen (**done**).
2. H-S18 no longer poisons full-suite browser (**done** — `remig-phase0-gate-pass3.txt` H-S18 PASS in-session, no stack overflow).
