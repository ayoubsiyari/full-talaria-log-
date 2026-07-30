/**
 * Unified Preferences Sync Manager
 * Handles syncing all user preferences between localStorage and cloud database
 */

class PreferencesSyncManager {
    constructor() {
        this.preferences = null;
        this.syncTimer = null;
        this.pendingUpdates = {};
        this.isLoaded = false;
        // After a 403 subscription gate, stop calling the cloud preferences API
        // this session (prefs still persist to localStorage). Prevents a failed
        // POST on every preference change from flooding the console.
        this._cloudSubscriptionBlocked = false;
        this._cloudSubscriptionNoticeShown = false;
        // PREFS-CLOUD-FAILURE-CAP state (see prefsCloudFailureCapV1Enabled).
        this._cloudFailureCount = 0;
        this._cloudFailureSuspended = false;
        this._cloudFailureNoticeShown = false;
        this._inflightLoad = null;
    }

    /**
     * PREFS-CLOUD-FAILURE-CAP — default ON. Truthy
     * `window.__TALARIA_DISABLE_PREFS_CLOUD_FAILURE_CAP_V1` restores the previous
     * behaviour of calling a broken cloud endpoint again on every load and every
     * flush. Read per call, never sampled at init.
     *
     * Read across realms — own window, then parent, then top. Every multichart
     * panel is its own window and each one runs its own manager, so an operator
     * flipping this switch on the page in front of them (the host) must reach the
     * panels too; a host-only predicate would report itself disabled while the
     * cap stayed active in every panel. An unreadable cross-origin realm carries
     * no instruction for us, so it fails towards the shipped default.
     */
    prefsCloudFailureCapV1Enabled() {
        if (typeof window === 'undefined') return true;
        const killed = (w) => {
            try {
                return !!(w && w.__TALARIA_DISABLE_PREFS_CLOUD_FAILURE_CAP_V1);
            } catch (_e) {
                return false;
            }
        };
        if (killed(window)) return false;
        try {
            const parent = window.parent && window.parent !== window ? window.parent : null;
            if (killed(parent)) return false;
            const top = window.top && window.top !== window && window.top !== parent
                ? window.top
                : null;
            if (killed(top)) return false;
        } catch (_e) {
            // Parent chain unreachable; the own-window read above already stands.
        }
        return true;
    }

    /** True once this realm has given up on the cloud endpoint for this session. */
    _cloudCallsSuspended() {
        if (!this.prefsCloudFailureCapV1Enabled()) return false;
        return this._cloudFailureSuspended === true;
    }

