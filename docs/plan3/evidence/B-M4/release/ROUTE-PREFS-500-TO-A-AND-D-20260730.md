# ROUTING — /api/chart/preferences was 500ing for every request. Read this before more front-end persistence work.

**From:** Manager B (release) · **To:** Manager A, Manager D · **Cc:** Director
**Raised:** 2026-07-30, canary `31.97.192.82:3000`, live pin `20260729b103`
**Repaired on canary at:** `2026-07-29T23:59:05Z`

## The finding

`GET /api/chart/preferences` answered **500 on every authenticated request**. Backend log, one line:

```
❌ Error loading preferences: (psycopg2.errors.UndefinedColumn)
   column user_preferences.indicator_settings_templates does not exist
```

`UserPreferences` (journal-backend/models.py) declares that column; the deployed table did not have it. SQLAlchemy names every column in its SELECT, so the query failed before touching a row.

## Why this matters to your rows

Both the **read** and the **write** path begin with the same
`UserPreferences.query.filter_by(user_id=...).first()`, so **every** load and **every** save failed — not a subset, not a race, not intermittent. The client then fell back to `localStorage` and logged a warning, so it looked like a front-end persistence bug from the browser side.

If a preference was expected to survive a refresh **on another device or after a cache clear**, it never persisted at all. Any persistence symptom should be re-checked against a working endpoint **before** any further front-end change is attributed. Front-end fixes may still be correct — several of them keep localStorage coherent, which is real — but the acceptance measurement was taken against a backend that could not store anything.

> Superseded in part by the 08:05Z update below: TAL-01865 / TAL-01747 (symbol) and the timezone reset are **not** on the cloud write path, so they are not explained by this 500. Read §2 of the update before re-testing anything.

**Concretely: do not close, and do not extend, a persistence packet on evidence gathered before `2026-07-29T23:59:05Z` on this host.**

## Instrument, so nobody has to take my word for it

| Question | Answer | How |
|---|---|---|
| Why 500 | missing column, one distinct error string | `31` occurrences, `1` distinct message in 180 min of backend log |
| Every save or some | every one | `31 GET 500`, `0` successes; read and write share the failing SELECT |
| Was it code or deployment | deployment | migration `add_indicator_settings_templates` **is** in the running image; `alembic_version` = `add_strategy_lab`, so it was never applied |
| Fixed | yes | ORM read and ORM write-flush both succeed post-repair; `0` errors since |

Repair is additive and idempotent (`ADD COLUMN IF NOT EXISTS`), applied via
`docs/plan3/evidence/B-M4/release/prefs-schema-drift-repair.sh --apply`. No image changed by the repair.

> **Correction, 2026-07-30T08:00Z.** I wrote that the `20260729b103` artifact was byte-for-byte what the PO measured. It was, until the b104 ship ran host retention, which **deleted the b103 image and tarball** — along with b100, b101 and b102 earlier. Cause: retention ranked build ids with a lexicographic `sort`, so `20260729b100`–`b104` sorted *below* `20260729b85` and every new build was retired as if it were the oldest, the moment it stopped being the live pin. Fixed (`sort -V`, plus explicit protection for the previously-live build and a `--self-test` that asserts the ordering). b103 has been **rebuilt from its recorded sha `153c835e2`** and re-tagged: source-identical to the graded build, image layers rebuilt, so **not** byte-identical. If C needs byte-identity rather than source-identity for a grade, say so and I will re-derive differently.

## UPDATE 2026-07-30T08:05Z — the write is proven working, and the blast radius is NARROWER than it looks

Two things changed since the section above: the write path is now proven over HTTP rather than through the ORM, and I measured **which settings are actually on that write path**. The second part matters more, because it stops a wrong attribution in both directions.

### 1. The write works, end to end, the way a browser does it

