# TRAIN HAZARD — do not take C tip commits a4f388296 / 8a17b05c6

**When:** 2026-07-29  
**Owner:** Manager B (train)

## Ban

| SHA | Subject | Why banned |
|---|---|---|
| `a4f388296` | m14-fib: persist accepted Fibonacci levels | Abandoned D attempt on `manager-c/verification-infra` — **~18k line CRLF/LF churn** on `drawing-tools-manager.js` |
| `8a17b05c6` | m24-ledger: guard chart journal PATCH deletes | Same abandoned path — **CRLF churn** on `session_journal_store.py` / tests + api_server |

## Canonical source

Assemble D’s redo from **`manager-d/trade-correctness` only**:

| SHA | Subject |
|---|---|
| `95adb8285` | m24-ledger: define safe journal prune policy |
| `42d01a1dc` | m14-fib: persist accepted Fibonacci levels |

If assembling anything from C: **stop at `00547509b`**. Do not fast-forward `manager-c/verification-infra` tip.

## B follow-on

M24 store helper lands from D; `api_server.py` prune hook is B-owned (`PATCH-REQUEST-B-M24-API-SERVER-20260729.md`) — apply cleanly, never via `8a17b05c6`.
