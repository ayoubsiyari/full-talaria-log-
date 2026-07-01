# Talaria — Chart Dev Response: `TALARIA_DEV_ASKS.md`

**Re:** Page 5 close-out (non-blocking)  
**From:** chart / homepage dev  
**To:** dashboard / analytics  
**Date:** 2026-07-01

---

## TL;DR

| Ask | Status |
|-----|--------|
| **1. One real live-replay `exportTradesToJSON`** | **Not delivered yet.** Synthetic Milestone-4 fixtures are in `docs/fixtures/`; a real replay export still requires one chart session run + UI export (steps below). |
| **2. User import wired to `normalizeChartExport`?** | **`normalizeChartExport` and `SHOW_QA_EXCURSION_SOURCE` are not in this repo** (analytics scaffold only). **Live session journal → dashboard is wired**; **chart JSON file upload → adapter is not.** |

---

## 1. Real live-replay export (end-to-end proof)

### Current state

We agree this is the gold standard. Page 5 reconciling against generator fixtures proves the **dashboard math**, not the **chart runtime**.

**What exists today:**

| Artifact | Source | Use |
|----------|--------|-----|
| `docs/fixtures/trade_journal_qa_200.json` | `generate_milestone4_json_export.py` | Chart-shaped Milestone-4; per-bar arrays; validated invariants |
| `docs/fixtures/trade_journal_qa_50.json` | same | Smaller QA set |
| `docs/fixtures/talaria_regenerated_fixtures_2026-07-01.zip` | bundle | Delivery package |

These match `buildMilestone4ExportSnapshot()` / `exportTradesToJSON()` structure and are suitable for adapter QA **until** a real export exists. They are **not** a substitute for proving the chart records bar paths correctly during replay.

**What we do not have:** a `trade_journal_YYYY-MM-DD.json` downloaded from an actual backtest replay session in this repo.

### Why it is not in-repo yet

Real export is produced only from a running chart session where:

1. Trades were opened and closed through `order-manager.js` during replay.
2. Post-exit windows had time to complete (async `total_mfe_r`, `capture_ratio`, `post_exit_bar_*`, etc.).
3. The user clicks **Export to JSON** in the All Trades modal.

That requires a live chart environment with market data and a completed replay — not reproducible from scripts alone without `DATABASE_URL` session rows or a browser session.

### How to produce it (chart dev / QA)

1. Open chart (`/chart/`).
2. Start a backtest replay; run until **20–50+ closed trades** (mix of TP / SL / manual / BE).
3. **Keep replay running** after the last close so post-exit tracking can finish on most trades.
4. All Trades modal → **Export to JSON** (`exportJSONBtn` → `exportTradesToJSON()` → `buildMilestone4ExportSnapshot()`).
5. Save as `docs/fixtures/trade_journal_live_replay_YYYY-MM-DD.json` and share.

**Alternative (if session already in DB):** journal payloads are stored per trade in `trading_session_journal_trades.payload_json` (same objects as `state.journal`). A DBA/dev with `DATABASE_URL` can assemble a Milestone-4 snapshot from those rows; we have not checked in a dump script yet.

### What analytics should expect in the real file

Top-level shape (same as fixtures):

```json
{
  "session_summary": { "session_id", "start_balance", "current_balance", ... },
  "instruments": { "EURUSD": { ... }, ... },
  "per_instrument_stats": { ... },
  "journal_by_ticker": { ... },
  "trades": [ /* full tradeJournal objects */ ]
}
```

Per trade, the fields Page 5 cares about are written at close + post-exit in `order-manager.js`:

- Per-bar: `bar_high_r[]`, `bar_low_r[]`, `bar_close_r[]` (per-bar H/L/C in R, **not** running envelopes)
- Scalars: `mfe_r`, `mae_r` (MAE negative), `rMultiple`, `total_mfe_r`, `capture_ratio`
- Post-exit: `post_exit_bar_high_r[]`, `post_exit_bar_low_r[]`, `would_have_won`, `exit_confirmed`, etc.

See `docs/TALARIA_FULL_EXPORT_ANSWERS.md` and `docs/trade-input-data-catalog.md` for semantics.

### Commitment

We will attach **one real replay export** (20–50 trades) to `docs/fixtures/` as soon as a session is run. Until then, use `trade_journal_qa_50.json` / `trade_journal_qa_200.json` for adapter and Page 5 regression — **do not** use `talaria-200-trades-full-2026.csv` for path QA.

---

## 2. Is user-facing import wired to `normalizeChartExport`?

### Short answer

**No — not via `normalizeChartExport`.** That function and `SHOW_QA_EXCURSION_SOURCE` **do not exist in this repository**; they live on the analytics / V16 QA scaffold.

**Yes — for users who trade on the chart in a session**, full journal payloads already reach the dashboard **without** a file import or `normalizeChartExport`.

**No — for users who only have a downloaded chart JSON file**, there is **no** production UI path that uploads it and feeds Page 5 today.

