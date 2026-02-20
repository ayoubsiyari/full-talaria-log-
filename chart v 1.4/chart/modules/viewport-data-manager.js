/**
 * ViewportDataManager - Handles viewport-based lazy loading of candle data.
 * 
 * Instead of loading entire datasets, this manager:
 * 1. Computes the visible timestamp range from the chart's x-scale
 * 2. Requests only missing chunks from the /api/file/{id}/candles endpoint
 * 3. Merges sorted candles into a unified array
 * 4. Evicts old chunks via LRU when memory budget is exceeded
 * 5. Prefetches adjacent chunks in the background
 */
export class ViewportDataManager {
    constructor(chart) {
        this.chart = chart;
        this.apiUrl = chart.apiUrl || '';
        this.fileId = null;
        this.timeframe = '1m';
        
        // Chunk cache: Map<string, {candles: Array, lastAccess: number}>
        // Key format: "{startTs}_{endTs}"
        this.chunkCache = new Map();
        
        // All loaded candles merged and sorted
        this.mergedCandles = [];
        
        // Config
        this.chunkSize = 5000;        // candles per request
        this.maxCachedChunks = 20;    // LRU eviction threshold
        this.bufferMultiplier = 1.5;  // load 1.5x visible range
        this.prefetchEnabled = true;
        
        // State
        this.loading = false;
        this.pendingRequests = new Map();
        this.lastVisibleRange = null;
        
        // Session date bounds
        this.sessionStartTs = null;
        this.sessionEndTs = null;
        
        // Cursors for pagination
        this.nextCursor = null;
        this.prevCursor = null;
        this.hasMoreLeft = false;
        this.hasMoreRight = false;
    }
    
    /**
     * Initialize with file and session info
     */
    init(fileId, timeframe, sessionStartTs, sessionEndTs) {
        this.fileId = fileId;
        this.timeframe = timeframe || '1m';
        this.sessionStartTs = sessionStartTs || null;
        this.sessionEndTs = sessionEndTs || null;
        this.clearCache();
    }
    
    /**
     * Clear all cached data
     */
    clearCache() {
        this.chunkCache.clear();
        this.mergedCandles = [];
        this.nextCursor = null;
        this.prevCursor = null;
        this.hasMoreLeft = false;
        this.hasMoreRight = false;
        this.pendingRequests.clear();
    }
    
    /**
     * Change timeframe - clears cache and reloads
     */
    setTimeframe(timeframe) {
        this.timeframe = timeframe;
        this.clearCache();
    }
    
    /**
     * Load initial data for the visible viewport
     * @param {number} startTs - Start timestamp of visible range
     * @param {number} endTs - End timestamp of visible range
     * @returns {Promise<Array>} Candles for the visible range
     */
    async loadViewport(startTs, endTs) {
        // Expand range by buffer
        const range = endTs - startTs;
        const buffer = range * (this.bufferMultiplier - 1) / 2;
        const bufferedStart = Math.max(startTs - buffer, this.sessionStartTs || 0);
        const bufferedEnd = this.sessionEndTs ? Math.min(endTs + buffer, this.sessionEndTs) : endTs + buffer;
        
        // Check if we already have data for this range
        if (this.hasDataForRange(bufferedStart, bufferedEnd)) {
            this.lastVisibleRange = { startTs, endTs };
            return this.getCandlesInRange(bufferedStart, bufferedEnd);
        }
        
        // Fetch missing data
        const candles = await this.fetchCandles(bufferedStart, bufferedEnd);
        this.lastVisibleRange = { startTs, endTs };
        
        // Trigger prefetch in background
        if (this.prefetchEnabled) {
            this.prefetchAdjacent(bufferedStart, bufferedEnd, range);
        }
        
        return candles;
    }
    
    /**
     * Load initial chunk (first load, no viewport info yet)
     * @returns {Promise<Array>} Initial candles
     */
    async loadInitial() {
        const result = await this.fetchFromAPI({
            timeframe: this.timeframe,
            start_ts: this.sessionStartTs,
            end_ts: this.sessionEndTs,
            limit: this.chunkSize
        });
        
        if (result && result.data) {
            const candles = this.columnarToCandles(result.data);
            this.addToCache(candles);
            this.hasMoreRight = result.has_more_right;
            this.hasMoreLeft = result.has_more_left;
            this.nextCursor = result.next_cursor;
            this.prevCursor = result.prev_cursor;
            return candles;
        }
        
        return [];
    }
    
