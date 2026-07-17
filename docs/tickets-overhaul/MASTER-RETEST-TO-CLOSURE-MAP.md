# Master retest → closure map

**Purpose:** Single authority for **which scoreboard rows flip on PASS** of each retest session, merging:

- [`RC3-REMIGRATION-FAMILY-CLOSURE-SWEEP.md`](RC3-REMIGRATION-FAMILY-CLOSURE-SWEEP.md)
- [`A6-ORDER-FAMILY-CLOSURE-SWEEP.md`](A6-ORDER-FAMILY-CLOSURE-SWEEP.md)
- [`A8-VP-FAMILY-CLOSURE-SWEEP.md`](A8-VP-FAMILY-CLOSURE-SWEEP.md)
- Lane 2 [`POST-BLESS-RETEST-CLOSURE-PLAN.md`](POST-BLESS-RETEST-CLOSURE-PLAN.md) **S0–S6**

**As-of:** 2026-07-17 · **Read-only** — no registry CSV edits from this doc.

**Build authority:**

| Build | Role | Primary sessions |
|-------|------|------------------|
| **`20260717b16`** | **BLESSED** PO parity-checklist build ([`T0-lane4-bless-b16-report.md`](worker-reports/T0-lane4-bless-b16-report.md)) | **S0–S6**, **S-B16** bundle |
| **`20260717b38`** | A6-4 Steps 0–6 + interims + ready-panels fan-out (dev ship candidate) | **S-B38** (7-row order live-confirm) |

**Closure rule (D-028):** Flip **STAGED** or **IN-TRACK** → **CLOSED-VERIFIED** only when PASS is recorded on the **named build id** (host + every panel iframe match). Harness-only rows may cite gate logs on the same id.

**Scoreboard denominator:** **153** rows (`PLAN2-SCOREBOARD.csv` minus OUT-OF-SCOPE `TAL-01637`). **22** already **CLOSED-VERIFIED** (incl. S1 re-migration wave on b16); **27** still **STAGED** awaiting S0–S6; **5** **IN-TRACK** rows target **S-B38** (`ORD-XPNL`, `ORD-DUP-DURATION`, `A6-4`, `TAL-01601`, `TAL-01669`).

---

## 1. One-page summary — if PO passes session X, flip N rows

| Session | Build | Est. time | **N rows to flip** | Primary families |
|---------|-------|-----------|-------------------|------------------|
| **S0** | **b16** | Eng only | **3** | Harness replay probes |
| **S1** | **b16** | 45–60 min | **0 STAGED*** / **9 re-verify** | Re-migration / chrome (mostly already CLOSED in scoreboard) |
| **S2** | **b16** | 30–45 min | **5** | Replay freeze + dual-layout |
| **S3** | **b16** | 20–30 min | **5** | D-009 / A3 replay mode |
| **S4** | **b16** | 45–60 min | **10** | RC-5 + A6 single-chart contract |
| **S5** | **b16** | 30 min | **3** | RC-6 + RC-3 spot |
| **S6** | **b16** | 15 min | **1** (RC-3 if S5 skipped) | RC-2 guard |
| **S-B16** | **b16** | +30–45 min | **0 scoreboard** (evidence only) | RC-3 T5 + VP landed legs + optional H-R09 ×10 |
| **S-B38** | **b38** | 60–90 min | **5** | A6 multichart order stack |

\*S1: nine engineering units (**RC-1**, **RC-4**, **H-R02–H-R07**, **H-R12**) are **already CLOSED-VERIFIED** on **`20260717b16` session:S1** in current `PLAN2-SCOREBOARD.csv`. S1 is still **mandatory re-verify** before deploy sign-off; no STAGED flip unless Manager rolls them back.

**Full STAGED wave (S0–S6 only):** **27 rows** → **22 + 27 = 49 / 153 ≈ 32%** (POST-BLESS originally forecast 42 STAGED flips; scoreboard already advanced **H-R04/H-R05**, replay tickets **TAL-01609/010/026**, etc. to CLOSED-VERIFIED).

**With S-B38 PASS:** **+5 IN-TRACK** → **54 / 153 ≈ 35%**.

---

## 2. Session scripts (merged)

### S0 — Engineering / harness (no PO live)

**Build:** **`20260717b16`**

