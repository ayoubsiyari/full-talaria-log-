# HANDOFF C — pinned immutable canary images (2026-07-29)

Live floor stays **`20260729b94`** (product pack + PURGE-2 persist self-heal). Do not leave a historical bringup online after grading.

## Why this exists

C correctly refuses to grade a run it cannot pin. Ships used to overwrite `:latest` only; when the canary moved to b88+, b85/b86 digests were gone. Pins are now:

| Artifact | Path / name |
|---|---|
| Image tags | `talaria-homepage:canary-<BUILD_ID>` + `talaria-trading-chart:canary-<BUILD_ID>` |
| Pin file | `/root/talaria-restore/PINNED-<BUILD_ID>.txt` |
| Tar backup | `/root/talaria-restore/images/canary-<BUILD_ID>.tar.gz` |

Future ships (`canary-checkpoint-one-action.sh`) tag + `docker save` after every checkpoint build.

## Inventory (after B recovery)

| Build | Tags | Tar | Status |
|---|---|---|---|
| **20260729b94** | YES | YES | **LIVE floor** (persist self-heal) |
| **20260729b93** | YES | YES | PURGE-2 reprime |
| **20260729b92** | YES | YES | lag + FIX1-VISIBILITY |
| **20260729b91** | YES | YES | orphans + D pack |
| **20260729b90** | YES | YES | FIX1 default-off era |
| **20260729b86** | YES (rebuild) | YES | re-measure OK |
| **20260729b85** | YES (rebuild) | YES | re-measure OK |
| 20260729b83–b84, b87–b89 | NO | NO | blobs lost; rebuild on request |

Rebuild notes: image digests differ from the original ship (timestamps). Stamp string `__TALARIA_CHART_BUILD_ID` and tip SHA match the ship. Grade by **build id**, not by original digest.

## Bring up a historical pin (grades b85 / b86)

```bash
# From manager-b worktree (WSL), with TALARIA_TEST_HOST_PASS(_B64):
CHART_BUILD_ID=20260729b85 bash docs/plan3/evidence/B-M4/release/canary-bringup-pinned.sh
# or
CHART_BUILD_ID=20260729b86 bash docs/plan3/evidence/B-M4/release/canary-bringup-pinned.sh
```

Verify shell:

```text
window.__TALARIA_CHART_BUILD_ID='20260729b85'   # or b86
```

Base URL unchanged: `http://31.97.192.82:3000`

If tags were lost but tar remains:

```bash
ssh -p 443 root@31.97.192.82 \
  'gunzip -c /root/talaria-restore/images/canary-20260729b85.tar.gz | docker load'
# then bringup-pinned as above
```

## Restore live floor after grading

```bash
CHART_BUILD_ID=20260729b94 bash docs/plan3/evidence/B-M4/release/canary-bringup-pinned.sh
```

Confirm live stamp is `20260729b94` before walking away.

## Do not

- `docker image prune -a` on the canary host (named tags + tars are the pin).
- Touch `talaria-log.com` / prod.
- Label a heap run with a stamp you did not bring up and verify in the shell.

## Auth / session for heap census

See `HANDOFF-C-HEAP-CENSUS-LIVE-CANARY-20260729.md` (session cookie protocol). Re-auth if jar expired; pin bringup does not refresh cookies.
