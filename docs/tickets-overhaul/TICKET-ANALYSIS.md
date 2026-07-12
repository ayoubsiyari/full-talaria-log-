# Ticket History Analysis — Talaria Chart QA Tickets

**Source:** `support tickets history/messages.csv` — 1,654 messages across **812 tickets**, 2026-05-22 → 2026-07-06.
**Testers:** ibrahim (545 tickets), abod/"Ninja" (249), plus a handful from admin/mohamed/hermes.
**Normalized data:** `support tickets history/tickets_normalized.json` (one record per ticket, message bodies inlined).
**Per-ticket cluster assignment:** `TICKET-REGISTRY.csv` in this folder.

## 1. Headline numbers

| Metric | Value |
|---|---|
| Unique tickets | 812 |
| Resolved/closed | 686 |
| **Unresolved** (open / user_replied / pending) | **126** |
| Tickets with a reopen loop (activity on ≥3 distinct days = fix → retest → fail cycles) | 55 |
| Explicit "not solved / still the same" messages | 31 tickets |

A critical structural fact: **tickets are multi-bug threads, not single bugs.** Testers appended new findings to existing threads (TAL-00157 "chart bug" contains ~20 distinct bugs across 35 messages and 13 active days). The real defect count is closer to the message count (~1,600) than the ticket count. Any plan that treats "ticket closed" as "bug fixed" undercounts by 2×.

## 2. Clusters (by subsystem, not symptom)

| Cluster | Tickets | Unresolved | Reopen loops (≥3 days) |
|---|---|---|---|
| **Drawing tools** | 244 | 41 | **28** |
| **Multichart / Layouts** | 165 | 17 | 0 |
| Chart core & UI chrome | 158 | 27 | 8 |
| Journal / dashboard app | 133 | 15 | 1 |
| **Indicators** | 74 | 17 | **15** |
| Orders / trading panel | 20 | 6 | 2 |
| Replay | 18 | 3 | 1 |

Notes:
- Orders looks small (20 tickets) but is dense: TAL-00752 alone contains ~20 distinct order-entry bugs (multi-entry averaging, risk split, SL/TP arithmetic, limit→market mutation, PNL sign error). Weight by message count, not ticket count.
- Multichart/Layouts shows 0 old reopen loops because most of it is a **fresh July-4 batch** (TAL-01480…TAL-01502) filed after the multichart data/viewport overhaul closed — these are the *interaction parity* gaps (see §4).
- 43% of all drawing-tool reopen loops and 20% of indicator loops remained in `user_replied` (tester came back, nobody confirmed the fix) — the closure protocol was missing.

## 3. Cross-cutting symptom patterns (the actual signal)

These symptoms recur across *dozens of unrelated tools* — which is the fingerprint of a shared-layer defect patched tool-by-tool:

| Symptom pattern | Tickets | Example refs |
|---|---|---|
| Selection state broken (deselect loses menu, Ctrl+drag loses selection, select-on-first-click fails) | 43 | TAL-00118, 00150, 00157, 00257, 00276 |
| Price/time labels stuck, missing, or on wrong anchor | 41 | TAL-00043, 00117, 00123, 00150, 00157 |
| Element stuck/frozen until user clicks the chart | 38 | TAL-00157, 00271, 00281, 00285, 01484, 01490 |
| **First click does nothing, second click works** | 30 | TAL-00106, 00117, 00118, 00123, 00148, 00322 |
| Explicit reopen ("not solved") | 31 | TAL-00055, 00148, 00245, 00259, 00271 |
| Replay × feature interaction bugs | 29 | TAL-00157, 00321, 00350, 00451, 00752 |
| Drag/move mis-anchors (tool snaps back, jumps to candle middle, moves whole chart) | 27 | TAL-00157, 00245, 00257, 00283 |
| Visibility toggle doesn't restore | 24 | TAL-00054, 00150, 00245, 00322 |
| Quick Menu defects (stale, wrong z-order, blocks chart, slow) | 24 | TAL-00055, 00157, 00273, 00283 |
| Slow/laggy interaction | 24 | TAL-00157, 00322, 00377, 00854 |
| Ghost artifacts remain after delete (labels, settings dialog, lines) | 12+7 | TAL-00157, 00253, 00259, 00322, 00752 |

**Reading:** "first click fails," "settings remain after delete," "hidden until you tap the screen," "label stuck" appear on trendlines, fibs, channels, VWAP, notes, callouts, pins, patterns — i.e. on *every* tool family. Nobody fixes the same bug 30 times in 30 tools unless the defect lives in the shared lifecycle those tools sit on, and only the per-tool symptom was patched.

## 4. The fresh multichart/Layouts batch (July 4) — interaction parity

Filed on b9x builds *after* the data/viewport overhaul went green. All are about the UI layer inside panels, not data:

- TAL-01480 re-render on same symbol; TAL-01484/01490 panel doesn't update **until click on screen**; TAL-01489 second layout glitches on tap; TAL-01491 drag stops outside frame box; TAL-01495 drawing lands on wrong symbol's panel; TAL-01498 Ctrl-select doesn't work on second chart; TAL-01499 Quick Menu doesn't show on panel; TAL-01500/01501 indicator add/remove state leaks between layouts; TAL-01502 price mismatch on first boot.

This matches the code-scan finding that panels run a degraded interaction stack (host order rail vs iframe focus, per-panel drawings with monkey-patched sync, settings forwarded to parent shell). The overhaul fixed data ownership; **interaction ownership was never specified**.

## 5. Longest reopen loops (the bug-loop cases to learn from)

| Ticket | Subject | Days active | Msgs | Status |
|---|---|---|---|---|
| TAL-00157 | chart bug (grab-bag) | 13 | 35 | user_replied |
| TAL-00350 | indicator | 6 | 13 | user_replied |
| TAL-00322 | anchored vwap | 4 (spanning a month) | 29 | user_replied |
| TAL-00323 | fixed range volume profile | 4 | 27 | user_replied |
| TAL-00752 | order entry | 7 | 22 | user_replied |
| TAL-00117 | Regression channel | 5 | 19 | user_replied |
| TAL-00228 | Fib timezone | 5 | 17 | user_replied |

TAL-00322 (anchored VWAP) is the archetype: 29 messages over a month, symptoms from *five different root-cause families* (first-click render, quick-menu stacking, label anchoring, visibility toggle, control-point drag) all funneled into one thread, patched one symptom at a time, still open. Note: anchored VWAP is one of the tools confirmed by code scan to use **bar-index anchoring** (`drawing-tools-advanced-volume.js:834-866`), which breaks whenever history is prepended.

## 6. What the old process got wrong (why the loop happened)

1. **Fixes were routed by ticket, not by root cause.** 30 "first click fails" tickets = 30 separate patches in 30 tool files, instead of 1 fix in the shared selection/render layer.
2. **Multi-bug threads hid scope.** "Resolved" status on a thread with 12 bugs means an unknown subset was actually fixed.
3. **No regression harness for interactive features.** `chart-regression-cases.js` is an empty array; the multichart harness covers viewport/data only. Every patch could silently break a sibling tool — and per the reopen data, it did.
4. **No closure protocol.** 96 tickets sit in `user_replied` — the tester re-tested and reported back, and the loop dropped the ball there.
5. **Weak-model workers with no cross-ticket context** could not see the pattern in §3; each saw one symptom in one tool.
