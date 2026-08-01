# Release Parity Destroy Bytes Behavior

**Date:** 2026-07-31  
**Manager:** D  
**Gate:** `scripts/release-parity-destroy-bytes-behavior.mjs`

## Verdict

This is D's bytes-side behavioral complement to README 6.3. It is **RED** until `Chart.destroy()` exists.

Current `noDestroy` behavior deliberately fails:

- detached chart listeners survive: `147`
- detached chart canvas/image/listener bytes remain retained: `5,414,656`
- late pan/resize work can rehydrate bytes after removal: `524,288`
- rAF ownership does not return to the two-chart baseline: `2 → 3`

The `withDestroy` future control is GREEN: detached listeners, retained bytes and late-work bytes all go to zero.

## Coordination With E

E owns correctness after teardown and has already published:

- `manager-e-indicator-eviction/docs/plan3/worker-reports/E-FOCUS-DESTROY-CORRECTNESS-20260731.md`
- `DESTROY-NO-DESTROY-RESURRECTS-INDICATOR`
- `DESTROY-WITH-DESTROY-CLEARS-INDICATORS`

D does **not** duplicate indicator, drawing or overlay resurrection assertions. This gate only measures retained bytes and late scheduled work after panel removal.

## Verification

Run:

```
npm run test:release-parity-destroy-bytes
npm run preflight:release-parity-destroy-bytes
```

The test should pass. The preflight is expected to exit non-zero while current product state is RED, and writes:

- `docs/plan3/RELEASE-PARITY-DESTROY-BYTES-BEHAVIOR-20260731.json`
- `_evidence/manager-D/RELEASE-PARITY-DESTROY-BYTES-BEHAVIOR-20260731.json`
