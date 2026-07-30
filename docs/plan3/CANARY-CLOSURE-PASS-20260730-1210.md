# Canary Closure Pass — 2026-07-30 12:10

**Checkout:** `C:\Users\user\Desktop\talaria1\manager-d-trade`  
**Branch:** `manager-d/trade-correctness`  
**Authority:** Director 12:10 — close without PO time; PAR-01; zero bare `unverified`.

## Status vocabulary (replaces bare unverified)

| Status | Meaning |
| --- | --- |
| `fixed` | Commit + GREEN gate |
| `broken` | Defect proven RED locally |
| `blocked-on-build` | Gate/fix lives on undeployed branch, or product fix not on ship stamp |
| `cosmetic-disclosed` | Low-blast / scratched / monitor-only; no PO eyes |
| `superseded` | Covered by shipped fix family or old-layout surface |
| `needs-info` | Missing repro / feature question / soak undefined |
| `owner-blocked` | Mechanism owned outside D tip (`chart.js`, replay, layout shell) |
| `po-eyes` | Requires deployed-build PO script (named) |

---

## 1. Bucket (a) — 15 slots

| Item | Disposition | Commit / evidence | Gate | Reason if not fixed |
| --- | --- | --- | --- | --- |
| TAL-01918 | `blocked-on-build` | — | RED local: `m17-di2-completed-bar-close-mutation.red.test.mjs` (0/2); `m21-b-tal01918-red.test.mjs` LIMB1/2 | Fix/guard on `manager-a/m17-di2-completed-bar`; not on deployed stamp |
| TAL-01922 | `blocked-on-build` | — | RED default: `m22-session-calendar-bucketing.red.test.mjs` | Product bucketing not GREEN on tip; session-calendar ship required |
| TAL-01899 | `blocked-on-build` | — | absent | Gate only on `diagnostics/v3-qa123-soak-20260727` |
| TAL-01718 | `blocked-on-build` | — | absent | Same M25 pack branch |
| TAL-01900 | `blocked-on-build` | — | absent | Same M25 pack branch |
| TAL-01902 | `blocked-on-build` | — | absent | Same M25 pack branch |
| TAL-01733 | `fixed` | harness run 2026-07-30 | GREEN: `node run.mjs --only=H-S19` + `H-S83` in `multichart-prod/harness` | — |
| TAL-01910 | `fixed` | harness run 2026-07-30 | GREEN: `H-S18` + `H-S83` | — |
| TAL-01887 | `fixed` | harness run 2026-07-30 | GREEN: `H-S18` + `H-S83` | — |
| TAL-01939 | `fixed` | harness run 2026-07-30 | GREEN: `H-S18` + `H-S83` | — |
| TAL-01699 | `fixed` | `28d808cb4`, `2cc949399` | GREEN: `order-multi-tp-coincident-stack.test.mjs` ± homepage | Already fixed; reconfirmed |
| TAL-01885 | `fixed` | `c0a0d7620`, `2cc949399` | GREEN: `order-line-edge-visibility.test.mjs` ± homepage | Already fixed; reconfirmed |
| PO value boxes shaky | `fixed` | `2cc949399` | GREEN: `order-stable-label-hover-dom.test.mjs` ± homepage | — |
| PO hover one-by-one | `fixed` | `2cc949399` | GREEN: same stable-label gate | — |

---

## 2. Bucket (b) — 14 slots

| Item | Disposition | Commit | Gate | Reason if not fixed |
| --- | --- | --- | --- | --- |
| TAL-01903 | `fixed` | `c0a0d7620` | GREEN: `order-pnl-refresh-stable.test.mjs` | Reconfirmed |
| TAL-01886 | `fixed` | `ab57a5dac` | GREEN: `cross-timeframe-current-price-coherence.test.mjs` ± homepage | — |
| TAL-01802 | `fixed` | `ab57a5dac` | GREEN: same cross-TF gate | — |
| TAL-01777 | `fixed` | `c0a0d7620` | GREEN: `order-pair-switch-draft-rebind.test.mjs` | Reconfirmed |
| TAL-01807b | `fixed` | `ab57a5dac` | GREEN: `order-pair-switch-visual-rebind.test.mjs` ± homepage (+ draft gate) | — |
| PO pending SL/TP resurrect | `fixed` | `2cc949399` | GREEN: `order-pending-protection-clear.test.mjs` ± homepage | TOP ACCEPT; needs redeploy for PO eyes |
| TAL-01799 | `owner-blocked` | — | — | Multichart/layout shell; Cluster M PO §11 |
| TAL-01864 | `owner-blocked` | — | — | `chart.js` history window; Data Script 3 |
| TAL-01936 | `owner-blocked` | — | — | `chart.js` time-alignment; Data Script 2 |
| TAL-01931 | `owner-blocked` | — | — | `replay-system.js` / Cluster L |
| TAL-01759 | `owner-blocked` | — | — | Layout/session isolation; Cluster E |
| TAL-01935 / 01914 / 01921 | `owner-blocked` | — | — | Indicator overlay; Cluster H |
| TAL-01938 | `owner-blocked` | — | — | ORB/session overlay; Cluster H |
| TAL-01913 | `owner-blocked` | — | — | Daily-open lines; Cluster H |

---

## 3. Reclassify the 26 (was default bucket c)

| Class | Count | IDs |
| --- | ---: | --- |
| `cosmetic-disclosed` | 6 | Rayan #7, Rayan #10, TAL-01854, TAL-01894, TAL-01912, TAL-01920 |
| `superseded` | 14 | TAL-01653, 01658, 01691, 01692, 01760, 01780, 01781, 01789, 01791, 01795, 01805, 01756, 01732, 01723 |
| `needs-info` | 6 | Rayan #2, TAL-01677, 01744, 01891, 01892, 01893 |
| **Total** | **26** | |

Full one-line reasons live in the ledger Review column after this pass.

---

## 4. Five PO scripts — next build, ordered by rows-closed / PO-minute

See `docs/plan3/PO-SCRIPTS-NEXT-BUILD-20260730.md`.

Efficiency order (most rows closed per PO minute first):

1. **M24 identity** — 8 rows; ~8 min; mostly **re-run against fix**
2. **M10 order mechanics** — 7 rows; ~10 min; mix re-run / first look
3. **M23 rollback** — 5 rows; ~8 min; **re-run against fix**
4. **Journal side-effects** — 2 rows; ~6 min; re-run + first look
5. **Duration** — 1 row; ~4 min; **re-run against fix** (needs dist rebuild)

---

## Bare `unverified` remaining

**Zero.** Every former unverified row now carries one of the status words above plus a reason or gate.
