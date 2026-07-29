/**
 * TAL-01895 / TAL-01792: pinned timeframes and drawing tools are user-level preferences.
 * GREEN: node pins-user-preferences.test.mjs
 * RED:   TALARIA_TEST_DISABLE_PINS_USER_PREFS=1 node pins-user-preferences.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const disabled = process.env.TALARIA_TEST_DISABLE_PINS_USER_PREFS === '1';
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function createStorage(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        dump() {
            return Object.fromEntries(store.entries());
        },
    };
}

const userStorage = createStorage({
    chart_timeframe_favorites: JSON.stringify(['3m', '45m']),
    chart_favorite_tools: JSON.stringify(['trendline', 'horizontal']),
});
const localStorage = createStorage({});
const context = {
    console,
    CustomEvent: function CustomEvent(type, options) {
        this.type = type;
        this.detail = options && options.detail;
    },
    clearTimeout() {},
    setTimeout() { return 1; },
    userStorage,
    localStorage,
    window: {
        __TALARIA_DISABLE_PINS_USER_PREFS_V1: disabled,
        dispatchEvent() {},
    },
    document: {
        getElementById() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        removeEventListener() {},
    },
};
context.window.window = context.window;
vm.createContext(context);

vm.runInContext(
    fs.readFileSync(path.join(moduleDir, 'preferences-sync.js'), 'utf8'),
    context,
    { filename: 'preferences-sync.js' },
);
const preferencesSync = context.window.preferencesSync;
const merged = preferencesSync.mergeCloudWithLocal(
    { timeframe_favorites: [], drawing_tool_favorites: [] },
    preferencesSync.loadFromLocalStorage(),
);

assert.equal(
    JSON.stringify(merged.timeframe_favorites),
    JSON.stringify(['3m', '45m']),
    'empty cloud timeframe pins must not wipe local user pins',
);
assert.equal(
    JSON.stringify(merged.drawing_tool_favorites),
    JSON.stringify(['trendline', 'horizontal']),
    'empty cloud drawing-tool pins must not wipe local user pins',
);

vm.runInContext(
    fs.readFileSync(path.join(moduleDir, 'preferences-init.js'), 'utf8'),
    context,
    { filename: 'preferences-init.js' },
);
context.window.saveDrawingToolFavorites(['rectangle']);
assert.equal(
    JSON.stringify(preferencesSync.pendingUpdates.drawing_tool_favorites),
    JSON.stringify(['rectangle']),
    'drawing-tool pin saves must update the user preference field',
);
assert.equal(
    userStorage.getItem('chart_favorite_tools'),
    JSON.stringify(['rectangle']),
    'drawing-tool pin saves must keep the local scoped key in sync',
);

preferencesSync.preferences = { drawing_tool_favorites: ['ellipse'] };
vm.runInContext(
    fs.readFileSync(path.join(moduleDir, 'favorites-manager.js'), 'utf8'),
    context,
    { filename: 'favorites-manager.js' },
);
const manager = Object.create(context.window.FavoritesManager.prototype);
manager.storageKey = 'chart_favorite_tools';
manager.toolDefinitions = { ellipse: {}, trendline: {}, horizontal: {}, rectangle: {} };
manager.favorites = [];
manager.loadFavorites();
assert.equal(
    JSON.stringify(manager.favorites),
    JSON.stringify(['ellipse']),
    'drawing-tool favorite manager must load user-level preference pins',
);

console.log(disabled
    ? 'RED - switch OFF keeps pins local-only / empty-cloud destructive behavior'
    : 'GREEN - pins persist as user-level preferences');
