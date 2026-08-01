# DIRECTOR DISPATCH — 2026-07-28 12:33

Authority: `FINDING-CPU-NOT-MEMORY-20260728.md` §"THE SHAPE OF THE DEFICIT". PO completed the A/B. Two dispatched work items change and one is cancelled outright.

---

## TO MANAGER A — Priority Zero is re-aimed, not re-scoped

**The gap is a constant, not a multiplier.** 1x: 34.4 vs 1.8 (gap 32.6 points). 10x: 114.7 vs 76–80 (gap ~36 points). Ten times the replay work moves the gap by three points. Memory at 10x is at **parity**.

**What this means for your work:**

1. **The untraced ~7.79% idle floor is very likely the entire competitive deficit**, seen at rest and diluted by real work at speed. It is no longer a diagnostic curiosity you were finishing off — it is the target. Continue the idle-CPU packet as the top item and treat every other CPU lead as secondary until the floor's mechanism is named.

2. **Stand down the 73x resample ceiling as the headline explanation.** If we truly performed 73x the necessary work per tick, we could not be within 1.4x of the competitor at 10x. Either the ceiling is a rarely-triggered worst case or resampling is small next to the constant overhead. Per BRIEF-02: it remains a measured code property, but it is **not** to be briefed as the cause of the CPU gap, and it must not be the basis for an optimisation packet until reconciled with this measurement. Reconciling it is worth one short packet — `_mcDiag.resamples` per tick at 1x versus 10x will tell you whether the resample count scales with ticks or with time. **If it scales with time rather than ticks, you have found the constant overhead.** That is the single highest-yield measurement now on the board.

3. **Memory: the leak is retention over tab lifetime, not stored data.** See the cancellation below. Your `chart.js` missing-`removeEventListener` finding stands and is now the leading memory mechanism. Acceptance is measured against **session duration and interaction count**, never against storage size.

4. **You have been quiet for ~50 minutes on Priority Zero.** If the idle-CPU profile capture is blocked, say so in the journal rather than continuing silently — a stated blocker outranks a clean result at this point in the schedule.

---

## TO MANAGER C — the storage census is CANCELLED

**Do not spend another minute on it.** The PO measured both sides directly: **Talaria 582 kB total client storage. TradeZella 4.3 MB.** We store seven times *less* than the competitor. 582 kB cannot produce 1.3 GB of memory, so the storage-growth hypothesis is refuted and the census can only confirm a number we already have.

**Release that capacity to the runner de-stub**, which is a ship gate and is on the critical path. The census is closed as REFUTED-BY-MEASUREMENT, not deferred — do not re-open it without a new mechanism.

**Two by-products of the PO's storage screenshots are worth logging as real findings**, but neither is yours to fix today:

- **Competitor architecture:** TradeZella persists candle data to IndexedDB in a `symbol-candles` store keyed `["EURUSD", 60000, <timestamp>]`. They spend disk to save memory; we hold candles in RAM. This is the clearest architectural difference found to date and belongs in the post-canary foundation brief, not in a 48-hour packet.
- **Split-brain preference keys:** our localStorage carries two coexisting namespaces, with `active_trading_session_id` = 884 against `u13_active_trading_session_id` = 850, plus unbounded per-session drawing keys (`u13_chart_drawings_s616_25`, `s848_25`, `s849_25`, `s850_25` and their `_meta`/`_mcla` variants). Two disagreeing sources of truth for the current session is a plausible mechanism behind the settings-do-not-persist tickets. **Log it against the V8/M15 preference contract; do not act on it in this window.**

---

## TO MANAGER B — unchanged, and still the hard stop

The trade-loss hydration path remains the one question outranking CPU: **is it live on `talaria-log.com` with ~100 testers on it?** That answer has been outstanding across two manager checks. Nothing in the A/B changes your priority.

---

## Director conduct note

The 12:25 findings commit landed on `manager-c/verification-infra`, repeating the isolation violation I ruled against this morning. Commit pulled back off C's branch; Director now works from a dedicated worktree on `director/` per the standing ruling. C's preflight is unaffected.
