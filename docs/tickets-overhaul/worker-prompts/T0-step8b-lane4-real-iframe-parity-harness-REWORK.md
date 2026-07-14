# T0 step 8b (Lane 4) — REWORK: parity harness must use REAL separate-window iframes

**Status of step 8:** BOUNCED (not accepted). Reason below. This is the rework.

## Why step 8 was bounced
- The harness boots **`dev:live`** (`?devMultichart=2v`, `USE_LOCAL_CHART=1`) — the **same-JS-context mount** that D-010 identified as *structurally incapable of representing the parent↔iframe boundary*.
- Proof it's unfaithful: **H-R12 (gear route) came back GREEN**, but that exact fix is **confirmed broken live on b11** (panel B still shows the old toolbar). A parity gate that greenlights a live-broken fix is invalid — it reproduces the blind spot instead of closing it.
- Also mislabeled **"DONE (proven)"** on dev-only evidence (violates the updated report standard §8 / D-010 ruling 4).
- The RED click-rows (1–3, 7, 9) are RED for the wrong reason too — the `dataLen=0` dev:live bar-load gap, not a faithful product signal.

## Hard requirement (D-010 ruling 5)
The harness MUST drive the **real production embed inside real `<iframe>` elements** — the way `MultichartGrid` actually embeds panels (`chart-embed.html` in separate browsing contexts) — so each panel has its **own `window`** and parent globals are genuinely NOT visible inside it.
- Use puppeteer's multi-frame API (`page.frames()` / `frame.evaluate`) to drive each real panel iframe.
- **Assert the build id INSIDE each panel iframe** (`frame.evaluate(() => window.__TALARIA_CHART_BUILD_ID)`), not just the host.
- Load **real bar data** into each tile (fix the `dataLen=0` gap) so click/hit-test rows are meaningful — or gate scenarios on a bar-load settle signal.

## THE ACCEPTANCE LITMUS FOR THE HARNESS ITSELF
On the **current pre-step-14 build**, **H-R12 (gear route) MUST reproduce RED** (old toolbar in panel B / gear inert across the real iframe). If your harness shows H-R12 GREEN, the harness is still unfaithful — do not submit. Once step 14 lands and is deployed, the same scenario flips GREEN. That RED-now/GREEN-after-step-14 transition is the proof the harness represents the boundary.

## Hardened exit (all mandatory, from D-010)
- Real `MultichartGrid`, real **separate-window iframes**, build-id assertion **inside each panel**.
- **One regression scenario per burned fix:** (i) iframe panel **gear→settings** route, (ii) multichart **settings-flash**, (iii) **marquee-in-panel** — each must be RED against a build known to have that bug and GREEN against the fixed build.
- Manager gate (`npm run gate`) stays green (I9); react gate is a separate section.
- Status labeled honestly per report standard: this is harness tooling, but any "GREEN proves the fix" claim must be against the real-iframe surface.

## DELIVER (`worker-reports/T0-step8b-real-iframe-parity-harness-report.md`)
How real iframes are driven (frame handles, per-panel build-id assert), the bar-load fix, the RED-now proof for H-R12 + the three burned-fix regression scenarios on the current build, and a clear statement that the surface is real iframes (not dev:live same-context). If faithful real-iframe automation proves infeasible in this stack, STOP and report the blocker (do not fall back to dev:live and label it green).
