// tests/mocks/db-client.mock.js
/**
 * Mock Database Client für Tests
 * Simuliert alle Datenbankoperationen für RFID QR Wareneingang
 * Kompatibel mit der echten DatabaseClient API
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

        // Mock-Datenstrukturen - kompatibel mit echter Implementierung
        this.mockData = {
            users: [
                {
                    ID: 1,
                    BenutzerName: 'Test User 1',
                    Vorname: 'Test',
                    Nachname: 'User 1',
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
                    Vorname: 'Test',
                    Nachname: 'User 2',
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
                    Vorname: 'Inactive',
                    Nachname: 'User',
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
        this.pendingScans = new Map();

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

        // Auto-increment IDs
        this.nextSessionId = 1;
        this.nextScanId = 1;
        this.nextUserId = 4;
    }

    // ===== CONNECTION MANAGEMENT =====

    async connect() {
        if (this.isConnected) {
            return true;
        }

        try {
            // Simuliere Verbindungsaufbau - kurze Delays für Tests
            await this._simulateNetworkDelay(10, 50);

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
            // Sehr kurzer Timeout für Tests - Force cleanup wenn nötig
            await this._waitForPendingOperations(500);

            this.isConnected = false;
            this.connectionStartTime = null;
            this.performanceStats.connections.active = Math.max(0, this.performanceStats.connections.active - 1);

            this.emit('disconnect');
            return true;
        } catch (error) {
            // Force cleanup bei Timeout
            this.pendingOperations.clear();
            this.pendingScans.clear();
            this.isConnected = false;
            this.connectionStartTime = null;
            this.performanceStats.connections.active = 0;

            // Nur warnen, nicht werfen für bessere Test-Stabilität
            console.warn('Force cleanup in mock database client:', error.message);
            return true;
        }
    }

    async testConnection() {
        if (!this.isConnected) {
            throw new Error('Not connected to database');
        }

        await this._simulateNetworkDelay(5, 25);
        return {
            success: true,
            server: this.config.server,
            database: this.config.database,
            connectionTime: Date.now() - this.connectionStartTime.getTime(),
            timestamp: new Date().toISOString(),
            serverTime: new Date().toISOString(),
            version: 'Mock SQL Server 2022'
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
                ID: this.nextUserId++,
                BenutzerName: userData.BenutzerName,
                Vorname: userData.Vorname || '',
                Nachname: userData.Nachname || '',
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
            // Prüfe ob Benutzer existiert
            const user = this.mockData.users.find(u => u.ID === userId && u.xStatus === 0);
            if (!user) {
                throw new Error(`User with ID ${userId} not found or inactive`);
            }

            // Schließe alle offenen Sessions für diesen User
            await this._closeOpenSessions(userId);

            const newSession = {
                ID: this.nextSessionId++,
                UserID: userId,
                StartTS: new Date(),
                EndTS: null,
                Active: 1,
                ErstelltAm: new Date(),
                DurationSeconds: 0
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

            if (session) {
                // Berechne aktuelle Dauer
                const now = new Date();
                const startTime = new Date(session.StartTS);
                const durationSeconds = Math.floor((now - startTime) / 1000);

                return {
                    ...session,
                    DurationSeconds: durationSeconds
                };
            }

            return null;
        }, 'getActiveSession');
    }

    async getAllActiveSessions() {
        return await this._executeQuery(async () => {
            const now = new Date();
            return this.mockData.sessions
                .filter(s => s.Active === 1)
                .map(s => {
                    const startTime = new Date(s.StartTS);
                    const durationSeconds = Math.floor((now - startTime) / 1000);
                    return {
                        ...s,
                        DurationSeconds: durationSeconds
                    };
                });
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
            const durationSeconds = Math.floor(duration / 1000);

            return {
                sessionId: sessionId,
                startTime: this.normalizeTimestamp(startTime),
                endTime: session.EndTS ? this.normalizeTimestamp(endTime) : null,
                duration: duration,
                isActive: session.Active === 1,
                formattedDuration: this.formatSessionDuration(durationSeconds)
            };
        }, 'getSessionDuration');
    }

    formatSessionDuration(totalSeconds) {
        if (!totalSeconds || totalSeconds < 0) return '0s';

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    // ===== QR SCAN MANAGEMENT =====

    async saveQRScan(sessionId, rawPayload, scannTypeId = 1) {
        const cacheKey = `${sessionId}_${rawPayload}`;
        const now = Date.now();

        return await this._executeQuery(async () => {
            // 1. Prüfe ob bereits in Verarbeitung
            if (this.pendingScans.has(cacheKey)) {
                return {
                    success: false,
                    status: 'processing',
                    message: 'QR-Code wird bereits verarbeitet',
                    data: null,
                    timestamp: new Date().toISOString()
                };
            }

            // 2. Markiere als in Verarbeitung
            this.pendingScans.set(cacheKey, now);

            try {
                // 3. Session-Validierung
                const session = this.mockData.sessions.find(s =>
                    s.ID === sessionId && s.Active === 1
                );
                if (!session) {
                    throw new Error(`No active session found with ID ${sessionId}`);
                }

                // 4. Prüfe Cache - 10 Minuten Fenster
                const cachedTime = this.duplicateCache.get(rawPayload);
                if (cachedTime) {
                    const minutesAgo = Math.floor((now - cachedTime) / (1000 * 60));
                    if (minutesAgo < 10) {
                        this.duplicateCache.set(rawPayload, now);
                        return {
                            success: false,
                            status: 'duplicate_cache',
                            message: `QR-Code bereits vor ${minutesAgo} Minuten gescannt`,
                            data: null,
                            duplicateInfo: { minutesAgo, source: 'cache' },
                            timestamp: new Date().toISOString()
                        };
                    }
                }

                // 5. Prüfe auf Duplikate in Datenbank
                const duplicateInfo = await this._checkQRDuplicate(rawPayload, 0.17); // 10 Minuten
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

                // 6. JSON-Parsing für berechnete Spalte
                let parsedPayload = null;
                let payloadJson = null;
                try {
                    parsedPayload = JSON.parse(rawPayload);
                    payloadJson = rawPayload;
                } catch (error) {
                    // Kein gültiges JSON, erstelle Struktur
                    payloadJson = JSON.stringify(this._analyzePayload(rawPayload));
                    parsedPayload = this._analyzePayload(rawPayload);
                }

                // 7. Scan speichern
                const newScan = {
                    ID: this.nextScanId++,
                    SessionID: sessionId,
                    RawPayload: rawPayload,
                    PayloadJson: payloadJson,
                    PayloadAsJSON: parsedPayload,
                    CapturedTS: new Date(),
                    ScannTS: new Date(), // Alias für Kompatibilität
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
                    data: {
                        ...newScan,
                        CapturedTS: this.normalizeTimestamp(newScan.CapturedTS),
                        ParsedPayload: this.parsePayloadJson(payloadJson)
                    },
                    timestamp: new Date().toISOString()
                };

            } finally {
                // Immer aus Pending-Set entfernen
                this.pendingScans.delete(cacheKey);
            }
        }, 'saveQRScan');
    }

    // Analyse des Payloads für Struktur-Erkennung
    _analyzePayload(payload) {
        if (!payload || typeof payload !== 'string') {
            return { type: 'unknown', raw: payload };
        }

        // Stern-separiert
        if (payload.includes('*')) {
            const parts = payload.split('*');
            return {
                type: 'star_separated',
                raw: payload,
                parts: parts,
                parts_count: parts.length
            };
        }

        // Caret-separiert
        if (payload.includes('^')) {
            const parts = payload.split('^');
            return {
                type: 'caret_separated',
                raw: payload,
                parts: parts,
                parts_count: parts.length
            };
        }

        // URL
        if (payload.startsWith('http://') || payload.startsWith('https://')) {
            return {
                type: 'url',
                raw: payload,
                url: payload
            };
        }

        // Nur Zahlen (Barcode)
        if (/^\d+$/.test(payload)) {
            return {
                type: 'barcode',
                raw: payload,
                code: payload
            };
        }

        // Alphanumerisch
        if (/^[A-Za-z0-9]+$/.test(payload)) {
            return {
                type: 'alphanumeric',
                raw: payload,
                code: payload
            };
        }

        // Freitext
        return {
            type: 'text',
            raw: payload,
            content: payload
        };
    }

    // Parse PayloadJson wie in echter Implementierung
    parsePayloadJson(payloadJson) {
        if (!payloadJson) return null;

        try {
            const parsed = JSON.parse(payloadJson);

            switch (parsed.type) {
                case 'star_separated':
                    return {
                        ...parsed,
                        fields: {
                            field1: parsed.parts?.[0] || null,
                            field2: parsed.parts?.[1] || null,
                            field3: parsed.parts?.[2] || null,
                            field4: parsed.parts?.[3] || null,
                            field5: parsed.parts?.[4] || null,
                            field6: parsed.parts?.[5] || null
                        },
                        display: `${parsed.parts?.slice(0, 3).join(' • ')}...` || parsed.raw
                    };

                case 'caret_separated':
                    return {
                        ...parsed,
                        fields: {
                            field1: parsed.parts?.[0] || null,
                            field2: parsed.parts?.[1] || null,
                            field3: parsed.parts?.[2] || null,
                            field4: parsed.parts?.[3] || null,
                            field5: parsed.parts?.[4] || null,
                            field6: parsed.parts?.[5] || null
                        },
                        display: `${parsed.parts?.slice(0, 3).join(' • ')}...` || parsed.raw
                    };

                case 'alphanumeric':
                    return {
                        ...parsed,
                        display: parsed.code,
                        formatted: parsed.code.replace(/(\w{4})/g, '$1 ').trim()
                    };

                case 'barcode':
                    return {
                        ...parsed,
                        display: `Barcode: ${parsed.code}`,
                        formatted: parsed.code.replace(/(\d{4})/g, '$1 ').trim()
                    };

                case 'url':
                    return {
                        ...parsed,
                        display: `🔗 ${parsed.url}`,
                        domain: parsed.url.match(/https?:\/\/([^\/]+)/)?.[1]
                    };

                case 'text':
                    return {
                        ...parsed,
                        display: parsed.content?.length > 50
                            ? parsed.content.substring(0, 50) + '...'
                            : parsed.content
                    };

                default:
                    return { ...parsed, display: parsed.raw || 'Unknown format' };
            }
        } catch (error) {
            return { type: 'error', raw: payloadJson, display: 'Parse Error' };
        }
    }

    async _checkQRDuplicate(payload, timeWindowHours = 0.17) {
        try {
            const timeWindowMs = timeWindowHours * 60 * 60 * 1000;
            const cutoffTime = new Date(Date.now() - timeWindowMs);

            const duplicates = this.mockData.qrScans.filter(scan =>
                scan.RawPayload === payload &&
                new Date(scan.CapturedTS) >= cutoffTime &&
                scan.Valid === 1
            );

            if (duplicates.length > 0) {
                const lastScan = duplicates[duplicates.length - 1];
                const lastScanTime = new Date(lastScan.CapturedTS);
                const minutesAgo = Math.floor((Date.now() - lastScanTime.getTime()) / (1000 * 60));

                return {
                    isDuplicate: true,
                    count: duplicates.length,
                    minutesAgo: minutesAgo,
                    lastScanTime: lastScanTime
                };
            }

            return {
                isDuplicate: false,
                count: 0,
                minutesAgo: 0,
                lastScanTime: null
            };
        } catch (error) {
            // Bei Fehler: Als neu behandeln
            return {
                isDuplicate: false,
                count: 0,
                minutesAgo: 0,
                lastScanTime: null
            };
        }
    }

    async getQRScansBySession(sessionId, limit = 50) {
        return await this._executeQuery(async () => {
            return this.mockData.qrScans
                .filter(s => s.SessionID === sessionId)
                .sort((a, b) => new Date(b.CapturedTS) - new Date(a.CapturedTS))
                .slice(0, limit)
                .map(s => ({
                    ...s,
                    CapturedTS: this.normalizeTimestamp(s.CapturedTS),
                    ScannTS: this.normalizeTimestamp(s.CapturedTS), // Alias
                    ParsedPayload: this.parsePayloadJson(s.PayloadJson),
                    FormattedTime: this.formatRelativeTime(s.CapturedTS),
                    PayloadType: s.PayloadJson ? JSON.parse(s.PayloadJson).type : 'unknown'
                }));
        }, 'getQRScansBySession');
    }

    async getSessionScans(sessionId, limit = 50) {
        // Alias für getQRScansBySession
        return await this.getQRScansBySession(sessionId, limit);
    }

    async getRecentQRScans(limit = 20) {
        return await this._executeQuery(async () => {
            // Joins simulieren
            const scansWithUser = this.mockData.qrScans
                .map(scan => {
                    const session = this.mockData.sessions.find(s => s.ID === scan.SessionID);
                    const user = session ? this.mockData.users.find(u => u.ID === session.UserID) : null;

                    return {
                        ...scan,
                        BenutzerName: user ? user.BenutzerName : 'Unknown User',
                        CapturedTS: this.normalizeTimestamp(scan.CapturedTS),
                        ParsedPayload: this.parsePayloadJson(scan.PayloadJson),
                        FormattedTime: this.formatRelativeTime(scan.CapturedTS),
                        PayloadType: scan.PayloadJson ? JSON.parse(scan.PayloadJson).type : 'unknown'
                    };
                })
                .filter(scan => scan.Valid === 1)
                .sort((a, b) => new Date(b.CapturedTS) - new Date(a.CapturedTS))
                .slice(0, limit);

            return scansWithUser;
        }, 'getRecentQRScans');
    }

    async getQRScanById(scanId) {
        return await this._executeQuery(async () => {
            const scan = this.mockData.qrScans.find(s => s.ID === scanId);
            if (!scan) return null;

            return {
                ...scan,
                CapturedTS: this.normalizeTimestamp(scan.CapturedTS),
                ParsedPayload: this.parsePayloadJson(scan.PayloadJson),
                FormattedTime: this.formatRelativeTime(scan.CapturedTS)
            };
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
            const duration = await this.getSessionDuration(sessionId);

            return {
                sessionId: sessionId,
                userId: session.UserID,
                startTime: session.StartTS,
                endTime: session.EndTS,
                isActive: session.Active === 1,
                totalScans: scans.length,
                scanRate: duration && duration.duration ? (scans.length / (duration.duration / 1000 / 60)) : 0,
                firstScan: scans.length > 0 ? Math.min(...scans.map(s => new Date(s.CapturedTS))) : null,
                lastScan: scans.length > 0 ? Math.max(...scans.map(s => new Date(s.CapturedTS))) : null
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
                const scanDate = new Date(scan.CapturedTS);
                return scanDate >= startOfDay && scanDate <= endOfDay;
            });

            const uniqueUsers = new Set(daySessions.map(s => s.UserID)).size;

            return {
                date: date.toDateString(),
                TotalSessions: daySessions.length,
                TotalScans: dayScans.length,
                UniqueUsers: uniqueUsers,
                ActiveSessions: daySessions.filter(s => s.Active === 1).length,
                totalUsers: uniqueUsers,
                totalSessions: daySessions.length,
                activeSessions: daySessions.filter(s => s.Active === 1).length,
                totalScans: dayScans.length,
                avgScansPerUser: uniqueUsers > 0 ? dayScans.length / uniqueUsers : 0,
                hourlyDistribution: this._getHourlyDistribution(dayScans, startOfDay, endOfDay),
                AvgSessionMinutes: daySessions.length > 0 ?
                    daySessions.reduce((total, session) => {
                        if (!session.EndTS) return total;
                        return total + (new Date(session.EndTS) - new Date(session.StartTS)) / (1000 * 60);
                    }, 0) / daySessions.length : 0
            };
        }, 'getDailyStats');
    }

    async getRecentActivity(hours = 8) {
        return await this._executeQuery(async () => {
            const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

            const activities = [];

            // Session starts
            this.mockData.sessions
                .filter(s => new Date(s.StartTS) >= cutoffTime)
                .forEach(s => {
                    const user = this.mockData.users.find(u => u.ID === s.UserID);
                    activities.push({
                        EventType: 'session',
                        EventTime: this.normalizeTimestamp(s.StartTS),
                        UserName: user ? user.BenutzerName : 'Unknown',
                        Action: 'Login',
                        Details: null
                    });
                });

            // Session ends
            this.mockData.sessions
                .filter(s => s.EndTS && new Date(s.EndTS) >= cutoffTime)
                .forEach(s => {
                    const user = this.mockData.users.find(u => u.ID === s.UserID);
                    const duration = Math.floor((new Date(s.EndTS) - new Date(s.StartTS)) / (1000 * 60));
                    activities.push({
                        EventType: 'session',
                        EventTime: this.normalizeTimestamp(s.EndTS),
                        UserName: user ? user.BenutzerName : 'Unknown',
                        Action: 'Logout',
                        Details: `${duration} min`
                    });
                });

            // QR Scans
            this.mockData.qrScans
                .filter(scan => new Date(scan.CapturedTS) >= cutoffTime && scan.Valid === 1)
                .forEach(scan => {
                    const session = this.mockData.sessions.find(s => s.ID === scan.SessionID);
                    const user = session ? this.mockData.users.find(u => u.ID === session.UserID) : null;
                    activities.push({
                        EventType: 'qr_scan',
                        EventTime: this.normalizeTimestamp(scan.CapturedTS),
                        UserName: user ? user.BenutzerName : 'Unknown',
                        Action: 'QR-Scan',
                        Details: scan.RawPayload.length > 50 ?
                            scan.RawPayload.substring(0, 50) + '...' : scan.RawPayload
                    });
                });

            return activities.sort((a, b) => new Date(b.EventTime) - new Date(a.EventTime));
        }, 'getRecentActivity');
    }

    async getQRScanStats(sessionId = null) {
        return await this._executeQuery(async () => {
            let scans = this.mockData.qrScans;
            if (sessionId) {
                scans = scans.filter(s => s.SessionID === sessionId);
            }

            const stats = {
                TotalScans: scans.length,
                StarSeparated: 0,
                CaretSeparated: 0,
                Alphanumeric: 0,
                Barcodes: 0,
                URLs: 0,
                TextCodes: 0,
                FirstScan: null,
                LastScan: null
            };

            scans.forEach(scan => {
                if (scan.PayloadJson) {
                    try {
                        const parsed = JSON.parse(scan.PayloadJson);
                        switch (parsed.type) {
                            case 'star_separated': stats.StarSeparated++; break;
                            case 'caret_separated': stats.CaretSeparated++; break;
                            case 'alphanumeric': stats.Alphanumeric++; break;
                            case 'barcode': stats.Barcodes++; break;
                            case 'url': stats.URLs++; break;
                            case 'text': stats.TextCodes++; break;
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            });

            if (scans.length > 0) {
                const times = scans.map(s => new Date(s.CapturedTS));
                stats.FirstScan = this.normalizeTimestamp(Math.min(...times));
                stats.LastScan = this.normalizeTimestamp(Math.max(...times));
            }

            return stats;
        }, 'getQRScanStats');
    }

    // ===== SEARCH FUNCTIONALITY =====

    async searchQRScans(searchTerm, sessionId = null, limit = 20) {
        return await this._executeQuery(async () => {
            let scans = this.mockData.qrScans;

            if (sessionId) {
                scans = scans.filter(s => s.SessionID === sessionId);
            }

            // Einfache String-Suche
            const filteredScans = scans.filter(scan => {
                if (scan.RawPayload.toLowerCase().includes(searchTerm.toLowerCase())) {
                    return true;
                }
                if (scan.PayloadJson && scan.PayloadJson.toLowerCase().includes(searchTerm.toLowerCase())) {
                    return true;
                }
                return false;
            });

            return filteredScans
                .sort((a, b) => new Date(b.CapturedTS) - new Date(a.CapturedTS))
                .slice(0, limit)
                .map(scan => ({
                    ...scan,
                    CapturedTS: this.normalizeTimestamp(scan.CapturedTS),
                    ParsedPayload: this.parsePayloadJson(scan.PayloadJson),
                    Format: this.getQRCodeFormat(scan.PayloadJson),
                    FormattedTime: this.formatRelativeTime(scan.CapturedTS),
                    PayloadType: scan.PayloadJson ? JSON.parse(scan.PayloadJson).type : 'unknown'
                }));
        }, 'searchQRScans');
    }

    // ===== UTILITIES =====

    getQRCodeFormat(payloadJson) {
        try {
            const parsed = JSON.parse(payloadJson);

            const formats = {
                'star_separated': {
                    icon: '⭐',
                    name: 'Stern-Format',
                    color: 'blue',
                    description: 'Paket-/Auftragsdaten'
                },
                'caret_separated': {
                    icon: '🔸',
                    name: 'Caret-Format',
                    color: 'blue',
                    description: 'Paket-/Auftragsdaten'
                },
                'barcode': {
                    icon: '🔢',
                    name: 'Barcode',
                    color: 'green',
                    description: 'Numerischer Code'
                },
                'url': {
                    icon: '🔗',
                    name: 'URL',
                    color: 'purple',
                    description: 'Web-Link'
                },
                'alphanumeric': {
                    icon: '🔤',
                    name: 'Alpha-Code',
                    color: 'orange',
                    description: 'Buchstaben + Zahlen'
                },
                'text': {
                    icon: '📝',
                    name: 'Text',
                    color: 'gray',
                    description: 'Freitext'
                }
            };

            return formats[parsed.type] || {
                icon: '❓',
                name: 'Unbekannt',
                color: 'red',
                description: 'Unbekanntes Format'
            };
        } catch (error) {
            return {
                icon: '❌',
                name: 'Fehler',
                color: 'red',
                description: 'Parse-Fehler'
            };
        }
    }

    formatRelativeTime(timestamp) {
        try {
            const now = new Date();
            const date = new Date(timestamp);
            const diffMs = now.getTime() - date.getTime();

            const diffSeconds = Math.floor(diffMs / 1000);
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffSeconds < 60) return `vor ${diffSeconds} Sekunde${diffSeconds !== 1 ? 'n' : ''}`;
            if (diffMinutes < 60) return `vor ${diffMinutes} Minute${diffMinutes !== 1 ? 'n' : ''}`;
            if (diffHours < 24) return `vor ${diffHours} Stunde${diffHours !== 1 ? 'n' : ''}`;
            if (diffDays < 7) return `vor ${diffDays} Tag${diffDays !== 1 ? 'en' : ''}`;

            return new Date(date).toLocaleDateString('de-DE');
        } catch (error) {
            return 'Unbekannt';
        }
    }

    // ===== HEALTH CHECK & DIAGNOSTICS =====

    async healthCheck() {
        return await this._executeQuery(async () => {
            const activeUsers = this.mockData.users.filter(u => u.xStatus === 0).length;
            const activeSessions = this.mockData.sessions.filter(s => s.Active === 1).length;
            const totalScans = this.mockData.qrScans.filter(s => s.Valid === 1).length;
            const todayScans = this.mockData.qrScans.filter(s => {
                const today = new Date().toDateString();
                const scanDate = new Date(s.CapturedTS).toDateString();
                return scanDate === today && s.Valid === 1;
            }).length;

            return {
                connected: this.isConnected,
                connectionTime: this.connectionStartTime ?
                    Date.now() - this.connectionStartTime.getTime() : 0,
                server: {
                    ServerVersion: 'Mock SQL Server 2022',
                    DatabaseName: this.config.database,
                    CurrentUser: this.config.user,
                    ServerTime: new Date().toISOString(),
                    ServerName: this.config.server
                },
                stats: {
                    ActiveUsers: activeUsers,
                    TotalSessions: this.mockData.sessions.length,
                    ActiveSessions: activeSessions,
                    TotalValidScans: totalScans,
                    TodayScans: todayScans,
                    activeUsers: activeUsers,
                    totalSessions: this.mockData.sessions.length,
                    activeSessions: activeSessions,
                    totalValidScans: totalScans,
                    recentErrorCount: this.performanceStats.queries.failed,
                    pendingOperations: this.pendingOperations.size
                },
                performance: {
                    ...this.performanceStats,
                    uptime: this.connectionStartTime ?
                        Date.now() - this.connectionStartTime.getTime() : 0
                },
                timestamp: new Date().toISOString(),
                duplicateCache: {
                    size: this.duplicateCache.size,
                    pendingScans: this.pendingScans.size
                }
            };
        }, 'healthCheck');
    }

    async debugInfo() {
        try {
            const health = await this.healthCheck();
            const connectionStatus = this.getConnectionStatus();

            return { connectionStatus, health };
        } catch (error) {
            return { error: error.message };
        }
    }

    getConnectionStatus() {
        return {
            connected: this.isConnected,
            pool: !!this.pool,
            config: {
                server: this.config.server,
                database: this.config.database,
                user: this.config.user,
                port: this.config.port
            },
            cache: {
                duplicates: this.duplicateCache.size,
                pending: this.pendingScans.size
            }
        };
    }

    // ===== DUPLICATE DETECTION METHODS =====

    async checkForDuplicates(rawPayload, sessionId, minutesBack = 10) {
        return await this._executeQuery(async () => {
            const cutoffTime = new Date(Date.now() - minutesBack * 60 * 1000);

            const duplicate = this.mockData.qrScans.find(scan =>
                scan.RawPayload === rawPayload &&
                scan.SessionID === sessionId &&
                new Date(scan.CapturedTS) > cutoffTime
            );

            if (duplicate) {
                const minutesAgo = Math.floor((Date.now() - new Date(duplicate.CapturedTS)) / (1000 * 60));
                return {
                    isDuplicate: true,
                    previousScan: {
                        ...duplicate,
                        CapturedTS: this.normalizeTimestamp(duplicate.CapturedTS),
                        ParsedPayload: this.parsePayloadJson(duplicate.PayloadJson),
                        MinutesAgo: minutesAgo
                    }
                };
            }

            return { isDuplicate: false };
        }, 'checkForDuplicates');
    }

    // ===== TIMESTAMP UTILITIES =====

    normalizeTimestamp(timestamp) {
        try {
            if (!timestamp) {
                return new Date().toISOString();
            }

            let date;

            if (timestamp instanceof Date) {
                date = timestamp;
            } else if (typeof timestamp === 'string') {
                if (timestamp.includes('T')) {
                    date = new Date(timestamp);
                } else {
                    const isoString = timestamp.replace(' ', 'T');
                    date = new Date(isoString);
                }
            } else {
                date = new Date(timestamp);
            }

            if (isNaN(date.getTime())) {
                return new Date().toISOString();
            }

            return date.toISOString();

        } catch (error) {
            return new Date().toISOString();
        }
    }

    formatSQLDateTime(date) {
        try {
            if (!(date instanceof Date)) {
                date = new Date(date);
            }

            if (isNaN(date.getTime())) {
                throw new Error('Ungültiges Datum');
            }

            return date.toISOString().slice(0, 19).replace('T', ' ');
        } catch (error) {
            return new Date().toISOString().slice(0, 19).replace('T', ' ');
        }
    }

    parseSQLDateTime(sqlDateTime) {
        try {
            return this.normalizeTimestamp(sqlDateTime);
        } catch (error) {
            return new Date().toISOString();
        }
    }

    // ===== CACHE MANAGEMENT =====

    clearDuplicateCache() {
        const oldSize = this.duplicateCache.size;
        this.duplicateCache.clear();
        return { cleared: oldSize };
    }

    getDuplicateCacheStats() {
        return {
            size: this.duplicateCache.size,
            pendingScans: this.pendingScans.size,
            oldestEntry: this.duplicateCache.size > 0 ? Math.min(...this.duplicateCache.values()) : null,
            newestEntry: this.duplicateCache.size > 0 ? Math.max(...this.duplicateCache.values()) : null
        };
    }

    cleanupDuplicateCache() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 Stunden

        let cleanedCount = 0;
        for (const [key, timestamp] of this.duplicateCache.entries()) {
            if (now - timestamp > maxAge) {
                this.duplicateCache.delete(key);
                cleanedCount++;
            }
        }

        return { cleaned: cleanedCount };
    }

    startCacheCleanup() {
        // Mock implementation - no real intervals needed for tests
        return true;
    }

    // ===== TRANSACTION SUPPORT =====

    async transaction(callback) {
        // Mock transaction - just execute callback
        try {
            const customRequest = {
                query: async (queryString, params = {}) => {
                    // Mock request with parameters
                    return { recordset: [] };
                }
            };

            return await callback(customRequest);
        } catch (error) {
            throw error;
        }
    }

    // ===== QUERY METHOD =====

    async query(queryString, parameters = []) {
        return await this._executeQuery(async () => {
            // Mock query execution
            return {
                recordset: [],
                rowsAffected: [0]
            };
        }, 'query');
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
            // Sehr kurze Delays für bessere Test-Performance
            await this._simulateNetworkDelay(1, 5);

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

    async _simulateNetworkDelay(minMs = 1, maxMs = 5) {
        const delay = Math.random() * (maxMs - minMs) + minMs;
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    async _waitForPendingOperations(timeoutMs = 500) {
        const startTime = Date.now();

        while (this.pendingOperations.size > 0) {
            if (Date.now() - startTime > timeoutMs) {
                // Force cleanup anstatt Exception
                this.pendingOperations.clear();
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 5));
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
            const scanDate = new Date(scan.CapturedTS);
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
                    Vorname: 'Test',
                    Nachname: 'User 1',
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
                    Vorname: 'Test',
                    Nachname: 'User 2',
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
        this.pendingScans.clear();
        this.pendingOperations.clear();
        this.queryCount = 0;
        this.transactionCount = 0;
        this.nextSessionId = 1;
        this.nextScanId = 1;
        this.nextUserId = 4;

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

        this.emit('reset');
    }

    addTestUser(userData) {
        const newUser = {
            ID: this.nextUserId++,
            BenutzerName: userData.BenutzerName || 'Test User',
            Vorname: userData.Vorname || 'Test',
            Nachname: userData.Nachname || 'User',
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
        return JSON.parse(JSON.stringify(this.performanceStats));
    }

    getMockData() {
        return JSON.parse(JSON.stringify(this.mockData));
    }

    // Setter für Mock-Daten (für Tests)
    setMockData(data) {
        this.mockData = { ...this.mockData, ...data };
    }

    // Erweiterte Test-Hilfsmethoden
    addMockSession(sessionData) {
        const session = {
            ID: this.nextSessionId++,
            UserID: sessionData.UserID,
            StartTS: sessionData.StartTS || new Date(),
            EndTS: sessionData.EndTS || null,
            Active: sessionData.Active !== undefined ? sessionData.Active : 1,
            ErstelltAm: new Date()
        };

        this.mockData.sessions.push(session);
        return session;
    }

    addMockQRScan(scanData) {
        const scan = {
            ID: this.nextScanId++,
            SessionID: scanData.SessionID,
            RawPayload: scanData.RawPayload,
            PayloadJson: scanData.PayloadJson || JSON.stringify(this._analyzePayload(scanData.RawPayload)),
            CapturedTS: scanData.CapturedTS || new Date(),
            ScannTypID: scanData.ScannTypID || 1,
            Valid: scanData.Valid !== undefined ? scanData.Valid : 1,
            ErstelltAm: new Date()
        };

        this.mockData.qrScans.push(scan);
        return scan;
    }

    // Performance-optimierte Methoden für Tests
    enableFastMode() {
        this._fastMode = true;
    }

    disableFastMode() {
        this._fastMode = false;
    }

    // Override für Netzwerk-Delay in Fast Mode
    async _simulateNetworkDelayOptimized(minMs = 1, maxMs = 5) {
        if (this._fastMode) {
            return Promise.resolve();
        }
        return this._simulateNetworkDelay(minMs, maxMs);
    }
}

module.exports = MockDatabaseClient;