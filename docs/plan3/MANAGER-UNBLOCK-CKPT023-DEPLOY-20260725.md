# Manager unblock note — CKPT-023/b66 TEST deploy stall (2026-07-25, 17:50)

From: Director · Scope: the current VPS session only. Nothing here changes Rev 1.7 rulings.

## 0. First, one labeling requirement (quality gate, not a blocker)

This session deploys **b66 — the failed, not-promoted build**. That is fine **only** as the
instrumentation target for the §17.4 harness work (diagnosis runs on b63/b66 by directive).
Record in the checkpoint log that this deploy is **"diagnosis target, not a fix promotion"**,
and leave b65 pinned as rollback in the manifest (it already is, per the rollback fields).
If anyone intended this as a fix promotion: stop — that contradicts the CKPT-023 FAIL ruling.

## 1. What actually broke (two separate causes, both procedural)

1. **The `create-manifest` step never produced a file**, for two stacked reasons:
   - The command was a **mangled multi-line paste** (stray hash fragments concatenated into
     the command — visible in the terminal). It never executed as written.
   - Even executed cleanly, it would have been refused: the run passed `--proof="$PROOF"`
     with the **absolute** path `/opt/talaria-secure/...`. The validator requires
     `proof.uniformityReport` to be a **safe relative path** (relative to the manifest's
     directory). That is the exact error printed: *"proof.uniformityReport must be a safe
     relative path"*.
2. Every downstream step (`validate-manifest`, `deploy.sh` preflight) then failed with
   ENOENT on the missing manifest. **This is the fail-closed guard working correctly —
   do not bypass it, do not hand-write the manifest JSON.**
3. The SSH session then dropped (`client_loop: send disconnect`).

## 2. Repair sequence (on the VPS, after reconnect)

The uniformity proof already passed (all checks `ok: true`) — do NOT rebuild images.
Resume from manifest creation:

1. Reconnect and **start `tmux`** (see §3) before anything else.
2. Confirm the proof file exists and capture its hash:
   ```bash
   SECURE_DIR=/opt/talaria-secure/d034-b66-20260725b66
   ls -l "$SECURE_DIR"
   PROOF_SHA=$(sha256sum "$SECURE_DIR/CKPT-023-D034-20260725b66.uniformity.json" | awk '{print $1}')
   ```
   If the uniformity JSON is missing too, re-run only the `uniformity` command
   (cheap, no rebuild) with `--output` into `$SECURE_DIR`.
3. Re-run `create-manifest` with `--proof` as the **bare filename** (relative to the
   manifest, which lives in the same directory) — NOT the absolute path:
   ```bash
   --proof=CKPT-023-D034-20260725b66.uniformity.json
   --proof-sha256=$PROOF_SHA
   --output=$SECURE_DIR/CKPT-023-D034-20260725b66.provenance.json
   ```
   plus the checkpoint/build/source/image-digest/rollback fields already echoed earlier in
   the session (chart + homepage digests are printed in the terminal scrollback).
4. **Run commands from a script file, not a paste.** Write the full command into
   `/tmp/ckpt023-manifest.sh` first, `cat` it to eyeball it, then `bash` it. The mangled
   paste is what burned this session; long multi-flag commands must never be pasted
   interactively again.
5. Verify before deploying:
   ```bash
   node scripts/checkpoint-provenance.mjs validate-manifest --manifest=$SECURE_DIR/CKPT-023-D034-20260725b66.provenance.json
   node scripts/checkpoint-provenance.mjs preflight --manifest=... 
   ```
   Both must print ok before `deploy.sh --manifest=...` runs. If either refuses, read the
   refusal — the guard has been right every time today.

## 3. Session-resilience rules (adopt permanently for VPS work)

- **Always work inside `tmux`** (`tmux new -s ckpt023` / `tmux attach -t ckpt023`): the SSH
  drop mid-deploy is exactly what tmux makes harmless.
- Long commands: file-then-execute, never multi-line paste (see §2.4).
- After any disconnect: `tmux attach`, then re-verify the last completed step's artifact
  (file exists + hash) before continuing — never assume the step finished.

## 4. What NOT to do (quality guard)

- Do not weaken or bypass the provenance chain to "get unblocked" — no hand-edited
  manifests, no skipping preflight, no deploying images by digest directly. The chain just
  prevented an unverified deploy twice in one session; that is its job.
- Do not let this deploy consume the lane's focus: the deliverable of record remains the
  **§17.4 per-tick ledger harness** (RED reproduction of the host-only lag). This deploy
  only furnishes its target environment.
