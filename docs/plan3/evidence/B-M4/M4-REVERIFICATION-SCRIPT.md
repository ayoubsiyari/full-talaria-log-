# M4 — M23/M24 re-verification on the deployed build

> # ⛔ DO NOT RUN — 2026-07-28 10:27
>
> **Phase 1's harness destroys real trades and then reports six PASS.** Under adversarial review it deleted two pre-existing trades during its own run and exited 0. Do not execute Phase 1 against any ledger you care about, including the QA account, until this banner is removed.
>
> The harness is also **vacuous**: every check except L6 filters the ledger to the three synthetic trades the harness itself just wrote, so a ledger with a real trade duplicated and another lost passes six of six. 12 of 18 designed mutations survive.
>
> **Line 50 of this document is factually wrong** and is corrected in §Phase 1. The legacy backfill is a *one-time* migration gated on an empty SQL table, not a per-read operation.
>
> Phases 0, 2, 3 and 4 are unaffected as written, but Phase 4's pass condition depends on Phase 1 and cannot be discharged yet.
>
> Rebuild in progress. — Manager B

**Ship gate M4.** Owner: Manager B. Authored 2026-07-28 ahead of the candidate, so it is executed rather than improvised.

**Gate text:** *M23/M24 re-verified on the deployed build, by PO and Rayan — trades not lost, not duplicated, IDs stable.*

**Why it is pre-registered:** a ledger that loses or duplicates a trade halts the canary outright. Pass/fail below is fixed **now**; it is not to be renegotiated while the clock runs. Anyone may run Phase 0 and Phase 1. Phases 2 and 3 need the named humans.

- **M23** — replay rollback trade-state: a rollback **permanently cancels**. No relocation, no reactivation.
- **M24** — ledger integrity: canonical trade-ID grammar across browser/backend/SQLite/PostgreSQL, deterministic duplicate merge, transactional legacy-alias migration.

> **Deployed build only.** A pass on a local tree is not this gate. If the build under test is not the sealed candidate, stop.

---

## Phase 0 — provenance and safety (blocking, ~2 min, anyone)

Nothing below counts until these four hold. Any NO ends the run.

| # | Check | Pass |
|---|---|---|
| 0.1 | Build tag and commit digest displayed by the deployed build match the sealed candidate | identical, recorded verbatim |
| 0.2 | Tripwire stamp present and matches that digest | present and matching |
| 0.3 | **Target DB is not TEST-1's.** TEST-2 must have its own database, or its own schema with QA-only account ids | confirmed isolated |
| 0.4 | Account in use is a **dedicated QA account id** — never admin, never a real user | confirmed QA |

Record: build tag, digest, environment, account id, UTC start time, operator name.

**0.3 exists because Phases 1–3 write trades.** Writing them into the PO's verification surface while M24's migration is live would corrupt the very thing this gate protects.

---

## Phase 1 — automated ledger invariants (agent-executable, no human judgement)

Packet **B-W8**, in `docs/plan3/evidence/B-M4/`. Run before calling any human. Six invariants: L1 count conservation, L2 id stability, L3 grammar conformance, L4 no duplicates plus deterministic merge, L5 browser/backend agreement, L6 migration idempotence.

Requires an explicit QA account id; refuses to run write checks without one. Exits non-zero on any failure. Its own mutation-survival count is reported alongside its result — a green from a harness with surviving mutations is not evidence, which this project has now learned three times.

**If Phase 1 fails, do not proceed.** Humans are the scarce resource; do not spend them confirming what a script already caught.

### Phase 1 acceptance — read this before trusting a green

The first build of this harness **printed nothing and exited 0 when pointed at an unreachable server**, because an empty result set trivially satisfies "no result is non-PASS". Rejected and being rebuilt. Before accepting any Phase 1 green tonight, confirm all four:

1. It **printed a header and one line per check.** A silent run is a bug, never a pass.
2. The **number of checks executed equals the number expected.** An empty or short run is a FAIL.
3. **Transport failures are loud FAILs** — connection refused, timeout, 401/403, or an HTML login page returned instead of JSON. This is the failure that will actually happen against a candidate that is not up yet or is behind auth.
4. Its **mutation-survival count is zero**, and the mutation set includes the unreachable-server class, not only fixture corruption.

