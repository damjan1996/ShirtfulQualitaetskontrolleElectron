/**
 * Qualitätskontrolle RFID QR - Preload Script
 * Sichere IPC-Kommunikation zwischen Renderer und Main Process
 * Spezialisiert für Doppel-Scan-System und Multi-User-Sessions
 */

const { contextBridge, ipcRenderer } = require('electron');

// ===== SICHERE IPC-BRIDGE FÜR QUALITÄTSKONTROLLE =====
contextBridge.exposeInMainWorld('electronAPI', {

    // ===== SYSTEM & STATUS =====
    invoke: (channel, ...args) => {
        // Erlaubte IPC-Kanäle für invoke
        const validInvokeChannels = [
            'system:get-status',
            'system:get-info',
            'system:restart',

            // Sessions
            'sessions:get-active',
            'sessions:get-by-id',
            'sessions:end-session',
            'sessions:get-stats',

            // QR-Scanning (Qualitätskontrolle-spezifisch)
            'qr:process-scan',
            'qr:get-scan-state',
            'qr:get-session-scans',
            'qr:get-history',
            'qr:get-stats',

            // RFID
            'rfid:simulate-tag',
            'rfid:get-status',
            'rfid:test-connection',

            // Database
            'db:test-connection',
            'db:get-stats',
            'db:cleanup',

            // Users
            'users:get-all',
            'users:get-by-id',
            'users:get-by-epc',

            // Qualitätskontrolle-spezifische APIs
            'quality:get-stats',
            'quality:reset-stats',
            'quality:get-completion-report',
            'quality:export-data',

            // Development/Debug
            'dev:simulate-qr-scan',
            'dev:reset-all-data',
            'dev:get-debug-info'
        ];

        if (validInvokeChannels.includes(channel)) {
            return ipcRenderer.invoke(channel, ...args);
        } else {
            throw new Error(`Unauthorized IPC invoke channel: ${channel}`);
        }
    },

    // ===== EVENT LISTENERS =====
    on: (channel, callback) => {
        // Erlaubte Event-Kanäle
        const validEventChannels = [
            // Session Events
            'session-started',
            'session-ended',
            'sessions-updated',
            'session-timer-update',
            'session-error',

            // RFID Events
            'rfid-scan-success',
            'rfid-scan-error',
            'rfid-status-changed',
            'rfid-device-connected',
            'rfid-device-disconnected',

            // QR-Scan Events (Qualitätskontrolle-spezifisch)
            'qr-scan-success',
            'qr-scan-error',
            'qr-scan-duplicate',
            'qr-scan-first',
            'qr-scan-second',
            'qr-scan-invalid',

            // System Events
            'system-status-changed',
            'database-connected',
            'database-disconnected',
            'database-error',

            // Qualitätskontrolle Events
            'quality-stats-updated',
            'quality-milestone-reached',
            'quality-error-threshold-exceeded',
            'box-processing-started',
            'box-processing-completed',

            // UI Events
            'notification-show',
            'overlay-show',
            'overlay-hide',

            // Debug Events
            'debug-message',
            'performance-warning',
            'memory-usage-high'
        ];

        if (validEventChannels.includes(channel)) {
            // Event-Listener hinzufügen
            const subscription = (event, ...args) => callback(...args);
            ipcRenderer.on(channel, subscription);

            // Cleanup-Funktion zurückgeben
            return () => {
                ipcRenderer.removeListener(channel, subscription);
            };
        } else {
            throw new Error(`Unauthorized IPC event channel: ${channel}`);
        }
    },

    // ===== ONE-TIME EVENT LISTENERS =====
    once: (channel, callback) => {
        const validEventChannels = [
            'app-ready',
            'database-initialized',
            'rfid-initialized',
            'system-ready',
            'session-setup-complete'
        ];

        if (validEventChannels.includes(channel)) {
            ipcRenderer.once(channel, (event, ...args) => callback(...args));
        } else {
            throw new Error(`Unauthorized IPC once channel: ${channel}`);
        }
    },

    // ===== QUALITÄTSKONTROLLE-SPEZIFISCHE APIs =====
    qualityControl: {
        // Doppel-Scan-Logik
        processDoubleScan: async (qrCode, sessionId, scanType = 'auto') => {
            return await ipcRenderer.invoke('qr:process-scan', qrCode, sessionId, { scanType });
        },

        // QR-Code Status abrufen
        getQRCodeStatus: async (qrCode) => {
            return await ipcRenderer.invoke('qr:get-scan-state', qrCode);
        },

        // Session-spezifische Scans
        getSessionScans: async (sessionId) => {
            return await ipcRenderer.invoke('qr:get-session-scans', sessionId);
        },

        // Qualitätskontrolle-Statistiken
        getStats: async () => {
            return await ipcRenderer.invoke('quality:get-stats');
        },

        // Statistiken zurücksetzen
        resetStats: async () => {
            return await ipcRenderer.invoke('quality:reset-stats');
        },

        // Completion Report erstellen
        getCompletionReport: async (dateRange = null) => {
            return await ipcRenderer.invoke('quality:get-completion-report', dateRange);
        },

        // Daten exportieren
        exportData: async (format = 'csv', filters = {}) => {
            return await ipcRenderer.invoke('quality:export-data', format, filters);
        }
    },

    // ===== SESSION MANAGEMENT =====
    sessions: {
        // Aktive Sessions abrufen
        getActive: async () => {
            return await ipcRenderer.invoke('sessions:get-active');
        },

        // Session beenden
        endSession: async (sessionId) => {
            return await ipcRenderer.invoke('sessions:end-session', sessionId);
        },

        // Session-Statistiken
        getStats: async (sessionId = null) => {
            return await ipcRenderer.invoke('sessions:get-stats', sessionId);
        },

        // Session-Events abonnieren
        onSessionStarted: (callback) => {
            return ipcRenderer.on('session-started', (event, data) => callback(data));
        },

        onSessionEnded: (callback) => {
            return ipcRenderer.on('session-ended', (event, data) => callback(data));
        },

        onSessionsUpdated: (callback) => {
            return ipcRenderer.on('sessions-updated', (event, data) => callback(data));
        }
    },

    // ===== RFID MANAGEMENT =====
    rfid: {
        // RFID-Tag simulieren
        simulateTag: async (tagId) => {
            return await ipcRenderer.invoke('rfid:simulate-tag', tagId);
        },

        // RFID-Status abrufen
        getStatus: async () => {
            return await ipcRenderer.invoke('rfid:get-status');
        },

        // RFID-Verbindung testen
        testConnection: async () => {
            return await ipcRenderer.invoke('rfid:test-connection');
        },

        // RFID-Events abonnieren
        onScanSuccess: (callback) => {
            return ipcRenderer.on('rfid-scan-success', (event, data) => callback(data));
        },

        onScanError: (callback) => {
            return ipcRenderer.on('rfid-scan-error', (event, data) => callback(data));
        },

        onStatusChanged: (callback) => {
            return ipcRenderer.on('rfid-status-changed', (event, data) => callback(data));
        }
    },

    // ===== QR-SCANNER MANAGEMENT =====
    qrScanner: {
        // QR-Scan verarbeiten
        processScan: async (qrData, sessionId, options = {}) => {
            return await ipcRenderer.invoke('qr:process-scan', qrData, sessionId, options);
        },

        // Scan-Historie abrufen
        getHistory: async (limit = 50, sessionId = null) => {
            return await ipcRenderer.invoke('qr:get-history', limit, sessionId);
        },

        // Scan-Statistiken
        getStats: async (sessionId = null) => {
            return await ipcRenderer.invoke('qr:get-stats', sessionId);
        },

        // QR-Events abonnieren
        onScanSuccess: (callback) => {
            return ipcRenderer.on('qr-scan-success', (event, data) => callback(data));
        },

        onScanError: (callback) => {
            return ipcRenderer.on('qr-scan-error', (event, data) => callback(data));
        },

        onFirstScan: (callback) => {
            return ipcRenderer.on('qr-scan-first', (event, data) => callback(data));
        },

        onSecondScan: (callback) => {
            return ipcRenderer.on('qr-scan-second', (event, data) => callback(data));
        },

        onDuplicateError: (callback) => {
            return ipcRenderer.on('qr-scan-duplicate', (event, data) => callback(data));
        }
    },

    // ===== DATABASE MANAGEMENT =====
    database: {
        // Verbindung testen
        testConnection: async () => {
            return await ipcRenderer.invoke('db:test-connection');
        },

        // Statistiken abrufen
        getStats: async () => {
            return await ipcRenderer.invoke('db:get-stats');
        },

        // Cleanup durchführen
        cleanup: async () => {
            return await ipcRenderer.invoke('db:cleanup');
        },

        // Database-Events abonnieren
        onConnected: (callback) => {
            return ipcRenderer.on('database-connected', (event, data) => callback(data));
        },

        onDisconnected: (callback) => {
            return ipcRenderer.on('database-disconnected', (event, data) => callback(data));
        },

        onError: (callback) => {
            return ipcRenderer.on('database-error', (event, data) => callback(data));
        }
    },

    // ===== USER MANAGEMENT =====
    users: {
        // Alle Benutzer abrufen
        getAll: async () => {
            return await ipcRenderer.invoke('users:get-all');
        },

        // Benutzer nach ID
        getById: async (userId) => {
            return await ipcRenderer.invoke('users:get-by-id', userId);
        },

        // Benutzer nach EPC (RFID)
        getByEPC: async (epcTag) => {
            return await ipcRenderer.invoke('users:get-by-epc', epcTag);
        }
    },

    // ===== SYSTEM UTILITIES =====
    system: {
        // System-Status abrufen
        getStatus: async () => {
            return await ipcRenderer.invoke('system:get-status');
        },

        // System-Info abrufen
        getInfo: async () => {
            return await ipcRenderer.invoke('system:get-info');
        },

        // System neu starten
        restart: async () => {
            return await ipcRenderer.invoke('system:restart');
        },

        // System-Events abonnieren
        onStatusChanged: (callback) => {
            return ipcRenderer.on('system-status-changed', (event, data) => callback(data));
        },

        onNotification: (callback) => {
            return ipcRenderer.on('notification-show', (event, data) => callback(data));
        }
    },

    // ===== DEVELOPMENT & DEBUG =====
    dev: {
        // QR-Scan simulieren
        simulateQRScan: async (qrData, sessionId) => {
            return await ipcRenderer.invoke('dev:simulate-qr-scan', qrData, sessionId);
        },

        // Alle Daten zurücksetzen
        resetAllData: async () => {
            return await ipcRenderer.invoke('dev:reset-all-data');
        },

        // Debug-Info abrufen
        getDebugInfo: async () => {
            return await ipcRenderer.invoke('dev:get-debug-info');
        },

        // Debug-Events abonnieren
        onDebugMessage: (callback) => {
            return ipcRenderer.on('debug-message', (event, data) => callback(data));
        },

        onPerformanceWarning: (callback) => {
            return ipcRenderer.on('performance-warning', (event, data) => callback(data));
        }
    },

    // ===== UTILITY FUNCTIONS =====
    utils: {
        // Plattform-Info
        platform: process.platform,

        // Node.js Version
        nodeVersion: process.versions.node,

        // Electron Version
        electronVersion: process.versions.electron,

        // Chrome Version
        chromeVersion: process.versions.chrome,

        // Zeitmessung
        now: () => Date.now(),

        // UUID generieren
        generateUUID: () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        // Formatierung
        formatDuration: (milliseconds) => {
            const seconds = Math.floor(milliseconds / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);

            if (hours > 0) {
                return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
            } else {
                return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
            }
        },

        formatTimestamp: (timestamp) => {
            return new Date(timestamp).toLocaleString('de-DE');
        },

        formatDate: (date) => {
            return new Date(date).toLocaleDateString('de-DE');
        },

        formatTime: (time) => {
            return new Date(time).toLocaleTimeString('de-DE');
        }
    }
});

