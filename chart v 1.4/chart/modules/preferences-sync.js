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
    }

    /**
     * Load all preferences from API (cloud) or localStorage (fallback)
     */
    async loadPreferences() {
        try {
            const token = localStorage.getItem('token');
            
            if (token && !this._cloudSubscriptionBlocked) {
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
                }

                if (response.ok) {
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
        return merged;
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
                const result = await response.json();
                console.log('✅ Preferences synced to cloud');
                this.pendingUpdates = {};
            } else if (response.status === 401) {
                console.warn('⚠️ Not authenticated - preferences saved locally only');
                this.pendingUpdates = {};
            } else if (response.status === 403) {
                this._onCloudSubscriptionBlocked();
            } else {
                console.warn('⚠️ Failed to sync preferences to cloud:', response.statusText);
            }
        } catch (error) {
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

// Create global instance
window.preferencesSync = new PreferencesSyncManager();

/* ──────────────────────────────────────────────────────────────────────────────
 * Owner-scoped pin preferences — window.TalariaPreferences (schema v1)
 *
 * Storage contract for the pin state (pinned timeframes, pinned tools, pin-bar
 * open flag and pin-bar position). These four keys are LOCAL-ONLY: the cloud
 * API (/api/chart/preferences) has no column for them, so they are never put
 * into PreferencesSyncManager.pendingUpdates and are never POSTed. Nothing
 * above this comment is aware of them.
 *
 *   pref.v1.pins.timeframes      JSON array of short string ids
 *   pref.v1.pins.tools           JSON array of short string ids
 *   pref.v1.pinbar.open          JSON boolean
 *   pref.v1.pinbar.pos           small flat object of scalars
 *   pref.v1.meta.schemaVersion   integer, monotonic, never downgraded
 *
 * Each key is read and written independently (last-write-wins per key), because
 * panels are same-origin iframes and therefore concurrent writers of the same
 * localStorage exist by construction. There is deliberately no aggregate blob.
 *
 * Two equivalent call shapes, both per-key:
 *   getPins() -> { timeframes, tools, barOpen, barPos }   setPin(name, value)
 *   getItem(key) -> JSON text | null                      setItem(key, jsonText)
 *
 * Keys are passed to userStorage WITHOUT an account id: userStorage/userKey
 * already apply owner scoping. Because userKey() silently falls back to a BARE
 * unscoped key while the owner id is still unknown (it is set from an async
 * /api/auth/me), every access here is owner-gated: reads return defaults and
 * touch no storage, writes are queued per key until the owner resolves.
 *
 * Kill switch: with window.__TALARIA_DISABLE_PREF_OWNER_SCOPED_PINS_V1 === true
 * this whole block is inert — no reads, no writes, no timers, no reset, no
 * schema stamp, and window.__TALARIA_PREF_SCHEMA_VERSION is left undefined.
 * ────────────────────────────────────────────────────────────────────────────── */
(function () {
    var SCHEMA_VERSION = 1;
    var RESET_PARAM = 'talPrefReset';

    var KEY_PINS_TIMEFRAMES = 'pref.v1.pins.timeframes';
    var KEY_PINS_TOOLS = 'pref.v1.pins.tools';
    var KEY_PINBAR_OPEN = 'pref.v1.pinbar.open';
    var KEY_PINBAR_POS = 'pref.v1.pinbar.pos';
    var KEY_SCHEMA_VERSION = 'pref.v1.meta.schemaVersion';

    // Pin name (as used by setPin/getPins) -> storage key. The raw storage key
    // is also accepted by setPin, so callers may use either spelling.
    var PIN_KEYS = {
        timeframes: KEY_PINS_TIMEFRAMES,
        tools: KEY_PINS_TOOLS,
        barOpen: KEY_PINBAR_OPEN,
        open: KEY_PINBAR_OPEN,
        barPos: KEY_PINBAR_POS,
        pos: KEY_PINBAR_POS
    };

    // Bounds: pin values are id lists and one small position object.
    var MAX_LIST_ITEMS = 64;
    var MAX_ID_LENGTH = 40;
    var MAX_LIST_BYTES = 4096;
    var MAX_POS_MEMBERS = 24;
    var MAX_POS_BYTES = 2048;

    // Owner readiness poll. Only started when there is something to do.
    var OWNER_POLL_MS = 200;
    var OWNER_POLL_MAX = 75; // ~15s, then pending writes are dropped

    var pendingWrites = {};
    var pendingReset = false;
    var ownerTimer = null;
    var ownerWaiters = [];
    var schemaStamped = false;
    var resetHandled = false;
    var resetPerformed = false;

    function isDisabled() {
        return window.__TALARIA_DISABLE_PREF_OWNER_SCOPED_PINS_V1 === true;
    }

    function storage() {
        var s = window.userStorage;
        if (!s || typeof s.getItem !== 'function' || typeof s.setItem !== 'function') return null;
        return s;
    }

    /**
     * Resolved owner id, or null while it is still unknown. Never logged.
     */
    function ownerId() {
        var id = window.__talariaUserId;
        if (id === undefined || id === null || id === '') {
            try { id = localStorage.getItem('_uid'); } catch (e) { id = null; }
        }
        if (id === undefined || id === null || id === '') return null;
        return String(id);
    }

    function ownerReady() {
        return ownerId() !== null;
    }

    function resolveKey(name) {
        if (typeof name !== 'string') return null;
        var n = name.trim();
        if (Object.prototype.hasOwnProperty.call(PIN_KEYS, n)) return PIN_KEYS[n];
        for (var alias in PIN_KEYS) {
            if (Object.prototype.hasOwnProperty.call(PIN_KEYS, alias) && PIN_KEYS[alias] === n) return n;
        }
        return null;
    }

    function readRaw(key) {
        var s = storage();
        if (!s) return null;
        try {
            var raw = s.getItem(key);
            return (raw === undefined) ? null : raw;
        } catch (e) {
            return null;
        }
    }

    function writeRaw(key, raw) {
        var s = storage();
        if (!s) {
            console.warn('⚠️ TalariaPreferences: no userStorage, pin key not saved:', key);
            return false;
        }
        try {
            s.setItem(key, raw);
            return true;
        } catch (e) {
            // Fail-safe: swallowed and logged (key name only), never a dialog.
            console.warn('⚠️ TalariaPreferences: failed to save pin key:', key, e && e.name);
            return false;
        }
    }

    function removeRaw(key) {
        var s = storage();
        if (!s || typeof s.removeItem !== 'function') return false;
        try {
            s.removeItem(key);
            return true;
        } catch (e) {
            console.warn('⚠️ TalariaPreferences: failed to clear pin key:', key);
            return false;
        }
    }

    /**
     * Fail-open read of the stored value. Owner unknown, missing, empty or
     * corrupt all yield the fallback IN MEMORY ONLY — nothing is written back
     * or deleted here.
     */
    function readStoredJson(key, fallback) {
        if (!ownerReady()) return fallback;
        var raw = readRaw(key);
        if (raw === null || raw === '') return fallback;
        try {
            var parsed = JSON.parse(raw);
            return (parsed === undefined || parsed === null) ? fallback : parsed;
        } catch (e) {
            return fallback;
        }
    }

    /**
     * Serialised form of a write that is still waiting for the owner, or null.
     * In-memory only: this never reaches storage until the owner resolves.
     */
    function pendingEncoded(key) {
        if (!Object.prototype.hasOwnProperty.call(pendingWrites, key)) return null;
        return encodeFor(key, pendingWrites[key]);
    }

    /**
     * As readStoredJson, but a value queued by this page load shadows the store
     * so a caller that writes during boot reads back what it just set.
     */
    function readJson(key, fallback) {
        var pending = pendingEncoded(key);
        if (pending !== null) {
            try {
                return JSON.parse(pending);
            } catch (e) { /* fall through to the stored value */ }
        }
        return readStoredJson(key, fallback);
    }

    function isScalar(v) {
        if (typeof v === 'number') return isFinite(v);
        if (typeof v === 'boolean') return true;
        if (typeof v === 'string') return v.length <= MAX_ID_LENGTH;
        return false;
    }

    /**
     * Ids only, bounded. Returns null (reject the whole write) if the value is
     * not a list at all; individual junk/oversized entries are dropped.
     */
    function sanitizeIdList(value) {
        if (!Array.isArray(value)) return null;
        var out = [];
        for (var i = 0; i < value.length && out.length < MAX_LIST_ITEMS; i++) {
            var id = value[i];
            if (typeof id !== 'string') continue;
            id = id.trim();
            if (!id || id.length > MAX_ID_LENGTH) continue;
            if (out.indexOf(id) === -1) out.push(id);
        }
        return out;
    }

    /**
     * Merge a caller position patch over the STORED object. Members this build
     * does not recognise are carried through verbatim so an older client can
     * never strip a key written by a newer one; only the caller's own members
     * are validated (scalars only, no embedded objects).
     */
    function mergePos(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        var merged = {};
        var stored = readStoredJson(KEY_PINBAR_POS, null);
        var k;
        if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
            for (k in stored) {
                if (Object.prototype.hasOwnProperty.call(stored, k)) merged[k] = stored[k];
            }
        }
        for (k in value) {
            if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
            if (k.length > MAX_ID_LENGTH) return null;
            if (!isScalar(value[k])) return null;
            merged[k] = value[k];
        }
        var count = 0;
        for (k in merged) {
            if (Object.prototype.hasOwnProperty.call(merged, k)) count++;
        }
        if (count > MAX_POS_MEMBERS) return null;
        return merged;
    }

    /**
     * Validate + serialise one pin value. Returns the string to store, or null
     * if the value is rejected (nothing is written in that case).
     */
    function encodeFor(key, value) {
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
            var merged = mergePos(value);
            if (!merged) return null;
            encoded = JSON.stringify(merged);
            return encoded.length > MAX_POS_BYTES ? null : encoded;
        }
        return null;
    }

    /**
     * Stamp the schema version. Owner-gated, idempotent, monotonic: a stored
     * version that is unreadable or newer is left untouched rather than being
     * overwritten with our default.
     */
    function ensureSchemaVersion() {
        if (isDisabled() || schemaStamped || !ownerReady()) return false;
        var raw = readRaw(KEY_SCHEMA_VERSION);
        if (raw !== null && raw !== '') {
            var stored = parseInt(raw, 10);
            if (!isFinite(stored) || stored >= SCHEMA_VERSION) {
                schemaStamped = true;
                return true;
            }
        }
        if (writeRaw(KEY_SCHEMA_VERSION, String(SCHEMA_VERSION))) {
            schemaStamped = true;
            return true;
        }
        return false;
    }

    function hasPending() {
        for (var k in pendingWrites) {
            if (Object.prototype.hasOwnProperty.call(pendingWrites, k)) return true;
        }
        return false;
    }

    function pendingKeys() {
        var keys = [];
        for (var k in pendingWrites) {
            if (Object.prototype.hasOwnProperty.call(pendingWrites, k)) keys.push(k);
        }
        return keys;
    }

    function stopOwnerWatch() {
        if (ownerTimer !== null) {
            clearInterval(ownerTimer);
            ownerTimer = null;
        }
    }

    function startOwnerWatch() {
        if (isDisabled() || ownerTimer !== null) return;
        if (ownerReady()) {
            drain(true);
            return;
        }
        var attempts = 0;
        try {
            ownerTimer = setInterval(function () {
                attempts++;
                if (ownerReady()) {
                    stopOwnerWatch();
                    drain(true);
                    return;
                }
                if (attempts >= OWNER_POLL_MAX) {
                    stopOwnerWatch();
                    drain(false);
                }
            }, OWNER_POLL_MS);
        } catch (e) {
            ownerTimer = null;
        }
    }

    function notifyWaiters(resolved) {
        var waiters = ownerWaiters;
        ownerWaiters = [];
        for (var i = 0; i < waiters.length; i++) {
            try { waiters[i](resolved); } catch (e) { /* a waiter must not break the store */ }
        }
    }

    /**
     * Apply whatever was deferred while the owner was unknown. resolved=false
     * means the owner never appeared: pending writes are DROPPED rather than
     * written to an unscoped key.
     */
    function drain(resolved) {
        stopOwnerWatch();
        if (!resolved) {
            var dropped = pendingKeys();
            pendingWrites = {};
            pendingReset = false;
            if (dropped.length > 0) {
                console.warn('⚠️ TalariaPreferences: owner unresolved, dropped pin writes:', dropped.join(', '));
            }
            notifyWaiters(false);
            return;
        }
        if (pendingReset) {
            pendingReset = false;
            pendingWrites = {};
            resetNow();
            notifyWaiters(true);
            return;
        }
        var keys = pendingKeys();
        ensureSchemaVersion();
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var value = pendingWrites[key];
            delete pendingWrites[key];
            var encoded = encodeFor(key, value);
            if (encoded !== null) writeRaw(key, encoded);
        }
        notifyWaiters(true);
    }

    /**
     * A reset leaves a genuinely empty store: the schema version is cleared too
     * and is NOT re-stamped here, so the recovered state is indistinguishable
     * from a first-ever visit. The next actual pin write stamps it again, which
     * keeps the invariant "a store holding pin keys also holds a version".
     */
    function resetNow() {
        var keys = [KEY_PINS_TIMEFRAMES, KEY_PINS_TOOLS, KEY_PINBAR_OPEN, KEY_PINBAR_POS, KEY_SCHEMA_VERSION];
        for (var i = 0; i < keys.length; i++) removeRaw(keys[i]);
        schemaStamped = false;
        resetPerformed = true;
        console.log('🧹 TalariaPreferences: pin preference keys cleared');
        return true;
    }

    /**
     * Read all pin state. Never writes, never throws. Missing/corrupt/owner-not-
     * yet-known all return defaults, and a default is never persisted.
     */
    function getPins() {
        var pins = { timeframes: [], tools: [], barOpen: false, barPos: null };
        if (isDisabled()) return pins;

        var timeframes = sanitizeIdList(readJson(KEY_PINS_TIMEFRAMES, null));
        if (timeframes) pins.timeframes = timeframes;

        var tools = sanitizeIdList(readJson(KEY_PINS_TOOLS, null));
        if (tools) pins.tools = tools;

        var open = readJson(KEY_PINBAR_OPEN, null);
        if (open === true || open === 1 || open === '1' || open === 'true') pins.barOpen = true;
        else if (open === false || open === 0 || open === '0' || open === 'false') pins.barOpen = false;

        var pos = readJson(KEY_PINBAR_POS, null);
        // Returned verbatim: members this build does not recognise stay visible.
        if (pos && typeof pos === 'object' && !Array.isArray(pos)) pins.barPos = pos;

        return pins;
    }

    function getPin(name) {
        var key = resolveKey(name);
        var pins = getPins();
        if (key === KEY_PINS_TIMEFRAMES) return pins.timeframes;
        if (key === KEY_PINS_TOOLS) return pins.tools;
        if (key === KEY_PINBAR_OPEN) return pins.barOpen;
        if (key === KEY_PINBAR_POS) return pins.barPos;
        return null;
    }

    /**
     * Write one pin key. Returns true if stored or queued for the owner, false
     * if disabled or rejected. null/undefined is rejected on purpose so an
     * uninitialised caller value can never erase stored state.
     */
    function setPin(name, value) {
        if (isDisabled()) return false;
        var key = resolveKey(name);
        if (!key) {
            console.warn('⚠️ TalariaPreferences.setPin: unknown pin name');
            return false;
        }
        if (value === undefined || value === null) {
            console.warn('⚠️ TalariaPreferences.setPin: ignored empty value for', key);
            return false;
        }
        var encoded = encodeFor(key, value);
        if (encoded === null) {
            console.warn('⚠️ TalariaPreferences.setPin: rejected value for', key);
            return false;
        }
        if (!ownerReady()) {
            // Queue, last-write-wins per key. Writing now would land on an
            // unscoped key that the owner-scoped read can never see again.
            pendingWrites[key] = value;
            startOwnerWatch();
            return true;
        }
        ensureSchemaVersion();
        return writeRaw(key, encoded);
    }

    /**
     * Clear the pin store. Deferred until the owner is known so it clears the
     * caller's own keys and not a shared unscoped slot.
     */
    function reset() {
        if (isDisabled()) return false;
        if (!ownerReady()) {
            pendingReset = true;
            startOwnerWatch();
            return false;
        }
        pendingWrites = {};
        return resetNow();
    }

    /**
     * Raw per-key accessors. `key` is one of the pref.v1 keys above (the pin
     * names accepted by setPin also work). getItem returns the stored JSON text
     * or null; setItem takes JSON text (or a live value) for ONE key and routes
     * it through the same validation, owner gate and schema stamp as setPin.
     * pref.v1.meta.schemaVersion is readable but not writable from outside.
     */
    function getItem(key) {
        if (isDisabled()) return null;
        var resolved = (typeof key === 'string' && key.trim() === KEY_SCHEMA_VERSION)
            ? KEY_SCHEMA_VERSION
            : resolveKey(key);
        if (!resolved) return null;
        var pending = pendingEncoded(resolved);
        if (pending !== null) return pending;
        if (!ownerReady()) return null;
        return readRaw(resolved);
    }

    function setItem(key, raw) {
        if (isDisabled()) return false;
        var resolved = resolveKey(key);
        if (!resolved) {
            console.warn('⚠️ TalariaPreferences.setItem: unknown pin key');
            return false;
        }
        var value = raw;
        if (typeof raw === 'string') {
            try {
                value = JSON.parse(raw);
            } catch (e) {
                console.warn('⚠️ TalariaPreferences.setItem: unparseable value for', resolved);
                return false;
            }
        }
        return setPin(resolved, value);
    }

    function resetRequested() {
        try {
            var search = (window.location && window.location.search) || '';
            if (!search) return false;
            if (typeof URLSearchParams === 'function') {
                return new URLSearchParams(search).get(RESET_PARAM) === '1';
            }
            return new RegExp('[?&]' + RESET_PARAM + '=1(?:&|$)').test(search);
        } catch (e) {
            return false;
        }
    }

    /**
     * Idempotent, synchronous, non-blocking. Runs at script load and again once
     * the async preference/auth boot has settled (see preferences-init.js).
     */
    function init() {
        if (isDisabled()) return false;
        if (!resetHandled && resetRequested()) {
            resetHandled = true;
            console.log('🧹 TalariaPreferences: ' + RESET_PARAM + '=1 requested');
            reset();
        }
        if (ownerReady()) {
            if (pendingReset || hasPending()) drain(true);
            // After a reset the store is left empty on purpose: nothing is
            // re-stamped until the user pins something again.
            if (!resetPerformed) ensureSchemaVersion();
        } else if (pendingReset || hasPending()) {
            startOwnerWatch();
        }
        return true;
    }

    window.TalariaPreferences = {
        SCHEMA_VERSION: SCHEMA_VERSION,
        KEYS: {
            timeframes: KEY_PINS_TIMEFRAMES,
            tools: KEY_PINS_TOOLS,
            barOpen: KEY_PINBAR_OPEN,
            barPos: KEY_PINBAR_POS,
            schemaVersion: KEY_SCHEMA_VERSION
        },
        isEnabled: function () { return !isDisabled(); },
        isOwnerReady: function () { return !isDisabled() && ownerReady(); },
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
        init: init
    };

    if (!isDisabled()) {
        window.__TALARIA_PREF_SCHEMA_VERSION = SCHEMA_VERSION;
        init();
    }
})();
