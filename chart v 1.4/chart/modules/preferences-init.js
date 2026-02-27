/**
 * Initialize preferences sync on page load
 * This script loads all user preferences from cloud/localStorage
 * and makes them available to all modules
 */

(async function initializePreferences() {
    console.log('🔄 Loading user preferences...');
    
    try {
        // Load all preferences
        await window.preferencesSync.loadPreferences();
        
        // Dispatch event to notify modules that preferences are ready
        window.dispatchEvent(new CustomEvent('preferencesLoaded', {
            detail: window.preferencesSync.preferences
        }));
        
        console.log('✅ User preferences initialized');
    } catch (error) {
        console.error('❌ Failed to initialize preferences:', error);
    }
})();

/**
 * Helper functions for backward compatibility
 */

// Tool Defaults
window.saveToolDefaults = function(defaults) {
    window.preferencesSync.updatePreference('tool_defaults', defaults);
};

window.loadToolDefaults = function() {
    return window.preferencesSync.get('tool_defaults', {});
};

// Timeframe Favorites
window.saveTimeframeFavorites = function(favorites) {
    window.preferencesSync.updatePreference('timeframe_favorites', favorites);
};

window.loadTimeframeFavorites = function() {
    return window.preferencesSync.get('timeframe_favorites', []);
};

// Chart Templates
window.saveChartTemplates = function(templates) {
    window.preferencesSync.updatePreference('chart_templates', templates);
};

window.loadChartTemplates = function() {
    return window.preferencesSync.get('chart_templates', {});
};

// Keyboard Shortcuts
window.saveKeyboardShortcuts = function(shortcuts) {
    window.preferencesSync.updatePreference('keyboard_shortcuts', shortcuts);
};

window.loadKeyboardShortcuts = function() {
    return window.preferencesSync.get('keyboard_shortcuts', {});
};

// Drawing Tool Styles
window.saveDrawingToolStyles = function(styles) {
    window.preferencesSync.updatePreference('drawing_tool_styles', styles);
};

window.loadDrawingToolStyles = function() {
    return window.preferencesSync.get('drawing_tool_styles', {});
};

// Panel Sync Settings
window.savePanelSyncSettings = function(settings) {
    window.preferencesSync.updatePreference('panel_sync_settings', settings);
};

window.loadPanelSyncSettings = function() {
    return window.preferencesSync.get('panel_sync_settings', {});
};

// Panel Settings
window.savePanelSettings = function(panelIndex, settings) {
    const allPanelSettings = window.preferencesSync.get('panel_settings', {});
    allPanelSettings[panelIndex] = settings;
    window.preferencesSync.updatePreference('panel_settings', allPanelSettings);
};

window.loadPanelSettings = function(panelIndex) {
    const allPanelSettings = window.preferencesSync.get('panel_settings', {});
    return allPanelSettings[panelIndex] || null;
};

// Market Configuration
window.saveMarketConfig = function(config) {
    window.preferencesSync.updatePreference('market_config', config);
};

window.loadMarketConfig = function() {
    return window.preferencesSync.get('market_config', {
        marketType: 'forex',
        pipSize: '0.0001',
        pipValuePerLot: '10'
    });
};

// Protection Settings
window.saveProtectionSettings = function(settings) {
    window.preferencesSync.updatePreference('protection_settings', settings);
};

window.loadProtectionSettings = function() {
    return window.preferencesSync.get('protection_settings', []);
};

// General Settings
window.saveGeneralSettings = function(settings) {
    window.preferencesSync.updatePreference('general_settings', settings);
};

window.loadGeneralSettings = function() {
    return window.preferencesSync.get('general_settings', {});
};

// Keep Drawing Enabled
window.saveKeepDrawingEnabled = function(enabled) {
    window.preferencesSync.updatePreference('keep_drawing_enabled', enabled);
};

window.loadKeepDrawingEnabled = function() {
    return window.preferencesSync.get('keep_drawing_enabled', false);
};
