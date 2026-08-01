/**
 * HYG-1 — settings-write circuit breaker + debounced coalesced writes.
 * Marker: HYG-1-SETTINGS-WRITE-BREAKER-V1.
 *
 * There are three independent cloud channels for what a user thinks of as "my settings"
 * (POST /api/chart/settings/{symbol}, POST /api/chart/preferences, PATCH /api/sessions/{id}/state),
 * each with its own debounce and its own 403-only breaker, and none of them aware of the others. The
 * local half is worse: every saveSettings() and every updatePreference() does a full JSON.stringify
 * plus a synchronous localStorage.setItem, undebounced, on the main thread. Pick eight colours in a
 * theme editor and that is eight full serialisations of the whole settings blob.
 *
 * ── The one design decision worth arguing about ────────────────────────────────────────────────
 * A circuit breaker on a WRITE path must not behave like a breaker on a read path. Tripping open and
 * discarding calls is correct for a failing read - you lose a fetch. On this path you would be
 * discarding the user's preferences, silently, exactly when the backend is already unhealthy. That
 * converts a server problem into user-visible data loss, which is a worse defect than the storm.
 *
 * So this breaker never drops data:
 *   - failures  open the circuit, which stops SENDING but RETAINS the latest payload and retries
 *     after a cooldown. The local copy is always written first, so the user's setting survives even
 *     if the cloud never comes back.
 *   - storms    do not open the circuit at all. They widen the debounce window, so a runaway caller
 *     costs one write per widened window instead of N writes - the storm is absorbed, not dropped.
 *
 * Both halves are observable through stats() so the wave can attribute the switch rather than
 * infer it.
 *
 * Switch: window.__TALARIA_SETTINGS_WRITE_BREAKER_V1 === false restores immediate, uncoalesced,
 * unbroken writes. Default ON per RELEASE-01; the switch is the incident brake and the OFF arm.
 */
