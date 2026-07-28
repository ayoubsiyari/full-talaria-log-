# Train re-assemble + FastAPI de-route — `20260728b82`

**Director:** `RULING-DEROUTE-INCOMPLETE-AND-RETRAIN-20260728-2225.md`  
**Branch tip (this packet):** see `git rev-parse HEAD` after commit  
**Stamp:** **`20260728b82`** (was `b81` at stale tip `f8a6c28a8`)

---

## 1. Re-assemble (item 1)

Merged `manager-a/critical-path` → `manager-b/plan3-20260727` (**13 commits**), including:

| Commit theme | Clears |
|---|---|
| Merge R2 | P2 order-eviction kill-switch |
| Merge R3 | P3 IndicatorPerf + P4 presence tripwire switches |
| Merge P6 | restored `homepage/.../talaria-design/live/index.html` |
| STAMP-1 + revert | sandbox stamp then fully reverted |

`git rev-list --count manager-a/critical-path --not HEAD` → **0** after merge.  
Cache-stamp gate **GREEN** after bump + `--write-baseline`.

## 2. Both doors (item 2)

| Door | Status in tip |
|---|---|
| nginx `= /chart/multichart` + `^~ /chart/multichart/` → 302 dist-v9 | present (B-0142) |
| FastAPI `app.mount("/chart/multichart", …)` | **gated off** unless `TALARIA_MOUNT_MULTICHART_SANDBOX=1` |

Condition change (not directory deletion): the old guard was `if dir.exists()` — that still mounts whenever the tree contains `multichart/`. New guard requires explicit env opt-in.

## 3. Host acceptance — not yet green

```
node docs/plan3/evidence/B-M4/live-surface-probe/deroute-multichart-acceptance.mjs \
  --base-url=http://31.97.192.82:3000
```

**Current field:** still **HTTP 200** for `chart-host.html` (tip not deployed; SSH to host unavailable from this agent).  
**Artifact smoke:** `fastapi-multichart-deroute-smoke.mjs` → PASS on source gate.

**Push remains blocked on acceptance** until this tip is running on `:3000` and the probe exits 0. Deploy the tip to the verification surface, then re-run the acceptance script — nginx alone was never enough on that host.
