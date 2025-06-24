const sql = require('mssql');
require('dotenv').config();

// Console-Utils für bessere Ausgabe
const console = require('../utils/console-utils');

class DatabaseClient {
    constructor() {
        this.pool = null;
        this.isConnected = false;

        // Duplikat-Cache für bessere Performance
        this.duplicateCache = new Map();
        this.cacheCleanupInterval = null;

        // Pending-Scans Synchronisation
        this.pendingScans = new Map();

        // Database configuration from environment
        this.config = {
            server: process.env.MSSQL_SERVER || 'localhost',
            database: process.env.MSSQL_DATABASE || 'RdScanner',
            user: process.env.MSSQL_USER || 'sa',
            password: process.env.MSSQL_PASSWORD || '',
            port: parseInt(process.env.MSSQL_PORT) || 1433,
            options: {
                encrypt: process.env.MSSQL_ENCRYPT?.toLowerCase() === 'true' || false,
                trustServerCertificate: process.env.MSSQL_TRUST_CERT?.toLowerCase() === 'true' || true,
                enableArithAbort: true,
                requestTimeout: parseInt(process.env.MSSQL_REQUEST_TIMEOUT) || 30000,
                connectionTimeout: parseInt(process.env.MSSQL_CONNECTION_TIMEOUT) || 15000,
            },
            pool: {
                max: parseInt(process.env.MSSQL_POOL_MAX) || 10,
                min: parseInt(process.env.MSSQL_POOL_MIN) || 0,
                idleTimeoutMillis: parseInt(process.env.MSSQL_POOL_IDLE_TIMEOUT) || 30000,
            }
        };

        console.database('Database client initialisiert mit Konfiguration:', {
            server: this.config.server,
            database: this.config.database,
            user: this.config.user,
            port: this.config.port,
            encrypt: this.config.options.encrypt
        });

        // Cache-Cleanup alle 5 Minuten
        this.startCacheCleanup();
    }

    startCacheCleanup() {
        this.cacheCleanupInterval = setInterval(() => {
            this.cleanupDuplicateCache();
        }, 5 * 60 * 1000); // 5 Minuten
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

        if (cleanedCount > 0) {
            console.log(`🧹 Duplikat-Cache bereinigt: ${cleanedCount} Einträge entfernt`);
        }
    }

    async connect() {
        if (this.isConnected && this.pool) {
            console.log('Datenbank bereits verbunden');
            return true;
        }

        try {
            console.database('Verbinde mit SQL Server...');
            console.info(`Server: ${this.config.server}:${this.config.port}`);
            console.info(`Datenbank: ${this.config.database}`);
            console.info(`Benutzer: ${this.config.user}`);

            // Connection Pool erstellen
            this.pool = await sql.connect(this.config);

            // Verbindung testen
            const result = await this.pool.request().query('SELECT 1 as test, GETDATE() as serverTime');

            if (result.recordset && result.recordset[0].test === 1) {
                this.isConnected = true;
                console.success('Datenbank erfolgreich verbunden');
                console.info(`Server-Zeit: ${result.recordset[0].serverTime}`);

                // Tabellen validieren
                await this.validateTables();
                return true;
            } else {
                throw new Error('Verbindungstest fehlgeschlagen');
            }

        } catch (error) {
            console.error('Datenbankverbindung fehlgeschlagen:', error.message);

            // Hilfreiche Fehlermeldungen
            if (error.code === 'ELOGIN') {
                console.error('Anmeldung fehlgeschlagen - prüfen Sie Benutzername/Passwort in .env');
            } else if (error.code === 'ETIMEOUT') {
                console.error('Verbindungs-Timeout - prüfen Sie Server-Adresse und Firewall');
            } else if (error.code === 'ENOTFOUND') {
                console.error('Server nicht gefunden - prüfen Sie MSSQL_SERVER in .env');
            }

            this.isConnected = false;
            throw error;
        }
    }

