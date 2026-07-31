# PO Side-Tasks Menu — useful human work that does not touch the fix lanes

Date: 2026-07-25 · From: Director · For: PO + advisor (to select, sequence, and run together)
Delivery model: PO executes with advisor guidance, collects everything, hands results to the Director **in one batch** per task (not drip-fed).

## Ground rules (read first — these protect the fix lanes)

1. **Hands off the lag issue itself.** No console experiments, no kill-switch toggling, no speed tests "just to check" — that issue is lab-side by ruling (§16.5), and uncontrolled runs create noise the team then has to explain. Everything below is chosen to be orthogonal to it.
2. **TEST environment only**, and not during the manager's deploy windows (if the build id on screen is changing, stop and come back later).
3. **Every piece of evidence carries its passport**, or it cannot be used: build id (from the tripwire badge), date/time, browser + OS, data range loaded, replay state (speed, playing/paused — the b63 lesson), and steps to reproduce.
4. **Evidence format (PO preference, 2026-07-25): written notes + screenshots — screen video is OPTIONAL, not required.** T-A becomes a written pass/fail checklist per flow (screenshot where a picture helps); T-B a comparison notes table (screenshot of competitor speed options / plan limits); T-C verdicts + screenshot only for STILL BROKEN items. The PO's eyes are the instrument; the notes are the record.
5. Batch format per task: one folder `docs/plan3/po-evidence/<task-id>/` with the notes file + screenshots. I'll process each folder in one pass.

---

## Tier 1 — highest value, start here

### T-A. Visual baseline library ("what does CORRECT look like")
**Why:** every acceptance debate ("is this smooth enough?") burns time because we have no recorded reference. You are the reference — make it explicit.
**What:** on **b65** (last accepted build), record 20–40 s clips of each core flow behaving correctly at your quality bar: single-chart pan/zoom (fast + slow), replay at 1×/10× (speeds that work today), timeframe switches during replay, drawings while panning, order lines during replay, multichart 2-up and 4-up sync (pan/zoom/replay), price-axis drag, symbol switch.
**Output:** clip library + one-line description each: "this is the standard."
**Uses later:** acceptance reference for every future fix; calibration for the visual oracles; onboarding for new testers.

### T-B. Competitor parity benchmark (TradeZella / TradingView)
**Why:** "match and beat TradeZella" is the sprint's target, but nobody has recorded what TradeZella actually feels like, side by side, scenario by scenario. Only a human with accounts can do this.
**What:** the same scenario list as T-A, recorded on TradeZella and TradingView: multichart replay sync, high-speed replay **with indicators loaded** (their EMA at max speed — does it stay glued?), pan-during-replay, huge date ranges. Note speed caps and feature limits you find — if TradeZella caps replay speed, that is strategic information for the §14.5 product decision.
**Output:** side-by-side clip pairs + a comparison table (scenario / them / us / gap size).
**Uses later:** C4 renderer decision, the speed-cap product question, marketing claims.

### T-C. Ticket verification sweep on the current TEST build
**Why:** the Plan-2/Plan-3 ticket backlog contains items marked fixed that testers never re-verified, and open items that may have been fixed incidentally. A verified status table shrinks the board with zero engineering time.
**What:** walk the ticket list (I'll generate the checklist from the board on request — say the word and it lands in the evidence folder as `T-C-checklist.md`); for each: reproduce steps on TEST → verdict `FIXED / STILL BROKEN / CANNOT REPRODUCE / BLOCKED BY LAG` + clip for anything still broken.
**Output:** the verdict table. **Rule:** anything touching high-speed replay indicators → mark `BLOCKED BY LAG`, skip, do not investigate.

---

## Tier 2 — strong value, run when Tier 1 is done

### T-D. Browser / device matrix
**Why:** all recent testing is one browser on one machine; the tester base isn't.
**What:** repeat a 10-minute core-flow script (from T-A list) on: Chrome, Edge, Firefox (+ Safari/iPad if available — the touch-gesture work shipped recently and has had almost no human testing). Note anything that differs from your Chrome baseline.
**Output:** matrix table (flow × browser → OK/issue+clip).

### T-E. Long-session soak, human edition
**Why:** the plan has automated idle-soak gates specced but not yet standing; a human-run soak gives early evidence.
**What:** open a session with indicators + drawings + a few orders; leave it running 2–4 hours while you do other things; every 30 min note: Task Manager memory for the tab, does pan still feel instant, any console errors (screenshot only — touch nothing). One run idle, one run with replay playing at a **low** speed (≤10×, which is clean by the §16 evidence).
**Output:** timestamped table + screenshots.

### T-F. Fresh-eyes friction log
**Why:** you know the product too well; a structured "annoyance inventory" from deliberate novice behavior finds paper cuts no ticket ever captures.
**What:** one hour, pretend you're a new TradeZella refugee: first session setup, first backtest, first multichart. Write down every hesitation, surprise, and "why did it do that" — no fix proposals, just observations.
**Output:** ranked annoyance list (this often becomes the best post-sprint roadmap input there is).

---

## Tier 3 — preparation work for what's coming

### T-G. Acceptance checklists for the next milestones (write them BEFORE the builds arrive)
**Why:** when the lag fix and later the C2 render-worker wiring land, the feel-tests will be on the critical path — you can make them rigorous now instead of improvising then.
**What:** with the advisor, turn T-A's baseline into two one-page checklists: (1) "lag-fix acceptance" — flows, speeds, indicator sets, ranges you will personally verify, each with pass criteria referencing a T-A clip; (2) "C2 wiring acceptance" — the pixel-parity flows that must look identical after the renderer moves off-thread.
**Output:** two checklist files. When the builds arrive, your feel-test is 30 structured minutes instead of an open-ended afternoon.

### T-H. Tester playbook upgrade
**Why:** tester reports still arrive without build ids or replay state — the exact confounders that cost us this week (Fact-1, E6 run 2).
**What:** write the one-page report template (build id from tripwire, state passport from rule 3, clip-first) + a 5-minute "how to report" walkthrough clip using a T-A recording as the example. Roll it to the tester group.
**Output:** template + walkthrough; future tickets arrive pre-verified.

---

## Explicitly NOT on this menu (so there's no ambiguity)

- Anything involving kill-switches, console commands, or high-speed replay with indicators (the blocked scenario) — lab-side only.
- Production environment — everything here is TEST.
- Re-testing b66 "to see if it maybe improved" — CKPT-023 is closed FAIL; the next PO test is the harness-verified build via the T-G checklist.

## Suggested first week

Day 1–2: T-A (it unlocks T-B, T-G, T-H). Day 2–3: T-B. Day 3+: T-C sweep, T-D matrix. T-E runs in the background any day. T-F and Tier 3 with the advisor as energy allows.
