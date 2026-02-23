/**
 * Floating Drawing Toolbar
 * TradingView-style inline toolbar for quick drawing settings
 */

class DrawingToolbar {
    constructor() {
        this.toolbar = null;
        this.currentDrawing = null;
        this.visible = false;
        this.dragState = {
            isDragging: false,
            offsetX: 0,
            offsetY: 0
        };
        this.viewportPadding = 10;
        this.verticalOffset = 120;
        this.handleDragMove = this.handleDragMove.bind(this);
        this.handleDragEnd = this.handleDragEnd.bind(this);
        this.handleDocumentClick = this.handleDocumentClick.bind(this);
        this.openPopoverId = null;
        this.activeButton = null;
        this.storageKey = 'drawingToolbarPosition';
        this.savedPosition = null;
        this.handleTemplatesUpdated = this.handleTemplatesUpdated.bind(this);
        
        // Check if ColorPicker is available
        if (typeof ColorPicker === 'undefined') {
            console.error('❌ ColorPicker class not loaded!');
            this.colorPicker = null;
        } else {
            this.colorPicker = new ColorPicker();
            console.log('✅ ColorPicker initialized');
        }
        
        this.init();

        window.addEventListener('drawingTemplatesUpdated', this.handleTemplatesUpdated);
    }

    closeColorPickerPopups() {
        if (this.colorPicker && typeof this.colorPicker.hide === 'function') {
            this.colorPicker.hide();
        }

        const externalPicker = document.querySelector('#custom-color-picker');
        if (externalPicker) externalPicker.style.display = 'none';
    }

    updateTemplateDropdownUI(toolType) {
        const templateDropdown = this.toolbar?.querySelector('#template-dropdown');
        if (!templateDropdown) return;

        const list = templateDropdown.querySelector('#saved-templates-list');
        if (list) list.innerHTML = this.getSavedTemplatesHTML(toolType);

        const separator = templateDropdown.querySelector('.template-separator');
        if (separator) {
            const hasTemplates = this.getSavedTemplates(toolType).length > 0;
            separator.style.display = hasTemplates ? '' : 'none';
        }
    }

    handleTemplatesUpdated(e) {
        if (!this.visible || !this.currentDrawing) return;
        if (!e || !e.detail || !e.detail.toolType) return;
        if (e.detail.toolType !== this.currentDrawing.type) return;

        this.updateTemplateDropdownUI(this.currentDrawing.type);
    }

