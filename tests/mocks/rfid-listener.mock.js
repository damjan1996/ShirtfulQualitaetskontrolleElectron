// tests/mocks/rfid-listener.mock.js
/**
 * Mock RFID Listener für Tests - Vollständig korrigiert
 * Simuliert Hardware-RFID-Reader ohne echte Hardware-Abhängigkeiten
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
        this.autoScanIntervalMs = 2000;
        this.mockTags = null;
        this.hardwareErrorEnabled = false;

        // Input Buffer Management
        this.inputBuffer = '';
        this.lastInputTime = 0;

        // Error handling
        this.setMaxListeners(20);

        // Bind methods to avoid context issues
        this.simulateTag = this.simulateTag.bind(this);
        this.simulateHardwareError = this.simulateHardwareError.bind(this);
        this.handleInput = this.handleInput.bind(this);
        this.getStats = this.getStats.bind(this);
    }

    // === Lifecycle Management ===

    async start() {
        if (this.isRunning) {
            this._log('WARN', 'RFID Listener already running');
            return;
        }

        try {
            this._log('INFO', 'Starting RFID Listener...');

            // Simuliere Hardware-Initialisierung
            await this._delay(100);

            if (this.hardwareErrorEnabled) {
                throw new Error('Hardware initialization failed');
            }

            this.isRunning = true;
            this.isListening = true;
            this.isHardwareReady = true;
            this.stats.startTime = new Date().toISOString();

            // Mock Shortcuts registrieren
            this._registerMockShortcuts();

            this._log('INFO', 'RFID Listener gestartet');
            this.emit('ready');

        } catch (error) {
            this.stats.errors++;
            this._log('ERROR', `Fehler beim Starten: ${error.message}`);
            this.emit('error', error);
            throw error;
        }
    }

    async stop() {
        if (!this.isRunning) {
            this._log('WARN', 'RFID Listener not running');
            return;
        }

        try {
            this._log('INFO', 'Stopping RFID Listener...');

            this.isRunning = false;
            this.isListening = false;
            this.isHardwareReady = false;

            // Auto-Scan deaktivieren
            this.disableAutoScan();

            // Buffer leeren
            this.currentBuffer = '';
            this.inputBuffer = '';

            // Shortcuts deregistrieren
            this._unregisterAllShortcuts();

            await this._delay(50);

            this._log('INFO', 'RFID Listener gestoppt');
            this.emit('stopped');

        } catch (error) {
            this.stats.errors++;
            this._log('ERROR', `Fehler beim Stoppen: ${error.message}`);
            this.emit('error', error);
            throw error;
        }
    }

    async restart() {
        this._log('INFO', 'Restarting RFID Listener...');
        await this.stop();
        await this._delay(100);
        await this.start();
    }

    async destroy() {
        this._log('INFO', 'Destroying RFID Listener...');

        if (this.isRunning) {
            await this.stop();
        }

        this.disableAutoScan();
        this.removeAllListeners();
        this._unregisterAllShortcuts();

        // Reset state
        this.currentBuffer = '';
        this.inputBuffer = '';
        this.registeredShortcuts = [];

        this._log('INFO', 'RFID Listener destroyed');
    }

    // === Input Handling ===

    handleInput(input) {
        if (!this.isRunning) {
            return;
        }

        const now = Date.now();
        this.lastInputTime = now;

        // Behandle Enter-Taste (Carriage Return) als Tag-Ende
        if (input === '\r' || input === '\n' || input === '\r\n') {
            if (this.inputBuffer.length > 0) {
                this._processCompleteTag(this.inputBuffer);
                this.inputBuffer = '';
            }
            return;
        }

        // Normale Zeichen zum Buffer hinzufügen
        if (typeof input === 'string' && input.length === 1) {
            this.inputBuffer += input;

            // Auto-Complete nach Timeout
            if (this.bufferTimeout) {
                clearTimeout(this.bufferTimeout);
            }

            this.bufferTimeout = setTimeout(() => {
                if (this.inputBuffer.length > 0) {
                    this._processCompleteTag(this.inputBuffer);
                    this.inputBuffer = '';
                }
            }, this.bufferTimeoutMs);
        }
    }

    _processCompleteTag(tagId) {
        if (!tagId || tagId.length === 0) {
            return;
        }

        // Buffer timeout löschen
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
            this.bufferTimeout = null;
        }

        // Tag verarbeiten
        this._processTagInput(tagId.trim());
    }

    // === Tag Processing ===

    _processTagInput(tagId) {
        const startTime = process.hrtime.bigint();

        // Validierung
        if (!this._validateTag(tagId)) {
            this.stats.invalidScans++;
            this.emit('invalid-scan', {
                tagId,
                reason: this._getValidationError(tagId),
                timestamp: new Date().toISOString()
            });
            return;
        }

        // Erfolgreicher Scan
        this.stats.totalScans++;
        this.stats.validScans++;
        this.stats.lastScanTime = new Date().toISOString();

        // Performance tracking
        const endTime = process.hrtime.bigint();
        const processingTime = Number(endTime - startTime) / 1000000; // Convert to ms
        this._updatePerformanceStats(processingTime);

        // Success rate calculation
        this.stats.successRate = Math.round((this.stats.validScans / this.stats.totalScans) * 100);

        this.emit('tag-detected', {
            tagId,
            timestamp: this.stats.lastScanTime
        });

        if (this.config.debugMode) {
            this._log('INFO', `Tag verarbeitet: ${tagId}`);
        }
    }

    _validateTag(tagId) {
        if (!tagId || typeof tagId !== 'string') return false;
        if (tagId.length < this.config.minTagLength) return false;
        if (tagId.length > this.config.maxTagLength) return false;
        if (!this.config.allowedCharacters.test(tagId)) return false;
        return true;
    }

    _getValidationError(tagId) {
        if (!tagId) return 'Empty tag ID';
        if (typeof tagId !== 'string') return 'Invalid tag type';
        if (tagId.length < this.config.minTagLength) return 'Tag ID too short';
        if (tagId.length > this.config.maxTagLength) return 'Tag ID too long';
        if (!this.config.allowedCharacters.test(tagId)) return 'Invalid characters';
        return 'Unknown validation error';
    }

    _updatePerformanceStats(processingTime) {
        const perf = this.stats.performance;
        perf.processingTimes.push(processingTime);

        // Keep only last 100 measurements
        if (perf.processingTimes.length > 100) {
            perf.processingTimes = perf.processingTimes.slice(-100);
        }

        perf.maxProcessingTime = Math.max(perf.maxProcessingTime, processingTime);
        perf.minProcessingTime = Math.min(perf.minProcessingTime, processingTime);
        perf.avgProcessingTime = perf.processingTimes.reduce((a, b) => a + b, 0) / perf.processingTimes.length;
    }

    // === Statistics and Monitoring ===

    getStats() {
        return {
            ...this.stats,
            uptime: this._calculateUptime()
        };
    }

    getStatistics() {
        return this.getStats();
    }

    resetStatistics() {
        this.stats = {
            totalScans: 0,
            validScans: 0,
            invalidScans: 0,
            errors: 0,
            startTime: this.stats.startTime, // Keep start time
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

    _calculateUptime() {
        if (!this.stats.startTime) return 0;
        return Date.now() - new Date(this.stats.startTime).getTime();
    }

    // === Configuration ===

    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        this._log('INFO', 'Konfiguration aktualisiert');
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            isListening: this.isListening,
            isHardwareReady: this.isHardwareReady,
            stats: { ...this.stats },
            config: { ...this.config },
            uptime: this._calculateUptime()
        };
    }

    // === Hardware Error Simulation ===

    enableHardwareError() {
        this.hardwareErrorEnabled = true;
        this._log('INFO', 'Hardware-Fehler-Simulation aktiviert');
    }

    disableHardwareError() {
        this.hardwareErrorEnabled = false;
        this._log('INFO', 'Hardware-Fehler-Simulation deaktiviert');
    }

    simulateHardwareError(errorType = 'connection_lost') {
        if (!this.isRunning) {
            return;
        }

        this.stats.errors++;

        const error = {
            type: errorType,
            message: this._getErrorMessage(errorType),
            timestamp: new Date().toISOString()
        };

        this._log('ERROR', `Hardware-Fehler simuliert: ${error.message}`);
        this.emit('error', error);

        // Bei kritischen Fehlern Listener stoppen
        if (['connection_lost', 'device_not_found'].includes(errorType)) {
            this.isHardwareReady = false;
            this.isListening = false;
        }
    }

    _getErrorMessage(errorType) {
        const messages = {
            'connection_lost': 'RFID Reader connection lost',
            'device_not_found': 'RFID Reader device not found',
            'permission_denied': 'Permission denied to access RFID Reader',
            'timeout': 'RFID Reader communication timeout',
            'unknown': 'Unknown hardware error'
        };
        return messages[errorType] || messages['unknown'];
    }

    // === Tag Simulation ===

    async simulateTag(tagId, delay = 0) {
        if (!this.isRunning) {
            throw new Error('RFID Listener is not running');
        }

        return new Promise((resolve) => {
            setTimeout(() => {
                this._processTagInput(tagId);
                resolve();
            }, delay);
        });
    }

    async simulateMultipleTags(tags, intervalMs = 100) {
        for (const tag of tags) {
            await this.simulateTag(tag);
            if (intervalMs > 0) {
                await this._delay(intervalMs);
            }
        }
    }

    // === Auto Scan Feature ===

    enableAutoScan(intervalMs = 2000) {
        if (this.autoScanEnabled) {
            this.disableAutoScan();
        }

        this.autoScanEnabled = true;
        this.autoScanIntervalMs = intervalMs;
        this.autoScanCurrentIndex = 0;

        this.simulationInterval = setInterval(() => {
            if (!this.autoScanEnabled || !this.isRunning) {
                this.disableAutoScan();
                return;
            }

            const tags = this.mockTags || this.autoScanTags;
            if (tags.length === 0) return;

            const currentTag = tags[this.autoScanCurrentIndex];
            this._processTagInput(currentTag);

            this.autoScanCurrentIndex = (this.autoScanCurrentIndex + 1) % tags.length;
        }, this.autoScanIntervalMs);

        this._log('INFO', `Auto-Scan aktiviert (${intervalMs}ms Intervall)`);
    }

    disableAutoScan() {
        if (this.simulationInterval) {
            clearInterval(this.simulationInterval);
            this.simulationInterval = null;
        }
        this.autoScanEnabled = false;
        this._log('INFO', 'Auto-Scan deaktiviert');
    }

    setMockTags(tags) {
        this.mockTags = Array.isArray(tags) ? tags : [tags];
        this._log('INFO', `Mock-Tags gesetzt: ${this.mockTags.length} Tags`);
    }

    // === Mock Shortcuts ===

    _registerMockShortcuts() {
        if (!global.mockElectron?.globalShortcut) {
            return;
        }

        const shortcuts = [
            { key: 'F1', action: () => this.simulateTag('53004114') },
            { key: 'F2', action: () => this.simulateTag('53004115') },
            { key: 'F3', action: () => this.simulateTag('53004116') }
        ];

        shortcuts.forEach(shortcut => {
            try {
                global.mockElectron.globalShortcut.register(shortcut.key, shortcut.action);
                this.registeredShortcuts.push(shortcut.key);
            } catch (error) {
                this._log('WARN', `Shortcut-Registrierung fehlgeschlagen: ${shortcut.key}`);
            }
        });
    }

    _unregisterAllShortcuts() {
        if (!global.mockElectron?.globalShortcut) {
            return;
        }

        this.registeredShortcuts.forEach(key => {
            try {
                global.mockElectron.globalShortcut.unregister(key);
            } catch (error) {
                // Ignoriere Fehler beim Deregistrieren
            }
        });

        this.registeredShortcuts = [];
    }

    // === Utility Methods ===

    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _log(level, message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [RFID-Mock] [${level}] ${message}`;

        if (process.env.NODE_ENV !== 'test' || process.env.DEBUG_RFID_MOCK) {
            console.log(logMessage);
        }
    }
}

module.exports = MockRFIDListener;