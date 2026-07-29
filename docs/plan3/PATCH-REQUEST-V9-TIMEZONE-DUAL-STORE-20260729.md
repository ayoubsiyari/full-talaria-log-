# Patch Request: V9 Timezone Dual-Store Reapply

Owner: V9/chart settings owner
Requester: Manager D
Date: 2026-07-29

## Problem

PO refresh repro showed chart timezone label changing from EST to CST. `timezone-manager.js` does not fall back to CST; its default is UTC and `chartTimezone` can load `America/New_York` correctly. CST is introduced by later settings/session paths that call `timezoneManager.setTimezone('America/Chicago')`.

Manager D has added an owned guard in `timezone-manager.js` behind `__TALARIA_DISABLE_TIMEZONE_PERSISTED_BOOT_GUARD_V1`: if a valid stored `chartTimezone` loaded, pre-interaction external `setTimezone(...)` pushes that disagree are rejected.

That guard prevents the initial overwrite, but it cannot clean the V9/session stores that still hold Chicago.

## Remaining Hole

The following stores/bridges can retain or re-send `America/Chicago` after the manager rejects the boot apply:

- `v9_ui_settings`
- `__talariaV9SettingsSnapshot`
- session timezone adoption
- V9 theme/settings bridge calls into `timezoneManager.setTimezone(...)`
- chart settings/DOM sync paths that may keep `chartSettings.timezone` as Chicago

After first pointer/key interaction, the manager intentionally releases its boot guard so real user timezone changes can work. A stale Chicago value can then be re-applied by V9/session settings and accepted.

## Requested Change

Please make the V9/session timezone store honor the loaded chart timezone during boot:

- If `userStorage.getItem('chartTimezone')` exists and is a valid IANA timezone, use it as the authoritative boot timezone.
- Do not push `settings.timezone` / session timezone into `timezoneManager` when it disagrees with that stored chart timezone during boot.
- If `timezoneManager.setTimezone(...)` returns `false`, do not write or retain the rejected timezone as authoritative `chartSettings.timezone` / V9 snapshot state.
- Prefer synchronizing V9/session settings from the manager's accepted timezone after boot rejection, rather than retrying the stale external timezone.

## RED/GREEN Suggestion

RED:

1. Seed `chartTimezone = America/New_York`.
2. Seed V9 settings/session snapshot with `America/Chicago`.
3. Boot/apply V9 settings before interaction.
4. Fire a pointer/key interaction.
5. Trigger a V9 settings re-apply.
6. Assert timezone remains `America/New_York` and V9/chart settings no longer hold rejected `America/Chicago`.

GREEN:

- Initial boot apply and delayed post-interaction re-apply both preserve the stored chart timezone unless the user explicitly changes timezone.

## Manager D Evidence

- RED: `TALARIA_TEST_DISABLE_TIMEZONE_PERSISTED_BOOT_GUARD=1 node timezone-persisted-boot-guard.test.mjs` accepts Chicago and overwrites stored New York.
- GREEN: both timezone persisted boot guard tests pass in canonical and homepage mirrors.
- No `chart.js` or `replay-system.js` edits were made by Manager D.
