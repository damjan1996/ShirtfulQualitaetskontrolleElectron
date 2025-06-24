// tests/mocks/rfid-listener.mock.js
/**
 * Mock RFID Listener für Tests
 * Simuliert RFID-Tag-Scanning über USB HID-Device
 */

const EventEmitter = require('events');

class MockRFIDListener extends EventEmitter {
    constructor(callback = null) {
        super();

        this.callback = callback;
        this.isListening = false;
        this.buffer = '';
        this.lastScanTime = 0;
        this.minScanInterval = 100; // Minimaler Abstand zwischen Scans in ms

        // Mock-Konfiguration
        this.config = {
            inputTimeout: 200,
            maxBufferLength: 15,
            enableLogging: false,
            enableStats: true
        };

        // Registrierte Keyboard-Shortcuts (simuliert globalShortcut)
        this.registeredShortcuts = [];

        // RFID-Tag Statistiken
        this.stats = {
            totalScans: 0,
            validScans: 0,
            invalidScans: 0,
            duplicateScans: 0,
            bufferOverflows: 0,
            startTime: new Date(),
            lastScan: null,
            scanHistory: []
        };

        // Mock RFID-Tags für Tests
        this.mockTags = [
            '53004114', // Test User 1
            '87654321', // Test User 2
            'DEADBEEF', // Inactive User
            'ABCDEF12', // Unknown User
            '12345678', // Another valid tag
            'INVALID!', // Invalid format
            '123',      // Too short
            'TOOLONGTAGID123456789' // Too long
        ];

        this.currentMockIndex = 0;
        this.autoScanEnabled = false;
        this.autoScanInterval = null;
        this.autoScanDelay = 2000; // 2 Sekunden zwischen Auto-Scans

        // Input-Buffer-Management
        this.inputTimer = null;
        this.isProcessingInput = false;

        // Duplicate-Detection
        this.duplicateDetection = {
            enabled: true,
            timeWindow: 1000, // 1 Sekunde
            recentScans: new Map()
        };

        // Performance-Tracking
        this.performance = {
            avgProcessingTime: 0,
            maxProcessingTime: 0,
            minProcessingTime: Infinity,
            totalProcessingTime: 0
        };
    }

    // ===== ÖFFENTLICHE API =====

    async start() {
        if (this.isListening) {
            this._log('RFID Listener already running');
            return true;
        }

        try {
            this._log('Starting RFID Listener...');

            // Simuliere Hardware-Initialisierung
            await this._initializeHardware();

            // Registriere Keyboard-Shortcuts für Hex-Zeichen
            this._registerKeyboardShortcuts();

            this.isListening = true;
            this.stats.startTime = new Date();

            this.emit('started');
            this._log('RFID Listener started successfully');

            return true;
        } catch (error) {
            this._log(`Failed to start RFID Listener: ${error.message}`);
            this.emit('error', error);
            return false;
        }
    }

    async stop() {
        if (!this.isListening) {
            this._log('RFID Listener not running');
            return true;
        }

        try {
            this._log('Stopping RFID Listener...');

            // Stoppe Auto-Scan
            this._stopAutoScan();

            // Unregistriere alle Shortcuts
            this._unregisterAllShortcuts();

            // Räume Buffer auf
            this._clearBuffer();

            this.isListening = false;

            this.emit('stopped');
            this._log('RFID Listener stopped successfully');

            return true;
        } catch (error) {
            this._log(`Error stopping RFID Listener: ${error.message}`);
            this.emit('error', error);
            return false;
        }
    }

