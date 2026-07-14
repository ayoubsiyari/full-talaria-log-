# T0 step 14 (Lane 4) — BUILD the real cross-frame actuation harness (D-012)

## Authorization
D-012 (resolves ESC-011) authorizes this and gives you **exclusive ownership of `react-parity-lib.mjs`** and the react-parity harness scenario files for the duration. No other lane edits them. Implement from your own spec: `docs/tickets-overhaul/worker-reports/T0-step13-real-actuation-spec.md`.

## Cold-start context
- Repo: `full-talaria-log--main`. Harness: `chart v 1.4/chart/multichart-prod/harness/` — `react-parity-lib.mjs`, `react-parity-scenarios.mjs`, `react-run.mjs`, `serve.mjs`, `react-gate.mjs`, `known-failing.json`. Two mirrored trees (I8). Real built `dist-v9` in real iframes.
- Governing rule **I15 (new):** no test may assert a proxy for what the user sees. Every row must (a) actuate with **real input** and (b) assert the **real end-state**.

## Build
1. **Real cross-frame input:** replace synthetic dispatch with real mouse/keyboard at true coordinates delivered INTO the panel iframe (CDP `Input.dispatchMouseEvent`/`dispatchKeyEvent` via a `CDPSession`, or the frame's elementHandle). Remove every `selectDrawing`/`editDrawing`/`handleKeyDown`/synthetic-`dblclick`/`ctrlDragMarqueeInIframe` shortcut per your removal map.
2. **Real end-state assertions** per row (per your spec): settings = visible modal + `hasStyleSection` + message fired; selection/border = engine store selection state (not handle count / toolbarVisible); H-R07 = peer store deselected + parent bar state; Delete = drawing absent from store; Esc = selection cleared in store.
3. **Honest RED baseline:** run every row on the current built product with real actuation. Whatever genuinely fails, fails RED. Set `known-failing.json` to that HONEST set (you own it). This baseline is a deliverable — it is the true picture the Director asked for.
4. Keep the manager host `gate` (I9) untouched; this is the `gate:react` surface only.

## Guardrails
- I8: mirror all harness changes byte-identical to `homepage/public/chart/...`; SHA256.
- Do NOT touch product/React/engine code (Lane 1 owns fixes). If a row can't be actuated at all via real input, document why — do not fall back to synthetic to force green.
- I15: a row is "GREEN" only if real-actuated + real-asserted. No proxy greens.

## Report — WORKER-REPORT-STANDARD.md (8 sections; honor I15 in §4)
Deliverables: the real-actuation mechanism, the removal map applied, the per-row actuate/measure description, the **honest RED baseline** (`knownFailing` array + SHA256 both trees), and `gate:react` output. Explicitly name, per row, how it actuated and what it measured.
