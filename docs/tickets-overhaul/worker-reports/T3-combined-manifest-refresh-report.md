# T3 — Combined-build manifest + PO parity-checklist refresh

## 1. Task + RC

- **Task:** `T3-combined-manifest-parity-checklist-refresh-lane2` — doc-only assembly prep while Lane 1 lands H-R03 iframe dedupe fix.
- **RC:** Tooling/docs — no code, build, or harness edits.

## 2. What I updated

| Doc | Changes |
|-----|---------|
| `docs/tickets-overhaul/T3-COMBINED-BUILD-MANIFEST.md` | Header: b6 **SUPERSEDED / NOT BLESSED**; next build id **`TBD`**. New §1.1b re-migration commit table (P1 `6dc552a8`, H-R06 `f46e6d9d`, H-R07 `52894a8d`, harness `ba07584c`, I13 `817a81a1`, H-R03 **`TBD`**). §1.3 pending rows updated for landed P1/P4/P5 + pending H-R03. §2.1 kill-switch: P5 master corrected to `__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION`; added H-R03 hotfix `__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1`. §3 staging: `20260716b6` marked superseded. New §4.1 **PENDING-DEPLOY retest** — all six tickets (TAL-01609/10/11/12/00/03bc). §5 blockers: H-R03 + hygiene rows. |
| `docs/tickets-overhaul/MULTICHART-PARITY-CHECKLIST.md` | Row 3: explicit **H-R03 PO step** (2v → panel B → 2 trendlines → select #1 → Ctrl+click #2 → both resize handles, ×5). New kill-switch map table: P1, P4, P5, H-R03 hotfix with master/child switches and harness hook names. |

## 3. TBD placeholders (awaiting Lane 1 + Lane 4)

| Item | Status |
|------|--------|
| H-R03 fix commit hash | **`TBD`** (Lane 1 `drawing-tools-manager.js`) |
| Next combined `BUILD_ID` | **`TBD`** (Lane 4 cut after H-R03 GREEN + includes `817a81a1`) |
| Superseded build | `20260716b6` — do not bless or PO-sign |

## 4. PENDING-DEPLOY cross-check (§4.1)

All six tickets from `DAILY-INTAKE.md` are in the manifest retest checklist:

- TAL-01609, TAL-01610, TAL-01611, TAL-01612, TAL-01600, TAL-01603 (b+c)

Each maps to staged D-015 / D-009 / D-016 fixes with retest surfaces on the blessed combined build.

## 5. What I did NOT do

- No code, harness, or `known-failing.json` edits.
- Did not bless or stamp a new build id.
- Did not commit Lane 1 H-R03 fix (pending).

## 6. Status

**DONE** — docs ready for Lane 4 fresh combined cut once Lane 1 lands H-R03 fix.

**Commit:** `a6a2e865`
