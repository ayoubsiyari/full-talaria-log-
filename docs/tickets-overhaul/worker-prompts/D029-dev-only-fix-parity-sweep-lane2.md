# Lane 2 — D-029: dev-only fix/clamp parity sweep (READ-ONLY)

**Origin:** D-029 rider 3. The R2 finding exposed that a dev surface (`chart-host.html`) carried a fix (`PRICE_AXIS_MIN_R=60` clamp) for a long time that **production never got** — dev testing validated behavior production doesn't have (cousin of the D-010 dev:live lesson). Inventory the blast radius.

## Task (no product code changes)
Read-only inventory of **dev-only fixes / clamps / guards / workarounds** that live on dev/harness surfaces but are absent from the production build path. Focus surfaces:
- `chart v 1.4/chart/multichart/chart-host.html` (known offender)
- other `*-host.html`, harness serve/embed scaffolding, `dist` vs source, any `dev`-gated or `chart-host`-only branch
- compare against production `chart-embed.html` / shipped `dist-v9`.

For each divergence found, record: what the dev-only fix does, the symptom it addresses, whether production has the bug, and a **port-or-discard disposition** (port to prod behind a kill-switch / discard as dev-scaffolding-only / already-covered).

## Deliverable
`docs/tickets-overhaul/worker-reports/D029-dev-only-parity-sweep-report.md`: a table of divergences with dispositions. Flag any that are latent production bugs (like R2 was) as candidate tickets/rows for the Manager. Read-only — no edits, no bless-path risk.
