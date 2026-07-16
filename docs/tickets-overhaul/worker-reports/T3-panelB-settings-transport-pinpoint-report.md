# T3 — panel-B settings transport PINPOINT (read-only, pre ESC-023)

## 1. Task + RC

- **Task:** `T3-panelB-settings-transport-PINPOINT-lane1-readonly` — identify the exact dismiss that tears down panel-B parent settings after honest dom-ready + dbl-click actuation.
- **RC:** Reconcile verdict **(B) TRANSPORT** on build `20260716b10`; ESC-023 filed for gated fix. **No product/harness edits** in this task.

## 2. Method

Runtime trace via temporary probe (`pinpoint-probe.mjs`, **not committed**) wrapping parent `__multichartOpenShapeSettings`, `__v9OpenDrawingSettings`, `openDrawingSettingsForPanel`, `clearDrawingUiOnOtherPanels`, and iframe `editDrawing`. Captured one **GREEN** and one **RED** isolated panel-B run. Evidence: `pinpoint-probe-out.txt`, `pinpoint-trace.json`.

## 3. Answers to pinned questions

### Q1 — Is `openDrawingSettingsForPanel('B', …)` invoked on RED?

**Yes.** On RED, parent trace shows:

| t+ms | Event |
|------|-------|
| +28 | `CALL:__multichartOpenShapeSettings` (source `B`) |
| +28 | `CALL:__v9OpenDrawingSettings` |
| +43 | `RET:__v9OpenDrawingSettings` → `hasStyle=true` |
| +96 | Second open pair (duplicate dbl-click actuation) |
| +111 | `RET:__v9OpenDrawingSettings` → `hasStyle=true` |

`__multichartOpenShapeSettings` (`MultichartGrid.jsx:5927-5928`) delegates to `openDrawingSettingsForPanel`. Iframe `editDrawing` is called twice per dbl-click (mousedown dbl detector + canvas `dblclick`).

**Not a guard-reject or missing listener on RED** — transport starts and Style content mounts.

### Q2 — Mount then tear-down? Exact dismiss caller?

**Yes on RED: mount → dismiss → empty.**

| t+ms | RED state |
|------|-----------|
| +43 / +111 | Parent `hasStyle=true` (settings mounted) |
| +134 | `MSG:multichart-drawing-selected` ×2 (panel `B`) |
| +143 | `EVT:multichart-dismiss-drawing-settings` (**guardLeft=null**, hasStyle still true at capture) |
| +159 | Second `EVT:multichart-dismiss-drawing-settings` → hasStyle=false |
| post-dbl | Iframe selection **lost** (`selectedId` null) |

**Dismiss handler (where panel is torn down):**

```19883:19914:chart v 1.4/talaria-design/src/TalariaV8bLive.jsx
const onDismissMcSettings = () => {
  // guard check — SKIPPED when guardLeft=null
  ...
  v9DismissAllDrawingSettingsImmediate(); // closes tlSettOpen / clears guard
};
```

`v9DismissAllDrawingSettingsImmediate` at `:15458-15485` sets `tlSettOpen=false` and **`__v9DrawingSettingsOpenGuardUntil = 0`** (`:15461`).

**Dismiss dispatcher (most likely on RED):**

```6501:6505:chart v 1.4/talaria-design/src/MultichartGrid.jsx
if (msg.type === "multichart-drawing-deselected") {
    window.dispatchEvent(new CustomEvent("talaria:v9-cleared-selection"));
    window.dispatchEvent(new CustomEvent("multichart-dismiss-drawing-settings"));
}
```

Iframe posts `multichart-drawing-deselected` via `notifyMultichartParentSelectionCleared` (`drawing-tools-manager.js:151-165`), fired when panel-B `deselectAll({ fromCanvasBackground: true })` runs (`:10229-10230`). RED’s lost selection (`match=null`) matches this path.

**Secondary dispatcher** (not seen in RED trace, but same event name):

```5259:5264:chart v 1.4/talaria-design/src/MultichartGrid.jsx
if (!skipDismiss) {
    window.dispatchEvent(new CustomEvent("multichart-dismiss-drawing-settings"));
}
```

`clearDrawingUiOnOtherPanels` skips dismiss only when `__v9DrawingSettingsOpenGuardUntil` is active (`:5245-5255`). On RED dismiss ticks, **guard is null**.

**Not the primary RED dismiss:** `dismissShapeSettingsForNewSelection` (`TalariaV8bLive.jsx:15286`) — closes UI directly, does **not** dispatch `multichart-dismiss-drawing-settings` (no matching EVT in trace).

### Q3 — Timing / guard window

| Phase | GREEN | RED |
|-------|-------|-----|
| Guard at iframe arm (`requestMultichartParentDrawingSettings` `:231`) | ~1500ms | ~1500ms |
| Guard during `__v9OpenDrawingSettings` RET | **null** (zeroed inside hook) | **null** |
| Guard after `openDrawingSettingsForPanel` re-arm (`:5388`) | ~1499ms | ~1499ms |
| Post-open `multichart-drawing-selected` | +106ms, no dismiss | +134ms → dismiss +143ms |
| Guard at dismiss | n/a | **null** → handler not protected |

