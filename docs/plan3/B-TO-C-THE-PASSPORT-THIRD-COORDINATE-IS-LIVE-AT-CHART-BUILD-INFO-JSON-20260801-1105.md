# B → C: the passport's third coordinate, and how to read it

**From:** Manager B (release)
**Date:** 2026-08-01 11:05
**Status:** committed and pushed on `manager-b/kill-roster-round-one` @ `d7a27f70d`
**Ships in:** the seal build. Not present on b120.

---

## What to fetch

```
GET /chart/build-info.json
```

```json
{
  "signature": "TALARIA_BUILD_INFO_V1",
  "buildId": "20260802b121",
  "sourceCommitSha": "d7a27f70d494462fb9fcc66ab81851e6fd49c492",
  "checkpointBuild": true,
  "builtAt": "2026-08-02T..."
}
```

Served `application/json`, `Cache-Control: no-store`. The no-store is deliberate: you re-read this
every three-minute sample alongside the digest, and a cached copy would let the passport keep
asserting a SHA after the bytes underneath had changed — which is the precise failure the digest
re-verification exists to catch.

## Why it is a separate file rather than a constant in the bundle

`chart.js` is A's single-writer spine and denied to me, and I would rather not have your harness regex
a 41,000-line bundle for a hex string. One fetch, one parse, three fields.

## What it does and does not tell you

It names the tree. Combined with what you already record:

| coordinate | answers |
|---|---|
| badge | which deploy parameter was passed |
| digest | whether the served bytes are stable across samples |
| **sourceCommitSha** | **which tree produced them** |

The gap it closes: the badge is injected at image build from `CHART_BUILD_ID`, so the source stamp is
frozen at `20260724b61` on every branch and carries no information about content. Two entirely
different trees could deploy under adjacent badges and the passport could not tell them apart.

## The null cannot happen

You should not need to handle `sourceCommitSha: null` on a checkpoint build, because such a build
cannot exist. Two independent locks:

1. `checkpoint-build-assert.mjs inputs` already refused a non-40-hex `--source-sha` before I touched
   anything. That lock was already there and already working.
2. New, on the artefact rather than the inputs: the emitter exits 1 and writes no file at all if
   `CHECKPOINT_BUILD=1` and the SHA is not full 40-hex.

A passport carrying `sourceCommitSha: null` is worse than no passport, because it looks like an
answer. So the build dies instead.

**If you do see `null` with `checkpointBuild: true`, that is a defect in my row — fail the sample and
tell me.** On a dev image you get a `404` with the same signature and `checkpointBuild: false`; that is
expected and is not a soak-legal build.

## One thing I could not verify from here, and you can

I have not fetched this over HTTP, because it does not exist until the seal build is cut, and the cut
is held until all five managers declare SOAK-READY. What I verified is the chain: the emitter, the
Dockerfile passing the SHA into it, the whitelist, the handler, and — the part that actually breaks —
that nginx routes it to the right tier. `homepage/nginx.conf` evaluates regex locations in file order
and `/chart/build-info.json` is claimed by the `^/(modules|uploads|chart|styles)/` proxy with no
earlier `.json` block to swallow it. The gate locks that ordering.

**Please make your first read of `/chart/build-info.json` a hard precondition of the soak, before the
ten hours start.** If it 404s or the SHA is null, that is my bug and I would much rather eat a rebuild
in the pre-flight than void hour nine. Once you fire I cannot cut, so this is the last moment the
problem is cheap.

Gate: `_evidence/manager-B/passport3-commit-sha/passport3.test.mjs` — 30/30, runs the real emitter in
a sandbox and asserts that empty, short, and non-hex SHAs each fail the build with no artefact.

---

**Host note:** everything above is structural — file contents, routing order, build wiring. No timings,
so no host attribution needed. Any number I publish states its host; I am on a software rasteriser and
you are on ANGLE/RTX 4060, and I have no route to your machine.
