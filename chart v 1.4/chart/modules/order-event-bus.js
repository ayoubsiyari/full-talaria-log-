class OrderEventBus {
    constructor() {
        this.listeners = new Map();
    }

    on(eventName, handler) {
        if (!eventName || typeof handler !== 'function') {
            return () => {};
        }

        const handlers = this.listeners.get(eventName) || new Set();
        handlers.add(handler);
        this.listeners.set(eventName, handlers);

        return () => this.off(eventName, handler);
    }

    once(eventName, handler) {
        if (!eventName || typeof handler !== 'function') {
            return () => {};
        }

        const off = this.on(eventName, (...args) => {
            try {
                handler(...args);
            } finally {
                off();
            }
        });

        return off;
    }

    off(eventName, handler) {
        if (!eventName) return;

        const handlers = this.listeners.get(eventName);
        if (!handlers) return;

        handlers.delete(handler);
        if (handlers.size === 0) {
            this.listeners.delete(eventName);
        }
    }

    emit(eventName, payload) {
        if (!eventName) return;

        const handlers = this.listeners.get(eventName);
        if (!handlers || handlers.size === 0) return;

        handlers.forEach(handler => {
            try {
                handler(payload);
            } catch (error) {
                console.error(`[OrderEventBus] Handler error for ${eventName}:`, error);
            }
        });
    }
}

if (typeof window !== 'undefined') {
    window.OrderEventBus = OrderEventBus;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OrderEventBus;
}
