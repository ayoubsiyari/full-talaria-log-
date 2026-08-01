/**
 * Timezone Manager - Centralized timezone handling for the chart
 * Provides timezone conversion and persistence
 */

const M20_A_TZ_LISTENER_STORES = new WeakMap();
const M20_A_TZ_WEAKMAP_GET = WeakMap.prototype.get;
const M20_A_TZ_WEAKMAP_SET = WeakMap.prototype.set;
const M20_A_TZ_ARRAY_PUSH = Array.prototype.push;
const M20_A_TZ_ARRAY_SLICE = Array.prototype.slice;
const M20_A_TZ_ARRAY_SPLICE = Array.prototype.splice;
const M20_A_TZ_ARRAY_INDEX_OF = Array.prototype.indexOf;
const M20_A_TZ_OBJECT_DEFINE_PROPERTY = Object.defineProperty;

function m20ATzInstallListenerStore(manager) {
    const listeners = [];
    M20_A_TZ_WEAKMAP_SET.call(M20_A_TZ_LISTENER_STORES, manager, listeners);
    M20_A_TZ_OBJECT_DEFINE_PROPERTY(manager, 'listeners', {
        configurable: true,
        enumerable: true,
        get() {
            return M20_A_TZ_WEAKMAP_GET.call(M20_A_TZ_LISTENER_STORES, manager);
        },
        set() {
            // Public whole-property replacement is ignored for internal safety.
            // The compatible observable surface remains the genuine listener Array.
        }
    });
}

function m20ATzListenerStore(manager) {
    const listeners = M20_A_TZ_WEAKMAP_GET.call(M20_A_TZ_LISTENER_STORES, manager);
    if (!listeners) throw new Error('Timezone listener store not initialized');
    return listeners;
}

function m20ATzListenerInsert(manager, callback) {
    M20_A_TZ_ARRAY_PUSH.call(m20ATzListenerStore(manager), callback);
}

function m20ATzListenerRemoveOne(manager, callback) {
    const listeners = m20ATzListenerStore(manager);
    const idx = M20_A_TZ_ARRAY_INDEX_OF.call(listeners, callback);
    if (idx >= 0) M20_A_TZ_ARRAY_SPLICE.call(listeners, idx, 1);
}

function m20ATzListenerRemoveAll(manager, callback) {
    const listeners = m20ATzListenerStore(manager);
    for (let i = listeners.length - 1; i >= 0; i--) {
        if (listeners[i] === callback) M20_A_TZ_ARRAY_SPLICE.call(listeners, i, 1);
    }
}

function m20ATzListenerSnapshot(manager) {
    return M20_A_TZ_ARRAY_SLICE.call(m20ATzListenerStore(manager));
}

function m20ATzListenerCensus(manager) {
    return m20ATzListenerStore(manager).length;
}

