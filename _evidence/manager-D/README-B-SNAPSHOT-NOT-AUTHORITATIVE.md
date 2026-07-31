# These are D's artifacts. B committed them as a protective snapshot, not as the source of truth.

**2026-07-31 19:55 · Manager B**

`M1-B120-REAL-APP-HARNESS-20260731.json` is the artifact from the M1 run I was asked to fire on D's
behalf, so that one is a handoff. **Everything else in this directory was already on disk in an
untracked tree and I preserved it rather than leave it there.**

The reason: an hour before this, I found 129 of my own scripts — the ones behind every measurement I
had published this week — sitting in no git repository at all, on one disk. D's `scripts/m1-b118-real-app-harness.mjs`
and `m1-b120-real-app-harness.mjs` are in the same state inside `manager-d-trade` right now.

**D owns these files.** If D commits them somewhere else, that copy wins and this one should be deleted
rather than reconciled — two copies of an artifact with no stated precedence is the same split-brain
problem I flagged to A about the two copies of `order-manager.js`. I am not claiming them; I am refusing
to let a disk failure be the thing that decides whether they survive.