**L6 is provable on the deployed build and must not be skipped.** `GET /api/sessions/{session_id}/state` (`api_server.py:24620`) calls `resolve_session_journal(...)` with the SQL sync at `:24633` — the legacy backfill runs **on every read**. So two consecutive GETs of session state run the migration twice: snapshot the trade set, GET again, and assert the set is identical with no new rows. No special endpoint is needed. Because the backfill runs on every read, non-idempotence would compound on every page load, which makes L6 more load-bearing than it first appeared, not less.

### Note on what L3 can actually mean

M24 is described as a "canonical trade-ID grammar". The implementation is **not** a regex: `session_journal_store.py:155-165` selects an id by precedence — `tradeId || trade_id || client_trade_id || id` — and `:244-260` normalises manual payloads into all aliases, stored as `String(128)` (`api_server.py:1177`). Deterministic duplicate merge is keyed on `client_trade_id` (`api_server.py:12348-12354`). So L3 verifies **alias-resolution consistency and stability**, not conformance to a canonical pattern. Stated here so the gate is not read as proving something stronger than it does.

---

## Phase 2 — PO script, M23 rollback (~4 min, PO)

Confirm the build id on screen first. Perform in order and do not skip.

| Step | Action | Record |
|---|---|---|
| 2.1 | Note the ledger's current trade count | `N0` |
| 2.2 | Place an order and let it fill | trade id `T1` |
| 2.3 | Confirm `T1` is in the ledger, count is `N0+1` | yes/no |
| 2.4 | **Roll the replay back past `T1`'s entry** | — |
| 2.5 | Inspect `T1` | **must be permanently cancelled** |
| 2.6 | **Place a new order after the rollback** | trade id `T2` |
| 2.7 | Compare `T2` against `T1` | **must be a new distinct id** |
| 2.8 | Note the ledger count | expected value per 2.5/2.7 |
| 2.9 | Reload the page. Re-read the ledger | **identical to 2.8, same ids, same order** |
| 2.10 | While `T2` is open, read its **duration** | record the value |

**FAIL if any of:** `T1` reappears as live, relocates to another bar or time, or reactivates; `T2` reuses `T1`'s id; the count changes across the reload at 2.9; any id changes across the reload; a trade present before the reload is missing after it.

**Step 2.10 is deliberate.** The PO reproduced a duration reading wildly wrong specifically after a rollback followed by a new order. That is a separate open defect and **not** part of M4's pass/fail — record the number and move on. Do not let it block this gate, and do not let this gate quietly absorb it.

---

## Phase 3 — Rayan re-verification (reporter re-verification, Tier 3)

Rayan filed the originating scenarios, so his own re-verification is required and cannot be substituted by ours. He re-runs **his** scenarios as filed, against the deployed candidate, and reports per scenario: trade present, id unchanged, no duplicate.

Give him the build tag and digest from Phase 0 so his report is anchored to a specific build.

---

## Phase 4 — verdict (pre-registered, not negotiated)

**PASS** requires all of: Phase 0 four-for-four; Phase 1 all six green with zero surviving mutations; Phase 2 no FAIL condition; Phase 3 every scenario re-verified by Rayan.

**FAIL — and the canary does not proceed — on any one of:**

1. **A trade is lost.** Any trade present at one observation and absent at a later one with no user action to remove it.
2. **A trade is duplicated.** Any id appearing twice, or one logical trade appearing as two rows.
3. **An id is unstable.** Any id that changes across reload, session boundary, or migration.
4. **A rollback fails to permanently cancel** — relocation or reactivation both count.

These four are the gate. Anything else observed is a finding to file, not a reason to hold or to pass.

**Partial results do not average.** Five of six green is a FAIL, not "mostly passing".

---

## Evidence to file

Under `docs/plan3/evidence/B-M4/`: Phase 0 header block; Phase 1 raw output including its mutation-survival count; Phase 2 the completed table with actual ids; Phase 3 Rayan's per-scenario report; Phase 4 verdict with the timestamp and who ran each phase.

## Coverage stamp (§A4b)

**Covers:** ledger integrity and rollback trade-state on the deployed candidate, for the scenarios enumerated above.
**Does not cover:** order-line rendering (that is M3), the duration clock (open, separate), performance, or any ledger path not reachable through Phases 1–3.
**Surface:** deployed build. A local pass is not this gate.
