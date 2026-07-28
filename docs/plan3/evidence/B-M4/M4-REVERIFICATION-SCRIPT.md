# M4 — M23/M24 re-verification on the deployed build

> # ⛔ PHASE 1 IS NOT FIT TO GATE. DO NOT RUN IT ON A LEDGER YOU CARE ABOUT.
>
> Rejected a **fourth** time, 2026-07-28 10:57, on measured evidence. Three findings decide it:
>
> 1. **Phase 1 cannot pass.** L6 calls `plantLegacyAliasProbe`, which exists only on the fixture adapter — never on the HTTP one. On any real deployment L6 returns `SKIP-LOUD` before touching the network. Since Phase 4 requires all six green, **the procedure below is unsatisfiable by construction.** Do not "waive L6 and proceed": that is how an operator learns to discount non-PASS lines.
> 2. **A green does not mean the ledger is intact.** On the shipped default (`SESSION_JOURNAL_SQL_PRIMARY=true`), L5's two "stores" are the same SQL table read through two serialisers, so a lost trade disappears from both sides at once. A session that has **already lost a real trade** scores `pass=5 nonpass=1` — the best score this harness can produce.
> 3. **It can permanently destroy a trade** of the shape described in `ESCALATION-trade-loss-orphan-sweep.md`. It reports the loss; it cannot reverse it.
>
> **Phases 0, 2, 3 remain valid and are the ones that actually carry M4 right now.** Phase 2 (PO rollback) and Phase 3 (Rayan re-verification) are manual and unaffected.
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

Record: build tag, digest, environment, account id, Phase 1 session id, Phase 2/3 session id, UTC start time, operator name.

**0.3 exists because Phases 1–3 write trades.** Writing them into the PO's verification surface while M24's migration is live would corrupt the very thing this gate protects. Phase 1 and Phase 2 must use different QA session ids.

> **CORRECTION — this line previously read "the harness itself does not delete trades." That was false.**
>
> Measured under review: the harness's own `--write` POST triggers `_sync_trading_session_journal_trades`, whose orphan sweep **permanently deleted a pre-existing trade** carrying `trade_id`/`client_trade_id` but not `tradeId`/`id`. The harness now *detects and reports* the loss — it cannot undo it. See `ESCALATION-trade-loss-orphan-sweep.md`.
>
> Anyone who chose a session on the strength of the old sentence chose it on false information.

---

## Phase 1 — automated ledger invariants (agent-executable, no human judgement)

Packet **B-W11**, in `docs/plan3/evidence/B-M4/`. Run before calling any human. Six invariants: L1 count conservation plus pre-existing-row preservation, L2 id stability, L3 grammar conformance, L4 no duplicates plus deterministic duplicate no-op, L5 browser/backend row and id-multiset agreement, L6 legacy-alias transition idempotence.

Requires an explicit QA account id; refuses to run write checks without one. Exits non-zero on any failure or `SKIP-LOUD`. Its own mutation-survival count is reported alongside its result — a green from a harness with surviving mutations is not evidence, which this project has now learned three times.

Use this verbatim command, filling only the bracketed values:

```powershell
node "docs/plan3/evidence/B-M4/m4-ledger-invariants.mjs" --write --base-url="[DEPLOYED_BASE_URL]" --account-id="[QA_ACCOUNT_ID]" --qa-account-id="[QA_ACCOUNT_ID]" --session-id="[PHASE1_QA_SESSION_ID_WITH_AT_LEAST_ONE_PRE_EXISTING_TRADE]" --expect-digest="[SEALED_BUILD_DIGEST_OR_BUILD_ID]" --n=3
```

The Phase 1 session must already contain at least one trade not written by this harness. If it contains only the three `m4-<runId>-NN` rows the harness writes, the result is `SKIP-LOUD`, not evidence.

**If Phase 1 fails, do not proceed.** Humans are the scarce resource; do not spend them confirming what a script already caught.

