# Multichart Invariants — include verbatim in EVERY worker prompt

These rules are absolute. A change that violates any of them is wrong even if it "fixes"
the reported bug. If a task appears to require breaking one, STOP and report back.

## I1 — Single data owner
For a given `fileId` in a session, exactly ONE chart instance may call network fetch
functions (`_fetchCandlesCursor`, `_fetchSmartWindow`, `_fetchBarsWindow`,
`_refetchBacktestTimeframeCore`, direct `fetch('/api/file/...')`). The owner is the host
chart when it displays that file; otherwise the panel that first loaded it. All other
instances obtain bars ONLY by contiguous copy from the owner. Never add a new fetch call
site in panel-reachable code.

## I2 — Contiguity (the seam rule)
A bar array (`rawData`, `data`, `replaySystem.fullRawData`, `_panelFullRawData`) may only
grow from its exact loaded edge: prepend bars strictly older than the current first bar
that are ADJACENT to it (from the same continuous window), or append strictly newer bars
adjacent to the last bar. NEVER merge a cached/stored window that is not verified
contiguous with the current array — a gap in the middle corrupts `_serverCursors` and
causes infinite refetch loops. (This exact bug was introduced and reverted on 2026-07-04;
do not repeat it.) After any merge, `_serverCursors.firstTs/lastTs` must equal the actual
array edges.

## I3 — One channel per message
A bridge message either mutates VIEWPORT state (offsetX, candleWidth, visible range) or
DATA state (bar arrays, cursors) — never both in the same handler path. Data updates are
notifications from the owner; viewport updates are sync from the interaction leader.

## I4 — Both engine copies, byte-identical
Every edit to `chart v 1.4/chart/chart.js`, `chart v 1.4/chart/modules/*`, or
`chart v 1.4/chart/multichart-prod/*` must be mirrored to the same path under
`homepage/public/chart/`. Prove it with matching file hashes in the report.

## I5 — One behavioral change per task
Ship exactly the change the task describes. No drive-by refactors, no "while I'm here"
fixes, no renamed variables outside scope. If you notice an unrelated bug, report it —
do not fix it.

## I6 — Security is not a fix
Never remove or weaken: `engine-api-guards.js` field allowlist, JWT/auth checks, rate
limits, redirect URL checks, CORS/CSRF middleware, webhook signature verification. If a
guard blocks your fix, the fix is wrong.

## I7 — Single-chart behavior is frozen
All multichart changes must be gated behind multichart detection
(`_isMultichartEmbedPanel()`, `_isMultichartHostPanel()`, or an explicit new flag) so a
plain single chart executes byte-identical logic. Phase-0 single-chart diagnostics must
show zero delta before/after your change.

## I8 — Kill-switch everything
Every new behavior must be disableable at runtime without redeploy via a window flag
(pattern: `window.__TALARIA_MC_DISABLE_<NAME> = true` reverts to the old path). Name the
flag in your report. Follow the existing example: `__TALARIA_DISABLE_SHARED_BAR_STORE`.

## I9 — Verify, then report facts
Run `node --check` on every touched JS file. Run the Phase-0 diagnostic scenarios listed
in your task and paste the numbers. Report what you observed, not what you expect.
If you could not verify something, say so explicitly.

## I10 — Locate code by name, not by line
Line numbers in docs drift after every commit. Find functions with search
(`checkViewportLoadMore`, `applyVisibleRange`, ...). If a named function does not exist,
STOP and report — do not guess a similar-looking one.
