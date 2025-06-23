const { contextBridge, ipcRenderer } = require('electron');

// Expose safe API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Database operations
    db: {
        query: (query, params) => ipcRenderer.invoke('db-query', query, params),
        getUserByEPC: (tagId) => ipcRenderer.invoke('db-get-user-by-epc', tagId)
    },

    // Session management
    session: {
        create: (userId) => ipcRenderer.invoke('session-create', userId),
        end: (sessionId) => ipcRenderer.invoke('session-end', sessionId),
        getActiveSessions: () => ipcRenderer.invoke('get-active-sessions')
    },

    // QR Code operations
    qr: {
        saveScan: (sessionId, payload) => ipcRenderer.invoke('qr-scan-save', sessionId, payload)
    },

    // RFID operations
    rfid: {
        getStatus: () => ipcRenderer.invoke('rfid-get-status'),
        simulateTag: (tagId) => ipcRenderer.invoke('rfid-simulate-tag', tagId)
    },

    // System status and diagnostics
    system: {
        getStatus: () => ipcRenderer.invoke('get-system-status'),
        getInfo: () => ipcRenderer.invoke('get-system-info')
    },

    // Application controls
    app: {
        minimize: () => ipcRenderer.invoke('app-minimize'),
        close: () => ipcRenderer.invoke('app-close'),
        restart: () => ipcRenderer.invoke('app-restart'),
        getSystemInfo: () => ipcRenderer.invoke('get-system-info')
    },

    // Event listeners for main process events
    on: (channel, callback) => {
        const validChannels = [
            'system-ready',
            'system-error',
            'user-login',
            'user-logout',
            'rfid-scan-error',
            'qr-scan-detected'
        ];

        if (validChannels.includes(channel)) {
            // Remove existing listeners to prevent duplicates
            ipcRenderer.removeAllListeners(channel);
            // Add new listener
            ipcRenderer.on(channel, (event, data) => callback(data));
        }
    },

    // Remove event listener
    off: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    },

    // One-time event listener
    once: (channel, callback) => {
        const validChannels = [
            'system-ready',
            'system-error',
            'user-login',
            'user-logout',
            'rfid-scan-error',
            'qr-scan-detected'
        ];

        if (validChannels.includes(channel)) {
            ipcRenderer.once(channel, (event, data) => callback(data));
        }
    }
});

// QR Scanner API (using getUserMedia)
contextBridge.exposeInMainWorld('cameraAPI', {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),

    // Helper to enumerate available cameras
    getDevices: () => navigator.mediaDevices.enumerateDevices(),

    // Check camera permissions
    checkPermissions: async () => {
        try {
            const result = await navigator.permissions.query({ name: 'camera' });
            return result.state; // 'granted', 'denied', or 'prompt'
        } catch (error) {
            return 'unknown';
        }
    },

    // Get supported camera constraints
    getSupportedConstraints: () => navigator.mediaDevices.getSupportedConstraints(),

    // Helper to stop media stream
    stopStream: (stream) => {
        if (stream && stream.getTracks) {
            stream.getTracks().forEach(track => track.stop());
        }
    }
});