    /**
     * Load more data in a direction (for panning)
     * @param {string} direction - "forward" or "backward"
     * @returns {Promise<Array>} Additional candles
     */
    async loadMore(direction) {
        if (this.loading) return [];
        
        const cursor = direction === 'forward' ? this.nextCursor : this.prevCursor;
        if (!cursor) return [];
        
        if (direction === 'forward' && !this.hasMoreRight) return [];
        if (direction === 'backward' && !this.hasMoreLeft) return [];
        
        const result = await this.fetchFromAPI({
            timeframe: this.timeframe,
            start_ts: this.sessionStartTs,
            end_ts: this.sessionEndTs,
            limit: this.chunkSize,
            cursor: cursor,
            direction: direction
        });
        
        if (result && result.data) {
            const candles = this.columnarToCandles(result.data);
            this.addToCache(candles);
            
            if (direction === 'forward') {
                this.hasMoreRight = result.has_more_right;
                this.nextCursor = result.next_cursor;
            } else {
                this.hasMoreLeft = result.has_more_left;
                this.prevCursor = result.prev_cursor;
            }
            
            return candles;
        }
        
        return [];
    }
    
    /**
     * Fetch candles for a specific time range
     */
    async fetchCandles(startTs, endTs) {
        const result = await this.fetchFromAPI({
            timeframe: this.timeframe,
            start_ts: Math.floor(startTs),
            end_ts: Math.ceil(endTs),
            limit: this.chunkSize
        });
        
        if (result && result.data) {
            const candles = this.columnarToCandles(result.data);
            this.addToCache(candles);
            this.hasMoreRight = result.has_more_right;
            this.hasMoreLeft = result.has_more_left;
            this.nextCursor = result.next_cursor;
            this.prevCursor = result.prev_cursor;
            return candles;
        }
        
        return [];
    }
    
    /**
     * Make API request to /api/file/{id}/candles
     */
    async fetchFromAPI(params) {
        if (!this.fileId) return null;
        
        const requestKey = JSON.stringify(params);
        if (this.pendingRequests.has(requestKey)) {
            return this.pendingRequests.get(requestKey);
        }
        
        this.loading = true;
        
        const queryParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            if (value !== null && value !== undefined) {
                queryParams.set(key, String(value));
            }
        }
        
        const url = `${this.apiUrl}/file/${this.fileId}/candles?${queryParams.toString()}`;
        
        const promise = fetch(url)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .catch(err => {
                console.error('ViewportDataManager fetch error:', err);
                return null;
            })
            .finally(() => {
                this.loading = false;
                this.pendingRequests.delete(requestKey);
            });
        
