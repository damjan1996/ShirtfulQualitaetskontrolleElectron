// tests/mocks/db-client.mock.js
/**
 * Mock Database Client für Tests
 * Simuliert vollständige MS SQL Server Funktionalität
 * Korrigiert für alle Tests
 */

const { EventEmitter } = require('events');

class MockDatabaseClient extends EventEmitter {
    constructor() {
        super();

        // Connection state
        this.isConnected = false;
        this.connectionRetries = 0;
        this.maxRetries = 3;

        // Mock data storage
        this.mockData = {
            users: [
                { BenID: 1, Vorname: 'Max', Nachname: 'Mustermann', EPC: 53004114, Active: 1 },
                { BenID: 2, Vorname: 'Anna', Nachname: 'Schmidt', EPC: 53004115, Active: 1 },
                { BenID: 3, Vorname: 'Peter', Nachname: 'Weber', EPC: 53004116, Active: 1 }
            ],
            sessions: [],
            qrScans: [],
            scannTypes: [
                { ID: 1, Name: 'Wareneingang', Active: 1 },
                { ID: 2, Name: 'Qualitätskontrolle', Active: 1 },
                { ID: 3, Name: 'Versand', Active: 1 }
            ]
        };

        // Auto-increment IDs
        this.nextSessionId = 1000;
        this.nextScanId = 2000;

        // Duplicate prevention
        this.duplicateCache = new Map();
        this.duplicateCooldown = 5 * 60 * 1000; // 5 minutes
        this.duplicateDbWindow = 10 * 60 * 1000; // 10 minutes

        // Performance tracking
        this.queryCount = 0;
        this.avgQueryTime = 0;
        this.connectionStats = {
            connects: 0,
            disconnects: 0,
            errors: 0,
            totalQueries: 0
        };

        // Config
        this.config = {
            server: 'mock-server',
            database: 'mock-database',
            user: 'mock-user',
            password: 'mock-password',
            options: {
                encrypt: true,
                trustServerCertificate: true
            }
        };

        // Bind methods
        this.connect = this.connect.bind(this);
        this.close = this.close.bind(this);
        this.query = this.query.bind(this);
        this.saveQRScan = this.saveQRScan.bind(this);
    }

