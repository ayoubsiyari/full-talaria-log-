# T3 — panel-B chrome DOM-ready race FIX (Lane 1, D-024 authorized)

D-024 authorizes the fix your diagnostic proposed. Defect: parent chrome announces "gear/settings ready" **before** the DOM is committed + handlers bound, so a real dbl-click (H-R04) or Esc (H-R05) arriving in that gap no-ops (H-R04 1/10, H-R05 7/10 isolated on b10). Timing lie, not broken transport.

## Fix (scope fenced to readiness ordering ONLY)
- Emit the gear/settings **ready signal only AFTER DOM commit** (handlers bound) in `TalariaV8bLive.jsx`.
- Gate the manager selection handler so it doesn't act before ready.
- **Do NOT touch the settings-open transport** — it's proven; this is ordering only.
- Kill-switch: **`__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4`** (unset = fix ON). OFF must restore today's early-emit (broken) behavior for an honest A/B.
- Both trees (I8), file-scoped commit.

## Expose ready-signal as a wait primitive (D-024 — required)
The "chrome ready" event/state must be **observable** so the harness can await it instead of using tuned timeouts (deterministic assertion, future readiness regressions fail loudly). Expose a durable signal Lane 4 can poll/await (DOM attribute / event / state flag) and name it in the report + HARNESS-REFERENCE.

## Acceptance (discriminator from birth, D-024)
- `--only=H-R04 --runs=10` and `--only=H-R05 --runs=10` (fresh browser, `REACT_PARITY_ISOLATE_SESSION=1`) → **10/10 PASS** each.
- Switch-OFF (`__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4=true` / harness flag) → **10/10 FAIL-REAL-BUG** each — named discriminator.
- Do NOT mask with sleeps. If either row won't reach 10/10 with the fix, STOP + report (do not force).

## Handoff
After green: Lane 4 re-runs STEP 1 isolation (all 4 rows) using the new ready-signal wait → 3 consecutive clean `gate:react` → bless `20260716b10`. Name the commit + build for Lane 4/Lane 2.

## Guardrails
`TalariaV8bLive.jsx` + manager selection handler only; readiness ordering scope. No transport changes, no harness edits (Lane 4 owns). WORKER-REPORT-STANDARD.md.

## Report
`docs/tickets-overhaul/worker-reports/T3-panelB-chrome-dom-ready-FIX-report.md` — exact lines, switch, ready-signal name for harness, H-R04/H-R05 10/10 + switch-OFF A/B evidence, commit hash + SHA256.
