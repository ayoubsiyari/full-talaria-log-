/**
 * ToolLifecycleStore — shared drawing tool lifecycle event bus.
 *
 * T1 step 3 scope: steps 1-3 subscribers only (toolbar/V9 sync, labels, settings/context menu).
 * Later steps own object-tree migration, manager-flag collapse, legacy Chart selection, and per-tool cleanup.
 */
(function (global) {
    'use strict';

    class ToolLifecycleStore {
        constructor(drawingManager) {
            this.drawingManager = drawingManager;
            this.listeners = new Map();
        }

        isEnabled() {
            return !(global && global.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2);
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
    }

    global.ToolLifecycleStore = ToolLifecycleStore;
})(typeof window !== 'undefined' ? window : globalThis);
