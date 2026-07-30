# PO scripts — CONF-01 packs under TEST-01

**Checkout tip:** `manager-d/trade-correctness`  
**Binding:** `TEST-01` in `RULING-THREE-STRIKES-ON-THE-WIRE-AND-THE-REAL-DENOMINATOR-20260730-1540.md`  
**CONF-01:** every script opens **four panels / four symbols / four TFs**, indicators loaded, ≥1 order open, before row clicks.  
**DUR-01:** soaks need ≥3 samples over ≥5 minutes, not a single reading.

---

## TEST-01 gate (every pack, before any click)

A pack that cannot prove its subject is deployed **does not run**.

1. Read MEAS-01 from the running page (`window.__TALARIA_CHART_BUILD_ID` / corner badge). Write the stamp.  
2. Run the mechanical wire check against that stamp:

```bash
node scripts/wire-audit-fixed.mjs --base <CANARY_ORIGIN> --stamp <STAMP> --out docs/plan3/WIRE-AUDIT-FIXED-<STAMP>.json
```

3. For this pack, every **Declared commit / marker** row below must be `on-wire` (or `backend-static-unverifiable` only for TAL-01926).  
4. If any declared money-path marker is `off-wire` or `partial`, **stop** — do not burn PO minutes on pre-fix bytes.

**Current canary (2026-07-30):** stamp `20260730b113`. Full column audit: `WIRE-AUDIT-FIXED-20260730b113.md` — **43/50** strict on-wire.

**Blocked on b113 (do not schedule until a later stamp proves them):**

| Row | Why |
| --- | --- |
| Rayan `#8` | gap reconcile + explicit-place audit markers absent |
| TAL-01807b | pair-switch visual rebind flag absent |
| TAL-01896 | duration-norm module not on a fetchable wire path |

---

## CONF-01 open (every script, first)

1. New session on the **proven** stamp.  
2. Multichart **2×2**.  
3. Four distinct symbols (e.g. EURUSD, GBPUSD, USDJPY, XAUUSD).  
4. Four distinct timeframes (e.g. 1m, 5m, 15m, 1H).  
5. Indicator on each panel; one visible order live.  
6. Capture MEAS-01 (stamp, account, surface).  
7. Confirm TEST-01 wire proof for this pack’s declared commits.  
8. Only then run the script body.

Fail immediately if same-pair / same-TF, or if TEST-01 fails.

---

## Part A — Five packs covering 26 `po-eyes`

### Pack A1 — Viewport / scale / toolbar (Cluster J) — 11 rows / ~12 min

**Declared commits / markers (TEST-01):** none money-path — UI first-look only. Still require MEAS-01 stamp write. Wire-audit column may be empty; pack runs on any stamp that serves the chart shell.

| Row | Look type |
| --- | --- |
| TAL-01724 | first-look |
| TAL-01734 | first-look |
| TAL-01735 | first-look |
| TAL-01755 | first-look |
| TAL-01768 | first-look |
| TAL-01821 | first-look |
| TAL-01823 | first-look |
| TAL-01838 | first-look |
| TAL-01862 | first-look |
| TAL-01916 | first-look |
| TAL-01928 | first-look |

### Pack A2 — Session / TF / history (I+D+L) — 7 rows / ~10 min

**Declared markers:** cross-TF canonical mark path (`_applyCanonicalReplayMarkFromDetail` in served `replay-system.js`) when exercising TAL-01802/01886 kin; otherwise MEAS-01 only.

| Row | Look type |
| --- | --- |
| TAL-01898 | first-look |
| TAL-01925 | first-look |
| TAL-01917 | first-look |
| TAL-01909 | first-look |
| TAL-01929 | first-look |
| TAL-01923 | first-look |
| TAL-01934 | first-look |

### Pack A3 — Order-line leftovers — 3 rows / ~6 min

**Declared markers:** `__TALARIA_DISABLE_ORDER_MULTI_TP_COINCIDENT_STACK_V1`, `__TALARIA_DISABLE_ORDER_LINE_EDGE_VISIBILITY_V1`, `__TALARIA_DISABLE_ORDER_STABLE_LABEL_HOVER_DOM_V1` (must be on-wire).

