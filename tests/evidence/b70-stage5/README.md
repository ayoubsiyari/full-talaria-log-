# B70 Stage 5 review tooling

This directory is repository-only test/evidence material and is not part of either deployed
`chart/modules` tree. The retained JSON is sanitized, non-accepting review evidence. In
particular, `real-iframe-local.json` is hermetic local evidence, not authenticated acceptance.

Run from the repository root:

```text
node tests/evidence/b70-stage5/b70-broad-paired-runs.mjs
node tests/evidence/b70-stage5/b70-broad-suite-compare.mjs
node tests/evidence/b70-stage5/b70-stage5-real-iframe-harness.mjs
node tests/evidence/b70-stage5/b70-indicator-generation-shadow.auth-harness.mjs
node tests/evidence/b70-stage5/b70-multichart-reload-red-probe.mjs
```

The favorites browser harness mirrored under both deploy trees is also review evidence only;
its presence and successful execution do not constitute release acceptance.
