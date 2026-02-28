# localStorage Audit - What Needs Database Sync

## ✅ Already Synced to Database
1. **Chart Drawings** (`chart_drawings_*`) - ✅ Synced via `/api/chart/drawings`
2. **Chart Settings** (`chartSettings`) - ✅ Synced via `/api/chart/settings`

## 🔄 Should Be Synced (User Preferences)
These should sync across devices:

### High Priority
3. **Tool Defaults** (`toolDefaults`) - Drawing tool default styles/settings
4. **Timeframe Favorites** (`chart_timeframe_favorites`) - User's favorite timeframes
5. **Chart Templates** (`chart_user_templates`) - User-created chart templates
6. **Panel Sync Settings** (`chart_panel_sync_settings`) - Multi-panel sync preferences
7. **Panel Settings** (`chart_panel_*_settings`) - Individual panel configurations
8. **Keyboard Shortcuts** (`chart_custom_shortcuts`) - Custom keyboard shortcuts
9. **Drawing Tool Styles** (`drawingToolStyles`) - Saved tool styles per type
10. **Keep Drawing State** (`chart_keep_drawing`) - Keep drawing mode enabled/disabled

### Medium Priority
11. **Market Type** (`chart_marketType`) - Forex/Crypto/Stocks selection
12. **Pip Configuration** (`chart_pipSize`, `chart_pipValuePerLot`) - Instrument settings
13. **Protection Settings** (`protectionSettings`) - Prop firm protection presets
14. **General Settings** (`talaria_general_settings`) - General app settings

## 📍 Should Stay Local (Session/Temporary)
These are session-specific or temporary:

15. **Backtesting Session** (`backtestingSession`) - Current session data
16. **Active Session ID** (`active_trading_session_id`) - Current session ID
17. **Auth Token** (`token`) - User authentication token
18. **Temp UI State** - Temporary UI states, collapsed panels, etc.

## 📊 Summary
- **Already Synced**: 2 items
- **Need Sync**: 12 items
- **Keep Local**: 4+ items

## 🎯 Recommended Implementation Order
1. Tool Defaults (most used)
2. Timeframe Favorites (frequently used)
3. Keyboard Shortcuts (power users)
4. Chart Templates (advanced users)
5. Panel Settings (multi-panel users)
6. Market/Pip Configuration (trading-specific)
7. Protection Settings (prop firm users)
