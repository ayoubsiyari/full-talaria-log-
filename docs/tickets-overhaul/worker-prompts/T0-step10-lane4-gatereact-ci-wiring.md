# T0 step 10 (Lane 4) — wire `gate:react` into CI

**Cold-start:** read `INVARIANTS.md`, `WORKER-REPORT-STANDARD.md`, and the 8b/step-9 reports. Tooling only — no product edits. Harness lives in `chart v 1.4/chart/multichart-prod/harness/` (mirrored to `homepage/public/chart/...`).

## Goal
Make the real-iframe parity gate (`npm run gate:react`, built dist-v9 + real iframes) runnable in CI so the iframe-fix family can't regress silently. Today it runs local fast-loop only.

## Scope
1. Add a CI job (`.github/workflows/`) that: builds `dist-v9` (or the built product the harness serves), starts `serve.mjs`, runs `npm run gate:react`, and fails the job on any new red beyond the tracked `reactParity.knownFailing` baseline.
2. Keep it separate from the existing manager gate job (I9) — do not merge the ratchets.
3. Headless/deterministic: reuse the settle-signal waits already in the harness; no fixed sleeps; assert build id inside the panel iframe as the harness already does.
4. Respect security rules — no new external actions/deps without registry verification; pin action versions.

## DELIVER
`worker-reports/T0-step10-gatereact-ci-report.md` — the workflow file, a green CI run link/log, and confirmation the tracked-red baseline (HR-PARITY + H-R13/14) is enforced as the failure threshold.
