const { EventEmitter } = require('events');

/**
 * Mock Database Client für Tests
 * Simuliert SQL Server-Verbindung ohne echte Datenbank
 */
class MockDBClient extends EventEmitter {
    constructor() {
        super();

        this.isConnected = false;
        this.isTimeout = false;
        this.connectionState = 'disconnected';

        // Mock-Daten Storage
        this.mockUsers = new Map();
        this.mockSessions = new Map();
        this.mockEndSessions = new Map();
        this.mockQrScans = new Map();

        // Statistiken
        this.stats = {
            queries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            connectionAttempts: 0,
            lastQueryTime: null
        };

        // Konfiguration
        this.config = {
            connectionTimeout: 5000,
            queryTimeout: 3000,
            retryAttempts: 3,
            debugMode: false
        };

        // Test-Konfiguration
        this.testMode = true;
        this.simulateErrors = false;
        this.errorRate = 0.01; // 1%
    }

    /**
     * Datenbankverbindung herstellen
     */
    async connect() {
        if (this.isConnected) {
            this._log('Database bereits verbunden');
            return;
        }

        this.stats.connectionAttempts++;

        try {
            this._log('Verbinde mit Database (Mock-Modus)...');

            // Simuliere Verbindungszeit
            await this._delay(100);

            // Simuliere mögliche Verbindungsfehler
            if (this.simulateErrors && Math.random() < this.errorRate) {
                throw new Error('Database connection failed');
            }

            this.isConnected = true;
            this.connectionState = 'connected';

            this._log('Database-Verbindung erfolgreich hergestellt');
            this.emit('connected');

        } catch (error) {
            this.stats.failedQueries++;
            this._log(`Database-Verbindung fehlgeschlagen: ${error.message}`, 'error');
            this.emit('error', error);
            throw error;
        }
    }

    /**
     * Datenbankverbindung trennen
     */
    async disconnect() {
        if (!this.isConnected) {
            this._log('Database nicht verbunden');
            return;
        }

        try {
            this._log('Trenne Database-Verbindung...');

            // Simuliere Disconnect-Zeit
            await this._delay(50);

            this.isConnected = false;
            this.connectionState = 'disconnected';

            this._log('Database-Verbindung getrennt');
            this.emit('disconnected');

        } catch (error) {
            this._log(`Fehler beim Trennen: ${error.message}`, 'error');
            this.emit('error', error);
        }
    }

