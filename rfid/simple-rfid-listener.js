// rfid/simple-rfid-listener.js
// RFID-Listener für Qualitätskontrolle mit Doppel-Scan-System
// Spezialisiert für automatische Session-Verwaltung und Session-Neustart

const { globalShortcut } = require('electron');
const EventEmitter = require('events');

class QualityControlRFIDListener extends EventEmitter {
    constructor(callback = null) {
        super();

        this.callback = callback;
        this.isListening = false;
        this.buffer = '';
        this.lastInputTime = 0;
        this.lastScanTime = 0;
        this.shortcuts = [];

        // Qualitätskontrolle-spezifische Konfiguration
        this.inputTimeout = parseFloat(process.env.RFID_INPUT_TIMEOUT) || 500; // ms
        this.minScanInterval = parseFloat(process.env.RFID_MIN_SCAN_INTERVAL) || 1000; // ms
        this.maxBufferLength = parseInt(process.env.RFID_MAX_BUFFER_LENGTH) || 15;

        // Session-Neustart Unterstützung für Qualitätskontrolle
        this.sessionRestartEnabled = process.env.RFID_SESSION_RESTART_ENABLED === 'true';
        this.lastUserTag = null;
        this.lastUserScanTime = 0;
        this.userSessionMap = new Map(); // tagId -> sessionInfo

        // Statistiken für Qualitätskontrolle
        this.stats = {
            totalScans: 0,
            validScans: 0,
            invalidScans: 0,
            duplicateScans: 0,
            sessionStarts: 0,
            sessionEnds: 0,
            sessionRestarts: 0,
            startTime: new Date()
        };

        // Qualitätskontrolle-spezifische Events
        this.qualityControlEvents = {
            sessionAutoRestart: 'qc-session-auto-restart',
            duplicateUserScan: 'qc-duplicate-user-scan',
            rapidSessionToggle: 'qc-rapid-session-toggle',
            sessionEfficiencyWarning: 'qc-session-efficiency-warning'
        };

        console.log('🔍 Qualitätskontrolle RFID Listener initialisiert:', {
            inputTimeout: this.inputTimeout,
            minScanInterval: this.minScanInterval,
            maxBufferLength: this.maxBufferLength,
            sessionRestartEnabled: this.sessionRestartEnabled
        });
    }

    async start() {
        if (this.isListening) {
            console.log('Qualitätskontrolle RFID Listener läuft bereits');
            return true;
        }

        try {
            console.log('🏷️ Starte Qualitätskontrolle RFID Listener...');

            // Bestehende Shortcuts entfernen
            this.stop();

            // Hex-Zeichen registrieren (0-9, A-F)
            const hexChars = '0123456789ABCDEF';
            let registeredCount = 0;

            for (const char of hexChars) {
                try {
                    const registered = globalShortcut.register(char, () => {
                        this.handleInput(char);
                    });

                    if (registered) {
                        this.shortcuts.push(char);
                        registeredCount++;
                    } else {
                        console.warn(`Shortcut für '${char}' bereits belegt`);
                    }
                } catch (error) {
                    console.warn(`Fehler beim Registrieren von '${char}':`, error.message);
                }
            }

            // Enter-Taste für Tag-Ende registrieren
            let enterRegistered = false;
            const enterKeys = ['Enter', 'Return'];

            for (const enterKey of enterKeys) {
                try {
                    const registered = globalShortcut.register(enterKey, () => {
                        this.processTag();
                    });

                    if (registered) {
                        this.shortcuts.push(enterKey);
                        enterRegistered = true;
                        break; // Nur eine Enter-Variante nötig
                    }
                } catch (error) {
                    console.warn(`Fehler beim Registrieren von '${enterKey}':`, error.message);
                }
            }

            // Erfolg bewerten
            if (registeredCount < 10) {
                console.warn(`⚠️ Nur ${registeredCount} von 16 Hex-Zeichen registriert`);
                console.warn('Mögliche Ursache: Andere Apps nutzen globale Shortcuts');
            }

            if (!enterRegistered) {
                console.warn('⚠️ Enter-Taste konnte nicht registriert werden');
                console.warn('Tags werden möglicherweise nicht korrekt verarbeitet');
            }

            this.isListening = true;
            this.emit('started');

            console.log(`✅ Qualitätskontrolle RFID Listener gestartet`);
            console.log(`   Registrierte Shortcuts: ${this.shortcuts.length}`);
            console.log(`   Hex-Zeichen: ${registeredCount}/16`);
            console.log(`   Enter-Taste: ${enterRegistered ? 'Ja' : 'Nein'}`);
            console.log(`   Session-Neustart: ${this.sessionRestartEnabled ? 'Aktiviert' : 'Deaktiviert'}`);

            return true;

        } catch (error) {
            console.error('❌ Qualitätskontrolle RFID Listener Start fehlgeschlagen:', error);
            this.emit('error', error);
            return false;
        }
    }

