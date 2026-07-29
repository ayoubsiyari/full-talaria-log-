# Kill-switch poll — after PURGE land / awaiting chart.js data-cache flags

**When:** 2026-07-29 · during b83 assemble  
**A tip:** `manager-a/critical-path`

| Flag | Status | FLAG-01/02 | Notes |
|---|---|---|---|
| `MC_PANEL_STATE_PURGE_V1` | Shipping in b83 | PASS (prior) | User-facing mid-drag / ref hygiene — not leak |
| `MC_GRID_STATE_PURGE_V1` | Shipping in b83 | PASS (prior) | sessionStorage pair + drag cleanup — not leak |
| `MC_BAR_STORE_REALM_V1` | On A tip (`ff5149c64` P3) — **not** in b83 ship | pending verify on merge to B | Realm-safe store; demoted as leak dominant but still a real switch |
| `SHARED_BAR_STORE` | On tip | PASS | Existing |
| chart.js `_tfDataCache` / `_btTfDataCache` / `_smartPrefetchCache` disables | **Not named yet** as `__TALARIA_DISABLE_*` product switches | — | C/A suspect list; verify FLAG-01/02 when A lands names |

Bar-store Shots 1–3 demoted; may never land. Do not wait.