class TimezoneManager {
    constructor() {
        this.STORAGE_KEY = 'chartTimezone';
        this.DEFAULT_TIMEZONE = 'UTC';
        
        // Common trading timezones - sorted by UTC offset (one per offset)
        this.timezones = [
            { id: 'Pacific/Midway', label: 'Midway Island', offset: -11 },
            { id: 'Pacific/Honolulu', label: 'Honolulu (HST)', offset: -10 },
            { id: 'America/Anchorage', label: 'Anchorage (AKST)', offset: -9 },
            { id: 'America/Los_Angeles', label: 'Los Angeles (PST)', offset: -8 },
            { id: 'America/Denver', label: 'Denver (MST)', offset: -7 },
            { id: 'America/Chicago', label: 'Chicago (CST)', offset: -6 },
            { id: 'America/New_York', label: 'New York (EST)', offset: -5 },
            { id: 'America/Caracas', label: 'Caracas (VET)', offset: -4 },
            { id: 'America/Sao_Paulo', label: 'São Paulo (BRT)', offset: -3 },
            { id: 'Atlantic/South_Georgia', label: 'South Georgia', offset: -2 },
            { id: 'Atlantic/Azores', label: 'Azores (AZOT)', offset: -1 },
            { id: 'UTC', label: 'UTC', offset: 0 },
            { id: 'Europe/Paris', label: 'Paris (CET)', offset: 1 },
            { id: 'Europe/Athens', label: 'Athens (EET)', offset: 2 },
            { id: 'Europe/Moscow', label: 'Moscow (MSK)', offset: 3 },
            { id: 'Asia/Dubai', label: 'Dubai (GST)', offset: 4 },
            { id: 'Asia/Karachi', label: 'Karachi (PKT)', offset: 5 },
            { id: 'Asia/Kolkata', label: 'Mumbai (IST)', offset: 5.5 },
            { id: 'Asia/Dhaka', label: 'Dhaka (BST)', offset: 6 },
            { id: 'Asia/Bangkok', label: 'Bangkok (ICT)', offset: 7 },
            { id: 'Asia/Singapore', label: 'Singapore (SGT)', offset: 8 },
            { id: 'Asia/Tokyo', label: 'Tokyo (JST)', offset: 9 },
            { id: 'Australia/Sydney', label: 'Sydney (AEST)', offset: 10 },
            { id: 'Pacific/Noumea', label: 'Noumea (NCT)', offset: 11 },
            { id: 'Pacific/Auckland', label: 'Auckland (NZST)', offset: 12 }
        ];

        // Private listener store is installed before storage/host callbacks.
        m20ATzInstallListenerStore(this);

        // Load saved timezone
        this.currentTimezone = this.loadTimezone();
        this._bootTimezoneGuardActive = this._timezonePersistedBootGuardEnabled()
            && this._loadedTimezoneFromStorage === true;
        this._timezoneUserGestureSeen = false;
        this._installBootTimezoneGuardRelease();
        this._wallClockFmtCache = Object.create(null);

        // M20-A bounded notify state (see notifyListeners contract):
        // at most NOTIFY_PASS_BUDGET delivery passes per externally initiated
        // change; reentrant setTimezone beyond the budget is rejected loudly.
        this.NOTIFY_PASS_BUDGET = 8;
        this._notifyActive = false;
        this._notifyPassCount = 0;
        this._notifyPending = false;
        
        console.log('🌍 TimezoneManager initialized:', this.currentTimezone);
    }
    
