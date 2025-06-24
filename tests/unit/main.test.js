const { EventEmitter } = require('events');

/**
 * Mock Main Application
 * Simuliert die Hauptanwendungslogik für Tests
 */
class MockMainApp extends EventEmitter {
    constructor() {
        super();

        this.isRunning = false;
        this.isReady = false;
        this.window = null;

        // Dependencies
        this.rfidListener = null;
        this.dbClient = null;

        // State Management
        this.currentUser = null;
        this.activeSession = null;
        this.isScanning = false;

        // Configuration
        this.config = {
            autoScan: true,
            sessionTimeout: 8 * 60 * 60 * 1000, // 8 Stunden
            debugMode: false
        };

        // Statistics
        this.stats = {
            totalLogins: 0,
            totalScans: 0,
            totalErrors: 0,
            uptime: 0,
            startTime: null
        };

        // Mock Functions für Tests
        this.handleRFIDScan = jest.fn(this._handleRFIDScan.bind(this));
        this.handleDatabaseError = jest.fn(this._handleDatabaseError.bind(this));
        this.handleSessionCreate = jest.fn(this._handleSessionCreate.bind(this));
        this.handleSessionEnd = jest.fn(this._handleSessionEnd.bind(this));
        this.handleQRScan = jest.fn(this._handleQRScan.bind(this));
    }