| Step | Evidence | Pass | **Flip on PASS** |
|------|----------|------|------------------|
| S0.1 | Manager `gate.mjs` — 0 unexpected regressions | PASS log | (prerequisite) |
| S0.2 | H-S30 + `--bugswitch=__TALARIA_DISABLE_STEP_SPAM_REFETCH_GUARD` | ON PASS / OFF FAIL | **H-S30** |
| S0.3 | H-S40 / H-S41 promoted honest probe | Gate GREEN | **H-S40**, **H-S41** |

**If PASS → flip 3 rows:** `H-S30`, `H-S40`, `H-S41`.

---

### S1 — Multichart interaction parity (authoritative PO)

**Build:** **`20260717b16`** · Run [`MULTICHART-PARITY-CHECKLIST.md`](MULTICHART-PARITY-CHECKLIST.md) rows **1–11**.

| Checklist row | Pass criterion | Scoreboard unit | Current status | **Flip on PASS?** |
|---------------|----------------|-----------------|----------------|-------------------|
| 1 | First-click select host + B | **RC-1**, **RC-4**, **H-R02**, **H-R12** | CLOSED-VERIFIED | Re-verify only |
| 3 | Ctrl+click ×5 panel B | **H-R03** | CLOSED-VERIFIED | Re-verify only |
| 4 | Settings open + stays | **H-R04** | CLOSED-VERIFIED | Re-verify only (D-026) |
| 5 | Esc deselects + closes settings | **H-R05** | CLOSED-VERIFIED | Re-verify only |
| 6 | Delete removes drawing | **H-R06** | CLOSED-VERIFIED | Re-verify only |
| 7 | Peer isolation | **H-R07** | CLOSED-VERIFIED | Re-verify only |
| 8–9, 9b | Marquee + select chain | (RC-4 completeness) | — | Confirms **RC-4** |
| 9 | Single→dbl→Esc chain | **H-R09** / HR-PARITY#6 | STAGED-NEEDS-RETEST (family sweep) | **Evidence** — no dedicated scoreboard row; blocks deploy narrative if FAIL |
| 10 | Single-chart unchanged | **RC-2** (partial) | STAGED | Contributes to **S6** flip |
| 11 | Switch OFF revert | I13 record | — | No flip |

**If PASS → flip 0 STAGED rows** (already closed); **confirm 9 engineering units** remain CLOSED-VERIFIED.

**Family source:** [`RC3-REMIGRATION-FAMILY-CLOSURE-SWEEP.md`](RC3-REMIGRATION-FAMILY-CLOSURE-SWEEP.md) §5–6.

---

### S2 — Replay freeze, cadence, refresh, dual-layout

**Build:** **`20260717b16`**

| Step | Action | Pass | **Flip on PASS** |
|------|--------|------|------------------|
| S2.1 | 2v PLAY all panels advance | **H-S83** (if Lane 2 candle-mode fix on build) | **H-S83**, **TAL-01600** |
| S2.2 | Mid-replay F5 restore | **H-S28**, **H-S79** already CLOSED | **TAL-01629**, **TAL-01631**, **TAL-01650** (c,d,e legs) |
| S2.3 | Dual-layout PLAY sync | | **TAL-01600** (same row) |
| S2.4 | 4h focus → 1m panel smooth cadence | | **H-S83**, **TAL-01603 (b+c)** * |
| S2.5 | Pan-release holds viewport | **H-S82** CLOSED | Re-verify only |
| S2.6 | No layout jump on peer render | | **TAL-01629**, **TAL-01631**, **TAL-01650** |

\* **TAL-01603** is **IN-TRACK** (not STAGED) — PO pass closes ticket disposition; does not auto-flip scoreboard unless Manager adds row.

**Already CLOSED (re-verify in S2, no flip):** **H-S18**, **H-S20**, **H-S28**, **H-S79**, **H-S82**, **TAL-01609**, **TAL-01610**, **TAL-01626**.

**If PASS → flip 5 STAGED rows:** **H-S83**, **TAL-01600**, **TAL-01629**, **TAL-01631**, **TAL-01650**.

---

### S3 — Replay mode & interval cadence (D-009 / A3)

**Build:** **`20260717b16`**

| Step | Pass | **Flip on PASS** |
|------|------|------------------|
| S3.1 Candle-by-candle — no tick animation | **TAL-01611** |
| S3.2 Interval step — no weekly jumps | **TAL-01612**, **TAL-01581** |
| S3.3 Tick mode stable | **TAL-01582** |
| S3.4 Candle→Tick after time pick | **TAL-01647** |

