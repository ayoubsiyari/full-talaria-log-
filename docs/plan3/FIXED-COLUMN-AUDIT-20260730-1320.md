# Fixed-column audit — 2026-07-30 13:20

**Checkout:** `C:\Users\user\Desktop\talaria1\manager-d-trade`  
**Branch:** `manager-d/trade-correctness`  
**Question:** for each `fixed` row, does the gate exercise the **user** path, and does reversing the fix make it **RED**?

Authority: Director 13:20. Shape to catch: TAL-01908 sat green behind `m24-order-id-allocator` while restore renumbered `#5→#942`.

**RED proof file:** `node --test "chart v 1.4/chart/modules/fixed-column-audit.red.test.mjs"` (must exit ≠ 0 while decorations remain).

---

## Reopen count

# **13**

Thirteen rows moved `fixed` → `broken` with the audit RED gate cited. Not unverified.

---

## Two KEEP examples that survive GATE-01 (tried to break; could)

| Row | Gate | Reverse | Result |
| --- | --- | --- | --- |
| TAL-01908 (also 01919/01924) | `m24-order-id-restore-stability.test.mjs` | preload `__TALARIA_DISABLE_M24_DISPLAY_ID_STABILITY_V1=true` | **RED** `942 !== 5` — user-shaped hydrate display path |
| TAL-01903 | `order-pnl-refresh-stable.test.mjs` | `TALARIA_TEST_DISABLE_ORDER_PNL_RESTORE_STABLE=1` | **RED** `12000 !== 10075` — journal restore → account recompute |

---

## Reopened (broken) — money / data first

| Row | Why audit failed | RED gate |
| --- | --- | --- |
| TAL-01937 | `m23-rollback-trade-state.red.test.mjs` stays **14/14 GREEN** when kill preloaded (CONTROL expects tip) | `fixed-column-audit.red.test.mjs` |
| Rayan #1 | same m23 suite decoration | same |
| Rayan #3 | same | same |
| Rayan #6b | same | same |
| TAL-01896 | `orderManagerTradeRows.test.mjs` stays GREEN under duration kill (tests reset `window`) | same |
| M24 / TAL-01926 | full pytest stays **14/14** with `SESSION_JOURNAL_PATCH_DELETE_GUARD=0` | same |
| TAL-01807b | `order-pair-switch-visual-rebind.test.mjs` has **no kill-switch / reverse lever** | same |
| TAL-01904 | CODE-PATH only: `classifyOrderTypeForPrice` — no place/refresh | same |
| TAL-01809 | CODE-PATH only: balance helper unit; kill RED but no user close/restore path | audit doc + env RED on helper; row broken until user-path gate |
| TAL-01933 | CODE-PATH only: single-TP-after-trail unit | broken until user-path gate |
| TAL-01810 | CODE-PATH only: exit-marker projection unit | broken until user-path gate |
| TAL-01733 | H-S19 documented `--bugswitch=__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD` stays **GREEN** | broken; H-S19 not GATE-01 |
| SEL-01 | asserts selector **strings** only — never tears down a user TP row | broken |

---

## Kept fixed (sample — money/data that passed)

| Row | Path class | Reverse RED |
| --- | --- | --- |
| TAL-01908 / 01919 / 01924 | USER hydrate display | yes |
| Rayan #4 / #5 / #9 / #11 | USER restore (+ allocator) | yes (restore) |
| TAL-01903 | USER journal restore PnL | yes |
| TAL-01777 | USER pair-switch draft | yes |
| PO pending SL/TP resurrect | USER mirror emit | yes |
| TAL-01932 | USER pending close netting | yes |
| TAL-01861 | USER cancel-before-confirm | yes |
| TAL-01802 / 01886 | USER frozen playhead / mark | yes |
| TAL-01905 / 01798 / 01815 | USER lifecycle suite (kill RED) | yes |
| TAL-01800 | lifecycle ownership (not m23 suite) | yes |
| TAL-01887 / 01910 / 01939 | USER harness H-S18+H-S83 (bugswitch RED) | yes |

Visual / mid-tier gates with **inline** kill-switch legs (multi-TP, edge, stable-label): kept — reverse is proven inside the GREEN file, not via whole-file env. Flagged as weaker operability, not decoration.

---

## Method

1. Inventory 51 `fixed` rows from the ledger.  
2. Money/data first: restore ID, PnL, pair switch, pending clear, fills/netting, M23, duration, journal prune, classifiers.  
3. For each: run GREEN; reverse fix (env / window preload / harness `--bugswitch`); classify USER vs CODE.  
4. Fail ⇒ `broken` + RED citation. Never `unverified`.

Stand-by next: fold PO answers on the 23 decision rows; run five packs when B confirms stamp.