    /**
     * Anwendung starten
     */
    async start() {
        if (this.isRunning) {
            this._log('Main App läuft bereits');
            return;
        }

        try {
            this._log('Starte Main Application...');

            await this._initializeApp();
            await this._setupEventHandlers();

            this.isRunning = true;
            this.isReady = true;
            this.stats.startTime = new Date();

            this._log('Main Application erfolgreich gestartet');
            this.emit('ready');

        } catch (error) {
            this.stats.totalErrors++;
            this._log(`Fehler beim Starten: ${error.message}`, 'error');
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Anwendung stoppen
     */
    async stop() {
        if (!this.isRunning) {
            this._log('Main App läuft nicht');
            return;
        }

        try {
            this._log('Stoppe Main Application...');

            // Aktuelle Session beenden
            if (this.activeSession) {
                await this.endCurrentSession();
            }

            // Event-Handler entfernen
            this._removeEventHandlers();

            this.isRunning = false;
            this.isReady = false;

            this._log('Main Application gestoppt');
            this.emit('stopped');

        } catch (error) {
            this.stats.totalErrors++;
            this._log(`Fehler beim Stoppen: ${error.message}`, 'error');
            this.emit('error', error);
        }
    }

    /**
     * Dependencies setzen (für Tests)
     */
    setDependencies(rfidListener, dbClient) {
        this.rfidListener = rfidListener;
        this.dbClient = dbClient;

        this._log('Dependencies gesetzt');
    }

    /**
     * RFID-Scan behandeln (interne Implementierung)
     */
    async _handleRFIDScan(tagId) {
        try {
            this._log(`RFID-Scan empfangen: ${tagId}`);
            this.stats.totalScans++;

            if (!this.dbClient) {
                throw new Error('Database Client nicht verfügbar');
            }

            // Benutzer suchen
            const user = await this.dbClient.getUserByEPC(tagId);

            if (!user) {
                this._log(`Unbekannter RFID-Tag: ${tagId}`, 'warn');
                this.emit('unknown-tag', tagId);
                return;
            }

            // Session-Logik
            if (this.currentUser && this.currentUser.id === user.id) {
                // Gleicher Benutzer -> Ausloggen
                await this.endCurrentSession();
            } else {
                // Anderer Benutzer -> Alte Session beenden, neue starten
                if (this.activeSession) {
                    await this.endCurrentSession();
                }
                await this.startNewSession(user);
            }

        } catch (error) {
            this.stats.totalErrors++;
            this._log(`Fehler bei RFID-Scan: ${error.message}`, 'error');
            this.emit('scan-error', { tagId, error });
        }
    }

    /**
     * Database-Fehler behandeln
     */
    async _handleDatabaseError(error) {
        this.stats.totalErrors++;
        this._log(`Database-Fehler: ${error.message}`, 'error');
        this.emit('database-error', error);
    }

    /**
     * Session erstellen
     */
    async _handleSessionCreate(userId) {
        try {
            if (!this.dbClient) {
                throw new Error('Database Client nicht verfügbar');
            }

            const session = await this.dbClient.createSession(userId);
            this._log(`Session erstellt: ${session.id} für User ${userId}`);

            return session;
        } catch (error) {
            this.stats.totalErrors++;
            this._log(`Fehler bei Session-Erstellung: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Session beenden
     */
    async _handleSessionEnd(sessionId) {
        try {
            if (!this.dbClient) {
                throw new Error('Database Client nicht verfügbar');
            }

            const session = await this.dbClient.endSession(sessionId);
            this._log(`Session beendet: ${sessionId}`);

            return session;
        } catch (error) {
            this.stats.totalErrors++;
            this._log(`Fehler beim Beenden der Session: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * QR-Code-Scan behandeln
     */
    async _handleQRScan(qrData) {
        try {
            this._log(`QR-Scan empfangen: ${qrData}`);

            if (!this.activeSession) {
                this._log('Kein aktiver Benutzer für QR-Scan', 'warn');
                this.emit('qr-scan-no-session', qrData);
                return;
            }

            if (!this.dbClient) {
                throw new Error('Database Client nicht verfügbar');
            }

            // QR-Scan speichern
            const scan = await this.dbClient.saveQrScan(this.activeSession.id, qrData);

            this._log(`QR-Scan gespeichert: ID ${scan.id}`);
            this.emit('qr-scan-saved', scan);

            return scan;

        } catch (error) {
            this.stats.totalErrors++;
            this._log(`Fehler bei QR-Scan: ${error.message}`, 'error');
            this.emit('qr-scan-error', { qrData, error });
        }
    }

    /**
     * Neue Session starten
     */
    async startNewSession(user) {
        try {
            this._log(`Starte neue Session für ${user.name}`);

            const session = await this._handleSessionCreate(user.id);

            this.currentUser = user;
            this.activeSession = session;
            this.stats.totalLogins++;

            this._log(`Session gestartet: User ${user.name}, Session ${session.id}`);
            this.emit('session-started', { user, session });

            return session;

        } catch (error) {
            this.stats.totalErrors++;
            this._log(`Fehler beim Starten der Session: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Aktuelle Session beenden
     */
    async endCurrentSession() {
        if (!this.activeSession) {
            this._log('Keine aktive Session zum Beenden');
            return;
        }

        try {
            const sessionId = this.activeSession.id;
            const user = this.currentUser;

            const endedSession = await this._handleSessionEnd(sessionId);

            this.currentUser = null;
            this.activeSession = null;

            this._log(`Session beendet: ${sessionId}`);
            this.emit('session-ended', { user, session: endedSession });

            return endedSession;

        } catch (error) {
            this.stats.totalErrors++;
            this._log(`Fehler beim Beenden der Session: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Öffentliche API-Methoden (für IPC/Tests)
     */

    // Benutzer per EPC abrufen
    async getUserByEPC(epc) {
        if (!this.dbClient) {
            throw new Error('Database Client nicht verfügbar');
        }
        return await this.dbClient.getUserByEPC(epc);
    }

    // Session erstellen
    async createSession(userId) {
        return await this._handleSessionCreate(userId);
    }

    // Session beenden
    async endSession(sessionId) {
        return await this._handleSessionEnd(sessionId);
    }

    // QR-Scan speichern
    async saveQrScan(qrData) {
        return await this._handleQRScan(qrData);
    }

    // Status abrufen
    getStatus() {
        return {
            isRunning: this.isRunning,
            isReady: this.isReady,
            currentUser: this.currentUser,
            activeSession: this.activeSession,
            isScanning: this.isScanning,
            stats: { ...this.stats },
            config: { ...this.config }
        };
    }

    // Statistiken zurücksetzen
    resetStats() {
        this.stats = {
            totalLogins: 0,
            totalScans: 0,
            totalErrors: 0,
            uptime: 0,
            startTime: this.stats.startTime
        };
        this._log('Statistiken zurückgesetzt');
    }

    /**
     * Private Hilfsfunktionen
     */

    // App initialisieren
    async _initializeApp() {
        // Simuliere Initialisierung
        await this._delay(100);
        this._log('App initialisiert');
    }

    // Event-Handler einrichten
    async _setupEventHandlers() {
        if (this.rfidListener) {
            this.rfidListener.on('tag-scanned', this.handleRFIDScan);
            this.rfidListener.on('error', this.handleDatabaseError);
        }

        this._log('Event-Handler eingerichtet');
    }

    // Event-Handler entfernen
    _removeEventHandlers() {
        if (this.rfidListener) {
            this.rfidListener.removeListener('tag-scanned', this.handleRFIDScan);
            this.rfidListener.removeListener('error', this.handleDatabaseError);
        }

        this._log('Event-Handler entfernt');
    }

    // Delay-Funktion
    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Logging-Funktion
    _log(message, level = 'info') {
        if (!this.config.debugMode && level === 'debug') {
            return;
        }

        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [MainApp-Mock] [${level.toUpperCase()}]`;

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

module.exports = MockMainApp;