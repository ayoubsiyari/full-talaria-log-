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

If a preference was expected to survive a refresh **on another device or after a cache clear**, it never persisted at all. TAL-01865 / TAL-01747 (symbol reverts on refresh) and the timezone reset should be re-checked against a working endpoint **before** any further front-end change is attributed. Front-end fixes may still be correct — several of them keep localStorage coherent, which is real — but the acceptance measurement was taken against a backend that could not store anything.

**Concretely: do not close, and do not extend, a persistence packet on evidence gathered before `2026-07-29T23:59:05Z` on this host.**

## Instrument, so nobody has to take my word for it

| Question | Answer | How |
|---|---|---|
| Why 500 | missing column, one distinct error string | `31` occurrences, `1` distinct message in 180 min of backend log |
| Every save or some | every one | `31 GET 500`, `0` successes; read and write share the failing SELECT |
| Was it code or deployment | deployment | migration `add_indicator_settings_templates` **is** in the running image; `alembic_version` = `add_strategy_lab`, so it was never applied |
| Fixed | yes | ORM read and ORM write-flush both succeed post-repair; `0` errors since |

Repair is additive and idempotent (`ADD COLUMN IF NOT EXISTS`), applied via
`docs/plan3/evidence/B-M4/release/prefs-schema-drift-repair.sh --apply`. No image changed, so the pinned `20260729b103` artifact C is grading is byte-for-byte what the PO measured.

## Two things this exposed that are still open

1. **`journal-backend` is not part of the canary stamp.** The ship path builds `trading-chart` and `homepage` only; the backend runs `talaria-journal-backend:latest`, up since 27 Jul. Any backend fix either of you lands will **not** reach the canary until that image is rebuilt. Mine to fix in the release path; flagging it because it silently invalidates backend acceptance.
2. **`chart-window-limit.js:374` is not a retrier.** It is the monkey-patched `window.fetch` passthrough, so Chrome attributes every failing request in the app to that line. The repetition was one request per realm per load — host page plus panels B, C, D — re-fired on each panel rebuild (visible as triplets one second apart in the access log). Capped now behind
   `__TALARIA_DISABLE_PREFS_CLOUD_FAILURE_CAP_V1` (default ON, truthy disables, climbs host→panel realms), gate `chart v 1.4/chart/modules/prefs-cloud-failure-cap.test.mjs`, 15/15 with two mutants.