### Data paths in this repo

#### Path A — Live chart session (production, wired)

```
Chart replay → tradeJournal[] → session state sync
  → trading_session_journal_trades (SQL) + state.journal
  → GET /api/sessions/:id/state  OR  GET /api/sessions/:id/journal-trades
  → dashboard
```

**V16 dashboard (`TalariaV16.jsx` via `useV16LiveBootstrap`):**

- `window.__TALARIA_V16_FETCH_TRADES_FOR_SESSION__` → `fetchAndMapTradesForSession()` in `v16Mappers.ts`
- Fetches `/api/sessions/:id/journal-trades`
- `flattenJournalApiTrade()` spreads full `payload` (includes `bar_*_r`, post-exit arrays, etc.)
- `mapJournalRowToV16Trade()` spreads `...row` → `compositeTrades` on the session
- V16 excursion math reads fields directly from `compositeTrades` (e.g. `post_exit_bar_high_r`, `mfe_r`, `mae_r`)

**Session analytics panel (`SessionAnalyticsPanel.tsx` — Backtest OS / Price Behavior):**

- Loads `state.journal` from `/api/sessions/:id/state`
- Inline `normalizedTrades` useMemo (not `normalizeChartExport`)
- Passes `filteredTrades` to `BacktestOsDashboardLayout` → `PriceBehaviorExplorer`
- `priceBehaviorUtils.ts` applies `runningMax()` on `bar_high_r` / `bar_low_r` for display envelopes

So: **real users trading on the chart already populate Page 5-style views from the same journal objects the chart would put in `exportTradesToJSON`.** No adapter layer is required for that path if field names match what your scaffold’s `normalizeChartExport` outputs.

#### Path B — CSV import (partial, wired)

- `SessionAnalyticsPanel` → POST `/api/sessions/:id/journal/import-csv`
- Replaces or merges journal from CSV
- **Does not** run `normalizeChartExport`; CSV may omit bar arrays

#### Path C — Chart JSON file import (not wired)

- No UI for “Import `trade_journal_*.json`” in homepage or chart
- No call site for `normalizeChartExport` in this repo
- **This is the production gap** if the intended UX is: user exports JSON from chart → uploads elsewhere → Page 5

### Comparison to QA scaffold

| Consumer | How trades arrive | `normalizeChartExport` |
|----------|-------------------|------------------------|
| Analytics QA scaffold (`SHOW_QA_EXCURSION_SOURCE`) | Fixture file → adapter | **Yes** (scaffold only) |
| V16 live dashboard | Session API → `compositeTrades` | **No** — raw journal payload |
| SessionAnalyticsPanel | Session API → `state.journal` | **No** — inline normalization |
| CSV import | `/journal/import-csv` | **No** |

### Recommendation for close-out

1. **For live backtest users:** Page 5 should already work when `compositeTrades` / `state.journal` contain closed trades with excursion fields. Verify on a staging session with real chart trades (not fixtures).

2. **For JSON upload UX:** Wire import once in homepage (or V16):
   - Accept Milestone-4 file (`trades` array or full snapshot)
   - Run **`normalizeChartExport`** (analytics package) or equivalent mapping
   - Set source `compositeTrades` the same way the QA scaffold does

3. **Adapter location:** If `normalizeChartExport` stays in the analytics repo, either publish it as a shared module or duplicate the thin field mapping in `v16Mappers.ts` / a new `chartExportAdapter.ts` in homepage — the session API path already preserves all payload keys via `flattenJournalApiTrade`.

---

## References

| Topic | Location |
|-------|----------|
| JSON export UI | `chart v 1.4/chart/modules/order-manager.js` → `buildMilestone4ExportSnapshot`, `exportTradesToJSON` |
| Journal sync | `chart v 1.4/chart/api_server.py` → `_sync_trading_session_journal_trades`, `/journal-trades` |
| V16 trade fetch | `homepage/src/app/dashboard/v16/v16Mappers.ts` → `fetchJournalTradesForSession`, `mapJournalRowToV16Trade` |
| Session analytics | `homepage/src/app/dashboard/analytics/SessionAnalyticsPanel.tsx` |
| Excursion display math | `homepage/src/app/dashboard/analytics/priceBehaviorUtils.ts` |
| Synthetic fixtures | `docs/fixtures/README.md` |
| Export how-to | `docs/TALARIA_JSON_EXPORT_RESPONSE.md` |
| Bar-array semantics | `docs/TALARIA_FULL_EXPORT_ANSWERS.md` |

---

## Action items

| Owner | Item |
|-------|------|
| Chart dev | Run one backtest replay → Export JSON → add `docs/fixtures/trade_journal_live_replay_*.json` |
| Analytics | Confirm V16 excursion on **staging session journal** (Path A) matches fixture QA |
| Homepage / analytics | If JSON upload is required for non-chart users, wire Path C through `normalizeChartExport` |
