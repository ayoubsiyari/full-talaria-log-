# Post-push verification runbook — push and verify are one motion

**Owner:** Manager B (release)  
**Ship tip floor:** `CHART_BUILD_ID=20260728b81` under `CHECKPOINT_BUILD=1`  
**Never contact production for a dry run; use the surface that was just pushed.**

---

## 0. Before you push (30 seconds)

- [ ] Tip includes P6 nginx redirect (`P6-REMEDY-REDIRECT.md`)
- [ ] Tip includes A's P6 restore + P2/P3/P4 switches (or Director waiver)
- [ ] `node scripts/cache-stamp-coherence-gate.mjs` → **GREEN**
- [ ] Build params: `CHECKPOINT_BUILD=1` `CHART_BUILD_ID=20260728b81` (ahead of live)

---

## 1. Push / deploy

Deploy the checkpoint image. Record: **commit SHA**, **image digest**, **wall-clock UTC**, **`CHART_BUILD_ID`**.

---

## 2. Immediate verify (one block — do not split across sessions)

### 2a. Stamp census (every servable route)

```
node docs/plan3/evidence/B-M4/live-surface-probe/stamp-census.mjs \
  --base-url=<surface> \
  --current=20260728b81 \
  --out=docs/plan3/evidence/B-M4/live-surface-probe/observations
```

**Pass:** exit 0, `holeCount=0` against b81.  
**Fail:** any FIELD/TRAIN hole — especially design-live must be **REDIRECT**, not STAMPED_200.

### 2b. Deploy-gate (markers + inert ?v= + engine↔shell)

```
node docs/plan3/evidence/B-M4/live-surface-probe/live-surface-probe.mjs \
  --base-url=<surface> --deploy-gate \
  --cookie=<session> \
  --module=/chart/modules/order-manager.js \
  --marker=journalVouchedFor \
  --marker=_bW16HydrationGuardEnabled \
  --shell=/chart/index.html \
  --shell=/chart/dist-v9/index.html \
  --shell=/chart/multichart-prod/chart-embed.html \
  --shell=/chart/talaria-design/live/index.html \
  --out=docs/plan3/evidence/B-M4/live-surface-probe/observations
```

**Pass:** exit 0. Markers PRESENT. design-live may be REDIRECT (ignored for coherence).  
**Fail exit 2:** inert `?v=`, incoherent shells, or `CHART_ENGINE_BUILD` ≠ shell id.  
**Fail exit 1:** trade-loss guard marker ABSENT — **stop, do not tell the PO the push landed.**

### 2c. Edge-cache check

On every 200 from 2a/2b, record:

| Header | Expect |
|---|---|
| `cf-cache-status` | absent on test; on prod note HIT/MISS/EXPIRED |
| `age` | `0` or absent on first fetch after purge; HIT with high age = warm edge |
| `cache-control` | note `max-age`; if HIT serves pre-b81 body, **purge** that URL and re-fetch |

If Cloudflare is in front: purge `/chart/dist-v9/*`, `/chart/modules/order-manager.js`, `/chart/chart.js`, `/chart/multichart-prod/chart-embed.html`, then re-run 2a.

### 2d. PO build-badge confirmation (the one action)

Authenticated `/chart/index.html` (or unauth dist-v9):

1. Bottom-left badge reads **`build 20260728b81`**, or  
2. Console: `window.__TALARIA_CHART_BUILD_ID` → `'20260728b81'`

If the badge shows an older id: hard reload / private window / unregister SW, then re-check. If still old → deploy-gate failure, not a product judgment.

---

## 3. Kill-switch smoke (Tier-1 rollback ready)

In a signed-in console on the new build:

```js
window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1 = true  // guard OFF — only for incident
```

Confirm the flag is readable (`typeof window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1`). Leave **unset** for normal canary (guard ON).

Backend: `JOURNAL_SWEEP_PARSE_GUARD_ENABLED` unset or not in `{0,false,no,off}`.

---

## 4. Go / no-go

| Check | Go |
|---|---|
| Stamp census holes vs b81 | 0 |
| Deploy-gate exit | 0 |
| `journalVouchedFor` | PRESENT |
| design-live | REDIRECT to dist-v9 |
| PO badge | `20260728b81` |
| Edge | MISS/EXPIRED or purged; body sha matches tip |

Any row fail → **no-go**. Throw kill-switches if behaviour is wrong; redeploy only if bytes are wrong.
