# I16 — order/trade persistence stamping (Lane 3 checkpoint)

**Task:** I16 persistence stamping on A6-4/A6-2 order records — add `build_id` + `schema_version` at write time before cohort.  
**RC:** Customer-data durability (I16 / D-031) — not an RC-1…8 symptom fix; enables exact corrupt-PnL era filtering per `CORRUPT-PNL-FILTER-HEURISTIC.md`.  
**Build:** `20260717b43`  
**Status:** DONE (dev only) — NEEDS-LIVE-CONFIRM for sessionStorage/journal stamp spot-check on built product.

---

## 1. Task + RC

| Field | Value |
|---|---|
| Goal | Stamp every persisted order/trade row with `build_id` + `schema_version` at write time (A6-2 session patch + host snapshot + journal close). |
| Invariant | **I16 a/b/c/d** — additive fields only; kill-switch rollback leaves rows readable; new writes stamped when ON; state matrix below. |
| Switch | **`__TALARIA_DISABLE_ORDER_PERSIST_STAMP_V1`** — unset = ON (stamping active). Independent of A6-2/A6-4 package switches. |

---

## 2. What I changed — file by file

| Path | Change |
|---|---|
| `chart v 1.4/chart/modules/order-runtime-persist.mjs` | **I16 core:** `ORDER_RECORD_SCHEMA_VERSION=1`, `orderPersistStampV1Enabled`, `resolvePersistBuildId`, `stampPersistedOrderRecord(s)`, wire into `buildRuntimeOrderPatch`. |
| `homepage/public/chart/modules/order-runtime-persist.mjs` | I8 mirror — byte-identical. |
| `chart v 1.4/chart/modules/order-runtime-persist.test.mjs` | +9 assertions: switch default, stamp ON/OFF, restore roundtrip with stamp fields. |
| `homepage/public/chart/modules/order-runtime-persist.test.mjs` | I8 mirror — byte-identical. |
| `chart v 1.4/chart/modules/order-host-store.mjs` | Import stamp helpers; `buildHostOrderStoreSnapshot` stamps `pendingOrders`, `openPositions`, `closedPositions`, `orders`; fan-out passes `win`. |
| `homepage/public/chart/modules/order-host-store.mjs` | I8 mirror — byte-identical. |
| `chart v 1.4/chart/modules/order-host-store.test.mjs` | +3 assertions: snapshot rows stamped ON; unstamped when switch OFF. |
| `homepage/public/chart/modules/order-host-store.test.mjs` | I8 mirror — byte-identical. |
| `chart v 1.4/chart/modules/order-manager.js` | Browser mirror of stamp helpers; stamp in `_buildRuntimeOrderPersistPatch`, legacy persist patch, `_enrichJournalEntryForPersistence`, `upsertJournalEntry`. |
| `homepage/public/chart/modules/order-manager.js` | I8 mirror — byte-identical. |
| `chart v 1.4/chart/chart.js` | `CHART_ENGINE_BUILD` → `20260717b43`. |
| `homepage/public/chart/chart.js` | I8 mirror. |
| Harness + embed + dist-v9 + SW | Build id bumped to **`20260717b43`** (both trees). |

No other product files touched.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Gates |
|---|---|---|
| **`__TALARIA_DISABLE_ORDER_PERSIST_STAMP_V1`** | **ON** (unset) | `order-runtime-persist.mjs` (`buildRuntimeOrderPatch`), `order-host-store.mjs` (`buildHostOrderStoreSnapshot`), `order-manager.js` (persist patch + journal paths). |

**OFF behavior:** No `build_id` / `schema_version` added on new writes; all existing restore/read paths unchanged (extra fields ignored if present).  
**RED-again:** property tests assert unstamped rows when `__TALARIA_DISABLE_ORDER_PERSIST_STAMP_V1: true`.

---

## 4. Proof — RED → GREEN

```text
node chart\ v\ 1.4\chart\modules\order-runtime-persist.test.mjs
=== 25 passed, 0 failed ===

node chart\ v\ 1.4\chart\modules\order-host-store.test.mjs
19 passed, 0 failed
```

