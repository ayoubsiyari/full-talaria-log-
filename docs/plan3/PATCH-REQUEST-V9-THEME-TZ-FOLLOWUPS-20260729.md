# Patch Request: V9 Timezone Follow-ups After Bridge Honor Fix

Owner: V9 / Manager A (as cited)
Requester: Manager D
Date: 2026-07-29

## Landed (Manager D)

`chart v 1.4/chart/modules/v9-theme-bridge.js` (homepage mirror aligned) now honors persisted `chartTimezone` over a disagreeing V9 `settings.timezone` during theme apply, behind `__TALARIA_DISABLE_V9_THEME_TZ_HONOR_CHART_V1` (default ON).

## Escalate — do not edit from Manager D

### 1. `chart.js` session / DOM timezone pushes

If a full reload still flips EST→CST after the bridge fix, these A-owned lines can still call `timezoneManager.setTimezone(...)` with session/V9 Chicago after the boot gesture releases:

- `applySessionTimezone` — **~1799–1813** (`chart v 1.4/chart/chart.js`)
- V9 settings DOM sync `setTimezone` — **~32036–32044**

Requested: same honor rule — do not push session/DOM timezone when it disagrees with a valid persisted `chartTimezone`, unless the user explicitly changed timezone.

### 2. Duplicate apply path in Live bundle

`TalariaV8bLive.jsx` replaces `window.talariaApplyV9ThemeSettings` with `applyV9ThemeSettingsToChart` from `talaria-design/src/v9ThemeSync.js` (**~15897**, sync body **~245 / ~293–296**). That duplicate still pushes `settings.timezone` unconditionally. Please mirror the bridge honor-chart rule there (or stop replacing the bridge global).

### 3. Intentional V9 timezone change write-through

With honor-chart ON, a V9 Settings confirm that only updates `settings.timezone` without first writing `chartTimezone` / `timezoneManager.setTimezone` will not move the chart timezone. On confirm, call `timezoneManager.setTimezone(resolvedId)` (or write `chartTimezone`) **before** theme apply so storage and V9 agree.
