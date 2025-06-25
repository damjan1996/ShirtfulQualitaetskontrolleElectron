// tests/mocks/db-client.mock.js
/**
 * Mock Database Client für Tests - Vollständig korrigiert
 * Simuliert Microsoft SQL Server Database ohne echte DB-Verbindung
 */

const { EventEmitter } = require('events');

class MockDatabaseClient extends EventEmitter {
    constructor() {
        super();

        this.isConnected = false;
        this.connectionState = 'disconnected';

        // Mock-Daten initialisieren
        this.mockData = {
            users: [
                {
                    BenID: 1,
                    Vorname: 'Max',
                    Nachname: 'Mustermann',
                    Email: 'max.mustermann@example.com',
                    EPC: 53004114, // Hex: 329C172
                    Active: 1
                },
                {
                    BenID: 2,
                    Vorname: 'Anna',
                    Nachname: 'Schmidt',
                    Email: 'anna.schmidt@example.com',
                    EPC: 53004115, // Hex: 329C173
                    Active: 1
                },
                {
                    BenID: 3,
                    Vorname: 'Test',
                    Nachname: 'User',
                    Email: 'test.user@example.com',
                    EPC: 53004116, // Hex: 329C174
                    Active: 1
                }
            ],
            sessions: [],
            qrScans: [],
            scannTypes: [
                { ID: 1, Name: 'Wareneingang', Active: 1 },
                { ID: 2, Name: 'Qualitätskontrolle', Active: 1 },
                { ID: 3, Name: 'Versand', Active: 1 }
            ]
        };

        // Statistiken
        this.stats = {
            queries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            connections: 0,
            lastQueryTime: null
        };

        // QR-Scan Duplikat-Kontrolle
        this.qrCooldownMs = 30000; // 30 Sekunden Standard-Cooldown
        this.lastScans = new Map(); // tagId -> timestamp

        // Test-Hilfsmethoden
        this.mockUserMap = new Map(); // Für setMockUser
        this.simulateErrors = false;
        this.errorRate = 0;
    }

    // === Verbindungsmanagement ===

    async connect() {
        if (this.isConnected) {
            return;
        }

        try {
            // Simuliere Verbindungsaufbau
            await this._delay(50);

            this.isConnected = true;
            this.connectionState = 'connected';
            this.stats.connections++;

            this.emit('connected');
            return this;

        } catch (error) {
            this.connectionState = 'error';
            this.emit('error', error);
            throw error;
        }
    }

