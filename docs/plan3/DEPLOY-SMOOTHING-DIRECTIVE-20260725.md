# Deploy-smoothing directive — one command, same guarantees

Date: 2026-07-25, 20:15 · From: Director (PO-requested) · To: Manager · Priority: after the current lag-harness deliverable, before the next deploy-heavy phase

## Why

The checkpoint pipeline itself has been correct every time — every "stuck deploy" of the last
two days was ritual friction: a mangled multi-line paste, an absolute path where
`create-manifest` requires a relative one, an SSH drop mid-session, a stale marker. The
fail-closed guards rightly refused; the cost was the ~10 hand-typed steps around them,
where one typo restarts the ceremony. b67/b68 shipped clean, but only because the operator
has now memorized the traps. Institutionalize that knowledge as code.

## Deliverable: `scripts/ckpt-ship.sh` (one command end-to-end)

```
ckpt-ship.sh --checkpoint=CKPT-N --build-id=YYYYMMDDbN [--rollback-build-id=...]
```

runs, in order, stopping hard on first failure:

1. **Preconditions:** clean repo, HEAD pushed, annotated source tag exists (create it if
   asked), tmux session detected (refuse to run outside one on SSH).
2. **Build + push images** with the strict labels (skippable with `--no-build` when images
   already exist — the b66 lesson: never rebuild what's already proven).
3. **Uniformity proof** → write to the checkpoint dir with `--output`.
4. **`create-manifest`** — script derives every field itself: digests from
   `imagetools inspect`, proof sha256 computed, **proof path relativized automatically**
   (this single trap cost a full session), rollback fields read from the previous
   checkpoint's manifest by default.
5. **`validate-manifest` + `preflight`** — fail here means print the refusal and stop;
   never edit the manifest by hand.
6. **`deploy.sh --manifest=...`** with runtime proof, then print the final
   build-id + tripwire summary in one block for the checkpoint log.

Idempotent: re-running after a failure resumes at the failed step (each step checks its
artifact-plus-hash before redoing work). All parameters echo into a
`SHIP-LOG-<build-id>.txt` next to the manifest so every deploy is self-documenting.

## Rules preserved (quality is non-negotiable)

- **No guard is weakened or bypassed** — the script *feeds* the existing fail-closed chain,
  it never replaces it. Refusals still stop the world; the script just makes sure the
  inputs are well-formed so refusals only fire on real problems.
- Hand-editing manifests stays forbidden; `--force` overwrite stays manual-only.
- The script lives in the repo, reviewed like any other change, and is itself covered by a
  dry-run mode (`--plan`) that prints what it would do.

## Operating rules that go with it (already proven this week)

1. VPS work happens **inside tmux**, always. The script refuses to start otherwise.
2. **Never paste multi-line commands** — the script exists so there is nothing left to paste.
3. After any disconnect: `tmux attach`, re-run the same `ckpt-ship.sh` command — idempotent
   resume takes it from the last completed artifact.

## Acceptance

A full checkpoint deploy of a trivial change (e.g. a comment build) executed on the VPS as
ONE command from a cold shell, under 10 minutes, producing the same proof chain as b68's
manual run — plus one deliberately-injected failure (wrong digest) demonstrating the script
stops at preflight with the guard's refusal printed verbatim.
