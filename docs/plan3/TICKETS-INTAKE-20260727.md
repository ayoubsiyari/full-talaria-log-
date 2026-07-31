# Ticket intake — 2026-07-27 export + Rayan document

> MERGED into Plan 3 on 2026-07-27: mechanism rows in `PLAN3-BOARD.md` § Intake 2026-07-27; lanes/parallelization/PO visual scripts in `INTAKE-MERGE-20260727.md`. This file remains the raw inventory + PO clarification record.

Sources: `tickets/support-export-full-all-27-07-26/messages.csv` (124 distinct tickets, TAL-01617…TAL-01941, multi-message threads merged) + `tickets/Talaria Order testing Forex.docx` (external tester Rayan, 11 tickets, FX-Replay-experienced).

Version split (PO): **Ninja** (`abod@talaria-log.com`) and **IBRAHIM KHATTALIN** (`ialkataleen@gmail.com`) switched to the NEW build on 2026-07-26; their tickets dated ≥26-07 refer to the new version, everything earlier (and all other testers) = live website `talaria-log.com`.
- New-version candidates: TAL-01929 (session re-enter position), TAL-01926 (all-trades stat frozen after refresh). TAL-01927 (duplicate trade screenshot after play+refresh) is per its own subject on the website version.

## Clusters (duplicates counted as one issue)

### A. Replay rollback does not cancel executed trades — Rayan's #1 theme (6 reports → 1 issue)
Rayan #1, #3, #6b (trade stays active after rollback, wrong location, P&L partially resets), TAL-01937 (PO-clarified: stuck order arrows on screen after rolling back before an executed order — same rollback-cleanup failure), plus website TAL-01800 (reset chart closes/replaces orders). Expected behavior per Rayan: rollback past an executed trade → confirm → cancel permanently; never auto-reactivate.

### B. Trades not registered / journal missing trades (6 → 1..2 issues)
Rayan #11 (executed trade absent from history), Rayan #4/#5/#9 (duplicate order IDs; refresh removed one of the two trades), TAL-01911 (journal missing backtest trades), TAL-01908 (only last 42 of 60 recorded), TAL-01919 (trades not counted), TAL-01924 (backtest stuck at 21 trades, P&L frozen), TAL-01926 (all-trades stat frozen after refresh — NEW build).

### C. Multichart replay freeze/lag (second chart stops) (6 → 1 issue, KNOWN — Plan 3 core)
Rayan #2 (price stuck; closing second chart layout un-stuck it but order vanished), TAL-01939 (NQ/ES second chart stops until pause/resume), TAL-01733, TAL-01717 (second chart shakes tick-by-tick), TAL-01910 (second chart breaks at last candle, 1m), TAL-01887 (ES 15m not advancing).

### D. Session restore / resume position (5 → 1 issue, overlaps MC-RESTORE/playhead work)
TAL-01929 (NEW: returns to earlier point, step-forward jumps days), TAL-01909 (always returns to 2/5), TAL-01912 (cannot navigate to set time), TAL-01893 (GoTo skips 2–3 sessions), TAL-01677 (GoTo session error message).