    /**
     * A 5xx or a transport error means the endpoint is broken, not that this
     * caller is wrong, so repeating it cannot succeed. Every panel rebuild used
     * to re-issue the call, which turned one broken endpoint into a request per
     * realm per load and a console full of the same line. Allow a bounded number
     * of attempts, then stop for the session and say so exactly once.
     */
    _noteCloudFailure(detail) {
        this._cloudFailureCount += 1;
        if (this._cloudFailureCount < PreferencesSyncManager.MAX_CLOUD_FAILURES) return;
        this._cloudFailureSuspended = true;
        this.pendingUpdates = {};
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
            this.syncTimer = null;
        }
        if (!this._cloudFailureNoticeShown) {
            this._cloudFailureNoticeShown = true;
            console.warn(
                '⚠️ Cloud preferences unavailable (' + detail
                + ') — saving on this device only for the rest of this session.'
            );
        }
    }

    /** A success means the endpoint is back; the cap must not be sticky. */
    _noteCloudSuccess() {
        this._cloudFailureCount = 0;
        this._cloudFailureSuspended = false;
    }

    /**
     * PINS-USER-PREFS — default ON. Absent / falsy ⇒ pins are user-level
     * preferences; ANY truthy value restores local-only behaviour. Read per call.
     *
     * Truthy, not `=== true`: every runbook and bisect script in this repo flips a
     * switch with `= 1`, and a predicate that only answers to the boolean `true`
     * leaves the fix silently ON for an operator who believes they turned it off.
     */
    pinsUserPreferenceV1Enabled() {
        return typeof window === 'undefined'
            || !window.__TALARIA_DISABLE_PINS_USER_PREFS_V1;
    }

    /**
     * Load all preferences from API (cloud) or localStorage (fallback).
     *
     * Single-flight: several modules call this during boot and each panel boots
     * on its own, so concurrent callers share one request instead of issuing one
     * each. Under the kill-switch this is a straight pass-through.
     */
    async loadPreferences() {
        if (!this.prefsCloudFailureCapV1Enabled()) {
            return this._loadPreferencesOnce();
        }
        if (this._inflightLoad) return this._inflightLoad;
        this._inflightLoad = this._loadPreferencesOnce();
        try {
            return await this._inflightLoad;
        } finally {
            this._inflightLoad = null;
        }
    }

    async _loadPreferencesOnce() {
        try {
            const token = localStorage.getItem('token');
            
            if (token && !this._cloudSubscriptionBlocked && !this._cloudCallsSuspended()) {
                // Try loading from API
                const response = await fetch('/api/chart/preferences', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    credentials: 'include'
                });

                if (response.status === 403) {
                    this._onCloudSubscriptionBlocked();
                } else if (response.status >= 500) {
                    this._noteCloudFailure('HTTP ' + response.status);
                }

                if (response.ok) {
                    this._noteCloudSuccess();
                    const result = await response.json();
                    if (result.success) {
                        const local = this.loadFromLocalStorage();
                        const serverPrefs = result.preferences || {};
                        this.preferences = this.mergeCloudWithLocal(serverPrefs, local);
                        // Keep userStorage keys (e.g. drawingToolStyles) in sync with server truth
                        // so modules that only read userStorage on init see the same data after refresh.
                        this.persistLoadedPreferencesToLocalStorage();
                        this.queueMergedFieldsForSync(serverPrefs, this.preferences);
                        console.log('📥 User preferences loaded from cloud');
                        this.isLoaded = true;
                        return this.preferences;
                    }
                }
            }

            // Fallback to localStorage
            this.preferences = this.loadFromLocalStorage();
            console.log('📥 User preferences loaded from localStorage');
            this.isLoaded = true;
            return this.preferences;

        } catch (error) {
            this._noteCloudFailure((error && error.message) || 'transport error');
            console.warn('⚠️ Error loading preferences from cloud:', error.message);
            this.preferences = this.loadFromLocalStorage();
            this.isLoaded = true;
            return this.preferences;
        }
    }

    /**
     * After a successful GET from /api/chart/preferences, mirror each known field into userStorage
     * using the same paths as saveToLocalStorage (scoped keys, JSON encoding).
     */
    persistLoadedPreferencesToLocalStorage() {
        if (!this.preferences) return;
        const fields = [
            'tool_defaults',
            'timeframe_favorites',
            'drawing_tool_favorites',
            'chart_templates',
            'keyboard_shortcuts',
            'drawing_tool_styles',
            'drawing_tool_templates',
            'indicator_settings_templates',
            'v9_chart_templates',
            'panel_sync_settings',
            'panel_settings',
            'market_config',
            'protection_settings',
            'general_settings',
            'keep_drawing_enabled'
        ];
        for (const f of fields) {
            if (this.preferences[f] === undefined) continue;
            try {
                this.saveToLocalStorage(f, this.preferences[f]);
            } catch (e) {
                console.warn('persistLoadedPreferencesToLocalStorage:', f, e);
            }
        }
    }

    /**
     * Load preferences from localStorage
     */
    loadFromLocalStorage() {
        return {
            tool_defaults: this.getLocalItem('toolDefaults', {}),
            timeframe_favorites: this.getLocalItem('chart_timeframe_favorites', []),
            drawing_tool_favorites: this.getLocalItem('chart_favorite_tools', []),
            chart_templates: this.getLocalItem('chart_user_templates', {}),
            keyboard_shortcuts: this.getLocalItem('chart_custom_shortcuts', {}),
            drawing_tool_styles: this.getLocalItem('drawingToolStyles', {}),
            drawing_tool_templates: this.loadDrawingToolTemplatesLocal(),
            indicator_settings_templates: this.getLocalItem('indicator_settings_templates', {}),
            v9_chart_templates: this.readV9ChartTemplatesLocal(),
            panel_sync_settings: this.getLocalItem('chart_panel_sync_settings', {}),
            panel_settings: this.getAllPanelSettings(),
            market_config: this.getMarketConfig(),
            protection_settings: this.getLocalItem('protectionSettings', []),
            general_settings: this.getLocalItem('talaria_general_settings', {}),
            keep_drawing_enabled: this.getLocalItem('chart_keep_drawing', '0') === '1'
        };
    }

    /**
     * Merge cloud preferences with local-only data so empty server records
     * do not wipe templates that were never synced.
     */
    mergeCloudWithLocal(serverPrefs, localPrefs) {
        const merged = { ...(serverPrefs || {}) };
        const templateFields = ['chart_templates', 'drawing_tool_templates', 'indicator_settings_templates'];
        for (const field of templateFields) {
            merged[field] = this.mergeJsonObjects(
                serverPrefs && serverPrefs[field],
                localPrefs && localPrefs[field]
            );
        }
        merged.v9_chart_templates = this.mergeTemplateArrays(
            serverPrefs && serverPrefs.v9_chart_templates,
            localPrefs && localPrefs.v9_chart_templates
        );
        if (this.pinsUserPreferenceV1Enabled()) {
            merged.timeframe_favorites = this.preferServerArrayUnlessEmpty(
                serverPrefs && serverPrefs.timeframe_favorites,
                localPrefs && localPrefs.timeframe_favorites
            );
            merged.drawing_tool_favorites = this.preferServerArrayUnlessEmpty(
                serverPrefs && serverPrefs.drawing_tool_favorites,
                localPrefs && localPrefs.drawing_tool_favorites
            );
        }
        return merged;
    }

    preferServerArrayUnlessEmpty(serverVal, localVal) {
        const serverArr = Array.isArray(serverVal) ? serverVal : [];
        const localArr = Array.isArray(localVal) ? localVal : [];
        if (serverArr.length > 0) return [...serverArr];
        return [...localArr];
    }

    mergeJsonObjects(serverVal, localVal) {
        const serverObj = (serverVal && typeof serverVal === 'object' && !Array.isArray(serverVal))
            ? serverVal
            : {};
        const localObj = (localVal && typeof localVal === 'object' && !Array.isArray(localVal))
            ? localVal
            : {};

        const serverEmpty = Object.keys(serverObj).length === 0;
        const localEmpty = Object.keys(localObj).length === 0;

        if (serverEmpty && !localEmpty) return { ...localObj };
        if (!serverEmpty && localEmpty) return { ...serverObj };
        if (serverEmpty && localEmpty) return {};
        return { ...serverObj, ...localObj };
    }

    mergeTemplateArrays(serverVal, localVal) {
        const serverArr = Array.isArray(serverVal) ? serverVal : [];
        const localArr = Array.isArray(localVal) ? localVal : [];

        if (serverArr.length === 0 && localArr.length > 0) return [...localArr];
        if (localArr.length === 0 && serverArr.length > 0) return [...serverArr];
        if (serverArr.length === 0 && localArr.length === 0) return [];

        const byName = new Map();
        serverArr.forEach((item) => {
            if (item && typeof item.n === 'string' && item.n.trim()) {
                byName.set(item.n.trim(), item);
            }
        });
        localArr.forEach((item) => {
            if (item && typeof item.n === 'string' && item.n.trim()) {
                byName.set(item.n.trim(), item);
            }
        });
        return Array.from(byName.values());
    }

    queueMergedFieldsForSync(serverPrefs, mergedPrefs) {
        const fields = [
            'timeframe_favorites',
            'drawing_tool_favorites',
            'chart_templates',
            'drawing_tool_templates',
            'indicator_settings_templates',
            'v9_chart_templates',
        ];
        for (const field of fields) {
            const serverVal = (serverPrefs && serverPrefs[field]) || {};
            const mergedVal = (mergedPrefs && mergedPrefs[field]) || {};
            try {
                if (JSON.stringify(serverVal) !== JSON.stringify(mergedVal)) {
                    this.pendingUpdates[field] = mergedVal;
                }
            } catch (e) {
                this.pendingUpdates[field] = mergedVal;
            }
        }
        if (Object.keys(this.pendingUpdates).length > 0) {
            this.scheduleSyncToAPI();
        }
    }

    /**
     * Load per-tool drawing templates from aggregated cache or legacy keys.
     */
    loadDrawingToolTemplatesLocal() {
        const aggregated = this.getLocalItem('drawing_tool_templates', null);
        if (aggregated && typeof aggregated === 'object' && !Array.isArray(aggregated)) {
            const keys = Object.keys(aggregated);
            if (keys.length > 0) return aggregated;
        }
        return this.scanLegacyDrawingToolTemplates();
    }

    scanLegacyDrawingToolTemplates() {
        const result = {};
        try {
            if (typeof localStorage === 'undefined') return result;
            for (let i = 0; i < localStorage.length; i++) {
                const storageKey = localStorage.key(i);
                if (!storageKey) continue;
                const match = storageKey.match(/(?:^u\d+_)?drawing_templates_(.+)$/);
                if (!match) continue;
                const toolType = match[1];
                const raw = localStorage.getItem(storageKey);
                if (!raw) continue;
                try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        result[toolType] = parsed;
                    }
                } catch (e) { /* ignore malformed */ }
            }
        } catch (e) { /* ignore */ }
        return result;
    }

    readV9ChartTemplatesLocal() {
        try {
            const raw = userStorage.getItem('v9CustomChartTemplates');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Get item from localStorage with default value
     */
    getLocalItem(key, defaultValue) {
        try {
            const item = userStorage.getItem(key);
            if (!item) return defaultValue;
            return JSON.parse(item);
        } catch (e) {
            return defaultValue;
        }
    }

    /**
     * Get all panel settings from localStorage
     */
    getAllPanelSettings() {
        const panelSettings = {};
        for (let i = 0; i < 10; i++) {
            const key = `chart_panel_${i}_settings`;
            const settings = this.getLocalItem(key, null);
            if (settings) {
                panelSettings[i] = settings;
            }
        }
        return panelSettings;
    }

    /**
     * Get market configuration from localStorage
     */
    getMarketConfig() {
        return {
            marketType: userStorage.getItem('chart_marketType') || 'forex',
            pipSize: userStorage.getItem('chart_pipSize') || '0.0001',
            pipValuePerLot: userStorage.getItem('chart_pipValuePerLot') || '10'
        };
    }

    /**
     * Update a specific preference field
     */
    updatePreference(field, value) {
        if (!this.preferences) {
            this.preferences = {};
        }
        
        this.preferences[field] = value;
        this.pendingUpdates[field] = value;

        // Save to localStorage immediately
        this.saveToLocalStorage(field, value);

        // Schedule cloud sync (debounced)
        this.scheduleSyncToAPI();
    }

    /**
     * Save to localStorage immediately
     */
    saveToLocalStorage(field, value) {
        try {
            switch (field) {
                case 'tool_defaults':
                    userStorage.setItem('toolDefaults', JSON.stringify(value));
                    break;
                case 'timeframe_favorites':
                    userStorage.setItem('chart_timeframe_favorites', JSON.stringify(value));
                    break;
                case 'drawing_tool_favorites':
                    userStorage.setItem('chart_favorite_tools', JSON.stringify(value || []));
                    break;
                case 'chart_templates':
                    userStorage.setItem('chart_user_templates', JSON.stringify(value));
                    break;
                case 'keyboard_shortcuts':
                    userStorage.setItem('chart_custom_shortcuts', JSON.stringify(value));
                    break;
                case 'drawing_tool_styles':
                    userStorage.setItem('drawingToolStyles', JSON.stringify(value));
                    break;
                case 'drawing_tool_templates':
                    userStorage.setItem('drawing_tool_templates', JSON.stringify(value || {}));
                    if (value && typeof value === 'object') {
                        Object.keys(value).forEach((toolType) => {
                            userStorage.setItem(
                                `drawing_templates_${toolType}`,
                                JSON.stringify(value[toolType] || [])
                            );
                        });
                    }
                    break;
                case 'indicator_settings_templates':
                    userStorage.setItem('indicator_settings_templates', JSON.stringify(value || {}));
                    break;
                case 'v9_chart_templates':
                    userStorage.setItem('v9CustomChartTemplates', JSON.stringify(value || []));
                    break;
                case 'panel_sync_settings':
                    userStorage.setItem('chart_panel_sync_settings', JSON.stringify(value));
                    break;
                case 'panel_settings':
                    Object.keys(value).forEach(panelIndex => {
                        userStorage.setItem(`chart_panel_${panelIndex}_settings`, JSON.stringify(value[panelIndex]));
                    });
                    break;
                case 'market_config':
                    if (value.marketType) userStorage.setItem('chart_marketType', value.marketType);
                    if (value.pipSize) userStorage.setItem('chart_pipSize', value.pipSize);
                    if (value.pipValuePerLot) userStorage.setItem('chart_pipValuePerLot', value.pipValuePerLot);
                    break;
                case 'protection_settings':
                    userStorage.setItem('protectionSettings', JSON.stringify(value));
                    break;
                case 'general_settings':
                    userStorage.setItem('talaria_general_settings', JSON.stringify(value));
                    break;
                case 'keep_drawing_enabled':
                    userStorage.setItem('chart_keep_drawing', value ? '1' : '0');
                    break;
            }
        } catch (e) {
            console.warn('Failed to save to localStorage:', e);
        }
    }

    /**
     * Schedule API sync with debouncing
     */
    scheduleSyncToAPI() {
        if (this._cloudSubscriptionBlocked) return;
        if (this._cloudCallsSuspended()) return;
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
        }

        this.syncTimer = setTimeout(() => {
            this.syncToAPI();
        }, 2000); // 2 second debounce
    }

    /**
     * Sync pending updates to API
     */
    async syncToAPI() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                console.log('⚠️ Not authenticated - preferences saved locally only');
                this.pendingUpdates = {};
                return;
            }
            if (this._cloudSubscriptionBlocked) {
                // Subscription gate hit earlier this session — keep local only.
                this.pendingUpdates = {};
                return;
            }
            if (this._cloudCallsSuspended()) {
                // Endpoint answered 5xx past the cap — keep local only.
                this.pendingUpdates = {};
                return;
            }

            if (Object.keys(this.pendingUpdates).length === 0) {
                return;
            }

            const response = await fetch('/api/chart/preferences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body: JSON.stringify(this.pendingUpdates)
            });

            if (response.ok) {
                this._noteCloudSuccess();
                const result = await response.json();
                console.log('✅ Preferences synced to cloud');
                this.pendingUpdates = {};
            } else if (response.status === 401) {
                console.warn('⚠️ Not authenticated - preferences saved locally only');
                this.pendingUpdates = {};
            } else if (response.status === 403) {
                this._onCloudSubscriptionBlocked();
            } else {
                if (response.status >= 500) {
                    this._noteCloudFailure('HTTP ' + response.status);
                }
                console.warn('⚠️ Failed to sync preferences to cloud:', response.statusText);
            }
        } catch (error) {
            this._noteCloudFailure((error && error.message) || 'transport error');
            console.warn('⚠️ Error syncing preferences to cloud:', error.message);
        }
    }

    /**
     * 403 subscription gate on the cloud preferences API — stop syncing this
     * session (localStorage keeps working) so we don't re-POST on every change.
     */
    _onCloudSubscriptionBlocked() {
        this._cloudSubscriptionBlocked = true;
        this.pendingUpdates = {};
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
            this.syncTimer = null;
        }
        if (!this._cloudSubscriptionNoticeShown) {
            this._cloudSubscriptionNoticeShown = true;
            console.info('ℹ️ Preferences are saved on this device — cloud sync needs an active subscription.');
        }
    }

    /**
     * Get a specific preference value
     */
    get(field, defaultValue = null) {
        if (!this.preferences) {
            return defaultValue;
        }
        return this.preferences[field] !== undefined ? this.preferences[field] : defaultValue;
    }

    /**
     * Check if preferences are loaded
     */
    isReady() {
        return this.isLoaded;
    }
}

