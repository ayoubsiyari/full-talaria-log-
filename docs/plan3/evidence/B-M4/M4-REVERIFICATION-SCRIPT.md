# M4 — M23/M24 re-verification on the deployed build

> # ⚠️ PHASE 1 IS SPLIT BY HARNESS-01. READ BEFORE RUNNING.
>
> Rebuilt after a fourth rejection. It is now honest about its limits, which means it claims less than it used to.
>
> **1. Verify-only is the default and is safe on any ledger.** It constructs a read-only HTTP client with no write method and runs L2, L3, L5, L7 and L8. It must print `writes_issued=0`.
>
> *Verified structurally, not claimed:* `createHttpReadAdapter` is 37 lines containing **no `registerTrade` and no POST/PUT/DELETE/PATCH**. A check attempting to write in this mode throws rather than mutating. That is HARNESS-01 clause 1. Clause 2 holds because L1 and L4 each compute a preservation delta over **non-harness** rows and fail on any missing or changed row.
>
> **Run 1a first, always.** If L7 reports vulnerable rows, do **not** run 1b against that session — those rows are the ones the server's orphan sweep will delete on the first write.
>
> **2. Write-probe is explicit and disposable only.** It runs L1 and L4 against `--disposable-session-id`, never the real ledger. It warns that server writes can trigger the orphan sweep; the harness can report collateral loss but cannot undo it.
>
> **3. Two legacy claims remain NOT COVERED by the HTTP harness.**
>
> | | Status on the shipped deployment |
> |---|---|
> | L1 conservation + pre-existing-row preservation | write-probe only, disposable session |
> | L2 id stability across refetch | verify-only — **not** a session boundary; the check no longer claims one |
> | L3 identity of record, canonical grammar | covered |
> | L4 duplicate-submit merge incl. collateral rows | write-probe only, disposable session |
> | L5 browser/backend agreement | **NOT COVERED.** On the default `SESSION_JOURNAL_SQL_PRIMARY=true` both "stores" are one SQL table through two serialisers. It now `SKIP-LOUD`s instead of printing a PASS for comparing a table with itself. |
> | L6 legacy-alias migration idempotence | **NOT COVERED — removed.** Planting an unmigrated alias with an empty-SQL precondition needs DB attachment and cannot live in an HTTP harness. |
> | L7 orphan-sweep vulnerability detector | verify-only; detects rows whose payload lacks `tradeId`/`id` |
> | L8 asserted real-ledger presence | verify-only; fails empty or wrong ledger |
>
> **4. So Phase 1 evidence is two artifacts:** 1a proves the real ledger was read without mutation and checked for identity, stability, L7 exposure and asserted presence. 1b proves writes conserve harness rows and collateral rows only in a disposable session.
>
> **5. Phase 4's original "all six green" is void.** The pass condition is now: 1a all verify checks green except documented SQL-primary L5 `SKIP-LOUD`, 1b L1/L4 green on a disposable session, plus Phases 0, 2 and 3.
>
> Phases 2 (PO rollback) and 3 (Rayan re-verification) are manual, unaffected, and carry what Phase 1 cannot.
>
> — Manager B

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

Record: build tag, digest, environment, account id, Phase 1a real session id, Phase 1b disposable session id, Phase 2/3 session id, UTC start time, operator name.

**0.3 exists because Phase 1b and Phases 2–3 write trades.** Writing them into the PO's verification surface while M24's migration is live would corrupt the very thing this gate protects. Phase 1b must use a disposable session id different from Phase 1a's real ledger session id.

> **CORRECTION — this line previously read "the harness itself does not delete trades." That was false.**
>
> Measured under review: a write POST triggers `_sync_trading_session_journal_trades`, whose orphan sweep **permanently deleted a pre-existing trade** carrying `trade_id`/`client_trade_id` but not `tradeId`/`id`. Phase 1a now detects that vulnerable shape as L7 without writing; Phase 1b can report collateral loss in a disposable session, but cannot undo it. See `ESCALATION-trade-loss-orphan-sweep.md`.
>
> Anyone who chose a session on the strength of the old sentence chose it on false information.

---

## Phase 1 — automated ledger invariants (agent-executable, no human judgement)

Packet **B-W11**, in `docs/plan3/evidence/B-M4/`. Run before calling any human. Phase 1 is split to satisfy HARNESS-01.

### Phase 1a — verify-only, real ledger, zero writes

Safe on any ledger. The harness constructs a read-only HTTP adapter with no POST/PUT/DELETE path and must print `mode=verify-only writes_issued=0`.

```powershell
node "docs/plan3/evidence/B-M4/m4-ledger-invariants.mjs" --verify-only --base-url="[DEPLOYED_BASE_URL]" --account-id="[QA_ACCOUNT_ID]" --session-id="[REAL_LEDGER_SESSION_ID]" --expect-digest="[SEALED_BUILD_DIGEST_OR_BUILD_ID]" --expect-foreign-id="[KNOWN_PRE_EXISTING_TRADE_ID]"
```

Checks: L2 id-multiset stability across refetch, L3 identity of record and canonical column grammar, L5 cross-store agreement (`SKIP-LOUD` on `journal_storage=sql`), L7 orphan-sweep vulnerability detector, L8 expected real-ledger presence.

