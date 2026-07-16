# ORD-MULTIENTRY-TDZ-FIX — worker report

## 1. Task + RC

- **Task:** ORD-MULTIENTRY-TDZ-FIX (Lane 3 URGENT) — fix `ReferenceError: Cannot access 'splitOrderType' before initialization` in `updatePreviewLines` split-entry preview path.
- **RC:** Regression from preview-label refactor (crash regression, not an RC-1…RC-8 discharge). **Tooling/fix — no RC.**

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/order-manager.js` | Swapped two `const` lines in `updatePreviewLines` split-entry loop (~18706–18707): declare `splitOrderType` before `_resolvePreviewEntryColor(..., splitOrderType)`. |
| `homepage/public/chart/modules/order-manager.js` | Identical 2-line swap (I8 mirror). `fc /b` confirms **no differences** vs chart tree. |
| `chart v 1.4/chart/dist-v9/index.html` | Cache-bust bump via `bump-dist-v9-cache.mjs --dist` → `order-manager.js?v=20260716b11`. |
| `homepage/public/chart/dist-v9/index.html` | Same build id `20260716b11` on chart module scripts. |
| `chart v 1.4/talaria-design/live/index.html` | Build id aligned to `20260716b11` (bump script). |
| `chart v 1.4/chart/legacy-index.html`, `homepage/public/chart/legacy-index.html` | Build id bump (bump script). |
| `chart v 1.4/chart/sw.js`, `homepage/public/chart/sw.js`, `chart v 1.4/chart/dist-v9/sw.js`, `homepage/public/chart/dist-v9/sw.js`, `chart v 1.4/talaria-design/live/public/sw.js` | `SW_VERSION` → `talaria-chart-20260716b11`. |
| `chart v 1.4/chart/multichart-prod/chart-embed.html`, `homepage/public/chart/multichart-prod/chart-embed.html` | Embed default `?v=20260716b11`. |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs`, `homepage/public/chart/multichart-prod/harness/serve.mjs` | Harness `buildId = '20260716b11'`. |

**No other files touched.** No label/color logic changed. No kill-switch added.

## 3. Kill-switch (I3 + I13)

**N/A** — crash regression fix only; declaration-order swap with zero behavior change. No `window.__TALARIA_*` switch.

## 4. Proof — RED → GREEN

### TDZ audit (static)

Within `updatePreviewLines` split-entry block, the only `splitOrderType` binding was the inverted pair at 18706–18707 (now fixed). Other repo sites already declare-before-use:

- **13258** — `const splitOrderType = ...` then `fullLabel` uses it.
- **20476** — `let splitOrderType = ...` then assignments/use.
- **25654** — `const splitOrderType = ...` then passed to draw call.

### RED (pre-fix temporal dead zone)

Node simulation of the inverted declaration order (same TDZ as browser):

```
RED: ReferenceError Cannot access 'splitOrderType' before initialization
```

Matches PO console: `Uncaught ReferenceError: Cannot access 'splitOrderType' before initialization` at `order-manager.js:18687`/`18706` from `updatePreviewLines`.

### GREEN (post-fix)

Same simulation with declaration before use:

```
GREEN: limit
```

Source after fix (`chart v 1.4/chart/modules/order-manager.js`):

```js
const splitOrderType = splitEntry.orderType || this.orderType;
const splitColor = _resolvePreviewEntryColor(this.orderSide, splitOrderType);
```

### Dist rebuild

```bash
node "chart v 1.4/talaria-design/scripts/bump-dist-v9-cache.mjs" --dist
```

Active build id: **20260716b11** (both `chart/dist-v9/index.html` and `homepage/public/chart/dist-v9/index.html`).

### I15 actuation / measurement

- **Actuation:** Not run in browser this session — static TDZ proof + source/dist cache bump only.
- **Measurement:** TDZ elimination is proven by declaration order + Node RED/GREEN; **multi-entry preview render on live product not exercised here.**

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|----------------|
| **I8 (mirror parity)** | Both `order-manager.js` copies edited identically; `fc /b` → no differences. |
| **I3/I13 (kill-switch)** | N/A — no switch. |
| **I15 (no proxy greens)** | Status labeled **NEEDS-LIVE**; no synthetic browser green claimed. |
| **Minimal scope** | Exactly 2 lines swapped per tree; no unrelated edits. |

## 6. What I did NOT do / limits

- Did **not** run full `npm run build:live` (Vite bundle unchanged; `order-manager.js` is a runtime `/chart/modules/` script — cache bump + source fix is the served path).
- Did **not** live-click multi-entry in PO browser — console-clean multi-entry flow requires PO confirmation.
- Did **not** change `chart.js`, `replay-system.js`, or harness libs.

## 7. Live-verification handoff

**Build id:** `20260716b11` — confirm in Network tab: `/chart/modules/order-manager.js?v=20260716b11`.

**PO steps:**

1. Hard refresh (or clear SW cache) on live chart.
2. Open order rail → enable **multi-entry** / add entry level.
3. Set entry mode, add split entries, drag levels.
4. **Expect:** No `splitOrderType` ReferenceError in console; split preview lines + `Entry#N:orderType` labels render.

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

TDZ fix and dist cache bump are in source; PO must confirm no crash + preview renders on the real built product.

**Commit:** `51bd2a3d` — Fix multi-entry TDZ crash by declaring splitOrderType before use in updatePreviewLines.