    async validateTables() {
        try {
            const requiredTables = ['ScannBenutzer', 'Sessions', 'QrScans'];
            const existingTables = [];
            const missingTables = [];

            for (const tableName of requiredTables) {
                try {
                    const result = await this.query(`
                        SELECT COUNT(*) as tableCount
                        FROM INFORMATION_SCHEMA.TABLES
                        WHERE TABLE_NAME = ? AND TABLE_SCHEMA = 'dbo'
                    `, [tableName]);

                    if (result.recordset[0].tableCount > 0) {
                        existingTables.push(tableName);

                        // Zeilen zählen für Info - mit korrierter SQL-Syntax
                        try {
                            const countResult = await this.query(`SELECT COUNT(*) as [record_count] FROM dbo.[${tableName}]`);
                            console.success(`Tabelle ${tableName}: ${countResult.recordset[0].record_count} Einträge`);
                        } catch (countError) {
                            console.success(`Tabelle ${tableName}: vorhanden (Zählung fehlgeschlagen: ${countError.message})`);
                        }
                    } else {
                        missingTables.push(tableName);
                    }
                } catch (error) {
                    console.error(`❌ Fehler beim Prüfen der Tabelle ${tableName}:`, error.message);
                    missingTables.push(tableName);
                }
            }

            if (missingTables.length > 0) {
                console.warn(`⚠️ Fehlende Tabellen: ${missingTables.join(', ')}`);
                console.warn('💡 Führen Sie das Datenbank-Setup-Skript aus um fehlende Tabellen zu erstellen');
            }

            return { existingTables, missingTables };

        } catch (error) {
            console.error('Fehler bei Tabellen-Validierung:', error);
            return { existingTables: [], missingTables: [] };
        }
    }

    async query(queryString, parameters = []) {
        if (!this.isConnected || !this.pool) {
            throw new Error('Datenbank nicht verbunden');
        }

        try {
            const request = this.pool.request();

            // Parameter hinzufügen mit korrekten SQL-Typen
            parameters.forEach((param, index) => {
                let sqlType = sql.NVarChar;

                if (typeof param === 'number') {
                    if (Number.isInteger(param)) {
                        sqlType = param > 2147483647 ? sql.BigInt : sql.Int;
                    } else {
                        sqlType = sql.Float;
                    }
                } else if (typeof param === 'boolean') {
                    sqlType = sql.Bit;
                } else if (param instanceof Date) {
                    sqlType = sql.DateTime2;
                } else if (param === null || param === undefined) {
                    sqlType = sql.NVarChar;
                }

                request.input(`param${index}`, sqlType, param);
            });

            // ? Platzhalter durch @param0, @param1, etc. ersetzen
            let processedQuery = queryString;
            let paramIndex = 0;
            processedQuery = processedQuery.replace(/\?/g, () => `@param${paramIndex++}`);

            console.database('Führe Query aus:', processedQuery.substring(0, 200) + (processedQuery.length > 200 ? '...' : ''));
            if (parameters.length > 0) {
                console.info('Parameter:', parameters);
            }

            const result = await request.query(processedQuery);

            console.success(`Query erfolgreich. Betroffene Zeilen: ${result.rowsAffected}, Datensätze: ${result.recordset?.length || 0}`);

            return result;

        } catch (error) {
            console.error('Datenbank-Query-Fehler:', error.message);
            console.error('Query:', queryString.substring(0, 200));
            console.error('Parameter:', parameters);
            throw error;
        }
    }

    async close() {
        if (this.cacheCleanupInterval) {
            clearInterval(this.cacheCleanupInterval);
            this.cacheCleanupInterval = null;
        }

        if (this.pool) {
            try {
                await this.pool.close();
                this.pool = null;
                this.isConnected = false;
                console.success('Datenbankverbindung geschlossen');
            } catch (error) {
                console.error('Fehler beim Schließen der Datenbankverbindung:', error);
            }
        }
    }

