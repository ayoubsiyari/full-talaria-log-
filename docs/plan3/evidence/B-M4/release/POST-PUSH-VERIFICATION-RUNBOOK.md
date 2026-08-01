# Post-push verification runbook — push and verify are one motion

**Owner:** Manager B (release)  
**Ship tip floor:** `CHART_BUILD_ID=20260728b82` under `CHECKPOINT_BUILD=1`  
**Never contact production for a dry run; use the surface that was just pushed.**

---

## 0. Before you push (30 seconds)

- [ ] Tip includes P6 nginx redirect (`P6-REMEDY-REDIRECT.md`)
- [ ] Tip includes A's P6 restore + P2/P3/P4 switches (or Director waiver)
- [ ] `node scripts/cache-stamp-coherence-gate.mjs` → **GREEN**
- [ ] `node --test scripts/tests/surf3-build-agreement.test.mjs` → pass (GATE-01 fixture still RED)
- [ ] Build params: `CHECKPOINT_BUILD=1` `CHART_BUILD_ID=20260728b82` (ahead of live)

---

## 1. Push / deploy

Deploy the checkpoint image. Record: **commit SHA**, **image digest**, **wall-clock UTC**, **`CHART_BUILD_ID`**.

---

## 2. Immediate verify (one block — do not split across sessions)

### 2a. Stamp census (every servable route)

```
node docs/plan3/evidence/B-M4/live-surface-probe/stamp-census.mjs \
  --base-url=<surface> \
  --current=20260728b82 \
  --out=docs/plan3/evidence/B-M4/live-surface-probe/observations
```

**Pass:** exit 0, `holeCount=0` against b82.  
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
**Fail exit 2:** inert `?v=` (unless `--waive-stamp-inert`), incoherent shells, or `CHART_ENGINE_BUILD` ≠ shell id.  
**Fail exit 1:** trade-loss guard marker ABSENT — **stop, do not tell the PO the push landed.**

#### What `stampInert: true` means (read this)

When dual `?v=` fetches return **byte-identical** bodies, the query string is a **cache key only** — it never selects module bytes. Consequences for canary:

1. A returning browser on a **stale HTML shell** (old `__TALARIA_CHART_BUILD_ID`, old script tag list) can keep omitting modules that only exist on newer shells (e.g. `indicator-performance.js`), while still loading current bytes for every module that shell already knew about.
2. Census / cold probe **PRESENT** describe the origin, not what a warm tab with a pinned shell or SW receives.
3. Waiving stampInert (`--waive-stamp-inert`) is allowed when markers and shell agreement are green **and** you have run **§2e SURF-3** plus a hard-reload / private-window badge check — it does **not** clear the warm-client hazard; it only acknowledges `?v=` is not a content selector.

### 2c. Edge-cache check

On every 200 from 2a/2b, record:

| Header | Expect |
|---|---|
| `cf-cache-status` | absent on test; on prod note HIT/MISS/EXPIRED |
| `age` | `0` or absent on first fetch after purge; HIT with high age = warm edge |
| `cache-control` | note `max-age`; if HIT serves pre-b82 body, **purge** that URL and re-fetch |

If Cloudflare is in front: purge `/chart/dist-v9/*`, `/chart/modules/order-manager.js`, `/chart/chart.js`, `/chart/multichart-prod/chart-embed.html`, then re-run 2a.

### 2d. PO build-badge confirmation (the one action)

Authenticated `/chart/index.html` (or unauth dist-v9):

1. Bottom-left badge reads **`build 20260728b82`**, or  
2. Console: `window.__TALARIA_CHART_BUILD_ID` → `'20260728b82'`

If the badge shows an older id: hard reload / private window / unregister SW, then re-check. If still old → deploy-gate / warm-client failure, not a product judgment.

### 2e. SURF-3 build-agreement (canonical entry URLs must agree)

Fetches every configured V9 shell URL, extracts `window.__TALARIA_CHART_BUILD_ID`, fails unless all stamps are present and identical. This is the gate that would have caught index=`b75` vs dist-v9=`b82` before the PO did.

```
# Live host (cookie required — /chart/index.html is auth-gated)
node scripts/surf3-build-agreement-gate.mjs \
  --base-url=<surface> \
  --cookie=<session> \
  --json

# GATE-01 instrument check (must stay RED forever on the sealed fixture)
node scripts/surf3-build-agreement-gate.mjs --fixture
```

**Pass (live):** exit 0, `status: GREEN`, `agreedBuildId` equals the ship stamp (e.g. `20260728b82`).  
**Fail:** any disagreement or missing BUILD_ID — **no-go**, even if census is green (census is cold; SURF-3 is the agreement claim).  
**Fixture:** exit 1 / RED is required (b75 vs b82 sealed). If the fixture goes GREEN, the gate is broken.

---

## 3. Kill-switch smoke (Tier-1 rollback ready)

In a signed-in console on the new build:

```js
window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1 = true  // guard OFF — only for incident
```

Confirm the flag is readable (`typeof window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1`). Leave **unset** for normal canary (guard ON).

Backend: `JOURNAL_SWEEP_PARSE_GUARD_ENABLED` unset or not in `{0,false,no,off}`.

**Phantom — do not pull:** `__TALARIA_DISABLE_M20_Q4_TRAIL_SL_PATH_CAP_V1` is **not implemented**. It exists only as a `killSwitchProposed` string in RED fixtures; trail-SL push sites in `order-manager.js` are ungated. Assigning it in the console during an incident will not cap or disable anything. See `KILL-SWITCH-INVENTORY.md` §1b.

---

## 4. Canary disclosure — memory (instrument correction)

**Do not quote absolute memory numbers from Task Manager “Memory” / footprint in canary disclosure.**

Measured correction (Director/PO instrument note): Task Manager footprint **over-reports** live JS heap by ~**2.9×** (example: ~231 MB heap vs ~670 MB footprint). Any figure taken from footprint is an **upper bound of unknown looseness**.

- Prefer Chrome Performance / heap snapshots / `performance.memory` (where available) for relative before/after — still label the instrument.
- The **TradeZella 3–5× memory claim is withdrawn** for disclosure purposes; do not repeat it as a ship metric.
- CPU / lag / functional gates stand; memory stays qualitative (“no runaway growth”) unless a heap-based protocol is named.

---

## 5. Go / no-go

| Check | Go |
|---|---|
| Stamp census holes vs b82 | 0 |
| Deploy-gate exit | 0 (stampInert waived only with §2e + badge) |
| `journalVouchedFor` | PRESENT |
| SURF-3 live | GREEN, agreedBuildId = ship stamp |
| SURF-3 `--fixture` | RED (GATE-01 holds) |
| design-live | REDIRECT to dist-v9 |
| PO badge | `20260728b82` |
| Edge | MISS/EXPIRED or purged; body sha matches tip |
| Canary disclosure | no absolute footprint MB; no TradeZella 3–5× memory claim |

Any row fail → **no-go**. Throw kill-switches if behaviour is wrong; redeploy only if bytes are wrong.