Round trip on `http://127.0.0.1:3000/api/chart/preferences` with a real bearer token, on a throwaway probe user created and deleted inside the script (`_prefs-write-roundtrip.sh`, no existing user's data was read or written):

| Step | Result |
|---|---|
| `GET` before write (the call that used to 500) | **200** |
| `POST` symbol + timezone + favourites | **200** |
| `GET` on a fresh connection — what a reload sees | **200, values returned** |
| Independent DB read, bypassing the API | row present, all three fields stored |
| Probe user removed | `users_left=0 prefs_left=0` |

`VERDICT=WRITE_PATH_PROVEN_OVER_HTTP`. Earlier 422s in the log were my own probe mangling its token with app-startup output; nothing to hunt.

### 2. What the 500 actually destroyed — and what it never touched

The cloud contract is **exactly 15 fields** (`loadFromLocalStorage()` in `preferences-sync.js`). The 500 killed all 15 in both directions:

`tool_defaults`, `timeframe_favorites`, `drawing_tool_favorites`, `chart_templates`, `keyboard_shortcuts`, `drawing_tool_styles`, `drawing_tool_templates`, `indicator_settings_templates`, `v9_chart_templates`, `panel_sync_settings`, `panel_settings`, `market_config`, `protection_settings`, `general_settings`, `keep_drawing_enabled`.

So **pins, favourites, all four template families, panel settings and layout, keyboard shortcuts and market config** genuinely had no cloud persistence. Those are worth re-testing now, and some of them are likely to come back green with no front-end change at all.

**But the two headline symptoms are not on that list, and this is load-bearing:**

- **Selected symbol is not persisted anywhere.** A census of the whole served tree (`chart v 1.4/chart` and `homepage/public/chart`) finds **zero** `setItem` calls for any symbol-named key, and `symbol` is not one of the 15 contract fields. `chart.js` re-derives `currentSymbol` from whichever session it loads (`resolvedTicker`, `session.fileName`, `session.symbol`). There is no save to fix and no restore to repair — **TAL-01865 / TAL-01747 is a missing capability, not a broken write.** The 500 cannot have caused it and the repair cannot fix it.
- **Timezone is local-only.** `timezone-manager.js` persists to `userStorage['chartTimezone']`, and `chartTimezone` appears **0 times** in `preferences-sync.js`. It is not on the cloud contract, so the 500 never touched it either. Whatever resets it is in the front end, and it is not this.

`market_config` is worth naming explicitly because it looks like it should carry the symbol and does not: it is `{ marketType, pipSize, pipValuePerLot }` only.

### 3. What that means for each of you

**D:** re-test the pins / favourites / templates / panel-layout family against the repaired endpoint before touching chart code — cross-device or fresh-profile, because same-browser localStorage masked the failure. **Do not** fold symbol-revert or timezone-reset into that batch; they are separate and still front-end. If a report only ever reproduced in one browser profile, the 500 is probably not its cause.

**A:** the persistence work aimed at localStorage coherence stays valid; nothing in the repair supersedes it. If you were about to add symbol to the restore path, note there is no existing key to migrate from — it is a new field on the contract, which is the V8/M15 discussion, not a bug fix.

**Both:** the Director's ruling stands — **do not build the V8/M15 preference contract on this write path yet.** It is proven working as of the round trip above, but it has been working for nine hours after being dead for at least three, on a host whose backend is still outside the canary stamp. A three-tier store over a silently-failing layer fails identically and reads as a front-end bug all over again.

### 4. Silent failures now announce themselves

`failedServerWrites` joins `degradedModules[]` in the support passport, so a ticket says "this user's saves were failing" instead of us inferring it from logs days later. Ledger: `chart v 1.4/chart/modules/server-write-failure-ledger.js`, kill-switch `__TALARIA_DISABLE_SERVER_WRITE_FAILURE_LEDGER_V1` (truthy, per call, climbs self→parent→top), gate `server-write-failure-ledger.test.mjs` 25/25 with five mutants. It mirrors through `localStorage` on purpose: failures happen in the chart realm, tickets are filed from the dashboard realm, and those are different pages.

## Two things this exposed that are still open

1. **`journal-backend` is not part of the canary stamp.** The ship path builds `trading-chart` and `homepage` only; the backend runs `talaria-journal-backend:latest`, up since 27 Jul. Any backend fix either of you lands will **not** reach the canary until that image is rebuilt. Mine to fix in the release path; flagging it because it silently invalidates backend acceptance.
2. **`chart-window-limit.js:374` is not a retrier.** It is the monkey-patched `window.fetch` passthrough, so Chrome attributes every failing request in the app to that line. The repetition was one request per realm per load — host page plus panels B, C, D — re-fired on each panel rebuild (visible as triplets one second apart in the access log). Capped now behind
   `__TALARIA_DISABLE_PREFS_CLOUD_FAILURE_CAP_V1` (default ON, truthy disables, climbs host→panel realms), gate `chart v 1.4/chart/modules/prefs-cloud-failure-cap.test.mjs`, 15/15 with two mutants.
