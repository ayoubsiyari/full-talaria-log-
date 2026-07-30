# Train manifest — `20260730b114`

**Resolved by SHA, not by commit message.** TEST-01 / Director addendum 2026-07-30.

Ship tip at cut: `75e713d16f0ac76d9a585147c7bf2a3fb3789a1e`  
Live pin: `20260730b114`  
Images: `talaria-{homepage,trading-chart}:canary-20260730b114`

Every payload row below is identified by the **introducing commit SHA**. Message matching is
explicitly rejected for this train — an orphaned duplicate of E's fix has an identical subject,
timestamp and 199-line diff.

---

## Payload rows (SHA-resolved)

| Row | Introducing SHA (full) | Branch / notes |
|---|---|---|
| **Rayan #8** gap reconcile + explicit-place audit | `2baa2c5b162ebff0c101d76a09ef9f36f488441f` | On `manager-d/trade-correctness`; ancestor of train merge. Markers: `__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1`, `__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1` |
| **TAL-01807b** visual-rebind | `2baa2c5b162ebff0c101d76a09ef9f36f488441f` | Same introducer as Rayan #8 (one commit). Marker: `__TALARIA_DISABLE_ORDER_PAIR_SWITCH_VISUAL_REBIND_V1` |
| **TAL-01896** duration norm | `cf32a86d30dd82ac53c8f139b5a381c9306c3ee5` | Ancestor of train merge. Marker: `__TALARIA_DISABLE_TRADE_DURATION_NORM_V1`. Served on wire at `/chart/dist-v9/assets/talaria-v9-live.js` |
| **EXCURSION-SINGLE-OWNER-V1** | `ccc9b34c1fcf24f69b091d0706112e0ae11db659` | Ancestor of train merge. Marker: `__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1` |
| **TRADE-EVICT-V1** | `987ee25fb98fdbbcc37bca49eb267d74539ae1f9` | Ancestor of train merge. Marker: `__TALARIA_DISABLE_TRADE_EVICT_V1` |
| **INDICATOR-EVICT / clearIndicators** | `71c4c1b0ea0d8b91d525b2da2992c5f5b27ac934` | **Named SHA on `manager-e/indicator-eviction`.** See E binding below. |

### Assembly commits (not payload introducers)

| Role | SHA | Notes |
|---|---|---|
| Train merge (D branch) | `aee8bf7a1c3cafac945cad874095927479f9d06d` | Merges `77f6c56fe4ad090033780081701a56add7a50141` into B tip |
| E carrier on tip | `767211a93431739d19e5a435e7b3fea3e456539f` | Cherry-pick of E's patch onto the train after the D merge — **not** the named SHA |
| Soak restore assertion (build unblock) | `75e713d16f0ac76d9a585147c7bf2a3fb3789a1e` | Accepts M24 gap-reconciled `orderIdCounter`; not a product payload row |

---

## E binding — SHA `71c4c1b0e`, orphan rejected

| | SHA | Tree | Branch |
|---|---|---|---|
| **Named (use this)** | `71c4c1b0ea0d8b91d525b2da2992c5f5b27ac934` | `7d34864d446124cf94f21429e50a147713c07426` | `manager-e/indicator-eviction` |
| **Orphan (do not use)** | `9b0a1e0eaea99d2d5853a3833194dfdfacadacd5` | `7d34864d446124cf94f21429e50a147713c07426` (identical) | **none** |
| Tip carrier | `767211a93431739d19e5a435e7b3fea3e456539f` | different whole-tree (train parent) | `manager-b/plan3-20260727` |

- Subject, author date (`2026-07-30 17:12:00 +0100`) and 199-line indicator diff are identical
  between the named SHA and the orphan. Resolving by message would have been ambiguous —
  that is why this row is bound to `71c4c1b0e` only.
- Indicator-file **patch-id** (stable) for the eviction hunks:
  `dc4359285609dc2ce1d0c5d67353ccb6de67b72d` — same for `71c4c1b0e`, `9b0a1e0ea`, and
  `767211a93`.
- Eviction **function bytes** (`Chart.prototype._evictClearedIndicatorSettingsV1` …) are
  identical across `71c4c1b0e`, `9b0a1e0ea`, tip carrier and `HEAD`
  (fn sha256 prefix `ee92fb16c551d88f5c55`). The tip's full `chart-indicators-full.js` blob
  differs because other train changes share that file; the E mechanism does not.

### Wire verification (not ancestry)

Live `20260730b114` / `talaria-homepage:canary-20260730b114`:

```
_evictClearedIndicatorSettingsV1  count=3
__TALARIA_DISABLE_INDICATOR_EVICT_V1  count=1
HTTP fetch of /chart/modules/chart-indicators-full.js  matches
```

b113 lacked `_evictClearedIndicatorSettingsV1`. b114 has it. E can grade against this stamp.

---

## How to re-verify a row by SHA (not by message)

```bash
# E — named SHA only
git branch -a --contains 71c4c1b0ea0d8b91d525b2da2992c5f5b27ac934
# expect: manager-e/indicator-eviction

git branch -a --contains 9b0a1e0eaea99d2d5853a3833194dfdfacadacd5
# expect: empty

# Mechanism on the running page
curl -sS http://127.0.0.1:3000/chart/modules/chart-indicators-full.js \
  | grep -c _evictClearedIndicatorSettingsV1
# expect: >= 1
```
