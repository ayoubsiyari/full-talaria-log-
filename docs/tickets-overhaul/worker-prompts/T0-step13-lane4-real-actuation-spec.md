# T0 step 13 (Lane 4) — real cross-frame actuation harness: implementation SPEC — READ-ONLY

## Why (and why a spec, not the build yet)
Your step 12 audit proved the multichart harness has no trustworthy interaction coverage — synthetic in-iframe dispatch + `selectDrawing`/`editDrawing` fallbacks + proxy assertions. The real rebuild is coming, but two things gate the actual code edit: (1) a Director ruling on ESC-011, and (2) `react-parity-lib.mjs` is currently held by Worker 1 for the P0 settings-open fix (no simultaneous edits — that's what caused the mess). So produce the **turnkey implementation spec now**; you'll implement it fast once both clear.

## Cold-start context
- Harness: `chart v 1.4/chart/multichart-prod/harness/` — `react-parity-lib.mjs`, `react-parity-scenarios.mjs`, `react-run.mjs`, `serve.mjs`, `react-gate.mjs`. Puppeteer drives real built `dist-v9` in real iframes. Two mirrored trees (I8).
- Your audit report: `docs/tickets-overhaul/worker-reports/T0-step12-harness-honesty-audit-report.md`.

## Deliverable — `docs/tickets-overhaul/worker-reports/T0-step13-real-actuation-spec.md`
A precise, implementable spec covering:
1. **Cross-frame real input:** the exact mechanism to deliver REAL mouse/keyboard into a panel iframe at true screen coordinates (e.g. CDP `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` via `page._client()` / `CDPSession`, or Puppeteer elementHandle in the frame). Include how to resolve a drawing's on-screen coords **inside the iframe** and translate to page coords for the dispatch. State the fallback if CDP coords can't hit the iframe.
2. **Removal map:** every synthetic helper / fallback to delete or replace, by file:line — `dispatchEvent` dblclick, `handleKeyDown`, `ctrlDragMarqueeInIframe`, `selectDrawing`/`editDrawing` fallbacks — and the real-input replacement for each.
3. **Real-state assertion definitions** per row (replace proxies):
   - Settings open = postMessage `multichart-open-drawing-settings` fired AND visible settings modal AND `hasStyleSection` (your honest probe).
   - Selection/border = actual selected-drawing state in the engine store (not resize-handle count, not `toolbarVisible`).
   - H-R07 peer isolation = deselected in the peer panel's **store** + parent V9 bar state, not `!toolbarVisible`.
   - Delete = drawing actually absent from the store/render; Esc = selection cleared in store + chrome gone.
4. **Per-row acceptance table:** for H-R01–H-R14 (+ the HIGH-risk H-S rows), the real actuation + real assertion each will use, and the expected verdict on b88 (so we know which are true-red vs were false-green).
5. **Migration plan:** order to convert rows, and how to run old+new side by side to avoid a big-bang.

## Guardrails
- READ-ONLY. **Do NOT edit `react-parity-lib.mjs`** (Worker 1 has it) or any harness/product file. Spec only.
- Do not change `known-failing.json` (you own it, but no edits in this step).

## Report
The spec above. Use `WORKER-REPORT-STANDARD.md`; sections 2 + 3 = "N/A — spec".
