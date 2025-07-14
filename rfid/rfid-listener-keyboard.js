const { globalShortcut } = require('electron');
const EventEmitter = require('events');

class RFIDListenerKeyboard extends EventEmitter {
    constructor(callback = null) {
        super();

        this.callback = callback;
        this.isListening = false;
        this.buffer = '';
        this.lastInputTime = 0;
        this.lastScanTime = 0;

        // Konfiguration aus Umgebungsvariablen
        this.inputTimeout = parseFloat(process.env.RFID_INPUT_TIMEOUT) || 500; // ms
        this.minScanInterval = parseFloat(process.env.RFID_MIN_SCAN_INTERVAL) || 1000; // ms
        this.maxBufferLength = parseInt(process.env.RFID_MAX_BUFFER_LENGTH) || 15;

        // Registrierte Shortcuts verfolgen
        this.registeredShortcuts = [];

        // Statistiken
        this.stats = {
            totalScans: 0,
            validScans: 0,
            invalidScans: 0,
            duplicateScans: 0,
            startTime: new Date()
        };

        console.log('RFID Keyboard Listener initialisiert:', {
            minScanInterval: this.minScanInterval,
            inputTimeout: this.inputTimeout,
            maxBufferLength: this.maxBufferLength
        });
    }

    async start() {
        if (this.isListening) {
            console.log('RFID Keyboard Listener läuft bereits');
            return true;
        }

        try {
            console.log('Starte RFID Keyboard Listener...');

            // Bestehende Shortcuts erst entfernen
            this.stop();

            // Verfügbarkeit prüfen
            const availability = this.checkShortcutAvailability();
            if (!availability.allAvailable) {
                console.warn('⚠️ Einige Tastatur-Shortcuts sind nicht verfügbar:', availability.unavailable);
                console.warn('💡 Mögliche Ursachen: Andere Apps verwenden diese Shortcuts bereits');
            }

            // Shortcuts für Hex-Zeichen registrieren (0-9, A-F)
            const hexChars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];
            let registeredCount = 0;

            for (const char of hexChars) {
                try {
                    const registered = globalShortcut.register(char, () => {
                        this.handleKeyInput(char);
                    });

                    if (registered) {
                        this.registeredShortcuts.push(char);
                        registeredCount++;
                    } else {
                        console.warn(`Shortcut für '${char}' konnte nicht registriert werden`);
                    }
                } catch (error) {
                    console.warn(`Fehler beim Registrieren von '${char}':`, error.message);
                }
            }

            // Enter-Taste für Verarbeitung registrieren
            const enterVariants = ['Enter', 'Return'];
            let enterRegistered = false;

            for (const enterKey of enterVariants) {
                try {
                    const registered = globalShortcut.register(enterKey, () => {
                        this.processBuffer();
                    });

                    if (registered) {
                        this.registeredShortcuts.push(enterKey);
                        enterRegistered = true;
                        break; // Nur eine Enter-Variante nötig
                    }
                } catch (error) {
                    console.warn(`Fehler beim Registrieren von '${enterKey}':`, error.message);
                }
            }

            // Erfolg prüfen
            if (registeredCount < 10) { // Mindestens 0-9 sollten funktionieren
                console.warn(`⚠️ Nur ${registeredCount} von ${hexChars.length} Hex-Zeichen registriert`);
                console.warn('RFID-Funktionalität möglicherweise eingeschränkt');
            }

            if (!enterRegistered) {
                console.warn('⚠️ Enter-Taste konnte nicht registriert werden');
                console.warn('RFID-Tags werden möglicherweise nicht korrekt verarbeitet');
            }

            this.isListening = true;
            this.emit('started');

            console.log(`✅ RFID Keyboard Listener gestartet`);
            console.log(`   Registrierte Shortcuts: ${this.registeredShortcuts.length}`);
            console.log(`   Hex-Zeichen: ${registeredCount}/${hexChars.length}`);
            console.log(`   Enter-Taste: ${enterRegistered ? 'Ja' : 'Nein'}`);

            return true;

        } catch (error) {
            console.error('❌ RFID Keyboard Listener Start fehlgeschlagen:', error);
            this.emit('error', error);
            return false;
        }
    }

    async stop() {
        if (!this.isListening && this.registeredShortcuts.length === 0) {
            return;
        }

        console.log('Stoppe RFID Keyboard Listener...');

        try {
            // Alle registrierten Shortcuts entfernen
            let unregisteredCount = 0;
            this.registeredShortcuts.forEach(shortcut => {
                try {
                    if (globalShortcut.isRegistered(shortcut)) {
                        globalShortcut.unregister(shortcut);
                        unregisteredCount++;
                    }
                } catch (error) {
                    console.warn(`Fehler beim Entfernen von '${shortcut}':`, error.message);
                }
            });

            this.registeredShortcuts = [];
            this.isListening = false;
            this.buffer = '';
            this.emit('stopped');

            console.log(`✅ RFID Keyboard Listener gestoppt`);
            console.log(`   Entfernte Shortcuts: ${unregisteredCount}`);

        } catch (error) {
            console.error('❌ Fehler beim Stoppen des RFID Keyboard Listeners:', error);
        }
    }

    handleKeyInput(key) {
        const now = Date.now();

        // Input-Timeout prüfen (Buffer zurücksetzen bei zu langer Pause)
        if (this.buffer && (now - this.lastInputTime) > this.inputTimeout) {
            console.log(`RFID Input-Timeout, Buffer zurückgesetzt: "${this.buffer}"`);
            this.buffer = '';
        }

        this.lastInputTime = now;

        // Zeichen zum Buffer hinzufügen
        this.buffer += key.toUpperCase();

        // Buffer-Overflow verhindern
        if (this.buffer.length > this.maxBufferLength) {
            console.log(`RFID Buffer-Overflow, kürze auf ${this.maxBufferLength} Zeichen`);
            this.buffer = this.buffer.slice(-this.maxBufferLength);
        }

        console.log(`RFID Key-Input: '${key}', Buffer: "${this.buffer}" (${this.buffer.length})`);
    }

    processBuffer() {
        if (!this.buffer) {
            console.log('RFID Buffer leer - ignoriere Enter');
            return;
        }

        const tagId = this.buffer.trim().toUpperCase();
        const originalBuffer = this.buffer;
        this.buffer = '';

        console.log(`RFID verarbeite Buffer: "${originalBuffer}" → Tag: "${tagId}"`);

        // Statistiken aktualisieren
        this.stats.totalScans++;

        // Tag validieren
        if (!this.validateTagId(tagId)) {
            console.log(`❌ RFID ungültiges Tag-Format: "${tagId}"`);
            this.stats.invalidScans++;
            this.emit('invalid-tag', { tagId, reason: 'format' });
            return;
        }

        // Scan-Intervall prüfen (Duplikat-Schutz)
        const now = Date.now();
        if (now - this.lastScanTime < this.minScanInterval) {
            console.log(`❌ RFID Scan zu schnell (${now - this.lastScanTime}ms < ${this.minScanInterval}ms): ${tagId}`);
            this.stats.duplicateScans++;
            this.emit('duplicate-scan', { tagId, interval: now - this.lastScanTime });
            return;
        }

        this.lastScanTime = now;
        this.stats.validScans++;

        console.log(`✅ RFID Tag erkannt: ${tagId}`);

        // Event emittieren
        this.emit('tag', tagId);

        // Callback aufrufen
        if (this.callback && typeof this.callback === 'function') {
            try {
                this.callback(tagId);
            } catch (error) {
                console.error('Fehler im RFID-Callback:', error);
                this.emit('callback-error', { tagId, error });
            }
        }
    }

    validateTagId(tagId) {
        if (!tagId || typeof tagId !== 'string') {
            return false;
        }

        const cleanTag = tagId.trim().toUpperCase();

        // Längen-Prüfung (typische RFID-Tags: 8-12 Hex-Zeichen)
        if (cleanTag.length < 6 || cleanTag.length > 14) {
            console.log(`RFID Tag-Länge ungültig: ${cleanTag.length} (erwartet: 6-14)`);
            return false;
        }

        // Hex-Format prüfen
        if (!/^[0-9A-F]+$/.test(cleanTag)) {
            console.log(`RFID Tag enthält ungültige Zeichen: "${cleanTag}"`);
            return false;
        }

        // Konvertierung zu Zahl und Null-Prüfung
        try {
            const decimal = parseInt(cleanTag, 16);
            if (decimal <= 0) {
                console.log(`RFID Tag ist Null oder negativ: ${decimal}`);
                return false;
            }
            return true;
        } catch (error) {
            console.log(`RFID Tag-Konvertierung fehlgeschlagen: "${cleanTag}"`);
            return false;
        }
    }

    // ===== UTILITY METHODS =====
    getStatus() {
        const uptime = Date.now() - this.stats.startTime.getTime();

        return {
            listening: this.isListening,
            deviceConnected: true, // Keyboard-Listener ist immer "verbunden"
            buffer: this.buffer,
            lastScanTime: this.lastScanTime,
            registeredShortcuts: this.registeredShortcuts.length,
            type: 'keyboard',
            config: {
                minScanInterval: this.minScanInterval,
                inputTimeout: this.inputTimeout,
                maxBufferLength: this.maxBufferLength
            },
            stats: {
                ...this.stats,
                uptime: Math.floor(uptime / 1000),
                scansPerMinute: this.stats.totalScans / (uptime / 60000) || 0,
                successRate: this.stats.totalScans > 0 ? (this.stats.validScans / this.stats.totalScans * 100) : 0
            }
        };
    }

    getDetailedStatus() {
        const status = this.getStatus();
        const availability = this.checkShortcutAvailability();

        return {
            ...status,
            shortcutAvailability: availability,
            registeredShortcuts: this.registeredShortcuts,
            recommendations: this.getRecommendations()
        };
    }

    clearBuffer() {
        const oldBuffer = this.buffer;
        this.buffer = '';
        console.log(`RFID Buffer manuell geleert: "${oldBuffer}"`);
        this.emit('buffer-cleared', { oldBuffer });
    }

    setMinScanInterval(interval) {
        const oldInterval = this.minScanInterval;
        this.minScanInterval = Math.max(100, interval); // Minimum 100ms
        console.log(`RFID Scan-Intervall geändert: ${oldInterval}ms → ${this.minScanInterval}ms`);
        this.emit('config-changed', { setting: 'minScanInterval', oldValue: oldInterval, newValue: this.minScanInterval });
    }

    resetStats() {
        const oldStats = { ...this.stats };
        this.stats = {
            totalScans: 0,
            validScans: 0,
            invalidScans: 0,
            duplicateScans: 0,
            startTime: new Date()
        };
        console.log('RFID Statistiken zurückgesetzt');
        this.emit('stats-reset', { oldStats });
    }

    // ===== TEST & DEBUG METHODS =====
    simulateTag(tagId) {
        if (!this.validateTagId(tagId)) {
            console.error(`❌ RFID Simulation fehlgeschlagen - ungültige Tag-ID: "${tagId}"`);
            return false;
        }

        console.log(`🧪 RFID Simulation: ${tagId}`);

        // Buffer setzen und verarbeiten
        this.buffer = tagId.toUpperCase();
        this.processBuffer();

        return true;
    }

    simulateKeySequence(sequence) {
        console.log(`🧪 RFID Tastatur-Simulation: "${sequence}"`);

        // Sequenz Zeichen für Zeichen eingeben
        for (const char of sequence) {
            if (/[0-9A-Fa-f]/.test(char)) {
                this.handleKeyInput(char);
            }
        }

        // Enter simulieren
        this.processBuffer();
    }

    inputTag(tagId) {
        if (!this.isListening) {
            console.warn('⚠️ RFID Listener nicht aktiv - Tag-Input ignoriert');
            return false;
        }

        return this.simulateTag(tagId);
    }

    // ===== SHORTCUT MANAGEMENT =====
    checkShortcutAvailability() {
        const testShortcuts = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'Enter'];
        const available = [];
        const unavailable = [];

        testShortcuts.forEach(shortcut => {
            try {
                if (globalShortcut.isRegistered(shortcut)) {
                    // Bereits registriert - entweder von uns oder anderen
                    if (this.registeredShortcuts.includes(shortcut)) {
                        available.push(shortcut);
                    } else {
                        unavailable.push(shortcut + ' (von anderer App verwendet)');
                    }
                } else {
                    // Versuche kurz zu registrieren
                    const registered = globalShortcut.register(shortcut, () => {});
                    if (registered) {
                        available.push(shortcut);
                        globalShortcut.unregister(shortcut);
                    } else {
                        unavailable.push(shortcut + ' (Registrierung fehlgeschlagen)');
                    }
                }
            } catch (error) {
                unavailable.push(shortcut + ' (Fehler: ' + error.message + ')');
            }
        });

        return {
            available,
            unavailable,
            allAvailable: unavailable.length === 0,
            availabilityPercentage: Math.round((available.length / testShortcuts.length) * 100)
        };
    }

    getRecommendations() {
        const recommendations = [];
        const status = this.getStatus();

        if (!this.isListening) {
            recommendations.push('RFID Listener ist nicht aktiv - starten Sie ihn mit start()');
        }

        if (this.registeredShortcuts.length < 16) {
            recommendations.push('Nicht alle benötigten Shortcuts verfügbar - schließen Sie andere Apps die globale Shortcuts verwenden');
        }

        if (status.stats.successRate < 90 && status.stats.totalScans > 10) {
            recommendations.push('Niedrige Erfolgsrate bei RFID-Scans - prüfen Sie Reader-Hardware und Tag-Qualität');
        }

        if (status.stats.duplicateScans > status.stats.validScans * 0.1) {
            recommendations.push('Viele Duplikat-Scans - erhöhen Sie RFID_MIN_SCAN_INTERVAL');
        }

        if (this.buffer.length > this.maxBufferLength * 0.8) {
            recommendations.push('Buffer wird häufig voll - prüfen Sie RFID_INPUT_TIMEOUT Einstellung');
        }

        return recommendations;
    }

    // ===== DIAGNOSTICS =====
    getDiagnostics() {
        const shortcutCheck = this.checkShortcutAvailability();
        const status = this.getDetailedStatus();

        return {
            timestamp: new Date().toISOString(),
            status: status,
            shortcutAvailability: shortcutCheck,
            globalShortcuts: {
                available: typeof globalShortcut !== 'undefined',
                allRegistered: globalShortcut.getAll ? globalShortcut.getAll() : 'N/A'
            },
            recommendations: this.getRecommendations(),
            healthCheck: this.performHealthCheck()
        };
    }

    performHealthCheck() {
        const issues = [];
        const warnings = [];

        // Kritische Prüfungen
        if (!this.isListening) {
            issues.push('Listener ist nicht aktiv');
        }

        if (this.registeredShortcuts.length === 0) {
            issues.push('Keine Shortcuts registriert');
        }

        // Warnungen
        if (this.registeredShortcuts.length < 16) {
            warnings.push(`Nur ${this.registeredShortcuts.length}/17 Shortcuts verfügbar`);
        }

        const stats = this.getStatus().stats;
        if (stats.totalScans > 0 && stats.successRate < 80) {
            warnings.push(`Niedrige Erfolgsrate: ${stats.successRate.toFixed(1)}%`);
        }

        return {
            healthy: issues.length === 0,
            issues: issues,
            warnings: warnings,
            score: issues.length === 0 ? (warnings.length === 0 ? 100 : 75) : 25
        };
    }
}

module.exports = RFIDListenerKeyboard;