**RED (pre-fix):** rows in session patch / host snapshot lacked `build_id` (would fail new I16 assertions).  
**GREEN:** stamped rows carry `build_id='20260717b43'` + `schema_version=1`; restore via `applyRuntimeOrderPatchToStore` preserves stamps.  
**RED-again:** `STAMP_OFF` scope → no stamps (same test file, I16 section).

**Build:** `BUILD_ID=20260717b43 npm run version:bump` + `BUILD_ID=20260717b43 npm run build:live` (dist-v9 + harness at b43).

**I15:** Property tests only — no synthetic UI proxy. PO must confirm stamps in real sessionStorage/journal on built product.

---

## 5. Invariants checked

| Invariant | How satisfied |
|---|---|
| **I16a** additive | Only adds optional `build_id`, `schema_version`; no key/schema migration. |
| **I16b** rollback-readable | Switch OFF stops new stamps; legacy rows + stamped rows still parse/restore. |
| **I16c** write-time stamp | A6-2 patch, host snapshot, journal close/upsert stamp at write. |
| **I16d** state matrix | Section below. |
| **I3** one switch | Single dedicated switch for this checkpoint. |
| **I8** both trees | Module mirrors SHA256-verified MATCH; dist/harness b43 both trees. |

---

## 6. Data-compatibility state matrix (I16d)

| Stored artifact | Pre-I16 row (legacy) | Switch ON — new write | Switch OFF — new write | Kill-switch OFF + old stamped rows | Prev-build redeploy |
|---|---|---|---|---|---|
| `sessionStorage` `chart_orders_runtime_session_v1:*` pending/open rows | No stamp fields; **readable** | Each row gains `build_id` + `schema_version` | Legacy shape (no new stamps) | Stamped rows **still restore**; reader ignores unknown fields | Same session blob readable |
| A6-2 patch envelope (`pending_orders`, `open_positions`, `account_runtime`, …) | Unchanged top-level keys | Row-level stamps only; envelope keys unchanged | Identical to pre-I16 | Full roundtrip | No data loss |
| Host snapshot (`buildHostOrderStoreSnapshot`) | In-memory/projection; optional stamps absent | All order arrays stamped per row | Unstamped rows | N/A (not a separate store) | N/A |
| Trade journal (`tradeJournal` → session PATCH) | No stamp; **5% heuristic fallback** | Close/upsert adds stamps; upsert merge preserves first stamp (`onlyIfMissing`) | Legacy journal shape | Journal rows with stamps remain valid | Dashboard can filter by `build_id` |
| Corrupt-PnL filter | Heuristic only (`CORRUPT-PNL-FILTER-HEURISTIC.md`) | **Exact filter:** exclude `build_id` before owning-panel-price cohort build | Heuristic still applies to unstamped rows | Stamped corrupt-era rows remain identifiable | No wipe required |

**Corrupt-era cutoff (dashboard):** exclude closed trades where `build_id` is absent **or** `<` first cohort build with `__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1` unset (Step 0 stopgap landed). Keep 5% heuristic for unstamped legacy rows.

---

## 7. What I did NOT do / limits

- No retroactive backfill of legacy session/journal rows (I16a — additive forward only).
- No harness scenario for live sessionStorage inspection (property tests only).
- `homepage/public/chart/dist-v9` synced manually after `sync-v9-to-homepage` EPERM (contents match `chart v 1.4` dist at b43).
- Stamping does not replace Step 0 owning-panel-price fix — it classifies data for dashboard filtering.

---

## 8. Live-verification handoff

1. Deploy/serve build **`20260717b43`**; confirm `window.__TALARIA_CHART_BUILD_ID` in host + panel iframe.
2. Place + close one trade in a session with `?sessionId=…`.
3. DevTools → Application → sessionStorage → key `chart_orders_runtime_session_v1:{sessionId}:panel:host` (multichart host): open/pending rows should include `"build_id":"20260717b43","schema_version":1`.
4. Session PATCH / journal payload: closed trade row should carry same fields.
5. Set `window.__TALARIA_DISABLE_ORDER_PERSIST_STAMP_V1=true`, reload, place new order: new rows **must not** gain stamps; prior stamped rows still load.

---

## 9. Status

**DONE (dev only) — NEEDS-LIVE-CONFIRM** (property tests + build b43; no PO sessionStorage inspection yet).