    async stop() {
        if (!this.isListening && this.shortcuts.length === 0) {
            return;
        }

        console.log('⏹️ Stoppe Qualitätskontrolle RFID Listener...');

        try {
            // Alle registrierten Shortcuts entfernen
            let unregisteredCount = 0;
            this.shortcuts.forEach(shortcut => {
                try {
                    if (globalShortcut.isRegistered(shortcut)) {
                        globalShortcut.unregister(shortcut);
                        unregisteredCount++;
                    }
                } catch (error) {
                    console.warn(`Fehler beim Entfernen von '${shortcut}':`, error.message);
                }
            });

            this.shortcuts = [];
            this.isListening = false;
            this.buffer = '';
            this.emit('stopped');

            console.log(`✅ Qualitätskontrolle RFID Listener gestoppt (${unregisteredCount} Shortcuts entfernt)`);

        } catch (error) {
            console.error('❌ Fehler beim Stoppen des Qualitätskontrolle RFID Listeners:', error);
        }
    }

    handleInput(char) {
        const now = Date.now();

        // Input-Timeout prüfen (Buffer zurücksetzen bei zu langer Pause)
        if (this.buffer && (now - this.lastInputTime) > this.inputTimeout) {
            console.log(`RFID Input-Timeout, Buffer zurückgesetzt: "${this.buffer}"`);
            this.buffer = '';
        }

        this.lastInputTime = now;

        // Zeichen zum Buffer hinzufügen
        this.buffer += char.toUpperCase();

        // Buffer-Overflow verhindern
        if (this.buffer.length > this.maxBufferLength) {
            console.log(`RFID Buffer-Overflow, kürze auf ${this.maxBufferLength} Zeichen`);
            this.buffer = this.buffer.slice(-this.maxBufferLength);
        }

        if (process.env.RFID_DEBUG === 'true') {
            console.log(`RFID Input: '${char}' → Buffer: "${this.buffer}" (${this.buffer.length})`);
        }
    }

    processTag() {
        if (!this.buffer) {
            console.log('RFID Buffer leer - ignoriere Enter');
            return;
        }

        const tagId = this.buffer.trim().toUpperCase();
        const originalBuffer = this.buffer;
        this.buffer = '';
        const now = Date.now();

        console.log(`🔍 Qualitätskontrolle RFID verarbeite Buffer: "${originalBuffer}" → Tag: "${tagId}"`);

        // Statistiken aktualisieren
        this.stats.totalScans++;

        // Tag validieren
        if (!this.validateTag(tagId)) {
            console.log(`❌ RFID ungültiges Tag-Format: "${tagId}"`);
            this.stats.invalidScans++;
            this.emit('invalid-tag', { tagId, reason: 'format' });
            return;
        }

        // Scan-Intervall prüfen (Duplikat-Schutz)
        if (now - this.lastScanTime < this.minScanInterval) {
            console.log(`❌ RFID Scan zu schnell (${now - this.lastScanTime}ms < ${this.minScanInterval}ms): ${tagId}`);
            this.stats.duplicateScans++;
            this.emit('duplicate-scan', { tagId, interval: now - this.lastScanTime });
            return;
        }

        // Qualitätskontrolle-spezifische Session-Logik
        this.handleQualityControlSession(tagId, now);

        this.lastScanTime = now;
        this.stats.validScans++;

        console.log(`✅ Qualitätskontrolle RFID Tag erkannt: ${tagId}`);

        // Event emittieren
        this.emit('tag', tagId);

        // Callback aufrufen
        if (this.callback && typeof this.callback === 'function') {
            try {
                this.callback(tagId);
            } catch (error) {
                console.error('Fehler im Qualitätskontrolle RFID-Callback:', error);
                this.emit('callback-error', { tagId, error });
            }
        }
    }

