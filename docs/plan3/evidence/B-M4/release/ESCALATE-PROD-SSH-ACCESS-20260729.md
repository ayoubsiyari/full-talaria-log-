# CLOSED — Production SSH escalation

**Status:** **CLOSED** — 2026-07-29  
**From:** Manager B  
**Ruling:** Director / PO stand-down — production authorisation **WITHDRAWN**.

---

## Close reason

- Canary surface for Plan 3 is **`31.97.192.82`** (the host B has been deploying to).
- **`talaria-log.com` / origin `51.20.190.169` are OUT OF SCOPE** for Plan 3 — no deploys, no hotfixes, no credentials.
- Trade-loss on production causes no Plan-3 harm: user backtest data there is disposable and users are informed. Director misread “sessions data is irrelevant” as disruption tolerance; PO meant the data has no value.
- B’s credential refusal (no guess / no test-host password reuse) was **correct** and remains standing discipline.

**Request and accept no production credential.**

---

## What remains filed (not wasted)

| Artefact | Disposition |
|---|---|
| `FINDING-PROD-DEPLOY-PATH-ENUMERATION-20260729.md` | **Keep** — real finding (GHCR-only CI; `deploy.sh` assumes host shell; nothing targets origin) |
| One-action script (rehearsed green) | **Retargeted** → canary deploy mechanism for `31.97.192.82` (`canary-deploy-one-action.sh`) |
| Production hotfix packet | **WITHDRAWN** — see `PROD-TRADE-LOSS-HOTFIX-STANDING-BY.md` |

Trade-loss fix needs **no further deployment work**: `journalVouchedFor` PRESENT on canary since b82 same-session verify (~00:07Z / rehearsal confirmations).
