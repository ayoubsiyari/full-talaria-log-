/**
 * server-write-failure-ledger.js — count server writes that failed, so a support
 * ticket says so instead of us inferring it days later.
 *
 * Why this exists: /api/chart/preferences returned 500 for every read and write
 * for at least three hours on 2026-07-29 and nothing in the product said so. The
 * client fell back to localStorage, settings appeared to work inside the tab, and
 * the class was only found by reading backend logs. `degradedModules[]` announces
 * a module that failed to LOAD; this announces a module that loaded fine and then
 * could not SAVE.
 *
 * Two realms problem: the failure happens in the chart realm (often a multichart
 * panel iframe), the support passport is built in the dashboard realm, and those
 * are different pages. So the ledger does both:
 *   - publishes on window and climbs self → parent → top for same-page readers;
 *   - mirrors a bounded record into localStorage, which is the only channel that
 *     survives a navigation to the dashboard.
 *
 * Bounded on purpose: paths only (query strings dropped — they carry ids), at most
 * MAX_ENDPOINTS distinct paths, count clamped, and the whole record is dropped
 * once it is STALE_MS old so an old outage cannot haunt next week's tickets.
 *
 * Kill: window.__TALARIA_DISABLE_SERVER_WRITE_FAILURE_LEDGER_V1 — truthiness,
 * read per call, climbing self → parent → top (B-0185: a host-only switch never
 * reaches the panel realm where the failure happens).
 */
