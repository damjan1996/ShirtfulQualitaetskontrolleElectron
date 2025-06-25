// tests/mocks/rfid-listener.mock.js
/**
 * Mock RFID Listener für Tests
 * Simuliert Hardware-RFID-Reader ohne echte Hardware-Abhängigkeiten
 * Vollständig korrigiert mit allen erforderlichen Methoden
 */

const { EventEmitter } = require('events');

class MockRFIDListener extends EventEmitter {
    constructor() {
        super();

        this.isRunning = false;
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
            hardwareErrorRate: 0.001, // Reduziert auf 0.1% für stabilere Tests
            debugMode: false
        };

        // Test-Hilfsfunktionen
        this.testMode = true;
        this.simulationQueue = [];
        this.simulationInterval = null;
        this.autoScanEnabled = false;
        this.autoScanTags = ['53004114', '12345678', 'ABCDEF12'];
        this.autoScanInterval = null;
        this.inputBuffer = '';
        this.processingCallbacks = [];

        // Performance-optimierte Einstellungen
        this._fastMode = false;
        this._silentMode = false;
    }

    /**
     * RFID Listener starten
     */
    async start() {
        if (this.isRunning) {
            this._log('RFID Listener läuft bereits');
            return;
        }

        try {
            this._log('Starte RFID Listener (Mock-Modus)...');

            // Hardware initialisieren (simuliert)
            await this._initializeHardware();

            // Shortcuts registrieren (für Electron-Integration)
            this._registerShortcuts();

            this.isRunning = true;
            this.stats.startTime = Date.now();

            this._log('RFID Listener erfolgreich gestartet');
            this.emit('started');

        } catch (error) {
            this.stats.errors++;
            this._log(`Fehler beim Starten: ${error.message}`, 'error');
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * RFID Listener stoppen
     */
    async stop() {
        if (!this.isRunning) {
            this._log('RFID Listener läuft nicht');
            return;
        }

        try {
            this._log('Stoppe RFID Listener...');

            // Auto-Scan deaktivieren
            this.disableAutoScan();

            // Shortcuts abmelden
            this._unregisterShortcuts();

            // Buffer leeren
            this._clearBuffer();

            // Hardware beenden
            await this._shutdownHardware();

            this.isRunning = false;
            this.isHardwareReady = false;

            this._log('RFID Listener gestoppt');
            this.emit('stopped');

        } catch (error) {
            this.stats.errors++;
            this._log(`Fehler beim Stoppen: ${error.message}`, 'error');
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Tag-Scan simulieren (für Tests)
     */
    simulateTag(tagId) {
        if (!this.isRunning) {
            this._log('Listener nicht gestartet - Scan ignoriert', 'warn');
            return;
        }

        this._log(`Simuliere RFID-Tag: ${tagId}`);

        // Simuliere Tastatureingabe
        for (const char of tagId) {
            this.handleInput(char);
        }

        // Simuliere Enter-Taste
        this.handleInput('\r');
    }

    /**
     * Eingabe-Handler für Tastatur-Input
     */
    handleInput(char) {
        if (!this.isRunning) {
            return;
        }

        // Enter-Taste erkennen (verarbeite aktuellen Buffer)
        if (char === '\r' || char === '\n') {
            this._processBuffer();
            return;
        }

        // Zeichen zum Buffer hinzufügen
        this.currentBuffer += char;

        // Buffer-Timeout zurücksetzen
        this._resetBufferTimeout();
    }

    /**
     * Tag verarbeiten (für Performance-Tests)
     */
    processTag() {
        if (this.currentBuffer.length > 0) {
            this._processBuffer();
        }
    }

    /**
     * Auto-Scan aktivieren (für Tests)
     */
    enableAutoScan(intervalMs = 1000, customTags = null) {
        if (this.autoScanEnabled) {
            return;
        }

        if (customTags) {
            this.autoScanTags = [...customTags];
        }

        this.autoScanEnabled = true;
        let tagIndex = 0;

        this.autoScanInterval = setInterval(() => {
            if (!this.autoScanEnabled) {
                return;
            }

            const tag = this.autoScanTags[tagIndex % this.autoScanTags.length];
            this.simulateTag(tag);
            tagIndex++;
        }, intervalMs);

        this._log(`Auto-Scan aktiviert mit ${this.autoScanTags.length} Tags`);
    }

    /**
     * Auto-Scan deaktivieren
     */
    disableAutoScan() {
        if (!this.autoScanEnabled) {
            return;
        }

        this.autoScanEnabled = false;

        if (this.autoScanInterval) {
            clearInterval(this.autoScanInterval);
            this.autoScanInterval = null;
        }

        this._log('Auto-Scan deaktiviert');
    }

    /**
     * Konfiguration aktualisieren
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this._log('Konfiguration aktualisiert');
    }

    /**
     * Statistiken abrufen
     */
    getStats() {
        const uptime = this.stats.startTime ? Date.now() - this.stats.startTime : 0;
        const successRate = this.stats.totalScans > 0 ?
            (this.stats.validScans / this.stats.totalScans) * 100 : 0;

        return {
            ...this.stats,
            uptime,
            successRate,
            performance: {
                ...this.stats.performance,
                avgProcessingTime: this.stats.performance.processingTimes.length > 0 ?
                    this.stats.performance.processingTimes.reduce((a, b) => a + b, 0) /
                    this.stats.performance.processingTimes.length : 0
            }
        };
    }

    /**
     * Status-Informationen abrufen
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            isHardwareReady: this.isHardwareReady,
            autoScanEnabled: this.autoScanEnabled,
            bufferLength: this.currentBuffer.length,
            stats: this.getStats(),
            config: { ...this.config }
        };
    }

    /**
     * Statistiken zurücksetzen
     */
    resetStats() {
        this.stats = {
            totalScans: 0,
            validScans: 0,
            invalidScans: 0,
            errors: 0,
            startTime: this.stats.startTime, // Start-Zeit beibehalten
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
        this._log('Statistiken zurückgesetzt');
    }

    /**
     * Hardware-Fehler simulieren
     */
    enableHardwareError() {
        this.config.simulateHardwareErrors = true;
        this._log('Hardware-Fehler-Simulation aktiviert');
    }

    disableHardwareError() {
        this.config.simulateHardwareErrors = false;
        this._log('Hardware-Fehler-Simulation deaktiviert');
    }

    /**
     * Performance-Optimierungen
     */
    enableFastMode() {
        this._fastMode = true;
        this._log('Fast Mode aktiviert');
    }

    disableFastMode() {
        this._fastMode = false;
        this._log('Fast Mode deaktiviert');
    }

    enableSilentMode() {
        this._silentMode = true;
        this.config.debugMode = false;
    }

    disableSilentMode() {
        this._silentMode = false;
    }

    // ===== PRIVATE METHODEN =====

    async _initializeHardware() {
        // Simuliere Hardware-Initialisierung
        await this._delay(this._fastMode ? 5 : 50);

        // Simuliere seltene Hardware-Fehler (nur bei aktivierter Simulation)
        if (this.config.simulateHardwareErrors && Math.random() < this.config.hardwareErrorRate) {
            throw new Error('Hardware initialization failed');
        }

        this.isHardwareReady = true;
        this._log('Hardware initialized successfully');
    }

    async _shutdownHardware() {
        // Simuliere Hardware-Shutdown
        await this._delay(this._fastMode ? 2 : 20);
        this.isHardwareReady = false;
        this._log('Hardware shutdown complete');
    }

    _registerShortcuts() {
        // Mock für Electron-Shortcuts
        this.registeredShortcuts = [
            'CmdOrCtrl+R', // Test-Tag scannen
            'CmdOrCtrl+T'  // Auto-Scan toggle
        ];
        this._log(`${this.registeredShortcuts.length} Shortcuts registriert`);
    }

    _unregisterShortcuts() {
        this.registeredShortcuts = [];
        this._log('Shortcuts abgemeldet');
    }

    _processBuffer() {
        const startTime = Date.now();

        if (this.currentBuffer.length === 0) {
            return;
        }

        const tagId = this.currentBuffer.trim();
        this._log(`Verarbeite Tag: ${tagId}`);

        // Statistiken aktualisieren
        this.stats.totalScans++;
        this.stats.lastScanTime = Date.now();

        // Tag validieren
        const validationResult = this._validateTag(tagId);

        if (validationResult.isValid) {
            this.stats.validScans++;
            this._log(`Gültiger RFID-Tag gescannt: ${tagId}`);
            this._updatePerformanceStats(Date.now() - startTime);
            this.emit('tag-scanned', tagId);
        } else {
            this.stats.invalidScans++;
            this._log(`Ungültiger RFID-Tag: ${tagId} - ${validationResult.reason}`, 'warn');
            this.emit('invalid-scan', {
                tagId: tagId,
                reason: validationResult.reason
            });
        }

        // Buffer leeren
        this._clearBuffer();
    }

    _validateTag(tagId) {
        // Länge prüfen
        if (tagId.length < this.config.minTagLength) {
            return {
                isValid: false,
                reason: `Tag too short (min: ${this.config.minTagLength})`
            };
        }

        if (tagId.length > this.config.maxTagLength) {
            return {
                isValid: false,
                reason: `Tag too long (max: ${this.config.maxTagLength})`
            };
        }

        // Zeichen prüfen
        if (!this.config.allowedCharacters.test(tagId)) {
            return {
                isValid: false,
                reason: 'Invalid hex characters'
            };
        }

        return {
            isValid: true,
            reason: null
        };
    }

    _updatePerformanceStats(processingTime) {
        this.stats.performance.processingTimes.push(processingTime);

        // Behalte nur die letzten 100 Messungen
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

    _resetBufferTimeout() {
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
        }

        this.bufferTimeout = setTimeout(() => {
            if (this.currentBuffer.length > 0) {
                this._log('Buffer-Timeout erreicht, verarbeite unvollständigen Input', 'warn');
                this._processBuffer();
            }
        }, this.bufferTimeoutMs);
    }

    _clearBuffer() {
        this.currentBuffer = '';

        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
            this.bufferTimeout = null;
        }
    }

    async _delay(ms) {
        if (this._fastMode) {
            // Im Fast Mode sehr kurze oder keine Delays
            return Promise.resolve();
        }
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _log(message, level = 'info') {
        if (this._silentMode) {
            return; // Kein Logging im Silent Mode
        }

        if (!this.config.debugMode && level === 'debug') {
            return;
        }

        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [RFID-Mock] [${level.toUpperCase()}]`;

        switch (level) {
            case 'error':
                console.error(`${prefix} ${message}`);
                break;
            case 'warn':
                console.warn(`${prefix} ${message}`);
                break;
            case 'debug':
                console.debug(`${prefix} ${message}`);
                break;
            default:
                console.log(`${prefix} ${message}`);
        }
    }

    // ===== ERWEITERTE TEST-HILFSMETHODEN =====

    /**
     * Simuliere mehrere Tags in schneller Folge
     */
    simulateRapidTags(tagCount, baseTagId = '50000000') {
        for (let i = 0; i < tagCount; i++) {
            const tagId = (parseInt(baseTagId, 16) + i).toString(16).toUpperCase().padStart(8, '0');
            this.simulateTag(tagId);
        }
    }

    /**
     * Simuliere ungültige Tags
     */
    simulateInvalidTag(invalidTag = 'INVALID!') {
        this.simulateTag(invalidTag);
    }

    /**
     * Teste Buffer-Verhalten
     */
    testBufferBehavior(input) {
        for (const char of input) {
            this.handleInput(char);
        }
    }

    /**
     * Setze Mock-Daten für Tests
     */
    setMockStats(stats) {
        this.stats = { ...this.stats, ...stats };
    }

    /**
     * Simuliere Hardware-Probleme
     */
    simulateHardwareProblem() {
        this.isHardwareReady = false;
        this.emit('hardware-error', new Error('Simulated hardware problem'));
    }

    /**
     * Repariere Hardware-Probleme
     */
    repairHardware() {
        this.isHardwareReady = true;
        this.emit('hardware-recovered');
    }

    /**
     * Batch-Verarbeitung für Performance-Tests
     */
    async processBatch(tags, delayMs = 0) {
        for (let i = 0; i < tags.length; i++) {
            this.simulateTag(tags[i]);

            if (delayMs > 0 && i < tags.length - 1) {
                await this._delay(delayMs);
            }
        }
    }

    /**
     * Stress-Test-Methoden
     */
    runStressTest(duration = 5000, tagsPerSecond = 10) {
        const interval = 1000 / tagsPerSecond;
        let counter = 0;

        const stressInterval = setInterval(() => {
            const tagId = (70000000 + counter++).toString(16).toUpperCase().padStart(8, '0');
            this.simulateTag(tagId);
        }, interval);

        setTimeout(() => {
            clearInterval(stressInterval);
            this.emit('stress-test-complete', {
                duration,
                totalTags: counter,
                tagsPerSecond: counter / (duration / 1000)
            });
        }, duration);

        return { interval: stressInterval, expectedTags: Math.floor(duration / interval) };
    }

    /**
     * Cleanup für Tests
     */
    cleanup() {
        // Alle Timeouts und Intervals bereinigen
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
            this.bufferTimeout = null;
        }

        if (this.autoScanInterval) {
            clearInterval(this.autoScanInterval);
            this.autoScanInterval = null;
        }

        if (this.simulationInterval) {
            clearInterval(this.simulationInterval);
            this.simulationInterval = null;
        }

        // Buffer und Queues leeren
        this.currentBuffer = '';
        this.simulationQueue = [];
        this.processingCallbacks = [];

        // Event-Listener bereinigen
        this.removeAllListeners();

        this._log('Cleanup abgeschlossen');
    }

    /**
     * Deep-Kopie der Statistiken für Tests
     */
    getStatsCopy() {
        return JSON.parse(JSON.stringify(this.getStats()));
    }

    /**
     * Performance-Metriken für Tests
     */
    getPerformanceMetrics() {
        const stats = this.getStats();
        return {
            totalProcessingTime: stats.performance.processingTimes.reduce((a, b) => a + b, 0),
            averageProcessingTime: stats.performance.avgProcessingTime,
            maxProcessingTime: stats.performance.maxProcessingTime,
            minProcessingTime: stats.performance.minProcessingTime === Infinity ? 0 : stats.performance.minProcessingTime,
            throughput: stats.totalScans / (stats.uptime / 1000), // Tags pro Sekunde
            errorRate: stats.totalScans > 0 ? (stats.invalidScans / stats.totalScans) * 100 : 0,
            successRate: stats.successRate
        };
    }
}

module.exports = MockRFIDListener;