    async close() {
        if (!this.isConnected) {
            return;
        }

        try {
            await this._delay(25);

            this.isConnected = false;
            this.connectionState = 'disconnected';

            this.emit('disconnected');

        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    // === Hilfsmethoden ===

    _checkConnection() {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }
    }

    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _log(message, level = 'info') {
        if (process.env.NODE_ENV !== 'test' || process.env.DEBUG_DB_MOCK) {
            console.log(`[DB-Mock] [${level.toUpperCase()}] ${message}`);
        }
    }

    // === Query-Simulation ===

    async query(sql, params = []) {
        this._checkConnection();

        this.stats.queries++;
        this.stats.lastQueryTime = new Date();

        // Simuliere Query-Zeit
        await this._delay(10);

        // Simuliere Fehler wenn aktiviert
        if (this.simulateErrors && Math.random() < this.errorRate) {
            this.stats.failedQueries++;
            throw new Error('Simulated database error');
        }

        const normalizedSql = sql.toLowerCase().replace(/\s+/g, ' ').trim();
        this.stats.successfulQueries++;

        return this._executeQuery(normalizedSql, params);
    }

    _executeQuery(normalizedSql, params) {
        // User queries
        if (normalizedSql.includes('select') && normalizedSql.includes('scannbenutzer')) {
            if (normalizedSql.includes('where epc')) {
                const epc = params[0];
                const user = this.mockData.users.find(u => u.EPC === epc && u.Active === 1);
                return { recordset: user ? [user] : [], rowsAffected: [user ? 1 : 0] };
            }
            if (normalizedSql.includes('where benid')) {
                const benId = params[0];
                const user = this.mockData.users.find(u => u.BenID === benId && u.Active === 1);
                return { recordset: user ? [user] : [], rowsAffected: [user ? 1 : 0] };
            }
            return { recordset: this.mockData.users.filter(u => u.Active === 1), rowsAffected: [this.mockData.users.length] };
        }

        // Session queries
        if (normalizedSql.includes('sessions')) {
            if (normalizedSql.includes('insert')) {
                // Erst vorhandene aktive Sessions schließen
                const userId = params[0];
                this.mockData.sessions.forEach(session => {
                    if (session.BenID === userId && session.Active === 1) {
                        session.Active = 0;
                        session.EndTS = new Date().toISOString();
                    }
                });

                // Neue Session erstellen
                const newSession = {
                    ID: Math.floor(Math.random() * 10000) + 1000,
                    BenID: userId,
                    StartTS: new Date().toISOString(),
                    EndTS: null,
                    Active: 1
                };
                this.mockData.sessions.push(newSession);
                return { recordset: [{ ID: newSession.ID }], rowsAffected: [1] };
            }

            if (normalizedSql.includes('update') && normalizedSql.includes('endts')) {
                const sessionId = params[1]; // params[0] ist EndTS
                const session = this.mockData.sessions.find(s => s.ID === sessionId);
                if (session) {
                    session.EndTS = new Date().toISOString();
                    session.Active = 0;
                    return { recordset: [], rowsAffected: [1] };
                }
                return { recordset: [], rowsAffected: [0] };
            }

            if (normalizedSql.includes('select') && normalizedSql.includes('active = 1')) {
                const userId = params[0];
                const activeSession = this.mockData.sessions.find(s => s.BenID === userId && s.Active === 1);
                return { recordset: activeSession ? [activeSession] : [], rowsAffected: [activeSession ? 1 : 0] };
            }

            if (normalizedSql.includes('select')) {
                const userId = params[0];
                const sessions = this.mockData.sessions.filter(s => s.BenID === userId);
                return { recordset: sessions, rowsAffected: [sessions.length] };
            }
        }

        // QR Scan queries
        if (normalizedSql.includes('qrscans')) {
            if (normalizedSql.includes('insert')) {
                const [sessionId, rawPayload, scannTypeId] = params;
                const newScan = {
                    ID: Math.floor(Math.random() * 10000) + 1000,
                    SessionID: sessionId,
                    RawPayload: rawPayload,
                    ScannTyp: scannTypeId || 1,
                    ScanTS: new Date().toISOString(),
                    JsonPayload: this._tryParseJson(rawPayload)
                };
                this.mockData.qrScans.push(newScan);
                return { recordset: [{ ID: newScan.ID }], rowsAffected: [1] };
            }

            if (normalizedSql.includes('select')) {
                if (normalizedSql.includes('sessionid')) {
                    const sessionId = params[0];
                    let scans = this.mockData.qrScans.filter(s => s.SessionID === sessionId);

                    // Sortierung (neueste zuerst)
                    scans.sort((a, b) => new Date(b.ScanTS) - new Date(a.ScanTS));

                    // Limit anwenden falls vorhanden
                    if (params.length > 1 && params[1]) {
                        scans = scans.slice(0, params[1]);
                    }

                    return { recordset: scans, rowsAffected: [scans.length] };
                }
                return { recordset: this.mockData.qrScans, rowsAffected: [this.mockData.qrScans.length] };
            }

            if (normalizedSql.includes('delete')) {
                const scanId = params[0];
                const index = this.mockData.qrScans.findIndex(s => s.ID === scanId);
                if (index !== -1) {
                    this.mockData.qrScans.splice(index, 1);
                    return { recordset: [], rowsAffected: [1] };
                }
                return { recordset: [], rowsAffected: [0] };
            }
        }

        // Count queries
        if (normalizedSql.includes('count')) {
            if (normalizedSql.includes('scannbenutzer')) {
                return { recordset: [{ UserCount: this.mockData.users.length }], rowsAffected: [1] };
            }
            if (normalizedSql.includes('sessions')) {
                const activeSessions = this.mockData.sessions.filter(s => s.Active === 1);
                return { recordset: [{ SessionCount: activeSessions.length }], rowsAffected: [1] };
            }
        }

        // Default fallback
        return { recordset: [], rowsAffected: [0] };
    }

    _tryParseJson(payload) {
        try {
            return JSON.parse(payload);
        } catch {
            return null;
        }
    }

    // === Benutzer-Management ===

    async getUserByRFID(tagId) {
        const epc = parseInt(tagId, 16);
        const result = await this.query(
            'SELECT BenID, Vorname, Nachname, Email, EPC FROM dbo.ScannBenutzer WHERE EPC = ? AND Active = 1',
            [epc]
        );

        return result.recordset[0] || null;
    }

    async getUserByID(userId) {
        const result = await this.query(
            'SELECT BenID, Vorname, Nachname, Email, EPC FROM dbo.ScannBenutzer WHERE BenID = ? AND Active = 1',
            [userId]
        );

        return result.recordset[0] || null;
    }

    // Test-Hilfsmethode: Mock-User hinzufügen
    setMockUser(tagId, user) {
        const epc = parseInt(tagId, 16);
        user.EPC = epc;
        this.mockUserMap.set(tagId, user);

        // Auch in mockData hinzufügen falls nicht vorhanden
        const existingUser = this.mockData.users.find(u => u.EPC === epc);
        if (!existingUser) {
            this.mockData.users.push(user);
        }
    }

    // Test-Hilfsmethode: Mock-User abrufen
    getMockUser(tagId) {
        const epc = parseInt(tagId, 16);
        return this.mockData.users.find(u => u.EPC === epc) || this.mockUserMap.get(tagId);
    }

    // === Session-Management ===

    async createSession(userId) {
        const result = await this.query(
            'INSERT INTO dbo.Sessions (BenID, StartTS, Active) OUTPUT INSERTED.ID VALUES (?, SYSDATETIME(), 1)',
            [userId]
        );

        const sessionId = result.recordset[0].ID;
        const newSession = this.mockData.sessions.find(s => s.ID === sessionId);
        return newSession;
    }

    async endSession(sessionId) {
        const result = await this.query(
            'UPDATE dbo.Sessions SET EndTS = SYSDATETIME(), Active = 0 WHERE ID = ? AND Active = 1',
            [new Date(), sessionId]
        );

        return result.rowsAffected[0] > 0;
    }

    async getActiveSession(userId) {
        const result = await this.query(
            'SELECT * FROM dbo.Sessions WHERE BenID = ? AND Active = 1',
            [userId]
        );

        return result.recordset[0] || null;
    }

    async getSessionsByUser(userId) {
        const result = await this.query(
            'SELECT * FROM dbo.Sessions WHERE BenID = ? ORDER BY StartTS DESC',
            [userId]
        );

        return result.recordset;
    }

    // === QR-Scan Management ===

    async saveQRScan(sessionId, rawPayload, scannTypeId = 1) {
        // Session-Validierung
        const session = this.mockData.sessions.find(s => s.ID === sessionId && s.Active === 1);
        if (!session) {
            throw new Error('No active session found');
        }

        const now = Date.now();

        // Duplikat-Kontrolle
        const lastScanKey = `${sessionId}_${rawPayload}`;
        const lastScanTime = this.lastScans.get(lastScanKey);

        if (lastScanTime && (now - lastScanTime) < this.qrCooldownMs) {
            return {
                success: false,
                reason: 'duplicate',
                cooldownRemaining: this.qrCooldownMs - (now - lastScanTime),
                scanId: null
            };
        }

        // Scan speichern
        const result = await this.query(
            'INSERT INTO dbo.QrScans (SessionID, RawPayload, ScannTyp, ScanTS) OUTPUT INSERTED.ID VALUES (?, ?, ?, SYSDATETIME())',
            [sessionId, rawPayload, scannTypeId]
        );

        const scanId = result.recordset[0].ID;
        this.lastScans.set(lastScanKey, now);

        return {
            success: true,
            scanId: scanId,
            timestamp: new Date().toISOString(),
            payload: rawPayload
        };
    }

    async getQRScansBySession(sessionId, limit = 10) {
        const result = await this.query(
            'SELECT * FROM dbo.QrScans WHERE SessionID = ? ORDER BY ScanTS DESC',
            [sessionId, limit]
        );

        return result.recordset;
    }

    async deleteQRScan(scanId) {
        const result = await this.query(
            'DELETE FROM dbo.QrScans WHERE ID = ?',
            [scanId]
        );

        return result.rowsAffected[0] > 0;
    }

    // === Test-Hilfsmethoden ===

    clearMockData() {
        this.mockData.sessions = [];
        this.mockData.qrScans = [];
        this.lastScans.clear();
        this.mockUserMap.clear();

        // Benutzer-Stammdaten behalten, aber Sessions/Scans löschen
        this.stats.queries = 0;
        this.stats.successfulQueries = 0;
        this.stats.failedQueries = 0;
    }

    resetStatistics() {
        this.stats = {
            queries: 0,
            successfulQueries: 0,
            failedQueries: 0,
            connections: this.stats.connections,
            lastQueryTime: null
        };
    }

    setQRCooldown(cooldownMs) {
        this.qrCooldownMs = cooldownMs;
    }

    enableErrorSimulation(errorRate = 0.1) {
        this.simulateErrors = true;
        this.errorRate = errorRate;
    }

    disableErrorSimulation() {
        this.simulateErrors = false;
        this.errorRate = 0;
    }

    getStatistics() {
        return {
            ...this.stats,
            connectionState: this.connectionState,
            mockDataSize: {
                users: this.mockData.users.length,
                sessions: this.mockData.sessions.length,
                qrScans: this.mockData.qrScans.length
            }
        };
    }

    // === Health Check ===

    async healthCheck() {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        // Simuliere Health Check Query
        await this.query('SELECT 1 as HealthCheck');

        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            connectionState: this.connectionState,
            statistics: this.getStatistics()
        };
    }
}

module.exports = MockDatabaseClient;