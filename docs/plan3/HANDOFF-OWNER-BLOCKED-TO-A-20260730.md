# HANDOFF → Manager A — 13 owner-blocked rows (full list)

**From:** Manager D · `manager-d/trade-correctness` tip `afb0dd304`+  
**Source:** `OWNER-BLOCKED-ROUTING-20260730-2135.md` · ledger `TICKET-STATUS-LEDGER-20260729.md`  
**Count check:** 13 rows named below (not “13 of something”).

| # | Ticket | Symptom / why A |
|---|---|---|
| 1 | TAL-01865 | `chart.js` symbol / `fileId` persist — `PATCH-REQUEST-A-SYMBOL-PERSIST` |
| 2 | TAL-01747 | boot pair vs URL/session primary (same class as 01865) |
| 3 | M20-A timezone sha pin | timezone pin re-review — `PATCH-REQUEST-M20-A-TIMEZONE-PIN-REPIN` |
| 4 | TAL-01733 | H-S19 play-follow / multichart follow (CONF-01 harness) |
| 5 | TAL-01759 | session / layout isolation (Cluster E) |
| 6 | TAL-01799 | multichart layout shell on panel add |
| 7 | TAL-01850 | **CANARY BLOCKER** — keyboard shortcuts (`keyboard-shortcuts.js` / `chart.js`); PO-DECISIONS: BLOCKER |
| 8 | TAL-01864 | smart-window / history range (Cluster I) |
| 9 | TAL-01893 | Go-To forward skip (`goToNextSession` in `chart.js`) |
| 10 | TAL-01931 | replay step-forward batching (`replay-system.js`) |
| 11 | TAL-01936 | time alignment (`chart.js`) |
| 12 | TAL-01891 | **LIVE P0 candidate** — PULL-01 real-payload measurement: one decoded chart bitmap is 20.7 MB; heavy account scale can plausibly reach multi-GB. See `PULL01-ORDER-MEMORY-TERMS-20260731.md` and `QUESTION-TAL-01891-PATH-STILL-ON-B113-20260730.md` |
| 13 | TAL-01854 | PO-DECISIONS: REAL — auto-follow / TF-downshift family (reopened) |

D does not own these. No second browser from D while C’s CONF-01 chrome is live.