    // ===== BENUTZER-OPERATIONEN =====
    async getUserByEPC(epcHex) {
        try {
            const epcDecimal = parseInt(epcHex, 16);
            console.log(`Suche Benutzer für EPC: ${epcHex} (${epcDecimal})`);

            const result = await this.query(`
                SELECT ID, Vorname, Nachname, BenutzerName, Email, EPC
                FROM dbo.ScannBenutzer
                WHERE EPC = ? AND xStatus = 0
            `, [epcDecimal]);

            if (result.recordset.length > 0) {
                const user = result.recordset[0];
                console.log(`✅ Benutzer gefunden: ${user.BenutzerName}`);
                return user;
            } else {
                console.log(`❌ Kein Benutzer gefunden für EPC: ${epcHex}`);
                return null;
            }
        } catch (error) {
            console.error('Fehler beim Abrufen des Benutzers nach EPC:', error);
            return null;
        }
    }

    // ===== SESSION MANAGEMENT =====
    async createSession(userId) {
        try {
            console.log(`Erstelle neue Session für Benutzer ID: ${userId}`);

            // Erst alle bestehenden aktiven Sessions des Benutzers beenden
            await this.query(`
                UPDATE dbo.Sessions
                SET EndTS = SYSDATETIME(), Active = 0
                WHERE UserID = ? AND Active = 1
            `, [userId]);

            // Neue Session erstellen mit deutscher Zeitzone-Behandlung
            const result = await this.query(`
                INSERT INTO dbo.Sessions (UserID, StartTS, Active)
                    OUTPUT INSERTED.ID, INSERTED.StartTS
                VALUES (?, SYSDATETIME(), 1)
            `, [userId]);

            if (result.recordset.length > 0) {
                const session = result.recordset[0];
                console.log(`✅ Session erstellt: ID ${session.ID}`);
                return session;
            }
            return null;
        } catch (error) {
            console.error('Fehler beim Erstellen der Session:', error);
            return null;
        }
    }

    async endSession(sessionId) {
        try {
            console.log(`Beende Session: ${sessionId}`);

            const result = await this.query(`
                UPDATE dbo.Sessions
                SET EndTS = SYSDATETIME(), Active = 0
                WHERE ID = ? AND Active = 1
            `, [sessionId]);

            const success = result.rowsAffected && result.rowsAffected[0] > 0;

            if (success) {
                console.log(`✅ Session ${sessionId} erfolgreich beendet`);
            } else {
                console.log(`⚠️ Session ${sessionId} war bereits beendet oder nicht gefunden`);
            }

            return success;
        } catch (error) {
            console.error('Fehler beim Beenden der Session:', error);
            return false;
        }
    }

    async getActiveSession(userId) {
        try {
            const result = await this.query(`
                SELECT ID, StartTS,
                       DATEDIFF(SECOND, StartTS, SYSDATETIME()) as DurationSeconds
                FROM dbo.Sessions
                WHERE UserID = ? AND Active = 1
            `, [userId]);

            return result.recordset.length > 0 ? result.recordset[0] : null;
        } catch (error) {
            console.error('Fehler beim Abrufen der aktiven Session:', error);
            return null;
        }
    }

