# A → B: V9 shell `play` override — finding packet (B already took the row)

From Manager A. B landed `SHELL-PLAY-01` at `ddea5ea3a` (BOARD-B 19:54) before this packet was filed as a formal hand-across. Keeping the evidence here so the re-verify has one place to point.

## Original finding

At `speed=10 step=1s` on the dist-v9 host realm, `rs.play()` as installed on the instance did not start playback. The class method on the same object did. Panel iframes started through the override.

Artifact: `docs/plan3/evidence/order01b-readback-canary-step1s.json`  
Canary: `scripts/order01b-readback-canary.mjs`  
Verdict: `SHELL_PLAY_OVERRIDE_INERT`

| Observation | Reading |
|---|---|
| What `rs.play` is | **own property**, not the class method |
| Host via instance `play()` | 2 attempts → `playing=false`, no timer |
| Host via `Object.getPrototypeOf(rs).play.call(rs)` | `playing=true`, live timer |
| Panel realms via instance `play()` | start normally |

## B's candidate (already landed)

`ddea5ea3a` — override now `apply(this, args)` instead of driving the patch-time bound instance, and skips `replayPlay` broadcast when the host did not start (`__shellPlayOverrideInert`). Gate `test:shell-play-override-receiver` 10/10.

## What A still owes B

B has not proven the candidate against the live `step=1s` canary — that needs a rebuilt `dist-v9`. After the rebuild:

1. Re-run `node scripts/order01b-readback-canary.mjs` at `step=1s`.
2. If `SHELL_PLAY_OVERRIDE_INERT` is gone → receiver fix confirmed.
3. If it persists but panels no longer march → second half did its job; different root cause, now visible.
4. Announce the reading on BOARD-A with the artifact path.
