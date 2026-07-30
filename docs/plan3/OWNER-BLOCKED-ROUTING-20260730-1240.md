# Owner-blocked routing — 13 rows (Director routes; D does not chase)

**Checkout:** `C:\Users\user\Desktop\talaria1\manager-d-trade`  
**Branch:** `manager-d/trade-correctness`  
**Date:** 2026-07-30 12:40

| Ticket | Owner | Mechanism / path |
| --- | --- | --- |
| TAL-01865 | **A** | `chart.js` symbol / `fileId` persist (`PATCH-REQUEST-A-SYMBOL-PERSIST`) |
| TAL-01747 | **A** | `chart.js` boot pair vs URL/session primary (same class as 01865) |
| M20-A timezone sha pin | **A** | `timezone-manager.js` M20-A pin re-review (`PATCH-REQUEST-M20-A-TIMEZONE-PIN-REPIN`) |
| TAL-01759 | **A** | Multichart / session layout isolation (Cluster E) |
| TAL-01799 | **A** | Multichart layout shell on panel add (cross-check **B** only if placed orders leak onto the new panel) |
| TAL-01864 | **A** | `chart.js` smart-window / history range (Cluster I) |
| TAL-01913 | **A** | Chart overlay: daily-open lines (Cluster H) |
| TAL-01914 | **A** | Chart overlay: indicator labels (Cluster H) |
| TAL-01921 | **A** | Chart overlay: indicator labels (Cluster H) |
| TAL-01931 | **A** | `replay-system.js` step-forward batching (Cluster L) |
| TAL-01935 | **A** | Chart overlay: indicator labels (Cluster H) |
| TAL-01936 | **A** | `chart.js` time-alignment (Cluster I) |
| TAL-01938 | **A** | Chart overlay: ORB size / session labels (Cluster H) |

**Summary for routing:** all **13 → Manager A**. One conditional B consult on TAL-01799 if the symptom is an order leak rather than an empty layout shell.