    // ===== QR-SCAN OPERATIONEN MIT VERBESSERTER DUPLIKAT-BEHANDLUNG =====
    async saveQRScan(sessionId, payload) {
        const cacheKey = `${sessionId}_${payload}`;

        try {
            console.log(`Speichere QR-Scan für Session ${sessionId}`);

            // 1. Prüfe ob bereits in Verarbeitung
            if (this.pendingScans.has(cacheKey)) {
                return {
                    success: false,
                    status: 'processing',
                    message: 'QR-Code wird bereits verarbeitet'
                };
            }

            // 2. Markiere als in Verarbeitung
            this.pendingScans.set(cacheKey, Date.now());

            // 3. Prüfe Cache (nur 5 Minuten)
            const cachedTime = this.duplicateCache.get(payload);
            if (cachedTime) {
                const minutesSinceCache = (Date.now() - cachedTime) / (1000 * 60);
                if (minutesSinceCache < 5) { // Nur 5 Minuten statt 24 Stunden
                    return {
                        success: false,
                        status: 'duplicate_cache',
                        message: `QR-Code wurde vor ${Math.round(minutesSinceCache)} Minuten bereits gescannt`,
                        duplicateInfo: {
                            lastScan: new Date(cachedTime),
                            minutesAgo: Math.round(minutesSinceCache)
                        }
                    };
                }
            }

            // 4. Prüfe auf Duplikate in Datenbank (nur 10 Minuten statt 24 Stunden)
            const duplicateInfo = await this.checkQRDuplicate(payload, 10); // 10 Minuten statt 24 Stunden
            if (duplicateInfo.isDuplicate) {
                // Cache-Update
                this.duplicateCache.set(payload, Date.now());
                return {
                    success: false,
                    status: 'duplicate_database',
                    message: `QR-Code wurde bereits ${duplicateInfo.count} mal in den letzten 10 Minuten gescannt`,
                    duplicateInfo: duplicateInfo
                };
            }

            // 5. QR-Scan speichern mit Transaction für Atomarität
            const result = await this.transaction(async (request) => {
                // Nochmalige Duplikat-Prüfung innerhalb der Transaction (nur 10 Minuten)
                const finalDupCheck = await request.query(`
                    SELECT COUNT(*) as duplicateCount
                    FROM dbo.QrScans
                    WHERE RawPayload = @payload
                      AND CapturedTS >= DATEADD(MINUTE, -10, SYSDATETIME())
                      AND Valid = 1
                `, {
                    payload: { type: sql.NVarChar, value: payload }
                });

                if (finalDupCheck.recordset[0].duplicateCount > 0) {
                    return {
                        success: false,
                        status: 'duplicate_transaction',
                        message: 'QR-Code wurde zwischenzeitlich von anderem Scan erfasst'
                    };
                }

                // Einfügen
                const insertResult = await request.query(`
                    INSERT INTO dbo.QrScans (SessionID, RawPayload, Valid, CapturedTS)
                        OUTPUT INSERTED.ID, INSERTED.CapturedTS
                    VALUES (@sessionId, @payload, 1, SYSDATETIME())
                `, {
                    sessionId: { type: sql.BigInt, value: sessionId },
                    payload: { type: sql.NVarChar, value: payload }
                });

                return {
                    success: true,
                    status: 'saved',
                    data: insertResult.recordset[0],
                    message: 'QR-Code erfolgreich gespeichert'
                };
            });

            if (result.success) {
                // Erfolgreich gespeichert - Cache aktualisieren
                this.duplicateCache.set(payload, Date.now());
                console.log(`✅ QR-Scan gespeichert: ID ${result.data.ID}`);
            }

            return result;

        } catch (error) {
            console.error('Fehler beim Speichern des QR-Scans:', error);
            return {
                success: false,
                status: 'error',
                message: `Speicherfehler: ${error.message}`,
                error: error
            };
        } finally {
            // Immer aus Pending-Set entfernen
            this.pendingScans.delete(cacheKey);
        }
    }

    async checkQRDuplicate(payload, timeWindowMinutes = 10) { // Geändert auf Minuten statt Stunden
        try {
            // Prüfe auf Duplikate in den letzten X Minuten (Standard: 10 Minuten)
            const result = await this.query(`
                SELECT COUNT(*) as duplicateCount,
                       MAX(CapturedTS) as lastScanTime
                FROM dbo.QrScans
                WHERE RawPayload = ?
                  AND CapturedTS >= DATEADD(MINUTE, -?, SYSDATETIME())
                  AND Valid = 1
            `, [payload, timeWindowMinutes]);

            const count = result.recordset[0].duplicateCount;
            const lastScanTime = result.recordset[0].lastScanTime;

            if (count > 0) {
                console.log(`⚠️ QR-Code Duplikat erkannt: ${count} mal in den letzten ${timeWindowMinutes} Minuten`);
                return {
                    isDuplicate: true,
                    count: count,
                    lastScanTime: lastScanTime,
                    timeWindowMinutes: timeWindowMinutes
                };
            }

            return {
                isDuplicate: false,
                count: 0,
                timeWindowMinutes: timeWindowMinutes
            };
        } catch (error) {
            console.error('Fehler bei Duplikat-Prüfung:', error);
            // Bei Fehler: Als neu behandeln (sicherer Fallback)
            return {
                isDuplicate: false,
                count: 0,
                error: error.message
            };
        }
    }

