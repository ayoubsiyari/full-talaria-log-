# FINDING — Production deploy-path enumeration (is SSH required?)

**From:** Manager B  
**When:** 2026-07-29  
**Status:** **FILED — KEEP.** Production Plan-3 work later WITHDRAWN; this enumeration remains a real finding.  
**Question:** Before asking for a production key, does an authorised path already exist to land bytes on origin `51.20.190.169`?

---

## Verdict

**SSH (or an equivalent interactive host shell on `51.20.190.169`) is genuinely required for the scoped trade-loss hotfix.**  
CI can **build and push images to GHCR**; nothing in-repo **pulls/recreates/hot-patches** the production origin. A registry push alone does not change what `talaria-log.com` serves.

Credential refusal (no guess / no test-host password reuse) remains correct.

**Plan 3 disposition (later same day):** `talaria-log.com` OUT OF SCOPE — no deploys, no credentials. Canary is `31.97.192.82`.

---

## What exists

| Path | What it does | Reaches `51.20.190.169`? |
|---|---|---|
| `.github/workflows/build-images.yml` | On `main` path push / `workflow_dispatch`: build+push `talaria-trading-chart`, `talaria-homepage`, `journal-backend` to **GHCR** with `CHECKPOINT_BUILD=0` (dev/CI artifacts, `:latest` + sha tags) | **No.** Push to registry only. Comment in workflow: deploy used to build on VPS; now VPS is supposed to `pull && up`. **No job SSHs to origin.** |
| `scripts/deploy.sh` | Immutable checkpoint deploy: preflights → `docker compose pull` digest-pinned images from a provenance manifest → `up -d --no-build` → runtime probe. Requires `DIRECT_ORIGIN` + `PUBLIC_ORIGIN`. | **Only if already run on the production host** (or a host that shares that compose project). Script is local docker-compose; it is **not** a remote deploy Action. |
| Provenance / checkpoint manifests | Pin `SOURCE_COMMIT_SHA`, `CHART_BUILD_ID`, image digests for `deploy.sh` | Artifacts for an operator who already has host shell |
| Test-host SSH scripts under `docs/plan3/evidence/B-M4/release/host-ssh-*.sh` | Password SSH to **`31.97.192.82:443`** only | **No** — wrong host by design |
| GitHub Environments / deploy workflows / self-hosted runners targeting prod | None found in `.github/workflows/*` | **No** |

Repo contains **no** production hostname/IP in deploy automation that would apply a change without a human (or agent) on the box. Prior B journal: production hostname was absent from the tree for edge verification; origin IP is known from ops knowledge (`talaria-log.com` → CF → `51.20.190.169`), not from a CI deploy target.

---

## Scoped hotfix vs full checkpoint

| Mode | Needs on origin | Notes |
|---|---|---|
| **Scoped two-file hotfix** (authorised) | Host shell: restore archive + `docker cp` `api_server.py` + `order-manager.js` + restart chart workers | **Cannot** travel via GHCR push alone; no image rebuild required |
| Full checkpoint (`deploy.sh` + strict manifest) | Host shell running `deploy.sh` after images exist in GHCR | Broader than authorised scope; still needs someone on the VPS |

Either way: **something must execute on `51.20.190.169`.** That something today is SSH (or console/out-of-band shell). No authorised no-credential path found.

---

## Ask (unchanged in kind, narrowed)

PO may provide production SSH (key preferred; or password+port that offers password auth).  
One-action script ready: `trade-loss-hotfix-one-action.sh` (rehearsed on test host when credential present).