        this.pendingRequests.set(requestKey, promise);
        return promise;
    }
    
    /**
     * Convert columnar data format to array of candle objects
     */
    columnarToCandles(data) {
        if (!data || !data.t || data.t.length === 0) return [];
        
        const candles = [];
        for (let i = 0; i < data.t.length; i++) {
            candles.push({
                t: data.t[i],
                o: data.o[i],
                h: data.h[i],
                l: data.l[i],
                c: data.c[i],
                v: data.v[i]
            });
        }
        return candles;
    }
    
    /**
     * Add candles to cache and merge into sorted array
     */
    addToCache(candles) {
        if (!candles || candles.length === 0) return;
        
        const startTs = candles[0].t;
        const endTs = candles[candles.length - 1].t;
        const key = `${startTs}_${endTs}`;
        
        this.chunkCache.set(key, {
            candles: candles,
            lastAccess: Date.now(),
            startTs: startTs,
            endTs: endTs
        });
        
        // Merge into sorted array
        this.rebuildMergedCandles();
        
        // Evict old chunks if over budget
        this.evictIfNeeded();
    }
    
    /**
     * Rebuild merged candles from all cached chunks
     */
    rebuildMergedCandles() {
        const allCandles = new Map();
        
        for (const chunk of this.chunkCache.values()) {
            for (const candle of chunk.candles) {
                allCandles.set(candle.t, candle);
            }
        }
        
        this.mergedCandles = Array.from(allCandles.values())
            .sort((a, b) => a.t - b.t);
    }
    
    /**
     * Check if we have data covering a range
     */
    hasDataForRange(startTs, endTs) {
        if (this.mergedCandles.length === 0) return false;
        
        const first = this.mergedCandles[0].t;
        const last = this.mergedCandles[this.mergedCandles.length - 1].t;
        
        return first <= startTs && last >= endTs;
    }
    
    /**
     * Get candles within a time range from merged data
     */
    getCandlesInRange(startTs, endTs) {
        return this.mergedCandles.filter(c => c.t >= startTs && c.t <= endTs);
    }
    
    /**
     * Evict least recently used chunks when over budget
     */
    evictIfNeeded() {
        while (this.chunkCache.size > this.maxCachedChunks) {
            let oldestKey = null;
            let oldestAccess = Infinity;
            
            for (const [key, chunk] of this.chunkCache.entries()) {
                if (chunk.lastAccess < oldestAccess) {
                    oldestAccess = chunk.lastAccess;
                    oldestKey = key;
                }
            }
            
            if (oldestKey) {
                this.chunkCache.delete(oldestKey);
            } else {
                break;
            }
        }
        
        // Rebuild after eviction
        if (this.chunkCache.size <= this.maxCachedChunks) {
            this.rebuildMergedCandles();
        }
    }
    
    /**
     * Prefetch chunks adjacent to current viewport
     */
    prefetchAdjacent(startTs, endTs, visibleRange) {
        // Prefetch right (future data)
        if (this.hasMoreRight) {
            const prefetchStart = endTs;
            const prefetchEnd = endTs + visibleRange;
            
            if (!this.hasDataForRange(prefetchStart, prefetchEnd)) {
                setTimeout(() => {
                    this.fetchCandles(prefetchStart, prefetchEnd).catch(() => {});
                }, 100);
            }
        }
        
        // Prefetch left (historical data)
        if (this.hasMoreLeft) {
            const prefetchStart = Math.max(startTs - visibleRange, this.sessionStartTs || 0);
            const prefetchEnd = startTs;
            
            if (!this.hasDataForRange(prefetchStart, prefetchEnd)) {
                setTimeout(() => {
                    this.fetchCandles(prefetchStart, prefetchEnd).catch(() => {});
                }, 200);
            }
        }
    }
    
    /**
     * Get all currently loaded candles (sorted)
     */
    getAllCandles() {
        return this.mergedCandles;
    }
    
    // ── WebSocket live streaming ──
    
    /**
     * Connect to WebSocket for incremental candle updates
     * @param {Function} onCandleUpdate - callback({type, candle})
     */
    connectWebSocket(onCandleUpdate) {
        if (this._ws) this.disconnectWebSocket();
        if (!this.fileId) return;
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = this.apiUrl.replace(/^https?:\/\//, '');
        const url = `${protocol}//${host}/ws/chart/${this.fileId}/${this.timeframe}`;
        
        this._ws = new WebSocket(url);
        this._wsOnCandle = onCandleUpdate;
        this._wsPingInterval = null;
        
        this._ws.onopen = () => {
            console.log(`🔌 WS connected: ${url}`);
            // Keep-alive ping every 30s
            this._wsPingInterval = setInterval(() => {
                if (this._ws && this._ws.readyState === WebSocket.OPEN) {
                    this._ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, 30000);
        };
        
        this._ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'candle_update' || msg.type === 'candle_close') {
                    if (this._wsOnCandle) this._wsOnCandle(msg);
                }
            } catch (e) {
                // ignore malformed messages
            }
        };
        
        this._ws.onclose = () => {
            console.log('🔌 WS disconnected');
            if (this._wsPingInterval) clearInterval(this._wsPingInterval);
            this._wsPingInterval = null;
            // Auto-reconnect after 3s
            this._wsReconnectTimer = setTimeout(() => {
                if (this.fileId) this.connectWebSocket(this._wsOnCandle);
            }, 3000);
        };
        
        this._ws.onerror = () => {
            // onclose will fire after onerror
        };
    }
    
    /**
     * Switch WebSocket subscription to a new timeframe
     */
    switchWebSocketTimeframe(newTimeframe) {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify({ type: 'subscribe', timeframe: newTimeframe }));
        }
    }
    
    /**
     * Disconnect WebSocket
     */
    disconnectWebSocket() {
        if (this._wsReconnectTimer) clearTimeout(this._wsReconnectTimer);
        if (this._wsPingInterval) clearInterval(this._wsPingInterval);
        if (this._ws) {
            this._ws.onclose = null; // prevent auto-reconnect
            this._ws.close();
            this._ws = null;
        }
    }
    
    // ── MessagePack binary transport ──
    
    /**
     * Fetch candles using MessagePack binary format (Phase D).
     * Falls back to JSON if msgpack decoder is not available.
     * Requires @msgpack/msgpack on the client (or msgpack-lite).
     */
    async fetchFromAPIMsgpack(params) {
        if (!this.fileId) return null;
        
        const queryParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            if (value !== null && value !== undefined) {
                queryParams.set(key, String(value));
            }
        }
        
        const url = `${this.apiUrl}/file/${this.fileId}/candles.msgpack?${queryParams.toString()}`;
        
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('msgpack')) {
                // Decode MessagePack
                const buffer = await res.arrayBuffer();
                if (typeof window.msgpack !== 'undefined' && window.msgpack.decode) {
                    return window.msgpack.decode(new Uint8Array(buffer));
                }
                // If no decoder available, log warning and fall back
                console.warn('MessagePack decoder not loaded, falling back to JSON endpoint');
                return this.fetchFromAPI(params);
            }
            // Server returned JSON fallback
            return await res.json();
        } catch (err) {
            console.error('MessagePack fetch error:', err);
            return this.fetchFromAPI(params);
        }
    }
    
    /**
     * Get cache stats for debugging
     */
    getStats() {
        return {
            cachedChunks: this.chunkCache.size,
            totalCandles: this.mergedCandles.length,
            hasMoreLeft: this.hasMoreLeft,
            hasMoreRight: this.hasMoreRight,
            loading: this.loading
        };
    }
}
