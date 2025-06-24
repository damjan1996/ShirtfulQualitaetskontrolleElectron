// tests/mocks/db-client.mock.js
/**
 * Mock Database Client für Tests
 * Simuliert alle Datenbankoperationen für RFID QR Wareneingang
 */

const EventEmitter = require('events');

class MockDatabaseClient extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            server: config.server || 'localhost',
            database: config.database || 'RdScanner_Test',
            user: config.user || 'test_user',
            password: config.password || 'test_password',
            port: config.port || 1433,
            ...config
        };

        this.isConnected = false;
        this.connectionPool = null;
        this.connectionStartTime = null;
        this.queryCount = 0;
        this.transactionCount = 0;

        // Mock-Datenstrukturen
        this.mockData = {
            users: [
                {
                    ID: 1,
                    BenutzerName: 'Test User 1',
                    EPC: 1392525588, // 53004114 hex
                    xStatus: 0,
                    Email: 'test1@example.com',
                    Rolle: 'Mitarbeiter',
                    ErstelltAm: new Date('2024-01-01'),
                    AktiviertAm: new Date('2024-01-01')
                },
                {
                    ID: 2,
                    BenutzerName: 'Test User 2',
                    EPC: 2271560481, // 87654321 hex
                    xStatus: 0,
                    Email: 'test2@example.com',
                    Rolle: 'Mitarbeiter',
                    ErstelltAm: new Date('2024-01-02'),
                    AktiviertAm: new Date('2024-01-02')
                },
                {
                    ID: 3,
                    BenutzerName: 'Inactive User',
                    EPC: 3735928559, // DEADBEEF hex
                    xStatus: 1, // Inaktiv
                    Email: 'inactive@example.com',
                    Rolle: 'Mitarbeiter',
                    ErstelltAm: new Date('2024-01-03'),
                    AktiviertAm: null
                }
            ],
            sessions: [],
            qrScans: [],
            scannTypes: [
                { ID: 1, Name: 'Wareneingang', Beschreibung: 'Eingehende Pakete' },
                { ID: 2, Name: 'Qualitätskontrolle', Beschreibung: 'QK-Prüfung' },
                { ID: 3, Name: 'Versand', Beschreibung: 'Ausgehende Pakete' }
            ]
        };

        // Tracking für Duplicate-Detection
        this.duplicateCache = new Map();
        this.duplicateCooldown = 30000; // 30 Sekunden

        // Performance-Tracking
        this.performanceStats = {
            queries: {
                total: 0,
                successful: 0,
                failed: 0,
                avgDuration: 0
            },
            connections: {
                total: 0,
                active: 0,
                failed: 0
            }
        };

        // Pending operations für realistische Async-Simulation
        this.pendingOperations = new Set();
    }

    // ===== CONNECTION MANAGEMENT =====

    async connect() {
        if (this.isConnected) {
            return true;
        }

        try {
            // Simuliere Verbindungsaufbau
            await this._simulateNetworkDelay(100, 300);

            this.isConnected = true;
            this.connectionStartTime = new Date();
            this.performanceStats.connections.total++;
            this.performanceStats.connections.active++;

            this.emit('connect');
            return true;
        } catch (error) {
            this.performanceStats.connections.failed++;
            this.emit('error', error);
            throw new Error(`Database connection failed: ${error.message}`);
        }
    }

    async close() {
        if (!this.isConnected) {
            return true;
        }

        try {
            // Warte auf ausstehende Operationen
            await this._waitForPendingOperations();

            this.isConnected = false;
            this.connectionStartTime = null;
            this.performanceStats.connections.active--;

            this.emit('disconnect');
            return true;
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    async testConnection() {
        if (!this.isConnected) {
            throw new Error('Not connected to database');
        }

        await this._simulateNetworkDelay(10, 50);
        return {
            success: true,
            server: this.config.server,
            database: this.config.database,
            connectionTime: Date.now() - this.connectionStartTime.getTime(),
            timestamp: new Date().toISOString()
        };
    }

    // ===== USER MANAGEMENT =====

    async getUserByEPC(tagId) {
        return await this._executeQuery(async () => {
            if (!tagId || typeof tagId !== 'string') {
                return null;
            }

            // Konvertiere hex string zu decimal
            let epcDecimal;
            try {
                epcDecimal = parseInt(tagId, 16);
            } catch (error) {
                return null;
            }

            const user = this.mockData.users.find(u =>
                u.EPC === epcDecimal && u.xStatus === 0
            );

            return user ? { ...user } : null;
        }, 'getUserByEPC');
    }

    async getUserById(userId) {
        return await this._executeQuery(async () => {
            const user = this.mockData.users.find(u =>
                u.ID === userId && u.xStatus === 0
            );
            return user ? { ...user } : null;
        }, 'getUserById');
    }

    async getAllActiveUsers() {
        return await this._executeQuery(async () => {
            return this.mockData.users
                .filter(u => u.xStatus === 0)
                .map(u => ({ ...u }));
        }, 'getAllActiveUsers');
    }

    async createUser(userData) {
        return await this._executeQuery(async () => {
            const newUser = {
                ID: this.mockData.users.length + 1,
                BenutzerName: userData.BenutzerName,
                EPC: userData.EPC,
                Email: userData.Email || null,
                Rolle: userData.Rolle || 'Mitarbeiter',
                xStatus: 0,
                ErstelltAm: new Date(),
                AktiviertAm: new Date()
            };

            this.mockData.users.push(newUser);
            this.emit('user-created', newUser);

            return { ...newUser };
        }, 'createUser');
    }

    async updateUser(userId, userData) {
        return await this._executeQuery(async () => {
            const userIndex = this.mockData.users.findIndex(u => u.ID === userId);
            if (userIndex === -1) {
                throw new Error(`User with ID ${userId} not found`);
            }

            const user = this.mockData.users[userIndex];
            Object.assign(user, userData);

            this.emit('user-updated', user);
            return { ...user };
        }, 'updateUser');
    }

    async deactivateUser(userId) {
        return await this._executeQuery(async () => {
            const user = this.mockData.users.find(u => u.ID === userId);
            if (!user) {
                throw new Error(`User with ID ${userId} not found`);
            }

            user.xStatus = 1;
            this.emit('user-deactivated', user);

            return { ...user };
        }, 'deactivateUser');
    }

    // ===== SESSION MANAGEMENT =====

    async createSession(userId) {
        return await this._executeQuery(async () => {
            // Schließe alle offenen Sessions für diesen User
            await this._closeOpenSessions(userId);

            const newSession = {
                ID: this.mockData.sessions.length + 1,
                UserID: userId,
                StartTS: new Date(),
                EndTS: null,
                Active: 1,
                ErstelltAm: new Date()
            };

            this.mockData.sessions.push(newSession);
            this.emit('session-created', newSession);

            return { ...newSession };
        }, 'createSession');
    }

    async endSession(sessionId) {
        return await this._executeQuery(async () => {
            const session = this.mockData.sessions.find(s => s.ID === sessionId);
            if (!session) {
                throw new Error(`Session with ID ${sessionId} not found`);
            }

            if (session.Active === 0) {
                throw new Error(`Session ${sessionId} is already closed`);
            }

            session.EndTS = new Date();
            session.Active = 0;

            this.emit('session-ended', session);
            return { ...session };
        }, 'endSession');
    }

    async getActiveSession(userId) {
        return await this._executeQuery(async () => {
            const session = this.mockData.sessions.find(s =>
                s.UserID === userId && s.Active === 1
            );
            return session ? { ...session } : null;
        }, 'getActiveSession');
    }

    async getAllActiveSessions() {
        return await this._executeQuery(async () => {
            return this.mockData.sessions
                .filter(s => s.Active === 1)
                .map(s => ({ ...s }));
        }, 'getAllActiveSessions');
    }

    async getSessionsByUser(userId, limit = 10) {
        return await this._executeQuery(async () => {
            return this.mockData.sessions
                .filter(s => s.UserID === userId)
                .sort((a, b) => new Date(b.StartTS) - new Date(a.StartTS))
                .slice(0, limit)
                .map(s => ({ ...s }));
        }, 'getSessionsByUser');
    }

    async getSessionDuration(sessionId) {
        return await this._executeQuery(async () => {
            const session = this.mockData.sessions.find(s => s.ID === sessionId);
            if (!session) {
                return null;
            }

            const startTime = new Date(session.StartTS);
            const endTime = session.EndTS ? new Date(session.EndTS) : new Date();
            const duration = endTime - startTime;

            return {
                sessionId: sessionId,
                startTime: startTime,
                endTime: session.EndTS ? endTime : null,
                duration: duration,
                isActive: session.Active === 1,
                formattedDuration: this._formatDuration(duration)
            };
        }, 'getSessionDuration');
    }

    // ===== QR SCAN MANAGEMENT =====

    async saveQRScan(sessionId, rawPayload, scannTypeId = 1) {
        return await this._executeQuery(async () => {
            // Duplicate-Check
            const duplicateKey = `${sessionId}_${rawPayload}`;
            const now = Date.now();

            if (this.duplicateCache.has(duplicateKey)) {
                const lastScan = this.duplicateCache.get(duplicateKey);
                if (now - lastScan < this.duplicateCooldown) {
                    throw new Error(`Duplicate scan detected. Cooldown: ${Math.ceil((this.duplicateCooldown - (now - lastScan)) / 1000)}s`);
                }
            }

            // Session-Validierung
            const session = this.mockData.sessions.find(s =>
                s.ID === sessionId && s.Active === 1
            );
            if (!session) {
                throw new Error(`No active session found with ID ${sessionId}`);
            }

            // JSON-Parsing für berechnete Spalte
            let parsedPayload = null;
            try {
                parsedPayload = JSON.parse(rawPayload);
            } catch (error) {
                // Kein gültiges JSON, bleibt null
            }

            const newScan = {
                ID: this.mockData.qrScans.length + 1,
                SessionID: sessionId,
                RawPayload: rawPayload,
                PayloadAsJSON: parsedPayload,
                ScannTS: new Date(),
                ScannTypID: scannTypeId,
                ErstelltAm: new Date()
            };

            this.mockData.qrScans.push(newScan);
            this.duplicateCache.set(duplicateKey, now);

            this.emit('qr-scan-saved', newScan);

            return {
                success: true,
                status: 'saved',
                message: 'QR-Code erfolgreich gespeichert',
                data: { ...newScan },
                timestamp: new Date().toISOString()
            };
        }, 'saveQRScan');
    }

    async getQRScansBySession(sessionId, limit = 50) {
        return await this._executeQuery(async () => {
            return this.mockData.qrScans
                .filter(s => s.SessionID === sessionId)
                .sort((a, b) => new Date(b.ScannTS) - new Date(a.ScannTS))
                .slice(0, limit)
                .map(s => ({ ...s }));
        }, 'getQRScansBySession');
    }

    async getRecentQRScans(limit = 20) {
        return await this._executeQuery(async () => {
            return this.mockData.qrScans
                .sort((a, b) => new Date(b.ScannTS) - new Date(a.ScannTS))
                .slice(0, limit)
                .map(s => ({ ...s }));
        }, 'getRecentQRScans');
    }

    async getQRScanById(scanId) {
        return await this._executeQuery(async () => {
            const scan = this.mockData.qrScans.find(s => s.ID === scanId);
            return scan ? { ...scan } : null;
        }, 'getQRScanById');
    }

    async deleteQRScan(scanId) {
        return await this._executeQuery(async () => {
            const scanIndex = this.mockData.qrScans.findIndex(s => s.ID === scanId);
            if (scanIndex === -1) {
                throw new Error(`QR scan with ID ${scanId} not found`);
            }

            const deletedScan = this.mockData.qrScans.splice(scanIndex, 1)[0];
            this.emit('qr-scan-deleted', deletedScan);

            return { ...deletedScan };
        }, 'deleteQRScan');
    }

    // ===== STATISTICS & REPORTING =====

    async getSessionStats(sessionId) {
        return await this._executeQuery(async () => {
            const session = this.mockData.sessions.find(s => s.ID === sessionId);
            if (!session) {
                return null;
            }

            const scans = this.mockData.qrScans.filter(s => s.SessionID === sessionId);
            const duration = this.getSessionDuration(sessionId);

            return {
                sessionId: sessionId,
                userId: session.UserID,
                startTime: session.StartTS,
                endTime: session.EndTS,
                isActive: session.Active === 1,
                totalScans: scans.length,
                scanRate: duration ? (scans.length / (duration / 1000 / 60)) : 0, // Scans pro Minute
                firstScan: scans.length > 0 ? Math.min(...scans.map(s => new Date(s.ScannTS))) : null,
                lastScan: scans.length > 0 ? Math.max(...scans.map(s => new Date(s.ScannTS))) : null
            };
        }, 'getSessionStats');
    }

    async getUserStats(userId, days = 30) {
        return await this._executeQuery(async () => {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            const userSessions = this.mockData.sessions.filter(s =>
                s.UserID === userId && new Date(s.StartTS) >= cutoffDate
            );

            const totalScans = this.mockData.qrScans.filter(scan =>
                userSessions.some(session => session.ID === scan.SessionID)
            ).length;

            const totalWorkTime = userSessions.reduce((total, session) => {
                if (!session.EndTS) return total;
                return total + (new Date(session.EndTS) - new Date(session.StartTS));
            }, 0);

            return {
                userId: userId,
                periodDays: days,
                totalSessions: userSessions.length,
                activeSessions: userSessions.filter(s => s.Active === 1).length,
                totalScans: totalScans,
                totalWorkTime: totalWorkTime,
                avgSessionDuration: userSessions.length > 0 ? totalWorkTime / userSessions.length : 0,
                avgScansPerSession: userSessions.length > 0 ? totalScans / userSessions.length : 0,
                formattedWorkTime: this._formatDuration(totalWorkTime)
            };
        }, 'getUserStats');
    }

    async getDailyStats(date = new Date()) {
        return await this._executeQuery(async () => {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);

            const daySessions = this.mockData.sessions.filter(s => {
                const sessionDate = new Date(s.StartTS);
                return sessionDate >= startOfDay && sessionDate <= endOfDay;
            });

            const dayScans = this.mockData.qrScans.filter(scan => {
                const scanDate = new Date(scan.ScannTS);
                return scanDate >= startOfDay && scanDate <= endOfDay;
            });

            const uniqueUsers = new Set(daySessions.map(s => s.UserID)).size;

            return {
                date: date.toDateString(),
                totalUsers: uniqueUsers,
                totalSessions: daySessions.length,
                activeSessions: daySessions.filter(s => s.Active === 1).length,
                totalScans: dayScans.length,
                avgScansPerUser: uniqueUsers > 0 ? dayScans.length / uniqueUsers : 0,
                hourlyDistribution: this._getHourlyDistribution(dayScans, startOfDay, endOfDay)
            };
        }, 'getDailyStats');
    }

    async healthCheck() {
        return await this._executeQuery(async () => {
            const activeUsers = this.mockData.users.filter(u => u.xStatus === 0).length;
            const activeSessions = this.mockData.sessions.filter(s => s.Active === 1).length;
            const totalScans = this.mockData.qrScans.length;

            return {
                connected: this.isConnected,
                connectionTime: this.connectionStartTime ? Date.now() - this.connectionStartTime.getTime() : 0,
                server: {
                    name: this.config.server,
                    database: this.config.database,
                    currentUser: this.config.user,
                    serverTime: new Date().toISOString()
                },
                stats: {
                    activeUsers: activeUsers,
                    totalSessions: this.mockData.sessions.length,
                    activeSessions: activeSessions,
                    totalValidScans: totalScans,
                    recentErrorCount: this.performanceStats.queries.failed
                },
                performance: {
                    ...this.performanceStats,
                    uptime: this.connectionStartTime ? Date.now() - this.connectionStartTime.getTime() : 0
                },
                timestamp: new Date().toISOString()
            };
        }, 'healthCheck');
    }

    // ===== PRIVATE HELPER METHODS =====

    async _executeQuery(queryFunction, operationName = 'unknown') {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        const operationId = `${operationName}_${Date.now()}_${Math.random()}`;
        this.pendingOperations.add(operationId);

        const startTime = Date.now();
        this.queryCount++;
        this.performanceStats.queries.total++;

        try {
            // Simuliere Netzwerk-Latenz
            await this._simulateNetworkDelay(5, 100);

            const result = await queryFunction();

            const duration = Date.now() - startTime;
            this.performanceStats.queries.successful++;
            this._updateAvgDuration(duration);

            this.emit('query-executed', {
                operation: operationName,
                duration: duration,
                success: true
            });

            return result;
        } catch (error) {
            const duration = Date.now() - startTime;
            this.performanceStats.queries.failed++;
            this._updateAvgDuration(duration);

            this.emit('query-error', {
                operation: operationName,
                duration: duration,
                error: error.message
            });

            throw error;
        } finally {
            this.pendingOperations.delete(operationId);
        }
    }

    async _simulateNetworkDelay(minMs = 10, maxMs = 100) {
        const delay = Math.random() * (maxMs - minMs) + minMs;
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    async _waitForPendingOperations(timeoutMs = 5000) {
        const startTime = Date.now();

        while (this.pendingOperations.size > 0) {
            if (Date.now() - startTime > timeoutMs) {
                throw new Error('Timeout waiting for pending operations');
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    async _closeOpenSessions(userId) {
        const openSessions = this.mockData.sessions.filter(s =>
            s.UserID === userId && s.Active === 1
        );

        for (const session of openSessions) {
            session.EndTS = new Date();
            session.Active = 0;
            this.emit('session-auto-closed', session);
        }
    }

    _updateAvgDuration(duration) {
        const totalQueries = this.performanceStats.queries.total;
        const currentAvg = this.performanceStats.queries.avgDuration;
        this.performanceStats.queries.avgDuration =
            ((currentAvg * (totalQueries - 1)) + duration) / totalQueries;
    }

    _formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    _getHourlyDistribution(scans, startOfDay, endOfDay) {
        const hourlyData = Array(24).fill(0);

        scans.forEach(scan => {
            const scanDate = new Date(scan.ScannTS);
            const hour = scanDate.getHours();
            hourlyData[hour]++;
        });

        return hourlyData.map((count, hour) => ({
            hour: hour,
            count: count,
            timeLabel: `${hour.toString().padStart(2, '0')}:00`
        }));
    }

    // ===== TEST HELPER METHODS =====

    reset() {
        this.mockData = {
            users: [
                {
                    ID: 1,
                    BenutzerName: 'Test User 1',
                    EPC: 1392525588, // 53004114 hex
                    xStatus: 0,
                    Email: 'test1@example.com',
                    Rolle: 'Mitarbeiter',
                    ErstelltAm: new Date('2024-01-01'),
                    AktiviertAm: new Date('2024-01-01')
                },
                {
                    ID: 2,
                    BenutzerName: 'Test User 2',
                    EPC: 2271560481, // 87654321 hex
                    xStatus: 0,
                    Email: 'test2@example.com',
                    Rolle: 'Mitarbeiter',
                    ErstelltAm: new Date('2024-01-02'),
                    AktiviertAm: new Date('2024-01-02')
                }
            ],
            sessions: [],
            qrScans: [],
            scannTypes: [
                { ID: 1, Name: 'Wareneingang', Beschreibung: 'Eingehende Pakete' },
                { ID: 2, Name: 'Qualitätskontrolle', Beschreibung: 'QK-Prüfung' },
                { ID: 3, Name: 'Versand', Beschreibung: 'Ausgehende Pakete' }
            ]
        };

        this.duplicateCache.clear();
        this.pendingOperations.clear();
        this.queryCount = 0;
        this.transactionCount = 0;
        this.performanceStats = {
            queries: {
                total: 0,
                successful: 0,
                failed: 0,
                avgDuration: 0
            },
            connections: {
                total: 0,
                active: this.isConnected ? 1 : 0,
                failed: 0
            }
        };
    }

    addTestUser(userData) {
        const newUser = {
            ID: this.mockData.users.length + 1,
            BenutzerName: userData.BenutzerName || 'Test User',
            EPC: userData.EPC || Math.floor(Math.random() * 4294967295),
            xStatus: userData.xStatus || 0,
            Email: userData.Email || 'test@example.com',
            Rolle: userData.Rolle || 'Mitarbeiter',
            ErstelltAm: new Date(),
            AktiviertAm: userData.xStatus === 0 ? new Date() : null
        };

        this.mockData.users.push(newUser);
        return newUser;
    }

    setNetworkDelay(minMs, maxMs) {
        this._networkDelayMin = minMs;
        this._networkDelayMax = maxMs;
    }

    simulateConnectionError() {
        this.isConnected = false;
        this.emit('connection-lost');
    }

    getPerformanceStats() {
        return { ...this.performanceStats };
    }

    getMockData() {
        return JSON.parse(JSON.stringify(this.mockData));
    }
}

module.exports = MockDatabaseClient;