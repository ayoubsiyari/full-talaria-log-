# HANDOFF → Manager A — distinct hydrate reasons (SAFE-01 hazard #3)

**From:** Manager B · PAR-01 stream 2 · [SAFE-01 deepen handoff](124df7f7-25eb-402e-b868-77f894a9d5d3)
**File:** `chart v 1.4/chart/chart.js` (homepage twin mirrors same line numbers today)
**Why:** so B can gate hot journal writes on the unreachable arm only, without breaking the brand-new-session trade (B-W16 §8a).

---

## Exact line ranges (current tree)

| Seam | Lines | What happens |
|---|---|---|
| Journal pre-hydrate allow | `12350–12361`, **`12364–12366`** | `_sessionStatePatchAllowedBeforeHydrate` → `return true` for journal-related |
| Early return arm 1 — failed GET | **`11901–11903`** | `!res.ok` → `_applyTradingSessionFromLocalBackupOnly(sessionId)` |
| Early return arm 2 — brand-new | **`11907–11909`** | `res.ok` + `state == null` → same helper |
| Early return arm 3 — throw | **`12267–12269`** | `catch` → same helper (unreachable class) |
| `_sessionStateLoadedFor` on local-backup | **`11707`**, **`11711`** | Set inside helper; success path at **`11912`** |
| Reason passed to OM today | **`11731–11732`** | `_m19CommitJournalArray(..., 'local-backup-hydrate')` — one string for all arms |
| Contrast: good hydrate | **`11979–11983`** | `'session-state-hydrate'` |

**Critical API constraint:** when backup/OM is missing, `11701–11708` sets `_sessionStateLoadedFor` and **returns without calling `_m19CommitJournalArray`**. Splitting the reason only at `11732` is insufficient — thread the reason into the early return too.

Clearing the pre-hydrate journal allow (`12366`) alone does **not** close the wipe after failed GET, because `11707`/`11711` set `_sessionStateLoadedFor` and bypass that gate.

---

## Proposed literals

| Literal | Emit from | Meaning |
|---|---|---|
| `'local-backup-unreachable'` | `11901–11903`, `12267–12269` | We do not know server journal |
| `'server-empty-hydrate'` | `11907–11909` | Server answered; no state (brand-new) |
| `'session-state-hydrate'` | unchanged | Full server hydrate |

Keep accepting legacy `'local-backup-hydrate'` on B as an alias of unreachable until A lands; A stops emitting it once the two new literals ship.

```text
_applyTradingSessionFromLocalBackupOnly(sessionId, hydrateReason)
  - always notify OM with hydrateReason, including the 11701–11708 path
  - existing backup merge path uses same hydrateReason at 11732
```

## What B will do when the signal lands

| Reason | Hot journal | Durable | Provenance |
|---|---|---|---|
| `'local-backup-unreachable'` / legacy `'local-backup-hydrate'` | **Suppress** (B-W18 kill-switch) | Suppress | stay `'unhydrated'` |
| `'server-empty-hydrate'` | **Allow** | Suppress (today) | unhydrated or later `'locally-authored'` |
| `'session-state-hydrate'` | Allow | Allow | `'hydrated'` |

## Acceptance ownership

| Cell | Owner | Assert |
|---|---|---|
| A1 — `!res.ok` → `'local-backup-unreachable'` (backup and no-backup) | A | |
| A2 — `res.ok` + null → `'server-empty-hydrate'` (backup and no-backup) | A | |
| A3 — `catch` → `'local-backup-unreachable'` | A | |
| A4 — success still `'session-state-hydrate'` | A | |
| B1 — after unreachable: hot journal not queued; kill restores | B | |
| B2 — after server-empty: hot queued; durable suppressed | B | |
| B3 — after session-state-hydrate: hot + durable both queue | B | |

No other production callers queue `journal:` outside `persistJournal`.
