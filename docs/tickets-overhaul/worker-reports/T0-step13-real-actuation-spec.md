# T0 step 13 — real cross-frame actuation harness: implementation SPEC

## 1. Task + RC

**Task:** Turnkey implementation spec for rebuilding react-parity (and selected manager) harness interaction paths with **real** cross-frame mouse/keyboard actuation and **real** state assertions — per ESC-011 / step-12 audit.

**RC:** Tooling/diagnostic — no RC. **Collision block cleared:** `react-parity-lib.mjs` released by Worker 1 (T1 step 18). Lane 4 may implement once Director ruling is recorded.

---

## 2. What I changed — file by file

**N/A — spec only.** No harness/product edits in this step. Baseline update (`known-failing.json`) is separate (step 13 baseline note).

---

## 3. Kill-switch (I3 + I13)

Specs must preserve existing kill-switch probes (`REACT_PARITY_GEAR_FIX_OFF`, etc.). Real actuation tests run default ON first; switch-OFF rows prove I13 revert on the **same** honest assertions.

---

## 4. Proof — RED → GREEN

**N/A — spec.** Expected verdicts on current build **`20260712b100`** in §5 below.

---

## 5. Invariants checked

| Inv | Spec requirement |
|-----|------------------|
| **I14** | All panel-B input must enter the iframe at true page coordinates; no in-iframe-only `dispatchEvent` for user gestures. |
| **D-010** | Built `dist-v9`, build id inside panel iframe at boot. |
| **I13** | Switch-OFF must RED on the same real assertions that GREEN on switch-ON. |

---

## 6. What I did NOT do / limits

- Implementation deferred pending Director sign-off on ESC-011 sequencing (harness-first approved in MANAGER-ESCALATIONS; formal ruling assumed).
- H-R12/H-R13 panel-B paths still RED in Lane 4 gate on b97/b100 despite Worker 1 step-18 report — spec does not assume those are green until re-proven with real actuation.

---

## 7. Live-verification handoff

After implementation: PO live-confirm on deployed build id for settings/gear/Esc/Delete/marquee rows that move from tracked-red to gate-green.

---

## 8. Status

**DIAGNOSTIC-ONLY (spec complete, implementation ready)** — collision block cleared; proceed to code when directed.

---

## 1. Cross-frame real input mechanism

### Primary: Puppeteer page mouse/keyboard at iframe-translated page coordinates

**Already partially used** (`singleClickDrawing` host + panel-B, `clickV9QuickBarGear`, `dragCellRight` in manager harness). Extend as the **only** path for user gestures.

**Coordinate pipeline** (new helper `iframePagePoint(page, panelId, localX, localY)`):

1. In iframe `frame.evaluate`: get element point in **iframe viewport** coords (e.g. drawing hit from SVG `getBoundingClientRect` + line midpoint).
2. On parent `page.evaluate`: get iframe element `getBoundingClientRect()` for `panelId` (`reactFrameRectForPanel` / `frameRectForPanel` — already exists).
3. **Page point:** `{ x: frameRect.left + localX, y: frameRect.top + localY }` (account for device pixel ratio if needed; Puppeteer uses CSS pixels).
4. Actuate on **parent** `page`:
   - `page.mouse.move(x, y)` → `page.mouse.down()` → `page.mouse.up()` / `click({ clickCount: 2 })`
   - `page.keyboard.down('Control')` before click/drag; `up()` in `finally`

**Why parent page:** Puppeteer mouse events hit the iframe as a real target; the browser routes into the embedded document — matches user input.

### Secondary: CDP `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`

Use when Puppeteer mouse misses (known gap: some iframe captures need explicit CDP):

```javascript
async function dispatchMouseInFrame(page, panelId, type, x, y, opts = {}) {
  const frame = chartTarget(page, panelId);
  const session = await frame.createCDPSession();
  await session.send('Input.dispatchMouseEvent', {
    type, // 'mousePressed' | 'mouseReleased' | 'mouseMoved'
    x, y,
    button: 'left',
    clickCount: opts.clickCount ?? 1,
    modifiers: opts.ctrlKey ? 2 : 0, // Ctrl = 2
  });
}
```