### Phase 1 acceptance — read this before trusting a green

The first build of this harness **printed nothing and exited 0 when pointed at an unreachable server**, because an empty result set trivially satisfies "no result is non-PASS". Rejected and rebuilt. Before accepting any Phase 1 green tonight, confirm all five:

1. It **printed a header and one line per check.** A silent run is a bug, never a pass.
2. The **number of checks executed equals the number expected.** An empty or short run is a FAIL.
3. **Transport failures are loud FAILs** — connection refused, timeout, 401/403, or an HTML login page returned instead of JSON. This is the failure that will actually happen against a candidate that is not up yet or is behind auth.
4. The header says `mutation_survival designed=18 survived=0`, and the mutation set includes the unreachable-server class, real-trade loss/duplication, destroyed ids, legacy aliases, UI/backend divergence, and duplicate-submit collateral deletion.
5. No line says `SKIP-LOUD`. `SKIP-LOUD` is not a pass and does not satisfy Phase 4.

**L6 is a transition proof, not a repeated-read proof.** The legacy backfill is one-time and gated on an empty SQL table; once SQL contains rows, later reads do not re-run it. L6 may PASS only if the harness can plant or observe an unmigrated `legacy:` alias, confirm SQL is empty for that alias before the read, read once, read again, and compare the before/first/second states. If no unmigrated alias can be planted or observed, L6 prints `SKIP-LOUD` with `no unmigrated alias available`; that is honest, but it is not a Phase 4 pass.

### Note on what L3 can actually mean

M24 is described as a "canonical trade-ID grammar". The implementation is **not** a regex: `session_journal_store.py:155-165` selects an id by precedence — `tradeId || trade_id || client_trade_id || id` — and `:244-260` normalises manual payloads into all aliases, stored as `String(128)` (`api_server.py:1177`). Deterministic duplicate merge is keyed on `client_trade_id` (`api_server.py:12348-12354`). So L3 verifies **alias-resolution consistency and stability**, not conformance to a canonical pattern. Stated here so the gate is not read as proving something stronger than it does.

---

## Phase 2 — PO script, M23 rollback (~4 min, PO)

Confirm the build id on screen first. Use a different QA session id than Phase 1 unless Phase 1 cleanup has been independently verified. Perform in order and do not skip.

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

**PASS** requires all of: Phase 0 four-for-four; Phase 1 all six green with `mutation_survival designed=18 survived=0` and no `SKIP-LOUD`; Phase 2 no FAIL condition; Phase 3 every scenario re-verified by Rayan.

**FAIL — and the canary does not proceed — on any one of:**

1. **A trade is lost.** Any trade present at one observation and absent at a later one with no user action to remove it.
2. **A trade is duplicated.** Any id appearing twice, or one logical trade appearing as two rows.
3. **An id is unstable.** Any id that changes across reload, session boundary, or migration.
4. **A rollback fails to permanently cancel** — relocation or reactivation both count.

These four are the gate. Anything else observed is a finding to file, not a reason to hold or to pass.

**Partial results do not average.** Five of six green is a FAIL, not "mostly passing". `SKIP-LOUD` is also a FAIL for this ship gate; it means the harness did not have the declared corpus or migration transition needed to establish the claim.

---

## Evidence to file

Under `docs/plan3/evidence/B-M4/`: Phase 0 header block; Phase 1 raw output including its mutation-survival count; Phase 2 the completed table with actual ids; Phase 3 Rayan's per-scenario report; Phase 4 verdict with the timestamp and who ran each phase.

## Coverage stamp (§A4b)

**Covers:** ledger integrity and rollback trade-state on the deployed candidate, for the scenarios enumerated above.
**Does not cover:** order-line rendering (that is M3), the duration clock (open, separate), performance, or any ledger path not reachable through Phases 1–3.
**Surface:** deployed build. A local pass is not this gate.