// ===== SICHERHEITSPRÜFUNGEN =====

// Prüfe ob im Development-Modus
const isDevelopment = process.env.NODE_ENV === 'development';

// Development-spezifische APIs nur im Dev-Modus verfügbar machen
if (isDevelopment) {
    console.log('🚀 Qualitätskontrolle-App läuft im Development-Modus');

    // Zusätzliche Debug-Funktionen
    contextBridge.exposeInMainWorld('devAPI', {
        // Console-Umleitung für Debugging
        log: (...args) => console.log('[RENDERER]', ...args),
        warn: (...args) => console.warn('[RENDERER]', ...args),
        error: (...args) => console.error('[RENDERER]', ...args),

        // Memory-Info
        getMemoryInfo: () => process.memoryUsage(),

        // Process-Info
        getProcessInfo: () => ({
            pid: process.pid,
            platform: process.platform,
            arch: process.arch,
            versions: process.versions
        }),

        // Performance-Metriken
        performance: {
            now: () => performance.now(),
            mark: (name) => performance.mark(name),
            measure: (name, startMark, endMark) => performance.measure(name, startMark, endMark),
            getEntries: () => performance.getEntries()
        }
    });
} else {
    console.log('🏭 Qualitätskontrolle-App läuft im Production-Modus');
}