    // ===== QUALITÄTSKONTROLLE-SPEZIFISCHE SESSION-LOGIK =====
    handleQualityControlSession(tagId, now) {
        if (!this.sessionRestartEnabled) {
            return;
        }

        // Prüfe ob gleicher Benutzer erneut scannt
        if (this.lastUserTag === tagId) {
            const timeSinceLastScan = now - this.lastUserScanTime;

            // Rapid-Toggle Erkennung (zu schnelle Session-Wechsel)
            if (timeSinceLastScan < 5000) { // 5 Sekunden
                console.log(`⚠️ Qualitätskontrolle: Rapid Session Toggle erkannt für ${tagId}`);
                this.emit(this.qualityControlEvents.rapidSessionToggle, {
                    tagId,
                    timeSinceLastScan,
                    timestamp: now
                });
                return;
            }

            // Session-Neustart für gleichen Benutzer
            console.log(`🔄 Qualitätskontrolle: Session-Neustart für ${tagId}`);
            this.stats.sessionRestarts++;
            this.emit(this.qualityControlEvents.sessionAutoRestart, {
                tagId,
                previousScanTime: this.lastUserScanTime,
                currentScanTime: now,
                sessionDuration: timeSinceLastScan
            });

        } else {
            // Neuer Benutzer oder Session-Ende für vorherigen Benutzer
            if (this.lastUserTag) {
                console.log(`🔚 Qualitätskontrolle: Session beendet für ${this.lastUserTag}`);
                this.stats.sessionEnds++;

                // Session-Effizienz prüfen
                this.checkSessionEfficiency(this.lastUserTag, now);
            }

            console.log(`🔐 Qualitätskontrolle: Neue Session für ${tagId}`);
            this.stats.sessionStarts++;
        }

        // Session-Info aktualisieren
        this.userSessionMap.set(tagId, {
            startTime: now,
            lastScanTime: now,
            scanCount: (this.userSessionMap.get(tagId)?.scanCount || 0) + 1
        });

        this.lastUserTag = tagId;
        this.lastUserScanTime = now;
    }

    checkSessionEfficiency(tagId, endTime) {
        const sessionInfo = this.userSessionMap.get(tagId);
        if (!sessionInfo) return;

        const sessionDuration = endTime - sessionInfo.startTime;
        const minimumEfficiencyThreshold = 30000; // 30 Sekunden

        if (sessionDuration < minimumEfficiencyThreshold) {
            console.log(`⚠️ Qualitätskontrolle: Kurze Session-Dauer für ${tagId}: ${sessionDuration}ms`);
            this.emit(this.qualityControlEvents.sessionEfficiencyWarning, {
                tagId,
                sessionDuration,
                threshold: minimumEfficiencyThreshold,
                scanCount: sessionInfo.scanCount
            });
        }
    }

