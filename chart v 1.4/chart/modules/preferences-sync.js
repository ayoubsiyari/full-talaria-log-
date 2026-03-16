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
    }

    /**
     * Load all preferences from API (cloud) or localStorage (fallback)
     */
    async loadPreferences() {
        try {
            const token = localStorage.getItem('token');
            
            if (token) {
                // Try loading from API
                const response = await fetch('/api/chart/preferences', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    credentials: 'include'
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.success) {
                        this.preferences = result.preferences;
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
     * Load preferences from localStorage
     */
    loadFromLocalStorage() {
        return {
            tool_defaults: this.getLocalItem('toolDefaults', {}),
            timeframe_favorites: this.getLocalItem('chart_timeframe_favorites', []),
            chart_templates: this.getLocalItem('chart_user_templates', {}),
            keyboard_shortcuts: this.getLocalItem('chart_custom_shortcuts', {}),
            drawing_tool_styles: this.getLocalItem('drawingToolStyles', {}),
            panel_sync_settings: this.getLocalItem('chart_panel_sync_settings', {}),
            panel_settings: this.getAllPanelSettings(),
            market_config: this.getMarketConfig(),
            protection_settings: this.getLocalItem('protectionSettings', []),
            general_settings: this.getLocalItem('talaria_general_settings', {}),
            keep_drawing_enabled: this.getLocalItem('chart_keep_drawing', '0') === '1'
        };
    }

    /**
     * Get item from localStorage with default value
     */
    getLocalItem(key, defaultValue) {
        try {
            const item = localStorage.getItem(key);
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
            marketType: localStorage.getItem('chart_marketType') || 'forex',
            pipSize: localStorage.getItem('chart_pipSize') || '0.0001',
            pipValuePerLot: localStorage.getItem('chart_pipValuePerLot') || '10'
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
                    localStorage.setItem('toolDefaults', JSON.stringify(value));
                    break;
                case 'timeframe_favorites':
                    localStorage.setItem('chart_timeframe_favorites', JSON.stringify(value));
                    break;
                case 'chart_templates':
                    localStorage.setItem('chart_user_templates', JSON.stringify(value));
                    break;
                case 'keyboard_shortcuts':
                    localStorage.setItem('chart_custom_shortcuts', JSON.stringify(value));
                    break;
                case 'drawing_tool_styles':
                    localStorage.setItem('drawingToolStyles', JSON.stringify(value));
                    break;
                case 'panel_sync_settings':
                    localStorage.setItem('chart_panel_sync_settings', JSON.stringify(value));
                    break;
                case 'panel_settings':
                    // Save individual panel settings
                    Object.keys(value).forEach(panelIndex => {
                        localStorage.setItem(`chart_panel_${panelIndex}_settings`, JSON.stringify(value[panelIndex]));
                    });
                    break;
                case 'market_config':
                    if (value.marketType) localStorage.setItem('chart_marketType', value.marketType);
                    if (value.pipSize) localStorage.setItem('chart_pipSize', value.pipSize);
                    if (value.pipValuePerLot) localStorage.setItem('chart_pipValuePerLot', value.pipValuePerLot);
                    break;
                case 'protection_settings':
                    localStorage.setItem('protectionSettings', JSON.stringify(value));
                    break;
                case 'general_settings':
                    localStorage.setItem('talaria_general_settings', JSON.stringify(value));
                    break;
                case 'keep_drawing_enabled':
                    localStorage.setItem('chart_keep_drawing', value ? '1' : '0');
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
            } else {
                console.warn('⚠️ Failed to sync preferences to cloud:', response.statusText);
            }
        } catch (error) {
            console.warn('⚠️ Error syncing preferences to cloud:', error.message);
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