**If PASS → flip 5 STAGED rows:** **TAL-01611**, **TAL-01612**, **TAL-01647**, **TAL-01581**, **TAL-01582**.

---

### S4 — Order entry & A6 contract (single-chart RC-5)

**Build:** **`20260717b16`** · [`T6-step7-rc5-rc6-closure-sweep-report.md`](worker-reports/T6-step7-rc5-rc6-closure-sweep-report.md) **Appendix C** rows **#1, #8–11, #13–15, #19–20, #22** (real mouse).

| Block | Pass | **Flip on PASS** |
|-------|------|------------------|
| Appendix C (11 rows) ALL PASS | **RC-5** (1 engineering) |
| S4.A6-1 / 1b SL+entry drag commit | **A6-1**, **TAL-01602**, **TAL-01653** |
| S4.A6-2 F5 order persist | **A6-2**, **TAL-01616** |
| S4.A6-3 price-axis isolation | **A6-3**, **TAL-01615** * |
| S4.T4 limit/stop stable | **TAL-01638** |
| S4.kbd keyboard pan | **OrderEntry#4**, **OrderEntry#5** |

\* **TAL-01615** is **IN-TRACK** — flip only if A6-3 chart half on build; else note NEEDS follow-up.

**If PASS → flip 10 STAGED rows:** **RC-5**, **A6-1**, **A6-2**, **A6-3**, **OrderEntry#4**, **OrderEntry#5**, **TAL-01602**, **TAL-01616**, **TAL-01653**, **TAL-01638**.

**Not closed by S4 (order sweep §4 gaps):** multichart **ORD-XPNL**, **ORD-DUP-DURATION**, **A6-4** package → **S-B38**.

---

### S5 — Indicators (RC-6) + RC-3 spot

**Build:** **`20260717b16`**

| Block | Pass | **Flip on PASS** |
|-------|------|------------------|
| Appendix C RC-6 **M1–M5** ALL PASS | **RC-6** |
| S5.RC3 TF change with Layers open — no layer jump | **RC-3**, **TAL-01585** |

**If PASS → flip 3 STAGED rows:** **RC-6**, **RC-3**, **TAL-01585**.

**Note:** **RC-3 Phase 5** (multichart anchoring) and **~40 PER-BUG RC-3 rows** stay **OPEN** — see §6.

---

### S6 — Single-chart regression guard

**Build:** **`20260717b16`**

| Step | Pass | **Flip on PASS** |
|------|------|------------------|
| S6.1 Pan/zoom — no grid-over-candles | **RC-2** |
| S6.2 VP paste / anchor spot (if not done in S5) | **RC-3** (only if S5.RC3 FAIL) |

**If PASS → flip 1 STAGED row:** **RC-2** (and **RC-3** only if deferred from S5).

---

### S-B16 — Blessed build extended bundle (RC3 sweep §11)

**Build:** **`20260717b16`** · **Optional after S1+S5** · ~30–45 min PO.