### E. Refresh/persistence losses (6 → grouped)
TAL-01865 + TAL-01747 (symbol reverts after refresh — same, 1 issue), TAL-01895 + TAL-01792 (pinned timeframes and pinned tools lost on refresh/exit-reenter — same issue; PO spec: pins are user-level memory, must survive refresh, session exit/re-enter, and appear in new sessions), TAL-01759 (previous session's layouts persist into new session), TAL-01903 (PNL value changes after refresh), TAL-01927 (PO-clarified repro: place order → screenshot auto-taken → press play → refresh → trade card takes a second screenshot for the already-screenshotted trade; screenshot capture is not idempotent across reload).

### F. Fibonacci settings do not apply (4 reporters → 1 issue)
TAL-01930, TAL-01888, TAL-01813, TAL-01758-thread: edited fib levels accepted in dialog but chart reverts.

### G. Order mechanics on chart (12+ distinct, mostly Ninja, website build)
TAL-01933 (TP hit, trade keeps running), TAL-01904 (entry 1 tick above price stays market), TAL-01897 (new order inherits previous SL/TP), TAL-01885 (some SL lines invisible), TAL-01777 (SL orphaned across pair switch), TAL-01861 (cancel-before-confirm still places market), TAL-01809 (balance goes negative), TAL-01810 (exit arrows on wrong candles with spread), TAL-01751 (BE moves on place), TAL-01750 (hover sticks orders), TAL-01699/1698/1697/1696 (TP/SL drag family), TAL-01683 (fixed-$ risk should adjust qty), TAL-01617 (SL label lag), TAL-01905 (recurred: order closes instantly on entry), TAL-01932 (sell limit not triggered / should close 5 long contracts), TAL-01941 (PO-clarified: slippage with SL not triggering, RECURRING across several testers, pair/TF undocumented — needs reproduction effort, do not drop), TAL-01896 (wrong duration), Rayan #8 (random sell order self-opened + skipped ID #8 — PO has no further info; keep as unconfirmed/watch).

### H. Indicator display (labels) (3 → 1 issue + settings bug)
TAL-01935/1914/1921 (indicator/level labels absent while stepping candle-by-candle or paused; appear on Play) — one issue. TAL-01894 (label text invisible, white-on-white settings). TAL-01938 (ORB size changes across TF switch), TAL-01913 (daily-open vertical lines missing).

### I. Candle/data integrity (7)
TAL-01922 (phantom daily candle / day-close timing — Wafai, detailed thread), TAL-01918 (previous candle close mutates at next open), TAL-01886 (current price inconsistent across TFs), TAL-01802 (1m vs 5m price difference — NEW-ish? dated 21-07 = website), TAL-01917 (TF switch doesn't change candles), TAL-01864 (asked 10y, pre-2016 6y loaded instead), TAL-01936 (no time alignment despite setting), TAL-01925 + TAL-01898 (PO-clarified, recurring across testers: switching from the current weekly candle down to a lower TF like 1h makes the chart jump back in date, away from the analyzed area — 1 issue).

### J. Zoom/scale/grid/axis (9)
TAL-01916 (zoom out acts as zoom in), TAL-01821 (both scroll directions zoom out on price scale), TAL-01928 (PO-clarified: on small screens or with browser zoom, toolbar icons/buttons overlap — responsive-layout bug, not a chart-scale bug), TAL-01838 + TAL-01724 (per-candle gridlines reappear via shortcut/reset — 1 issue), TAL-01755 + TAL-01734 (new custom TF gridlines days apart — 1 issue), TAL-01862 (news flag scales with zoom), TAL-01823 (rescale artifact until move), TAL-01768 (price-scale rescale needs 2nd attempt), TAL-01735 (dragging time label runs chart away).

### K. Crosshair (4 → 3 issues)
TAL-01934 + TAL-01700 (same issue — PO-clarified: during synced multichart replay, the crosshair's time-axis label stays frozen at a fixed date/time while candles advance; it should update as each new candle shifts the chart), TAL-01744 (snaps to candles; customization not synced across layouts), TAL-01758 (tablet: cursor drags whole chart).

### L. Replay controls (7)
TAL-01931 (step-forward: 2 silent steps then 3 candles at once), TAL-01900 (interval below chart TF only advances 5 sub-steps), TAL-01899 (tick path draws wick before body), TAL-01718 (>30× tick-by-tick degrades to candle mode), TAL-01902 (clock advances through weekend while price frozen), TAL-01854 (no auto-follow when last candle off-screen), TAL-01923 (drawings lag chart during replay with locked labels).

### M. Old-layout system (Ibrahim, website build — mostly superseded by new multichart)
TAL-01831, 1824, 1823, 1743, 1740, 1739, 1737, 1736, 1728, 1726, 1725, 1719, 1709, 1798, 1799, 1800, 1795, 1796, 1688, 1847, 1769, 1768.

### N. Memory/idle lag (KNOWN — Plan 3 M19/M20)
TAL-01892 (idle → lag on return), TAL-01891 (memory grows to 8 GB, Chrome crash risk).

### O. Feature requests (not bugs)
TAL-01907 (ATR bands + RTH-only option), TAL-01906 (SMT compare synced), TAL-01915 (COT/OI availability), TAL-01814 (SMC webhook indicator), TAL-01852 (hide-future-candles analysis mode), TAL-01851 (settings-as-layout template), TAL-01850 (TradingView-style shortcuts), TAL-01849 (text/tool templates), TAL-01784 (time-only presets), TAL-01940 (post-trade variables: N same-option groups share one selection — likely a real bug in journal UI).

### P. Rayan resolved/updates
#7 settings/profile server error → #10 self-resolved (monitor), #9 is an update to #4.

## PO clarification round — resolved 2026-07-27
- TAL-01941 → keep: recurring slippage/SL-miss across testers, poorly documented; needs repro effort.
- TAL-01937 → merged into cluster A (rollback cleanup).
- TAL-01920 → SCRATCHED (tester misread low-volume out-of-hours candles).
- TAL-01894 → SCRATCHED (PO instruction).
- TAL-01925 → merged with TAL-01898 into cluster I (weekly→lower-TF date jump, recurring).
- TAL-01792 → merged with TAL-01895 into cluster E; PO spec: pins persist across refresh/exit/new sessions.
- TAL-01732 → CLOSED (already resolved).
- TAL-01934 → merged with TAL-01700 into cluster K (crosshair time label frozen during multichart replay).
- TAL-01928 → reclassified: responsive toolbar overlap on small screens / browser zoom.
- TAL-01912 → SCRATCHED (user confusion).
- TAL-01927 → repro confirmed: duplicate trade screenshot after play+refresh (screenshot idempotency).
- Rayan #8 → unconfirmed/watch, no repro info available.
