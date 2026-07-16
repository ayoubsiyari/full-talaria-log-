/**
 * ToolLifecycleStore — shared drawing tool lifecycle event bus.
 *
 * T1 lifecycle store: central drawing selection/hover/edit/delete event owner.
 */
(function (global) {
    'use strict';

    /** D-018 Phase 1 master slice: unset = iframe engine substrate ON; true = fallback-B revert. */
    function _isMcRemigrationPhase1EngineSliceActive() {
        if (!global || typeof global === 'undefined') return true;
        return !global.__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE;
    }

    class ToolLifecycleStore {
        constructor(drawingManager) {
            this.drawingManager = drawingManager;
            this.listeners = new Map();
            this.state = {
                selectedDrawing: null,
                selectedDrawings: [],
                hoveredDrawing: null,
                editingDrawing: null,
            };
        }

        isEnabled() {
            if (global && global.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2) return false;
            if (this._isMultichartIframeEmbed()) {
                if (!_isMcRemigrationPhase1EngineSliceActive()) {
                    return !!(global && global.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2 === false);
                }
                return true;
            }
            return true;
        }

        _isMultichartIframeEmbed() {
            const chart = this.drawingManager && this.drawingManager.chart;
            if (chart && typeof chart._isMultichartEmbedPanel === 'function') {
                try { return !!chart._isMultichartEmbedPanel(); } catch (_) { /* ignore */ }
            }
            if (!global || !global.document || global.parent === global) return false;
            try {
                if (global.parent && global.parent.__multichartGrid) return true;
            } catch (_) { /* cross-origin */ }
            try {
                if (global.document.documentElement.classList.contains('multichart-embed')) return true;
            } catch (_) { /* ignore */ }
            try {
                return new URLSearchParams(global.location && global.location.search || '').get('multichart') === '1';
            } catch (_) {
                return false;
            }
        }

        on(eventName, handler) {
            if (!eventName || typeof handler !== 'function') return () => {};
            if (!this.listeners.has(eventName)) {
                this.listeners.set(eventName, new Set());
            }
            const handlers = this.listeners.get(eventName);
            handlers.add(handler);
            return () => handlers.delete(handler);
        }

        emit(eventName, detail = {}) {
            if (!this.isEnabled()) return false;
            this._reduce(eventName, detail);
            const handlers = this.listeners.get(eventName);
            if (!handlers || handlers.size === 0) return false;
            const payload = {
                ...detail,
                manager: detail.manager || this.drawingManager,
                store: this,
                eventName,
            };
            handlers.forEach((handler) => {
                handler(payload);
            });
            return true;
        }

        getSnapshot() {
            return {
                selectedDrawing: this.state.selectedDrawing,
                selectedDrawings: this.state.selectedDrawings.slice(),
                hoveredDrawing: this.state.hoveredDrawing,
                editingDrawing: this.state.editingDrawing,
            };
        }

        getSelectedDrawing() {
            return this.state.selectedDrawing || null;
        }

        getSelectedDrawings() {
            return this.state.selectedDrawings.slice();
        }

        _reduce(eventName, detail) {
            const drawing = detail && detail.drawing ? detail.drawing : null;
            if (eventName === 'toolSelected') {
                this.state.selectedDrawing = drawing;
                this.state.selectedDrawings = drawing ? [drawing] : [];
            } else if (eventName === 'toolDeselected') {
                this.state.selectedDrawing = null;
                this.state.selectedDrawings = [];
                this.state.editingDrawing = null;
            } else if (eventName === 'toolDeleted') {
                const deletedId = drawing && drawing.id != null ? String(drawing.id) : null;
                this.state.selectedDrawings = this.state.selectedDrawings.filter((d) => {
                    if (!d) return false;
                    return !(deletedId && d.id != null && String(d.id) === deletedId) && d !== drawing;
                });
                this.state.selectedDrawing = this.state.selectedDrawings[0] || null;
                if (this.state.hoveredDrawing === drawing || (deletedId && this.state.hoveredDrawing && String(this.state.hoveredDrawing.id) === deletedId)) {
                    this.state.hoveredDrawing = null;
                }
                if (this.state.editingDrawing === drawing || (deletedId && this.state.editingDrawing && String(this.state.editingDrawing.id) === deletedId)) {
                    this.state.editingDrawing = null;
                }
            } else if (eventName === 'toolHovered') {
                this.state.hoveredDrawing = drawing;
            } else if (eventName === 'toolHoverCleared') {
                this.state.hoveredDrawing = null;
            } else if (eventName === 'toolEditStarted') {
                this.state.editingDrawing = drawing;
            } else if (eventName === 'toolEditEnded') {
                if (!drawing || this.state.editingDrawing === drawing) {
                    this.state.editingDrawing = null;
                }
            }
        }
    }

    global.ToolLifecycleStore = ToolLifecycleStore;
})(typeof window !== 'undefined' ? window : globalThis);
