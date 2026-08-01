# Production trade-loss hotfix — STANDING BY (do not ship unprompted)

**Status:** READY TO SHIP ON AUTHORISATION ONLY.  
**Owner:** Manager B (narrow grant on trade-identity / deletion path).  
**Surface:** production `talaria-log.com` — **not contacted for deploy until PO/Director says go.**  
**Updated:** 2026-07-29 after checkpoint b82 on test host.

---

## Authority gate

| | |
|---|---|
| Ship without prompt | **Forbidden** |
| Finding with PO | Scoped `api_server.py` change can travel alone (see `REPORT-PROD-B56-VS-B82-20260728.md`) |
| Next action | On written authorisation: execute §Deploy below; then same-session verify |

---

## What ships (minimum server path)

**Primary — closes the wipe when incoming ids fail to parse:**

| File | Change (already on tip) | Tip lineage |
|---|---|---|
| `chart v 1.4/chart/api_server.py` | `_sync_trading_session_journal_trades`: `JOURNAL_SWEEP_PARSE_GUARD` — refuse upsert+sweep when any incoming row has unparsed id; fail-closed default ON; deletion logging retained | B-W17 / B-W18 (`e996842b2`, kill-switch packet) |

**Optional companion (client; recommended if prod module can update without full canary shell):**

| File | Change | Tip lineage |
|---|---|---|
| `chart v 1.4/chart/modules/order-manager.js` | B-W16 hydration guard + `journalVouchedFor` / unhydrated durable refuse; kill `window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1` | `2521a7484`, B-W18 |

**Out of scope for this hotfix:** CHECKPOINT shell stamp b82, `indicator-performance.js` script tags, SURF-3 / SW warm-client, full canary train.

**Honest residual:** tip sweep keep-set still documents inline `tradeId\|id` (not four-key `journal_trade_client_id`). The parse-guard is the shipped refuse; full alias unification is a follow-on, not a blocker for “stop deleting on unparsed payload.”

---

## Kill-switches (incident)

| Lever | Default | Incident OFF |
|---|---|---|
| `JOURNAL_SWEEP_PARSE_GUARD_ENABLED` | unset / not in `{0,false,no,off}` → **ON** | `0` / `false` / `no` / `off` |
| `window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1` | unset → guard **ON** | `true` (client only) |

Deletion logging is **not** killable.

---

## Deploy (only after authorisation)

1. Confirm target is production chart process owning `api_server.py` (not test `31.97.192.82`).
2. Restore point / image tag recorded.
3. Apply tip bytes for §What ships (server minimum; client if authorised).
4. Restart chart workers so Python loads new code (static module update alone is not enough for the server guard).
5. Same-session verify (prod):
   - `journalVouchedFor` PRESENT if client shipped; else document server-only.
   - Env: parse guard ON.
   - Smoke: unhydrated durable path still refuses when client present; no mass delete on a controlled disposable session if write-probe is authorised.
6. Do **not** claim canary shell / indicator-perf / SURF-3 closed by this hotfix.

---

## Standing by

Packet is complete for a go decision. **No production SSH, image push, or compose up until prompted.**
