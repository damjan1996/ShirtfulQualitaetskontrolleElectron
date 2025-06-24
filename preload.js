const { contextBridge, ipcRenderer } = require('electron');

// Sichere API für Renderer Process
contextBridge.exposeInMainWorld('electronAPI', {
    // ===== DATENBANK OPERATIONEN =====
    db: {
        query: (query, params) => ipcRenderer.invoke('db-query', query, params),
        getUserByEPC: (tagId) => ipcRenderer.invoke('db-get-user-by-epc', tagId)
    },

    // ===== SESSION MANAGEMENT =====
    session: {
        create: (userId) => ipcRenderer.invoke('session-create', userId),
        end: (sessionId) => ipcRenderer.invoke('session-end', sessionId)
    },

    // ===== QR-CODE OPERATIONEN =====
    qr: {
        saveScan: (sessionId, payload) => ipcRenderer.invoke('qr-scan-save', sessionId, payload)
    },

    // ===== RFID OPERATIONEN =====
    rfid: {
        getStatus: () => ipcRenderer.invoke('rfid-get-status'),
        simulateTag: (tagId) => ipcRenderer.invoke('rfid-simulate-tag', tagId)
    },

    // ===== SYSTEM STATUS =====
    system: {
        getStatus: () => ipcRenderer.invoke('get-system-status'),
        getInfo: () => ipcRenderer.invoke('get-system-info')
    },

    // ===== APP STEUERUNG =====
    app: {
        minimize: () => ipcRenderer.invoke('app-minimize'),
        close: () => ipcRenderer.invoke('app-close'),
        restart: () => ipcRenderer.invoke('app-restart'),
        getSystemInfo: () => ipcRenderer.invoke('get-system-info')
    },

    // ===== EVENT LISTENERS =====
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
            ipcRenderer.removeAllListeners(channel);
            ipcRenderer.on(channel, (event, data) => callback(data));
        }
    },

    off: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    },

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

// ===== KAMERA API =====
contextBridge.exposeInMainWorld('cameraAPI', {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    getDevices: () => navigator.mediaDevices.enumerateDevices(),

    checkPermissions: async () => {
        try {
            const result = await navigator.permissions.query({ name: 'camera' });
            return result.state;
        } catch (error) {
            return 'unknown';
        }
    },

    getSupportedConstraints: () => navigator.mediaDevices.getSupportedConstraints(),

    stopStream: (stream) => {
        if (stream && stream.getTracks) {
            stream.getTracks().forEach(track => track.stop());
        }
    }
});