(function (global) {
    'use strict';

    var STORAGE_KEY = 'talaria_failed_server_writes';
    var MAX_ENDPOINTS = 8;
    var MAX_COUNT = 9999;
    var STALE_MS = 24 * 60 * 60 * 1000;
    var PATH = /^[A-Za-z0-9/_.:-]{1,120}$/;

    function flagTruthy(flagName) {
        var realms = [];
        try { realms.push(global); } catch (_) {}
        try { if (global.parent && global.parent !== global) realms.push(global.parent); } catch (_) {}
        try { if (global.top && global.top !== global && global.top !== global.parent) realms.push(global.top); } catch (_) {}
        for (var i = 0; i < realms.length; i++) {
            try {
                if (realms[i] && realms[i][flagName]) return true;
            } catch (_) { /* cross-origin realm: unreadable, not disabled */ }
        }
        return false;
    }

    function enabled() {
        return !flagTruthy('__TALARIA_DISABLE_SERVER_WRITE_FAILURE_LEDGER_V1');
    }

    function nowMs() {
        try { return Date.now(); } catch (_) { return 0; }
    }

    function normalisePath(endpoint) {
        var raw = String(endpoint == null ? '' : endpoint);
        var cut = raw.split('?')[0].split('#')[0];
        // Absolute URLs reduce to their path so no host or credential can ride along.
        if (/^[a-z]+:\/\//i.test(cut)) {
            var slash = cut.indexOf('/', cut.indexOf('://') + 3);
            cut = slash >= 0 ? cut.slice(slash) : '/';
        }
        cut = cut.slice(0, 120);
        return PATH.test(cut) ? cut : null;
    }

    function emptyRecord() {
        return { failedServerWrites: 0, endpoints: [], firstAt: 0, lastAt: 0, lastStatus: 0 };
    }

    function sanitise(record) {
        if (!record || typeof record !== 'object') return emptyRecord();
        var n = Number(record.failedServerWrites);
        if (!isFinite(n) || n < 0) n = 0;
        var eps = [];
        if (Array.isArray(record.endpoints)) {
            for (var i = 0; i < record.endpoints.length && eps.length < MAX_ENDPOINTS; i++) {
                var p = normalisePath(record.endpoints[i]);
                if (p && eps.indexOf(p) < 0) eps.push(p);
            }
        }
        var status = Number(record.lastStatus);
        return {
            failedServerWrites: Math.min(Math.floor(n), MAX_COUNT),
            endpoints: eps,
            firstAt: Number(record.firstAt) > 0 ? Number(record.firstAt) : 0,
            lastAt: Number(record.lastAt) > 0 ? Number(record.lastAt) : 0,
            lastStatus: isFinite(status) && status > 0 && status < 1000 ? Math.floor(status) : 0
        };
    }

    function storage() {
        // Deliberately NOT userStorage. The reader is the support passport in the
        // dashboard realm, which has no user-scoped shim, and the scoping shim
        // itself resolves its prefix asynchronously — a diagnostic counter must not
        // inherit that race. This is per-browser, non-user data, cleared on the
        // first successful write.
        try {
            if (global.localStorage) return global.localStorage;
        } catch (_) { /* storage disabled: in-memory ledger still publishes */ }
        return null;
    }

    function readStored() {
        var store = storage();
        if (!store) return emptyRecord();
        try {
            var raw = store.getItem(STORAGE_KEY);
            if (!raw) return emptyRecord();
            var parsed = sanitise(JSON.parse(raw));
            if (parsed.lastAt && nowMs() - parsed.lastAt > STALE_MS) {
                clear();
                return emptyRecord();
            }
            return parsed;
        } catch (_) {
            return emptyRecord();
        }
    }

    function writeStored(record) {
        var store = storage();
        if (!store) return;
        try {
            store.setItem(STORAGE_KEY, JSON.stringify(record));
        } catch (_) { /* quota or disabled storage: in-memory ledger still stands */ }
    }

    function publish(record) {
        var realms = [];
        try { realms.push(global); } catch (_) {}
        try { if (global.parent && global.parent !== global) realms.push(global.parent); } catch (_) {}
        try { if (global.top && global.top !== global && global.top !== global.parent) realms.push(global.top); } catch (_) {}
        for (var i = 0; i < realms.length; i++) {
            try { realms[i].__TALARIA_WRITE_FAILURE_STATE = record; } catch (_) {}
        }
    }

    function note(endpoint, status) {
        if (!enabled()) return readStored();
        var record = readStored();
        var path = normalisePath(endpoint);
        var at = nowMs();
        record.failedServerWrites = Math.min(record.failedServerWrites + 1, MAX_COUNT);
        if (path && record.endpoints.indexOf(path) < 0 && record.endpoints.length < MAX_ENDPOINTS) {
            record.endpoints.push(path);
        }
        if (!record.firstAt) record.firstAt = at;
        record.lastAt = at;
        var s = Number(status);
        record.lastStatus = isFinite(s) && s > 0 && s < 1000 ? Math.floor(s) : 0;
        writeStored(record);
        publish(record);
        return record;
    }

    function clear() {
        var store = storage();
        if (store) {
            try { store.removeItem(STORAGE_KEY); } catch (_) {}
        }
        publish(emptyRecord());
        return emptyRecord();
    }

    function read() {
        var record = readStored();
        publish(record);
        return record;
    }

    global.__talariaNoteServerWriteFailure = note;
    global.__talariaNoteServerWriteSuccess = clear;
    global.__talariaReadServerWriteFailures = read;
    global.__TALARIA_WRITE_FAILURE_LEDGER = {
        note: note,
        clear: clear,
        read: read,
        STORAGE_KEY: STORAGE_KEY,
        MAX_ENDPOINTS: MAX_ENDPOINTS,
        STALE_MS: STALE_MS,
        _sanitise: sanitise,
        _enabled: enabled
    };

    try {
        if (global.__talariaRegisterModule) {
            global.__talariaRegisterModule({
                module: 'ServerWriteFailureLedger',
                version: '20260730b105',
                class: 'diagnostic',
                status: 'loaded'
            });
        }
    } catch (_) {}

    // Publish current state at load so a passport built before any failure reads a
    // real zero rather than undefined.
    try { read(); } catch (_) {}

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.__TALARIA_WRITE_FAILURE_LEDGER;
    }
})(typeof window !== 'undefined' ? window : globalThis);
