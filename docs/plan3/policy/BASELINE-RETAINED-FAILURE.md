# Baseline-retained failure policy

`baseline-retained failure` is a Director-authorized, fail-closed promotion category. It records
that a narrowly identified failure is unchanged from the accepted baseline; it does not declare
the failure acceptable, GREEN, fixed, or outside the release gate.

An instance may activate only when all of the following are present for that exact instance:

1. baseline and candidate byte signatures are identical;
2. baseline and candidate assertion signatures are identical;
3. the proving test run is fresh and bound to the activation checkpoint by immutable evidence
   commit; the debt target checkpoint is tracked separately;
4. scope explicitly excludes D-030 money paths, I16 customer data, and security controls;
5. a named debt-board row states its accountable owner and target checkpoint; and
6. an identified Director explicitly signs the same exact scope and records approval time.

The validator rejects missing or changed signatures, stale or checkpoint-mismatched tests,
wildcards, `all`/`any` scope language, scope ambiguity, and self-authorization. Missing evidence
is denial; reviewers and lane owners cannot infer approval. Conditional rulings remain inactive
until Director identity and exact-scope evidence are recorded. Activation does not make the debt
GREEN or remove checkpoint-report obligations.

Every non-GREEN registry row must appear exactly once in every checkpoint report, with current
status, owner, and target checkpoint. Reporting continues through every checkpoint until the row
is GREEN. Reaching the target checkpoint does not silently expire, waive, or activate the row.

The machine-readable registry is `baseline-retained-failures.json`; validation and report rules
are in `baseline-retained-failure-policy.mjs`.