// ===== VERBESSERTE UTILITY FUNKTIONEN =====
contextBridge.exposeInMainWorld('utils', {
    // ===== ZEIT & DATUM FORMATIERUNG =====
    formatDuration: (seconds) => {
        if (typeof seconds !== 'number' || seconds < 0) return '00:00:00';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        return [hours, minutes, secs]
            .map(v => v.toString().padStart(2, '0'))
            .join(':');
    },

    formatTimestamp: (timestamp, format = 'datetime') => {
        try {
            const date = new Date(timestamp);

            // Prüfe auf gültiges Datum
            if (isNaN(date.getTime())) {
                return 'Ungültiges Datum';
            }

            const options = {
                timeZone: 'Europe/Berlin', // Deutsche Zeitzone
            };

            switch (format) {
                case 'time':
                    return date.toLocaleTimeString('de-DE', {
                        ...options,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });

                case 'date':
                    return date.toLocaleDateString('de-DE', {
                        ...options,
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    });

                case 'datetime':
                    return date.toLocaleString('de-DE', {
                        ...options,
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    });

                case 'short':
                    return date.toLocaleString('de-DE', {
                        ...options,
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                case 'relative':
                    return this.getRelativeTime(date);

                case 'iso':
                    return date.toISOString();

                default:
                    return date.toLocaleString('de-DE', options);
            }
        } catch (error) {
            console.error('Fehler bei Zeitformatierung:', error);
            return 'Formatfehler';
        }
    },

    getRelativeTime: (date) => {
        try {
            const now = new Date();
            const diffMs = now - new Date(date);
            const diffSecs = Math.floor(diffMs / 1000);
            const diffMins = Math.floor(diffSecs / 60);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffSecs < 5) return 'gerade eben';
            if (diffSecs < 60) return `vor ${diffSecs} Sekunde${diffSecs !== 1 ? 'n' : ''}`;
            if (diffMins < 60) return `vor ${diffMins} Minute${diffMins !== 1 ? 'n' : ''}`;
            if (diffHours < 24) return `vor ${diffHours} Stunde${diffHours !== 1 ? 'n' : ''}`;
            if (diffDays < 7) return `vor ${diffDays} Tag${diffDays !== 1 ? 'en' : ''}`;

            return new Date(date).toLocaleDateString('de-DE');
        } catch (error) {
            return 'Unbekannt';
        }
    },

    getCurrentTimestamp: () => new Date().toISOString(),

    // ===== RFID TAG VALIDIERUNG =====
    validateTagId: (tagId) => {
        if (!tagId || typeof tagId !== 'string') return false;

        const cleaned = tagId.trim().toUpperCase();

        // Prüfe Länge (8-12 Hex-Zeichen sind typisch)
        if (cleaned.length < 8 || cleaned.length > 12) return false;

        // Prüfe Hex-Format
        if (!/^[0-9A-F]+$/.test(cleaned)) return false;

        // Prüfe ob konvertierbar und nicht Null
        try {
            const decimal = parseInt(cleaned, 16);
            return decimal > 0;
        } catch (error) {
            return false;
        }
    },

    // ===== QR-CODE VERARBEITUNG =====
    parseQRPayload: (payload) => {
        if (!payload || typeof payload !== 'string') {
            return { type: 'invalid', data: null, display: 'Ungültiger QR-Code' };
        }

        try {
            // JSON-Format versuchen
            const jsonData = JSON.parse(payload);
            return {
                type: 'json',
                data: jsonData,
                display: JSON.stringify(jsonData, null, 2),
                preview: this.createJSONPreview(jsonData)
            };
        } catch (e) {
            // Key-Value Format versuchen (Format: key1:value1^key2:value2)
            if (payload.includes('^') && payload.includes(':')) {
                const parts = payload.split('^');
                const data = {};
                let valid = false;

                parts.forEach(part => {
                    if (part.includes(':')) {
                        const [key, ...valueParts] = part.split(':');
                        const value = valueParts.join(':'); // Für Werte mit ':'
                        data[key.trim()] = value.trim();
                        valid = true;
                    }
                });

                if (valid) {
                    const display = Object.entries(data)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join('\n');
                    return {
                        type: 'keyvalue',
                        data,
                        display,
                        preview: this.createKeyValuePreview(data)
                    };
                }
            }

            // Barcode-Format erkennen (EAN, UPC, etc.)
            if (/^\d{8,14}$/.test(payload)) {
                return {
                    type: 'barcode',
                    data: payload,
                    display: payload,
                    preview: `Barcode: ${payload}`
                };
            }

            // URL-Format
            if (payload.startsWith('http://') || payload.startsWith('https://')) {
                return {
                    type: 'url',
                    data: payload,
                    display: payload,
                    preview: `URL: ${payload.length > 50 ? payload.substring(0, 50) + '...' : payload}`
                };
            }

            // Plain Text
            return {
                type: 'text',
                data: payload,
                display: payload,
                preview: payload.length > 100 ? payload.substring(0, 100) + '...' : payload
            };
        }
    },

    createJSONPreview: (jsonData) => {
        try {
            if (typeof jsonData === 'object') {
                const keys = Object.keys(jsonData);
                if (keys.length === 0) return 'Leeres JSON-Objekt';

                const preview = keys.slice(0, 3).map(key => {
                    const value = jsonData[key];
                    const shortValue = typeof value === 'string' && value.length > 20
                        ? value.substring(0, 20) + '...'
                        : value;
                    return `${key}: ${shortValue}`;
                }).join(', ');

                return keys.length > 3 ? `${preview}...` : preview;
            }
            return String(jsonData);
        } catch (error) {
            return 'JSON-Vorschau nicht verfügbar';
        }
    },

    createKeyValuePreview: (data) => {
        try {
            const entries = Object.entries(data);
            if (entries.length === 0) return 'Keine Daten';

            const preview = entries.slice(0, 2).map(([key, value]) => {
                const shortValue = value.length > 15 ? value.substring(0, 15) + '...' : value;
                return `${key}: ${shortValue}`;
            }).join(', ');

            return entries.length > 2 ? `${preview}...` : preview;
        } catch (error) {
            return 'Vorschau nicht verfügbar';
        }
    },

    // ===== SCAN RESULT HANDLING =====
    formatScanResult: (result) => {
        if (!result || typeof result !== 'object') {
            return {
                success: false,
                message: 'Ungültiges Scan-Ergebnis',
                status: 'error'
            };
        }

        const { success, status, message, data, duplicateInfo } = result;

        let formattedMessage = message || 'Unbekannter Status';
        let displayType = status || 'unknown';

        // Status-spezifische Formatierung
        switch (status) {
            case 'duplicate_cache':
            case 'duplicate_database':
            case 'duplicate_transaction':
                if (duplicateInfo && duplicateInfo.minutesAgo !== undefined) {
                    formattedMessage = `Bereits vor ${duplicateInfo.minutesAgo} Minuten gescannt`;
                } else if (duplicateInfo && duplicateInfo.count) {
                    formattedMessage = `${duplicateInfo.count}x bereits gescannt`;
                }
                displayType = 'duplicate';
                break;

            case 'rate_limit':
                formattedMessage = 'Zu viele Scans - kurz warten';
                displayType = 'warning';
                break;

            case 'saved':
                if (data && data.ID) {
                    formattedMessage = `Erfolgreich gespeichert (ID: ${data.ID})`;
                }
                displayType = 'success';
                break;

            case 'error':
            case 'database_offline':
                displayType = 'error';
                break;

            case 'processing':
                displayType = 'info';
                break;
        }

        return {
            success: success || false,
            message: formattedMessage,
            status: displayType,
            data: data || null,
            duplicateInfo: duplicateInfo || null,
            timestamp: new Date().toISOString()
        };
    },

    // ===== ZAHLKONVERTIERUNG =====
    hexToDecimal: (hex) => {
        try {
            const cleaned = hex.toString().replace(/[^0-9A-Fa-f]/g, '');
            return parseInt(cleaned, 16);
        } catch (error) {
            return null;
        }
    },

    decimalToHex: (decimal) => {
        try {
            return Number(decimal).toString(16).toUpperCase();
        } catch (error) {
            return null;
        }
    },

    // ===== PERFORMANCE UTILITIES =====
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

    throttle: (func, limit) => {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // ===== DATENVERARBEITUNG =====
    formatFileSize: (bytes) => {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    generateRandomTag: () => {
        const chars = '0123456789ABCDEF';
        let result = '';
        for (let i = 0; i < 10; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    },

    // ===== ERROR HANDLING =====
    createErrorInfo: (error, context = null) => {
        const errorInfo = {
            message: error?.message || String(error),
            stack: error?.stack,
            name: error?.name,
            code: error?.code,
            context: context,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        // Zusätzliche Informationen für spezielle Fehler
        if (error?.name === 'NotAllowedError') {
            errorInfo.suggestion = 'Kamera-Berechtigung verweigert - in den Browsereinstellungen erlauben';
        } else if (error?.name === 'NotFoundError') {
            errorInfo.suggestion = 'Keine Kamera gefunden - USB-Kamera anschließen';
        } else if (error?.name === 'OverconstrainedError') {
            errorInfo.suggestion = 'Kamera-Einstellungen nicht unterstützt - andere Auflösung versuchen';
        }

        return errorInfo;
    },

    // ===== LOGGING =====
    log: (level, message, data = null) => {
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
    },

    // ===== VALIDIERUNG =====
    isValidEmail: (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    sanitizeString: (str) => {
        if (typeof str !== 'string') return '';
        return str.replace(/[<>"/\\&]/g, '');
    },

    truncateString: (str, maxLength = 50) => {
        if (typeof str !== 'string') return '';
        return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
    },

    // ===== STORAGE HELPERS =====
    safeJSONParse: (str, fallback = null) => {
        try {
            return JSON.parse(str);
        } catch (error) {
            console.warn('JSON Parse Fehler:', error);
            return fallback;
        }
    },

    safeJSONStringify: (obj, fallback = '{}') => {
        try {
            return JSON.stringify(obj);
        } catch (error) {
            console.warn('JSON Stringify Fehler:', error);
            return fallback;
        }
    }
});

// ===== KONFIGURATION & UMGEBUNG =====
contextBridge.exposeInMainWorld('config', {
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

    isDev: () => process.env.NODE_ENV === 'development',
    version: null, // Wird später von der App gesetzt

    // ===== THEME MANAGEMENT =====
    theme: {
        get: () => {
            try {
                return localStorage.getItem('wareneingang-theme') || 'auto';
            } catch {
                return 'auto';
            }
        },

        set: (theme) => {
            try {
                localStorage.setItem('wareneingang-theme', theme);
                document.body.className = document.body.className.replace(/theme-\w+/g, '');

                if (theme === 'auto') {
                    // System-Präferenz verwenden
                    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                        document.body.classList.add('theme-dark');
                    } else {
                        document.body.classList.add('theme-light');
                    }
                } else {
                    document.body.classList.add(`theme-${theme}`);
                }
            } catch (error) {
                console.warn('Theme setzen fehlgeschlagen:', error);
            }
        },

        toggle: () => {
            const current = config.theme.get();
            const next = current === 'dark' ? 'light' : current === 'light' ? 'auto' : 'dark';
            config.theme.set(next);
            return next;
        }
    }
});

// ===== DIAGNOSTICS & ERROR HANDLING =====
contextBridge.exposeInMainWorld('diagnostics', {
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
                browser: {
                    userAgent: navigator.userAgent,
                    language: navigator.language,
                    cookieEnabled: navigator.cookieEnabled,
                    onLine: navigator.onLine
                },
                screen: {
                    width: screen.width,
                    height: screen.height,
                    colorDepth: screen.colorDepth,
                    pixelDepth: screen.pixelDepth
                },
                performance: performance.memory ? {
                    used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                    total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                    limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
                } : null,
                localStorage: (() => {
                    try {
                        return {
                            available: typeof Storage !== 'undefined',
                            theme: localStorage.getItem('wareneingang-theme')
                        };
                    } catch {
                        return { available: false };
                    }
                })()
            };
        } catch (error) {
            return {
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    },

    exportDiagnostics: async () => {
        try {
            const systemInfo = await diagnostics.collectSystemInfo();
            const logs = window.logs || [];

            return {
                ...systemInfo,
                logs: logs.slice(-100), // Letzte 100 Log-Einträge
                exportTime: new Date().toISOString()
            };
        } catch (error) {
            return {
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
});

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('Preload Script geladen, DOM bereit');

    // Theme initialisieren
    const savedTheme = localStorage.getItem('wareneingang-theme') || 'auto';
    config.theme.set(savedTheme);

    // System Theme Changes verfolgen
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            const currentTheme = localStorage.getItem('wareneingang-theme') || 'auto';
            if (currentTheme === 'auto') {
                config.theme.set('auto'); // Theme neu anwenden
            }
        });
    }

    // Global Error Handler
    window.addEventListener('error', (event) => {
        const errorInfo = {
            message: event.error?.message || event.message,
            stack: event.error?.stack,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            timestamp: new Date().toISOString()
        };

        console.error('Global Error:', errorInfo);
        utils.log('error', 'Global JavaScript Error', errorInfo);
    });

    // Unhandled Promise Rejections
    window.addEventListener('unhandledrejection', (event) => {
        const errorInfo = {
            reason: event.reason,
            promise: event.promise,
            timestamp: new Date().toISOString()
        };

        console.error('Unhandled Promise Rejection:', errorInfo);
        utils.log('error', 'Unhandled Promise Rejection', errorInfo);
    });

    // Log-Array für Diagnostics
    window.logs = window.logs || [];

    // Console-Methoden erweitern für Log-Sammlung
    const originalConsoleError = console.error;
    console.error = (...args) => {
        window.logs.push({
            level: 'error',
            message: args.join(' '),
            timestamp: new Date().toISOString()
        });
        originalConsoleError.apply(console, args);
    };

    const originalConsoleWarn = console.warn;
    console.warn = (...args) => {
        window.logs.push({
            level: 'warn',
            message: args.join(' '),
            timestamp: new Date().toISOString()
        });
        originalConsoleWarn.apply(console, args);
    };

    console.log('✅ Preload Script erfolgreich initialisiert');
});

console.log('Preload Script geladen');