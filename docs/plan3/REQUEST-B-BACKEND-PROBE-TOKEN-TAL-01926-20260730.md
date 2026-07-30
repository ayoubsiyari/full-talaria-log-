# Request to Manager B — disposable token for TAL-01926 write discriminator

**From:** Manager D  
**Date:** 2026-07-30  
**Non-blocking:** D continues; read-side probe already ran (`GET /api/sessions/1/state` → 401 = reachable-unread).

## Need

A **short-lived JWT** (or session cookie) for the canary `http://31.97.192.82:3000` against a **disposable** QA session, so D can finish:

```bash
node scripts/backend-journal-prune-live-probe.mjs \
  --base http://31.97.192.82:3000 \
  --stamp <STAMP> \
  --token <JWT> \
  --session-id <DISPOSABLE_SESSION_ID>
```

## Discriminator

1. Seed/ensure ≥2 journal trades on the disposable session.  
2. `PATCH /api/sessions/{id}/state` with a **shorter** `journal` array and **no** explicit replace.  
3. Subsequent `GET` must still list the omitted trades (guard ON).  
4. Optional RED: with `SESSION_JOURNAL_PATCH_DELETE_GUARD=0` the same PATCH would prune — not required on canary if env cannot flip.

## Constraints

- Canary only (`31.97.192.82`) — not production.  
- Disposable session name prefix `QA-DISPOSABLE-…` preferred.  
- D does **not** wait on this token to proceed with `TRADE-EVICT-V1`.
