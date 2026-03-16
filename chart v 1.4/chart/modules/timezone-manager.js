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
        
        console.log('🌍 TimezoneManager initialized:', this.currentTimezone);
    }
    
    /**
     * Load timezone from localStorage
     */
    loadTimezone() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const tz = this.timezones.find(t => t.id === saved);
                if (tz) return tz;
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
            localStorage.setItem(this.STORAGE_KEY, timezone.id);
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
        const tz = this.timezones.find(t => t.id === timezoneId);
        if (tz) {
            this.currentTimezone = tz;
            this.saveTimezone(tz);
            this.notifyListeners();
            console.log('🌍 Timezone changed to:', tz.label);
            return true;
        }
        return false;
    }
    
    /**
     * Get all available timezones
     */
    getTimezones() {
        return this.timezones;
    }
    
    /**
     * Convert a timestamp to the current timezone
     * Returns a Date object adjusted for display
     */
    convertToTimezone(timestamp) {
        const date = new Date(timestamp);
        // Get the UTC time and add our offset
        const utcTime = date.getTime() + (date.getTimezoneOffset() * 60000);
        return new Date(utcTime + this.getOffsetMs());
    }
    
    /**
     * Format a timestamp in current timezone
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @param {string} format - 'time', 'date', 'datetime', 'full'
     */
    formatTime(timestamp, format = 'time') {
        const date = this.convertToTimezone(timestamp);
        
        const pad = (n) => String(n).padStart(2, '0');
        
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        const seconds = pad(date.getSeconds());
        
        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayName = days[date.getDay()];
        
        switch (format) {
            case 'time':
                return `${hours}:${minutes}`;
            case 'timeFull':
                return `${hours}:${minutes}:${seconds}`;
            case 'date':
                return `${year}-${month}-${day}`;
            case 'datetime':
                return `${year}-${month}-${day} ${hours}:${minutes}`;
            case 'full':
                return `(${dayName}) ${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            default:
                return `${hours}:${minutes}`;
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