    async getSessionScans(sessionId, limit = 50) {
        try {
            const result = await this.query(`
                SELECT TOP(?) ID, RawPayload, CapturedTS, Valid
                FROM dbo.QrScans
                WHERE SessionID = ?
                ORDER BY CapturedTS DESC
            `, [limit, sessionId]);

            return result.recordset || [];
        } catch (error) {
            console.error('Fehler beim Abrufen der Session-Scans:', error);
            return [];
        }
    }

    // ===== STATISTIKEN & BERICHTE =====
    async getDailyStats(date = null) {
        try {
            const targetDate = date || new Date().toISOString().split('T')[0];

            const result = await this.query(`
                SELECT
                        (SELECT COUNT(*) FROM dbo.Sessions WHERE CAST(StartTS AS DATE) = ?) as TotalSessions,
                        (SELECT COUNT(*) FROM dbo.QrScans WHERE CAST(CapturedTS AS DATE) = ? AND Valid = 1) as TotalScans,
                        (SELECT COUNT(DISTINCT s.UserID) FROM dbo.Sessions s WHERE CAST(s.StartTS AS DATE) = ?) as UniqueUsers,
                        (SELECT AVG(CAST(DATEDIFF(MINUTE, StartTS, ISNULL(EndTS, SYSDATETIME())) AS FLOAT))
                         FROM dbo.Sessions WHERE CAST(StartTS AS DATE) = ?) as AvgSessionMinutes
            `, [targetDate, targetDate, targetDate, targetDate]);

            return result.recordset.length > 0 ? result.recordset[0] : null;
        } catch (error) {
            console.error('Fehler beim Abrufen der Tagesstatistiken:', error);
            return null;
        }
    }

    async getRecentActivity(hours = 8) {
        try {
            const result = await this.query(`
                SELECT
                    'session' as EventType,
                    s.StartTS as EventTime,
                    u.BenutzerName as UserName,
                    'Login' as Action,
                    NULL as Details
                FROM dbo.Sessions s
                    INNER JOIN dbo.ScannBenutzer u ON s.UserID = u.ID
                WHERE s.StartTS >= DATEADD(HOUR, -?, SYSDATETIME())

                UNION ALL

                SELECT
                    'session' as EventType,
                    s.EndTS as EventTime,
                    u.BenutzerName as UserName,
                    'Logout' as Action,
                    CAST(DATEDIFF(MINUTE, s.StartTS, s.EndTS) AS VARCHAR) + ' min' as Details
                FROM dbo.Sessions s
                    INNER JOIN dbo.ScannBenutzer u ON s.UserID = u.ID
                WHERE s.EndTS >= DATEADD(HOUR, -?, SYSDATETIME())
                  AND s.EndTS IS NOT NULL

                UNION ALL

                SELECT
                    'qr_scan' as EventType,
                    q.CapturedTS as EventTime,
                    u.BenutzerName as UserName,
                    'QR-Scan' as Action,
                    LEFT(q.RawPayload, 50) as Details
                FROM dbo.QrScans q
                    INNER JOIN dbo.Sessions s ON q.SessionID = s.ID
                    INNER JOIN dbo.ScannBenutzer u ON s.UserID = u.ID
                WHERE q.CapturedTS >= DATEADD(HOUR, -?, SYSDATETIME())
                  AND q.Valid = 1

                ORDER BY EventTime DESC
            `, [hours, hours, hours]);

            return result.recordset || [];
        } catch (error) {
            console.error('Fehler beim Abrufen der letzten Aktivitäten:', error);
            return [];
        }
    }