/**
 * Attempts this realm will make against a failing cloud endpoint before it stops
 * for the session. Two, not one: a single transient 5xx should not cost a user
 * their cloud sync, and two failures is already proof the endpoint is not well.
 */
PreferencesSyncManager.MAX_CLOUD_FAILURES = 2;

// Create global instance
window.preferencesSync = new PreferencesSyncManager();

/* -----------------------------------------------------------------------------
 * Owner-scoped pin preferences - window.TalariaPreferences (schema v1)
 *
 * Tiers are user, workspace, and session. Read precedence is session >
 * workspace > user > defaults; if a key exists at more than one tier, the
 * highest valid tier wins. Writes are per key and target only the selected tier.
 * Reads fail open and never write. Writes fail safe. Schema metadata is stamped
 * lazily only after a real preference write/reconcile succeeds.
 * -------------------------------------------------------------------------- */
(function () {
    var SCHEMA_VERSION = 1;
    var RESET_PARAM = 'talPrefReset';
    var PREFIX = 'pref.v1.owner.';
    var TIER_USER = 'user';
    var TIER_WORKSPACE = 'workspace';
    var TIER_SESSION = 'session';
    var READ_PRECEDENCE = [TIER_SESSION, TIER_WORKSPACE, TIER_USER];
    var KEY_PINS_TIMEFRAMES = 'pref.v1.pins.timeframes';
    var KEY_PINS_TOOLS = 'pref.v1.pins.tools';
    var KEY_PINBAR_OPEN = 'pref.v1.pinbar.open';
    var KEY_PINBAR_POS = 'pref.v1.pinbar.pos';
    var KEY_SCHEMA_VERSION = 'pref.v1.meta.schemaVersion';
    var KEY_UPDATED_PREFIX = 'pref.v1.meta.updated.';
    var MAX_LIST_ITEMS = 64;
    var MAX_ID_LENGTH = 80;
    var MAX_LIST_BYTES = 4096;
    var MAX_POS_MEMBERS = 24;
    var MAX_POS_BYTES = 2048;
    var OWNER_POLL_MS = 200;
    var OWNER_POLL_MAX = 75;
    var PIN_KEYS = {
        timeframes: KEY_PINS_TIMEFRAMES,
        tools: KEY_PINS_TOOLS,
        barOpen: KEY_PINBAR_OPEN,
        open: KEY_PINBAR_OPEN,
        barPos: KEY_PINBAR_POS,
        pos: KEY_PINBAR_POS
    };
    var pendingOps = [];
    var cloudRecords = [];
    var ownerTimer = null;
    var ownerWaiters = [];
    var resetHandled = false;

    function isDisabled() {
        return window.__TALARIA_DISABLE_PREF_OWNER_SCOPED_PINS_V1 === true
            || window.__TALARIA_DISABLE_PREF_OWNER_SCOPED_PINS_V1 === '1';
    }

    function storage() {
        var s = window.localStorage || window.userStorage;
        if (!s || typeof s.getItem !== 'function' || typeof s.setItem !== 'function') return null;
        return s;
    }

    function validId(value) {
        if (value === null || value === undefined) return null;
        var text = String(value).trim();
        return text === '' ? null : text;
    }

    function ownerId(options) {
        if (options && Object.prototype.hasOwnProperty.call(options, 'ownerId')) return validId(options.ownerId);
        var id = window.__talariaUserId;
        if (validId(id) === null) {
            try { id = window.localStorage && window.localStorage.getItem('_uid'); } catch (e) { id = null; }
        }
        return validId(id);
    }

    function workspaceId(options) {
        var id = options && Object.prototype.hasOwnProperty.call(options, 'workspaceId') ? options.workspaceId : window.__talariaWorkspaceId;
        if (validId(id) === null) {
            try { id = window.localStorage && window.localStorage.getItem('talaria.workspaceId'); } catch (e) { id = null; }
        }
        return validId(id);
    }

    function sessionId(options) {
        var id = options && Object.prototype.hasOwnProperty.call(options, 'sessionId') ? options.sessionId : window.__talariaSessionId;
        if (validId(id) !== null) return validId(id);
        try {
            var search = (window.location && window.location.search) || '';
            var params = typeof URLSearchParams === 'function' ? new URLSearchParams(search) : null;
            id = params ? (params.get('sessionId') || params.get('sid')) : null;
        } catch (e) { id = null; }
        return validId(id);
    }

    function ownerReady(options) { return ownerId(options) !== null; }

    function tierOf(options) {
        var tier = options && options.tier;
        if (tier === TIER_WORKSPACE || tier === 'per-workspace') return TIER_WORKSPACE;
        if (tier === TIER_SESSION || tier === 'per-session') return TIER_SESSION;
        return TIER_USER;
    }

    function scopeIdForTier(tier, options) {
        if (tier === TIER_USER) return 'user';
        if (tier === TIER_WORKSPACE) return workspaceId(options);
        if (tier === TIER_SESSION) return sessionId(options);
        return null;
    }

    function ownerToken(owner) { return encodeURIComponent(owner); }
    function scopeToken(scopeId) { return encodeURIComponent(scopeId); }
    function storageKey(owner, tier, scopeId, key) {
        return PREFIX + ownerToken(owner) + '.' + tier + '.' + scopeToken(scopeId) + '.' + key;
    }
    function updatedKey(key) { return KEY_UPDATED_PREFIX + key; }

    function resolveKey(name) {
        if (typeof name !== 'string') return null;
        var n = name.trim();
        if (Object.prototype.hasOwnProperty.call(PIN_KEYS, n)) return PIN_KEYS[n];
        for (var alias in PIN_KEYS) {
            if (Object.prototype.hasOwnProperty.call(PIN_KEYS, alias) && PIN_KEYS[alias] === n) return n;
        }
        return null;
    }

    function readRawByParts(owner, tier, scopeId, key) {
        var s = storage();
        if (!s || validId(owner) === null || validId(scopeId) === null) return null;
        try {
            var raw = s.getItem(storageKey(owner, tier, scopeId, key));
            return raw === undefined ? null : raw;
        } catch (e) { return null; }
    }

    function writeRawByParts(owner, tier, scopeId, key, raw) {
        var s = storage();
        if (!s || validId(owner) === null || validId(scopeId) === null) return false;
        try {
            s.setItem(storageKey(owner, tier, scopeId, key), String(raw));
            return true;
        } catch (e) {
            console.warn('TalariaPreferences: failed to save pin preference key:', key, e && e.name);
            return false;
        }
    }

    function removeRawByParts(owner, tier, scopeId, key) {
        var s = storage();
        if (!s || typeof s.removeItem !== 'function' || validId(owner) === null || validId(scopeId) === null) return false;
        try {
            s.removeItem(storageKey(owner, tier, scopeId, key));
            return true;
        } catch (e) { return false; }
    }

    function isVersionAtLeast(raw, minVersionText) {
        if (typeof raw !== 'string') return false;
        var v = raw.trim();
        if (!/^(0|[1-9][0-9]*)$/.test(v)) return false;
        var min = String(minVersionText);
        while (v.length > 1 && v.charAt(0) === '0') v = v.slice(1);
        while (min.length > 1 && min.charAt(0) === '0') min = min.slice(1);
        if (v.length !== min.length) return v.length > min.length;
        return v >= min;
    }

    function ensureSchemaVersion(owner, tier, scopeId) {
        var existing = readRawByParts(owner, tier, scopeId, KEY_SCHEMA_VERSION);
        if (isVersionAtLeast(existing, String(SCHEMA_VERSION))) return true;
        return writeRawByParts(owner, tier, scopeId, KEY_SCHEMA_VERSION, String(SCHEMA_VERSION));
    }

    function readStoredJson(owner, tier, scopeId, key, fallback) {
        var raw = readRawByParts(owner, tier, scopeId, key);
        if (raw === null || raw === '') return fallback;
        try {
            var parsed = JSON.parse(raw);
            return parsed === undefined || parsed === null ? fallback : parsed;
        } catch (e) { return fallback; }
    }

    function readUpdatedAt(owner, tier, scopeId, key) {
        var raw = readRawByParts(owner, tier, scopeId, updatedKey(key));
        if (typeof raw !== 'string' || !/^(0|[1-9][0-9]*)$/.test(raw.trim())) return '0';
        return raw.trim();
    }

    function newerOrSame(a, b) {
        var left = String(a || '0');
        var right = String(b || '0');
        while (left.length > 1 && left.charAt(0) === '0') left = left.slice(1);
        while (right.length > 1 && right.charAt(0) === '0') right = right.slice(1);
        if (left.length !== right.length) return left.length > right.length;
        return left >= right;
    }

    function isScalar(v) {
        if (typeof v === 'number') return isFinite(v);
        if (typeof v === 'boolean') return true;
        if (typeof v === 'string') return v.length <= MAX_ID_LENGTH;
        return false;
    }

    function sanitizeIdList(value) {
        if (!Array.isArray(value)) return null;
        var out = [];
        for (var i = 0; i < value.length && out.length < MAX_LIST_ITEMS; i++) {
            var id = value[i];
            if (typeof id !== 'string') continue;
            id = id.trim();
            if (id === '' || id.length > MAX_ID_LENGTH) continue;
            if (out.indexOf(id) === -1) out.push(id);
        }
        return out;
    }

    function mergePosition(owner, tier, scopeId, value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        var merged = {};
        var stored = readStoredJson(owner, tier, scopeId, KEY_PINBAR_POS, null);
        var k;
        if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
            for (k in stored) {
                if (Object.prototype.hasOwnProperty.call(stored, k)) merged[k] = stored[k];
            }
        }
        for (k in value) {
            if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
            if (k.length > MAX_ID_LENGTH || !isScalar(value[k])) return null;
            merged[k] = value[k];
        }
        var count = 0;
        for (k in merged) {
            if (Object.prototype.hasOwnProperty.call(merged, k)) count++;
        }
        return count > MAX_POS_MEMBERS ? null : merged;
    }

    function encodeFor(owner, tier, scopeId, key, value) {
        var encoded;
        if (key === KEY_PINS_TIMEFRAMES || key === KEY_PINS_TOOLS) {
            var list = sanitizeIdList(value);
            if (!list) return null;
            encoded = JSON.stringify(list);
            return encoded.length > MAX_LIST_BYTES ? null : encoded;
        }
        if (key === KEY_PINBAR_OPEN) {
            if (value !== true && value !== false) return null;
            return value ? 'true' : 'false';
        }
        if (key === KEY_PINBAR_POS) {
            var merged = mergePosition(owner, tier, scopeId, value);
            if (!merged) return null;
            encoded = JSON.stringify(merged);
            return encoded.length > MAX_POS_BYTES ? null : encoded;
        }
        return null;
    }

    function decodeKeyValue(key, raw, fallback) {
        if (raw === null || raw === '') return fallback;
        try {
            var parsed = JSON.parse(raw);
            if (key === KEY_PINS_TIMEFRAMES || key === KEY_PINS_TOOLS) {
                var list = sanitizeIdList(parsed);
                return list ? list : fallback;
            }
            if (key === KEY_PINBAR_OPEN) return parsed === true || parsed === 'true' || parsed === 1 || parsed === '1';
            if (key === KEY_PINBAR_POS) return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
        } catch (e) { /* fail open */ }
        return fallback;
    }

    function readResolvedRaw(key, options) {
        var owner = ownerId(options);
        if (owner === null) return null;
        var specificTier = options && options.tier ? tierOf(options) : null;
        var tiers = specificTier ? [specificTier] : READ_PRECEDENCE;
        for (var i = 0; i < tiers.length; i++) {
            var tier = tiers[i];
            var scopeId = scopeIdForTier(tier, options);
            if (scopeId === null) continue;
            var raw = readRawByParts(owner, tier, scopeId, key);
            if (raw !== null && raw !== '') return raw;
        }
        return null;
    }

    function commitWrite(owner, tier, scopeId, key, value, updatedAt, fromCloud) {
        var encoded = encodeFor(owner, tier, scopeId, key, value);
        if (encoded === null) return false;
        if (!writeRawByParts(owner, tier, scopeId, key, encoded)) return false;
        if (!ensureSchemaVersion(owner, tier, scopeId)) {
            removeRawByParts(owner, tier, scopeId, key);
            return false;
        }
        var stamp = String(updatedAt || Date.now());
        writeRawByParts(owner, tier, scopeId, updatedKey(key), stamp);
        if (!fromCloud) {
            cloudRecords.push({ ownerId: owner, tier: tier, scopeId: scopeId, key: key, value: JSON.parse(encoded), schemaVersion: SCHEMA_VERSION, updatedAt: stamp });
        }
        return true;
    }

    function pendingKeys() {
        var keys = [];
        for (var i = 0; i < pendingOps.length; i++) keys.push(pendingOps[i].key);
        return keys;
    }

    function stopOwnerWatch() {
        if (ownerTimer !== null) {
            clearInterval(ownerTimer);
            ownerTimer = null;
        }
    }

    function notifyWaiters(resolved) {
        var waiters = ownerWaiters;
        ownerWaiters = [];
        for (var i = 0; i < waiters.length; i++) {
            try { waiters[i](resolved); } catch (e) { /* ignore */ }
        }
    }

    function drainPending() {
        if (isDisabled()) {
            pendingOps = [];
            notifyWaiters(false);
            return false;
        }
        var resolvedOwnerId = ownerId();
        if (resolvedOwnerId === null) return false;
        var remaining = [];
        for (var i = 0; i < pendingOps.length; i++) {
            var op = pendingOps[i];
            if (op.ownerId === null || op.ownerId !== resolvedOwnerId) {
                continue;
            }
            if (op.kind === 'reset') resetNow({ ownerId: op.ownerId, tier: op.tier, workspaceId: op.workspaceId, sessionId: op.sessionId });
            else commitWrite(op.ownerId, op.tier, op.scopeId, op.key, op.value);
        }
        pendingOps = remaining;
        notifyWaiters(true);
        return true;
    }

    function startOwnerWatch() {
        if (isDisabled() || ownerTimer !== null) return;
        var attempts = 0;
        try {
            ownerTimer = setInterval(function () {
                attempts++;
                if (ownerReady()) {
                    stopOwnerWatch();
                    drainPending();
                } else if (attempts >= OWNER_POLL_MAX) {
                    stopOwnerWatch();
                    pendingOps = [];
                    notifyWaiters(false);
                }
            }, OWNER_POLL_MS);
        } catch (e) { ownerTimer = null; }
    }

    function setPin(name, value, options) {
        if (isDisabled()) return false;
        var key = resolveKey(name);
        if (!key || value === undefined || value === null) return false;
        var tier = tierOf(options);
        var scopeId = scopeIdForTier(tier, options);
        if (scopeId === null) return false;
        var owner = ownerId(options);
        if (owner === null && options && Object.prototype.hasOwnProperty.call(options, 'ownerId')) return false;
        if (owner === null) {
            pendingOps.push({ kind: 'write', key: key, value: value, tier: tier, scopeId: scopeId, ownerId: validId(options && options.ownerId), workspaceId: options && options.workspaceId, sessionId: options && options.sessionId });
            startOwnerWatch();
            return true;
        }
        return commitWrite(owner, tier, scopeId, key, value);
    }

    function getPins(options) {
        var pins = { timeframes: [], tools: [], barOpen: false, barPos: null };
        if (isDisabled()) return pins;
        var tf = decodeKeyValue(KEY_PINS_TIMEFRAMES, readResolvedRaw(KEY_PINS_TIMEFRAMES, options), pins.timeframes);
        var tools = decodeKeyValue(KEY_PINS_TOOLS, readResolvedRaw(KEY_PINS_TOOLS, options), pins.tools);
        pins.timeframes = Array.isArray(tf) ? tf : pins.timeframes;
        pins.tools = Array.isArray(tools) ? tools : pins.tools;
        pins.barOpen = decodeKeyValue(KEY_PINBAR_OPEN, readResolvedRaw(KEY_PINBAR_OPEN, options), pins.barOpen) === true;
        pins.barPos = decodeKeyValue(KEY_PINBAR_POS, readResolvedRaw(KEY_PINBAR_POS, options), pins.barPos);
        return pins;
    }

    function getPin(name, options) {
        var key = resolveKey(name);
        var pins = getPins(options);
        if (key === KEY_PINS_TIMEFRAMES) return pins.timeframes;
        if (key === KEY_PINS_TOOLS) return pins.tools;
        if (key === KEY_PINBAR_OPEN) return pins.barOpen;
        if (key === KEY_PINBAR_POS) return pins.barPos;
        return null;
    }

    function getItem(key, options) {
        if (isDisabled()) return null;
        var resolved = (typeof key === 'string' && key.trim() === KEY_SCHEMA_VERSION) ? KEY_SCHEMA_VERSION : resolveKey(key);
        if (!resolved) return null;
        return readResolvedRaw(resolved, options);
    }

    function setItem(key, raw, options) {
        if (isDisabled()) return false;
        var resolved = resolveKey(key);
        if (!resolved) return false;
        var value = raw;
        if (typeof raw === 'string') {
            try { value = JSON.parse(raw); } catch (e) { return false; }
        }
        return setPin(resolved, value, options);
    }

    function resetNow(options) {
        var owner = ownerId(options);
        if (owner === null) return false;
        var tiers = options && options.tier ? [tierOf(options)] : [TIER_USER, TIER_WORKSPACE, TIER_SESSION];
        var keys = [KEY_PINS_TIMEFRAMES, KEY_PINS_TOOLS, KEY_PINBAR_OPEN, KEY_PINBAR_POS, KEY_SCHEMA_VERSION];
        for (var i = 0; i < tiers.length; i++) {
            var tier = tiers[i];
            var scopeId = scopeIdForTier(tier, options);
            if (scopeId === null) continue;
            for (var j = 0; j < keys.length; j++) removeRawByParts(owner, tier, scopeId, keys[j]);
            for (var k = 0; k < 4; k++) removeRawByParts(owner, tier, scopeId, updatedKey(keys[k]));
        }
        return true;
    }

    function reset(options) {
        if (isDisabled()) return false;
        var owner = ownerId(options);
        if (owner === null && options && Object.prototype.hasOwnProperty.call(options, 'ownerId')) return false;
        if (owner === null) {
            pendingOps.push({ kind: 'reset', tier: tierOf(options), ownerId: validId(options && options.ownerId), workspaceId: options && options.workspaceId, sessionId: options && options.sessionId });
            startOwnerWatch();
            return false;
        }
        pendingOps = [];
        return resetNow(options);
    }

    function reconcileCloud(records) {
        if (isDisabled() || !Array.isArray(records)) return { applied: 0, skipped: 0 };
        var applied = 0;
        var skipped = 0;
        for (var i = 0; i < records.length; i++) {
            var r = records[i] || {};
            var owner = validId(r.ownerId);
            var tier = tierOf({ tier: r.tier });
            var scopeId = validId(r.scopeId);
            var key = resolveKey(r.key);
            if (owner === null || scopeId === null || !key || !isVersionAtLeast(String(r.schemaVersion || ''), String(SCHEMA_VERSION))) {
                skipped++;
                continue;
            }
            var cloudStamp = String(r.updatedAt || '0');
            var localStamp = readUpdatedAt(owner, tier, scopeId, key);
            if (!newerOrSame(cloudStamp, localStamp)) {
                skipped++;
                continue;
            }
            if (commitWrite(owner, tier, scopeId, key, r.value, cloudStamp, true)) applied++;
            else skipped++;
        }
        return { applied: applied, skipped: skipped };
    }

    function resetRequested() {
        try {
            var search = (window.location && window.location.search) || '';
            if (!search) return false;
            if (typeof URLSearchParams === 'function') return new URLSearchParams(search).get(RESET_PARAM) === '1';
            return new RegExp('[?&]' + RESET_PARAM + '=1(?:&|$)').test(search);
        } catch (e) { return false; }
    }

    function init() {
        if (isDisabled()) return false;
        if (!resetHandled && resetRequested()) {
            resetHandled = true;
            reset();
        }
        if (ownerReady() && pendingOps.length > 0) drainPending();
        else if (!ownerReady() && pendingOps.length > 0) startOwnerWatch();
        return true;
    }

    window.TalariaPreferences = {
        SCHEMA_VERSION: SCHEMA_VERSION,
        TIERS: { user: TIER_USER, workspace: TIER_WORKSPACE, session: TIER_SESSION },
        PRECEDENCE: READ_PRECEDENCE.slice(),
        KEYS: { timeframes: KEY_PINS_TIMEFRAMES, tools: KEY_PINS_TOOLS, barOpen: KEY_PINBAR_OPEN, barPos: KEY_PINBAR_POS, schemaVersion: KEY_SCHEMA_VERSION },
        isEnabled: function () { return !isDisabled(); },
        isOwnerReady: function (options) { return !isDisabled() && ownerReady(options); },
        ownerId: function (options) { return isDisabled() ? null : ownerId(options); },
        whenOwnerReady: function (callback) {
            if (typeof callback !== 'function') return false;
            if (isDisabled()) {
                try { callback(false); } catch (e) { /* ignore */ }
                return false;
            }
            if (ownerReady()) {
                try { callback(true); } catch (e) { /* ignore */ }
                return true;
            }
            ownerWaiters.push(callback);
            startOwnerWatch();
            return false;
        },
        pendingPinKeys: pendingKeys,
        getPins: getPins,
        getPin: getPin,
        setPin: setPin,
        getItem: getItem,
        setItem: setItem,
        reset: reset,
        reconcileCloud: reconcileCloud,
        cloudQueue: function () { return cloudRecords.slice(); },
        clearCloudQueue: function () { cloudRecords = []; },
        init: init
    };

    if (!isDisabled()) {
        window.__TALARIA_PREF_SCHEMA_VERSION = SCHEMA_VERSION;
        init();
    }
})();