**Coords for CDP:** must be relative to the **iframe content viewport** (use local coords from step 1, not page coords). Attach session to `frame` (Puppeteer `Frame.createCDPSession()`), not parent page.

### Fallback policy

- **No** `selectDrawing` / `editDrawing` / `handleKeyDown` fallbacks after real input attempt.
- If real input fails after 2 retries with adjusted hit point (±3px), scenario **FAIL** with logged coords — do not synthesize success.

---

## 2. Removal map (synthetic → real)

| Location | Remove / replace | Real replacement |
|----------|------------------|------------------|
| `react-parity-lib.mjs:567-577` | `selectDrawing` fallback after click | Delete block; rely on `page.mouse.click` only |
| `react-parity-lib.mjs:585-646` | iframe `dispatchEvent` dblclick + `editDrawing` fallback | `page.mouse.click(pagePt, { clickCount: 2 })` at translated coords (same as host path `:667-674`) |
| `react-parity-lib.mjs:688-771` | `ctrlDragMarqueeInIframe` synthetic canvas events | Parent `page.keyboard.down('Control')` + `page.mouse` drag at translated canvas corners (`ctrlDragMarquee` host path `:779-797`) |
| `react-parity-lib.mjs:802-826` | `pressEscapeReact` iframe `handleKeyDown` + `document.dispatchEvent` | `page.keyboard.press('Escape')` only; optional CDP `Input.dispatchKeyEvent` on focused frame |
| `react-parity-lib.mjs:836-860` | `deleteSelectedViaKeyboard` synthetic `handleKeyDown` | `page.keyboard.press('Delete')` after focus panel via real click |
| `react-parity-scenarios.mjs:350-355` | H-R12 `dm.selectDrawing` setup | `singleClickDrawing(page, 'B', placed.id)` + `waitForReactSelection` |
| `interactive-helpers.mjs:207-217` | `pressEscape` `window.dispatchEvent` | `page.keyboard.press('Escape')` with panel focus |
| `interactive-helpers.mjs:185-204` | `openSettings` → `dm.editDrawing` | Keep for H-S33 API path only; **not** for react-parity rows |
| `react-parity-scenarios.mjs:149-150` | H-R04 probe `dbl.ok` only | Require `waitForParentDrawingSettingsOpen` or message probe |

---

## 3. Real-state assertion definitions

| Concept | Real assertion (all three where applicable) |
|---------|---------------------------------------------|
| **Settings open** | `readParentSettingsProbe().open` OR `multichart-open-drawing-settings` message **AND** `waitForParentDrawingSettingsOpen`: `hasStyleSection && !quickBarShellOnly` |
| **Settings closed** | `!probe.open && !hasStyleSection` after Esc |
| **Selected** | `isDrawingSelected(page, panelId, id)` reading `dm.selectedDrawings` / `d.selected` — not handle-count alone |
| **Blue border** | `isDrawingSelected` + optional stroke computed-style sample (future); interim: handles **only if** `d.selected` true |
| **Quick menu** | Parent `#v9-tl-bar` or `#tl-sett` visible with `getBoundingClientRect().width > 0` — not `dm.toolbar.visible` alone |
| **H-R07 peer isolation** | `!isDrawingSelected(host)` AND `isDrawingSelected(panelB)` AND parent V9 bar not showing host drawing id |
| **Delete** | `!drawingExists(page, panelId, id)` + ghost checks |
| **Marquee** | `readCtrlMarqueeState` during real drag + `selectedIds.length >= 2` after mouse-up |

---

## 4. Per-row acceptance table (build `20260712b100`)