// Utility functions for the renderer
contextBridge.exposeInMainWorld('utils', {
    // Format duration from seconds to HH:MM:SS
    formatDuration: (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    },

    // Validate RFID tag format
    validateTagId: (tagId) => {
        if (!tagId || typeof tagId !== 'string') return false;
        const cleaned = tagId.trim().toUpperCase();
        return /^[0-9A-F]{8,12}$/.test(cleaned) && parseInt(cleaned, 16) > 0;
    },

    // Parse QR code payload
    parseQRPayload: (payload) => {
        if (!payload) return { type: 'invalid', data: null };

        try {
            // Try JSON first
            const jsonData = JSON.parse(payload);
            return { type: 'json', data: jsonData, display: JSON.stringify(jsonData, null, 2) };
        } catch (e) {
            // Try key-value format
            if (payload.includes('^') && payload.includes(':')) {
                const parts = payload.split('^');
                const data = {};
                let valid = false;

                parts.forEach(part => {
                    if (part.includes(':')) {
                        const [key, value] = part.split(':', 2);
                        data[key.trim()] = value.trim();
                        valid = true;
                    }
                });

                if (valid) {
                    const display = Object.entries(data)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join('\n');
                    return { type: 'keyvalue', data, display };
                }
            }

            // Plain text
            return {
                type: 'text',
                data: payload,
                display: payload.length > 100 ? payload.substring(0, 100) + '...' : payload
            };
        }
    },

    // Get current timestamp
    getCurrentTimestamp: () => new Date().toISOString(),

    // Format timestamp for display
    formatTimestamp: (timestamp, format = 'time') => {
        const date = new Date(timestamp);

        switch (format) {
            case 'time':
                return date.toLocaleTimeString('de-DE');
            case 'datetime':
                return date.toLocaleString('de-DE');
            case 'date':
                return date.toLocaleDateString('de-DE');
            case 'iso':
                return date.toISOString();
            case 'relative':
                return utils.getRelativeTime(date);
            default:
                return date.toLocaleString('de-DE');
        }
    },

    // Get relative time (e.g., "2 minutes ago")
    getRelativeTime: (date) => {
        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) return 'gerade eben';
        if (diffMins < 60) return `vor ${diffMins} Minute${diffMins !== 1 ? 'n' : ''}`;
        if (diffHours < 24) return `vor ${diffHours} Stunde${diffHours !== 1 ? 'n' : ''}`;
        if (diffDays < 7) return `vor ${diffDays} Tag${diffDays !== 1 ? 'en' : ''}`;
        return date.toLocaleDateString('de-DE');
    },

    // Convert hex to decimal
    hexToDecimal: (hex) => {
        try {
            return parseInt(hex, 16);
        } catch (error) {
            return null;
        }
    },

    // Convert decimal to hex
    decimalToHex: (decimal) => {
        try {
            return decimal.toString(16).toUpperCase();
        } catch (error) {
            return null;
        }
    },

    // Generate random RFID tag (for testing)
    generateRandomTag: () => {
        const chars = '0123456789ABCDEF';
        let result = '';
        for (let i = 0; i < 10; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },

    // Debounce function
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Throttle function
    throttle: (func, limit) => {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // Format file size
    formatFileSize: (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // Log to console (for debugging)
    log: (level, message, data) => {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

        switch (level.toLowerCase()) {
            case 'error':
                console.error(logMessage, data);
                break;
            case 'warn':
                console.warn(logMessage, data);
                break;
            case 'info':
                console.info(logMessage, data);
                break;
            case 'debug':
                if (window.config && window.config.isDev()) {
                    console.log(logMessage, data);
                }
                break;
            default:
                console.log(logMessage, data);
        }
    }
});

// Environment and configuration
contextBridge.exposeInMainWorld('config', {
    // Safe access to certain environment variables
    get: (key) => {
        const allowedKeys = [
            'NODE_ENV',
            'UI_WINDOW_WIDTH',
            'UI_WINDOW_HEIGHT',
            'APP_DEBUG',
            'UI_THEME',
            'UI_UPDATE_INTERVAL'
        ];

        if (allowedKeys.includes(key)) {
            return process.env[key];
        }

        return undefined;
    },

    // Check if in development mode
    isDev: () => process.env.NODE_ENV === 'development',

    // Get app version (will be available after system-ready)
    version: null,

    // Theme management
    theme: {
        get: () => localStorage.getItem('app-theme') || 'auto',
        set: (theme) => {
            localStorage.setItem('app-theme', theme);
            document.body.className = document.body.className.replace(/theme-\w+/g, '');
            if (theme !== 'auto') {
                document.body.classList.add(`theme-${theme}`);
            }
        },
        toggle: () => {
            const current = config.theme.get();
            const next = current === 'dark' ? 'light' : 'dark';
            config.theme.set(next);
            return next;
        }
    }
});

// Error handling and diagnostics
contextBridge.exposeInMainWorld('diagnostics', {
    // Collect system information for bug reports
    collectSystemInfo: async () => {
        try {
            const systemInfo = await window.electronAPI.system.getInfo();
            const systemStatus = await window.electronAPI.system.getStatus();
            const rfidStatus = await window.electronAPI.rfid.getStatus();

            return {
                timestamp: new Date().toISOString(),
                system: systemInfo,
                status: systemStatus,
                rfid: rfidStatus,
                userAgent: navigator.userAgent,
                screen: {
                    width: screen.width,
                    height: screen.height,
                    colorDepth: screen.colorDepth
                },
                performance: {
                    memory: performance.memory ? {
                        used: performance.memory.usedJSHeapSize,
                        total: performance.memory.totalJSHeapSize,
                        limit: performance.memory.jsHeapSizeLimit
                    } : null
                }
            };
        } catch (error) {
            return {
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    },

    // Export logs for support
    exportLogs: () => {
        // This would collect console logs, errors, etc.
        return {
            timestamp: new Date().toISOString(),
            logs: console.logs || [],
            errors: console.errors || []
        };
    }
});

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Preload script loaded, DOM ready');

    // Set initial theme
    const savedTheme = localStorage.getItem('app-theme') || 'auto';
    if (savedTheme === 'auto') {
        // Use system preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('theme-dark');
        } else {
            document.body.classList.add('theme-light');
        }
    } else {
        document.body.classList.add(`theme-${savedTheme}`);
    }

    // Listen for theme changes
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            const savedTheme = localStorage.getItem('app-theme') || 'auto';
            if (savedTheme === 'auto') {
                document.body.className = document.body.className.replace(/theme-\w+/g, '');
                if (e.matches) {
                    document.body.classList.add('theme-dark');
                } else {
                    document.body.classList.add('theme-light');
                }
            }
        });
    }

    // Add global error handler
    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
        utils.log('error', 'Global error', {
            message: event.error?.message,
            stack: event.error?.stack,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
        });
    });

    // Add unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
        utils.log('error', 'Unhandled promise rejection', {
            reason: event.reason,
            promise: event.promise
        });
    });
});

console.log('Preload script executed successfully');