# TAL-01865 — Restore manifest

**Ruling.** On refresh, restore identity and configuration only. Price data and computed
indicators reload as if fresh. Two exceptions that must not be treated as derived: the
replay playhead, and anything money-path.

Status of every item in the ruling, against the tree at `67ec5bcef`. "Verified" means I
read the write site and the read site; "unverified" is called out rather than assumed.

---

## 1. Where restore state lives today

Two independent stores, and they behave differently.

**Session backup** — `_writeTradingSessionLocalBackup` (chart.js:13305), written through the
`userStorage` wrapper, keyed per session, with a hot/durable dual tier under the M19 trim
flag. Payload: `journal`, `pending_orders`, `open_positions`, `closed_positions`,
`account_runtime{balance,equity,initialBalance,session_current_time}`, `order_counters`,
`per_instrument_stats`, `journal_by_ticker`, `chartView{timeframe,fileId}`,
`replay{currentIndex,replayTimestamp,timeframe,speed,tickElapsedMs,playbackMode,isActive}`,
`indicators`, `indicatorsClearedAt`.

**Drawings** — separate, per symbol, via the `chart_drawings` API with `chart_drawings_*`
cache keys. Deliberately excluded from the session blob to avoid quota exhaustion
(chart.js:13422).

---

## 2. Classification

| Item | Persisted today | Where | Gap |
|---|---|---|---|
| Active symbol | Yes | `chartView.fileId` | none (landed as RESTORE-A) |
| Timeframe (host) | Yes | `chartView.timeframe` | none |
| Replay playhead | Yes | `replay.currentIndex` + `replayTimestamp` | see §4 |
| Speed knob | Yes | `replay.speed`, `tickElapsedMs`, `playbackMode` | step knob unverified |
| Indicators + settings | Yes | `payload.indicators` | none |
| Drawing tools | Yes | `chart_drawings` API | see §3 — already market-time |
| Open positions | Yes | `open_positions` | see §5 |
| Pending orders | Yes | `pending_orders` | see §5 |
| Journal | Yes | `journal` (+ hot-tier trim) | see §5 |
| Balance | Yes | `account_runtime` | see §5 |
| Session identity / date range / trading-vs-supporting split | Server-side session object | `GET /api/sessions/:id` | not a refresh risk; supporting split now enforced at 3 layers (RAYAN8-A) |
| **Focused panel** | **No** | — | **gap** |
| **Per-panel symbol / timeframe** | **No** | — | **gap** |
| **Chart type** | **No** | — | **gap** |
| **Scale / zoom** | **No** | — | **gap** — `chartView` carries only timeframe and fileId |
| **Pinned items and timeframes** | Unverified | `favorites-manager.js` exists | needs a pass |
| **Timezone selection** | Unverified | `timezone-manager.js` exists | needs a pass |

The concentration is the multichart layout. The session backup is **host-scoped by
construction** — `_writeTradingSessionLocalBackup` refuses to write `fileId` when
`this.isPanel` (chart.js:13387), deliberately, because the backup is keyed by session and
not by panel, so a panel writing the pair would decide the host's boot symbol. That guard is
correct and must stay. It also means **there is nowhere for per-panel state to go today**.
Per-panel restore needs a panel-keyed sub-map inside the session backup, not a change to the
existing key.

---

## 3. Drawings are already in market time — correction to the brief

The ruling asks for drawings in market time rather than bar index. **That is already how they
are written, and the round trip is anchored.** Reporting it because it changes the shape of
the work, not to argue the principle.

- `BaseDrawing.toJSON()` (drawing-tools-base.js:2994) serialises `points` as
  `{timestamp, price}` and sets `coordinateSystem: 'timestamp'` whenever `timestampPoints`
  exist, and back-computes them from `CoordinateUtils.indexToTimestamp` on first save if they
  do not. Its own comment: *"never recalculate from indices."*
- `loadDrawings()` (drawing-tools-manager.js:14000) captures `originalTimestampPoints`,
  converts `item.points` back through `CoordinateUtils.pointsFromTimestamps` **against
  current data** before constructing the tool, then **re-attaches** the original timestamps to
  the instance and calls `_syncDrawingPointsFromTimestamps`.

So bars reloading and indices shifting is already handled on the main path. Three residual
doors, in descending severity:

1. **`importDrawings` (14251-14257) is index-only.** It calls `toolInfo.class.fromJSON(item)`
   with no chart argument, no `pointsFromTimestamps` conversion, and no timestamp
   re-attachment. Every other load path does all three. An imported drawing is anchored to
   whatever index it had in the exporting tree.
2. **Per-tool `fromJSON` is inconsistent, and is currently load-bearing only by accident.**
   `NoteTool`, `PriceNoteTool`, `PriceLabelTool` and `PriceLabel2Tool` rebuild
   `timestampPoints` themselves; `TextTool`, `NoteBoxTool`, `AnchoredTextTool`, `PinTool`,
   `TableTool`, `CalloutTool` and `CommentTool` do not. This is harmless **only** because
   `loadDrawings` re-attaches timestamps generically afterwards. Any new load path that omits
   that step silently reverts seven tool types to index anchoring, and it will look like a
   drawing bug rather than a restore bug.
3. **`toJSON` falls back to `coordinateSystem: 'index'`** when `timestampPoints` is empty and
   `chart.data` is also empty — i.e. a drawing created and saved before data arrives is
   persisted in index space. Narrow, but it is a panel-init race, which is my lane.

Recommendation: do not rewrite the coordinate model. Close door 1, and make door 2
structural by hoisting the timestamp re-attachment into a single deserialise entry point
that every path must go through, so the per-tool inconsistency stops mattering.

---

## 4. Playhead

Persisted as both `currentIndex` **and** `replayTimestamp`. The pair matters: index alone
would be the DEF-04 failure in the restore path, since a reloaded window can start at a
different bar. Anchoring on the timestamp and deriving the index is the correct rule, and the
data to do it is already stored.

The known defect here was ordering, not persistence, and it is fixed: RESTORE-B established
that `_replayUserOwnsViewport()` treated "viewport is far from the playhead" as evidence the
user owned the viewport, so at boot the further wrong the viewport was, the more certainly
the sync declined to correct it. `_alignReplayViewportAfterRestore()` now runs unconditionally
at the end of `loadTradingSessionStateIfNeeded`. TAL-01865's complaint about the playhead
resetting should be re-tested against that fix before any further work is scoped.

---

## 5. Money path — for D and TOP review, not for me to land

`journal`, `pending_orders`, `open_positions`, `closed_positions`, `account_runtime` and
`order_counters` are all persisted today, so the ruling's "a refresh that clears trades is
unrecoverable" is not currently violated on the happy path. What I am flagging rather than
fixing:

- **The hot tier trims.** Under `_m19PersistTrimV1Enabled`, hot writes run
  `_m19TrimRecordsForHotPersist` over the journal, pending orders, open positions and closed
  positions (chart.js:13327-13342), and drop `journal_by_ticker` and `per_instrument_stats`
  outright (12919). Restore merges the hot and durable tiers. Whether every money-path field
  survives that merge is D's call, not mine.
- **Two independent degradation paths drop the money path, and they drop different
  things.** Both discard journal, pending orders, open positions and closed positions:
  - *Byte-budget last resort* (12929): keeps `savedAt`, `account_runtime`, `order_counters`,
    `replay`, `chartView`.
  - *`QuotaExceededError` retry* (13433 → 13377): keeps `account_runtime{balance, equity,
    initialBalance}` **and nothing else from the order manager** — notably **not
    `order_counters`**.

  The second is the sharper one. It writes a balance with no orders and no counters, so a
  session restored from it can re-mint an order id that already exists — which is precisely
  the open red row `m24-order-id-restore-stability.red.test.mjs`. And the situation that
  triggers it is a full quota, i.e. exactly when the backup matters most. Both paths belong
  to D; I am flagging the counters asymmetry because it connects an existing red row to a
  concrete write site.

---

## 6. Gate shape

Per the ruling the boot-floor gate becomes a measurement, deferred until E's window lands: a
refreshed page must settle at the boot floor, and settling higher points at the restore path
re-importing the full range and recomputing indicators across it.

The manifest itself needs a separate gate, and it should be a **round-trip identity** rather
than a presence check: for each item in §2, set a non-default value, serialise, reload from
the serialised form, and assert the value survives — with an anti-vacuity arm that fails when
the value is left at its default, so a gate cannot pass by restoring nothing. Presence checks
on a manifest are exactly the vacuous shape PROC-3 exists to catch.
