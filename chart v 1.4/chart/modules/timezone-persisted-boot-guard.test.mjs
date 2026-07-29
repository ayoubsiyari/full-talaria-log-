/**
 * Timezone persisted boot guard.
 * GREEN: node timezone-persisted-boot-guard.test.mjs
 * RED:   TALARIA_TEST_DISABLE_TIMEZONE_PERSISTED_BOOT_GUARD=1 node timezone-persisted-boot-guard.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_TIMEZONE_PERSISTED_BOOT_GUARD === '1';
const store = { chartTimezone: 'America/New_York' };
const listeners = {};

global.userStorage = {
    getItem(key) {
        return store[key] || null;
    },
    setItem(key, value) {
        store[key] = String(value);
    },
};
global.window = {
    __TALARIA_DISABLE_TIMEZONE_PERSISTED_BOOT_GUARD_V1: disabled,
    addEventListener(type, fn) {
        listeners[type] = fn;
    },
    removeEventListener(type) {
        delete listeners[type];
    },
};

const require = createRequire(import.meta.url);
require('./timezone-manager.js');

const tm = window.timezoneManager;
assert.equal(tm.getTimezone().id, 'America/New_York', 'stored chart timezone loads first');

const bootOverride = tm.setTimezone('America/Chicago');
assert.equal(bootOverride, false, 'pre-interaction external timezone push is rejected');
assert.equal(tm.getTimezone().id, 'America/New_York', 'stored timezone survives V9 boot push');
assert.equal(store.chartTimezone, 'America/New_York', 'rejected boot push does not overwrite storage');

tm._timezoneUserGestureSeen = true;
tm._bootTimezoneGuardActive = false;
assert.equal(tm.setTimezone('America/Chicago'), true, 'user-initiated timezone changes remain allowed after interaction');
assert.equal(tm.getTimezone().id, 'America/Chicago', 'post-interaction timezone change applies');

console.log(disabled
    ? 'RED — switch OFF lets V9 boot settings overwrite stored chart timezone'
    : 'GREEN — stored chart timezone survives pre-interaction V9 boot sync');
