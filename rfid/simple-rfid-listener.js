/**
 * Simple RFID Listener für Qualitätskontrolle
 * Keyboard-basierte RFID-Tag-Erkennung ohne native Dependencies
 */

const { EventEmitter } = require('events');
const { globalShortcut } = require('electron');

class SimpleRFIDListener extends EventEmitter {
    constructor(options = {}) {
        super();

        this.options = {
            debug: options.debug || false,
            inputTimeout: options.inputTimeout || 500, // Zeit zwischen Zeichen in ms
            minScanInterval: options.minScanInterval || 1000, // Min. Zeit zwischen Scans
            maxBufferLength: options.maxBufferLength || 20, // Max. Pufferlänge
            ...options
        };

        this.isActive = false;
        this.inputBuffer = '';
        this.inputTimeout = null;
        this.lastScanTime = 0;
        this.registeredShortcuts = [];

        console.log('Simple RFID Listener initialisiert:', this.options);
    }

    async start() {
        if (this.isActive) {
            console.log('⚠️ RFID Listener ist bereits aktiv');
            return;
        }

        try {
            console.log('🏷️ Starte Simple RFID Listener...');

            // Alle alphanumerischen Zeichen registrieren
            const characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

            for (const char of characters) {
                try {
                    const success = globalShortcut.register(char, () => {
                        this.handleKeyInput(char);
                    });

                    if (success) {
                        this.registeredShortcuts.push(char);
                    }
                } catch (error) {
                    if (this.options.debug) {
                        console.warn(`Zeichen '${char}' konnte nicht registriert werden:`, error.message);
                    }
                }
            }

            // Enter-Taste für Scan-Abschluss
            try {
                const enterSuccess = globalShortcut.register('Return', () => {
                    this.handleEnterKey();
                });

                if (enterSuccess) {
                    this.registeredShortcuts.push('Return');
                }
            } catch (error) {
                console.warn('Enter-Taste konnte nicht registriert werden:', error.message);
            }

            this.isActive = true;

            console.log('✅ Simple RFID Listener gestartet');
            console.log(`   Registrierte Shortcuts: ${this.registeredShortcuts.length}`);
            console.log(`   Hex-Zeichen: ${this.registeredShortcuts.filter(s => /[0-9a-fA-F]/.test(s)).length}/16`);
            console.log(`   Enter-Taste: ${this.registeredShortcuts.includes('Return') ? 'Ja' : 'Nein'}`);

            this.emit('started');

        } catch (error) {
            console.error('❌ RFID Listener Start fehlgeschlagen:', error);
            this.isActive = false;
            throw error;
        }
    }

    async stop() {
        if (!this.isActive) {
            return;
        }

        try {
            console.log('🛑 Stoppe Simple RFID Listener...');

            // Alle Shortcuts entfernen
            this.registeredShortcuts.forEach(shortcut => {
                try {
                    globalShortcut.unregister(shortcut);
                } catch (error) {
                    if (this.options.debug) {
                        console.warn(`Shortcut '${shortcut}' konnte nicht entfernt werden:`, error.message);
                    }
                }
            });

            this.registeredShortcuts = [];

            // Timeout löschen
            if (this.inputTimeout) {
                clearTimeout(this.inputTimeout);
                this.inputTimeout = null;
            }

            // Buffer zurücksetzen
            this.inputBuffer = '';
            this.isActive = false;

            console.log('✅ Simple RFID Listener gestoppt');
            this.emit('stopped');

        } catch (error) {
            console.error('❌ RFID Listener Stop fehlgeschlagen:', error);
            throw error;
        }
    }

