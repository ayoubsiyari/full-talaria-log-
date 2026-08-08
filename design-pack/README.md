# Talaria Plan 4 Phase 1 — Design Pack (Obsidian chrome skin)

Drop-in **skin** for a bare chart shell: static tokens, frame/toolbar chrome, shared icons, control states.

This pack does **not** ship a trading engine, data layer, or chart library.

## Quick apply (stranger path)

1. Copy this `design-pack/` folder next to your shell (keep it as **one** tree — no mirrors).
2. Link tokens + chrome CSS once:

```html
<link rel="stylesheet" href="design-pack/tokens.css" />
<link rel="stylesheet" href="design-pack/chrome/chrome.css" />
```

3. Set theme **once** on the document (or shell root):

```html
<html data-talaria-theme="dark">
```

Valid values: `dark` | `light` | `light-soft` (see `tokens.json`).

4. Mount markup from [`chrome/shell.html`](chrome/shell.html) (or your equivalent using the same class names / `data-*` hooks).
5. Inject [`icons/sprite.svg`](icons/sprite.svg) once into the page; icons are `<svg class="talaria-icon"><use href="#icon-…"></use></svg>`.
6. Put your canvas inside `#chart-stage` / `[data-slot="chart-canvas"]`. Remove or hide the empty-state node when the engine is ready.
7. Listen for chrome intents (optional):

```js
shell.addEventListener("talaria:tf", (e) => { /* e.detail.tf */ });
shell.addEventListener("talaria:tool", (e) => { /* e.detail.tool */ });
```

Demo preview: open [`chrome/shell.html`](chrome/shell.html) via a static server (needed for sprite `fetch`).

```bash
cd design-pack && python3 -m http.server 8765
# → http://127.0.0.1:8765/chrome/shell.html
```

## Skin map (SK-01 … SK-05)

| ID | Deliverable | Files |
|---|---|---|
| **SK-01** | Palette / type / spacing tokens | [`tokens.json`](tokens.json), [`tokens.css`](tokens.css) |
| **SK-02** | Chart frame / viewport host | `.talaria-chart-host`, `#chart-stage` in chrome |
| **SK-03** | Top toolbar + Place Order + utils | `.talaria-topbar` |
| **SK-04** | Left rail + replay bar + trades strip | `.talaria-rail`, `.talaria-replaybar`, `.talaria-trades` |
| **SK-05** | Icons + states | [`icons/sprite.svg`](icons/sprite.svg), [`states.md`](states.md) |

Placement detail: [`layout-map.md`](layout-map.md).  
States: [`states.md`](states.md).  
What we must not rebuild: [`OUT-OF-SCOPE.md`](OUT-OF-SCOPE.md).

## Hard rules (memory / smoothness)

**Do**

- Keep tokens **static**. Apply theme by setting `data-talaria-theme` once.
- Put dynamic geometry (crosshair x/y, hover price) in JS/canvas **FrameValues**, never CSS vars on shared ancestors.
- Use the **one** SVG sprite (`<symbol>` / `<use>`).
- Prefer delegated listeners; call `window.__talariaDesignPackDispose()` (demo) or your own remove path on unmount.
- Keep idle UI quiet: color/opacity transitions only; honor `prefers-reduced-motion`.

**Do not**

- Write CSS variables every frame / in `rAF` / in `mousemove` for theme or geometry.
- `insertRule` / rewrite `<style>` each frame; `setProperty` on tokens per pointer move.
- Add `backdrop-filter`, heavy blur, stacked box-shadows, or looping animations on always-visible chrome.
- Bundle Lightweight Charts, TradingView, or any chart library in this pack.
- Duplicate this tree (“mirror” copies).
- Ship `node_modules`, `.git`, build caches, or sample tick data inside the pack.

## What you must NOT change when applying

- Host canvas ownership and paint path
- Order / risk / ledger math
- Replay engine internals
- The memory rules above

You **may** retune token values and rearrange chrome labels as long as SK slots and the canvas mount remain obvious.

## Folder shape

```
design-pack/
  README.md
  tokens.json
  tokens.css
  OUT-OF-SCOPE.md
  layout-map.md
  states.md
  icons/sprite.svg
  chrome/chrome.css
  chrome/shell.html
  screenshots/desktop-1440.png
  screenshots/phone-390.png
```

## Acceptance checklist

- [ ] Stranger can skin a bare shell with tokens + chrome only
- [ ] No secret deps; no “open the old repo”
- [ ] Pack under ~10 MB; no vendor trees
- [ ] Theme switch does not stream CSS vars per frame
- [ ] Icons come from one sprite
- [ ] Screenshots show desktop + one narrow width

## Screenshots

| File | Viewport |
|---|---|
| [`screenshots/desktop-1440.png`](screenshots/desktop-1440.png) | ~1440×900 dark shell |
| [`screenshots/phone-390.png`](screenshots/phone-390.png) | ~390×844 phone collapse |

## Version

`1.0.0` — Obsidian black-first chrome; mist light themes included as static token sets.