(function () {
    'use strict';

    var COALESCE_MS = 250;          // local writes: long enough to absorb a click burst, short enough
                                    // that a crash within it loses at most a quarter second of intent
    var STORM_WINDOW_MS = 10000;
    var STORM_THRESHOLD = 20;       // writes per channel per window before the debounce widens
    var COALESCE_MS_MAX = 4000;     // ceiling on the widened window
    var FAILURE_THRESHOLD = 3;      // consecutive transport failures before the circuit opens
    var COOLDOWN_MS = 30000;        // how long the circuit stays open before a half-open probe

    function enabled() {
        try {
            return window.__TALARIA_SETTINGS_WRITE_BREAKER_V1 !== false;
        } catch (_e) {
            return true;
        }
    }

    // ── local write coalescing ──────────────────────────────────────────────────────────────────
    // One pending value per key. Later writes to the same key replace earlier ones, which is the
    // whole point: the user's last choice is the only one that was ever going to survive anyway.
    var pending = Object.create(null);
    var pendingCount = 0;
    var flushTimer = null;
    var stats = {
        writesRequested: 0,
        writesPerformed: 0,
        coalesced: 0,
        flushes: 0,
        stormWidenings: 0,
        currentCoalesceMs: COALESCE_MS,
        circuitOpens: 0,
        sendsBlockedWhileOpen: 0,
        sendsRetried: 0,
        lastError: null,
    };

    var recentWrites = [];
    function currentCoalesceMs() {
        var now = Date.now();
        while (recentWrites.length && now - recentWrites[0] > STORM_WINDOW_MS) recentWrites.shift();
        if (recentWrites.length <= STORM_THRESHOLD) {
            stats.currentCoalesceMs = COALESCE_MS;
            return COALESCE_MS;
        }
        // Widen proportionally to how far past the threshold we are, capped. A caller writing in a
        // render loop gets one write per COALESCE_MS_MAX instead of one per frame, and still loses
        // nothing, because the last value always wins.
        var over = recentWrites.length / STORM_THRESHOLD;
        var widened = Math.min(COALESCE_MS_MAX, Math.round(COALESCE_MS * over));
        if (widened > stats.currentCoalesceMs) stats.stormWidenings += 1;
        stats.currentCoalesceMs = widened;
        return widened;
    }

    function performWrite(key, entry) {
        try {
            var value = typeof entry.value === 'function' ? entry.value() : entry.value;
            if (value === undefined) return;
            entry.sink(key, value);
            stats.writesPerformed += 1;
        } catch (err) {
            stats.lastError = String((err && err.message) || err);
            try { console.warn('[HYG-1-SETTINGS-WRITE-BREAKER-V1] write failed for ' + key, err); }
            catch (_e) { /* ignore */ }
        }
    }

    function flush() {
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        if (!pendingCount) return;
        stats.flushes += 1;
        var keys = Object.keys(pending);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var entry = pending[k];
            delete pending[k];
            pendingCount -= 1;
            performWrite(k, entry);
        }
    }

    /**
     * Queue a local write. `sink(key, value)` does the actual persisting, so this module never needs
     * to know about localStorage, userStorage, or any account-scoping wrapper around them.
     */
    function write(key, value, sink) {
        stats.writesRequested += 1;
        if (!enabled()) {
            performWrite(key, { value: value, sink: sink });
            return;
        }
        recentWrites.push(Date.now());
        if (pending[key] !== undefined) stats.coalesced += 1;
        else pendingCount += 1;
        pending[key] = { value: value, sink: sink };
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(flush, currentCoalesceMs());
    }

    // ── network circuit breaker ─────────────────────────────────────────────────────────────────
    var circuits = Object.create(null);

    function circuitFor(channel) {
        if (!circuits[channel]) {
            circuits[channel] = { failures: 0, openedAt: 0, state: 'closed' };
        }
        return circuits[channel];
    }

    /**
     * True when the caller may send. When it returns false the caller MUST retain its payload - the
     * contract of this breaker is "not now", never "give up".
     */
    function canSend(channel) {
        if (!enabled()) return true;
        var c = circuitFor(channel);
        if (c.state !== 'open') return true;
        if (Date.now() - c.openedAt >= COOLDOWN_MS) {
            c.state = 'half-open';         // let exactly one probe through
            stats.sendsRetried += 1;
            return true;
        }
        stats.sendsBlockedWhileOpen += 1;
        return false;
    }

    function recordSuccess(channel) {
        var c = circuitFor(channel);
        c.failures = 0;
        c.state = 'closed';
        c.openedAt = 0;
    }

    /**
     * Only transport-level failures count. A 403 is a subscription answer and a 401 is an auth answer:
     * both are the server working correctly and neither should be retried by a breaker.
     */
    function recordFailure(channel, status) {
        if (status === 401 || status === 403) return;
        var c = circuitFor(channel);
        c.failures += 1;
        if (c.failures >= FAILURE_THRESHOLD && c.state !== 'open') {
            c.state = 'open';
            c.openedAt = Date.now();
            stats.circuitOpens += 1;
            try {
                console.warn('[HYG-1-SETTINGS-WRITE-BREAKER-V1] circuit open for "' + channel
                    + '" after ' + c.failures + ' failures; payloads retained, retry in '
                    + (COOLDOWN_MS / 1000) + 's');
            } catch (_e) { /* ignore */ }
        }
    }

    // Nothing queued may outlive the document. pagehide covers the bfcache-freeze case too (LIFE-3):
    // a frozen page might never resume, so a quarter second of pending settings must not ride into
    // the freezer unwritten.
    try {
        window.addEventListener('pagehide', flush);
        window.addEventListener('beforeunload', flush);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') flush();
        });
    } catch (_e) { /* ignore */ }

    window.__talariaSettingsWriteBreaker = {
        write: write,
        flush: flush,
        canSend: canSend,
        recordSuccess: recordSuccess,
        recordFailure: recordFailure,
        isEnabled: enabled,
        stats: function () {
            var out = {};
            for (var k in stats) if (Object.prototype.hasOwnProperty.call(stats, k)) out[k] = stats[k];
            out.pendingKeys = pendingCount;
            out.circuits = {};
            for (var c in circuits) {
                if (Object.prototype.hasOwnProperty.call(circuits, c)) {
                    out.circuits[c] = { state: circuits[c].state, failures: circuits[c].failures };
                }
            }
            return out;
        },
        /** Test seam: reset all state without reloading the document. */
        __reset: function () {
            flush();
            circuits = Object.create(null);
            recentWrites = [];
            stats.writesRequested = 0; stats.writesPerformed = 0; stats.coalesced = 0;
            stats.flushes = 0; stats.stormWidenings = 0; stats.currentCoalesceMs = COALESCE_MS;
            stats.circuitOpens = 0; stats.sendsBlockedWhileOpen = 0; stats.sendsRetried = 0;
            stats.lastError = null;
        },
    };
})();