    validateTag(tagId) {
        if (!tagId || typeof tagId !== 'string') {
            return false;
        }

        const cleanTag = tagId.trim().toUpperCase();

        // Längen-Prüfung (typische RFID-Tags: 6-14 Hex-Zeichen)
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

    // ===== QUALITÄTSKONTROLLE-SPEZIFISCHE FUNKTIONEN =====

    getQualityControlStats() {
        const uptime = Date.now() - this.stats.startTime.getTime();
        const sessionEfficiency = this.stats.sessionStarts > 0 ?
            (this.stats.sessionEnds / this.stats.sessionStarts * 100) : 0;

        return {
            ...this.stats,
            uptime: Math.floor(uptime / 1000),
            scansPerMinute: this.stats.totalScans / (uptime / 60000) || 0,
            successRate: this.stats.totalScans > 0 ?
                (this.stats.validScans / this.stats.totalScans * 100) : 0,
            sessionEfficiency: sessionEfficiency.toFixed(1),
            activeUsers: this.userSessionMap.size,
            averageSessionRestarts: this.stats.sessionRestarts / Math.max(this.stats.sessionStarts, 1)
        };
    }

    getCurrentUserSessions() {
        const now = Date.now();
        const activeSessions = [];

        for (const [tagId, sessionInfo] of this.userSessionMap.entries()) {
            // Sessions als aktiv betrachten wenn letzter Scan < 1 Stunde
            if (now - sessionInfo.lastScanTime < 3600000) {
                activeSessions.push({
                    tagId,
                    startTime: sessionInfo.startTime,
                    lastScanTime: sessionInfo.lastScanTime,
                    duration: now - sessionInfo.startTime,
                    scanCount: sessionInfo.scanCount,
                    isActive: tagId === this.lastUserTag
                });
            }
        }

        return activeSessions;
    }

    forceSessionEnd(tagId = null) {
        if (tagId) {
            // Spezifische Session beenden
            this.userSessionMap.delete(tagId);
            if (this.lastUserTag === tagId) {
                this.lastUserTag = null;
                this.lastUserScanTime = 0;
            }
            console.log(`🔚 Qualitätskontrolle: Session für ${tagId} manuell beendet`);
        } else {
            // Alle Sessions beenden
            this.userSessionMap.clear();
            this.lastUserTag = null;
            this.lastUserScanTime = 0;
            console.log('🔚 Qualitätskontrolle: Alle Sessions manuell beendet');
        }

        this.emit('session-force-ended', { tagId: tagId || 'all', timestamp: Date.now() });
    }

    // ===== UTILITY METHODS =====
    getStatus() {
        const uptime = Date.now() - this.stats.startTime.getTime();

        return {
            listening: this.isListening,
            deviceConnected: true, // Immer "verbunden" da keyboard-basiert
            buffer: this.buffer,
            lastScanTime: this.lastScanTime,
            registeredShortcuts: this.shortcuts.length,
            type: 'quality-control-rfid',
            sessionRestartEnabled: this.sessionRestartEnabled,
            lastUserTag: this.lastUserTag,
            activeUsers: this.userSessionMap.size,
            config: {
                minScanInterval: this.minScanInterval,
                inputTimeout: this.inputTimeout,
                maxBufferLength: this.maxBufferLength
            },
            qualityControlStats: this.getQualityControlStats()
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
        this.emit('config-changed', {
            setting: 'minScanInterval',
            oldValue: oldInterval,
            newValue: this.minScanInterval
        });
    }

    resetStats() {
        const oldStats = { ...this.stats };
        this.stats = {
            totalScans: 0,
            validScans: 0,
            invalidScans: 0,
            duplicateScans: 0,
            sessionStarts: 0,
            sessionEnds: 0,
            sessionRestarts: 0,
            startTime: new Date()
        };

        // Session-Maps nicht zurücksetzen da sie aktive Sessions enthalten
        console.log('🔍 Qualitätskontrolle RFID Statistiken zurückgesetzt');
        this.emit('stats-reset', { oldStats });
    }

    // ===== TEST & DEBUG METHODS =====
    simulateTag(tagId) {
        if (!this.validateTag(tagId)) {
            console.error(`❌ Qualitätskontrolle RFID Simulation fehlgeschlagen - ungültige Tag-ID: "${tagId}"`);
            return false;
        }

        console.log(`🧪 Qualitätskontrolle RFID Simulation: ${tagId}`);

        // Buffer setzen und verarbeiten
        this.buffer = tagId.toUpperCase();
        this.processTag();

        return true;
    }

    simulateKeySequence(sequence) {
        console.log(`🧪 Qualitätskontrolle RFID Tastatur-Simulation: "${sequence}"`);

        // Sequenz Zeichen für Zeichen eingeben
        for (let i = 0; i < sequence.length; i++) {
            setTimeout(() => {
                this.handleInput(sequence[i]);
                if (i === sequence.length - 1) {
                    // Nach letztem Zeichen Enter simulieren
                    setTimeout(() => this.processTag(), 50);
                }
            }, i * 100);
        }

        return true;
    }

    // ===== QUALITÄTSKONTROLLE EVENT HANDLERS =====
    onQualityControlEvent(eventType, callback) {
        if (Object.values(this.qualityControlEvents).includes(eventType)) {
            this.on(eventType, callback);
            return () => this.off(eventType, callback);
        } else {
            throw new Error(`Unbekannter Qualitätskontrolle Event-Typ: ${eventType}`);
        }
    }

    // Convenience-Methoden für spezifische QC-Events
    onSessionAutoRestart(callback) {
        return this.onQualityControlEvent(this.qualityControlEvents.sessionAutoRestart, callback);
    }

    onRapidSessionToggle(callback) {
        return this.onQualityControlEvent(this.qualityControlEvents.rapidSessionToggle, callback);
    }

    onSessionEfficiencyWarning(callback) {
        return this.onQualityControlEvent(this.qualityControlEvents.sessionEfficiencyWarning, callback);
    }
}

module.exports = QualityControlRFIDListener;