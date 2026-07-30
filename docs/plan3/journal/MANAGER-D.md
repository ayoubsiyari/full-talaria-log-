# Manager D — journal

**Lane:** trade correctness / money-path  
**Checkout:** `manager-d-trade` · branch `manager-d/trade-correctness`  
**JOUR-01:** this file is the declared journal. Older notes also live in `docs/plan3/journal-D.md`.

---

## Backfill (Director JOUR-01 — two decisions only)

### Vacuity criteria and reversal levers (fixed-column audit)

A gate was judged vacuous when any of: (1) kill-switch OFF still GREEN, (2) asserted only
a helper/no-op path, (3) single-chart coverage for a multichart-reported defect. Reversal
levers that proved non-vacuity: restore-id kill → `942 !== 5` (TAL-01908); PnL kill →
`12000 !== 10075` (TAL-01903); TRADE-EVICT / duration / pending-protection RED cells under
their `TALARIA_TEST_DISABLE_*` env flags. Class-3 (single-chart vs multichart) remains a
standing reject reason.

### Cold-read proof design (TRADE-EVICT-V1 step 1)

EVICT-01 requires bytes-down **and** cold-read-works. The cold-read cell seeds a journal
row with MAE/MFE/path/screenshots while `closedPositions` is empty, then asserts analytics
consumers still resolve from the journal. That is the measurement that the cold room already
exists — eviction deletes the redundant hot copy, it does not invent a new store.

---

## 2026-07-30 — TRADE-EVICT-V1

- CKPT-01 tag `ckpt/pre-d-trade-evict-v1-6ba61eeeb` exercised rollback while green.
- Product: `__TALARIA_DISABLE_TRADE_EVICT_V1`; release hot screenshot/excursion on closed at
  post-exit playhead T; restore on rewind (EVICT-02).
- CONF-02 byte cell (screenshots + excursion): closed `63,753,000 → 0` with 30 closed + 4 open
  retained; harness GREEN only — C grades on the wire.
- Tip before this packet: `f4e006b06`.

## 2026-07-30 — EXCURSION-SINGLE-OWNER-V1 (Director e8ba8bdbc)

- **Authoritative:** `tradeJournal`.
- `managerClosed` ≡ `serviceClosed` (same array via `bindServiceProp`) — alias, not a third
  heap owner. Real duplicate was journal `.slice()` copies.
- Flag: `__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1` (default ON). Share array identity into
  journal; TRADE-EVICT nulls closed/service keys; journal keeps sole ref.
- Cap: 319/row was C summing four keys (ceiling 1,024), not a 256 breach. Hard-cap belt
  shipped anyway.
- CONF-02 excursion-only bytes (measured): legacy deduped **390,240** → journal-only
  **195,120** (delta **195,120** ≈ 191 KB). **Not the memory win.** Evidence:
  `_evidence/manager-D/EXCURSION-SINGLE-OWNER-V1-CONF02-BYTES-20260730.json`.
- Gates: `excursion-single-owner-v1.test.mjs` GREEN; `.red.test.mjs` under
  `TALARIA_TEST_DISABLE_EXCURSION_SINGLE_OWNER=1` exits ≠ 0.

## 2026-07-30 — TEST-02 / Rayan probes (queue continue)

- TAL-01896 named: **needs a build** (kill-switch in tip source; not served on canary).
- Runtime probes re-run on b113: Rayan #2 on-wire; Rayan #8 off-wire; 01896 delivery-unserved.
- #8 / 01807b / 01896 remain B next-train; skip register stays armed.

## 2026-07-30 — Director correction 5d1684b02 (cap / excursion hygiene)

- Cap-breach claim withdrawn by Director (`BRIEF-02`). Excursion closed as hygiene; 191 KB
  figure accepted; **not** progress against 730 MB/h.
- TRADE-EVICT CONF-02 reconfirmed: 30 closed `63,753,000 → 0`, **4 opens retained** (`6,371,552`).
- Closed the 7 TEST-02 unproven rows → **wire_unproven: 0**, on-wire **46**. Cause: missing
  `PATH_HINTS` + wrong M23 seed SHAs + thin wire corpus. Docs:
  `TEST02-SEVEN-UNPROVEN-CLOSED-20260730.md`.
- **Handed to B as build-blocked** (not waiting): Rayan #8 off-wire (money freeze gate),
  TAL-01896 needs a build. Handoff:
  `HANDOFF-D-TO-B-BUILD-BLOCKED-RAYAN8-01896-20260730.md`.

## 2026-07-30 — Director e982c3ce5 (57% ledger / 26 po-eyes)

- **FLAG-01 confirmed:** `__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1` **ABSENT ⇒ feature ON**
  (`!== true`). GREEN cell deletes the key; does not require explicit `false`.
- Built **one** consolidated PO visual pack for all 26 `po-eyes`, setup-ordered, observables +
  pass/fail boxes, TEST-01 wire preflight on b113 (0 rows removed for missing wire):
  `PO-VISUAL-PACK-26-PO-EYES-20260730.md`.
- Applied `PO-DECISIONS-23-ROWS` docx → `needs-info` **0**. Owner-blocked rebalanced A/E/C
  (`OWNER-BLOCKED-ROUTING-20260730-2135.md`).

## 2026-07-30 — Resume: PO waits on C chrome; owner lists confirmed

- **Do not call PO** for the 26-row pack until C’s CONF-01 / attribution clears and Director
  says go. No second browser from D on this machine.
- TRADE-EVICT / EXCURSION-SINGLE-OWNER stay harness GREEN only — C grades on the wire.
- Owner-blocked handoffs with **named row lists** (not counts): A=13, E=5, C=3.
  Verified 13+5+3=21 against ledger. Files: `HANDOFF-OWNER-BLOCKED-TO-{A,E,C}-20260730.md`,
  `OWNER-BLOCKED-ROW-LISTS-20260730.json`.
- Scorecard flip armed idle: `scripts/po-scorecard-flip.mjs` +
  `PO-SCORECARD-FLIP-PROCEDURE-20260730.md` — PASS→fixed, FAIL→broken on b113 when scorecard
  returns. Heavy evidence → `_evidence\manager-D\`.

## 2026-07-30 — Prebuild B-train close gates + 01891 question

- Built `scripts/prebuild-b-train-close-gates.mjs` for Rayan #8 / TAL-01807b / TAL-01896.
  Against **b113 wire corpus**: all three **RED exit 1** (discriminator). Evidence:
  `_evidence\manager-D\PREBUILD-B-TRAIN-CLOSE-GATES-20260730b113.json`.
- Live OM (unlabelled stamp): #8 + 01807b flags **present**; tip unit gates GREEN; 01896
  still delivery-unserved. No ledger flip until B names the stamp + `--expect-green`.
- TAL-01891: **question not alarm** — path still on b113 corpus (no TRADE-EVICT there);
  live now has eviction bytes. Doc `QUESTION-TAL-01891-PATH-STILL-ON-B113-20260730.md`.
  No soak. Did not call PO.
