# PO scripts — next build (26 `po-eyes` + money re-runs)

**Checkout tip:** `manager-d/trade-correctness`  
**Ruling:** measured-clean bar — `RULING-NO-DISCLOSURE-THE-BAR-IS-MEASURED-CLEAN-20260730-1240.md` (filename kept for git path; no status uses that cancelled vocabulary).  
**Stamp rule:** do **not** mark any script ready to run until **B confirms the served stamp**. Until then every pack is `AWAITING STAMP`.

MEAS-01 still required when B green-lights a stamp (build stamp, account, surface).

---

## Part A — Five packs covering all 26 `po-eyes`

Ordered by **rows-closed per PO-minute** (dense packs first).  
Every row below is currently `po-eyes` with commit `—` → look type **first-look** unless noted.

### Rank 1 — Viewport / scale / toolbar (Cluster J) — 11 rows / ~12 min ≈ 0.9 rows/min

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

Click path: PO-CHECK Cluster J (grid, scale, zoom, toolbar). One session; do not invent new steps.

### Rank 2 — Session / TF / history data (Clusters I+D+L) — 7 rows / ~10 min ≈ 0.7 rows/min

| Row | Look type |
| --- | --- |
| TAL-01898 | first-look |
| TAL-01925 | first-look |
| TAL-01917 | first-look |
| TAL-01909 | first-look |
| TAL-01929 | first-look |
| TAL-01923 | first-look |
| TAL-01934 | first-look |

Click path: CANARY Data Integrity Scripts 2–4 + Cluster L drawings-lag step from PO-CHECK. Frozen playhead / session resume / weekly jump — use existing steps only.

### Rank 3 — Order-line leftovers — 3 rows / ~6 min ≈ 0.5 rows/min

| Row | Look type |
| --- | --- |
| TAL-01696 | first-look |
| TAL-01698 | first-look |
| TAL-01617 | first-look |

Click path: Band-1 / Cluster G drag–preview confirmation steps already on file. Not the M10 fill script.

### Rank 4 — Money-path residuals (named Scripts 1 / 3 / 5) — 3 rows / ~8 min ≈ 0.4 rows/min

These three are the only `po-eyes` that sit inside the named money scripts:

| Row | Money script | Look type |
| --- | --- | --- |
| TAL-01911 | M24 identity (Script 1) | first-look |
| TAL-01796 | M10 order mechanics (Script 3) | first-look |
| TAL-01940 | Journal side-effects (Script 5) | first-look |

### Rank 5 — Multichart / crosshair (Clusters C+K) — 2 rows / ~6 min ≈ 0.3 rows/min

| Row | Look type |
| --- | --- |
| TAL-01717 | first-look |
| TAL-01700 | first-look |

Click path: PO-CHECK Cluster C / K. Existing steps only.

**Sum:** 11 + 7 + 3 + 3 + 2 = **26**.

---

## Part B — Named money scripts (mostly re-runs of already-`fixed` rows)

Run **only after B confirms stamp**. Ordered by rows-closed / PO-minute.  
Includes the three `po-eyes` from Rank 4 above plus `fixed` rows that still need stamp eyes.

### 1. M24 identity — ~8 rows / ~8 min

| Row | Look type |
| --- | --- |
| Rayan `#4/#5/#9` | re-run against fix |
| Rayan `#11` | re-run against fix |
| TAL-01908 | re-run against fix |
| TAL-01919 | re-run against fix |
| TAL-01924 | re-run against fix |
| TAL-01926 | re-run against fix |
| TAL-01911 | **first-look** (`po-eyes`) |

### 2. M10 order mechanics — ~7 rows / ~10 min

| Row | Look type |
| --- | --- |
| TAL-01933 | re-run against fix |
| TAL-01932 | re-run against fix |
| TAL-01904 | re-run against fix |
| TAL-01905 | re-run against fix |
| TAL-01809 | re-run against fix |
| TAL-01810 | re-run against fix |
| TAL-01796 | **first-look** (`po-eyes`) |

### 3. M23 rollback — ~5 rows / ~8 min

| Row | Look type |
| --- | --- |
| Rayan `#1` | re-run against fix |
| Rayan `#3` | re-run against fix |
| Rayan `#6b` | re-run against fix |
| TAL-01937 | re-run against fix |
| TAL-01800 | re-run against fix |

*(no `po-eyes` in this script)*

### 4. Journal side-effects — ~2 rows / ~6 min

| Row | Look type |
| --- | --- |
| TAL-01927 | re-run against fix |
| TAL-01940 | **first-look** (`po-eyes`) |

### 5. Duration — ~1 row / ~4 min

| Row | Look type |
| --- | --- |
| TAL-01896 | re-run against fix (needs dist rebuild on stamp) |

---

## What is not in these packs

- `closed-scratched` (6) — no PO minutes.
- `owner-blocked` (13) — routed in `OWNER-BLOCKED-ROUTING-20260730-1240.md`; Director assigns.
- `blocked-on-build` (6) — wait for undeployed branch / M25 pack ship.
- `superseded` / `needs-info` / `fixed` without a Part B re-run line — no PO pack.