    // Connection Management
    async connect() {
        if (this.isConnected) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            setTimeout(() => {
                try {
                    this.isConnected = true;
                    this.connectionStats.connects++;

                    this.emit('connect');
                    resolve();
                } catch (error) {
                    this.connectionStats.errors++;
                    reject(error);
                }
            }, 10); // Simulate connection delay
        });
    }

    async close() {
        if (!this.isConnected) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.isConnected = false;
            this.connectionStats.disconnects++;
            this.duplicateCache.clear();

            this.emit('close');
            resolve();
        });
    }

    // Test helper methods
    setMockUser(tagId, userData) {
        const existingIndex = this.mockData.users.findIndex(u => u.EPC === parseInt(tagId, 16));
        if (existingIndex >= 0) {
            this.mockData.users[existingIndex] = { ...userData, EPC: parseInt(tagId, 16) };
        } else {
            this.mockData.users.push({ ...userData, EPC: parseInt(tagId, 16) });
        }
    }

    getMockUser(tagId) {
        return this.mockData.users.find(u => u.EPC === parseInt(tagId, 16));
    }

    clearMockData() {
        this.mockData.sessions = [];
        this.mockData.qrScans = [];
        this.duplicateCache.clear();
        this.nextSessionId = 1000;
        this.nextScanId = 2000;
    }

    // Query Execution
    async query(sql, params = []) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        return new Promise((resolve, reject) => {
            setTimeout(() => {
                try {
                    const result = this._executeQuery(sql, params);
                    this.connectionStats.totalQueries++;
                    resolve(result);
                } catch (error) {
                    this.connectionStats.errors++;
                    reject(error);
                }
            }, 5); // Simulate query time
        });
    }

    _executeQuery(sql, params) {
        const normalizedSql = sql.trim().toLowerCase();

        // User lookup queries
        if (normalizedSql.includes('select') && normalizedSql.includes('scannbenutzer') && normalizedSql.includes('epc')) {
            const epc = params[0];
            const user = this.mockData.users.find(u => u.EPC === epc);
            return {
                recordset: user ? [user] : [],
                rowsAffected: [user ? 1 : 0]
            };
        }

        // Session queries
        if (normalizedSql.includes('insert') && normalizedSql.includes('sessions')) {
            const session = {
                ID: this.nextSessionId++,
                BenID: params[0],
                StartTS: new Date(),
                EndTS: null,
                Active: 1,
                ErstelltAm: new Date()
            };
            this.mockData.sessions.push(session);
            return {
                recordset: [{ ID: session.ID }],
                rowsAffected: [1]
            };
        }

        // End session queries
        if (normalizedSql.includes('update') && normalizedSql.includes('sessions') && normalizedSql.includes('endts')) {
            const sessionId = params[1]; // Assuming sessionId is second parameter
            const session = this.mockData.sessions.find(s => s.ID === sessionId);
            if (session) {
                session.EndTS = new Date();
                session.Active = 0;
                return {
                    recordset: [],
                    rowsAffected: [1]
                };
            }
            return {
                recordset: [],
                rowsAffected: [0]
            };
        }

        // Close active sessions for user
        if (normalizedSql.includes('update') && normalizedSql.includes('sessions') && normalizedSql.includes('benid')) {
            const userId = params[1]; // Assuming userId is second parameter
            const activeSessions = this.mockData.sessions.filter(s => s.BenID === userId && s.Active === 1);
            activeSessions.forEach(session => {
                session.EndTS = new Date();
                session.Active = 0;
            });
            return {
                recordset: [],
                rowsAffected: [activeSessions.length]
            };
        }

        // Get active session
        if (normalizedSql.includes('select') && normalizedSql.includes('sessions') && normalizedSql.includes('active')) {
            const userId = params[0];
            const activeSession = this.mockData.sessions.find(s => s.BenID === userId && s.Active === 1);
            return {
                recordset: activeSession ? [activeSession] : [],
                rowsAffected: [activeSession ? 1 : 0]
            };
        }

        // QR scan queries
        if (normalizedSql.includes('insert') && normalizedSql.includes('qrscans')) {
            // This should not be called directly - use saveQRScan instead
            throw new Error('Use saveQRScan method for QR insertions');
        }

        // Get QR scans by session
        if (normalizedSql.includes('select') && normalizedSql.includes('qrscans') && normalizedSql.includes('sessionid')) {
            const sessionId = params[0];
            const limit = params[1] || 50;

            const scans = this.mockData.qrScans
                .filter(s => s.SessionID === sessionId)
                .sort((a, b) => new Date(b.CapturedTS) - new Date(a.CapturedTS))
                .slice(0, limit);

            return {
                recordset: scans,
                rowsAffected: [scans.length]
            };
        }

        // Duplicate check queries
        if (normalizedSql.includes('select') && normalizedSql.includes('qrscans') && normalizedSql.includes('rawpayload')) {
            const payload = params[0];
            const minutesWindow = params[1] || 10;

            const cutoffTime = new Date(Date.now() - (minutesWindow * 60 * 1000));
            const duplicates = this.mockData.qrScans.filter(s =>
                s.RawPayload === payload &&
                new Date(s.CapturedTS) > cutoffTime
            );

            if (duplicates.length > 0) {
                const latest = duplicates[0];
                const minutesAgo = Math.floor((Date.now() - new Date(latest.CapturedTS).getTime()) / (1000 * 60));
                return {
                    recordset: [{
                        MinutesAgo: minutesAgo,
                        Count: duplicates.length,
                        LastScanTS: latest.CapturedTS
                    }],
                    rowsAffected: [1]
                };
            }

            return {
                recordset: [],
                rowsAffected: [0]
            };
        }

        // Delete queries (for cleanup)
        if (normalizedSql.includes('delete')) {
            if (normalizedSql.includes('qrscans')) {
                const id = params[0];
                const index = this.mockData.qrScans.findIndex(s => s.ID === id);
                if (index >= 0) {
                    this.mockData.qrScans.splice(index, 1);
                    return { recordset: [], rowsAffected: [1] };
                }
            }
            return { recordset: [], rowsAffected: [0] };
        }

        // Count queries
        if (normalizedSql.includes('count')) {
            if (normalizedSql.includes('scannbenutzer')) {
                return {
                    recordset: [{ UserCount: this.mockData.users.length }],
                    rowsAffected: [1]
                };
            }
            if (normalizedSql.includes('sessions')) {
                const activeSessions = this.mockData.sessions.filter(s => s.Active === 1);
                return {
                    recordset: [{ SessionCount: activeSessions.length }],
                    rowsAffected: [1]
                };
            }
        }

        // Default fallback
        return {
            recordset: [],
            rowsAffected: [0]
        };
    }

    // User Management
    async getUserByRFID(tagId) {
        const epc = parseInt(tagId, 16);
        const result = await this.query(
            'SELECT BenID, Vorname, Nachname, EPC FROM dbo.ScannBenutzer WHERE EPC = ? AND Active = 1',
            [epc]
        );

        return result.recordset[0] || null;
    }

    async createSession(userId) {
        // Close any existing active sessions for this user
        await this.query(
            'UPDATE dbo.Sessions SET EndTS = SYSDATETIME(), Active = 0 WHERE BenID = ? AND Active = 1',
            [new Date(), userId]
        );

        // Create new session
        const result = await this.query(
            'INSERT INTO dbo.Sessions (BenID, StartTS, Active) OUTPUT INSERTED.ID VALUES (?, SYSDATETIME(), 1)',
            [userId]
        );

        const sessionId = result.recordset[0].ID;

        // Return the complete session object
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

    // QR Scan Management
    async saveQRScan(sessionId, rawPayload, scannTypeId = 1) {
        // 1. Session validation
        const session = this.mockData.sessions.find(s => s.ID === sessionId && s.Active === 1);
        if (!session) {
            throw new Error('No active session found');
        }

        const now = Date.now();

        // 2. Cache-based duplicate check (5 minute window)
        if (this.duplicateCache.has(rawPayload)) {
            const lastScanTime = this.duplicateCache.get(rawPayload);
            const minutesAgo = Math.floor((now - lastScanTime) / (1000 * 60));

            if (now - lastScanTime < this.duplicateCooldown) {
                // Return rejection object instead of throwing
                return {
                    success: false,
                    status: 'duplicate_cache',
                    message: `QR-Code bereits vor ${minutesAgo} Minuten gescannt`,
                    data: null,
                    duplicateInfo: {
                        minutesAgo,
                        source: 'cache'
                    },
                    timestamp: new Date().toISOString()
                };
            }
        }

        // 3. Database-based duplicate check (10 minute window)
        const duplicateInfo = await this._checkQRDuplicate(rawPayload, 0.17); // 10 minutes
        if (duplicateInfo.isDuplicate) {
            this.duplicateCache.set(rawPayload, now);
            return {
                success: false,
                status: 'duplicate_database',
                message: `QR-Code bereits vor ${duplicateInfo.minutesAgo} Minuten gescannt`,
                data: null,
                duplicateInfo: {
                    minutesAgo: duplicateInfo.minutesAgo,
                    source: 'database',
                    count: duplicateInfo.count
                },
                timestamp: new Date().toISOString()
            };
        }

        // 4. Parse payload - FIXED for test expectations
        let payloadAsJSON = null;
        try {
            // Only set payloadAsJSON if it's valid JSON
            const parsed = JSON.parse(rawPayload);
            payloadAsJSON = parsed;
        } catch (error) {
            // For non-JSON strings, keep payloadAsJSON as null
            payloadAsJSON = null;
        }

        // 5. Create scan record
        const newScan = {
            ID: this.nextScanId++,
            SessionID: sessionId,
            RawPayload: rawPayload,
            PayloadAsJSON: payloadAsJSON,
            CapturedTS: new Date(),
            ScannTS: new Date(), // Alias for compatibility
            ScannTypID: scannTypeId,
            Valid: 1,
            ErstelltAm: new Date()
        };

        this.mockData.qrScans.push(newScan);
        this.duplicateCache.set(rawPayload, now);

        this.emit('qr-scan-saved', newScan);

        return {
            success: true,
            status: 'saved',
            message: 'QR-Code erfolgreich gespeichert',
            data: newScan,
            timestamp: new Date().toISOString()
        };
    }

    async _checkQRDuplicate(payload, hoursWindow = 0.17) {
        const minutesWindow = hoursWindow * 60;

        const result = await this.query(`
            SELECT 
                COUNT(*) as Count,
                DATEDIFF(MINUTE, MAX(CapturedTS), SYSDATETIME()) as MinutesAgo,
                MAX(CapturedTS) as LastScanTS
            FROM dbo.QrScans 
            WHERE RawPayload = ? 
            AND CapturedTS > DATEADD(MINUTE, -?, SYSDATETIME())
        `, [payload, minutesWindow]);

        const data = result.recordset[0];

        return {
            isDuplicate: data && data.Count > 0,
            count: data?.Count || 0,
            minutesAgo: data?.MinutesAgo || 0,
            lastScanTime: data?.LastScanTS
        };
    }

    async getQRScansBySession(sessionId, limit = 50) {
        const result = await this.query(`
            SELECT TOP (?) * FROM dbo.QrScans 
            WHERE SessionID = ? 
            ORDER BY CapturedTS DESC
        `, [limit, sessionId]);

        return result.recordset;
    }

    // Statistics and Monitoring
    getConnectionStats() {
        return {
            ...this.connectionStats,
            isConnected: this.isConnected,
            cacheSize: this.duplicateCache.size
        };
    }

    // Utility methods
    normalizeTimestamp(timestamp) {
        if (!timestamp) return null;
        return timestamp instanceof Date ? timestamp.toISOString() : timestamp;
    }

    parsePayloadJson(payloadJson) {
        if (!payloadJson) return null;
        try {
            return JSON.parse(payloadJson);
        } catch {
            return null;
        }
    }

    _analyzePayload(rawPayload) {
        // Simple payload analysis for non-JSON content
        if (rawPayload.includes('http')) {
            return { type: 'url', content: rawPayload };
        }
        if (/^\d+$/.test(rawPayload)) {
            return { type: 'numeric', content: rawPayload };
        }
        if (rawPayload.includes('^')) {
            return { type: 'delimited', content: rawPayload };
        }
        return { type: 'text', content: rawPayload, raw: rawPayload };
    }
}

module.exports = MockDatabaseClient;