    /**
     * Benutzer per EPC (RFID-Tag) suchen
     */
    async getUserByEPC(epc) {
        this._checkConnection();
        this._checkTimeout();

        this.stats.queries++;
        this.stats.lastQueryTime = new Date();

        try {
            this._log(`Suche Benutzer mit EPC: ${epc}`);

            // Simuliere Query-Zeit
            await this._delay(50);

            // Simuliere Query-Fehler
            if (this.simulateErrors && Math.random() < this.errorRate) {
                throw new Error('Database query failed');
            }

            const user = this.mockUsers.get(epc) || null;

            this.stats.successfulQueries++;
            this._log(`Benutzer gefunden: ${user ? user.name : 'Nicht gefunden'}`);

            return user;

        } catch (error) {
            this.stats.failedQueries++;
            this._log(`Fehler bei Benutzer-Suche: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Neue Session erstellen
     */
    async createSession(userId) {
        this._checkConnection();
        this._checkTimeout();

        this.stats.queries++;
        this.stats.lastQueryTime = new Date();

        try {
            this._log(`Erstelle Session für Benutzer: ${userId}`);

            // Simuliere Query-Zeit
            await this._delay(75);

            // Simuliere Query-Fehler
            if (this.simulateErrors && Math.random() < this.errorRate) {
                throw new Error('Session creation failed');
            }

            const session = this.mockSessions.get(userId) || {
                id: Math.floor(Math.random() * 10000) + 1000,
                userId: userId,
                startTime: new Date(),
                endTime: null,
                active: true
            };

            this.stats.successfulQueries++;
            this._log(`Session erstellt: ID ${session.id}`);

            return session;

        } catch (error) {
            this.stats.failedQueries++;
            this._log(`Fehler bei Session-Erstellung: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Session beenden
     */
    async endSession(sessionId) {
        this._checkConnection();
        this._checkTimeout();

        this.stats.queries++;
        this.stats.lastQueryTime = new Date();

        try {
            this._log(`Beende Session: ${sessionId}`);

            // Simuliere Query-Zeit
            await this._delay(60);

            // Simuliere Query-Fehler
            if (this.simulateErrors && Math.random() < this.errorRate) {
                throw new Error('Session end failed');
            }

            const session = this.mockEndSessions.get(sessionId) || {
                id: sessionId,
                userId: 1,
                startTime: new Date(Date.now() - 3600000), // 1 Stunde zurück
                endTime: new Date(),
                active: false
            };

            this.stats.successfulQueries++;
            this._log(`Session beendet: ID ${sessionId}`);

            return session;

        } catch (error) {
            this.stats.failedQueries++;
            this._log(`Fehler beim Beenden der Session: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * QR-Scan speichern
     */
    async saveQrScan(sessionId, qrData) {
        this._checkConnection();
        this._checkTimeout();

        this.stats.queries++;
        this.stats.lastQueryTime = new Date();

        try {
            this._log(`Speichere QR-Scan für Session ${sessionId}: ${qrData}`);

            // Simuliere Query-Zeit
            await this._delay(40);

            // Simuliere Query-Fehler
            if (this.simulateErrors && Math.random() < this.errorRate) {
                throw new Error('QR scan save failed');
            }

            const scanId = Math.floor(Math.random() * 100000) + 10000;
            const scan = {
                id: scanId,
                sessionId: sessionId,
                qrData: qrData,
                scanTime: new Date(),
                processed: false
            };

            this.mockQrScans.set(scanId, scan);

            this.stats.successfulQueries++;
            this._log(`QR-Scan gespeichert: ID ${scanId}`);

            return scan;

        } catch (error) {
            this.stats.failedQueries++;
            this._log(`Fehler beim Speichern des QR-Scans: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Aktive Sessions abrufen
     */
    async getActiveSessions() {
        this._checkConnection();
        this._checkTimeout();

        this.stats.queries++;
        this.stats.lastQueryTime = new Date();

        try {
            this._log('Lade aktive Sessions...');

            // Simuliere Query-Zeit
            await this._delay(80);

            const activeSessions = Array.from(this.mockSessions.values())
                .filter(session => session.active);

            this.stats.successfulQueries++;
            this._log(`${activeSessions.length} aktive Sessions gefunden`);

            return activeSessions;

        } catch (error) {
            this.stats.failedQueries++;
            this._log(`Fehler beim Laden der Sessions: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Test-Hilfsfunktionen
     */

    // Mock-Benutzer setzen
    setMockUser(epc, user) {
        this.mockUsers.set(epc, user);
        this._log(`Mock-Benutzer gesetzt: ${epc} -> ${user.name}`);
    }

    // Mock-Session setzen
    setMockSession(userId, session) {
        this.mockSessions.set(userId, session);
        this._log(`Mock-Session gesetzt: User ${userId} -> Session ${session.id}`);
    }

    // Mock-Session-Ende setzen
    setMockEndSession(sessionId, session) {
        this.mockEndSessions.set(sessionId, session);
        this._log(`Mock-Session-Ende gesetzt: Session ${sessionId}`);
    }

    // Alle Mock-Daten löschen
    clearMockData() {
        this.mockUsers.clear();
        this.mockSessions.clear();
        this.mockEndSessions.clear();
        this.mockQrScans.clear();
        this._log('Mock-Daten gelöscht');
    }

    // Verbindungsunterbrechung simulieren
    async simulateDisconnection() {
        this._log('Simuliere Verbindungsunterbrechung...');
        this.isConnected = false;
        this.connectionState = 'error';
        this.emit('disconnected');
    }

    // Verbindung wiederherstellen
    async reconnect() {
        this._log('Stelle Verbindung wieder her...');
        await this.connect();
    }

    // Timeout simulieren
    simulateTimeout(enable = true) {
        this.isTimeout = enable;
        this._log(`Timeout-Simulation: ${enable ? 'AN' : 'AUS'}`);
    }

    // Fehler-Simulation aktivieren/deaktivieren
    enableErrorSimulation(errorRate = 0.1) {
        this.simulateErrors = true;
        this.errorRate = errorRate;
        this._log(`Fehler-Simulation aktiviert: ${errorRate * 100}%`);
    }

    disableErrorSimulation() {
        this.simulateErrors = false;
        this.errorRate = 0.01;
        this._log('Fehler-Simulation deaktiviert');
    }

    // Statistiken zurücksetzen
    resetStats() {
        this.stats = {
            queries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            connectionAttempts: this.stats.connectionAttempts,
            lastQueryTime: null
        };
        this._log('Statistiken zurückgesetzt');
    }

    // Status-Informationen
    getStatus() {
        return {
            isConnected: this.isConnected,
            connectionState: this.connectionState,
            isTimeout: this.isTimeout,
            simulateErrors: this.simulateErrors,
            errorRate: this.errorRate,
            stats: { ...this.stats },
            config: { ...this.config },
            mockDataCounts: {
                users: this.mockUsers.size,
                sessions: this.mockSessions.size,
                endSessions: this.mockEndSessions.size,
                qrScans: this.mockQrScans.size
            }
        };
    }

    // Konfiguration aktualisieren
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this._log('Konfiguration aktualisiert');
    }

    /**
     * Private Hilfsfunktionen
     */

    // Verbindung prüfen
    _checkConnection() {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }
    }

    // Timeout prüfen
    _checkTimeout() {
        if (this.isTimeout) {
            throw new Error('Database operation timed out');
        }
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
        const prefix = `[${timestamp}] [DB-Mock] [${level.toUpperCase()}]`;

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

module.exports = MockDBClient;