// ===== ERROR HANDLING =====

// Globale Fehlerbehandlung für Renderer-Process
window.addEventListener('error', (event) => {
    console.error('Qualitätskontrolle Renderer Error:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
    });

    // Fehler an Main-Process weiterleiten
    if (window.electronAPI) {
        window.electronAPI.invoke('system:report-error', {
            type: 'renderer-error',
            message: event.message,
            stack: event.error?.stack,
            timestamp: Date.now()
        }).catch(() => {
            // Fehler beim Senden ignorieren
        });
    }
});

// Unhandled Promise Rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Qualitätskontrolle Unhandled Promise Rejection:', event.reason);

    // Fehler an Main-Process weiterleiten
    if (window.electronAPI) {
        window.electronAPI.invoke('system:report-error', {
            type: 'unhandled-rejection',
            reason: event.reason?.toString(),
            stack: event.reason?.stack,
            timestamp: Date.now()
        }).catch(() => {
            // Fehler beim Senden ignorieren
        });
    }
});

// ===== LIFECYCLE EVENTS =====

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ Qualitätskontrolle DOM Content Loaded');

    // Initialisierung-Event senden
    if (window.electronAPI) {
        window.electronAPI.invoke('system:renderer-ready', {
            timestamp: Date.now(),
            url: window.location.href,
            userAgent: navigator.userAgent
        }).catch((error) => {
            console.warn('Renderer-Ready Event konnte nicht gesendet werden:', error);
        });
    }
});

// Before Unload
window.addEventListener('beforeunload', () => {
    console.log('🔄 Qualitätskontrolle Renderer wird beendet');

    // Cleanup-Event senden
    if (window.electronAPI) {
        window.electronAPI.invoke('system:renderer-cleanup', {
            timestamp: Date.now()
        }).catch(() => {
            // Fehler beim Senden ignorieren
        });
    }
});

// ===== QUALITÄTSKONTROLLE-SPEZIFISCHE INITIALISIERUNG =====

// Qualitätskontrolle App-spezifische Konfiguration
window.QUALITY_CONTROL_CONFIG = {
    appName: 'RFID Qualitätskontrolle',
    version: '1.0.0',
    features: {
        doubleScanLogic: true,
        autoSessionEnd: true,
        duplicateDetection: true,
        parallelSessions: true
    },
    limits: {
        maxScansPerBox: 2,
        duplicateErrorOnThirdScan: true,
        autoSessionRestartDelay: 500
    }
};

console.log('✅ Qualitätskontrolle Preload Script geladen:', window.QUALITY_CONTROL_CONFIG);