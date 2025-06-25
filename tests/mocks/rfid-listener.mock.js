// tests/mocks/rfid-listener.mock.js
/**
 * Mock RFID Listener für Tests
 * Simuliert Hardware-RFID-Reader ohne echte Hardware-Abhängigkeiten
 * Vollständig korrigiert für stabile Tests
 */

const { EventEmitter } = require('events');

class MockRFIDListener extends EventEmitter {
    constructor() {
        super();

        // Grundlegende Status-Eigenschaften
        this.isRunning = false;
        this.isListening = false;
        this.isHardwareReady = false;
        this.currentBuffer = '';
        this.registeredShortcuts = [];
        this.bufferTimeout = null;
        this.bufferTimeoutMs = 500;

        // Statistiken - vollständige Initialisierung
        this.stats = {
            totalScans: 0,
            validScans: 0,
            invalidScans: 0,
            errors: 0,
            startTime: null,
            lastScanTime: null,
            successRate: 0,
            uptime: 0,
            performance: {
                avgProcessingTime: 0,
                maxProcessingTime: 0,
                minProcessingTime: Infinity,
                processingTimes: []
            }
        };

        // Konfiguration
        this.config = {
            minTagLength: 6,
            maxTagLength: 20,
            allowedCharacters: /^[0-9A-Fa-f]+$/,
            simulateHardwareErrors: false,
            hardwareErrorRate: 0,  // Für Tests auf 0 setzen
            debugMode: false
        };

        // Test-Hilfsfunktionen
        this.testMode = true;
        this.simulationQueue = [];
        this.simulationInterval = null;
        this.autoScanEnabled = false;
        this.autoScanTags = ['53004114', '53004115', '53004116'];
        this.autoScanCurrentIndex = 0;
        this.autoScanIntervalMs = 1000;

        // Mock tags für deterministische Tests
        this.mockTags = ['53004114', '53004115', '53004116'];
        this.mockTagIndex = 0;

        // Hardware error control für Tests
        this.forceHardwareError = false;
        this.hardwareErrorDisabled = false;

        // Cleanup tracking
        this.activeTimeouts = new Set();
        this.activeIntervals = new Set();

        // Bind methods to preserve this context
        this._handleKeyPress = this._handleKeyPress.bind(this);
        this._processBuffer = this._processBuffer.bind(this);
        this._processScanResult = this._processScanResult.bind(this);
    }

    // =================== PUBLIC API ===================

    async start() {
        try {
            this._log('Starte RFID Listener (Mock-Modus)...');

            if (this.isRunning) {
                this._log('RFID Listener läuft bereits');
                return;
            }

            // Hardware initialisieren (deterministisch für Tests)
            await this._initializeHardware();

            // Shortcuts registrieren
            this._registerShortcuts();

            // Status setzen
            this.isRunning = true;
            this.isListening = true;
            this.isHardwareReady = true;
            this.stats.startTime = Date.now();

            this._log('RFID Listener erfolgreich gestartet');
            this.emit('started');

        } catch (error) {
            this._log(`Fehler beim Starten: ${error.message}`, 'error');
            this.emit('error', error);
            throw error;
        }
    }

    async stop() {
        try {
            this._log('Stoppe RFID Listener...');

            if (!this.isRunning) {
                this._log('RFID Listener läuft nicht');
                return;
            }

            // Auto-scan deaktivieren
            this.disableAutoScan();

            // Buffer timeout clearen
            if (this.bufferTimeout) {
                clearTimeout(this.bufferTimeout);
                this.bufferTimeout = null;
            }

            // Shortcuts abmelden
            this._unregisterShortcuts();

            // Hardware herunterfahren
            await this._shutdownHardware();

            // Status zurücksetzen
            this.isRunning = false;
            this.isListening = false;
            this.isHardwareReady = false;
            this.currentBuffer = '';

            // Cleanup
            this._cleanup();

            this._log('RFID Listener gestoppt');
            this.emit('stopped');

        } catch (error) {
            this._log(`Fehler beim Stoppen: ${error.message}`, 'error');
            this.emit('error', error);
        }
    }

    async destroy() {
        try {
            this._log('Zerstöre RFID Listener...');

            // Erst stoppen
            if (this.isRunning) {
                await this.stop();
            }

            // Alle Event Listener entfernen
            this.removeAllListeners();

            // Auto-scan komplett deaktivieren
            this.autoScanEnabled = false;

            // Statistiken zurücksetzen
            this._resetStats();

            // Mock-Daten zurücksetzen
            this.mockTags = [];
            this.mockTagIndex = 0;

            this._log('RFID Listener zerstört');

        } catch (error) {
            this._log(`Fehler beim Zerstören: ${error.message}`, 'error');
        }
    }

    // =================== SIMULATION METHODS ===================