L7 is load-bearing: it fails rows whose payload lacks `tradeId` and `id`, reporting `vulnerableCount` and `vulnerableIds`. That is the exact shape exposed to the escalated deletion path.

### Phase 1b — write-probe, disposable session only

Not safe on a real ledger. This mode issues POSTs and must use a disposable session id different from Phase 1a's real session id. Startup prints a warning that the server orphan sweep can delete vulnerable pre-existing rows and the harness cannot undo it.

```powershell
node "docs/plan3/evidence/B-M4/m4-ledger-invariants.mjs" --write-probe --base-url="[DEPLOYED_BASE_URL]" --account-id="[QA_ACCOUNT_ID]" --qa-account-id="[QA_ACCOUNT_ID]" --session-id="[REAL_LEDGER_SESSION_ID_FROM_1A]" --disposable-session-id="[DISPOSABLE_QA_SESSION_ID]" --expect-digest="[SEALED_BUILD_DIGEST_OR_BUILD_ID]" --expect-foreign-id="[KNOWN_COLLATERAL_TRADE_ID_IN_DISPOSABLE_SESSION]" --n=3
```

Checks: L1 harness-row conservation plus collateral preservation, and L4 duplicate-submit merge plus collateral preservation. L1/L4 may compute conservation over their own rows, but they must also assert every non-self row is unchanged.

**If Phase 1 fails, do not proceed.** Humans are the scarce resource; do not spend them confirming what a script already caught.

### Phase 1 acceptance — read this before trusting a green

The first build of this harness **printed nothing and exited 0 when pointed at an unreachable server**, because an empty result set trivially satisfies "no result is non-PASS". Rejected and rebuilt. Before accepting any Phase 1 green tonight, confirm all five:

1. It **printed a header and one line per check.** A silent run is a bug, never a pass.
2. The **number of checks executed equals the number expected.** An empty or short run is a FAIL.
3. **Transport failures are loud FAILs** — connection refused, timeout, 401/403, or an HTML login page returned instead of JSON. This is the failure that will actually happen against a candidate that is not up yet or is behind auth.
4. Phase 1a printed `writes_issued=0`; Phase 1b printed a positive write count and used the disposable session id.
5. No unexpected line says `SKIP-LOUD`. For the shipped SQL-primary deployment, L5 `SKIP-LOUD` is expected and means cross-store agreement is not covered.

**Legacy-alias migration idempotence is NOT COVERED by Phase 1.** The legacy backfill is one-time and gated on an empty SQL table; once SQL contains rows, later reads do not re-run it. Proving the transition requires DB attachment to plant or observe an unmigrated `legacy:` alias with empty SQL, so it cannot be soundly implemented in this HTTP-only harness.

### Note on what L3 can actually mean

M24 is described as a "canonical trade-ID grammar". The implementation is **not** a regex: `session_journal_store.py:155-165` selects an id by precedence — `tradeId || trade_id || client_trade_id || id` — and `:244-260` normalises manual payloads into all aliases, stored as `String(128)` (`api_server.py:1177`). Deterministic duplicate merge is keyed on `client_trade_id` (`api_server.py:12348-12354`). So L3 verifies **alias-resolution consistency and stability**, not conformance to a canonical pattern. Stated here so the gate is not read as proving something stronger than it does.

---

## Phase 2 — PO script, M23 rollback (~4 min, PO)

Confirm the build id on screen first. Use a different QA session id than Phase 1b unless Phase 1b cleanup has been independently verified. Perform in order and do not skip.

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

**PASS** requires all of: Phase 0 four-for-four; Phase 1a verify-only checks green with `writes_issued=0` except documented SQL-primary L5 `SKIP-LOUD`; Phase 1b L1/L4 green on a disposable session; Phase 2 no FAIL condition; Phase 3 every scenario re-verified by Rayan.

**FAIL — and the canary does not proceed — on any one of:**

1. **A trade is lost.** Any trade present at one observation and absent at a later one with no user action to remove it.
2. **A trade is duplicated.** Any id appearing twice, or one logical trade appearing as two rows.
3. **An id is unstable.** Any id that changes across reload, session boundary, or migration.
4. **A rollback fails to permanently cancel** — relocation or reactivation both count.

These four are the gate. Anything else observed is a finding to file, not a reason to hold or to pass.

**Partial results do not average.** Missing Phase 1a or Phase 1b evidence is a FAIL, not "mostly passing". Unexpected `SKIP-LOUD` is also a FAIL for this ship gate; SQL-primary L5 `SKIP-LOUD` is a documented non-coverage statement, not a cross-store pass.

---

## Evidence to file

Under `docs/plan3/evidence/B-M4/`: Phase 0 header block; Phase 1a raw output; Phase 1b raw output; Phase 2 the completed table with actual ids; Phase 3 Rayan's per-scenario report; Phase 4 verdict with the timestamp and who ran each phase.

## Coverage stamp (§A4b)

**Covers:** verify-only id stability, identity of record, L7 orphan-sweep vulnerability detection, asserted real-ledger presence, disposable-session write conservation, duplicate-submit behavior, and rollback trade-state on the deployed candidate.
**Does not cover:** legacy-alias migration idempotence — requires DB attachment; L5 cross-store agreement when `journal_storage=sql`; order-line rendering (that is M3), the duration clock (open, separate), performance, or any ledger path not reachable through Phases 1–3.
**Surface:** deployed build. A local pass is not this gate.