    injectToolbarStyles() {
        if (document.getElementById('drawing-toolbar-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'drawing-toolbar-styles';
        style.textContent = `
            .drawing-toolbar {
                position: absolute;
                display: none;
                border-radius: 8px;
                padding: 0 12px;
                height: 48px;
                z-index: 10000;
                gap: 4px;
                align-items: center;
                flex-wrap: nowrap;
                user-select: none;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                font-size: 13px;
                animation: toolbarFadeIn 0.15s ease-out;
                transition: box-shadow 0.2s ease;
            }

            .drawing-toolbar .toolbar-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                height: 32px;
                min-width: 32px;
                padding: 0 8px;
                border: none;
                border-radius: 8px;
                background: transparent;
                box-sizing: border-box;
                outline: none;
            }

            .drawing-toolbar .toolbar-btn:focus {
                outline: none;
            }

            .drawing-toolbar .toolbar-btn svg {
                width: 18px;
                height: 18px;
                stroke-width: 1.5;
                flex-shrink: 0;
            }
            
            @keyframes toolbarFadeIn {
                from { opacity: 0; transform: translateY(-4px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            /* Dark mode (default) */
            body:not(.light-mode) .drawing-toolbar {
                background: var(--tv-panel-bg);
                border: 1px solid rgba(63, 84, 124, 0.35);
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
            }
            
            body:not(.light-mode) .drawing-toolbar .toolbar-btn {
                color: #d1d4dc;
                transition: all 0.15s ease;
                cursor: default;
            }
            
            body:not(.light-mode) .drawing-toolbar .toolbar-btn:hover {
                background: rgba(255, 255, 255, 0.08);
                color: #ffffff;
            }
            
            @keyframes toolbarBounce {
                0% { transform: scale(1); }
                40% { transform: scale(1.12); }
                70% { transform: scale(0.95); }
                100% { transform: scale(1); }
            }
            
            body:not(.light-mode) .drawing-toolbar .toolbar-width-text {
                color: #d1d4dc;
            }
            
            body:not(.light-mode) .drawing-toolbar .toolbar-color-icon-wrapper svg {
                color: #d1d4dc;
            }
            
            /* Light mode */
            body.light-mode .drawing-toolbar {
                background: #ffffff;
                border: 1px solid #e0e3eb;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }
            
            .drawing-toolbar.dragging {
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
                opacity: 0.95;
                z-index: 10001;
            }
            
            body.light-mode .drawing-toolbar .toolbar-btn {
                color: #131722;
                transition: all 0.15s ease;
                cursor: default;
            }
            
            body.light-mode .drawing-toolbar .toolbar-btn:hover {
                background: rgba(0, 0, 0, 0.08);
                color: #000000;
            }
            
            body.light-mode .drawing-toolbar .toolbar-width-text {
                color: #131722;
            }
            
            body.light-mode .drawing-toolbar .toolbar-color-icon-wrapper svg {
                color: #131722;
            }
        `;
        document.head.appendChild(style);
    }

    init() {
        // Inject toolbar styles for dark/light mode
        this.injectToolbarStyles();
        
        // Create toolbar element
        this.toolbar = document.createElement('div');
        this.toolbar.id = 'drawing-toolbar';
        this.toolbar.className = 'drawing-toolbar';
        
        document.body.appendChild(this.toolbar);
        
        // Prevent toolbar from closing when clicking inside it and enable drag
        this.toolbar.addEventListener('mousedown', (event) => this.handleToolbarMouseDown(event));
    }

    show(drawing, x, y) {
        this.currentDrawing = drawing;
        this.visible = true;
        
        // Build toolbar content
        this.toolbar.innerHTML = this.buildToolbarHTML(drawing);
        
        // Show toolbar FIRST so getBoundingClientRect() returns correct dimensions
        this.toolbar.style.display = 'flex';
        
        // Position toolbar AFTER it's visible
        this.position(x, y);
        
        // Setup event handlers
        this.setupEventHandlers();

        document.addEventListener('click', this.handleDocumentClick, true);
    }

    buildToolbarHTML(drawing) {
        const style = drawing.style || {};
        
        // Tools that use style.color instead of stroke/fill
        const colorOnlyTools = [];
        const isColorOnlyTool = colorOnlyTools.includes(drawing.type);
        
        // Text-based tools
        const textTypes = ['text', 'anchored-text', 'note', 'callout', 'price-label', 'pin'];
        const isTextTool = textTypes.includes(drawing.type);
        
        // Note/box style tools
        const noteTypes = ['notebox', 'note', 'price-note', 'callout', 'pin'];
        const isNoteBox = noteTypes.includes(drawing.type);
        
        // Risk/Reward tools
        const isRiskReward = drawing.type === 'long-position' || drawing.type === 'short-position';
        
        // All drawing tools now support template system
        const lineTools = ['trendline', 'horizontal', 'vertical', 'ray', 'horizontal-ray', 'extended-line', 'cross-line', 'path', 'curve', 'double-curve', 'parallel-channel', 'regression-trend', 'flat-top-bottom', 'disjoint-channel'];
        // Template system available for all tools except a few exceptions
        const noTemplateTools = []; // Empty - all tools get templates now
        const isBrushTool = !noTemplateTools.includes(drawing.type);
        
        // Determine stroke/color label and value
        let strokeLabel, strokeBaseColor;
        if (isColorOnlyTool) {
            strokeLabel = 'Color';
            strokeBaseColor = style.color || '#787b86';
        } else if (isTextTool) {
            strokeLabel = 'Text Color';
            strokeBaseColor = style.textColor || style.stroke || '#787b86';
        } else if (drawing.type === 'table') {
            strokeLabel = 'Border Color';
            strokeBaseColor = style.borderColor || '#363A45';
        } else if (isNoteBox) {
            strokeLabel = 'Border Color';
            strokeBaseColor = style.stroke || '#787b86';
        } else {
            strokeLabel = 'Line Color';
            strokeBaseColor = style.stroke || '#787b86';
        }
        
        // Fill color
        const showFill = this.needsFillColor(drawing) && !isColorOnlyTool;
        const _fillRaw = showFill
            ? ((style.fill && style.fill !== 'none') ? style.fill : (style.backgroundColor || '#787b86'))
            : null;
        // For the underline indicator, always show a fully opaque version of the fill color
        // so it's visible even when fill opacity is very low
        const fillBaseColor = _fillRaw ? (function(c) {
            const m = c.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
            if (m) return 'rgb(' + m[1] + ',' + m[2] + ',' + m[3] + ')';
            return c;
        })(_fillRaw) : null;
        
        // Line controls (hide for text/marker tools)
        const noLineControlTypes = ['text', 'notebox', 'anchored-text', 'note', 'price-note', 'callout', 'price-label'];
        const showLineControls = !noLineControlTypes.includes(drawing.type);
        
        // Text editing
        const fontSize = style.fontSize || 14;
        const textPlaceholder = isNoteBox ? 'Enter note text…' : 'Enter text…';
        const textValue = this.escapeHtml(drawing.text || '');
        
        return `
            <style>
                .toolbar-color-label {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    cursor: default;
                    position: relative;
                }
                .toolbar-color-input {
                    display: none;
                }
                .toolbar-color-icon-wrapper {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    cursor: default;
                    height: 34px;
                    min-width: 34px;
                    padding: 0 10px;
                    justify-content: center;
                    border-radius: 8px;
                    transition: all 0.15s ease;
                }
                .toolbar-color-icon-wrapper:hover {
                    background: rgba(255, 255, 255, 0.08);
                }
                body.light-mode .toolbar-color-icon-wrapper:hover {
                    background: rgba(0, 0, 0, 0.08);
                }
                .toolbar-color-icon-wrapper svg {
                    color: #131722;
                }
                .toolbar-color-underline {
                    width: 20px;
                    height: 4px;
                    border-radius: 2px;
                    margin-top: 2px;
                }
                .toolbar-color-preview {
                    display: block;
                    width: 28px;
                    height: 28px;
                    border-radius: 4px;
                    border: 2px solid #e0e3eb;
                    cursor: default;
                    transition: border-color 0.2s;
                }
                .toolbar-color-preview:hover {
                    border-color: #787b86;
                }
                .color-palette {
                    position: absolute;
                    top: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    margin-top: 8px;
                    background: #2a2e39;
                    border-radius: 8px;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
                    padding: 16px;
                    display: none;
                    flex-direction: column;
                    gap: 0;
                    z-index: 10001;
                    min-width: 280px;
                }
                .color-palette.active {
                    display: flex;
                }
                .color-palette-grid {
                    display: grid;
                    grid-template-columns: repeat(10, 1fr);
                    gap: 4px;
                }
                .color-palette-divider {
                    height: 1px;
                    background: #3a3e49;
                    margin: 12px 0;
                }
                .color-palette-recent {
                    display: flex;
                    gap: 6px;
                    align-items: center;
                }
                .color-palette-recent-items {
                    display: flex;
                    gap: 6px;
                }
                .color-palette-item {
                    width: 22px;
                    height: 22px;
                    border-radius: 3px;
                    cursor: default;
                    border: 2px solid transparent;
                    transition: all 0.15s;
                    position: relative;
                }
                .color-palette-item:hover {
                    transform: scale(1.1);
                    border-color: #fff;
                }
                .color-palette-item.selected {
                    border-color: #fff;
                    box-shadow: 0 0 0 1px #2a2e39, 0 0 0 3px #fff;
                }
                .color-palette-add {
                    width: 22px;
                    height: 22px;
                    border-radius: 3px;
                    background: #3a3e49;
                    border: 1px dashed #5a5e69;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: default;
                    color: #8a8e99;
                    font-size: 18px;
                    transition: all 0.15s;
                }
                .color-palette-add:hover {
                    background: #4a4e59;
                    border-color: #7a7e89;
                    color: #fff;
                }
                .toolbar-field {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    min-width: 80px;
                }
                .toolbar-field-label {
                    font-size: 11px;
                    color: #8a8e99;
                    font-weight: 600;
                }
                .toolbar-number-input {
                    width: 72px;
                    padding: 4px 6px;
                    border: 1px solid #d1d4dc;
                    border-radius: 4px;
                    font-size: 13px;
                    text-align: center;
                    outline: none;
                }
                .toolbar-number-input:focus {
                    border-color: #787b86;
                    box-shadow: 0 0 0 2px rgba(41, 98, 255, 0.15);
                }
                .toolbar-textarea {
                    flex: 1 1 100%;
                    display: flex;
                }
                .toolbar-textarea textarea {
                    width: 220px;
                    min-height: 60px;
                    padding: 6px 8px;
                    border: 1px solid #d1d4dc;
                    border-radius: 6px;
                    font-size: 13px;
                    resize: vertical;
                    outline: none;
                }
                .toolbar-drag-handle {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 28px;
                    height: 28px;
                    color: #5d606b;
                    cursor: move;
                    margin-right: 6px;
                    flex-shrink: 0;
                }
                
                body.light-mode .toolbar-drag-handle {
                    color: #b2b5be;
                }
                
                .toolbar-drag-handle:active {
                    cursor: move;
                }
                
                .toolbar-drag-handle svg {
                    width: 16px;
                    height: 16px;
                }
                .color-palette-opacity {
                    margin-top: 12px;
                }
                .color-palette-opacity-label {
                    color: #8a8e99;
                    font-size: 12px;
                    margin-bottom: 8px;
                    display: block;
                }
                .color-palette-opacity-control {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .color-palette-opacity-slider {
                    flex: 1;
                    -webkit-appearance: none;
                    appearance: none;
                    height: 6px;
                    border-radius: 3px;
                    outline: none;
                    cursor: default;
                }
                .color-palette-opacity-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: #ffffff;
                    border: 2px solid #3a3e49;
                    cursor: default;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                }
                .color-palette-opacity-slider::-moz-range-thumb {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: #ffffff;
                    border: 2px solid #3a3e49;
                    cursor: default;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                }
                .color-palette-opacity-value {
                    color: #d1d4dc;
                    font-size: 12px;
                    min-width: 40px;
                    text-align: right;
                }
                
                /* Dropdown styles */
                .toolbar-dropdown-wrapper {
                    position: relative;
                }
                .toolbar-dropdown-btn {
                    min-width: 50px;
                    padding: 4px 8px;
                }
                .toolbar-width-text {
                    font-size: 13px;
                    font-weight: 500;
                    color: #d1d4dc;
                }
                
                body.light-mode .toolbar-width-text {
                    color: #131722;
                }
                .toolbar-dropdown {
                    position: absolute;
                    top: 100%;
                    left: 50%;
                    transform: translateX(-50%);
                    margin-top: 8px;
                    background: var(--tv-panel-bg);
                    border: 1px solid rgba(63, 84, 124, 0.35);
                    border-radius: 8px;
                    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    padding: 8px;
                    display: none;
                    flex-direction: column;
                    gap: 4px;
                    z-index: 10001;
                    min-width: 120px;
                }
                
                body.light-mode .toolbar-dropdown {
                    background: #ffffff;
                    border: 1px solid #e0e3eb;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }
                .toolbar-dropdown.active {
                    display: flex;
                }
                .toolbar-dropdown-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 12px;
                    border-radius: 4px;
                    cursor: default;
                    color: #d1d4dc;
                    font-size: 13px;
                    transition: background 0.15s, color 0.15s;
                }
                
                body.light-mode .toolbar-dropdown-item {
                    color: #131722;
                }
                
                .toolbar-dropdown-item:hover {
                    background: rgba(41, 98, 255, 0.15);
                    color: #ffffff;
                }
                
                body.light-mode .toolbar-dropdown-item:hover {
                    background: rgba(41, 98, 255, 0.12);
                    color: #2962ff;
                }
                
                .toolbar-dropdown-item.active {
                    background: rgba(41, 98, 255, 0.25);
                    color: #ffffff;
                }
                
                body.light-mode .toolbar-dropdown-item.active {
                    background: rgba(41, 98, 255, 0.15);
                    color: #2962ff;
                }
                .toolbar-dropdown-item svg {
                    flex-shrink: 0;
                }
                .toolbar-dropdown-wide {
                    min-width: 220px;
                }
                .template-separator {
                    height: 1px;
                    background: #363a45;
                    margin: 4px 0;
                }
                .saved-templates-list:empty {
                    display: none;
                }
                .template-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 12px;
                    border-radius: 4px;
                    cursor: default;
                    color: #d1d4dc;
                    font-size: 13px;
                    transition: background 0.15s;
                }
                .template-item:hover {
                    background: #363a45;
                }
                .template-item-name {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .template-item-color {
                    width: 12px;
                    height: 12px;
                    border-radius: 2px;
                    border: 1px solid rgba(255,255,255,0.2);
                }
                .template-item-delete {
                    opacity: 0;
                    padding: 2px;
                    cursor: pointer;
                    color: #787b86;
                    transition: opacity 0.15s, color 0.15s;
                }
                .template-item:hover .template-item-delete {
                    opacity: 1;
                }
                .template-item-delete:hover {
                    opacity: 1;
                    color: #ff5252;
                }
                .template-item-delete svg {
                    display: block;
                }
                    
            </style>
            
            <div class="toolbar-drag-handle" title="Drag to move">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <circle cx="6" cy="6" r="1.5"/>
                    <circle cx="12" cy="6" r="1.5"/>
                    <circle cx="6" cy="12" r="1.5"/>
                    <circle cx="12" cy="12" r="1.5"/>
                    <circle cx="6" cy="18" r="1.5"/>
                    <circle cx="12" cy="18" r="1.5"/>
                </svg>
            </div>
            
            ${isBrushTool ? `
            <!-- BRUSH/HIGHLIGHTER TOOLBAR: Template → Pencil → 8px → Lock → Delete → Settings → More -->
            <!-- Template Button with Dropdown -->
            <div class="toolbar-item toolbar-dropdown-wrapper">
                <button class="toolbar-btn toolbar-dropdown-btn" id="tb-template" title="Template">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 3v17a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1H3"/>
                        <path d="M16 19h6"/>
                        <path d="M19 22v-6"/>
                    </svg>
                </button>
                <div class="toolbar-dropdown toolbar-dropdown-wide" id="template-dropdown">
                    <div class="toolbar-dropdown-item" data-action="save-template">
                        <span>Save as</span>
                    </div>
                    <div class="toolbar-dropdown-item" data-action="apply-default">
                        <span>Apply Default</span>
                    </div>
                    <div class="template-separator" style="display: ${this.getSavedTemplates(drawing.type).length > 0 ? 'block' : 'none'};"></div>
                    <div class="saved-templates-list" id="saved-templates-list">
                        ${this.getSavedTemplatesHTML(drawing.type)}
                    </div>
                </div>
            </div>
            
            <!-- Stroke Color Input -->
            <div class="toolbar-item">
                <div class="toolbar-color-label" title="${strokeLabel}">
                    <div class="toolbar-color-icon-wrapper" id="stroke-color-preview">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                            <path d="m15 5 4 4"/>
                        </svg>
                        <div class="toolbar-color-underline" style="background: ${strokeBaseColor};"></div>
                    </div>
                </div>
            </div>
            
            <!-- Line Style Dropdown (for line tools only) -->
            ${lineTools.includes(drawing.type) ? `
            <div class="toolbar-item toolbar-dropdown-wrapper">
                <button class="toolbar-btn toolbar-dropdown-btn" id="tb-style-btn" title="Line Style">
                    <svg width="32" height="24" viewBox="0 0 32 24">
                        <line x1="2" y1="12" x2="30" y2="12" stroke="currentColor" stroke-width="2" stroke-dasharray="${style.dashArray || '0'}"/>
                    </svg>
                </button>
                <div class="toolbar-dropdown" id="line-style-dropdown">
                    <div class="toolbar-dropdown-item ${!style.dashArray || style.dashArray === '0' ? 'active' : ''}" data-dash="0">
                        <svg width="40" height="20" viewBox="0 0 40 20"><line x1="2" y1="10" x2="38" y2="10" stroke="currentColor" stroke-width="2"/></svg>
                        <span>Solid</span>
                    </div>
                    <div class="toolbar-dropdown-item ${style.dashArray === '10,6' || style.dashArray === '5,5' ? 'active' : ''}" data-dash="10,6">
                        <svg width="40" height="20" viewBox="0 0 40 20"><line x1="2" y1="10" x2="38" y2="10" stroke="currentColor" stroke-width="2" stroke-dasharray="10,6"/></svg>
                        <span>Dashed</span>
                    </div>
                    <div class="toolbar-dropdown-item ${style.dashArray === '2,2' ? 'active' : ''}" data-dash="2,2">
                        <svg width="40" height="20" viewBox="0 0 40 20"><line x1="2" y1="10" x2="38" y2="10" stroke="currentColor" stroke-width="2" stroke-dasharray="2,2"/></svg>
                        <span>Dotted</span>
                    </div>
                    <div class="toolbar-dropdown-item ${style.dashArray === '8,4,2,4' ? 'active' : ''}" data-dash="8,4,2,4">
                        <svg width="40" height="20" viewBox="0 0 40 20"><line x1="2" y1="10" x2="38" y2="10" stroke="currentColor" stroke-width="2" stroke-dasharray="8,4,2,4"/></svg>
                        <span>Dash-Dot</span>
                    </div>
                </div>
            </div>
            ` : ''}
            
            <!-- Line Width Dropdown -->
            <div class="toolbar-item toolbar-dropdown-wrapper">
                <button class="toolbar-btn toolbar-dropdown-btn" id="tb-width-btn" title="Line Width">
                    <span class="toolbar-width-text">${style.strokeWidth || 2}px</span>
                </button>
                <div class="toolbar-dropdown" id="line-width-dropdown">
                    ${(drawing.type === 'highlighter' ? [8, 12, 20, 32, 48, 64, 80, 96] : [1, 2, 3, 4]).map(w => `
                        <div class="toolbar-dropdown-item ${(style.strokeWidth || 2) == w ? 'active' : ''}" data-width="${w}">
                            <span>${w}px</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Lock -->
            <div class="toolbar-item">
                <button class="toolbar-btn ${drawing.locked ? 'active' : ''}" id="tb-lock" title="${drawing.locked ? 'Unlock' : 'Lock'}">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${drawing.locked ? 
                            '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>' :
                            '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 019.9-1"/>'
                        }
                    </svg>
                </button>
            </div>
            
            <!-- Delete -->
            <div class="toolbar-item">
                <button class="toolbar-btn toolbar-btn-danger" id="tb-delete" title="Delete">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
                    </svg>
                </button>
            </div>
            
            <!-- Settings -->
            <div class="toolbar-item">
                <button class="toolbar-btn" id="tb-settings" title="Settings">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                    </svg>
                </button>
            </div>
            
            <!-- More Options (3 dots) -->
            <div class="toolbar-item">
                <button class="toolbar-btn" id="tb-more" title="More Options">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="5" cy="12" r="2"/>
                        <circle cx="12" cy="12" r="2"/>
                        <circle cx="19" cy="12" r="2"/>
                    </svg>
                </button>
            </div>
            ` : `
            <!-- STANDARD TOOLBAR FOR OTHER TOOLS -->
            <!-- Stroke Color Input -->
            <div class="toolbar-item">
                <div class="toolbar-color-label" title="${strokeLabel}">
                    <div class="toolbar-color-icon-wrapper" id="stroke-color-preview">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                            <path d="m15 5 4 4"/>
                        </svg>
                        <div class="toolbar-color-underline" style="background: ${strokeBaseColor};"></div>
                    </div>
                </div>
            </div>
            
            <!-- Fill Color Input (for shapes) -->
            ${showFill ? `
            <div class="toolbar-item">
                <div class="toolbar-color-label" title="Fill Color">
                    <div class="toolbar-color-icon-wrapper" id="fill-color-preview">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z"/>
                            <path d="m5 2 5 5"/>
                            <path d="M2 13h15"/>
                            <path d="M22 20.3c0 .8-.5 1.7-1.5 1.7s-1.5-.9-1.5-1.7c0-.8 1.5-2.3 1.5-2.3s1.5 1.5 1.5 2.3Z"/>
                        </svg>
                        <div class="toolbar-color-underline" style="background: ${fillBaseColor};"></div>
                    </div>
                </div>
            </div>
            ` : ''}
            
            <!-- Line Style Dropdown -->
            ${showLineControls ? `
            <div class="toolbar-item toolbar-dropdown-wrapper">
                <button class="toolbar-btn toolbar-dropdown-btn" id="tb-style-btn" title="Line Style">
                    <svg width="32" height="24" viewBox="0 0 32 24">
                        <line x1="2" y1="12" x2="30" y2="12" stroke="currentColor" stroke-width="2" stroke-dasharray="${style.dashArray || '0'}"/>
                    </svg>
                </button>
                <div class="toolbar-dropdown" id="line-style-dropdown">
                    <div class="toolbar-dropdown-item ${!style.dashArray || style.dashArray === '0' ? 'active' : ''}" data-dash="0">
                        <svg width="40" height="20" viewBox="0 0 40 20"><line x1="2" y1="10" x2="38" y2="10" stroke="currentColor" stroke-width="2"/></svg>
                        <span>Solid</span>
                    </div>
                    <div class="toolbar-dropdown-item ${style.dashArray === '10,6' || style.dashArray === '5,5' ? 'active' : ''}" data-dash="10,6">
                        <svg width="40" height="20" viewBox="0 0 40 20"><line x1="2" y1="10" x2="38" y2="10" stroke="currentColor" stroke-width="2" stroke-dasharray="10,6"/></svg>
                        <span>Dashed</span>
                    </div>
                    <div class="toolbar-dropdown-item ${style.dashArray === '2,2' ? 'active' : ''}" data-dash="2,2">
                        <svg width="40" height="20" viewBox="0 0 40 20"><line x1="2" y1="10" x2="38" y2="10" stroke="currentColor" stroke-width="2" stroke-dasharray="2,2"/></svg>
                        <span>Dotted</span>
                    </div>
                    <div class="toolbar-dropdown-item ${style.dashArray === '8,4,2,4' ? 'active' : ''}" data-dash="8,4,2,4">
                        <svg width="40" height="20" viewBox="0 0 40 20"><line x1="2" y1="10" x2="38" y2="10" stroke="currentColor" stroke-width="2" stroke-dasharray="8,4,2,4"/></svg>
                        <span>Dash-Dot</span>
                    </div>
                </div>
            </div>
            
            <!-- Line Width Dropdown -->
            <div class="toolbar-item toolbar-dropdown-wrapper">
                <button class="toolbar-btn toolbar-dropdown-btn" id="tb-width-btn" title="Line Width">
                    <span class="toolbar-width-text">${style.strokeWidth || 2}px</span>
                </button>
                <div class="toolbar-dropdown" id="line-width-dropdown">
                    ${(drawing.type === 'highlighter' ? [8, 12, 20, 32, 48, 64, 80, 96] : [1, 2, 3, 4]).map(w => `
                        <div class="toolbar-dropdown-item ${(style.strokeWidth || 2) == w ? 'active' : ''}" data-width="${w}">
                            <span>${w}px</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            ${(isTextTool || isNoteBox) ? `
            <div class="toolbar-item toolbar-field">
                <label class="toolbar-field-label" for="tb-font-size">Font Size</label>
                <input type="number" min="8" max="99" id="tb-font-size" class="toolbar-number-input" value="${fontSize}" />
            </div>
            <div class="toolbar-item toolbar-textarea">
                <textarea id="tb-text-content" placeholder="${textPlaceholder}">${textValue}</textarea>
            </div>
            ` : ''}
            
            <!-- Execute Button (for Risk/Reward tools only) -->
            ${isRiskReward ? `
            <div class="toolbar-item">
                <button class="toolbar-btn ${drawing.meta?.executed ? 'executed' : ''}" id="tb-execute" title="${drawing.meta?.executed ? 'Order Executed' : 'Execute Order'}" style="${drawing.meta?.executed ? 'color: #22c55e;' : ''}">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${drawing.meta?.executed ? 
                            '<polyline points="20 6 9 17 4 12"/>' :
                            '<text x="2" y="20" font-size="22" font-weight="bold" fill="currentColor" stroke="none">$</text><line x1="17" y1="2" x2="17" y2="12" stroke-width="2.5"/><line x1="12" y1="7" x2="22" y2="7" stroke-width="2.5"/>'
                        }
                    </svg>
                </button>
            </div>
            ` : ''}
            
            <!-- Settings -->
            <div class="toolbar-item">
                <button class="toolbar-btn" id="tb-settings" title="Settings">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"/>
                        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                    </svg>
                </button>
            </div>
            
            <!-- Lock -->
            <div class="toolbar-item">
                <button class="toolbar-btn ${drawing.locked ? 'active' : ''}" id="tb-lock" title="${drawing.locked ? 'Unlock' : 'Lock'}">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${drawing.locked ? 
                            '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>' :
                            '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 019.9-1"/>'
                        }
                    </svg>
                </button>
            </div>
            
            <!-- Delete -->
            <div class="toolbar-item">
                <button class="toolbar-btn toolbar-btn-danger" id="tb-delete" title="Delete">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
                    </svg>
                </button>
            </div>
            
            <!-- More Options (3 dots) -->
            <div class="toolbar-item">
                <button class="toolbar-btn" id="tb-more" title="More Options">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="5" cy="12" r="2"/>
                        <circle cx="12" cy="12" r="2"/>
                        <circle cx="19" cy="12" r="2"/>
                    </svg>
                </button>
            </div>
            `}
        `;
    }

    needsFillColor(drawing) {
        const typesWithFill = [
            // Shapes
            'rectangle', 'rotated-rectangle', 'ellipse', 'circle', 'triangle',
            // Brushes
            'brush', 'highlighter',
            // Arrow markers
            'arrow-marker', 'arrow-mark-up', 'arrow-mark-down',
            // Text tools with background
            'notebox', 'note', 'price-note', 'anchored-text', 'callout', 'price-label',
            // Polyline (background shows when shape is closed)
            'polyline',
            // Other
            'gann-box', 'label'
        ];
        return typesWithFill.includes(drawing.type);
    }

    generateColorPalette(type, selectedColor) {
        const normalizedSelected = this.normalizeColor(selectedColor);
        const currentOpacity = this.extractOpacity(selectedColor);
        
        // Row 1: Grays and Black/White
        const row1 = ['#FFFFFF', '#EBEBEB', '#D6D6D6', '#BFBFBF', '#A8A8A8', '#8F8F8F', '#757575', '#5C5C5C', '#434343', '#000000'];
        
        // Row 2: Bright colors
        const row2 = ['#FF4444', '#FF9500', '#FFEB3B', '#4CAF50', '#00BCD4', '#00E5FF', '#787b86', '#7B68EE', '#E040FB', '#FF4081'];
        
        // Row 3: Light pastels
        const row3 = ['#FFCDD2', '#FFE0B2', '#FFF9C4', '#C8E6C9', '#B2EBF2', '#B2F5FF', '#BBDEFB', '#D1C4E9', '#E1BEE7', '#F8BBD0'];
        
        // Row 4: Medium pastels
        const row4 = ['#FFAB91', '#FFCC80', '#FFF59D', '#A5D6A7', '#80DEEA', '#80E5FF', '#90CAF9', '#B39DDB', '#CE93D8', '#F48FB1'];
        
        // Row 5: Medium tones
        const row5 = ['#FF8A65', '#FFB74D', '#FFF176', '#81C784', '#4DD0E1', '#4DD5FF', '#64B5F6', '#9575CD', '#BA68C8', '#F06292'];
        
        // Row 6: Saturated colors
        const row6 = ['#FF5252', '#FFA726', '#FFEE58', '#66BB6A', '#26C6DA', '#26D4FF', '#42A5F5', '#7E57C2', '#AB47BC', '#EC407A'];
        
        // Row 7: Deep saturated
        const row7 = ['#E53935', '#FB8C00', '#FDD835', '#43A047', '#00ACC1', '#00B8D4', '#1E88E5', '#5E35B1', '#8E24AA', '#D81B60'];
        
        // Row 8: Dark tones
        const row8 = ['#C62828', '#E65100', '#F57F17', '#2E7D32', '#00838F', '#00838F', '#1565C0', '#4527A0', '#6A1B9A', '#AD1457'];
        
        const allColors = [...row1, ...row2, ...row3, ...row4, ...row5, ...row6, ...row7, ...row8];
        
        const colorGrid = allColors.map(color => {
            const normalized = this.normalizeColor(color);
            const selectedClass = normalizedSelected && normalized === normalizedSelected ? ' selected' : '';
            return `<div class="color-palette-item${selectedClass}" data-color="${color}" data-type="${type}" style="background: ${color};"></div>`;
        }).join('');
        
        // Get RGB for slider gradient
        const baseColor = this.normalizeColor(selectedColor) || '#787b86';
        const rgb = this.hexToRgb(baseColor);
        
        return `
            <div class="color-palette-grid">
                ${colorGrid}
            </div>
            <div class="color-palette-divider"></div>
            <div class="color-palette-recent">
                <div class="color-palette-recent-items">
                    <div class="color-palette-item" data-color="#131722" data-type="${type}" style="background: #131722;"></div>
                    <div class="color-palette-item" data-color="#787b86" data-type="${type}" style="background: #787b86;"></div>
                    <div class="color-palette-item" data-color="#1E3A5F" data-type="${type}" style="background: #1E3A5F;"></div>
                    <div class="color-palette-item" data-color="#262B3E" data-type="${type}" style="background: #262B3E;"></div>
                </div>
                <div class="color-palette-add" title="Add custom color">+</div>
            </div>
            <div class="color-palette-opacity">
                <span class="color-palette-opacity-label">Opacity</span>
                <div class="color-palette-opacity-control">
                    <input type="range" class="color-palette-opacity-slider" data-type="${type}" 
                           min="0" max="100" value="${Math.round(currentOpacity * 100)}"
                           style="background: linear-gradient(to right, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0), rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1));">
                    <span class="color-palette-opacity-value" data-type="${type}">${Math.round(currentOpacity * 100)}%</span>
                </div>
            </div>
        `;
    }
    
    extractOpacity(color) {
        if (!color) return 1;
        if (color.startsWith('rgba')) {
            const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
            if (match && match[4] !== undefined) {
                return parseFloat(match[4]);
            }
        }
        return 1;
    }
    
    hexToRgb(hex) {
        if (!hex) return { r: 41, g: 98, b: 255 };
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return { r: r || 0, g: g || 0, b: b || 0 };
    }
    
    applyOpacityToColor(hex, opacity) {
        const rgb = this.hexToRgb(hex);
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
    }

    position(x, y) {
        // Load saved position if available
        this.loadToolbarPosition();
        
        // If we have a saved position, use it instead of calculating from x,y
        if (this.savedPosition) {
            this.setPosition(this.savedPosition.left, this.savedPosition.top);
            return;
        }
        
        // Otherwise, calculate position based on drawing location
        const rect = this.toolbar.getBoundingClientRect();
        const verticalOffset = this.verticalOffset;
        const padding = this.viewportPadding;

        // Position above the drawing by default with extra offset
        let top = y - rect.height - verticalOffset;
        let left = x - (rect.width / 2);

        // Check if toolbar would go off-screen at the top, place it below instead
        if (top < padding) {
            top = y + verticalOffset;
        }
        
        // Check if toolbar would go off-screen at the bottom
        const maxTop = window.innerHeight - rect.height - padding;
        if (top > maxTop) {
            // Try to place it above instead
            top = y - rect.height - verticalOffset;
            // If still off-screen, clamp to max
            if (top > maxTop) {
                top = maxTop;
            }
        }
        
        // Check horizontal boundaries
        // If toolbar would go off-screen on the left
        if (left < padding) {
            left = padding;
        }
        
        // If toolbar would go off-screen on the right
        const maxLeft = window.innerWidth - rect.width - padding;
        if (left > maxLeft) {
            left = maxLeft;
        }

        this.setPosition(left, top);
    }

    setPosition(left, top) {
        const padding = this.viewportPadding;
        const rect = this.toolbar.getBoundingClientRect();

        if (left < padding) {
            left = padding;
        }
        const maxLeft = window.innerWidth - rect.width - padding;
        if (left > maxLeft) {
            left = maxLeft;
        }

        if (top < padding) {
            top = padding;
        }
        const maxTop = window.innerHeight - rect.height - padding;
        if (top > maxTop) {
            top = maxTop;
        }

        this.toolbar.style.left = `${left}px`;
        this.toolbar.style.top = `${top}px`;
    }

    setupDragHandle() {
        const handle = this.toolbar.querySelector('.toolbar-drag-handle');
        if (!handle) return;

        handle.addEventListener('mousedown', (event) => this.startDrag(event));
    }

    startDrag(event) {
        if (event.button !== 0) return; // Left click only
        event.preventDefault();

        const rect = this.toolbar.getBoundingClientRect();
        this.dragState.isDragging = true;
        this.dragState.offsetX = event.clientX - rect.left;
        this.dragState.offsetY = event.clientY - rect.top;

        document.addEventListener('mousemove', this.handleDragMove);
        document.addEventListener('mouseup', this.handleDragEnd);
    }

    handleDragMove(event) {
        if (!this.dragState.isDragging) return;
        event.preventDefault();

        const left = event.clientX - this.dragState.offsetX;
        const top = event.clientY - this.dragState.offsetY;
        this.setPosition(left, top);
    }

    handleDragEnd() {
        if (!this.dragState.isDragging) return;
        this.dragState.isDragging = false;

        document.removeEventListener('mousemove', this.handleDragMove);
        document.removeEventListener('mouseup', this.handleDragEnd);
        
        // Save the new position after dragging
        this.saveToolbarPosition();
    }

    stopDragging() {
        if (!this.dragState.isDragging) return;
        this.dragState.isDragging = false;
        document.removeEventListener('mousemove', this.handleDragMove);
        document.removeEventListener('mouseup', this.handleDragEnd);
    }

    handleToolbarMouseDown(event) {
        event.stopPropagation();

        // Ignore clicks on interactive elements (buttons, inputs, etc.)
        if (event.target.closest('button, input, label, select, textarea, .toolbar-btn, .toolbar-color-label')) {
            return;
        }

        // Allow dragging from handle or empty toolbar areas
        if (event.target.closest('.toolbar-drag-handle') || event.target.closest('.drawing-toolbar')) {
            this.startDrag(event);
        }
    }

    setupEventHandlers() {
        this.setupDragHandle();
        const drawing = this.currentDrawing;
        if (!drawing) return;

        // Check if this tool uses style.color instead of stroke
        const colorOnlyTools = [];
        const isColorOnlyTool = colorOnlyTools.includes(drawing.type);

        // Track current colors and opacity based on tool type
        let primaryColor;
        if (isColorOnlyTool) {
            primaryColor = drawing.style.color || '#787b86';
        } else if (this.isTextTool(drawing)) {
            primaryColor = drawing.style.textColor || drawing.style.stroke || '#787b86';
        } else if (drawing.type === 'table') {
            primaryColor = drawing.style.borderColor || '#363A45';
        } else {
            primaryColor = drawing.style.stroke || '#787b86';
        }
        
        this._strokeBaseColor = this.normalizeColor(primaryColor);
        this._strokeOpacity = this.extractOpacity(primaryColor);
        this._fillBaseColor = this.normalizeColor(drawing.style.fill || drawing.style.backgroundColor || '#787b86');
        this._fillOpacity = this.extractOpacity(drawing.style.fill || drawing.style.backgroundColor);
        this._isColorOnlyTool = isColorOnlyTool;
        
        // Stroke color picker (shared with Settings)
        const strokePreview = this.toolbar.querySelector('#stroke-color-preview');
        const strokePalette = this.toolbar.querySelector('#stroke-color-palette');
        if (strokePreview) {
            this.updateColorPreview(strokePreview, primaryColor);
            if (strokePalette) strokePalette.classList.remove('active');

            strokePreview.addEventListener('click', (e) => {
                e.stopPropagation();

                // Close other dropdowns first (Line style/width/template/etc)
                this.toolbar.querySelectorAll('.toolbar-dropdown').forEach(d => d.classList.remove('active'));
                this.closeColorPickerPopups();

                // Close any inline palettes if present
                this.toolbar.querySelectorAll('.color-palette').forEach(p => p.classList.remove('active'));

                if (typeof openColorPicker === 'function') {
                    openColorPicker(primaryColor, (newColor) => {
                        primaryColor = newColor;
                        this._strokeBaseColor = this.normalizeColor(newColor);
                        this._strokeOpacity = this.extractOpacity(newColor);

                        if (this._isColorOnlyTool) {
                            drawing.style.color = newColor;
                        } else if (this.isTextTool(drawing)) {
                            drawing.style.textColor = newColor;
                            drawing.style.stroke = newColor;
                        } else if (drawing.type === 'table') {
                            drawing.style.borderColor = newColor;
                        } else {
                            drawing.style.stroke = newColor;
                            drawing.style.color = newColor;
                        }

                        this.updateColorPreview(strokePreview, newColor);

                        if (drawing.showAxisHighlights) {
                            drawing.showAxisHighlights();
                        }
                        if (this.onUpdate) {
                            this.onUpdate(drawing);
                        }
                    }, strokePreview);
                }
            });
        }

        // Fill color picker (shared with Settings)
        const fillPreview = this.toolbar.querySelector('#fill-color-preview');
        const fillPalette = this.toolbar.querySelector('#fill-color-palette');
        if (fillPreview) {
            const getCurrentFillColor = () => {
                const fill = drawing.style.fill;
                if (fill && fill !== 'none') return fill;
                return drawing.style.backgroundColor || '#787b86';
            };
            this.updateColorPreview(fillPreview, getCurrentFillColor());
            if (fillPalette) fillPalette.classList.remove('active');

            fillPreview.addEventListener('click', (e) => {
                e.stopPropagation();

                // Close other dropdowns first
                this.toolbar.querySelectorAll('.toolbar-dropdown').forEach(d => d.classList.remove('active'));
                this.closeColorPickerPopups();

                // Close any inline palettes if present
                this.toolbar.querySelectorAll('.color-palette').forEach(p => p.classList.remove('active'));

                const currentFillColor = getCurrentFillColor();
                if (typeof openColorPicker === 'function') {
                    openColorPicker(currentFillColor, (newColor) => {
                        this._fillBaseColor = this.normalizeColor(newColor);
                        this._fillOpacity = this.extractOpacity(newColor);

                        drawing.style.fill = newColor;
                        if (this.isNoteBox(drawing)) {
                            drawing.style.backgroundColor = newColor;
                        }

                        // Show opaque version in underline so it's always visible
                        const opaqueColor = (function(c) {
                            const m = c.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
                            return m ? 'rgb(' + m[1] + ',' + m[2] + ',' + m[3] + ')' : c;
                        })(newColor);
                        this.updateColorPreview(fillPreview, opaqueColor);
                        if (this.onUpdate) {
                            this.onUpdate(drawing);
                        }
                    }, fillPreview);
                }
            });
        }
        
        if (this.isTextTool(drawing) || this.isNoteBox(drawing)) {
            const fontSizeInput = this.toolbar.querySelector('#tb-font-size');
            if (fontSizeInput) {
                fontSizeInput.addEventListener('input', () => {
                    const value = this.clampNumber(parseInt(fontSizeInput.value, 10) || 14, 8, 99);
                    fontSizeInput.value = value;
                    drawing.style.fontSize = value;
                    if (this.onUpdate) {
                        this.onUpdate(drawing);
                    }
                });
            }

            const textArea = this.toolbar.querySelector('#tb-text-content');
            if (textArea) {
                textArea.addEventListener('input', () => {
                    const normalized = textArea.value.replace(/\r\n/g, '\n');
                    if (typeof drawing.setText === 'function') {
                        drawing.setText(normalized);
                    } else {
                        drawing.text = normalized;
                    }
                    if (this.onUpdate) {
                        this.onUpdate(drawing);
                    }
                });
            }
        }

        // Line Style Dropdown
        const styleBtn = this.toolbar.querySelector('#tb-style-btn');
        const styleDropdown = this.toolbar.querySelector('#line-style-dropdown');
        if (styleBtn && styleDropdown) {
            styleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeColorPickerPopups();
                // Close other dropdowns
                this.toolbar.querySelectorAll('.toolbar-dropdown').forEach(d => {
                    if (d !== styleDropdown) d.classList.remove('active');
                });
                this.toolbar.querySelectorAll('.color-palette').forEach(p => p.classList.remove('active'));
                styleDropdown.classList.toggle('active');
            });
            
            styleDropdown.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = e.target.closest('.toolbar-dropdown-item');
                if (item) {
                    const dash = item.dataset.dash;
                    drawing.style.dashArray = dash;
                    drawing.style.strokeDasharray = dash;
                    
                    // Update button icon
                    styleBtn.innerHTML = `<svg width="32" height="24" viewBox="0 0 32 24"><line x1="2" y1="12" x2="30" y2="12" stroke="currentColor" stroke-width="2" stroke-dasharray="${dash}"/></svg>`;
                    
                    // Update active state
                    styleDropdown.querySelectorAll('.toolbar-dropdown-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    
                    styleDropdown.classList.remove('active');
                    if (this.onUpdate) this.onUpdate(drawing);
                }
            });
        }
        
        // Line Width Dropdown
        const widthBtn = this.toolbar.querySelector('#tb-width-btn');
        const widthDropdown = this.toolbar.querySelector('#line-width-dropdown');
        if (widthBtn && widthDropdown) {
            widthBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeColorPickerPopups();
                // Close other dropdowns
                this.toolbar.querySelectorAll('.toolbar-dropdown').forEach(d => {
                    if (d !== widthDropdown) d.classList.remove('active');
                });
                this.toolbar.querySelectorAll('.color-palette').forEach(p => p.classList.remove('active'));
                widthDropdown.classList.toggle('active');
            });
            
            widthDropdown.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = e.target.closest('.toolbar-dropdown-item');
                if (item) {
                    const width = parseInt(item.dataset.width);
                    drawing.style.strokeWidth = width;
                    
                    // Update button text
                    widthBtn.innerHTML = `<span class="toolbar-width-text">${width}px</span>`;
                    
                    // Update active state
                    widthDropdown.querySelectorAll('.toolbar-dropdown-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    
                    widthDropdown.classList.remove('active');
                    if (this.onUpdate) this.onUpdate(drawing);
                }
            });
        }

        // Template Dropdown (for brush/highlighter)
        const templateBtn = this.toolbar.querySelector('#tb-template');
        const templateDropdown = this.toolbar.querySelector('#template-dropdown');
        if (templateBtn && templateDropdown) {
            templateBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeColorPickerPopups();
                // Close other dropdowns
                this.toolbar.querySelectorAll('.toolbar-dropdown').forEach(d => {
                    if (d !== templateDropdown) d.classList.remove('active');
                });
                this.toolbar.querySelectorAll('.color-palette').forEach(p => p.classList.remove('active'));
                templateDropdown.classList.toggle('active');
            });
            
            templateDropdown.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Handle delete button click
                const deleteBtn = e.target.closest('.template-item-delete');
                if (deleteBtn) {
                    const templateId = deleteBtn.dataset.templateId;
                    this.deleteTemplate(drawing.type, templateId);
                    this.updateTemplateDropdownUI(drawing.type);
                    return;
                }
                
                // Handle template item click (apply saved template)
                const templateItem = e.target.closest('.template-item');
                if (templateItem) {
                    const templateId = templateItem.dataset.templateId;
                    this.applyTemplate(drawing, templateId);
                    templateDropdown.classList.remove('active');
                    return;
                }
                
                const item = e.target.closest('.toolbar-dropdown-item');
                if (item) {
                    const action = item.dataset.action;
                    
                    if (action === 'save-template') {
                        // Show name input dialog
                        this.showSaveTemplateDialog(drawing, templateDropdown);
                    } else if (action === 'apply-default') {
                        // Apply default template to drawing
                        this.applyDefaultTemplate(drawing);
                        templateDropdown.classList.remove('active');
                    }
                }
            });
        }

        // Shape settings
        const shapeBtn = this.toolbar.querySelector('#tb-shape-settings');
        if (shapeBtn) {
            shapeBtn.addEventListener('click', () => {
                this.onMoreOptions(drawing);
            });
        }

        // Lock
        const lockBtn = this.toolbar.querySelector('#tb-lock');
        if (lockBtn) {
            lockBtn.addEventListener('click', () => {
                drawing.locked = !drawing.locked;
                lockBtn.classList.toggle('active', drawing.locked);
                
                // Update icon
                lockBtn.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${drawing.locked ? 
                            '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>' :
                            '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M17 11V7a5 5 0 00-5-5 5 5 0 00-3 .9"/>'}
                    </svg>
                `;
                
                this.onUpdate(drawing);
            });
        }

        // Execute button (for Risk/Reward tools)
        const executeBtn = this.toolbar.querySelector('#tb-execute');
        if (executeBtn) {
            executeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Check if already executed
                if (drawing.meta?.executed) {
                    return;
                }
                
                // Mark as executed
                if (!drawing.meta) drawing.meta = {};
                drawing.meta.executed = true;
                
                // Execute the order
                if (typeof drawing.executeOrder === 'function') {
                    const entry = drawing.points[0];
                    const stop = drawing.points[1];
                    const target = drawing.points[2];
                    drawing.executeOrder(entry, stop, target);
                }
                
                // Update button appearance
                executeBtn.style.color = '#22c55e';
                executeBtn.classList.add('executed');
                executeBtn.title = 'Order Executed';
                executeBtn.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="20 6 9 17 4 12"/>
                    </svg>
                `;
                
                if (this.onUpdate) this.onUpdate(drawing);
            });
        }

        // Settings button
        const settingsBtn = this.toolbar.querySelector('#tb-settings');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hide(); // Hide toolbar when opening settings
                this.onSettings(drawing);
            });
        }
        
        // Delete
        const deleteBtn = this.toolbar.querySelector('#tb-delete');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                this.onDelete(drawing);
                this.hide();
            });
        }

        // More options (show context menu)
        const moreBtn = this.toolbar.querySelector('#tb-more');
        if (moreBtn) {
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                const rect = moreBtn.getBoundingClientRect();
                this.onMoreOptions(drawing, rect.left, rect.bottom + 5);
            });
        }
    }

    /**
     * Convert rgba to hex (same as settings panel)
     */
    rgbaToHex(rgba) {
        if (!rgba || rgba.startsWith('#')) return rgba || '#000000';
        
        const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!match) return '#000000';
        
        const r = parseInt(match[1]).toString(16).padStart(2, '0');
        const g = parseInt(match[2]).toString(16).padStart(2, '0');
        const b = parseInt(match[3]).toString(16).padStart(2, '0');
        
        return `#${r}${g}${b}`;
    }

    /**
     * Fallback native color picker (if custom ColorPicker not available)
     */
    showNativeColorPicker(currentColor, callback) {
        // Create temporary color input
        const input = document.createElement('input');
        input.type = 'color';
        input.value = currentColor;
        input.style.cssText = 'position: absolute; opacity: 0; pointer-events: none;';
        document.body.appendChild(input);
        
        let colorChanged = false;
        
        // Handle color change
        const handleChange = () => {
            if (!colorChanged) {
                colorChanged = true;
                callback(input.value);
                setTimeout(() => {
                    if (document.body.contains(input)) {
                        document.body.removeChild(input);
                    }
                }, 100);
            }
        };
        
        input.addEventListener('input', handleChange);
        input.addEventListener('change', handleChange);
        
        // Small delay to ensure input is in DOM
        setTimeout(() => input.click(), 10);
    }

    hide() {
        this.visible = false;
        this.toolbar.style.display = 'none';
        this.currentDrawing = null;
        this.stopDragging();
        
        // Close all dropdowns and color palettes
        this.toolbar.querySelectorAll('.toolbar-dropdown').forEach(d => d.classList.remove('active'));
        this.toolbar.querySelectorAll('.color-palette').forEach(p => p.classList.remove('active'));
        
        if (this.colorPicker && this.colorPicker.hide) {
            this.colorPicker.hide(); // Also hide color picker if available
        }
        document.removeEventListener('click', this.handleDocumentClick, true);
    }

    handleDocumentClick(event) {
        if (!this.visible || !this.toolbar.contains(event.target)) {
            this.toolbar.querySelectorAll('.color-palette').forEach(palette => palette.classList.remove('active'));
        }
    }

    isTextTool(drawing) {
        const textTypes = ['text', 'anchored-text', 'note', 'callout', 'price-label', 'pin'];
        return drawing && textTypes.includes(drawing.type);
    }

    isNoteBox(drawing) {
        const noteTypes = ['notebox', 'note', 'price-note', 'callout', 'pin'];
        return drawing && noteTypes.includes(drawing.type);
    }

    updatePaletteSelection(paletteElement, color) {
        if (!paletteElement) return;
        const normalized = this.normalizeColor(color);
        paletteElement.querySelectorAll('.color-palette-item').forEach(item => {
            const itemColor = this.normalizeColor(item.dataset.color);
            if (itemColor === normalized) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }
    
    updateSliderGradient(paletteElement, color) {
        if (!paletteElement) return;
        const slider = paletteElement.querySelector('.color-palette-opacity-slider');
        if (slider) {
            const rgb = this.hexToRgb(color);
            slider.style.background = `linear-gradient(to right, rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0), rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1))`;
        }
    }
    
    updateColorPreview(previewElement, color) {
        if (!previewElement) return;
        // Check if it's the new icon wrapper style
        const underline = previewElement.querySelector('.toolbar-color-underline');
        if (underline) {
            underline.style.background = color;
        } else {
            // Fallback for old style
            previewElement.style.background = color;
        }
    }

    normalizeColor(color) {
        if (!color) return null;
        if (color.startsWith('#')) {
            return color.length === 4 ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toUpperCase() : color.substring(0, 7).toUpperCase();
        }
        const rgbaMatch = color.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (rgbaMatch) {
            const [ , r, g, b ] = rgbaMatch;
            return `#${parseInt(r, 10).toString(16).padStart(2, '0')}${parseInt(g, 10).toString(16).padStart(2, '0')}${parseInt(b, 10).toString(16).padStart(2, '0')}`.toUpperCase();
        }
        return color.toUpperCase();
    }

    clampNumber(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    escapeHtml(text) {
        if (!text) return '';
        return text.replace(/[&<>"]+/g, (c) => {
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
            return map[c] || c;
        });
    }

    // Callbacks (to be set by DrawingToolsManager)
    onUpdate(drawing) {
        // Override this
        console.log('Drawing updated:', drawing);
    }

    onDelete(drawing) {
        // Override this
        console.log('Drawing deleted:', drawing);
    }

    onMoreOptions(drawing, x, y) {
        // Override this - will show context menu
        console.log('More options for:', drawing, 'at', x, y);
    }
    
    onSettings(drawing) {
        // Override this - will open settings panel
        console.log('Settings for:', drawing);
    }
    
    onLock(drawing) {
        // Override this - will toggle lock
        console.log('Lock toggled for:', drawing);
    }

    // Template methods for brush/highlighter
    getTemplatesKey(toolType) {
        return `drawing_templates_${toolType}`;
    }

    deepClone(obj) {
        if (obj === undefined) return undefined;
        return JSON.parse(JSON.stringify(obj));
    }

    getSavedTemplates(toolType) {
        const key = this.getTemplatesKey(toolType);
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : [];
    }

    getSavedTemplatesHTML(toolType) {
        const templates = this.getSavedTemplates(toolType);
        if (templates.length === 0) return '';
        
        return templates.map(t => `
            <div class="template-item" data-template-id="${t.id}">
                <div class="template-item-name">
                    <span>${t.name}</span>
                </div>
                <div class="template-item-delete" data-template-id="${t.id}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </div>
            </div>
        `).join('');
    }

    showSaveTemplateDialog(drawing, dropdown) {
        // Create input dialog
        const dialog = document.createElement('div');
        dialog.className = 'template-save-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #000000;
            border: 1px solid #2a2e39;
            border-radius: 8px;
            padding: 16px;
            z-index: 10003;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            min-width: 280px;
        `;
        dialog.innerHTML = `
            <div style="color: #d1d4dc; font-size: 14px; margin-bottom: 12px;">Save Template</div>
            <style>
                .template-save-dialog input::placeholder { color: #787b86; }
            </style>
            <input type="text" id="template-name-input" placeholder="Template name..." style="
                width: 100%;
                padding: 8px 12px;
                background: #0b0c0e;
                border: 1px solid #2a2e39;
                border-radius: 4px;
                color: #d1d4dc;
                font-size: 13px;
                outline: none;
                box-sizing: border-box;
            "/>
            <div style="display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end;">
                <button id="template-cancel-btn" style="
                    padding: 6px 14px;
                    background: #1a1c20;
                    border: 1px solid #2a2e39;
                    border-radius: 4px;
                    color: #d1d4dc;
                    cursor: default;
                    font-size: 13px;
                ">Cancel</button>
                <button id="template-save-btn" style="
                    padding: 6px 14px;
                    background: #2962ff;
                    border: none;
                    border-radius: 4px;
                    color: #fff;
                    cursor: default;
                    font-size: 13px;
                ">Save</button>
            </div>
        `;
        
        // Backdrop
        const backdrop = document.createElement('div');
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.6);
            z-index: 10002;
        `;
        
        document.body.appendChild(backdrop);
        document.body.appendChild(dialog);
        
        const input = dialog.querySelector('#template-name-input');
        input.focus();
        
        const closeDialog = () => {
            dialog.remove();
            backdrop.remove();
            dropdown.classList.remove('active');
        };
        
        backdrop.addEventListener('click', closeDialog);
        dialog.querySelector('#template-cancel-btn').addEventListener('click', closeDialog);
        
        const saveTemplate = () => {
            const name = input.value.trim();
            if (!name) {
                input.style.borderColor = '#ff5252';
                return;
            }
            
            const drawingManager = window.chart?.drawingManager || window.drawingManager;
            const actualDrawing = drawingManager?.drawings?.find(d => d.id === drawing.id) || drawing;

            const templates = this.getSavedTemplates(actualDrawing.type);
            const styleSnapshot = this.deepClone(actualDrawing.style || {});
            const newTemplate = {
                id: Date.now().toString(),
                name: name,
                style: styleSnapshot,
                text: actualDrawing.text,
                levels: this.deepClone(actualDrawing.levels),
                stroke: (styleSnapshot && styleSnapshot.stroke) || (actualDrawing.style && actualDrawing.style.stroke),
                strokeWidth: (styleSnapshot && styleSnapshot.strokeWidth) || (actualDrawing.style && actualDrawing.style.strokeWidth),
                fill: (styleSnapshot && styleSnapshot.fill) || (actualDrawing.style && actualDrawing.style.fill),
                opacity: (styleSnapshot && styleSnapshot.opacity !== undefined) ? styleSnapshot.opacity : (actualDrawing.style && actualDrawing.style.opacity)
            };
            templates.push(newTemplate);
            localStorage.setItem(this.getTemplatesKey(actualDrawing.type), JSON.stringify(templates));

            window.dispatchEvent(new CustomEvent('drawingTemplatesUpdated', {
                detail: { toolType: actualDrawing.type }
            }));
            
            closeDialog();
            this.showNotification(`Template "${name}" saved!`);
        };
        
        dialog.querySelector('#template-save-btn').addEventListener('click', saveTemplate);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveTemplate();
            if (e.key === 'Escape') closeDialog();
        });
    }

    applyTemplate(drawing, templateId) {
        const drawingManager = window.chart?.drawingManager || window.drawingManager;
        const actualDrawing = drawingManager?.drawings?.find(d => d.id === drawing.id) || drawing;

        const templates = this.getSavedTemplates(actualDrawing.type);
        const template = templates.find(t => t.id === templateId);
        
        if (template) {
            if (!actualDrawing.style) actualDrawing.style = {};

            if (template.style) {
                for (const k in actualDrawing.style) {
                    if (Object.prototype.hasOwnProperty.call(actualDrawing.style, k)) delete actualDrawing.style[k];
                }
                Object.assign(actualDrawing.style, this.deepClone(template.style));
            } else {
                actualDrawing.style.stroke = template.stroke;
                actualDrawing.style.strokeWidth = template.strokeWidth;
                if (template.fill) actualDrawing.style.fill = template.fill;
                if (template.opacity !== undefined) actualDrawing.style.opacity = template.opacity;
            }

            if (template.text !== undefined) {
                actualDrawing.text = template.text;
                if (typeof actualDrawing.setText === 'function') actualDrawing.setText(template.text);
            }

            if (template.levels) {
                actualDrawing.levels = this.deepClone(template.levels);
            }
            
            // Refresh toolbar
            this.show(actualDrawing, 
                this.toolbar.getBoundingClientRect().left, 
                this.toolbar.getBoundingClientRect().top
            );
            
            if (this.onUpdate) this.onUpdate(actualDrawing);
            this.showNotification(`Template "${template.name}" applied!`);
        }
    }

    applyDefaultTemplate(drawing) {
        const templates = this.getSavedTemplates(drawing.type);
        if (templates.length > 0) {
            // Apply the first saved template as default
            this.applyTemplate(drawing, templates[0].id);
        } else {
            this.showNotification('No saved templates found');
        }
    }

    deleteTemplate(toolType, templateId) {
        let templates = this.getSavedTemplates(toolType);
        templates = templates.filter(t => t.id !== templateId);
        localStorage.setItem(this.getTemplatesKey(toolType), JSON.stringify(templates));
        window.dispatchEvent(new CustomEvent('drawingTemplatesUpdated', {
            detail: { toolType }
        }));
        this.showNotification('Template deleted');
    }

    showNotification(message) {
        // Create a simple notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background: #2a2e39;
            color: #d1d4dc;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 13px;
            z-index: 10002;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 2000);
    }

    saveToolbarPosition() {
        if (!this.toolbar) return;
        const rect = this.toolbar.getBoundingClientRect();
        const position = { left: rect.left, top: rect.top };
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(position));
            this.savedPosition = position;
        } catch (err) {
            console.warn('⚠️ Failed to save toolbar position', err);
        }
    }

    loadToolbarPosition() {
        if (this.savedPosition) return; // Already loaded
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                this.savedPosition = JSON.parse(stored);
            }
        } catch (err) {
            console.warn('⚠️ Failed to load toolbar position', err);
        }
    }
}

// Global color picker instance (created once, reused)
let _globalColorPicker = null;

// Global helper function to open color picker from anywhere
window.openColorPicker = function(currentColor, callback, buttonElement) {
    // Use drawingToolbar's colorPicker if available
    let picker = window.drawingToolbar && window.drawingToolbar.colorPicker;
    
    // If not available, create/reuse global instance
    if (!picker) {
        if (!_globalColorPicker && typeof ColorPicker !== 'undefined') {
            _globalColorPicker = new ColorPicker();
        }
        picker = _globalColorPicker;
    }
    
    if (picker) {
        const rect = buttonElement.getBoundingClientRect();
        const x = rect.left;
        const y = rect.bottom;
        picker.show(x, y, currentColor, callback, buttonElement);
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DrawingToolbar;
}