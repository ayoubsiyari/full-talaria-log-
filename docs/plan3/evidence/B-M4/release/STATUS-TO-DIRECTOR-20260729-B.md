# Manager B — status for Director · 2026-07-29 (follow-up) — SUPERSEDED

**SUPERSEDED by** `STATUS-TO-DIRECTOR-20260729-STANDDOWN.md` — production auth WITHDRAWN; canary = `31.97.192.82` only.

**From:** Manager B · Journal **B-0154**  
**Supersedes ask shape in** `STATUS-TO-DIRECTOR-20260729.md` (credential refusal still stands)

---

## One-line verdict

**SSH (or equivalent host shell) is genuinely required for production — no CI/registry path applies bytes to `51.20.190.169`. One-action hotfix script rehearsed end-to-end on the test host: `ONE_ACTION_OK`, `journalVouchedFor` PRESENT. Awaiting prod key only.**

---

## 1. Deploy-path enumeration (before the key)

| Path | Reaches prod origin? |
|---|---|
| `build-images.yml` → GHCR | **No** — push only; `CHECKPOINT_BUILD=0` CI artifacts |
| `scripts/deploy.sh` | Only if already executed **on** the VPS with a provenance manifest |
| GitHub deploy workflow / self-hosted runner to `51.20.190.169` | **None found** |
| Test-host SSH scripts | Wrong host (`31.97.192.82`) by design |

**Plain answer:** for the scoped two-file hotfix, **SSH is the only authorised route found.** Registry push alone cannot satisfy the PO verify. Evidence: `FINDING-PROD-DEPLOY-PATH-ENUMERATION-20260729.md`.

Credential discipline: no guess; no reuse of test-host password against production — recorded as correct.

---

## 2. One-action script + test rehearsal

Scripts:
- `trade-loss-hotfix-one-action.sh` — laptop driver (`TARGET=test|prod`)
- `trade-loss-hotfix-remote.sh` — host: restore → two-file ship → restart chart workers

**Test rehearsal (`TARGET=test`, host `31.97.192.82:443`):**

| Step | Result |
|---|---|
| Restore point | `/root/talaria-restore/trade-loss-hotfix-20260729T104701Z` (pre copies + image pins) |
| Ship | `api_server.py` + `order-manager.js` → chart, worker, homepage |
| Restart | `trading-chart` + `trading-chart-worker` |
| Same-session verify | **`journalVouchedFor` PRESENT** (2×); probe VERDICT PRESENT |
| Final line | **`ONE_ACTION_OK`** |

Destroy nothing: no schema, migration, or row cleanup.

**Prod invocation when key lands:**
```
TARGET=prod TALARIA_PROD_SSH_KEY=/path/to/key \
  ./docs/plan3/evidence/B-M4/release/trade-loss-hotfix-one-action.sh
```
(or `TALARIA_PROD_HOST_PASS` on a port that offers password auth — never the test pass)

---

## 3. Kill-switch readiness (landed now)

On `manager-a/critical-path` @ `3e75ed996`:

| Flag | FLAG-01 | FLAG-02 | Evidence |
|---|---|---|---|
| `__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1` | **PASS** | **PASS** | purge1 harness 11/11 (incl. round-trip without reload) |
| `__TALARIA_DISABLE_MC_GRID_STATE_PURGE_V1` | **PASS** | **PASS** | purge2 harness 10/10 (absent/true/false/undefined + delete) |

Detail: `KILL-SWITCH-FLAG-VERIFY-PURGE-20260729.md`.  
Expect next A flags on **chart.js data caches**; bar-store trio demoted — will not wait on them.

---

## 4. Runbook

Accepted as current. No changes.

---

## Single ask (narrowed)

**Production SSH key (or password+port) for `51.20.190.169`.**  
No alternative automated path found. Script is rehearsed; one command ships and verifies.