| Row | Real actuation | Real assertion | Expected verdict after rebuild |
|-----|----------------|--------------|--------------------------------|
| H-R01 host | `page.mouse` click | `isDrawingSelected` + parent V9 bar visible | **PASS** |
| H-R01 panel-B | Cross-frame `page.mouse` (no fallback) | same | **PASS** if click routing fixed; else **RED** |
| H-R02 | Real click | `isDrawingSelected` + selected flag | **PASS** host; panel-B **MED** |
| H-R03 host | Real Ctrl+click | both ids selected | **PASS** |
| H-R03 panel-B | Cross-frame Ctrl+mouse | both ids selected | **UNKNOWN** until Ctrl routing proven |
| H-R04 | Real dbl-click | `waitForParentDrawingSettingsOpen` | **RED** (panel-B); host may **PASS** |
| H-R05 | Real Esc after real settings open | store deselect + probe closed | **RED** until settings chain fixed |
| H-R06 | Real Delete | drawing absent | **RED** until parent forwarder verified |
| H-R07 | Real cross-panel clicks | store-level single owner | **PASS** if assertion tightened; **RED** if toolbar proxy only |
| H-R08 host | Real Ctrl+drag | marquee w/h + selection | **MED** |
| H-R08 panel-B | Cross-frame Ctrl+drag | same | **RED** (currently synthetic) |
| H-R09 | Real chain | settings + Esc store | **RED** |
| H-R12 | Real select click + real gear mouse | `waitForParentDrawingSettingsOpen` | **RED** on b100 (panel-B); target **GREEN** post product+actuation |
| H-R12A | Real gear mouse | honest settings wait | **PASS** (proven b100) |
| H-R13 | Real dbl-click (no editDrawing fallback) | settings wait + 400ms persist | **RED** on b100; target **GREEN** post step-18 product |
| H-R14 | Cross-frame Ctrl+drag | marquee + `selectedIds` | **RED** |
| H-S32 | Real click (host) | parent V9 bar | **PASS** with tighter assert |
| H-S33 | Keep API delete path | ghost checks | **PASS** (API row, not UX) |
| H-S43/46/49 | Already real cross-frame | geometry/selection | **LOW** risk |
| H-S47 | Real draw | parent V9 bar (not selector count) | **RED** until assert fixed |

---

## 5. Migration plan

### Phase 0 — Helpers (Lane 4, one PR)

1. Add `iframePagePoint`, `realClickInPanel`, `realDblClickInPanel`, `realCtrlDragInPanel`, `realKeyInPanel` to `react-parity-lib.mjs`.
2. Delete fallbacks listed in §2.
3. No scenario edits yet; run gate — expect regressions → update baseline only if product still broken.

### Phase 1 — Burned-fix rows

Convert H-R12, H-R12A, H-R13, H-R04, H-R05, H-R06 in `react-parity-scenarios.mjs` to real actuation + honest asserts. Run `--only=<row> --runs=10` each.

### Phase 2 — Parity rows H-R01–H-R03, H-R07–H-R09, H-R14

### Phase 3 — Manager HIGH-risk H-S (H-S32, H-S47, H-S33 parallel row)

### Side-by-side

- Git branch `lane4/real-actuation`.
- Keep `REACT_PARITY_LEGACY_SYNTHETIC=1` env flag for one week if needed to bisect — default OFF.
- Gate ratchet: only remove from `knownFailing` after 10/10 on honest path.

---

## Collision / ownership note

| File | Owner | Status |
|------|-------|--------|
| `known-failing.json` | **Lane 4** | Updated step 13 |
| `react-parity-lib.mjs` | **Lane 4** (implementation) | **FREE** — Worker 1 released after step 18 |
| Product (`MultichartGrid`, engine) | Lanes 1/3 | Lane 4 does not edit for actuation work |

**Director ruling:** harness-first + honest probe + real actuation (MANAGER-ESCALATIONS #5). Implementation may start immediately; PO live-confirm remains interim authority for rows still RED.
