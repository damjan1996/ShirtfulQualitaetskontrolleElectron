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
        this.autoScanIntervalMs = 2000;
        this.mockTags = null;
        this.hardwareErrorEnabled = false;

        // Error handling
        this.setMaxListeners(20);

        // Bind methods to avoid context issues
        this.simulateTag = this.simulateTag.bind(this);
        this.simulateHardwareError = this.simulateHardwareError.bind(this);
    }

    // Hardware Simulation Control
    enableHardwareError() {
        this.hardwareErrorEnabled = true;
    }

    disableHardwareError() {
        this.hardwareErrorEnabled = false;
    }

    // Lifecycle Methods
    async start() {
        if (this.isRunning) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            try {
                // Simuliere Hardware-Initialisierung
                if (this.hardwareErrorEnabled) {
                    const error = new Error('Hardware initialization failed');
                    this._log('ERROR', 'Fehler beim Starten: Hardware initialization failed');
                    reject(error);
                    return;
                }

                this.isRunning = true;
                this.isListening = true;
                this.isHardwareReady = true;
                this.stats.startTime = new Date().toISOString();

                // Setup global shortcuts if electron mock exists
                this._setupShortcuts();

                this._log('INFO', 'RFID Listener gestartet (Mock-Modus)');
                resolve();

            } catch (error) {
                this._log('ERROR', `Start-Fehler: ${error.message}`);
                reject(error);
            }
        });
    }

    async stop() {
        if (!this.isRunning) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.isRunning = false;
            this.isListening = false;
            this.disableAutoScan();
            this._clearShortcuts();

            this._log('INFO', 'RFID Listener gestoppt');
            resolve();
        });
    }

    async destroy() {
        await this.stop();

        // Reset statistics
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

        this.autoScanEnabled = false;
        this.removeAllListeners();
    }

    // Configuration
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        this._log('INFO', 'Konfiguration aktualisiert');
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            isListening: this.isListening,
            isHardwareReady: this.isHardwareReady,
            stats: { ...this.stats }
        };
    }

    // Tag Simulation
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

        if (!this.config.debugMode) {
            // Only log in non-debug mode for cleaner test output
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

    // Auto Scan Feature
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
        this.mockTags = Array.isArray(tags) ? [...tags] : null;
        this._log('INFO', `Mock-Tags gesetzt: ${tags?.length || 0} Tags`);
    }

    // Hardware Error Simulation - FIXED
    simulateHardwareError(errorType = 'connection_lost') {
        const errorMessages = {
            'connection_lost': 'RFID reader connection lost',
            'device_not_found': 'RFID device not found',
            'permission_denied': 'Permission denied to access RFID device',
            'timeout': 'RFID operation timeout',
            'invalid_response': 'Invalid response from RFID device'
        };

        const message = errorMessages[errorType] || errorMessages['connection_lost'];
        const error = new Error(message);
        error.type = errorType;

        this.stats.errors++;

        // Emit error event instead of throwing
        process.nextTick(() => {
            this.emit('error', error);
        });

        return error; // Return error for test verification
    }

    // Shortcut Management
    _setupShortcuts() {
        if (!global.mockElectron?.globalShortcut) {
            return;
        }

        // Test shortcuts
        const shortcuts = ['F1', 'F2', 'F3'];
        shortcuts.forEach(shortcut => {
            const success = global.mockElectron.globalShortcut.register(shortcut, () => {
                this._processTagInput(`SHORTCUT_${shortcut}_${Date.now()}`);
            });

            if (success) {
                this.registeredShortcuts.push(shortcut);
            }
        });
    }

    _clearShortcuts() {
        if (!global.mockElectron?.globalShortcut) {
            return;
        }

        this.registeredShortcuts.forEach(shortcut => {
            global.mockElectron.globalShortcut.unregister(shortcut);
        });
        this.registeredShortcuts = [];
    }

    // Logging
    _log(level, message) {
        if (!this.config.debugMode && level === 'INFO') {
            return; // Skip info logs in non-debug mode for cleaner test output
        }

        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] [RFID-Mock] [${level}] ${message}`);
    }

    // Statistics and Monitoring
    getStatistics() {
        const uptime = this.stats.startTime ?
            Date.now() - new Date(this.stats.startTime).getTime() : 0;

        return {
            ...this.stats,
            uptime: Math.round(uptime / 1000), // seconds
            isRunning: this.isRunning,
            autoScanEnabled: this.autoScanEnabled
        };
    }

    resetStatistics() {
        const wasRunning = this.isRunning;
        const startTime = wasRunning ? new Date().toISOString() : null;

        this.stats = {
            totalScans: 0,
            validScans: 0,
            invalidScans: 0,
            errors: 0,
            startTime,
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
}

module.exports = MockRFIDListener;