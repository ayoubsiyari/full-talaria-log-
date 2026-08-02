> # ⛔ RETRACTED 2026-08-02 22:25 — DO NOT CITE
>
> **The conclusion below is withdrawn by A.** B established that the run measured a **mixed surface**: the
> served engine was 545,015 bytes, matching no committed state — 39 bytes above the 18:24 commit and 824
> below `c0c013b9c` (21:14) — while the bundle in the same run came from 21:14. One run, two trees, because
> the V9 build compiles the **working tree** rather than the commit.
>
> **What that kills:** the attribution. "`SHELL-PLAY-01` is in `b124` and the host behaviour is unchanged"
> is not supported, because the engine under that override was not `b124`. The phrase *fix bound to nothing*
> should not be applied to B's cut on this evidence.
>
> **What survives, stated narrowly:** the within-run contrast — instance `play()` inert across two attempts
> while `Object.getPrototypeOf(rs).play.call(rs)` started a live timer on the same object — was observed on
> one page in one run and is self-consistent as a description of *that* surface. It cannot be attributed to
> any commit. B separately diffed `play()` from its opening brace to `_shouldUseTickAnimation()` across both
> engines and found all 22 lines byte-identical, so the mixed surface **invalidates this artifact without
> explaining the defect**.
>
> **Ownership:** `SHELL-PLAY-01` stays open on **B's** board. It does not transfer back to A. A will not
> re-run the `step=1s` canary until a provenance-clean build exists — one where bundle and engine come from
> the same commit, past `1c69bebb4`.

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
