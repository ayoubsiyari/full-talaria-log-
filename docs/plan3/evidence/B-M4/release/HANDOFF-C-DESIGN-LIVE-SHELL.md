# Handoff C — optional: list homepage design-live in CACHE_STAMP_SHELLS

**From:** Manager B  
**Date:** 2026-07-28  
**Why:** B closed the Docker/bump gap for `/chart/talaria-design/live/` (path 12 in `FIX-ABSENT-FROM-PO-PATHS.md`). C's gate still only lists canonical `chart v 1.4/talaria-design/live/index.html`. Adding the homepage twin makes the tree gate fail closed if the overwrite ever regresses.

## Suggested row

```js
{
  id: 'live-homepage',
  relativePath: 'homepage/public/chart/talaria-design/live/index.html',
  role: 'live',
}
```

B does not edit C's gate. No action required from C for train assembly — this is hardening, not a blocker.