**Root timing bug:** each `__v9OpenDrawingSettings` call on the parent runs `v9DismissAllDrawingSettingsImmediate()` first (`TalariaV8bLive.jsx:20398` on host path), which **zeroes the guard** (`:15461`) before the new panel paints. Re-arm at `openDrawingSettingsForPanel:5388` follows, but:

1. Duplicate dbl-click → **two open cycles** in ~80ms, each zeroing/re-arming guard.
2. Late `multichart-drawing-selected` (+134ms) coincides with iframe **deselect** on RED.
3. `multichart-drawing-deselected` → parent dispatches dismiss **without checking** `__v9DrawingSettingsOpenGuardUntil` (`MultichartGrid.jsx:6501-6505`).
4. `onDismissMcSettings` sees `guardLeft=null` → tears down freshly mounted Style panel.

Guard is **too short in effective coverage** — not because 1500ms expires, but because it is **cleared mid-open** and **not honored** on the `multichart-drawing-deselected` dispatch path.

### Q4 — GREEN vs RED event-order diff

```
GREEN:  arm → open → hasStyle=true → selection-sync (+106ms) → (no dismiss) → selection kept
RED:    arm → open → hasStyle=true → selection-sync (+134ms) → deselect (iframe)
          → multichart-drawing-deselected → multichart-dismiss (guard=null)
          → v9DismissAllDrawingSettingsImmediate → hasStyle=false → selection lost
```

GREEN also shows duplicate open + `guardLeft=null` on `__v9OpenDrawingSettings` RET — so guard zeroing alone is insufficient to fail; **RED adds the post-open deselect → dismiss chain**.

## 4. Verdict — fix shape for ESC-023

**Both (a) and (b)** — minimal, gated:

| Fix | Rationale |
|-----|-----------|
| **(a) Extend/re-arm guard** | Do not zero `__v9DrawingSettingsOpenGuardUntil` in `v9DismissAllDrawingSettingsImmediate` while a panel-B settings open is in flight; extend guard through post-open selection-sync window (~200ms after successful `v9Open`). |
| **(b) Suppress dismiss while open in flight** | `multichart-drawing-deselected` handler (`MultichartGrid.jsx:6501`) and `onDismissMcSettings` (`TalariaV8bLive.jsx:19888`) must honor guard + `editingDrawingRef` for the opening panel; coalesce duplicate opens for same `drawingId` within one dbl-click. |

## 5. Minimal proposed hunk (preview only — NOT applied)

**Switch (I3):** `window.__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_V1` — default unset → fix **ON**.

### Hunk A — `TalariaV8bLive.jsx` (~15458, ~19888)

```diff
+function multichartPanelBSettingsTransportV1Enabled() {
+  return typeof window === "undefined" || !window.__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_V1;
+}
 const v9DismissAllDrawingSettingsImmediate = () => {
   clearSettingsPanelHover();
   try {
-    window.__v9DrawingSettingsOpenGuardUntil = 0;
-    window.__v9DrawingSettingsOpenSource = null;
+    if (!multichartPanelBSettingsTransportV1Enabled()
+        || !window.__v9MultichartSettingsPanelId) {
+      window.__v9DrawingSettingsOpenGuardUntil = 0;
+      window.__v9DrawingSettingsOpenSource = null;
+    }
   } catch (_) {}
   ...
 };
```

```diff
 const onDismissMcSettings = () => {
   try {
     if (typeof window !== "undefined"
       && window.__v9DrawingSettingsOpenGuardUntil
       && performance.now() < window.__v9DrawingSettingsOpenGuardUntil
       && !window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2) {
       return;
     }
+    if (multichartPanelBSettingsTransportV1Enabled()
+        && editingDrawingRef.current
+        && window.__v9DrawingSettingsOpenSource) {
+      return; // in-flight panel-B open — do not flash-close
+    }
   } catch (_) {}
```

### Hunk B — `MultichartGrid.jsx` (~6501)

```diff
 if (msg.type === "multichart-drawing-deselected") {
+    if (multichartPanelBSettingsTransportV1Enabled()) {
+      try {
+        if (window.__v9DrawingSettingsOpenGuardUntil
+            && performance.now() < window.__v9DrawingSettingsOpenGuardUntil) {
+          return;
+        }
+      } catch (_) {}
+    }
     try {
       window.dispatchEvent(new CustomEvent("talaria:v9-cleared-selection"));
       window.dispatchEvent(new CustomEvent("multichart-dismiss-drawing-settings"));
```

### Hunk C — `openDrawingSettingsForPanel` / `requestMultichartParentDrawingSettings` (~5371, ~231)

```diff
-    window.__v9DrawingSettingsOpenGuardUntil = performance.now() + 1500;
+    const guardMs = multichartPanelBSettingsTransportV1Enabled() ? 2000 : 1500;
+    window.__v9DrawingSettingsOpenGuardUntil = performance.now() + guardMs;
```

Optional coalesce: if `openDrawingSettingsForPanel` is called twice for same `source`+`drawingId` within 120ms, skip the second `v9DismissAllDrawingSettingsImmediate` preamble.

## 6. STOP

**Implementation waits on ESC-023 ruling.** No product edits, no harness edits, no dist rebuild in this task.

## 7. Evidence files (harness, not committed to product)

| File | Content |
|------|---------|
| `pinpoint-probe-out.txt` | Console summary GREEN vs RED |
| `pinpoint-trace.json` | Full event timelines + samples |