    simulateTag(tagId, delay = 10) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.activeTimeouts.delete(timeout);
                if (this.isListening) {
                    this._simulateRFIDInput(tagId);
                }
                resolve();
            }, delay);
            this.activeTimeouts.add(timeout);
        });
    }

    simulateHardwareError(errorType = 'connection_lost') {
        const errorMessages = {
            'connection_lost': 'RFID reader connection lost',
            'device_not_found': 'RFID reader device not found',
            'permission_denied': 'Permission denied accessing RFID reader',
            'timeout': 'RFID reader timeout',
            'invalid_response': 'Invalid response from RFID reader'
        };

        const message = errorMessages[errorType] || errorMessages['connection_lost'];
        const error = new Error(message);
        error.type = errorType;

        this.stats.errors++;
        this.emit('error', error);

        return error;
    }

    enableAutoScan(intervalMs = 1000) {
        if (this.autoScanEnabled) {
            return;
        }

        this.autoScanEnabled = true;
        this.autoScanIntervalMs = intervalMs;
        this.autoScanCurrentIndex = 0;

        const interval = setInterval(() => {
            if (!this.autoScanEnabled || !this.isListening) {
                clearInterval(interval);
                this.activeIntervals.delete(interval);
                return;
            }

            const tags = this.mockTags.length > 0 ? this.mockTags : this.autoScanTags;
            if (tags.length > 0) {
                const tag = tags[this.autoScanCurrentIndex % tags.length];
                this._simulateRFIDInput(tag);
                this.autoScanCurrentIndex++;
            }
        }, this.autoScanIntervalMs);

        this.activeIntervals.add(interval);
        this._log('Auto-Scan aktiviert');
    }

    disableAutoScan() {
        this.autoScanEnabled = false;
        this.autoScanCurrentIndex = 0;

        // Clear alle Auto-scan intervals
        this.activeIntervals.forEach(interval => {
            clearInterval(interval);
        });
        this.activeIntervals.clear();

        this._log('Auto-Scan deaktiviert');
    }

    setMockTags(tags) {
        this.mockTags = [...tags];
        this.mockTagIndex = 0;
        this.autoScanCurrentIndex = 0;
        this._log(`Mock Tags gesetzt: ${tags.join(', ')}`);
    }

    // =================== CONFIGURATION ===================

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this._log('Konfiguration aktualisiert');
    }

    getStats() {
        const now = Date.now();
        const uptime = this.stats.startTime ? now - this.stats.startTime : 0;
        const total = this.stats.validScans + this.stats.invalidScans;
        const successRate = total > 0 ? Math.round((this.stats.validScans / total) * 100) : 0;

        // Performance-Metriken berechnen
        const avgProcessingTime = this.stats.performance.processingTimes.length > 0
            ? this.stats.performance.processingTimes.reduce((a, b) => a + b, 0) / this.stats.performance.processingTimes.length
            : 0;

        return {
            ...this.stats,
            uptime,
            successRate,
            performance: {
                ...this.stats.performance,
                avgProcessingTime
            }
        };
    }

    // =================== TEST UTILITIES ===================

    enableHardwareError() {
        this.forceHardwareError = true;
        this.hardwareErrorDisabled = false;
    }

    disableHardwareError() {
        this.forceHardwareError = false;
        this.hardwareErrorDisabled = true;
    }

    // =================== PRIVATE METHODS ===================

    async _initializeHardware() {
        // Deterministisches Verhalten für Tests
        if (this.forceHardwareError && !this.hardwareErrorDisabled) {
            throw new Error('Hardware initialization failed');
        }

        // Simuliere Hardware-Initialisierung
        await new Promise(resolve => {
            const timeout = setTimeout(() => {
                this.activeTimeouts.delete(timeout);
                resolve();
            }, 50);
            this.activeTimeouts.add(timeout);
        });

        this._log('Hardware initialized successfully');
    }

    async _shutdownHardware() {
        // Simuliere Hardware-Shutdown
        await new Promise(resolve => {
            const timeout = setTimeout(() => {
                this.activeTimeouts.delete(timeout);
                resolve();
            }, 30);
            this.activeTimeouts.add(timeout);
        });

        this._log('Hardware shutdown complete');
    }

    _registerShortcuts() {
        if (!global.mockElectron?.globalShortcut) {
            this._log('Electron globalShortcut nicht verfügbar (Mock-Umgebung)');
            return;
        }

        const shortcuts = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'Enter'];
        let registeredCount = 0;

        shortcuts.forEach(key => {
            try {
                const success = global.mockElectron.globalShortcut.register(key, () => {
                    this._handleKeyPress(key);
                });

                if (success) {
                    this.registeredShortcuts.push(key);
                    registeredCount++;
                }
            } catch (error) {
                this._log(`Fehler beim Registrieren von Shortcut ${key}: ${error.message}`, 'error');
            }
        });

        this._log(`${registeredCount} Shortcuts registriert`);
    }

    _unregisterShortcuts() {
        if (!global.mockElectron?.globalShortcut) {
            this._log('Electron globalShortcut nicht verfügbar');
            return;
        }

        try {
            global.mockElectron.globalShortcut.unregisterAll();
            this.registeredShortcuts = [];
            this._log('Shortcuts abgemeldet');
        } catch (error) {
            this._log(`Fehler beim Abmelden der Shortcuts: ${error.message}`, 'error');
        }
    }

    _handleKeyPress(key) {
        if (!this.isListening) {
            return;
        }

        const startTime = process.hrtime.bigint();

        try {
            if (key === 'Enter') {
                this._processBuffer();
            } else {
                this.currentBuffer += key;

                // Buffer timeout neu setzen
                if (this.bufferTimeout) {
                    clearTimeout(this.bufferTimeout);
                    this.activeTimeouts.delete(this.bufferTimeout);
                }

                const timeout = setTimeout(() => {
                    this.activeTimeouts.delete(timeout);
                    this._processBuffer();
                }, this.bufferTimeoutMs);
                this.bufferTimeout = timeout;
                this.activeTimeouts.add(timeout);
            }

            // Performance tracking
            const endTime = process.hrtime.bigint();
            const processingTime = Number(endTime - startTime) / 1000000; // Convert to ms
            this._updatePerformanceStats(processingTime);

        } catch (error) {
            this._log(`Fehler bei Tastenverarbeitung: ${error.message}`, 'error');
            this.stats.errors++;
        }
    }

    _processBuffer() {
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
            this.activeTimeouts.delete(this.bufferTimeout);
            this.bufferTimeout = null;
        }

        const tagId = this.currentBuffer.trim();
        this.currentBuffer = '';

        if (tagId.length === 0) {
            return;
        }

        this._processScanResult(tagId);
    }

    _processScanResult(tagId) {
        this.stats.totalScans++;
        this.stats.lastScanTime = Date.now();

        const validation = this._validateTag(tagId);

        if (validation.isValid) {
            this.stats.validScans++;
            this._log(`Valid Tag: ${tagId}`);
            this.emit('tag-detected', { tagId, timestamp: new Date().toISOString() });
        } else {
            this.stats.invalidScans++;
            this._log(`Invalid Tag: ${tagId} - ${validation.reason}`);
            this.emit('invalid-scan', {
                tagId,
                reason: validation.reason,
                timestamp: new Date().toISOString()
            });
        }

        // Success rate aktualisieren
        const total = this.stats.validScans + this.stats.invalidScans;
        this.stats.successRate = total > 0 ? Math.round((this.stats.validScans / total) * 100) : 0;
    }

    _validateTag(tagId) {
        // Leerer Tag
        if (!tagId || tagId.length === 0) {
            return { isValid: false, reason: 'Empty tag ID' };
        }

        // Länge prüfen
        if (tagId.length < this.config.minTagLength) {
            return { isValid: false, reason: 'Tag ID too short' };
        }

        if (tagId.length > this.config.maxTagLength) {
            return { isValid: false, reason: 'Tag ID too long' };
        }

        // Gültige Zeichen prüfen
        if (!this.config.allowedCharacters.test(tagId)) {
            return { isValid: false, reason: 'Invalid hex characters' };
        }

        return { isValid: true };
    }

    _simulateRFIDInput(tagId) {
        if (!this.isListening) {
            return;
        }

        // Simuliere Tasteneingabe für jeden Charakter
        for (const char of tagId) {
            this._handleKeyPress(char);
        }

        // Simuliere Enter-Taste
        this._handleKeyPress('Enter');
    }

    _updatePerformanceStats(processingTime) {
        this.stats.performance.processingTimes.push(processingTime);

        // Nur die letzten 100 Messungen behalten
        if (this.stats.performance.processingTimes.length > 100) {
            this.stats.performance.processingTimes.shift();
        }

        this.stats.performance.maxProcessingTime = Math.max(
            this.stats.performance.maxProcessingTime,
            processingTime
        );

        this.stats.performance.minProcessingTime = Math.min(
            this.stats.performance.minProcessingTime,
            processingTime
        );
    }

    _resetStats() {
        this.stats = {
            totalScans: 0,
            validScans: 0,
            invalidScans: 0,
            errors: 0,
            startTime: null,
            lastScanTime: null,
            successRate: 0,
            uptime: 0,
            performance: {
                avgProcessingTime: 0,
                maxProcessingTime: 0,
                minProcessingTime: Infinity,
                processingTimes: []
            }
        };
    }

    _cleanup() {
        // Clear alle aktiven Timeouts
        this.activeTimeouts.forEach(timeout => {
            clearTimeout(timeout);
        });
        this.activeTimeouts.clear();

        // Clear alle aktiven Intervals
        this.activeIntervals.forEach(interval => {
            clearInterval(interval);
        });
        this.activeIntervals.clear();

        // Buffer zurücksetzen
        this.currentBuffer = '';
        this.bufferTimeout = null;
    }

    _log(message, level = 'info') {
        if (this.config.debugMode || level === 'error') {
            const timestamp = new Date().toISOString();
            const prefix = `[${timestamp}] [RFID-Mock] [${level.toUpperCase()}]`;
            console.log(`${prefix} ${message}`);
        }
    }
}

module.exports = MockRFIDListener;