| # | Action | Closes (evidence) | **Scoreboard flip** |
|---|--------|-------------------|---------------------|
| B16.1 | Full parity checklist **rows 1–9, 9b, 11** (if not S1) | **RC-4**, HR-PARITY#1–10 | Same as S1 |
| B16.2 | **RC-3 spot bundle:** paste-after-pan; fractional place; fib/Gann pan-right | T5 phases 3/4/6 tickets (TAL-01383, TAL-00157#4, TAL-00271#9/#10) | Reinforces **RC-3** (S5) |
| B16.3 | **VP cluster:** anchored + fixed-range VP; **1m→5m** TF switch; pan on zone | **H-S42** class (already gate-PROVEN b16); R3/R4 engine b15 | **No new row** — **TAL-01665–01667** stay **IN-TRACK** until **D-029 R2** lands |
| B16.4 | Optional: `react-run --only=H-R09 --runs=10` on b16 | HR-PARITY#6 flake rate | **No scoreboard row** |

**If PASS → flip 0 additional scoreboard rows** (evidence + ticket notes only).

**Family source:** [`A8-VP-FAMILY-CLOSURE-SWEEP.md`](A8-VP-FAMILY-CLOSURE-SWEEP.md) §6 PO retest; [`RC3-REMIGRATION-FAMILY-CLOSURE-SWEEP.md`](RC3-REMIGRATION-FAMILY-CLOSURE-SWEEP.md) §11.

---

### S-B38 — A6 multichart order live-confirm (7 rows)

**Build:** **`20260717b38`** · [`A6-4-b38-PO-LIVE-CONFIRM-CHECKLIST.md`](A6-4-b38-PO-LIVE-CONFIRM-CHECKLIST.md)

| Row | Verification | **Flip on PASS** (scoreboard / tracker) |
|-----|--------------|----------------------------------------|
| **1** | Cross-ticker GBP exit not EUR band | **ORD-XPNL** |
| **2** | Panel-B place / lockout | **TAL-01669** (ticket); mechanism **A6-4** Step 2 |
| **3** | SL drag B → host + peers converge | **A6-1** multichart leg * (single-chart **A6-1** may already flip in S4) |
| **4** | Dual replay — both tickers' PnL move | **ORD-XPNL** / PnL hub evidence |
| **5** | F5 — single restore + iframe lines B/C | **ORD-DUP-DURATION** (dup leg); **TAL-01601** |
| **6** | 4 orders → F5 → 4 unique ids | **ORD-DUP-DURATION**; **ORD-DUP** class |
| **7** | Duration ±1m; no 1000h+ | **ORD-DUP-DURATION** (duration leg) |

**All 7 rows PASS → also flip:**

| Unit | From | To |
|------|------|-----|
| **A6-4** | IN-TRACK | **CLOSED-VERIFIED** (dev-only host-canonical stack on b38) |
| **ORD-XPNL** | IN-TRACK | **CLOSED-VERIFIED** |
| **ORD-DUP-DURATION** | IN-TRACK | **CLOSED-VERIFIED** |
| **TAL-01601** | IN-TRACK | **CLOSED-VERIFIED** |
| **TAL-01669** | IN-TRACK | **CLOSED-VERIFIED** |

**If PASS → flip 5 scoreboard rows:** **ORD-XPNL**, **ORD-DUP-DURATION**, **A6-4**, **TAL-01601**, **TAL-01669**.

**Does not close:** **MC-STEPFWD** (replay step-forward — separate Lane 2 fix); **S4 STAGED** single-chart **RC-5**; **A8/VP IN-TRACK** cluster; **H-R09** chrome flake.

**Gate after PO PASS (Lane 4, b38):** D-026 **H-R04/H-R05** 10/10 ON — PO PASS does **not** substitute ([`A6-4-b38-PO-LIVE-CONFIRM-CHECKLIST.md`](A6-4-b38-PO-LIVE-CONFIRM-CHECKLIST.md) § sign-off).

**Family source:** [`A6-ORDER-FAMILY-CLOSURE-SWEEP.md`](A6-ORDER-FAMILY-CLOSURE-SWEEP.md).

---

## 3. Master flip table — all scoreboard units by session

Sorted by session order. **Status** = value in `PLAN2-SCOREBOARD.csv` as-of this doc.

| Scoreboard unit | Status now | Session | Build | Flip when |
|-----------------|------------|---------|-------|-----------|
| **H-S30** | STAGED | S0 | b16 | S0.2 PASS |
| **H-S40** | STAGED | S0 | b16 | S0.3 PASS |
| **H-S41** | STAGED | S0 | b16 | S0.3 PASS |
| **RC-1** | CLOSED-VERIFIED | S1 | b16 | Re-verify only |
| **RC-4** | CLOSED-VERIFIED | S1 | b16 | Re-verify only |
| **H-R02** | CLOSED-VERIFIED | S1 | b16 | Re-verify only |
| **H-R03** | CLOSED-VERIFIED | S1 | b16 | Re-verify only |
| **H-R04** | CLOSED-VERIFIED | S1 | b16 | Re-verify only |
| **H-R05** | CLOSED-VERIFIED | S1 | b16 | Re-verify only |
| **H-R06** | CLOSED-VERIFIED | S1 | b16 | Re-verify only |
| **H-R07** | CLOSED-VERIFIED | S1 | b16 | Re-verify only |
| **H-R12** | CLOSED-VERIFIED | S1 | b16 | Re-verify only |
| **H-S83** | STAGED | S2 | b16 | S2.4 PASS (+ PO A/B feel) |
| **TAL-01600** | STAGED | S2 | b16 | S2.3 PASS |
| **TAL-01629** | STAGED | S2 | b16 | S2.6 PASS |
| **TAL-01631** | STAGED | S2 | b16 | S2.6 PASS |
| **TAL-01650** | STAGED | S2 | b16 | S2.6 PASS |
| **TAL-01611** | STAGED | S3 | b16 | S3.1 PASS |
| **TAL-01612** | STAGED | S3 | b16 | S3.2 PASS |
| **TAL-01647** | STAGED | S3 | b16 | S3.4 PASS |
| **TAL-01581** | STAGED | S3 | b16 | S3.2 PASS |
| **TAL-01582** | STAGED | S3 | b16 | S3.3 PASS |
| **RC-5** | STAGED | S4 | b16 | Appendix C 11/11 PASS |
| **A6-1** | STAGED | S4 (+ S-B38 row 3) | b16 / b38 | S4 PASS; b38 row 3 confirms multichart |
| **A6-2** | STAGED | S4 | b16 | S4.A6-2 PASS |
| **A6-3** | STAGED | S4 | b16 | S4.A6-3 PASS or defer note |
| **OrderEntry#4** | STAGED | S4 | b16 | S4.kbd PASS |
| **OrderEntry#5** | STAGED | S4 | b16 | S4.kbd PASS |
| **TAL-01602** | STAGED | S4 | b16 | S4.A6-1 PASS |
| **TAL-01616** | STAGED | S4 | b16 | S4.A6-2 PASS |
| **TAL-01653** | STAGED | S4 | b16 | S4.A6-1b PASS |
| **TAL-01638** | STAGED | S4 | b16 | S4.T4 PASS |
| **RC-6** | STAGED | S5 | b16 | M1–M5 PASS |
| **RC-3** | STAGED | S5 (+ S6.2) | b16 | S5.RC3 PASS |
| **TAL-01585** | STAGED | S5 | b16 | S5.RC3 PASS |
| **RC-2** | STAGED | S6 | b16 | S6.1 PASS |
| **ORD-XPNL** | IN-TRACK | S-B38 | b38 | Row **1** (+ row 4) PASS |
| **ORD-DUP-DURATION** | IN-TRACK | S-B38 | b38 | Rows **5–7** PASS |
| **A6-4** | IN-TRACK | S-B38 | b38 | All **7** rows PASS |
| **TAL-01601** | IN-TRACK | S-B38 | b38 | Row **5** PASS |
| **TAL-01669** | IN-TRACK | S-B38 | b38 | Row **2** PASS |

---

## 4. Family cross-walk (three sweeps → sessions)

### 4.1 RC-3 / re-migration / chrome

| Sweep item | Disposition on b16 | Retest session |
|------------|---------------------|----------------|
| T5 Phases 1–4, 6 (`__TALARIA_RC3_*`) | STAGED **RC-3** + spot tickets | **S5**, **S-B16** |
| T5 Phase 5 multichart | **OPEN** | **H-S45–50** (not PO S0–S6) |
| H-S40/41/42 | S0 + gate / **H-S42** CLOSED b16 | **S0**, **S-B16** VP TF |
| Re-migration H-R02–H-R07, H-R12 | CLOSED b16 | **S1** |
| D-024 / D-026 H-R04/H-R05 | CLOSED b16 | **S1** rows 4–5 |
| H-R09 chrome flake | STAGED-NEEDS-RETEST | **S1** row 9 + **S-B16.4** optional |
| HR-PARITY#1–11 | Mostly CLOSED / #6 STAGED / #11 OPEN | **S1** |

### 4.2 Order / A6 / RC-5

| Sweep item | Disposition | Retest session |
|------------|-------------|----------------|
| RC-5 + A6-1/2/3 + OrderEntry#4/5 | STAGED | **S4** (b16) |
| A6-4 + ORD-XPNL + ORD-DUP-DURATION | IN-TRACK on b38 | **S-B38** (b38) |
| 22 STAGED-NEEDS-LIVE single-chart rows | STAGED | **S4** subset |
| ORD-EXEC-SLTP-DRAG, ORDER_PERSIST_DEDUPE_V1 | **OPEN** | None — gap |

### 4.3 VP / drawing (A8 / A7b)

| Sweep item | Disposition | Retest session |
|------------|-------------|----------------|
| P0 + H-S42 + R3/R4a/R4b **LANDED** | PO evidence | **S-B16** only |
| TAL-01665–01667 R2 | **SPEC'D-HELD** D-029 | Post-bless — **not S0–S6** |
| A8-1…4, A8-5 | **SPEC'D-HELD** | Post-A6-4 gate — **not S0–S6** |
| TAL-01656/01657 R5 chrome | **OPEN / WONTFIX-candidate** | None |

---

## 5. Explicit exclusions — no session in this map closes these

| Category | Examples | Why |
|----------|----------|-----|
| **VP scale / R2** | **TAL-01665–01667** | **D-029** post-bless `chart.js` — not on b16 |
| **A8 Shift-modifier** | **TAL-01593**, **01654–01655**, **01651** | SPEC'D-HELD — after A6-4 product gate |
| **A6-4 deferred** (scoreboard) | Was IN-TRACK until b38 PASS | Use **S-B38** |
| **Replay gaps** | **H-S25**, **H-S27**, **H-S73**, **MC-STEPFWD** | IN-TRACK — own Lane 2 fixes |
| **Objects tree** | **OT-MS**, **PLAN2-FOUND#3** | Backlog specs |
| **PO decision** | **TAL-01660** | BLOCKED-ON-DECISION |
| **Chrome harness only** | **ESC-021**, **H-R09-LIVE-RESOLVE** spec | Lane 4 / contingency |
| **Deploy gate** | **COMBINED-BUILD**, **DEPLOY** | Meta rows |

---

## 6. Recommended PO schedule (single tester)

| Day | Sessions | Build | Cumulative flips (STAGED+IN-TRACK) |
|-----|----------|-------|-------------------------------------|
| D0 | Deploy + build id broadcast | b16 | 0 |
| D1 | **S0** (eng) + **S1** + **S2** | b16 | 3 + 0 + 5 = **8** |
| D2 | **S3** + **S4** | b16 | +15 = **23** |
| D3 | **S5** + **S6** + **S-B16** | b16 | +3 = **26 STAGED** (cumulative **49** CLOSED) |
| D4 | **S-B38** (if b38 deployed) | b38 | +5 IN-TRACK = **54** CLOSED |

Manager updates `PLAN2-SCOREBOARD.csv` after each session PASS block ([`POST-BLESS-RETEST-CLOSURE-PLAN.md`](POST-BLESS-RETEST-CLOSURE-PLAN.md) §8.2).

---

## 7. Tester sign-off template

```
Build: __________  Tester: __________  Date: __________
Session: S0 | S1 | S2 | S3 | S4 | S5 | S6 | S-B16 | S-B38
Result: PASS | FAIL (list scoreboard units)
Rows flipped this session: __________ (N=__)
Attach: MULTICHART-PARITY-CHECKLIST.md (S1) / A6 b38 checklist (S-B38)
```

---

## 8. References

| Doc | Role |
|-----|------|
| [`POST-BLESS-RETEST-CLOSURE-PLAN.md`](POST-BLESS-RETEST-CLOSURE-PLAN.md) | S0–S6 scripts + 42-row forecast |
| [`RC3-REMIGRATION-FAMILY-CLOSURE-SWEEP.md`](RC3-REMIGRATION-FAMILY-CLOSURE-SWEEP.md) | RC-3 + re-migration + chrome |
| [`A6-ORDER-FAMILY-CLOSURE-SWEEP.md`](A6-ORDER-FAMILY-CLOSURE-SWEEP.md) | b38 order family |
| [`A8-VP-FAMILY-CLOSURE-SWEEP.md`](A8-VP-FAMILY-CLOSURE-SWEEP.md) | VP / A8 drawing batch |
| [`PLAN2-SCOREBOARD.csv`](PLAN2-SCOREBOARD.csv) | Row statuses |
| [`MULTICHART-PARITY-CHECKLIST.md`](MULTICHART-PARITY-CHECKLIST.md) | S1 authority |
| [`A6-4-b38-PO-LIVE-CONFIRM-CHECKLIST.md`](A6-4-b38-PO-LIVE-CONFIRM-CHECKLIST.md) | S-B38 authority |

**Status:** READ-ONLY master map — update row counts when `PLAN2-SCOREBOARD.csv` changes.