    setCallback(callback) {
        this.callback = callback;
    }

    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this._log(`Configuration updated: ${JSON.stringify(newConfig)}`);
    }

    getStats() {
        const uptime = Date.now() - this.stats.startTime.getTime();
        const scanRate = this.stats.totalScans > 0 ? (this.stats.totalScans / (uptime / 1000 / 60)) : 0;

        return {
            ...this.stats,
            uptime: uptime,
            scanRate: Math.round(scanRate * 100) / 100, // Scans pro Minute
            successRate: this.stats.totalScans > 0 ?
                Math.round((this.stats.validScans / this.stats.totalScans) * 100) : 0,
            performance: { ...this.performance },
            isListening: this.isListening,
            config: { ...this.config }
        };
    }

    clearStats() {
        this.stats = {
            totalScans: 0,
            validScans: 0,
            invalidScans: 0,
            duplicateScans: 0,
            bufferOverflows: 0,
            startTime: new Date(),
            lastScan: null,
            scanHistory: []
        };

        this.performance = {
            avgProcessingTime: 0,
            maxProcessingTime: 0,
            minProcessingTime: Infinity,
            totalProcessingTime: 0
        };

        this._log('Statistics cleared');
    }

    // ===== TEST-HELPER METHODEN =====

    // Simuliert einen RFID-Tag-Scan
    simulateTag(tagId) {
        if (!this.isListening) {
            this._log('Cannot simulate tag - listener not running');
            return false;
        }

        const now = Date.now();

        // Prüfe Mindest-Scan-Intervall
        if (now - this.lastScanTime < this.minScanInterval) {
            this._log(`Scan too fast - minimum interval: ${this.minScanInterval}ms`);
            return false;
        }

        this.lastScanTime = now;

        // Simuliere Tastatureingabe für RFID-Tag
        this._simulateKeyboardInput(tagId);

        return true;
    }

    // Simuliert eine Sequenz von RFID-Tags
    simulateTagSequence(tagIds, intervalMs = 1000) {
        if (!Array.isArray(tagIds)) {
            throw new Error('tagIds must be an array');
        }

        return new Promise((resolve) => {
            let index = 0;

            const scanNext = () => {
                if (index >= tagIds.length) {
                    resolve(true);
                    return;
                }

                const success = this.simulateTag(tagIds[index]);
                if (success) {
                    index++;
                }

                setTimeout(scanNext, intervalMs);
            };

            scanNext();
        });
    }

    // Aktiviert automatisches Scannen für Tests
    enableAutoScan(intervalMs = 2000) {
        if (this.autoScanInterval) {
            this._stopAutoScan();
        }

        this.autoScanEnabled = true;
        this.autoScanDelay = intervalMs;
        this._startAutoScan();

        this._log(`Auto-scan enabled with ${intervalMs}ms interval`);
    }

    // Deaktiviert automatisches Scannen
    disableAutoScan() {
        this.autoScanEnabled = false;
        this._stopAutoScan();
        this._log('Auto-scan disabled');
    }

    // Setzt Mock-Tags für Auto-Scan
    setMockTags(tags) {
        this.mockTags = tags;
        this.currentMockIndex = 0;
        this._log(`Mock tags updated: ${tags.length} tags`);
    }

    // Fügt Mock-Tag hinzu
    addMockTag(tagId) {
        this.mockTags.push(tagId);
        this._log(`Mock tag added: ${tagId}`);
    }

    // Holt den nächsten Mock-Tag
    getNextMockTag() {
        if (this.mockTags.length === 0) {
            return '53004114'; // Default-Tag
        }

        const tag = this.mockTags[this.currentMockIndex];
        this.currentMockIndex = (this.currentMockIndex + 1) % this.mockTags.length;

        return tag;
    }

    // Simuliert Hardware-Fehler
    simulateHardwareError(errorType = 'connection_lost') {
        const errors = {
            connection_lost: new Error('RFID reader connection lost'),
            device_not_found: new Error('RFID reader device not found'),
            permission_denied: new Error('Permission denied to access RFID reader'),
            hardware_malfunction: new Error('RFID reader hardware malfunction'),
            buffer_overflow: new Error('Input buffer overflow')
        };

        const error = errors[errorType] || new Error('Unknown hardware error');
        this.emit('hardware-error', error);
        this._log(`Hardware error simulated: ${error.message}`);

        return error;
    }

    // Simuliert Buffer-Overflow
    simulateBufferOverflow() {
        this.buffer = 'X'.repeat(this.config.maxBufferLength + 5);
        this._processBufferOverflow();
    }

    // Setzt Duplicate-Detection-Einstellungen
    setDuplicateDetection(enabled, timeWindowMs = 1000) {
        this.duplicateDetection.enabled = enabled;
        this.duplicateDetection.timeWindow = timeWindowMs;
        this._log(`Duplicate detection: ${enabled ? 'enabled' : 'disabled'} (${timeWindowMs}ms window)`);
    }

    // Setzt Scan-Interval
    setMinScanInterval(intervalMs) {
        this.minScanInterval = intervalMs;
        this._log(`Minimum scan interval set to ${intervalMs}ms`);
    }

    // Holt aktuelle Buffer-Inhalte
    getCurrentBuffer() {
        return this.buffer;
    }

    // Räumt Buffer manuell auf
    clearBuffer() {
        this._clearBuffer();
    }

    // Prüft ob Tag bereits kürzlich gescannt wurde
    isDuplicateScan(tagId) {
        if (!this.duplicateDetection.enabled) {
            return false;
        }

        const now = Date.now();
        const lastScanTime = this.duplicateDetection.recentScans.get(tagId);

        if (lastScanTime && (now - lastScanTime) < this.duplicateDetection.timeWindow) {
            return true;
        }

        return false;
    }

    // ===== PRIVATE METHODEN =====

    async _initializeHardware() {
        // Simuliere Hardware-Initialisierung mit Delay
        await new Promise(resolve => setTimeout(resolve, 100));

        // Simuliere mögliche Hardware-Fehler
        if (Math.random() < 0.01) { // 1% Chance auf Fehler
            throw new Error('Hardware initialization failed');
        }

        this._log('Hardware initialized successfully');
    }

    _registerKeyboardShortcuts() {
        // Registriere Shortcuts für Hex-Zeichen (0-9, A-F)
        const hexChars = '0123456789ABCDEF'.split('');

        for (const char of hexChars) {
            this.registeredShortcuts.push(char);
        }

        // Registriere Enter-Taste
        this.registeredShortcuts.push('Enter');

        this._log(`Registered ${this.registeredShortcuts.length} keyboard shortcuts`);
    }

    _unregisterAllShortcuts() {
        this.registeredShortcuts = [];
        this._log('All keyboard shortcuts unregistered');
    }

    _simulateKeyboardInput(tagId) {
        if (!tagId || typeof tagId !== 'string') {
            this._log('Invalid tag ID provided for simulation');
            return;
        }

        // Simuliere Zeichen-für-Zeichen-Eingabe
        for (const char of tagId) {
            this._handleKeyPress(char);
        }

        // Simuliere Enter-Taste am Ende
        setTimeout(() => {
            this._handleKeyPress('Enter');
        }, 10);
    }

    _handleKeyPress(key) {
        if (!this.isListening) {
            return;
        }

        const startTime = Date.now();

        try {
            if (key === 'Enter') {
                this._processBuffer();
            } else if (this._isValidHexChar(key)) {
                this._addToBuffer(key);
            } else {
                this._log(`Invalid key pressed: ${key}`);
            }
        } catch (error) {
            this._log(`Error handling key press: ${error.message}`);
            this.emit('error', error);
        } finally {
            const processingTime = Date.now() - startTime;
            this._updatePerformanceStats(processingTime);
        }
    }

    _addToBuffer(char) {
        if (this.buffer.length >= this.config.maxBufferLength) {
            this._processBufferOverflow();
            return;
        }

        this.buffer += char;

        // Reset Input-Timer
        if (this.inputTimer) {
            clearTimeout(this.inputTimer);
        }

        this.inputTimer = setTimeout(() => {
            this._processBuffer();
        }, this.config.inputTimeout);
    }

    _processBuffer() {
        if (this.inputTimer) {
            clearTimeout(this.inputTimer);
            this.inputTimer = null;
        }

        if (this.isProcessingInput) {
            return;
        }

        this.isProcessingInput = true;

        try {
            const tagId = this.buffer.trim();
            this._clearBuffer();

            if (!tagId) {
                this._log('Empty buffer - ignoring');
                return;
            }

            this._processScanResult(tagId);
        } catch (error) {
            this._log(`Error processing buffer: ${error.message}`);
            this.emit('error', error);
        } finally {
            this.isProcessingInput = false;
        }
    }

    _processScanResult(tagId) {
        const scanTime = new Date();

        this.stats.totalScans++;
        this.stats.lastScan = scanTime;

        // Validierung
        const validation = this._validateTag(tagId);

        if (!validation.isValid) {
            this.stats.invalidScans++;
            this._log(`Invalid tag scanned: ${tagId} (${validation.reason})`);
            this.emit('invalid-scan', { tagId, reason: validation.reason, timestamp: scanTime });
            return;
        }

        // Duplicate-Check
        if (this.isDuplicateScan(tagId)) {
            this.stats.duplicateScans++;
            this._log(`Duplicate scan detected: ${tagId}`);
            this.emit('duplicate-scan', { tagId, timestamp: scanTime });
            return;
        }

        // Successful scan
        this.stats.validScans++;
        this.duplicateDetection.recentScans.set(tagId, Date.now());

        // Scan-Historie aktualisieren
        this.stats.scanHistory.push({
            tagId: tagId,
            timestamp: scanTime,
            valid: true
        });

        // Behalte nur die letzten 100 Scans in der Historie
        if (this.stats.scanHistory.length > 100) {
            this.stats.scanHistory.shift();
        }

        this._log(`Valid tag scanned: ${tagId}`);

        // Event emittieren
        this.emit('tag-scanned', { tagId, timestamp: scanTime });

        // Callback aufrufen
        if (this.callback && typeof this.callback === 'function') {
            try {
                this.callback(tagId);
            } catch (error) {
                this._log(`Error in callback: ${error.message}`);
                this.emit('callback-error', error);
            }
        }
    }

    _processBufferOverflow() {
        this.stats.bufferOverflows++;
        this._log(`Buffer overflow - clearing buffer (length: ${this.buffer.length})`);
        this._clearBuffer();
        this.emit('buffer-overflow');
    }

    _validateTag(tagId) {
        if (!tagId || typeof tagId !== 'string') {
            return { isValid: false, reason: 'Empty or invalid tag' };
        }

        if (tagId.length < 3) {
            return { isValid: false, reason: 'Tag too short' };
        }

        if (tagId.length > 15) {
            return { isValid: false, reason: 'Tag too long' };
        }

        if (!/^[0-9A-Fa-f]+$/.test(tagId)) {
            return { isValid: false, reason: 'Invalid hex characters' };
        }

        return { isValid: true };
    }

    _isValidHexChar(char) {
        return /^[0-9A-Fa-f]$/.test(char);
    }

    _clearBuffer() {
        this.buffer = '';
        if (this.inputTimer) {
            clearTimeout(this.inputTimer);
            this.inputTimer = null;
        }
    }

    _startAutoScan() {
        if (this.autoScanInterval) {
            return;
        }

        this.autoScanInterval = setInterval(() => {
            if (this.isListening && this.autoScanEnabled) {
                const nextTag = this.getNextMockTag();
                this.simulateTag(nextTag);
            }
        }, this.autoScanDelay);
    }

    _stopAutoScan() {
        if (this.autoScanInterval) {
            clearInterval(this.autoScanInterval);
            this.autoScanInterval = null;
        }
    }

    _updatePerformanceStats(processingTime) {
        this.performance.totalProcessingTime += processingTime;
        this.performance.maxProcessingTime = Math.max(this.performance.maxProcessingTime, processingTime);
        this.performance.minProcessingTime = Math.min(this.performance.minProcessingTime, processingTime);
        this.performance.avgProcessingTime = this.performance.totalProcessingTime / this.stats.totalScans;
    }

    _log(message) {
        if (this.config.enableLogging) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] RFID: ${message}`);
        }
    }

    // ===== CLEANUP =====

    destroy() {
        this.stop();
        this.clearStats();
        this.removeAllListeners();
        this._log('RFID Listener destroyed');
    }
}

// Factory-Funktion für verschiedene RFID-Reader-Modi
class MockRFIDListenerFactory {
    static createUSBHIDListener(callback, options = {}) {
        const listener = new MockRFIDListener(callback);
        listener.setConfig({
            inputTimeout: 200,
            maxBufferLength: 15,
            enableLogging: options.enableLogging || false,
            ...options
        });
        return listener;
    }

    static createSerialListener(callback, options = {}) {
        const listener = new MockRFIDListener(callback);
        listener.setConfig({
            inputTimeout: 500,
            maxBufferLength: 20,
            enableLogging: options.enableLogging || false,
            ...options
        });

        // Simuliere längere Scan-Zeiten für Serial-Reader
        listener.setMinScanInterval(300);
        return listener;
    }

    static createNetworkListener(callback, options = {}) {
        const listener = new MockRFIDListener(callback);
        listener.setConfig({
            inputTimeout: 1000,
            maxBufferLength: 25,
            enableLogging: options.enableLogging || false,
            ...options
        });

        // Simuliere Netzwerk-Latenz
        listener.setMinScanInterval(500);
        return listener;
    }
}

module.exports = MockRFIDListener;
module.exports.MockRFIDListenerFactory = MockRFIDListenerFactory;