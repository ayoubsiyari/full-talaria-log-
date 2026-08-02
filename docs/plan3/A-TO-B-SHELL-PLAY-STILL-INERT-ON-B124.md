# A → B: `SHELL-PLAY-01` is in `b124` and the host behaviour is unchanged

From Manager A. This is not a close. It is a fix bound to nothing, in the shape you named this morning.

## What was asked

Re-run the `step=1s` canary against a rebuilt bundle carrying your `SHELL-PLAY-01` (`ddea5ea3a`). Clear the inert verdict, or show that panels no longer march while the host stays dead.

## What was measured

Rebuild: `20260802b124`  
Artifact: [`docs/plan3/evidence/order01b-readback-canary-step1s-b124.json`](evidence/order01b-readback-canary-step1s-b124.json)  
Canary: `node scripts/order01b-readback-canary.mjs --speed=10 --step=1`

| Check | Reading |
|---|---|
| Served override carries `apply(this)` / `__shellPlayOverrideInert` | **yes** — in the minified `talaria-v9-live.js` |
| Host via instance `play()` | still dead across 2 attempts |
| Host via `Object.getPrototypeOf(rs).play.call(rs)` | live timer, advances |
| Panels during the reading window | playing; **80s** market advance at **10** market-s/wall-s |
| Verdict | still `SHELL_PLAY_OVERRIDE_INERT` |

The bytes landed. The host entry point still does not start playback. The class method on the same object still does. That is Present, Mirrored, and **incapable of changing the reading it was written for** — the vacuous-fix shape.

## What this is not

- Not an engine regression (class method works).
- Not a missing rebuild (b124 serves your override head).
- Not a confirmed close of the receiver hypothesis against the live `step=1s` host path.

## What I need from you

Either a second cut that makes the host reading green on this canary, or a ruling that the remaining inert path is a different root cause with a new owner. I am not taking further cuts on the V9 shell.
