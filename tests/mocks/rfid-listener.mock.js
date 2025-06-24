const { EventEmitter } = require('events');

/**
 * Mock RFID Listener für Tests
 * Simuliert Hardware-RFID-Reader ohne echte Hardware-Abhängigkeiten
 */
class MockRFIDListener extends EventEmitter {
    constructor() {
        super();

        this.isRunning = false;
        this.isHardwareReady = false;
        this.currentBuffer = '';
        this.registeredShortcuts = [];
        this.bufferTimeout = null;
        this.bufferTimeoutMs = 500;

        // Statistiken
        this.stats = {
            totalScans: 0,
            validScans: 0,
            invalidScans: 0,
            errors: 0,
            startTime: null,
            lastScanTime: null
        };

        // Konfiguration
        this.config = {
            minTagLength: 6,
            maxTagLength: 20,
            allowedCharacters: /^[0-9A-Fa-f]+$/,
            simulateHardwareErrors: false,
            hardwareErrorRate: 0.01, // 1% bei aktivierter Simulation
            debugMode: false
        };

        // Test-Hilfsfunktionen
        this.testMode = true;
        this.simulationQueue = [];
        this.simulationInterval = null;
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
            this.stats.startTime = new Date();

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

            // Shortcuts entfernen
            this._unregisterShortcuts();

            // Buffer leeren
            this._clearBuffer();

            // Simulation stoppen
            this._stopSimulation();

            this.isRunning = false;
            this.isHardwareReady = false;

            this._log('RFID Listener gestoppt');
            this.emit('stopped');

        } catch (error) {
            this.stats.errors++;
            this._log(`Fehler beim Stoppen: ${error.message}`, 'error');
            this.emit('error', error);
        }
    }

    /**
     * Hardware initialisieren (simuliert)
     * @private
     */
    async _initializeHardware() {
        // Simuliere Hardware-Initialisierung
        await new Promise(resolve => setTimeout(resolve, 100));

        // Simuliere mögliche Hardware-Fehler nur wenn explizit aktiviert
        if (this.config.simulateHardwareErrors && Math.random() < this.config.hardwareErrorRate) {
            throw new Error('Hardware initialization failed');
        }

        this.isHardwareReady = true;
        this._log('Hardware initialized successfully');
    }

    /**
     * Shortcuts für Electron registrieren
     * @private
     */
    _registerShortcuts() {
        // Prüfe ob globaler Electron-Mock verfügbar ist
        if (!global.mockElectron || !global.mockElectron.globalShortcut) {
            this._log('Electron Mock nicht verfügbar - überspringe Shortcut-Registrierung', 'warn');
            return;
        }

        const { globalShortcut } = global.mockElectron;

        // Registriere Shortcuts für alle möglichen Zeichen (0-9, A-F)
        const characters = '0123456789ABCDEFabcdef';

        for (const char of characters) {
            try {
                const success = globalShortcut.register(char, () => {
                    this._handleKeyInput(char);
                });

                if (success) {
                    this.registeredShortcuts.push(char);
                }
            } catch (error) {
                this._log(`Fehler beim Registrieren von Shortcut '${char}': ${error.message}`, 'warn');
            }
        }

        // Enter-Taste für Tag-Abschluss
        try {
            const success = globalShortcut.register('Enter', () => {
                this._handleKeyInput('Enter');
            });

            if (success) {
                this.registeredShortcuts.push('Enter');
            }
        } catch (error) {
            this._log(`Fehler beim Registrieren von Enter: ${error.message}`, 'warn');
        }

        this._log(`${this.registeredShortcuts.length} Shortcuts registriert`);
    }

    /**
     * Shortcuts entfernen
     * @private
     */
    _unregisterShortcuts() {
        if (!global.mockElectron || !global.mockElectron.globalShortcut) {
            return;
        }

        const { globalShortcut } = global.mockElectron;

        for (const shortcut of this.registeredShortcuts) {
            try {
                globalShortcut.unregister(shortcut);
            } catch (error) {
                this._log(`Fehler beim Entfernen von Shortcut '${shortcut}': ${error.message}`, 'warn');
            }
        }

        this.registeredShortcuts = [];
        this._log('Alle Shortcuts entfernt');
    }

    /**
     * Tastatureingabe verarbeiten
     * @private
     */
    _handleKeyInput(key) {
        if (!this.isRunning || !this.isHardwareReady) {
            return;
        }

        if (key === 'Enter') {
            this._processBuffer();
        } else {
            this._addToBuffer(key);
        }
    }

    /**
     * Zeichen zum Buffer hinzufügen
     * @private
     */
    _addToBuffer(char) {
        this.currentBuffer += char;

        // Timeout für automatische Buffer-Verarbeitung
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
        }

        this.bufferTimeout = setTimeout(() => {
            if (this.currentBuffer.length > 0) {
                this._log(`Buffer-Timeout erreicht: "${this.currentBuffer}"`, 'warn');
                this._clearBuffer();
            }
        }, this.bufferTimeoutMs);
    }

    /**
     * Buffer verarbeiten und Tag-Event auslösen
     * @private
     */
    _processBuffer() {
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
            this.bufferTimeout = null;
        }

        const tag = this.currentBuffer.trim();
        this.currentBuffer = '';

        if (tag.length === 0) {
            return;
        }

        this.stats.totalScans++;
        this.stats.lastScanTime = new Date();

        // Tag validieren
        if (this._validateTag(tag)) {
            this.stats.validScans++;
            this._log(`Gültiger RFID-Tag gescannt: ${tag}`);
            this.emit('tag-scanned', tag);
        } else {
            this.stats.invalidScans++;
            this._log(`Ungültiger RFID-Tag: ${tag}`, 'warn');
            this.emit('invalid-scan', tag);
        }
    }

    /**
     * Tag validieren
     * @private
     */
    _validateTag(tag) {
        if (typeof tag !== 'string') {
            return false;
        }

        if (tag.length < this.config.minTagLength || tag.length > this.config.maxTagLength) {
            return false;
        }

        return this.config.allowedCharacters.test(tag);
    }

    /**
     * Buffer leeren
     * @private
     */
    _clearBuffer() {
        if (this.bufferTimeout) {
            clearTimeout(this.bufferTimeout);
            this.bufferTimeout = null;
        }

        this.currentBuffer = '';
    }

    /**
     * Einzelnen Tag simulieren (für Tests)
     */
    simulateTag(tagId) {
        if (!this.isRunning) {
            throw new Error('RFID Listener ist nicht gestartet');
        }

        if (typeof tagId !== 'string') {
            throw new Error('Tag ID muss ein String sein');
        }

        this._log(`Simuliere RFID-Tag: ${tagId}`);

        // Simuliere Tastatureingaben
        for (const char of tagId) {
            this._handleKeyInput(char);
        }
        this._handleKeyInput('Enter');
    }

    /**
     * Tag-Sequenz simulieren
     */
    simulateTagSequence(tagIds, intervalMs = 1000) {
        if (!Array.isArray(tagIds)) {
            throw new Error('tagIds must be an array');
        }

        if (!this.isRunning) {
            throw new Error('RFID Listener ist nicht gestartet');
        }

        return new Promise((resolve) => {
            let index = 0;

            const processNext = () => {
                if (index >= tagIds.length) {
                    resolve();
                    return;
                }

                const tagId = tagIds[index];
                index++;

                try {
                    this.simulateTag(tagId);
                } catch (error) {
                    this._log(`Fehler bei Tag-Simulation: ${error.message}`, 'error');
                    this.emit('error', error);
                }

                if (index < tagIds.length) {
                    setTimeout(processNext, intervalMs);
                } else {
                    resolve();
                }
            };

            processNext();
        });
    }

    /**
     * Kontinuierliche Simulation starten
     */
    startSimulation(tagIds, intervalMs = 2000) {
        if (!Array.isArray(tagIds) || tagIds.length === 0) {
            throw new Error('tagIds muss ein nicht-leeres Array sein');
        }

        this._stopSimulation();

        let index = 0;
        this.simulationInterval = setInterval(() => {
            if (this.isRunning) {
                try {
                    this.simulateTag(tagIds[index]);
                    index = (index + 1) % tagIds.length;
                } catch (error) {
                    this._log(`Simulation-Fehler: ${error.message}`, 'error');
                }
            }
        }, intervalMs);

        this._log(`Kontinuierliche Simulation gestartet mit ${tagIds.length} Tags`);
    }

    /**
     * Simulation stoppen
     * @private
     */
    _stopSimulation() {
        if (this.simulationInterval) {
            clearInterval(this.simulationInterval);
            this.simulationInterval = null;
            this._log('Simulation gestoppt');
        }
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
            startTime: this.stats.startTime,
            lastScanTime: null
        };

        this._log('Statistiken zurückgesetzt');
    }

    /**
     * Status-Informationen abrufen
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            isHardwareReady: this.isHardwareReady,
            bufferLength: this.currentBuffer.length,
            shortcutsRegistered: this.registeredShortcuts.length,
            stats: { ...this.stats },
            config: { ...this.config }
        };
    }

    /**
     * Konfiguration aktualisieren
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this._log('Konfiguration aktualisiert');
    }

    /**
     * Test-Hilfsfunktionen
     */

    // Hardware-Fehler für nächsten Start aktivieren
    enableHardwareError() {
        this.config.simulateHardwareErrors = true;
        this.config.hardwareErrorRate = 1.0; // 100% Fehlerrate
    }

    // Hardware-Fehler deaktivieren
    disableHardwareError() {
        this.config.simulateHardwareErrors = false;
        this.config.hardwareErrorRate = 0.01;
    }

    // Debug-Modus umschalten
    toggleDebugMode() {
        this.config.debugMode = !this.config.debugMode;
        this._log(`Debug-Modus: ${this.config.debugMode ? 'AN' : 'AUS'}`);
    }

    /**
     * Logging-Funktion
     * @private
     */
    _log(message, level = 'info') {
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
}

// Event-Handler für unbehandelte Errors
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection bei RFID-Mock:', reason);
});

module.exports = MockRFIDListener;