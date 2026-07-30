# PO scripts — next build (CONF-01 restaged)

**Checkout tip:** `manager-d/trade-correctness`  
**Stamp rule:** all packs remain **`AWAITING STAMP`** until B confirms the served stamp.  
**CONF-01 (binding):** every script below opens **four panels, four different symbols, four different timeframes**, with indicators loaded and at least one order open **before** the row-specific clicks. Same-pair layouts are not accepted for pass evidence.

**DUR-01:** where a script says “soak”, record a short series (not a single sample) — at least three samples over ≥5 minutes on the four-panel layout.

MEAS-01 still required when B green-lights a stamp.

---

## CONF-01 open (every script, first)

1. New session on the stamped build.  
2. Multichart **2×2**.  
3. Assign four distinct symbols (example: EURUSD, GBPUSD, USDJPY, XAUUSD).  
4. Assign four distinct timeframes (example: 1m, 5m, 15m, 1H).  
5. Load at least one indicator on each panel.  
6. Place one visible order (any panel) so the money path is live.  
7. Capture MEAS-01 (stamp, account, surface).  
8. Only then run the script body.

Fail the pack immediately if the layout collapses to same-pair or same-TF.

---

## Part A — Five packs covering 26 `po-eyes` (rows-closed / PO-minute)

### Rank 1 — Viewport / scale / toolbar (Cluster J) — 11 rows / ~12 min

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

Run Cluster J steps **on the four-panel CONF-01 layout** (pan/zoom/scale on at least two different-symbol panels).

### Rank 2 — Session / TF / history (I+D+L) — 7 rows / ~10 min

| Row | Look type |
| --- | --- |
| TAL-01898 | first-look |
| TAL-01925 | first-look |
| TAL-01917 | first-look |
| TAL-01909 | first-look |
| TAL-01929 | first-look |
| TAL-01923 | first-look |
| TAL-01934 | first-look |

Cross-TF and session steps must use **different symbols on different panels**, not one symbol alone.

### Rank 3 — Order-line leftovers — 3 rows / ~6 min

| Row | Look type |
| --- | --- |
| TAL-01696 | first-look |
| TAL-01698 | first-look |
| TAL-01617 | first-look |

Drag/preview on the host panel while three other symbols remain live.

### Rank 4 — Money residuals (Scripts 1/3/5) — 3 rows / ~8 min

| Row | Money script | Look type |
| --- | --- | --- |
| TAL-01911 | M24 identity | first-look |
| TAL-01796 | M10 mechanics | first-look |
| TAL-01940 | Journal side-effects | first-look |

### Rank 5 — Multichart / crosshair — 2 rows / ~6 min

| Row | Look type |
| --- | --- |
| TAL-01717 | first-look |
| TAL-01700 | first-look |

**This is the CONF-01 native pack** — lag and crosshair under four symbols / four TFs.

---

## Part B — Named money scripts (mostly re-runs)

All open with CONF-01 layout above. Ordered by rows-closed / PO-minute.

### 1. M24 identity — ~8 rows / ~8 min

| Row | Look type |
| --- | --- |
| Rayan `#4/#5/#9` | re-run against fix |
| Rayan `#11` | re-run against fix |
| TAL-01908 | re-run against fix |
| TAL-01919 | re-run against fix |
| TAL-01924 | re-run against fix |
| TAL-01926 | re-run against fix |
| TAL-01911 | first-look |
| Rayan `#8` (skipped ID / self-open) | re-run against fix (gap + place-audit gates) |

Refresh/reopen while **other panels keep different symbols playing**.

### 2. M10 order mechanics — ~7 rows / ~10 min

| Row | Look type |
| --- | --- |
| TAL-01933 | re-run against fix |
| TAL-01932 | re-run against fix |
| TAL-01904 | re-run against fix |
| TAL-01905 | re-run against fix |
| TAL-01809 | re-run against fix |
| TAL-01810 | re-run against fix |
| TAL-01796 | first-look |

### 3. M23 rollback — ~5 rows / ~8 min

| Row | Look type |
| --- | --- |
| Rayan `#1` | re-run against fix |
| Rayan `#3` | re-run against fix |
| Rayan `#6b` | re-run against fix |
| TAL-01937 | re-run against fix |
| TAL-01800 | re-run against fix |

Rollback on the host symbol while peers stay on other instruments.

### 4. Journal side-effects — ~2 rows / ~6 min

| Row | Look type |
| --- | --- |
| TAL-01927 | re-run against fix |
| TAL-01940 | first-look |

### 5. Duration — ~1 row / ~4 min + DUR-01 note

| Row | Look type |
| --- | --- |
| TAL-01896 | re-run against fix (needs dist rebuild) |

Also watch Rayan `#2` (vanished order) when closing a **non-host** panel under CONF-01 — money-path half gated; lag half is A.

---

## Not in these packs

- `owner-blocked` → Director routes (incl. TAL-01850 → **A**)  
- `blocked-on-build` / `verify-gone` / `feature-request` / `intended`  
- Five packs stay **AWAITING STAMP**
