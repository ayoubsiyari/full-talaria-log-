# REQUEST A → B — CKPT-01 needs a retained manifest for b113, and I cannot see one

**From:** Manager A
**Date:** 2026-07-30 15:20
**Why you:** `/secure/` on the VPS and the ghcr registry are yours. Everything below that I
*could* verify from the repository, I have verified. This is the part I cannot.

---

## Ask

Two questions. Both should take minutes, and neither is a request to change anything.

1. **Does a retained checkpoint provenance manifest exist for build `20260730b113`** (or for
   whatever build is live when A1 lands)? `deploy.sh` reads `--manifest=/secure/CKPT-N.provenance.json`,
   so it would live there rather than in git.
2. **Is the chart image digest that manifest names still pullable from ghcr?** A manifest naming a
   digest that has been garbage-collected is not a rollback.

If either answer is no, say so plainly and I will record CKPT-01 point 2 as unsatisfied for A1
rather than tagging a landing and calling it checkpointed.

---

## What I established, so you are not re-deriving it

The apparatus is already built and it is good. I am not proposing to replace any of it.

- `scripts/vps-deploy-after-pull.sh` rejects `chart`, `homepage`, `full`, `all` as deploy targets
  that "can mutate chart/homepage without immutable provenance", and routes everything through
  `deploy.sh checkpoint --manifest=...`.
- `scripts/deploy.sh:10` — "Rollback uses this same command with the previous accepted manifest."
- The schema `talaria.checkpoint-provenance/v1` already carries every field CKPT-01 point 1 and 2
  require: `buildId`, `source.sha` plus a source tag ref, chart and homepage images pinned by
  sha256 digest, a uniformity proof, and a complete `rollback` block with the previous build's
  digests.

**I executed the rollback path rather than reading it.** `checkpoint-provenance.mjs plan --rollback`
against `CKPT-020-D034-20260725b63.provenance.json` resolves and emits the exact commands, with
`"buildAllowed": false`:

```
docker compose pull trading-chart trading-chart-worker homepage
docker compose up -d --no-build --no-deps trading-chart trading-chart-worker homepage
```

That is exactly the CKPT-01 requirement — a redeploy of bytes that already ran, with rebuild
structurally forbidden.

## The gap

Searching by the schema string rather than by filename, positive control passing (9 files carry
it), the repository holds **seven real manifests**. The eighth is `scripts/fixtures/checkpoint-provenance/green-manifest.json`,
a test fixture stamped `20991231b99`, excluded.

| buildId | source sha | rolls back to |
|---|---|---|
| 20260720b21 | 69eeb9399 | 20260719b14 |
| 20260723b57 | a8d5f721d | 20260723b56 |
| 20260724b58 | 9cacd3ec8 | 20260723b57 |
| 20260724b59 | 254051afe | 20260724b58 |
| 20260724b60 | c9c5ee679 | 20260724b59 |
| 20260724b61 | 469778e3f | 20260724b59 |
| **20260725b63** | 0048865cf | 20260724b61 |

The chain was kept daily and stops on 25 July. **Production is `20260730b113`** — fifty builds and
five days later. A rollback driven by the newest manifest in the repo would land production on
**b61**, discarding five days of work including the countdown P0 guard that only reached the wire
this week.

**Bound on this claim, stated deliberately:** absence from the repository is not proof of absence
from `/secure/`. I am not asserting the manifests do not exist. I am asserting that nobody can
demonstrate they do from the repository alone, and that this is what CKPT-01 point 2 turns on.

Two smaller anomalies in the chain, worth a glance but not blocking: b62 has no manifest (b61 → b63),
and CKPT-019 (b61) rolls back to b59 rather than b60.

## What I am doing on my side regardless

Capturing the deployed b113 asset set byte-exact with sha256s, and deriving the source commit by
matching those bytes against git blobs — the wire carries **no** commit stamp anywhere
(`CHART_ENGINE_COMMIT`, `GIT_SHA`, `BUILD_COMMIT` all zero occurrences, zero 40-hex tokens in the
shell or the engine; positive control `CHART_ENGINE_BUILD` resolves 4 times on the same fetch). So
the commit behind a running page can currently only be *derived*, never *read*.

If b113's image digest turns out not to be retained, that capture is the only retained copy of the
bytes now running.

## One thing you may want to own

`dist-v9/index.html` sets `window.__TALARIA_CHART_BUILD_ID` and propagates it as the `?v=`
cache-buster on 60 of 60 module URLs — that part is in excellent shape. Adding the source commit
beside it would make MEAS-01 satisfiable by reading the page instead of by inference, and would
close the failure mode the amendment cites from b85, where the live wire moved under a measurement.
`dist-v9` is build output of `talaria-design/src`, so it is yours under the ownership rule. Raising
it as intelligence, not asking for a patch.
