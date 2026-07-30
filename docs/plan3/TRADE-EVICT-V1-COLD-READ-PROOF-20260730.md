# TRADE-EVICT-V1 — cold-read proof (step 1)

**Date:** 2026-07-30  
**Doctrine:** `DOCTRINE-EVICTION-THE-CHART-OWNS-ONLY-WHAT-IT-DRAWS-20260730-1615.md`  
**Sequence:** prove cold read **before** deleting hot copies.

## Claim

With `closedPositions` / tracking hot copies empty, a closed trade that still exists on
`tradeJournal` is enough for:

| Surface | Required fields |
|---|---|
| History rows | MAE, MFE, identity, PnL |
| Analytics path | `bar_*_r` / post-exit series → cloud path |
| Screenshots | entry + exit `data:image…` on the journal row |

## Gate

```bash
node --test "chart v 1.4/talaria-design/src/trade-evict-v1-cold-read.test.mjs"
# RED:
TALARIA_TEST_DISABLE_TRADE_EVICT_COLD_READ=1 node --test "chart v 1.4/talaria-design/src/trade-evict-v1-cold-read.test.mjs"
```

**Result (tip at proof):** GREEN exit 0 / RED exit ≠ 0.

## What this unblocks

Eviction design (playhead bound, `__TALARIA_DISABLE_TRADE_EVICT_V1`, EVICT-01 byte+analytics
pair) may proceed. It does **not** yet delete anything.

## Limits (honest)

- Proof is unit-level against `buildLiveTradeRowsFromOrderManager` + `tradePathCloudUtils`,
  mirroring the analytics list construction in `TalariaV8bLive.jsx`.
- IDB-externalized screenshot refs (`entryScreenshotRef`) are a separate cold path
  (M20-A1) and need a follow-on cell before eviction nulls in-row base64 without a ref.
- CKPT-01 before product eviction landing remains binding.
