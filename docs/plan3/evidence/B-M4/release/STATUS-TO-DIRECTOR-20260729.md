# Manager B — status for Director · 2026-07-29

**From:** Manager B (`manager-b/plan3-20260727`)  
**Journal:** B-0153  
**Authority cited:** `RETRACTION-BAR-STORE-AND-SWEEP-ORDER-20260729-0350.md` §5

---

## One-line verdict

**Trade-loss hotfix is PO-authorised and ready to ship; execution is blocked only on production SSH to origin `51.20.190.169`. Nothing destroyed. Canary train not required for this hotfix.**

---

## 1. Production trade-loss hotfix

| | |
|---|---|
| Authority | PO: “yes for the trade loss” — ship scoped fix to `talaria-log.com`, independent of canary |
| Status | **AUTHORISED / ACCESS-BLOCKED** |
| Production surface (last probe) | `talaria-log.com` still on **`20260723b56`**; `journalVouchedFor` **ABSENT** |
| Test host (not the ship target) | Checkpoint **`20260728b82`** live; SURF-3 GREEN; dual-build closed |

**Non-negotiables accepted and held:**

1. Journal-before-execute — done (B-0153).
2. Restore point before any touch — queued; not yet taken (no access).
3. Scoped change only — no schema, no migrations, no cleanup/deletes of existing rows.
4. Same-session verify: `journalVouchedFor` **PRESENT** after deploy.
5. Destroy nothing — PO “sessions data is irrelevant” read as disruption tolerance, **not** delete permission.

**What ships when access lands (both files):**

| File | Role |
|---|---|
| `chart v 1.4/chart/api_server.py` | `JOURNAL_SWEEP_PARSE_GUARD` — refuse upsert+sweep on unparsed ids |
| `chart v 1.4/chart/modules/order-manager.js` | B-W16 + `journalVouchedFor` (verify marker is client-side; server-only cannot satisfy the gate) |

**Out of scope for this hotfix:** canary shell b82, indicator-performance script tags, SURF-3/SW warm-client train, any DB ops.

**Blocker (escalate):**

| Probe | Result |
|---|---|
| Origin | `51.20.190.169` (≠ test `31.97.192.82`) |
| `ssh -p 22 root@…` | Permission denied (publickey); password auth not offered |
| `ssh -p 443` | closed |
| Local keys / prod env | empty / absent (test-host pass only) |

**Ask of Director/PO:** production SSH key (or password+port that offers password auth) for the chart origin. B will not invent credentials or reuse the test-host password against production.

Packets: `PROD-TRADE-LOSS-HOTFIX-STANDING-BY.md`, `ESCALATE-PROD-SSH-ACCESS-20260729.md`.

---

## 2. Kill-switch readiness (A’s incoming)

Tracker: `KILL-SWITCH-READINESS-A-INCOMING-20260729.md`.  
Policy: verify FLAG-01 (ABSENT = ON) and FLAG-02 (flip without reload) **as each flag lands** — do not wait for the set.

| Flag | Status | FLAG-01 | FLAG-02 |
|---|---|---|---|
| `__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1` | Reserved only — not in product trees | — | — |
| `__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1` | HELD `da961151e` only (not on critical-path tip) | PASS (pre-merge) | PASS (pre-merge) |
| `__TALARIA_DISABLE_REALM_SAFE_BAR_STORE_V1` | Not landed (Shot 1) | — | — |
| `__TALARIA_DISABLE_BARSTORE_REALM_CLONE_V1` | Not landed (Shot 2) | — | — |
| `__TALARIA_DISABLE_MC_BARSTORE_PURGE_V1` | Not landed (Shot 3) | — | — |
| `__TALARIA_DISABLE_SHARED_BAR_STORE` (existing) | On tip; demoted as leak dominant | PASS | PASS |

Cadence will be re-verified on merge to product tip. Purge + bar-store shots verified on first land.

---

## 3. Canary runbook

`POST-PUSH-VERIFICATION-RUNBOOK.md` updated and current:

- Ship floor **b82**.
- **§2e SURF-3** as a required post-deploy step (live GREEN; fixture must stay RED).
- **stampInert** recorded: `?v=` never selects bytes — a stale shell can silently omit newly-added modules while cold gates stay green; that is how a **b75 shell with holes** shipped.
- **§4 disclosure:** no absolute Task Manager footprint MB; TradeZella **3–5× memory claim withdrawn**; footprint over-reports live JS heap ~**2.9×** (example only, not for disclosure quotes).

---

## 4. What is green / what is waiting

| Surface | State |
|---|---|
| Test host checkpoint b82 | GREEN (auth + dist-v9 agree; SURF-3 live GREEN; fixture RED holds) |
| Production trade-loss protection | **RED** — still b56; guard marker ABSENT; hotfix not deployed |
| Canary disclosure / runbook | Ready |
| A kill-switch set | Partial readiness; polling for landings |

---

## 5. Single ask

**Grant production SSH to `51.20.190.169`.**  
On receipt: restore point → scoped two-file ship → restart chart workers → same-session `journalVouchedFor` PRESENT on `https://talaria-log.com`. No canary train required for this step.
