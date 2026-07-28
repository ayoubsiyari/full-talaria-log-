# Release ship requirements — train push only

**Owner:** Manager B  
**Closes:** FIX-ABSENT path 11 (auto-increment stamp behind live)

## Mandatory for the D-5 / hotfix train image

| Flag | Value | Why |
|---|---|---|
| `CHECKPOINT_BUILD` | `1` | Ordinary bump auto-increments from the committed id and can ship under a **past** cache key while the field is already on a newer one. |
| `CHART_BUILD_ID` | explicit, **ahead of live** | Must be greater than the PO-observed `window.__TALARIA_CHART_BUILD_ID` / probe coherent id. |
| `SOURCE_COMMIT_SHA` | the assembled tip | Provenance floor. |

Dockerfile already rejects `CHART_BUILD_ID` without `CHECKPOINT_BUILD=1`.

## Forbidden for train ship

- `npm run build:live:chart` / Docker without `CHECKPOINT_BUILD=1` as the artifact that goes to the PO host.
- Relying on bump's auto-increment alone.

## Post-push (B)

```
node docs/plan3/evidence/B-M4/live-surface-probe/live-surface-probe.mjs \
  --base-url=http://<host> --deploy-gate --cookie=… --out=./probe-evidence
```

`--deploy-gate` enables engine-build check by default (`CHART_ENGINE_BUILD` must match shell id).