    // ===== HEALTH CHECK & DIAGNOSTICS =====
    async healthCheck() {
        try {
            const startTime = Date.now();

            // Basis-Konnektivitätstest
            const connectTest = await this.query('SELECT 1 as test, SYSDATETIME() as currentTime');
            const connectionTime = Date.now() - startTime;

            // Server-Informationen
            const serverInfo = await this.query(`
                SELECT 
                    @@VERSION as ServerVersion,
                    DB_NAME() as DatabaseName,
                    SUSER_NAME() as CurrentUser,
                    SYSDATETIME() as ServerTime,
                    @@SERVERNAME as ServerName
            `);

            // Tabellen-Statistiken
            const tableStats = await this.query(`
                SELECT
                        (SELECT COUNT(*) FROM dbo.ScannBenutzer WHERE xStatus = 0) as ActiveUsers,
                        (SELECT COUNT(*) FROM dbo.Sessions) as TotalSessions,
                        (SELECT COUNT(*) FROM dbo.Sessions WHERE Active = 1) as ActiveSessions,
                        (SELECT COUNT(*) FROM dbo.QrScans WHERE Valid = 1) as TotalValidScans,
                        (SELECT COUNT(*) FROM dbo.QrScans WHERE CAST(CapturedTS AS DATE) = CAST(SYSDATETIME() AS DATE) AND Valid = 1) as TodayScans
            `);

            return {
                connected: true,
                connectionTime: connectionTime,
                server: serverInfo.recordset[0],
                stats: tableStats.recordset[0],
                timestamp: new Date().toISOString(),
                duplicateCache: {
                    size: this.duplicateCache.size,
                    pendingScans: this.pendingScans.size
                }
            };

        } catch (error) {
            return {
                connected: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // ===== TRANSACTION SUPPORT =====
    async transaction(callback) {
        const transaction = new sql.Transaction(this.pool);

        try {
            await transaction.begin();

            // Custom Request-Objekt mit Parameter-Unterstützung
            const customRequest = {
                query: async (queryString, params = {}) => {
                    const request = new sql.Request(transaction);

                    // Parameter hinzufügen
                    for (const [key, paramConfig] of Object.entries(params)) {
                        if (paramConfig.type && paramConfig.value !== undefined) {
                            request.input(key, paramConfig.type, paramConfig.value);
                        }
                    }

                    return await request.query(queryString);
                }
            };

            const result = await callback(customRequest);

            await transaction.commit();
            return result;

        } catch (error) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error('Fehler beim Rollback der Transaktion:', rollbackError);
            }
            throw error;
        }
    }

    // ===== UTILITY METHODS =====
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

    async testConnection() {
        try {
            const result = await this.query('SELECT SYSDATETIME() as currentTime, @@VERSION as version');
            return {
                success: true,
                serverTime: result.recordset[0].currentTime,
                version: result.recordset[0].version.split('\n')[0] // Nur erste Zeile
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== HELPER METHODS =====
    formatSQLDateTime(date) {
        // Formatiert JavaScript Date für SQL Server
        return date.toISOString().slice(0, 19).replace('T', ' ');
    }

    parseSQLDateTime(sqlDateTime) {
        // Parst SQL Server DateTime zu JavaScript Date
        return new Date(sqlDateTime);
    }

    // ===== DEBUGGING METHODS =====
    async debugInfo() {
        try {
            const health = await this.healthCheck();
            const connectionStatus = this.getConnectionStatus();

            console.log('=== DATABASE DEBUG INFO ===');
            console.log('Connection Status:', connectionStatus);
            console.log('Health Check:', health);
            console.log('============================');

            return { connectionStatus, health };
        } catch (error) {
            console.error('Debug Info Fehler:', error);
            return { error: error.message };
        }
    }

    // ===== CACHE MANAGEMENT =====
    clearDuplicateCache() {
        const oldSize = this.duplicateCache.size;
        this.duplicateCache.clear();
        console.log(`🧹 Duplikat-Cache geleert: ${oldSize} Einträge entfernt`);
    }

    getDuplicateCacheStats() {
        return {
            size: this.duplicateCache.size,
            pendingScans: this.pendingScans.size,
            oldestEntry: this.duplicateCache.size > 0 ? Math.min(...this.duplicateCache.values()) : null,
            newestEntry: this.duplicateCache.size > 0 ? Math.max(...this.duplicateCache.values()) : null
        };
    }
}

module.exports = DatabaseClient;