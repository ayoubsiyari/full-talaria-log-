# Post-bless retest & closure plan — STAGED → CLOSED-VERIFIED

**Purpose:** When the blessed combined build ships, testers run **one structured retest pass** (not 42 ad-hoc sessions) to flip **42 STAGED scoreboard rows** + **13 PENDING-DEPLOY tickets** to **CLOSED-VERIFIED**. That is what moves the headline progress number from **~3% → ~32%** (D-028 single-denominator rule).

**Authority:** D-018 (one combined build), D-028 (scoreboard), `T3-COMBINED-BUILD-MANIFEST.md` §4 + §4.1, `MULTICHART-PARITY-CHECKLIST.md`, `T6-step7-rc5-rc6-closure-sweep-report.md` Appendix C.

**Status:** Planning doc — update `Build: __________` when bless completes.

---

## 1. Scoreboard math (why this plan matters)

| Metric | Count | Notes |
|--------|-------|-------|
| Scoreboard rows (denominator) | **153** | `PLAN2-SCOREBOARD.csv` rows minus **1** OUT-OF-SCOPE (`TAL-01637`) |
| **CLOSED-VERIFIED today** | **5** | `H-S80`, `TAL-01590` (×2 unit rows), `TAL-01596`, `TAL-01588` |
| **Headline progress now** | **5 / 153 ≈ 3%** | Verified closure only — STAGED does not count |
| **STAGED awaiting ship retest** | **42** | 25 engineering units + 17 ticket units |
| **Forecast after full retest pass** | **47 / 153 ≈ 31%** | Rounds to **~32%** in progress reports |

**Closure rule (D-028):** A row flips **STAGED → CLOSED-VERIFIED** only when a tester/PO records **PASS on the shipped blessed build id** (host + panel iframes must show the same id). Harness-only rows may additionally cite gate evidence on that build id.

**Not in the +42 batch:** rows still **IN-TRACK**, **BLOCKED-ON-DECISION**, or **OPEN** (A7b VP cluster, H-S73, H-S25, etc.) — see §7.

---

## 2. Ship gate — do not start retest until ALL true

| # | Gate | Owner |
|---|------|-------|
| G1 | Blessed **`BUILD_ID`** cut (`build:live`, I8 mirrors verified) | Manager + Lane 4 |
| G2 | Deploy to PO test surface (`/opt/talaria` pull + Docker rebuild per parity checklist L1) | PO / ops |
| G3 | Service worker unregistered + hard reload | Tester |
| G4 | Build id confirmed on **host AND every panel iframe** — record here: `__________` | Tester |
| G5 | Manager gate **0 unexpected regressions** on blessed id | Lane 4 |
| G6 | `MULTICHART-PARITY-CHECKLIST.md` preconditions satisfied (2+ panels, drawings in panel B) | Tester |

**Tester comms at ship:** “13 tickets were already fixed on staging — **retest, do not re-file** unless FAIL on build `__________`.”

---

## 3. Retest architecture — 7 sessions, not 42

Sessions are ordered for **setup reuse**. Each session lists: steps, pass criteria, scoreboard rows flipped, PENDING-DEPLOY tickets closed.

| Session | Duration (est.) | Primary surface | Closes (rows) |
|---------|-----------------|-----------------|---------------|
| **S0** | — | Manager / Lane 4 | Harness-only STAGED (3) |
| **S1** | 45–60 min | Live React multichart 2v | Interaction RC + remig rows (9) |
| **S2** | 30–45 min | Multichart replay | Replay staging + D-015/D-016 tickets (12+) |
| **S3** | 20–30 min | Replay mode / cadence | D-009 + A3 tickets (5) |
| **S4** | 45–60 min | Order entry host + 2v | RC-5 + A6 contract (10+) |
| **S5** | 30 min | Indicators + RC-3 spot checks | RC-6 + TAL-01585 (2) |
| **S6** | 15 min | Single-chart regression | RC-2/3 guard (3) |

**Total PO live time:** ~3–4 hours for one tester (+ S0 engineering sign-off).

---

## 4. Session scripts

### S0 — Engineering / harness sign-off (no PO live)

**Who:** Manager or Lane 4 on the blessed build id.

