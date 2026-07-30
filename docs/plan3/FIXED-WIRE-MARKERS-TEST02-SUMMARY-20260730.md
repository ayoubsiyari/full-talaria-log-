# Fixed-wire markers — TEST-02 amended (fix-commit~1)

**Correction:** `CORRECTION-B103-IS-NOT-A-PRE-FIX-CORPUS-…-1635.md`  
**Artifact:** `WIRE-AUDIT-TEST02-20260730b113.json` (schema `talaria.wire-audit-test02.v2`)

| Class | Count |
|---|---:|
| on-wire | **39** |
| off-wire | 2 (Rayan #8, TAL-01807b) |
| wire-unproven | 7 |
| delivery-unserved | 1 (TAL-01896) |
| backend-needs-api-probe | 1 (TAL-01926) |

Prior mistaken b103-corpus run reported 10/50 — **withdrawn**.

## Money rows

| Ticket | Method | Verdict |
|---|---|---|
| Rayan #2 | behavioural primary (host survives peer remove) | on-wire |
| Rayan #8 | behavioural blocked — product flags absent | off-wire |
| TAL-01896 | delivery census | not served on canary |
| TAL-01807b | parent~1 text | off-wire |
| TAL-01926 | live API (401 unread) | needs token from B |

## Note (Windows)

Parent refs use `commit~1`, not `commit^` — bare `^` is eaten under Windows and
falsely resolves to the fix commit itself.
