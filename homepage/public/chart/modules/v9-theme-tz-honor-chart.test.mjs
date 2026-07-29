/**
 * V9 theme bridge must not replace persisted chartTimezone with CST/Chicago on reload.
 * GREEN: node v9-theme-tz-honor-chart.test.mjs
 * RED:   TALARIA_TEST_DISABLE_V9_THEME_TZ_HONOR_CHART=1 node v9-theme-tz-honor-chart.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_V9_THEME_TZ_HONOR_CHART === '1';
const store = { chartTimezone: 'America/New_York' };
let managerTz = { id: 'America/New_York', label: 'America / New_York', offset: 0 };

global.userStorage = {
  getItem(key) {
    return store[key] || null;
  },
  setItem(key, value) {
    store[key] = String(value);
  },
};

global.window = {
  __TALARIA_DISABLE_V9_THEME_TZ_HONOR_CHART_V1: disabled,
  timezoneManager: {
    getTimezone() {
      return managerTz;
    },
    setTimezone(timezoneId) {
      managerTz = { id: timezoneId, label: String(timezoneId).replace(/\//g, ' / '), offset: 0 };
      store.chartTimezone = timezoneId;
      return true;
    },
  },
  chart: {
    chartSettings: {
      timezone: 'America/New_York',
      backgroundColor: '#07080E',
    },
    applyChartSettings() {},
    render() {},
  },
  panelManager: { getPanels() { return []; } },
};

const require = createRequire(import.meta.url);
require('./v9-theme-bridge.js');

assert.equal(typeof window.talariaApplyV9ThemeSettings, 'function', 'bridge installs apply fn');

const ok = window.talariaApplyV9ThemeSettings({
  timezone: 'America/Chicago',
  background: '#07080E',
  bullBody: '#00D4A1',
  bearBody: '#FF5068',
});
assert.equal(ok, true, 'apply runs when chart is ready');

// Always assert the fixed behavior. With the kill-switch ON (disabled=true),
// V9 Chicago overwrites storage → these assertions fail (RED).
assert.equal(managerTz.id, 'America/New_York', 'stored EST/New_York survives V9 Chicago theme sync');
assert.equal(window.chart.chartSettings.timezone, 'America/New_York', 'chartSettings keeps persisted chart timezone');
assert.equal(store.chartTimezone, 'America/New_York', 'persisted chartTimezone not overwritten');

// Matching V9 timezone still applies (user chose Chicago via chartTimezone first).
store.chartTimezone = 'America/Chicago';
managerTz = { id: 'America/Chicago', label: 'America / Chicago', offset: 0 };
window.chart.chartSettings.timezone = 'America/Chicago';
window.talariaApplyV9ThemeSettings({
  timezone: 'America/Chicago',
  background: '#07080E',
});
assert.equal(managerTz.id, 'America/Chicago', 'matching V9/chart timezone still applies');

console.log(disabled
  ? 'RED — switch OFF lets V9 theme America/Chicago replace persisted chartTimezone'
  : 'GREEN — V9 theme sync honors persisted chartTimezone over disagreeing Chicago');
