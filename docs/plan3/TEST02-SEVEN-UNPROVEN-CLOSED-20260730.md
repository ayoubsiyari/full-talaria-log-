# TEST-02 — seven unproven rows closed

**2026-07-30** · Manager D · after Director `5d1684b02`  
**Stamp:** `20260730b113` · prior: `wire_unproven: 7` → **`wire_unproven: 0`**

## Cause

1. `PATH_HINTS` omitted `v9-theme-bridge.js`, `favorites-manager.js`, `preferences-sync.js`,
   so `localPath()` returned null and fix-commit resolution cached `null`.
2. M23 cluster was seeded with train/merge SHAs (`a07e35120` via `-G`, tip noise
   `147fa8e5f`) whose parents already contained the kill-switch → `vacuous-at-parent`.
3. Wire corpus lacked the three module blobs; fetched from canary (real JS, not HTML traps).

## Introducing commits used

| Row | Fix commit | Needle |
|---|---|---|
| Timezone EST-to-CST | `ed2a183f3` | `__TALARIA_DISABLE_V9_THEME_TZ_HONOR_CHART_V1` |
| TAL-01895 / TAL-01792 | `6ad9f48ec` | `__TALARIA_DISABLE_PINS_USER_PREFS_V1` |
| M23 / TAL-01937, Rayan #1/#3/#6b | `f127d25dd` | `__TALARIA_DISABLE_M23_ROLLBACK_TRADE_CANCEL_V1` |

## Result (re-audit)

| Verdict | Count |
|---|---:|
| on-wire | **46** |
| off-wire | 2 (Rayan #8, TAL-01807b) |
| wire-unproven | **0** |
| delivery-unserved | 1 (TAL-01896) |
| backend-needs-api-probe | 1 (TAL-01926) |

All seven former-unproven rows: **on-wire**.