    handleKeyInput(character) {
        if (!this.isActive) {
            return;
        }

        // Buffer-Längen-Limit
        if (this.inputBuffer.length >= this.options.maxBufferLength) {
            if (this.options.debug) {
                console.warn('RFID Buffer-Überlauf - Buffer zurückgesetzt');
            }
            this.inputBuffer = '';
        }

        // Zeichen zum Buffer hinzufügen
        this.inputBuffer += character;

        if (this.options.debug) {
            console.log(`RFID Input: '${character}' → Buffer: "${this.inputBuffer}" (${this.inputBuffer.length})`);
        }

        // Input-Timeout zurücksetzen
        if (this.inputTimeout) {
            clearTimeout(this.inputTimeout);
        }

        this.inputTimeout = setTimeout(() => {
            // Timeout erreicht - Buffer als unvollständig behandeln
            if (this.inputBuffer.length > 0) {
                if (this.options.debug) {
                    console.warn(`RFID Input-Timeout - Buffer "${this.inputBuffer}" verworfen`);
                }
                this.inputBuffer = '';
            }
        }, this.options.inputTimeout);
    }

    handleEnterKey() {
        if (!this.isActive || this.inputBuffer.length === 0) {
            return;
        }

        // Input-Timeout löschen
        if (this.inputTimeout) {
            clearTimeout(this.inputTimeout);
            this.inputTimeout = null;
        }

        const tagId = this.inputBuffer.trim();
        this.inputBuffer = '';

        if (this.options.debug) {
            console.log(`RFID verarbeite Buffer: "${tagId}" → Tag: "${tagId}"`);
        }

        // Rate-Limiting prüfen
        const now = Date.now();
        if (now - this.lastScanTime < this.options.minScanInterval) {
            if (this.options.debug) {
                console.warn(`RFID Rate-Limit: Scan zu schnell (${now - this.lastScanTime}ms < ${this.options.minScanInterval}ms)`);
            }
            return;
        }

        this.lastScanTime = now;

        // Tag-Validierung
        if (this.isValidTag(tagId)) {
            console.log(`🏷️ RFID Tag erkannt: ${tagId}`);
            this.emit('tag-scanned', tagId);
        } else {
            if (this.options.debug) {
                console.warn(`RFID Ungültiger Tag: "${tagId}"`);
            }
            this.emit('invalid-tag', tagId);
        }
    }

    isValidTag(tagId) {
        // Basis-Validierung für RFID-Tags
        if (!tagId || typeof tagId !== 'string') {
            return false;
        }

        const cleaned = tagId.trim();

        // Mindestlänge
        if (cleaned.length < 4) {
            return false;
        }

        // Maximallänge
        if (cleaned.length > 20) {
            return false;
        }

        // Nur alphanumerische Zeichen erlaubt
        if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
            return false;
        }

        return true;
    }

    // ===== UTILITY METHODS =====

    getStatus() {
        return {
            isActive: this.isActive,
            registeredShortcuts: this.registeredShortcuts.length,
            bufferLength: this.inputBuffer.length,
            lastScanTime: this.lastScanTime,
            options: this.options
        };
    }

    clearBuffer() {
        this.inputBuffer = '';
        if (this.inputTimeout) {
            clearTimeout(this.inputTimeout);
            this.inputTimeout = null;
        }
    }

    // Für Testing/Debugging
    simulateTag(tagId) {
        if (!this.isActive) {
            return false;
        }

        console.log(`🧪 RFID Simulation: ${tagId}`);

        // Rate-Limiting prüfen
        const now = Date.now();
        if (now - this.lastScanTime < this.options.minScanInterval) {
            console.warn('RFID Simulation: Rate-Limit aktiv');
            return false;
        }

        this.lastScanTime = now;

        if (this.isValidTag(tagId)) {
            this.emit('tag-scanned', tagId);
            return true;
        } else {
            this.emit('invalid-tag', tagId);
            return false;
        }
    }

    // ===== EVENT HANDLERS =====

    onTagScanned(handler) {
        this.on('tag-scanned', handler);
    }

    onInvalidTag(handler) {
        this.on('invalid-tag', handler);
    }

    onError(handler) {
        this.on('error', handler);
    }

    onStarted(handler) {
        this.on('started', handler);
    }

    onStopped(handler) {
        this.on('stopped', handler);
    }

    // ===== CLEANUP =====

    async cleanup() {
        try {
            await this.stop();
            this.removeAllListeners();
            console.log('✅ Simple RFID Listener Cleanup abgeschlossen');
        } catch (error) {
            console.error('❌ Simple RFID Listener Cleanup Fehler:', error);
        }
    }
}

module.exports = SimpleRFIDListener;