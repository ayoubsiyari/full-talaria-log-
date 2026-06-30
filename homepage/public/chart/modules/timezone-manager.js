/**
 * Timezone Manager - Centralized timezone handling for the chart
 * Provides timezone conversion and persistence
 */

class TimezoneManager {
    constructor() {
        this.STORAGE_KEY = 'chartTimezone';
        this.DEFAULT_TIMEZONE = 'UTC';
        
        // Common trading timezones - sorted by UTC offset (one per offset)
        this.timezones = [
            { id: 'Pacific/Midway', label: 'Midway Island', offset: -11 },
            { id: 'Pacific/Honolulu', label: 'Honolulu (HST)', offset: -10 },
            { id: 'America/Anchorage', label: 'Anchorage (AKST)', offset: -9 },
            { id: 'America/Los_Angeles', label: 'Los Angeles (PST)', offset: -8 },
            { id: 'America/Denver', label: 'Denver (MST)', offset: -7 },
            { id: 'America/Chicago', label: 'Chicago (CST)', offset: -6 },
            { id: 'America/New_York', label: 'New York (EST)', offset: -5 },
            { id: 'America/Caracas', label: 'Caracas (VET)', offset: -4 },
            { id: 'America/Sao_Paulo', label: 'São Paulo (BRT)', offset: -3 },
            { id: 'Atlantic/South_Georgia', label: 'South Georgia', offset: -2 },
            { id: 'Atlantic/Azores', label: 'Azores (AZOT)', offset: -1 },
            { id: 'UTC', label: 'UTC', offset: 0 },
            { id: 'Europe/Paris', label: 'Paris (CET)', offset: 1 },
            { id: 'Europe/Athens', label: 'Athens (EET)', offset: 2 },
            { id: 'Europe/Moscow', label: 'Moscow (MSK)', offset: 3 },
            { id: 'Asia/Dubai', label: 'Dubai (GST)', offset: 4 },
            { id: 'Asia/Karachi', label: 'Karachi (PKT)', offset: 5 },
            { id: 'Asia/Kolkata', label: 'Mumbai (IST)', offset: 5.5 },
            { id: 'Asia/Dhaka', label: 'Dhaka (BST)', offset: 6 },
            { id: 'Asia/Bangkok', label: 'Bangkok (ICT)', offset: 7 },
            { id: 'Asia/Singapore', label: 'Singapore (SGT)', offset: 8 },
            { id: 'Asia/Tokyo', label: 'Tokyo (JST)', offset: 9 },
            { id: 'Australia/Sydney', label: 'Sydney (AEST)', offset: 10 },
            { id: 'Pacific/Noumea', label: 'Noumea (NCT)', offset: 11 },
            { id: 'Pacific/Auckland', label: 'Auckland (NZST)', offset: 12 }
        ];
        
        // Load saved timezone
        this.currentTimezone = this.loadTimezone();
        
        // Listeners for timezone changes
        this.listeners = [];
        this._wallClockFmtCache = Object.create(null);
        
        console.log('🌍 TimezoneManager initialized:', this.currentTimezone);
    }
    
