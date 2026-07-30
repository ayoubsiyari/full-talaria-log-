# Canary Row Disposition — 2026-07-30 (updated 12:40)

Scope: former 102 unverified set.
**Bare `unverified`: 0.**
**No status uses forbidden known-limitations labels.** Scratched rows use `closed-scratched` (PO 12:40 ruling — `RULING-NO-DISCLOSURE-THE-BAR-IS-MEASURED-CLEAN-20260730-1240.md`).

Authorities:
- `docs/plan3/CANARY-CLOSURE-PASS-20260730-1210.md`
- `docs/plan3/OWNER-BLOCKED-ROUTING-20260730-1240.md`
- `docs/plan3/PO-SCRIPTS-NEXT-BUILD-20260730.md`
- `docs/plan3/TICKET-STATUS-LEDGER-20260729.md`

## Bucket (a) — confirmed 12:40

| Outcome | Count |
| --- | ---: |
| `fixed` (gates GREEN, reconfirmed) | 8 |
| `blocked-on-build` | 6 |

Blocked: TAL-01918, 01922 (local RED; undeployed fix), TAL-01899/01718/01900/01902 (M25 pack on `diagnostics/v3-qa123-soak-20260727`).

## Bucket (b) — confirmed 12:40

| Outcome | Count |
| --- | ---: |
| `fixed` (money-path first) | 6 |
| `owner-blocked` → all **A** | 8 (13 total owner-blocked in ledger including rows outside the 14-slot list) |

Money-path fixed: TAL-01903, 01886/01802, 01777, 01807b, PO pending clear.

## Former scratched set (6) → `closed-scratched`

Rayan #7, Rayan #10, TAL-01854, TAL-01894, TAL-01912, TAL-01920.
No PO minutes. Not escalated with a floor/leak number.

## 26 `po-eyes`

Packed into five efficiency-ranked packs in `PO-SCRIPTS-NEXT-BUILD-20260730.md` Part A.
Named money Scripts 1–5 in Part B (mostly re-runs of `fixed` rows + three first-look `po-eyes`).
**All packs `AWAITING STAMP` until B confirms the served stamp.**

## Owner-blocked (13) — Director routes

See `OWNER-BLOCKED-ROUTING-20260730-1240.md`. All thirteen → **Manager A** (TAL-01799 conditional B only if order leak).