    /**
     * Load timezone from localStorage
     */
    loadTimezone() {
        this._loadedTimezoneFromStorage = false;
        try {
            const saved = userStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const tz = this.timezones.find(t => t.id === saved);
                if (tz) {
                    this._loadedTimezoneFromStorage = true;
                    return tz;
                }
                try {
                    new Intl.DateTimeFormat('en-US', { timeZone: saved });
                    this._loadedTimezoneFromStorage = true;
                    return { id: saved, label: saved.replace(/\//g, ' / '), offset: 0 };
                } catch (_) { /* invalid stored id */ }
            }
        } catch (e) {
            console.warn('Failed to load timezone:', e);
        }
        return this.timezones.find(t => t.id === this.DEFAULT_TIMEZONE);
    }
    
    /**
     * Save timezone to localStorage
     */
    saveTimezone(timezone) {
        try {
            userStorage.setItem(this.STORAGE_KEY, timezone.id);
        } catch (e) {
            console.warn('Failed to save timezone:', e);
        }
    }

    _timezonePersistedBootGuardEnabled() {
        try {
            return window.__TALARIA_DISABLE_TIMEZONE_PERSISTED_BOOT_GUARD_V1 !== true;
        } catch (_) {
            return true;
        }
    }

    _installBootTimezoneGuardRelease() {
        if (!this._bootTimezoneGuardActive || typeof window === 'undefined') return;
        const release = () => {
            this._timezoneUserGestureSeen = true;
            this._bootTimezoneGuardActive = false;
            try { window.removeEventListener('pointerdown', release, true); } catch (_) {}
            try { window.removeEventListener('keydown', release, true); } catch (_) {}
        };
        try { window.addEventListener('pointerdown', release, { capture: true, once: true }); } catch (_) {}
        try { window.addEventListener('keydown', release, { capture: true, once: true }); } catch (_) {}
    }

    _shouldRejectBootTimezoneOverride(timezoneId) {
        if (!this._bootTimezoneGuardActive || this._timezoneUserGestureSeen) return false;
        if (!this.currentTimezone || this._loadedTimezoneFromStorage !== true) return false;
        return timezoneId && timezoneId !== this.currentTimezone.id;
    }
    
    /**
     * Get current timezone
     */
    getTimezone() {
        return this.currentTimezone;
    }
    
    /**
     * Get timezone offset in hours
     */
    getOffset() {
        return this.currentTimezone.offset;
    }
    
    /**
     * Get timezone offset in milliseconds
     */
    getOffsetMs() {
        return this.currentTimezone.offset * 60 * 60 * 1000;
    }
    
    /**
     * Set timezone by ID
     */
    setTimezone(timezoneId) {
        if (!timezoneId || typeof timezoneId !== 'string') return false;
        let tz = this.timezones.find(t => t.id === timezoneId);
        if (!tz) {
            try {
                new Intl.DateTimeFormat('en-US', { timeZone: timezoneId });
                tz = { id: timezoneId, label: timezoneId.replace(/\//g, ' / '), offset: 0 };
            } catch (_) {
                return false;
            }
        }
        if (this._shouldRejectBootTimezoneOverride(tz.id)) {
            console.warn('🌍 Timezone boot override ignored; preserving stored chart timezone:', this.currentTimezone.id, 'blocked:', tz.id);
            return false;
        }
        // M20-A: same-timezone set is idempotent — no duplicate save/notify.
        if (this.currentTimezone && this.currentTimezone.id === tz.id) return true;
        // M20-A: once the trailing notify budget is exhausted, further
        // reentrant (listener-initiated) changes are rejected loudly — never
        // silently dropped — so the final delivered timezone equals state.
        if (this._notifyActive && this._notifyPassCount >= this.NOTIFY_PASS_BUDGET) {
            console.warn('🌍 Timezone change rejected: reentrant notify pass budget exhausted:', timezoneId);
            return false;
        }
        this.currentTimezone = tz;
        this.saveTimezone(tz);
        this.notifyListeners();
        console.log('🌍 Timezone changed to:', tz.label);
        return true;
    }
    
    /**
     * Get all available timezones
     */
    getTimezones() {
        return this.timezones;
    }
    
    /**
     * Wall-clock calendar fields for UTC instant `timestamp` in IANA zone `tzId`.
     */
    _wallClockParts(timestamp, tzId) {
        const key = tzId || 'UTC';
        if (!this._wallClockFmtCache[key]) {
            this._wallClockFmtCache[key] = new Intl.DateTimeFormat('en-US', {
                timeZone: key,
                hour12: false,
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric'
            });
        }
        const fmt = this._wallClockFmtCache[key];
        const o = {};
        fmt.formatToParts(new Date(timestamp)).forEach((p) => {
            if (p.type !== 'literal') {
                const n = parseInt(p.value, 10);
                if (!Number.isNaN(n)) o[p.type] = n;
            }
        });
        return {
            year: o.year,
            month: o.month,
            day: o.day,
            hour: o.hour,
            minute: o.minute,
            second: Number.isFinite(o.second) ? o.second : 0
        };
    }

    /**
     * Convert UTC epoch ms to a Date whose UTC getters equal wall-clock time in the selected IANA zone.
     * (chart.js must use getUTC* / { timeZone: 'UTC' } when formatting these values.)
     */
    convertToTimezone(timestamp) {
        try {
            const tzId = this.currentTimezone && this.currentTimezone.id;
            if (!tzId) return new Date(timestamp);
            const p = this._wallClockParts(timestamp, tzId);
            if (!Number.isFinite(p.year) || !Number.isFinite(p.month) || !Number.isFinite(p.day)) {
                return new Date(timestamp);
            }
            return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
        } catch (e) {
            console.warn('convertToTimezone:', e);
            return new Date(timestamp);
        }
    }

    /**
     * UTC epoch ms for wall-clock Y-M-D H:M:S in `timezoneId` (defaults to current chart TZ).
     * Uses Intl (DST-aware); falls back to naive Date.UTC if no match (invalid local times).
     */
    wallClockToUtcMillis(year, month, day, hour, minute, second = 0, timezoneId = null) {
        const tzId = timezoneId || (this.currentTimezone && this.currentTimezone.id) || 'UTC';
        try {
            const nominal = Date.UTC(year, month - 1, day, hour, minute, second);
            const scanStart = nominal - 28 * 3600000;
            const scanEnd = nominal + 28 * 3600000;
            let firstMinuteMatch = null;
            for (let ms = scanStart; ms <= scanEnd; ms += 60000) {
                const p = this._wallClockParts(ms, tzId);
                if (p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute) {
                    firstMinuteMatch = ms;
                    break;
                }
            }
            if (firstMinuteMatch != null) {
                for (let dsec = -120; dsec <= 120; dsec++) {
                    const ms = firstMinuteMatch + dsec * 1000;
                    const p = this._wallClockParts(ms, tzId);
                    if (p.year === year && p.month === month && p.day === day &&
                        p.hour === hour && p.minute === minute && p.second === second) {
                        return ms;
                    }
                }
                return firstMinuteMatch;
            }
        } catch (e) {
            console.warn('wallClockToUtcMillis:', e);
        }
        return Date.UTC(year, month - 1, day, hour, minute, second);
    }

    /**
     * Format a timestamp in current timezone (IANA-aware via Intl).
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @param {string} format - 'time', 'date', 'datetime', 'full'
     */
    formatTime(timestamp, format = 'time') {
        const tz = this.currentTimezone.id;
        const d = new Date(timestamp);
        try {
            switch (format) {
                case 'time':
                    return new Intl.DateTimeFormat('en-US', {
                        timeZone: tz,
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }).format(d);
                case 'timeFull':
                    return new Intl.DateTimeFormat('en-US', {
                        timeZone: tz,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                    }).format(d);
                case 'date':
                    return new Intl.DateTimeFormat('en-CA', {
                        timeZone: tz,
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    }).format(d);
                case 'datetime':
                    return `${new Intl.DateTimeFormat('en-CA', {
                        timeZone: tz,
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    }).format(d)} ${new Intl.DateTimeFormat('en-US', {
                        timeZone: tz,
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }).format(d)}`;
                case 'full':
                    return new Intl.DateTimeFormat('en-US', {
                        timeZone: tz,
                        weekday: 'short',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                    }).format(d);
                default:
                    return new Intl.DateTimeFormat('en-US', {
                        timeZone: tz,
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }).format(d);
            }
        } catch (e) {
            console.warn('formatTime:', e);
            const pad = (n) => String(n).padStart(2, '0');
            const x = this.convertToTimezone(timestamp);
            return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
        }
    }
    
    /**
     * Get timezone label for display
     */
    getLabel() {
        return this.currentTimezone.label;
    }
    
    /**
     * Get short label (e.g., "EST", "UTC")
     */
    getShortLabel() {
        const match = this.currentTimezone.label.match(/\(([^)]+)\)/);
        return match ? match[1] : 'UTC';
    }
    
    /**
     * M20-A kill-switch (default ON = subscribe unsubscribe fix active when unset/false):
     *   window.__TALARIA_DISABLE_M20_A_TIMEZONE_LISTENER_UNSUB_V1 = true
     *   → subscribe() registers via legacy addListener; returned cleanup is intentional no-op.
     */
    _m20ATimezoneListenerUnsubEnabled() {
        try {
            return window.__TALARIA_DISABLE_M20_A_TIMEZONE_LISTENER_UNSUB_V1 !== true;
        } catch (_) {
            return true;
        }
    }

    /**
     * Add listener for timezone changes
     */
    addListener(callback) {
        if (typeof callback !== 'function') return;
        m20ATzListenerInsert(this, callback);
    }
    
    /**
     * Remove listener
     */
    removeListener(callback) {
        if (typeof callback !== 'function') return;
        m20ATzListenerRemoveAll(this, callback);
    }

    /**
     * Internal listener census for tests/evidence; immune to public property replacement.
     */
    _m20ATimezoneListenerCensus() {
        return m20ATzListenerCensus(this);
    }

    /**
     * Subscribe to timezone changes with idempotent unsubscribe and optional AbortSignal.
     *
     * M20-A fail-closed signal contract (explicit ATTACHING → LIVE → SETTLED
     * phase machine with a STICKY abort-seen flag):
     * - `options.signal` / `signal.aborted` / add-remove method lookups are all
     *   read defensively; a throwing getter or malformed signal (missing
     *   addEventListener/removeEventListener functions) means NO registration
     *   is performed and a no-op unsubscribe is returned. Nothing throws
     *   outward and no half-registered manager state can remain.
     * - ATTACHING: the abort handler is attached while the manager wrapper is
     *   NOT yet in `this.listeners`. During any hostile user-controlled call
     *   (addEventListener body, method getters, the post-attach `aborted`
     *   recheck getter, reentrant setTimezone) the subscription is completely
     *   invisible to census and notifications, and the callback cannot fire
     *   before subscribe returns. ANY abort dispatch in this phase sets the
     *   sticky `abortSeen` flag and is otherwise inert — the flag can never
     *   be un-set, so a hostile getter that dispatches the retained handler
     *   and then returns false cannot launder the abort away.
     * - The sticky flag is reread after EVERY user-controlled call returns,
     *   before the captured-primordial private-store insertion commit; no
     *   user-controlled code can run between that final gate and insertion.
     *   If the gate trips (or attach threw, or the recheck read true/threw),
     *   the handler is detached fail-soft (contained) and the
     *   registration SETTLES inert with a no-op unsubscribe — never pushed,
     *   never delivered.
     * - LIVE: successful private-store insertion publishes atomically, with
     *   no externally dispatchable operation after the cancellation gate. A
     *   later abort/unsubscribe removes the manager wrapper first and detaches
     *   the abort handler exactly once, then SETTLES.
     * - SETTLED: terminal. A hostile signal that retains the handler can
     *   re-invoke it forever — it is inert in this phase (and inert-sticky in
     *   ATTACHING if registration never committed).
     *
     * @param {function} callback
     * @param {{ signal?: AbortSignal }} [options]
     * @returns {function} unsubscribe (safe to call repeatedly)
     */
    subscribe(callback, options) {
        const noopUnsub = () => {};
        if (typeof callback !== 'function') return noopUnsub;

        let signal = null;
        try {
            signal = options ? options.signal : null;
        } catch (_) {
            return noopUnsub; // throwing options.signal getter → fail closed
        }
        if (signal === undefined) signal = null;
        if (signal !== null) {
            let aborted = false;
            try {
                if (typeof signal.addEventListener !== 'function'
                    || typeof signal.removeEventListener !== 'function') {
                    return noopUnsub; // malformed signal → fail closed, no registration
                }
                aborted = signal.aborted === true;
            } catch (_) {
                return noopUnsub; // throwing aborted getter / method lookup → fail closed
            }
            if (aborted) return noopUnsub;
        }

        if (!this._m20ATimezoneListenerUnsubEnabled()) {
            // Kill mode: same fail-closed signal validation above, then exact
            // legacy registration (no signal attach, trivially opaque);
            // cleanup intentionally no-op.
            this.addListener(callback);
            return noopUnsub;
        }

        // Inert until commit: the wrapper only forwards while active, and it
        // is not pushed into this.listeners until the LIVE transition below.
        const sub = { active: false };
        const wrapper = (tz) => {
            if (sub.active) callback(tz);
        };

        // Explicit attach-phase state machine. ATTACHING covers every
        // user-controlled call before commit; LIVE is the committed
        // registration; SETTLED is terminal (inert forever).
        const ATTACHING = 0, LIVE = 1, SETTLED = 2;
        let phase = ATTACHING;
        let abortSeen = false;    // STICKY: any abort dispatch while ATTACHING
        let abortHandler = null;
        let detached = true;      // becomes false only while a handler may be attached

        // Detach the abort handler at most once; fail-soft — a throwing
        // removeEventListener (or a dispatch fired from a hostile
        // removeEventListener method getter) stays contained; by the time
        // detach runs on a fail path the phase is already SETTLED, so any
        // such dispatch is inert.
        const detachOnce = () => {
            if (detached) return;
            detached = true;
            const h = abortHandler;
            abortHandler = null;
            if (h && signal) {
                try {
                    signal.removeEventListener('abort', h);
                } catch (_) { /* hostile removeEventListener — handler already inert */ }
            }
        };

        const unsubscribe = () => {
            if (phase !== LIVE) return; // inert while ATTACHING and after SETTLED
            phase = SETTLED;
            sub.active = false;
            // Remove the manager wrapper first, then detach exactly once.
            m20ATzListenerRemoveOne(this, wrapper);
            detachOnce();
        };

        // Settle a never-committed registration: mark terminal FIRST so any
        // handler dispatch provoked by the detach itself is inert, then
        // detach fail-soft. Nothing was ever visible in this.listeners.
        const settleInert = () => {
            phase = SETTLED;
            detachOnce();
            return noopUnsub;
        };

        if (signal) {
            // ATTACHING — attach while the wrapper is NOT in this.listeners.
            // Whatever hostile user code runs synchronously (dispatch abort,
            // call setTimezone, inspect the manager), the subscription does
            // not exist yet: census is unchanged and the callback cannot fire.
            abortHandler = () => {
                if (phase === ATTACHING) {
                    abortSeen = true; // STICKY — can never be un-set
                    return;           // inert until (unless) commit
                }
                if (phase === LIVE) unsubscribe();
                // SETTLED → inert
            };
            try {
                detached = false;
                signal.addEventListener('abort', abortHandler, { once: true }); // user code
            } catch (_) {
                return settleInert(); // fail-soft; nothing thrown outward, nothing visible
            }
            // Reread the sticky flag now that the user-controlled attach call
            // has returned; only if still clean, run the post-attach recheck
            // (closes the check→attach race: real AbortSignals never fire
            // listeners added post-abort). The recheck getter is user code
            // and may itself dispatch the retained handler — that sets the
            // sticky flag, which the FINAL gate below rereads.
            let observedAborted = false;
            if (!abortSeen) {
                try {
                    observedAborted = signal.aborted === true; // user code
                } catch (_) {
                    observedAborted = true; // unreadable after attach → fail closed
                }
            }
            // FINAL pre-commit gate — pure local reads. No user-controlled
            // call can run between this check and the captured insertion
            // below, so an
            // abort dispatched inside ANY earlier hostile call (attach body,
            // method getter, recheck getter — even one that then returns
            // false) cannot be lost.
            if (abortSeen || observedAborted) {
                return settleInert(); // never committed: no half-registration, no callback
            }
        }

        // LIVE — commit atomically via captured primordials and private store.
        try {
            m20ATzListenerInsert(this, wrapper);
        } catch (insertionError) {
            phase = SETTLED;
            sub.active = false;
            detachOnce();
            throw insertionError;
        }
        phase = LIVE;
        sub.active = true;
        return unsubscribe;
    }
    
    /**
     * Notify all listeners of a timezone change.
     *
     * M20-A bounded trailing-generation contract:
     * - A notify while another notify is running only sets a pending flag
     *   (coalescing); it never recurses.
     * - Per externally initiated generation, at most NOTIFY_PASS_BUDGET (8)
     *   snapshot passes run. Each pass calls every listener registered at
     *   pass start at most once with the current accepted timezone; listener
     *   throws are contained per callback.
     * - setTimezone rejects reentrant changes once the budget is exhausted
     *   (returns false + warns), so the final pass always delivers the final
     *   accepted timezone — reentrant callbacks cannot livelock, recurse, or
     *   generate unbounded storage writes.
     */
    notifyListeners() {
        if (this._notifyActive) {
            this._notifyPending = true;
            return;
        }
        this._notifyActive = true;
        this._notifyPassCount = 0;
        try {
            do {
                this._notifyPending = false;
                this._notifyPassCount += 1;
                const snapshot = m20ATzListenerSnapshot(this);
                for (let i = 0; i < snapshot.length; i++) {
                    try {
                        snapshot[i](this.currentTimezone);
                    } catch (e) {
                        console.warn('Timezone listener error:', e);
                    }
                }
            } while (this._notifyPending && this._notifyPassCount < this.NOTIFY_PASS_BUDGET);
            if (this._notifyPending) {
                // Only reachable via a direct reentrant notifyListeners() call
                // during the final pass (state changes are already rejected at
                // the budget); the delivered value equals current state, so
                // dropping this redundant trailing request is deterministic.
                console.warn('🌍 Timezone notify coalescing stopped at pass budget', this.NOTIFY_PASS_BUDGET);
            }
        } finally {
            this._notifyActive = false;
            this._notifyPassCount = 0;
            this._notifyPending = false;
        }
    }
}

// Create global instance
window.timezoneManager = new TimezoneManager();
