# T4 step 8 (Lane 3) — remaining order-entry families (TAL-00752 still-open rows)

## Cold-start context (read first)
- Repo: `full-talaria-log--main`. Two mirrored trees (I8, byte-identical): `chart v 1.4/chart/**` (canonical) + `homepage/public/chart/**`. Order-entry engine: `chart v 1.4/chart/modules/order-manager.js` and `order-entry-aggregates.mjs` (+ its property test). Host harness: `chart v 1.4/chart/multichart-prod/harness/` (`serve.mjs`, `scenarios.mjs`, `npm run gate`). Build/deploy is a server rebuild; local fast-loop via `dev:live` for engine logic.
- RC-5 = order-entry state model. T4 steps 1–7 already landed aggregates V2, SL/TP parse/render, order-type reclassify (D-005), live label, and a crash fix — each behind a `__TALARIA_*` switch.
- The T7-prep closure sweep (`worker-reports/T7-prep-orderentry-replay-closure-report.md`) dispositioned all 22 TAL-00752 rows: **9 closed, 2 needs-live-confirm, 11 still-open.** You are fixing the still-open rows. Read that report's "Still-open list" table for the per-row RC guess + one-line mechanism.

## Scope — the 11 still-open rows, grouped (do them family-by-family, RED-first)
Pick up families in this priority order. **Do NOT try all 11 at once** — land one family per report so each stays reviewable and independently revertible.

1. **Close / hit-target family — #10, #20, #22:** X-button close unreliable; multi-entry needs repeated X clicks; stacked entries get stuck when overlapped. (Hit-target/z-order + `entries[]` sync on close.)
2. **Parse/drag-input family — #8, #19:** lot arrow/spinner path bypasses the parse-defer helpers (transient zero); SL/TP arrow-drag seeds Y=0 instead of current entry/SL/TP price.
3. **Preview color family — #1, #13:** multi-order stop line paints red incorrectly when legs > 1; 1RR shown red incorrectly. (Single-order risk/color predicate used for multi-leg.)
4. **Remaining singles — #9 (split-entry preview Y), #11 (pending-limit SL constraint), #14 (cancel cleanup + price tracking), #15 (panel SL/TP controls not wired).**

## Per-family rules
- **Each family behind its own kill-switch** (`__TALARIA_DISABLE_*`, default ON = fix active), covering every file touched (I13).
- **RED-first:** add a host-harness scenario (or property test for pure logic) that reproduces the symptom and fails BEFORE the fix; then GREEN + determinism (`--runs=10`); then switch-OFF → RED again.
- Prefer moving logic into the pure `order-entry-aggregates.mjs` model where it belongs (RC-5), with property tests, over DOM patching.

## Guardrails
- I8: mirror every change byte-identically to `homepage/public/chart/**`; SHA256 both.
- I5 / I9: don't regress host `npm run gate` (15 known-failing tracked) — run it.
- Do NOT touch multichart parity files (`react-parity-*`, `MultichartGrid.jsx`, `TalariaV8bLive.jsx`) — those are Lane 1/2/4. Order-entry only.
- Security rule: no weakening gates/guards to make tests pass.

## Report — WORKER-REPORT-STANDARD.md (8 sections)
One report per family. Include: which rows the family discharges, switch name, RED→GREEN + determinism logs, switch-OFF RED, `npm run gate` result, SHA256 both trees, and which remaining rows are still open.
