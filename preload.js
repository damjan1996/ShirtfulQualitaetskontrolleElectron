/**
 * Preload Script für Qualitätskontrolle RFID QR Scanner
 * Sichere Bridge zwischen Main-Process und Renderer-Process
 * Speziell angepasst für zweimaliges Scannen und automatischen Session-Abschluss
 */

const { contextBridge, ipcRenderer } = require('electron');

// ===== CORE API =====
contextBridge.exposeInMainWorld('electronAPI', {
    // ===== SYSTEM =====
    system: {
        getStatus: () => ipcRenderer.invoke('system:get-status'),
        onReady: (callback) => ipcRenderer.on('system-ready', callback),
        removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
    },

    // ===== SESSION MANAGEMENT =====
    session: {
        getAllActive: () => ipcRenderer.invoke('session:get-all-active'),
        end: (sessionId) => ipcRenderer.invoke('session:end', sessionId),

        // Event Listeners für Session-Updates
        onSessionStarted: (callback) => ipcRenderer.on('session-started', callback),
        onSessionEnded: (callback) => ipcRenderer.on('session-ended', callback),
        onSessionTimerUpdate: (callback) => ipcRenderer.on('session-timer-update', callback),

        // Cleanup
        removeSessionListeners: () => {
            ipcRenderer.removeAllListeners('session-started');
            ipcRenderer.removeAllListeners('session-ended');
            ipcRenderer.removeAllListeners('session-timer-update');
        }
    },

    // ===== RFID =====
    rfid: {
        simulateTag: (tagId) => ipcRenderer.invoke('rfid:simulate-tag', tagId),

        // Event Listeners
        onTagScanned: (callback) => ipcRenderer.on('rfid-tag-scanned', callback),
        removeRFIDListeners: () => ipcRenderer.removeAllListeners('rfid-tag-scanned')
    },

    // ===== QR-CODE HANDLING (Qualitätskontrolle-spezifisch) =====
    qr: {
        scan: (qrData, sessionId) => ipcRenderer.invoke('qr:scan', qrData, sessionId),
        getStatus: (qrCode) => ipcRenderer.invoke('qr:get-status', qrCode),

        // Event Listeners für QR-Updates
        onScanResult: (callback) => ipcRenderer.on('qr-scan-result', callback),
        removeQRListeners: () => ipcRenderer.removeAllListeners('qr-scan-result')
    },

    // ===== STATISTIKEN =====
    stats: {
        getSession: (sessionId) => ipcRenderer.invoke('stats:get-session', sessionId),
        getGlobal: () => ipcRenderer.invoke('stats:get-global'),

        // Event Listeners
        onStatsUpdate: (callback) => ipcRenderer.on('stats-update', callback),
        removeStatsListeners: () => ipcRenderer.removeAllListeners('stats-update')
    },

    // ===== DEBUGGING & ENTWICKLUNG =====
    debug: {
        getSessionInfo: () => ipcRenderer.invoke('debug:get-session-info'),
        log: (level, message, data) => ipcRenderer.invoke('debug:log', level, message, data)
    },

    // ===== ALLGEMEINE EVENT-BEHANDLUNG =====
    events: {
        // Globale Event-Listener für alle Updates
        onUpdate: (callback) => {
            ipcRenderer.on('system-ready', callback);
            ipcRenderer.on('session-started', callback);
            ipcRenderer.on('session-ended', callback);
            ipcRenderer.on('session-timer-update', callback);
            ipcRenderer.on('qr-scan-result', callback);
            ipcRenderer.on('stats-update', callback);
        },

        // Alle Event-Listener entfernen
        removeAllListeners: () => {
            ipcRenderer.removeAllListeners('system-ready');
            ipcRenderer.removeAllListeners('session-started');
            ipcRenderer.removeAllListeners('session-ended');
            ipcRenderer.removeAllListeners('session-timer-update');
            ipcRenderer.removeAllListeners('rfid-tag-scanned');
            ipcRenderer.removeAllListeners('qr-scan-result');
            ipcRenderer.removeAllListeners('stats-update');
        }
    }
});