| Row | Look type |
| --- | --- |
| TAL-01696 | first-look |
| TAL-01698 | first-look |
| TAL-01617 | first-look |

### Pack A4 — Money residuals — 3 rows / ~8 min

**Declared markers:** `_resolveJournalDisplayTradeId` (M24 display); M10 lifecycle ownership flag; journal screenshot idempotent flag.

| Row | Money script | Look type |
| --- | --- | --- |
| TAL-01911 | M24 identity | first-look |
| TAL-01796 | M10 mechanics | first-look |
| TAL-01940 | Journal side-effects | first-look |

### Pack A5 — Multichart / crosshair — 2 rows / ~6 min

**Declared markers:** MEAS-01 + CONF-01 layout only (lag half is A). Rayan `#2` money half: structural `removeChart` on served `multichart-manager.js` (weak — note in result).

| Row | Look type |
| --- | --- |
| TAL-01717 | first-look |
| TAL-01700 | first-look |

---

## Part B — Named money scripts (re-runs)

### Pack B1 — M24 identity — ~8 rows / ~8 min

**Declared commits / markers (TEST-01):**

| Marker | Required |
| --- | --- |
| `_resolveJournalDisplayTradeId` | yes |
| `__TALARIA_DISABLE_M24_DISPLAY_ID_STABILITY_V1` | yes |
| `__TALARIA_DISABLE_M24_ORDER_ID_ALLOCATOR_V1` / `_allocateOrderId` | yes |
| Rayan `#8` gap + place-audit markers | **blocked on b113** — omit `#8` until next stamp proves them |

| Row | Look type | b113 |
| --- | --- | --- |
| Rayan `#4/#5/#9` | re-run | OK if allocator+restore on-wire |
| Rayan `#11` | re-run | OK |
| TAL-01908 / 01919 / 01924 | re-run | OK |
| TAL-01926 | re-run | backend — confirm via B API/journal prune, not JS audit |
| TAL-01911 | first-look | OK |
| Rayan `#8` | re-run | **SKIP on b113** |

### Pack B2 — M10 order mechanics — ~7 rows / ~10 min

**Declared markers:** one-tick pending, single-TP-after-trail, balance floor, exit-marker canonical projection, lifecycle ownership, pending-close netting — all must be on-wire (they are on b113 per audit).

| Row | Look type |
| --- | --- |
| TAL-01933 | re-run |
| TAL-01932 | re-run |
| TAL-01904 | re-run |
| TAL-01905 | re-run |
| TAL-01809 | re-run |
| TAL-01810 | re-run |
| TAL-01796 | first-look |

### Pack B3 — M23 rollback — ~5 rows / ~8 min

**Declared marker:** `__TALARIA_DISABLE_M23_ROLLBACK_TRADE_CANCEL_V1` on-wire (present on b113).

| Row | Look type |
| --- | --- |
| Rayan `#1` / `#3` / `#6b` | re-run |
| TAL-01937 | re-run |
| TAL-01800 | re-run |

### Pack B4 — Journal side-effects — ~2 rows / ~6 min

**Declared marker:** `__TALARIA_DISABLE_ORDER_ENTRY_SCREENSHOT_IDEMPOTENT_V1` (or gate’s product flag) on-wire.

| Row | Look type |
| --- | --- |
| TAL-01927 | re-run |
| TAL-01940 | first-look |

### Pack B5 — Duration — ~1 row / ~4 min + DUR-01

**Declared marker:** `__TALARIA_DISABLE_TRADE_DURATION_NORM_V1` / `tradeDurationNormV1Enabled`.  
**b113:** **BLOCKED** — not on a fetchable wire module. Do not run until a stamp proves the duration pack.

| Row | Look type |
| --- | --- |
| TAL-01896 | re-run — **SKIP on b113** |

Also watch Rayan `#2` when closing a non-host panel (money half); lag half → A.

---

## Not in these packs

- `owner-blocked` / `needs-info` — Director’s routing debt (E / A queue per 15:40 ruling)  
- `blocked-on-build` / `verify-gone` / `feature-request` / `intended`  
- Rows TEST-01 fails for the live stamp