| Step | Command / evidence | Pass | Flips STAGED → CLOSED-VERIFIED |
|------|-------------------|------|--------------------------------|
| S0.1 | Manager gate on blessed id — 0 unexpected regressions | PASS log archived | (prerequisite only) |
| S0.2 | H-S30 step-spam — scenario PASS; `--bugswitch=__TALARIA_DISABLE_STEP_SPAM_REFETCH_GUARD` FAIL | Gate summary | **H-S30** |
| S0.3 | H-S40 / H-S41 bar-open drift probes — promoted, honest GREEN | Gate summary | **H-S40**, **H-S41** |

---

### S1 — Multichart interaction parity (authoritative PO session)

**Setup:** Live React multichart, **2v layout**, backtest mode, file loaded on A + B, **2 trendlines on panel B**.

Run **`MULTICHART-PARITY-CHECKLIST.md`** rows 1–11. Record build id on checklist footer.

| Checklist row | Pass criterion (short) | Scoreboard rows | Notes |
|---------------|------------------------|-----------------|-------|
| 1 | First-click tool select works host + B | **RC-1**, **RC-4**, **H-R02** | RC-4 closes when full checklist PASS |
| 2 | Blue selection border visible | (included in RC-4) | |
| 3 | Ctrl+click both selected ×5 on panel B | **H-R03** | H-R03 PO step in checklist |
| 4 | Settings open, stays ≥1 turn | **H-R04** * | *If still IN-TRACK at ship, row 4 must PASS before bless — then Manager STAGED it |
| 5 | Esc deselects + closes settings | **H-R05** * | Same |
| 6 | Delete removes drawing, no ghost | **H-R06** | |
| 7 | Select in B doesn’t corrupt other panels | **H-R07** | |
| 8 | Ctrl+drag marquee host + panel | (RC-4 completeness) | |
| 9 | Single→double click chain | (RC-4 completeness) | |
| 9b | Exactly one toolbar + gear opens settings | (RC-4 completeness) | |
| 10 | Single-chart 1–6, 8, 9 unchanged | **RC-2** (peer/iframe half) | Confirms no regression |
| 11 | Named switch OFF → behaviors revert | (I13 evidence) | Record switch used |

**H-R12:** Chrome leg — PASS implied if row 1 passes on fallback-equivalent chrome; sign **H-R12** when S1 complete.

**PENDING-DEPLOY:** none in S1.

---

### S2 — Replay freeze, cadence, refresh, dual-layout

**Setup:** 2v multichart, same symbol on A+B **and** a second layout profile saved (for dual-layout test). Independent-symbol layout optional (edge-park).

| Step | Action | Pass criterion | Scoreboard | PENDING-DEPLOY tickets |
|------|--------|----------------|------------|------------------------|
| S2.1 | Press PLAY on 2v same-symbol | **All panels advance**; none stuck until TF change | **H-S18**, **H-S20**, **TAL-01609**, **TAL-01610** | D-015 edge-park |
| S2.2 | Mid-replay **F5 refresh** (paused state OK) | All panels resume; playhead restored; no permanent freeze | **H-S28**, **H-S79**, **TAL-01626** | a4 refresh persistence |
| S2.3 | **Dual-layout PLAY** (layout 1 vs layout 2) | Panels stay in sync; layout 2 not lagging | **TAL-01600** | D-015 + D-016 |
| S2.4 | Focus **4h panel**, PLAY | **1m panel** advances smoothly (finest-TF cadence) | **H-S83**, **TAL-01603 (b+c)** | D-016; PO A/B feel |
| S2.5 | Sync OFF, paused, pan into history, **release** | Viewport **holds** (no snap-back) | **H-S82** | D-017; TAL-01579 sibling |
| S2.6 | Observe replay re-render / layout jump | No spurious full-layout jump on peer update | **TAL-01629**, **TAL-01631**, **TAL-01650 (c,d,e)** | Retest-first |

**Kill-switch spot-check (optional):** `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE=true` → S2.4 cadence degrades (confirms D-016 fix).

---

### S3 — Replay mode & interval cadence (D-009 / A3)

**Setup:** Single chart or host panel; replay toolbar visible.

| Step | Action | Pass criterion | Scoreboard | PENDING-DEPLOY |
|------|--------|----------------|------------|----------------|
| S3.1 | Select **candle-by-candle** mode → PLAY | **No spurious tick animation** | **TAL-01611** | D-009 (a) |
| S3.2 | Select **interval** replay (e.g. 4h step on 4h TF) → step forward | Steps match interval; **no weekly jumps** | **TAL-01612**, **TAL-01581** | D-009 (b) |
| S3.3 | Select **tick-by-tick** mode → PLAY | Stays tick mode (no silent revert to candle) | **TAL-01582** | D-009 (a) |
| S3.4 | Pick a **specific replay start time** → switch Candle→**Tick** | Mode switch **honored** (Auto→Tick already works) | **TAL-01647** | If FAIL → re-triage A3 |