// ===== QUALITÄTSKONTROLLE UTILITIES =====
contextBridge.exposeInMainWorld('qualityUtils', {
    // ===== QR-CODE STATUS UTILITIES =====
    formatScanType: (scanType) => {
        const types = {
            'first_scan': {
                icon: '🔸',
                title: 'Eingang der Bearbeitung',
                description: 'Qualitätskontrolle gestartet',
                color: 'blue',
                nextAction: 'Scannen Sie denselben Code erneut zum Abschluss'
            },
            'second_scan': {
                icon: '🔹',
                title: 'Ausgang der Bearbeitung',
                description: 'Qualitätskontrolle abgeschlossen',
                color: 'green',
                nextAction: 'Neue Session automatisch gestartet'
            },
            'duplicate_error': {
                icon: '❌',
                title: 'Duplikat-Fehler',
                description: 'Karton bereits vollständig abgearbeitet',
                color: 'red',
                nextAction: 'Neuen Karton scannen'
            }
        };

        return types[scanType] || {
            icon: '📄',
            title: 'Unbekannter Scan-Typ',
            description: 'Status unbekannt',
            color: 'gray',
            nextAction: 'Kontaktieren Sie den Administrator'
        };
    },

    // ===== ZEITBERECHNUNG =====
    formatDuration: (milliseconds) => {
        if (!milliseconds || milliseconds < 0) return '00:00:00';

        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    },

    formatProcessingTime: (milliseconds) => {
        if (!milliseconds || milliseconds < 0) return '0s';

        const totalSeconds = Math.floor(milliseconds / 1000);

        if (totalSeconds < 60) {
            return `${totalSeconds}s`;
        } else if (totalSeconds < 3600) {
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${minutes}m ${seconds}s`;
        } else {
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    },

    getCurrentTime: () => {
        return new Date().toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    },

    getCurrentDate: () => {
        return new Date().toLocaleDateString('de-DE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    },

    // ===== SESSION-STATISTIKEN =====
    calculateSessionProgress: (sessionStats) => {
        if (!sessionStats) return null;

        const total = sessionStats.firstScans + sessionStats.completedScans;
        const completed = sessionStats.completedScans;
        const inProgress = sessionStats.firstScans - sessionStats.completedScans;

        return {
            total: total,
            completed: completed,
            inProgress: Math.max(0, inProgress),
            completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
        };
    },

    // ===== QR-CODE DEKODIERUNG =====
    formatDecodedData: (decodedData) => {
        if (!decodedData || !decodedData.fields) {
            return {
                hasData: false,
                summary: 'Rohdaten',
                fields: []
            };
        }

        return {
            hasData: true,
            summary: decodedData.summary || 'Dekodierte Daten',
            fields: decodedData.fields,
            quality: decodedData.quality || 'unknown',
            type: decodedData.type || 'decoded_qr'
        };
    },

    // ===== VALIDIERUNG =====
    validateSessionId: (sessionId) => {
        return sessionId && typeof sessionId === 'number' && sessionId > 0;
    },

    validateQRData: (qrData) => {
        return qrData && typeof qrData === 'string' && qrData.trim().length > 0;
    },

    validateUserId: (userId) => {
        return userId && typeof userId === 'number' && userId > 0;
    }
});

// ===== UTILS (Wiederverwendbare Hilfsfunktionen) =====
contextBridge.exposeInMainWorld('utils', {
    // ===== LOGGING =====
    log: (level, message, data = null) => {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toLowerCase(),
            message,
            data
        };

        // Browser-Console
        const consoleMethod = level === 'error' ? 'error' :
            level === 'warn' ? 'warn' : 'log';
        console[consoleMethod](`[${timestamp}] [${level.toUpperCase()}] ${message}`, data || '');

        // An Main-Process weiterleiten (für Datei-Logging)
        try {
            ipcRenderer.invoke('debug:log', level, message, data);
        } catch (error) {
            console.warn('Logging an Main-Process fehlgeschlagen:', error);
        }

        return logEntry;
    },

    // ===== FEHLERBEHANDLUNG =====
    handleError: (error, context = 'Unknown') => {
        const errorInfo = {
            message: error?.message || error || 'Unbekannter Fehler',
            stack: error?.stack,
            context: context,
            timestamp: new Date().toISOString()
        };

        console.error(`[${context}] Fehler:`, errorInfo);

        // Error-Logging
        try {
            ipcRenderer.invoke('debug:log', 'error', `${context}: ${errorInfo.message}`, errorInfo);
        } catch (logError) {
            console.warn('Error-Logging fehlgeschlagen:', logError);
        }

        return errorInfo;
    },

    // ===== PERFORMANCE =====
    performanceTimer: () => {
        const start = performance.now();

        return {
            start: start,
            elapsed: () => performance.now() - start,
            end: (label = 'Operation') => {
                const elapsed = performance.now() - start;
                console.log(`⏱️ ${label}: ${elapsed.toFixed(2)}ms`);
                return elapsed;
            }
        };
    },

    // ===== ASYNC HELPERS =====
    sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    debounce: (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(null, args), delay);
        };
    },

    throttle: (func, limit) => {
        let inThrottle;
        return (...args) => {
            if (!inThrottle) {
                func.apply(null, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // ===== DATENVALIDIERUNG =====
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
                return localStorage.getItem('qualitaetskontrolle-theme') || 'auto';
            } catch {
                return 'auto';
            }
        },

        set: (theme) => {
            try {
                localStorage.setItem('qualitaetskontrolle-theme', theme);
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

// ===== QUALITÄTSKONTROLLE-SPEZIFISCHE ERROR HANDLING =====
contextBridge.exposeInMainWorld('errorHandler', {
    // Standard-Fehlerbehandlung für QR-Scan-Fehler
    handleQRScanError: (error, qrData) => {
        const errorTypes = {
            'Duplikat-Fehler': {
                type: 'duplicate',
                icon: '❌',
                title: 'Duplikat-Fehler',
                suggestion: 'Dieser Karton wurde bereits vollständig abgearbeitet. Scannen Sie einen neuen Karton.'
            },
            'Session nicht gefunden': {
                type: 'session',
                icon: '⚠️',
                title: 'Session-Fehler',
                suggestion: 'Bitte melden Sie sich erneut mit Ihrem RFID-Tag an.'
            },
            'Zu viele Scans': {
                type: 'rate_limit',
                icon: '⏰',
                title: 'Zu schnell',
                suggestion: 'Warten Sie einen Moment, bevor Sie den nächsten Code scannen.'
            }
        };

        // Fehlertyp erkennen
        const errorMessage = error?.message || error || '';
        let errorInfo = null;

        for (const [key, info] of Object.entries(errorTypes)) {
            if (errorMessage.includes(key)) {
                errorInfo = info;
                break;
            }
        }

        if (!errorInfo) {
            errorInfo = {
                type: 'unknown',
                icon: '❓',
                title: 'Unbekannter Fehler',
                suggestion: 'Versuchen Sie es erneut oder kontaktieren Sie den Administrator.'
            };
        }

        return {
            ...errorInfo,
            originalError: errorMessage,
            qrData: qrData,
            timestamp: new Date().toISOString()
        };
    },

    // RFID-Fehlerbehandlung
    handleRFIDError: (error, tagId) => {
        const errorMessage = error?.message || error || '';

        if (errorMessage.includes('Unbekannter RFID-Tag')) {
            return {
                type: 'unknown_tag',
                icon: '🏷️',
                title: 'Unbekannter RFID-Tag',
                suggestion: 'Ihr RFID-Tag ist nicht registriert. Kontaktieren Sie den Administrator.',
                tagId: tagId
            };
        }

        if (errorMessage.includes('zu schnell')) {
            return {
                type: 'too_fast',
                icon: '⏰',
                title: 'Zu schnell gescannt',
                suggestion: 'Warten Sie einen Moment und versuchen Sie es erneut.',
                tagId: tagId
            };
        }

        return {
            type: 'unknown',
            icon: '❓',
            title: 'RFID-Fehler',
            suggestion: 'Versuchen Sie es erneut oder kontaktieren Sie den Administrator.',
            originalError: errorMessage,
            tagId: tagId
        };
    },

    // Session-Fehlerbehandlung
    handleSessionError: (error, sessionContext) => {
        const errorMessage = error?.message || error || '';

        return {
            type: 'session_error',
            icon: '⚠️',
            title: 'Session-Fehler',
            suggestion: 'Melden Sie sich erneut mit Ihrem RFID-Tag an.',
            originalError: errorMessage,
            context: sessionContext,
            timestamp: new Date().toISOString()
        };
    }
});

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('Preload Script geladen, DOM bereit für Qualitätskontrolle');

    // Theme initialisieren (mit Verzögerung da config erst nach DOM ready verfügbar ist)
    setTimeout(() => {
        try {
            const savedTheme = localStorage.getItem('qualitaetskontrolle-theme') || 'auto';
            if (typeof window.config !== 'undefined' && window.config.theme) {
                window.config.theme.set(savedTheme);
            }
        } catch (error) {
            console.warn('Theme-Initialisierung fehlgeschlagen:', error);
        }
    }, 100);

    // System Theme Changes verfolgen
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            try {
                const currentTheme = localStorage.getItem('qualitaetskontrolle-theme') || 'auto';
                if (currentTheme === 'auto' && typeof window.config !== 'undefined' && window.config.theme) {
                    window.config.theme.set('auto'); // Theme neu anwenden
                }
            } catch (error) {
                console.warn('Theme-Update fehlgeschlagen:', error);
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

    console.log('✅ Preload Script erfolgreich initialisiert für Qualitätskontrolle mit zweimaligem Scannen');
});

console.log('Preload Script für Qualitätskontrolle mit automatischem Session-Management geladen');