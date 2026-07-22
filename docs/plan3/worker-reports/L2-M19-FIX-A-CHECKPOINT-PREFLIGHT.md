# L2-M19 Fix A — Checkpoint Preflight

**Status:** READY-CHECKPOINT-CANDIDATE  
**Base:** `019e8c7304da3a8f877cac86adfa21e75ebf8ed4`  
**Worktree:** `closure-worktrees/m19-fixa-ckpt-preflight-019e8c730`  
**D/E:** frozen (not transplanted)

No commit / push / build bump / deploy in this preflight.

## Transplant (Fix A only)

| Path | SHA-256 |
|---|---|
| `chart v 1.4/chart/modules/order-manager.js` | `8efd6e5fa451a3f5f6bc5f84fec98d7f0c658293d7ff07581ad3e557ef8f363b` |
| `homepage/public/chart/modules/order-manager.js` | identical |
| `…/m19-progressive-session-soak.test.mjs` (+ homepage) | `be844e8298a70e25a735475d1f5faab6e07149116eb2e35d39276060bc57bb67` |
| `…/m19-panel-dirty-runtime-contract.test.mjs` (+ homepage) | `0d7c04e786a63b1bef43900114d98800eae987254512be1a6bd7f7b952c894c3` |

**Excluded:** pause/`_savedTickState` SLTP helper bodies, `replay-step-forward-sltp-flush.test.mjs`, all M19-D/E, all other dirty main files.

**Required deps:** none beyond Fix A surface + soak harness + UI-contract test + homepage mirrors.

## Exact diff artifacts

- `docs/plan3/queued-hunks/M19-A-fix-a.order-manager.diff`
- `docs/plan3/queued-hunks/M19-A-fix-a.soak.diff`
- `docs/plan3/queued-hunks/M19-A-fix-a.diffstat.txt`

Diffstat: OM ±294 lines (×2 mirrors); soak ±325 lines (×2 mirrors); +UI contract test mirrored.

## Gate results

| Gate | Result |
|---|---|
| Fix A ON soak | **FIX-A-GREEN** — panel rebuilds `5500→0`, lite `5500`, dock innerHTML during lite `0`; persist remains RED (b/c) |
| Fix A KILL soak | **FIX-A-KILL-RED** (expected) — panel rebuilds `5500` restored; exit `1` |
| UI contract | **4/4 PASS** |
| Order regressions | lifecycle + owning-panel **29/29** + host-store **29/29** + cross-panel **6/6** = **GREEN** |

## Proposed checkpoint manifest

Include only the six transplanted paths + ON/KILL evidence/reports + this preflight JSON.  
Exclude D/E, SLTP pause helpers, build bump, publish, deploy.

See `docs/plan3/evidence/L2-M19-FIX-A-CHECKPOINT-PREFLIGHT.json`.