    /**
     * Load timezone from localStorage
     */
    loadTimezone() {
        try {
            const saved = userStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const tz = this.timezones.find(t => t.id === saved);
                if (tz) return tz;
                try {
                    new Intl.DateTimeFormat('en-US', { timeZone: saved });
                    return { id: saved, label: saved.replace(/\//g, ' / '), offset: 0 };
                } catch (_) { /* invalid stored id */ }
            }
        } catch (e) {
            console.warn('Failed to load timezone:', e);
        }
        return this.timezones.find(t => t.id === this.DEFAULT_TIMEZONE);
    }
    
    /**
     * Save timezone to localStorage
     */
    saveTimezone(timezone) {
        try {
            userStorage.setItem(this.STORAGE_KEY, timezone.id);
        } catch (e) {
            console.warn('Failed to save timezone:', e);
        }
    }
    
    /**
     * Get current timezone
     */
    getTimezone() {
        return this.currentTimezone;
    }
    
    /**
     * Get timezone offset in hours
     */
    getOffset() {
        return this.currentTimezone.offset;
    }
    
    /**
     * Get timezone offset in milliseconds
     */
    getOffsetMs() {
        return this.currentTimezone.offset * 60 * 60 * 1000;
    }
    
    /**
     * Set timezone by ID
     */
    setTimezone(timezoneId) {
        if (!timezoneId || typeof timezoneId !== 'string') return false;
        let tz = this.timezones.find(t => t.id === timezoneId);
        if (!tz) {
            try {
                new Intl.DateTimeFormat('en-US', { timeZone: timezoneId });
                tz = { id: timezoneId, label: timezoneId.replace(/\//g, ' / '), offset: 0 };
            } catch (_) {
                return false;
            }
        }
        this.currentTimezone = tz;
        this.saveTimezone(tz);
        this.notifyListeners();
        console.log('🌍 Timezone changed to:', tz.label);
        return true;
    }
    
    /**
     * Get all available timezones
     */
    getTimezones() {
        return this.timezones;
    }
    
    /**
     * Wall-clock calendar fields for UTC instant `timestamp` in IANA zone `tzId`.
     */
    _wallClockParts(timestamp, tzId) {
        const key = tzId || 'UTC';
        if (!this._wallClockFmtCache[key]) {
            this._wallClockFmtCache[key] = new Intl.DateTimeFormat('en-US', {
                timeZone: key,
                hour12: false,
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric'
            });
        }
        const fmt = this._wallClockFmtCache[key];
        const o = {};
        fmt.formatToParts(new Date(timestamp)).forEach((p) => {
            if (p.type !== 'literal') {
                const n = parseInt(p.value, 10);
                if (!Number.isNaN(n)) o[p.type] = n;
            }
        });
        return {
            year: o.year,
            month: o.month,
            day: o.day,
            hour: o.hour,
            minute: o.minute,
            second: Number.isFinite(o.second) ? o.second : 0
        };
    }

    /**
     * Convert UTC epoch ms to a Date whose UTC getters equal wall-clock time in the selected IANA zone.
     * (chart.js must use getUTC* / { timeZone: 'UTC' } when formatting these values.)
     */
    convertToTimezone(timestamp) {
        try {
            const tzId = this.currentTimezone && this.currentTimezone.id;
            if (!tzId) return new Date(timestamp);
            const p = this._wallClockParts(timestamp, tzId);
            if (!Number.isFinite(p.year) || !Number.isFinite(p.month) || !Number.isFinite(p.day)) {
                return new Date(timestamp);
            }
            return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
        } catch (e) {
            console.warn('convertToTimezone:', e);
            return new Date(timestamp);
        }
    }

    /**
     * UTC epoch ms for wall-clock Y-M-D H:M:S in `timezoneId` (defaults to current chart TZ).
     * Uses Intl (DST-aware); falls back to naive Date.UTC if no match (invalid local times).
     */
    wallClockToUtcMillis(year, month, day, hour, minute, second = 0, timezoneId = null) {
        const tzId = timezoneId || (this.currentTimezone && this.currentTimezone.id) || 'UTC';
        try {
            const nominal = Date.UTC(year, month - 1, day, hour, minute, second);
            const scanStart = nominal - 28 * 3600000;
            const scanEnd = nominal + 28 * 3600000;
            let firstMinuteMatch = null;
            for (let ms = scanStart; ms <= scanEnd; ms += 60000) {
                const p = this._wallClockParts(ms, tzId);
                if (p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute) {
                    firstMinuteMatch = ms;
                    break;
                }
            }
            if (firstMinuteMatch != null) {
                for (let dsec = -120; dsec <= 120; dsec++) {
                    const ms = firstMinuteMatch + dsec * 1000;
                    const p = this._wallClockParts(ms, tzId);
                    if (p.year === year && p.month === month && p.day === day &&
                        p.hour === hour && p.minute === minute && p.second === second) {
                        return ms;
                    }
                }
                return firstMinuteMatch;
            }
        } catch (e) {
            console.warn('wallClockToUtcMillis:', e);
        }
        return Date.UTC(year, month - 1, day, hour, minute, second);
    }

    /**
     * Format a timestamp in current timezone (IANA-aware via Intl).
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @param {string} format - 'time', 'date', 'datetime', 'full'
     */
    formatTime(timestamp, format = 'time') {
        const tz = this.currentTimezone.id;
        const d = new Date(timestamp);
        try {
            switch (format) {
                case 'time':
                    return new Intl.DateTimeFormat('en-US', {
                        timeZone: tz,
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }).format(d);
                case 'timeFull':
                    return new Intl.DateTimeFormat('en-US', {
                        timeZone: tz,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                    }).format(d);
                case 'date':
                    return new Intl.DateTimeFormat('en-CA', {
                        timeZone: tz,
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    }).format(d);
                case 'datetime':
                    return `${new Intl.DateTimeFormat('en-CA', {
                        timeZone: tz,
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    }).format(d)} ${new Intl.DateTimeFormat('en-US', {
                        timeZone: tz,
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }).format(d)}`;
                case 'full':
                    return new Intl.DateTimeFormat('en-US', {
                        timeZone: tz,
                        weekday: 'short',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                    }).format(d);
                default:
                    return new Intl.DateTimeFormat('en-US', {
                        timeZone: tz,
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    }).format(d);
            }
        } catch (e) {
            console.warn('formatTime:', e);
            const pad = (n) => String(n).padStart(2, '0');
            const x = this.convertToTimezone(timestamp);
            return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())} ${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
        }
    }
    
    /**
     * Get timezone label for display
     */
    getLabel() {
        return this.currentTimezone.label;
    }
    
    /**
     * Get short label (e.g., "EST", "UTC")
     */
    getShortLabel() {
        const match = this.currentTimezone.label.match(/\(([^)]+)\)/);
        return match ? match[1] : 'UTC';
    }
    
    /**
     * Add listener for timezone changes
     */
    addListener(callback) {
        this.listeners.push(callback);
    }
    
    /**
     * Remove listener
     */
    removeListener(callback) {
        this.listeners = this.listeners.filter(l => l !== callback);
    }
    
    /**
     * Notify all listeners of timezone change
     */
    notifyListeners() {
        this.listeners.forEach(callback => {
            try {
                callback(this.currentTimezone);
            } catch (e) {
                console.warn('Timezone listener error:', e);
            }
        });
    }
}

// Create global instance
window.timezoneManager = new TimezoneManager();
