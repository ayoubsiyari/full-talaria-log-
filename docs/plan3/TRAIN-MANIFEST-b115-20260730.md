# Train manifest — `20260730b115`

**Resolved by SHA, not by commit message.** Supersedes `TRAIN-MANIFEST-b114-20260730.md`,
which it carries forward unchanged plus one new row.

Ship tip at cut: `e890103cc78ddd8e0b201cc6d2de6ca8d96c024d`
Live pin: `20260730b115`
Images: `talaria-{homepage,trading-chart}:canary-20260730b115`
Prior pin (rollback target): `20260730b114`
Restore point: `/root/talaria-restore/PINNED-20260730b115.txt`

---

## Payload rows (SHA-resolved)

| Row | Introducing SHA (full) | Branch / notes |
|---|---|---|
| **Rayan #8** gap reconcile + explicit-place audit | `2baa2c5b162ebff0c101d76a09ef9f36f488441f` | `manager-d/trade-correctness` |
| **TAL-01807b** visual-rebind | `2baa2c5b162ebff0c101d76a09ef9f36f488441f` | same introducer as Rayan #8 |
| **TAL-01896** duration norm | `cf32a86d30dd82ac53c8f139b5a381c9306c3ee5` | served in `dist-v9/assets/talaria-v9-live.js` |
| **EXCURSION-SINGLE-OWNER-V1** | `ccc9b34c1fcf24f69b091d0706112e0ae11db659` | |
| **TRADE-EVICT-V1** | `987ee25fb98fdbbcc37bca49eb267d74539ae1f9` | |
| **INDICATOR-EVICT / clearIndicators** | `71c4c1b0ea0d8b91d525b2da2992c5f5b27ac934` | **named SHA on `manager-e/indicator-eviction`**; orphan `9b0a1e0eaea99d2d5853a3833194dfdfacadacd5` rejected (no branch, identical tree) |
| **P0 WINDOW-CLAIM** (new in b115) | `e890103cc78ddd8e0b201cc6d2de6ca8d96c024d` | `manager-b/plan3-20260727`. Claim off the event loop, `lock_timeout`, abortable release |

Assembly commits (not payload introducers) are unchanged from the b114 manifest:
train merge `aee8bf7a1c3cafac945cad874095927479f9d06d`, E carrier `767211a93431739d19e5a435e7b3fea3e456539f`,
soak restore `75e713d16f0ac76d9a585147c7bf2a3fb3789a1e`.

---

## Wire verification (HTTP, not ancestry)

```
window.__TALARIA_CHART_BUILD_ID='20260730b115'   stamp_v_refs=65
order-manager   M24_ORDER_ID_GAP_RECONCILE=1  ORDER_EXPLICIT_PLACE_AUDIT=1
                ORDER_PAIR_SWITCH_VISUAL_REBIND=1  EXCURSION_SINGLE_OWNER=2  TRADE_EVICT=2
indicators      INDICATOR_EVICT=1   _evictClearedIndicatorSettingsV1=3
dist-v9         TRADE_DURATION_NORM=1  (/chart/dist-v9/assets/talaria-v9-live.js)
chart-window-limit.js  32,691 bytes  CONTROL_TIMEOUT_MS=4  release-via-controlFetch=1
image           claim=sync def, session-state=run_in_threadpool
```

## P0 close condition — behavioural, not marker

| arm | result |
|---|---|
| claim under held `users.id FOR UPDATE`, **b114** | 27.6 s |
| claim under held `users.id FOR UPDATE`, **b115** | **503 in 3.07 s** (`chart_window_claim_busy`) |
| `/api/auth/me` during that wait | 107 ms |
| reload + second tab, both tabs live 45 s | no request ≥9 s; `/release` answered **200 same second** (nginx log) |

`stillOpen` in the browser probe was a **false positive** on the first two runs: a request
issued during unload cannot have its outcome delivered over CDP once the document is gone.
The probe now separates `unresolvedAcrossUnload` from a genuine held socket and points at the
server access log as the arbiter for those. Recorded because it would otherwise read as a
surviving hang.
