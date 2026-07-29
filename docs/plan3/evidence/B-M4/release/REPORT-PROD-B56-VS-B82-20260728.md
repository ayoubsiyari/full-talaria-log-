# REPORT ONLY — Production `talaria-log.com` is `20260723b56`; delta to `b82`; trade-loss independence

**2026-07-28 ~23:54Z. Manager B. No production deploy. No mutation.**

Director: `FINDING-B75-IS-A-FOURTH-SURFACE-PROD-IS-B56-20260729-0045.md` §5.

---

## What production is running

Cold fetch `https://talaria-log.com` (observation `observations/prod-stamp-report-2026-07-28T23-54-07-431Z.json`):

| Path | Status | Build / note |
|---|---|---|
| `/chart/dist-v9/index.html` | 200 | **`20260723b56`**, 90914 B, **no** `indicator-performance.js` script reference |
| `/chart/index.html` | 307 → login | (auth gate; not followed for stamp) |
| `/chart/sw.js` | 200 | **`20260723b56`** (`cf-cache-status: HIT`) |
| `/chart/modules/indicator-performance.js` | 200 | File **exists** (5973 B) but the **shell does not reference it** |
| `/chart/modules/order-manager.js` | 200 | 2,378,966 B; **`journalVouchedFor` ABSENT** |

Tip target: **`20260728b82`**. Production is **six calendar days and five named builds behind** the tip stamp (`b56` → … → `b82`), matching the Director’s claim on the shell. The PO decides urgency; this is the measurement.

---

## Delta to b82 (what matters for the ask)

Not a full git changelog. Material gaps vs tip ship train for this report:

1. **Shell stamp** `b56` → `b82` (and all intermediate cache-bust / script-tag trains).
2. **`indicator-performance.js` not referenced** by the production V9 shell (module URL alone does not load it).
3. **Client trade-loss / hydration guard** (`journalVouchedFor` / unhydrated refuse in `order-manager.js`): **absent on production**, present on tip.
4. **Server journal sweep hardening** on tip (`JOURNAL_SWEEP_PARSE_GUARD`, refuse-on-unparsed-id, deletion logging — B-W17 lineage in `api_server.py`). Production process was not inspected over SSH (withholding: production host). Tip sweep **still** documents an inline `tradeId|id` resolver distinct from four-key `journal_trade_client_id` — the parse-guard is the shipped refuse; full alias unification may still be open. Report that honestly; do not claim production has either until measured on the production chart process.

---

## Can the trade-loss fix reach production independently of the canary train?

**Engineering answer: yes, as a scoped hotfix path — the canary shell train is not a hard dependency for closing the ledger wipe.**

Facts:

- The wipe mechanism is **server-side** in `api_server.py` (`_sync_trading_session_journal_trades` DELETE path), not in the HTML stamp.
- The D-2 **client** guard is in `order-manager.js` — a module byte update, not a full CHECKPOINT `b82` shell.
- Indicator-performance wiring and SURF-3 canonical-entry / warm-SW delivery are **separate** delivery defects; they do not block copying a server refuse + client guard onto production if the PO orders a narrow prod hotfix.

Caveats the PO must weigh (not decided here):

- Production deploy path and ownership for `api_server.py` / chart image are outside tonight’s test-host hot-patch.
- Tip still carries residual sweep-vocabulary divergence; a prod hotfix should take the **accepted** tip commits for the refuse/guard, not assume “ship entire b82” is required or sufficient.
- Canary train remains the vehicle for shell agreement, indicator-performance reference, and warm-client delivery — those do not ride for free with a backend-only patch.

**PO decides** whether to run an independent production hotfix now or wait for the canary train.