---

### S4 — Order entry & A6 contract (RC-5 + A6)

**Setup:** Built product, host chart + optional 2v; backtest with replay available for S4.6.

Run **`T6-step7` Appendix C — RC-5 table** (rows #1, #8, #9, #10, #11, #13, #14, #15, #19, #20, #22) on **real mouse** (I15).

| Appendix C row | Pass (one line) | Scoreboard | Tickets |
|----------------|-----------------|------------|---------|
| #1 | Stop preview blue on multi-entry BUY | **RC-5** | |
| #8 | Lot + updates immediately | **RC-5** | |
| #9 | 2nd entry below main (BUY) | **RC-5** | |
| #10 | Chart ✕ closes first click | **RC-5** | |
| #11 | Pending SELL SL above entries | **RC-5** | |
| #13 | 1RR previews not faded wrong | **RC-5** | |
| #14 | ✕ clears draft + rail | **RC-5** | |
| #15 | SL/TP steppers update preview | **RC-5** | |
| #19 | First +/- → ±10 pips not 0.00001 | **RC-5** | |
| #20 | Remove multi-entry level one click | **RC-5** | |
| #22 | Same-price entries separable | **RC-5** | |

**A6 extensions (same session):**

| Step | Action | Pass criterion | Scoreboard | Tickets |
|------|--------|----------------|------------|---------|
| S4.A6-1 | Drag **SL during replay** across price | **No fill/close until release**; line provisional while held | **A6-1**, **TAL-01602** | D-020 apply-on-release |
| S4.A6-1b | Drag **entry**; watch SL/TP legs | Legs **follow visually** during drag; commit on release | **A6-1**, **TAL-01653** | D-020 clarification |
| S4.A6-2 | Open order → **F5** | Order(s) **still present** after reload | **A6-2**, **TAL-01616** | session persist |
| S4.A6-3 | Order-half / price-scale gesture | Price-axis drag **does not** drag order (double-tap not needed) | **A6-3**, **TAL-01615** * | *If A6-3 chart half not on build, mark NEEDS follow-up |
| S4.T4 | Rapid **limit/stop** type buttons | Order type **stable** (no mutation in place) | **TAL-01638** | T4 reclassify retest |
| S4.kbd | Keyboard pan during order draft | No spurious scale shift / stale preview | **OrderEntry#4**, **OrderEntry#5** | |

**RC-5 row closure:** One Appendix C PASS block closes **RC-5** engineering unit when all 11 rows PASS.

---

### S5 — Indicators (RC-6) + RC-3 spot check

Run **`T6-step7` Appendix C — RC-6 M1–M5** on built product.

| Mech | Steps | Pass | Scoreboard |
|------|-------|------|------------|
| M1 | Add/remove RSI | Store count 1→0 | **RC-6** |
| M2 | Legend eye hide/show volume | Bars toggle | **RC-6** |
| M3 | RSI settings → change period | Plot + legend match | **RC-6** |
| M5 | RSI+EMA → F5 | Exactly 2 indicators, no dupes | **RC-6** |

**RC-3 spot (T5):**

| Step | Action | Pass | Scoreboard | Tickets |
|------|--------|------|------------|---------|
| S5.RC3 | Change TF with **Layers** panel open | Layer list **does not jump/displace** incorrectly | **RC-3**, **TAL-01585** | T5 anchoring phases |

**RC-3 engineering row** closes on S5.RC3 PASS + no anchor regression on volume-profile paste (optional quick paste test).

---

### S6 — Single-chart regression guard

| Step | Action | Pass | Scoreboard |
|------|--------|------|------------|
| S6.1 | Single-chart pan/zoom | No grid-over-candles / brightness collapse | **RC-2** |
| S6.2 | Place volume profile / paste drawing | Label stays anchored | **RC-3** (if not closed in S5) |

---

## 5. Master map — all 42 STAGED rows → session → flip

| Unit | Session | Retest anchor | Flip when |
|------|---------|---------------|-----------|
| **RC-1** | S1 | Parity row 1 | PASS host + B |
| **RC-2** | S1 row 10 + S6.1 | Single-chart + pan quality | PASS both |
| **RC-3** | S5.RC3 + S6.2 | TF/layers + anchor spot | PASS |
| **RC-4** | S1 | Full checklist 1–9b | ALL PASS |
| **RC-5** | S4 | Appendix C 11 rows | ALL PASS |
| **RC-6** | S5 | Appendix C M1–M5 | ALL PASS |
| **H-R02** | S1 | Row 1 | PASS |
| **H-R03** | S1 | Row 3 ×5 | PASS |
| **H-R06** | S1 | Row 6 | PASS |
| **H-R07** | S1 | Row 7 | PASS |
| **H-R12** | S1 | Row 1 (chrome) | PASS |
| **H-S18** | S2.1 | PLAY all panels | PASS |
| **H-S20** | S2.1 | Coarse mirror / PLAY | PASS |
| **H-S28** | S2.2 | F5 mid-replay | PASS |
| **H-S30** | S0.2 | Gate evidence | Manager sign-off |
| **H-S40** | S0.3 | Gate evidence | Manager sign-off |
| **H-S41** | S0.3 | Gate evidence | Manager sign-off |
| **H-S79** | S2.2 | Playhead restore | PASS |
| **H-S82** | S2.5 | Pan-release hold | PASS |
| **H-S83** | S2.4 | Finest-TF cadence feel | PASS + PO A/B OK |
| **A6-1** | S4.A6-1/1b | SL/TP + entry drag | PASS |
| **A6-2** | S4.A6-2 | F5 order persist | PASS |
| **A6-3** | S4.A6-3 | Price-axis isolation | PASS or defer note |
| **OrderEntry#4** | S4.kbd | Keyboard pan deferral | PASS |
| **OrderEntry#5** | S4.kbd | Keyboard pan | PASS |
| **TAL-01609** | S2.1 | Freeze on PLAY | PASS |
| **TAL-01610** | S2.1–2.2 | Multi-panel + refresh | PASS |
| **TAL-01611** | S3.1 | Candle mode animation | PASS |
| **TAL-01612** | S3.2 | Interval stepping | PASS |
| **TAL-01600** | S2.3 | Dual-layout cadence | PASS |
| **TAL-01602** | S4.A6-1 | SL during replay | PASS |
| **TAL-01616** | S4.A6-2 | F5 orders | PASS |
| **TAL-01626** | S2.2 | Manual replay + F5 | PASS |
| **TAL-01629** | S2.6 | Re-render artifact | PASS |
| **TAL-01631** | S2.6 | Layout jump | PASS |
| **TAL-01638** | S4.T4 | Limit/stop buttons | PASS |
| **TAL-01647** | S3.4 | Tick after time pick | PASS |
| **TAL-01650** | S2.6 | Replay/TF chaos (c,d,e) | PASS |
| **TAL-01653** | S4.A6-1b | SL/TP follow entry drag | PASS |
| **TAL-01581** | S3.2 | Interval replay | PASS |
| **TAL-01582** | S3.3 | Tick mode | PASS |
| **TAL-01585** | S5.RC3 | Layers on TF change | PASS |

---

## 6. PENDING-DEPLOY ticket index (13 families)

These are **retest-only** on the blessed build — zero new engineering. Mapped to sessions above.

| Ticket | Symptom (short) | Session | Staged fix |
|--------|-----------------|---------|------------|
| **TAL-01609** | One panel freezes on PLAY | S2.1 | D-015 |
| **TAL-01610** | Others frozen + after refresh | S2.1–2.2 | D-015 + a4 |
| **TAL-01611** | Tick animation in candle mode | S3.1 | D-009 (a) |
| **TAL-01612** | Date jumps weeks | S3.2 | D-009 (b) |
| **TAL-01600** | Dual-layout cadence lag | S2.3 | D-015 + D-016 |
| **TAL-01603 (b+c)** | Finest TF + freeze | S2.1 + S2.4 | D-016 + D-015 |
| **TAL-01626** | Replay date + F5 reset | S2.2 | a4 persistence |
| **TAL-01647** | Tick mode after time pick | S3.4 | D-009 routing |
| **TAL-01650 (c,d,e)** | Replay re-render / TF chaos | S2.6 | D-015/D-016 |
| **TAL-01629** | Replay re-render artifact | S2.6 | same family |
| **TAL-01631** | Layout jumps on peer render | S2.6 | T8 adopt-X retest |
| **TAL-01638** | Limit/stop mutates type | S4.T4 | T4 reclassify |
| **TAL-01653** | SL/TP don’t follow entry drag | S4.A6-1b | A6-1 visual follow |

**Not PENDING-DEPLOY (do not expect closure on ship):** TAL-01603 **part a** (main-chart TF stuck) — T8 TF-response track; A7b VP cluster; A8 Shift-modifier; most IN-TRACK intake rows.

---

## 7. Explicit exclusions — stays open after ship

| Category | Examples | Why |
|----------|----------|-----|
| **IN-TRACK engineering** | H-R04/H-R05 until proven → STAGED; H-S25, H-S27, H-S73; A6-4; COMBINED-BUILD gate row | Not in the 42 STAGED set or not yet landed |
| **A7b VP cluster** | TAL-01665–01667, 01661–01662, 01664 | R2 axis crush — post-bless `chart.js` batch (D-029) |
| **A7 indicator perf** | TAL-01632, 01659, 01620, … | Diagnostic dispatch post-bless |
| **A8 / T1 modifier** | TAL-01654, 01655, 01593 | Not staged |
| **Needs repro / PO decision** | TAL-01628, 01660, 01599 | Blocked |
| **RC-5 still-open** | #4, #5 replay×order keyboard pan | Do not claim fixed at combined cut |

---

## 8. Closure workflow (Manager + tester)

### 8.1 Tester deliverable (one form)

For each session, record:

```
Build: __________  Tester: __________  Date: __________
Session: S1 | S2 | S3 | S4 | S5 | S6
Result: PASS | FAIL (list rows)
Evidence: screenshot / short clip for FAIL only
```

Attach completed **`MULTICHART-PARITY-CHECKLIST.md`** (S1) with build id filled.

### 8.2 Manager scoreboard update

On each **PASS** with correct build id:

1. Set row `status` = **CLOSED-VERIFIED** in `PLAN2-SCOREBOARD.csv`.
2. Set `note` = `PO retest PASS build:__________ session:S_`.
3. Mirror ticket disposition in `TICKET-REGISTRY.csv` / `RESOLUTION-TRACKER.csv` if applicable.
4. Recompute headline: **CLOSED-VERIFIED / 153** — publish single number (D-028).

**Batch flip allowed** when a parent engineering row closes all child tickets (e.g. **RC-5 PASS** → registry `fixed_pending_live` rows).

### 8.3 FAIL handling

| FAIL type | Action |
|-----------|--------|
| PENDING-DEPLOY ticket FAIL | Re-open ticket; **do not** revert STAGED engineering row until triage names regression vs test error |
| Parity checklist row FAIL | Block deploy sign-off; Lane 1/T3 fix + re-bless |
| A6/RC-5 single row FAIL | File against specific switch family; other rows may still close |

---

## 9. Forecast timeline (ideal)

| Day | Milestone | Progress bump |
|-----|-----------|-----------------|
| D0 | Bless + deploy + build id broadcast | 3% (unchanged) |
| D1 | S0 + S1 + S2 (interaction + replay) | +~18 rows → ~15% |
| D2 | S3 + S4 (mode + orders) | +~14 rows → ~24% |
| D3 | S5 + S6 + Manager CSV update | +~10 rows → **~31–32%** |

---

## 10. References

- `docs/tickets-overhaul/PLAN2-SCOREBOARD.csv` — 42 STAGED rows
- `docs/tickets-overhaul/T3-COMBINED-BUILD-MANIFEST.md` §4.1 — six PENDING-DEPLOY (morning intake)
- `docs/tickets-overhaul/DAILY-INTAKE.md` — 2026-07-15 + 2026-07-16 evening (13 total PENDING-DEPLOY)
- `docs/tickets-overhaul/MULTICHART-PARITY-CHECKLIST.md`
- `docs/tickets-overhaul/worker-reports/T6-step7-rc5-rc6-closure-sweep-report.md` — Appendix C
- `docs/tickets-overhaul/PROGRESS-REPORT-2026-07-17.md` — 3% vs ~30/110 closure gap

**Maintenance:** When H-R04/H-R05 flip to STAGED on bless, add them to S1 rows 4–5 in §5 master map (already scripted in checklist).
