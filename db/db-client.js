const sql = require('mssql');
require('dotenv').config();

// Console-Utils für bessere Ausgabe - mit Fallback
let customConsole;
try {
    customConsole = require('../utils/console-utils');
} catch (error) {
    // Fallback auf Standard-Console
    customConsole = {
        success: (msg, ...args) => console.log('[OK]', msg, ...args),
        error: (msg, ...args) => console.error('[ERROR]', msg, ...args),
        warning: (msg, ...args) => console.warn('[WARN]', msg, ...args),
        info: (msg, ...args) => console.log('[INFO]', msg, ...args),
        database: (msg, ...args) => console.log('[DB]', msg, ...args),
        log: (level, msg, ...args) => console.log(`[${level.toUpperCase()}]`, msg, ...args)
    };
}

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
                useUTC: false // Wichtig für korrekte Zeitstempel-Behandlung
            },
            pool: {
                max: parseInt(process.env.MSSQL_POOL_MAX) || 10,
                min: parseInt(process.env.MSSQL_POOL_MIN) || 0,
                idleTimeoutMillis: parseInt(process.env.MSSQL_POOL_IDLE_TIMEOUT) || 30000,
            }
        };

        customConsole.database('Database client initialisiert mit Konfiguration:', {
            server: this.config.server,
            database: this.config.database,
            user: this.config.user,
            port: this.config.port,
            encrypt: this.config.options.encrypt,
            useUTC: this.config.options.useUTC
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
            console.log(`[CLEAN] Duplikat-Cache bereinigt: ${cleanedCount} Einträge entfernt`);
        }
    }

    async connect() {
        if (this.isConnected && this.pool) {
            console.log('[INFO] Datenbank bereits verbunden');
            return true;
        }

        try {
            customConsole.database('Verbinde mit SQL Server...');
            customConsole.info(`Server: ${this.config.server}:${this.config.port}`);
            customConsole.info(`Datenbank: ${this.config.database}`);
            customConsole.info(`Benutzer: ${this.config.user}`);

            // Connection Pool erstellen
            this.pool = await sql.connect(this.config);

            // Verbindung testen
            const result = await this.pool.request().query('SELECT 1 as test, SYSDATETIME() as serverTime');

            if (result.recordset && result.recordset[0].test === 1) {
                this.isConnected = true;
                customConsole.success('Datenbank erfolgreich verbunden');
                customConsole.info(`Server-Zeit: ${result.recordset[0].serverTime}`);

                // Tabellen validieren
                await this.validateTables();
                return true;
            } else {
                throw new Error('Verbindungstest fehlgeschlagen');
            }

        } catch (error) {
            customConsole.error('Datenbankverbindung fehlgeschlagen:', error.message);

            // Hilfreiche Fehlermeldungen
            if (error.code === 'ELOGIN') {
                customConsole.error('Anmeldung fehlgeschlagen - prüfen Sie Benutzername/Passwort in .env');
            } else if (error.code === 'ETIMEOUT') {
                customConsole.error('Verbindungs-Timeout - prüfen Sie Server-Adresse und Firewall');
            } else if (error.code === 'ENOTFOUND') {
                customConsole.error('Server nicht gefunden - prüfen Sie MSSQL_SERVER in .env');
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
                            customConsole.success(`Tabelle ${tableName}: ${countResult.recordset[0].record_count} Einträge`);
                        } catch (countError) {
                            customConsole.success(`Tabelle ${tableName}: vorhanden (Zählung fehlgeschlagen: ${countError.message})`);
                        }
                    } else {
                        missingTables.push(tableName);
                    }
                } catch (error) {
                    customConsole.error(`Fehler beim Prüfen der Tabelle ${tableName}:`, error.message);
                    missingTables.push(tableName);
                }
            }

            if (missingTables.length > 0) {
                customConsole.warning(`Fehlende Tabellen: ${missingTables.join(', ')}`);
                customConsole.warning('Führen Sie das Datenbank-Setup-Skript aus um fehlende Tabellen zu erstellen');
            }

            return { existingTables, missingTables };

        } catch (error) {
            customConsole.error('Fehler bei Tabellen-Validierung:', error);
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

            customConsole.database('Führe Query aus:', processedQuery.substring(0, 200) + (processedQuery.length > 200 ? '...' : ''));
            if (parameters.length > 0) {
                customConsole.info('Parameter:', parameters);
            }

            const result = await request.query(processedQuery);

            customConsole.success(`Query erfolgreich. Betroffene Zeilen: ${result.rowsAffected}, Datensätze: ${result.recordset?.length || 0}`);

            return result;

        } catch (error) {
            customConsole.error('Datenbank-Query-Fehler:', error.message);
            customConsole.error('Query:', queryString.substring(0, 200));
            customConsole.error('Parameter:', parameters);
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
                customConsole.success('Datenbankverbindung geschlossen');
            } catch (error) {
                customConsole.error('Fehler beim Schließen der Datenbankverbindung:', error);
            }
        }
    }

    // ===== BENUTZER-OPERATIONEN =====
    async getUserByEPC(epcHex) {
        try {
            const epcDecimal = parseInt(epcHex, 16);
            console.log(`[INFO] Suche Benutzer für EPC: ${epcHex} (${epcDecimal})`);

            const result = await this.query(`
                SELECT ID, Vorname, Nachname, BenutzerName, Email, EPC
                FROM dbo.ScannBenutzer
                WHERE EPC = ? AND xStatus = 0
            `, [epcDecimal]);

            if (result.recordset.length > 0) {
                const user = result.recordset[0];
                customConsole.success(`Benutzer gefunden: ${user.BenutzerName}`);
                return user;
            } else {
                console.log(`[WARN] Kein Benutzer gefunden für EPC: ${epcHex}`);
                return null;
            }
        } catch (error) {
            customConsole.error('Fehler beim Abrufen des Benutzers nach EPC:', error);
            return null;
        }
    }

    // ===== SESSION MANAGEMENT MIT SESSIONTYPE-UNTERSTÜTZUNG =====

    /**
     * Erweiterte createSession Methode mit SessionType-Unterstützung
     * @param {number} userId - Benutzer-ID
     * @param {number|string} sessionType - SessionType ID oder Name (default: 'Wareneingang')
     * @returns {Object|null} - Neue Session oder null bei Fehler
     */
    async createSession(userId, sessionType = 'Wareneingang') {
        try {
            customConsole.info(`Session wird erstellt für User ${userId}, SessionType: ${sessionType}`);

            // Bestehende aktive Sessions für diesen User beenden
            await this.query(`
                UPDATE dbo.Sessions
                SET EndTS = SYSDATETIME(), Active = 0
                WHERE UserID = ? AND Active = 1
            `, [userId]);

            // SessionType ID ermitteln
            let sessionTypeId;

            if (typeof sessionType === 'number') {
                // SessionType ist bereits eine ID
                sessionTypeId = sessionType;
            } else {
                // SessionType Name zu ID konvertieren
                const typeResult = await this.query(`
                    SELECT ID FROM dbo.SessionTypes
                    WHERE TypeName = ? AND IsActive = 1
                `, [sessionType]);

                if (typeResult.recordset.length === 0) {
                    throw new Error(`SessionType '${sessionType}' nicht gefunden`);
                }

                sessionTypeId = typeResult.recordset[0].ID;
            }

            // Neue Session erstellen mit SessionType
            const result = await this.query(`
                INSERT INTO dbo.Sessions (UserID, StartTS, Active, SessionTypeID)
                    OUTPUT INSERTED.ID, INSERTED.StartTS, INSERTED.SessionTypeID
                VALUES (?, SYSDATETIME(), 1, ?)
            `, [userId, sessionTypeId]);

            if (result.recordset.length > 0) {
                const session = result.recordset[0];

                // SessionType-Info für Rückgabe laden
                const sessionWithType = await this.getSessionWithType(session.ID);

                customConsole.success(`Session erstellt: ID ${session.ID}, Type: ${sessionWithType.SessionTypeName}, Start: ${session.StartTS}`);
                return sessionWithType;
            }
            return null;
        } catch (error) {
            customConsole.error('Fehler beim Erstellen der Session:', error);
            return null;
        }
    }

    /**
     * Session mit SessionType-Informationen abrufen
     * @param {number} sessionId - Session ID
     * @returns {Object|null} - Session mit SessionType-Details
     */
    async getSessionWithType(sessionId) {
        try {
            const result = await this.query(`
                SELECT
                    s.ID,
                    s.UserID,
                    s.StartTS,
                    s.EndTS,
                    s.Active,
                    s.SessionTypeID,
                    st.TypeName as SessionTypeName,
                    st.Description as SessionTypeDescription,
                    DATEDIFF(SECOND, s.StartTS, ISNULL(s.EndTS, SYSDATETIME())) as DurationSeconds
                FROM dbo.Sessions s
                         LEFT JOIN dbo.SessionTypes st ON s.SessionTypeID = st.ID
                WHERE s.ID = ?
            `, [sessionId]);

            if (result.recordset.length > 0) {
                const session = result.recordset[0];
                return {
                    ...session,
                    StartTS: this.normalizeTimestamp(session.StartTS),
                    EndTS: session.EndTS ? this.normalizeTimestamp(session.EndTS) : null
                };
            }
            return null;
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der Session:', error);
            return null;
        }
    }

    /**
     * Alle aktiven Sessions mit SessionType-Informationen abrufen
     * @returns {Array} - Array von aktiven Sessions mit SessionType-Details
     */
    async getActiveSessionsWithType() {
        try {
            const result = await this.query(`
                SELECT
                    s.ID,
                    s.UserID,
                    s.StartTS,
                    s.SessionTypeID,
                    st.TypeName as SessionTypeName,
                    st.Description as SessionTypeDescription,
                    sb.Vorname,
                    sb.Nachname,
                    sb.Benutzer,
                    sb.BenutzerName,
                    DATEDIFF(SECOND, s.StartTS, SYSDATETIME()) as DurationSeconds
                FROM dbo.Sessions s
                         LEFT JOIN dbo.SessionTypes st ON s.SessionTypeID = st.ID
                         LEFT JOIN dbo.ScannBenutzer sb ON s.UserID = sb.ID
                WHERE s.Active = 1
                ORDER BY s.StartTS ASC
            `);

            return result.recordset.map(session => ({
                ...session,
                StartTS: this.normalizeTimestamp(session.StartTS),
                FullName: `${session.Vorname || ''} ${session.Nachname || ''}`.trim()
            }));
        } catch (error) {
            customConsole.error('Fehler beim Abrufen aktiver Sessions:', error);
            return [];
        }
    }

    /**
     * Alle verfügbaren SessionTypes abrufen
     * @returns {Array} - Array von verfügbaren SessionTypes
     */
    async getSessionTypes() {
        try {
            const result = await this.query(`
                SELECT ID, TypeName, Description
                FROM dbo.SessionTypes
                WHERE IsActive = 1
                ORDER BY TypeName
            `);

            return result.recordset;
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der SessionTypes:', error);
            return [];
        }
    }

    /**
     * SessionType-Statistiken abrufen
     * @param {Date} startDate - Startdatum für Statistik (optional)
     * @param {Date} endDate - Enddatum für Statistik (optional)
     * @returns {Array} - Statistiken pro SessionType
     */
    async getSessionTypeStats(startDate = null, endDate = null) {
        try {
            let whereClause = '';
            let params = [];

            if (startDate && endDate) {
                whereClause = 'WHERE s.StartTS >= ? AND s.StartTS <= ?';
                params = [startDate, endDate];
            }

            const result = await this.query(`
                SELECT
                    st.TypeName,
                    st.Description,
                    COUNT(s.ID) as TotalSessions,
                    COUNT(CASE WHEN s.Active = 1 THEN 1 END) as ActiveSessions,
                    AVG(CASE WHEN s.EndTS IS NOT NULL
                                 THEN DATEDIFF(SECOND, s.StartTS, s.EndTS)
                             ELSE NULL END) as AvgDurationSeconds,
                    SUM(CASE WHEN s.EndTS IS NOT NULL
                                 THEN DATEDIFF(SECOND, s.StartTS, s.EndTS)
                             ELSE 0 END) as TotalDurationSeconds
                FROM dbo.SessionTypes st
                         LEFT JOIN dbo.Sessions s ON st.ID = s.SessionTypeID ${whereClause}
                GROUP BY st.ID, st.TypeName, st.Description
                ORDER BY TotalSessions DESC
            `, params);

            return result.recordset.map(stat => ({
                ...stat,
                AvgDurationMinutes: stat.AvgDurationSeconds ? Math.round(stat.AvgDurationSeconds / 60) : 0,
                TotalDurationHours: Math.round(stat.TotalDurationSeconds / 3600 * 100) / 100
            }));
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der SessionType-Statistiken:', error);
            return [];
        }
    }

    /**
     * QR-Scans mit SessionType-Kontext abrufen
     * @param {number} sessionId - Session ID (optional)
     * @param {string} sessionTypeName - SessionType Name (optional)
     * @returns {Array} - QR-Scans mit SessionType-Informationen
     */
    async getQrScansWithSessionType(sessionId = null, sessionTypeName = null) {
        try {
            let whereClause = '';
            let params = [];

            if (sessionId) {
                whereClause = 'WHERE qr.SessionID = ?';
                params = [sessionId];
            } else if (sessionTypeName) {
                whereClause = 'WHERE st.TypeName = ?';
                params = [sessionTypeName];
            }

            const result = await this.query(`
                SELECT
                    qr.ID,
                    qr.SessionID,
                    qr.RawPayload,
                    qr.PayloadJson,
                    qr.CapturedTS,
                    s.UserID,
                    st.TypeName as SessionTypeName,
                    sb.Vorname,
                    sb.Nachname,
                    sb.Benutzer
                FROM dbo.QrScans qr
                         INNER JOIN dbo.Sessions s ON qr.SessionID = s.ID
                         LEFT JOIN dbo.SessionTypes st ON s.SessionTypeID = st.ID
                         LEFT JOIN dbo.ScannBenutzer sb ON s.UserID = sb.ID
                    ${whereClause}
                ORDER BY qr.CapturedTS DESC
            `, params);

            return result.recordset.map(scan => ({
                ...scan,
                CapturedTS: this.normalizeTimestamp(scan.CapturedTS),
                UserFullName: `${scan.Vorname || ''} ${scan.Nachname || ''}`.trim()
            }));
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der QR-Scans:', error);
            return [];
        }
    }

    async endSession(sessionId) {
        try {
            console.log(`[INFO] Beende Session: ${sessionId}`);

            const result = await this.query(`
                UPDATE dbo.Sessions
                SET EndTS = SYSDATETIME(), Active = 0
                WHERE ID = ? AND Active = 1
            `, [sessionId]);

            const success = result.rowsAffected && result.rowsAffected[0] > 0;

            if (success) {
                customConsole.success(`Session ${sessionId} erfolgreich beendet`);
            } else {
                console.log(`[WARN] Session ${sessionId} war bereits beendet oder nicht gefunden`);
            }

            return success;
        } catch (error) {
            customConsole.error('Fehler beim Beenden der Session:', error);
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

            if (result.recordset.length > 0) {
                const session = result.recordset[0];
                return {
                    ...session,
                    StartTS: this.normalizeTimestamp(session.StartTS)
                };
            }

            return null;
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der aktiven Session:', error);
            return null;
        }
    }

    async getSessionDuration(sessionId) {
        try {
            const result = await this.query(`
                SELECT
                    ID,
                    StartTS,
                    EndTS,
                    Active,
                    DATEDIFF(SECOND, StartTS, ISNULL(EndTS, SYSDATETIME())) as DurationSeconds
                FROM dbo.Sessions
                WHERE ID = ?
            `, [sessionId]);

            if (result.recordset.length === 0) {
                return null;
            }

            const session = result.recordset[0];
            return {
                sessionId: session.ID,
                startTime: this.normalizeTimestamp(session.StartTS),
                endTime: session.EndTS ? this.normalizeTimestamp(session.EndTS) : null,
                duration: session.DurationSeconds * 1000, // in Millisekunden
                isActive: session.Active === 1,
                formattedDuration: this.formatSessionDuration(session.DurationSeconds)
            };
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der Session-Dauer:', error);
            return null;
        }
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

    // ===== ZEITSTEMPEL-NORMALISIERUNG =====
    normalizeTimestamp(timestamp) {
        try {
            if (!timestamp) {
                console.warn('[WARN] Leerer Zeitstempel für Normalisierung');
                return new Date().toISOString();
            }

            let date;

            if (timestamp instanceof Date) {
                date = timestamp;
            } else if (typeof timestamp === 'string') {
                // SQL Server DateTime strings richtig parsen
                if (timestamp.includes('T')) {
                    // ISO-Format
                    date = new Date(timestamp);
                } else {
                    // SQL Server Format: "2024-06-24 13:01:30.000"
                    const isoString = timestamp.replace(' ', 'T');
                    date = new Date(isoString);
                }
            } else {
                // Fallback für andere Typen
                date = new Date(timestamp);
            }

            // Validierung
            if (isNaN(date.getTime())) {
                console.warn('[WARN] Ungültiger Zeitstempel für Normalisierung:', timestamp);
                return new Date().toISOString();
            }

            // ISO-String zurückgeben für konsistente Verarbeitung
            return date.toISOString();

        } catch (error) {
            customConsole.error('Fehler bei Zeitstempel-Normalisierung:', error, timestamp);
            return new Date().toISOString();
        }
    }

    // ===== ZEITSTEMPEL-HILFSMETHODEN =====
    formatSQLDateTime(date) {
        try {
            if (!(date instanceof Date)) {
                date = new Date(date);
            }

            if (isNaN(date.getTime())) {
                throw new Error('Ungültiges Datum');
            }

            // Formatiert JavaScript Date für SQL Server (ISO-Format ohne T)
            return date.toISOString().slice(0, 19).replace('T', ' ');
        } catch (error) {
            customConsole.error('Fehler bei SQL-DateTime-Formatierung:', error);
            return new Date().toISOString().slice(0, 19).replace('T', ' ');
        }
    }

    parseSQLDateTime(sqlDateTime) {
        try {
            return this.normalizeTimestamp(sqlDateTime);
        } catch (error) {
            customConsole.error('Fehler beim Parsen des SQL-DateTime:', error);
            return new Date().toISOString();
        }
    }

    // ===== QR-SCAN OPERATIONEN MIT STRUKTURIERTEN RETURN-VALUES =====
    async saveQRScan(sessionId, payload) {
        const cacheKey = `${sessionId}_${payload}`;
        const now = Date.now();

        try {
            console.log(`[INFO] Speichere QR-Scan für Session ${sessionId}`);

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

            // 3. Prüfe Cache - REDUZIERTES ZEITFENSTER AUF 10 MINUTEN
            const cachedTime = this.duplicateCache.get(payload);
            if (cachedTime) {
                const minutesAgo = Math.floor((now - cachedTime) / (1000 * 60));
                if (minutesAgo < 10) { // 10 Minuten statt 24 Stunden
                    this.duplicateCache.set(payload, now); // Cache aktualisieren
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

            // 4. Prüfe auf Duplikate in Datenbank - REDUZIERTES ZEITFENSTER
            const duplicateInfo = await this.checkQRDuplicate(payload, 0.17); // 10 Minuten (0.17 Stunden)
            if (duplicateInfo.isDuplicate) {
                // Cache-Update auch bei Datenbank-Duplikaten
                this.duplicateCache.set(payload, now);
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

            // 5. QR-Scan speichern mit Transaction für Atomarität
            const result = await this.transaction(async (request) => {
                // Nochmalige Duplikat-Prüfung innerhalb der Transaction (nur kurzes Zeitfenster)
                const finalDupCheck = await request.query(`
                    SELECT COUNT(*) as duplicateCount,
                           MAX(CapturedTS) as lastScanTime
                    FROM dbo.QrScans
                    WHERE RawPayload = @payload
                      AND CapturedTS >= DATEADD(MINUTE, -10, SYSDATETIME())
                      AND Valid = 1
                `, {
                    payload: { type: sql.NVarChar, value: payload }
                });

                if (finalDupCheck.recordset[0].duplicateCount > 0) {
                    const lastScanTime = finalDupCheck.recordset[0].lastScanTime;
                    const minutesAgo = lastScanTime ?
                        Math.floor((now - new Date(lastScanTime).getTime()) / (1000 * 60)) : 0;

                    // Return statt Exception werfen
                    return {
                        success: false,
                        status: 'duplicate_transaction',
                        message: `QR-Code bereits vor ${minutesAgo} Minuten gescannt`,
                        data: null,
                        duplicateInfo: { minutesAgo, source: 'transaction' },
                        timestamp: new Date().toISOString()
                    };
                }

                // Einfügen mit korrekter Zeitstempel-Behandlung
                const insertResult = await request.query(`
                    INSERT INTO dbo.QrScans (SessionID, RawPayload, Valid, CapturedTS)
                        OUTPUT INSERTED.ID, INSERTED.CapturedTS, INSERTED.PayloadJson
                    VALUES (@sessionId, @payload, 1, SYSDATETIME())
                `, {
                    sessionId: { type: sql.BigInt, value: sessionId },
                    payload: { type: sql.NVarChar, value: payload }
                });

                const rawResult = insertResult.recordset[0];

                // Zeitstempel normalisieren
                return {
                    success: true,
                    status: 'saved',
                    message: 'QR-Code erfolgreich gespeichert',
                    data: {
                        ...rawResult,
                        CapturedTS: this.normalizeTimestamp(rawResult.CapturedTS),
                        ParsedPayload: this.parsePayloadJson(rawResult.PayloadJson)
                    },
                    timestamp: new Date().toISOString()
                };
            });

            if (result.success) {
                // Erfolgreich gespeichert - Cache aktualisieren
                this.duplicateCache.set(payload, now);
                customConsole.success(`QR-Scan gespeichert: ID ${result.data.ID}, Zeit: ${result.data.CapturedTS}`);
            }

            return result;

        } catch (error) {
            customConsole.error('Fehler beim Speichern des QR-Scans:', error);
            return {
                success: false,
                status: 'error',
                message: `Datenbankfehler: ${error.message}`,
                data: null,
                timestamp: new Date().toISOString()
            };
        } finally {
            // Immer aus Pending-Set entfernen
            this.pendingScans.delete(cacheKey);
        }
    }

    // ===== NEUE PAYLOADJSON PARSE-METHODEN =====
    parsePayloadJson(payloadJson) {
        if (!payloadJson) return null;

        try {
            const parsed = JSON.parse(payloadJson);

            // Zusätzliche Verarbeitung je nach Type
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

                case 'alphanumeric':
                    // Erweiterte Behandlung für Caret-getrennte Codes (erkannt als alphanumeric)
                    if (parsed.code && parsed.code.includes('^')) {
                        const parts = parsed.code.split('^');
                        return {
                            ...parsed,
                            type: 'caret_separated',
                            parts: parts,
                            fields: {
                                field1: parts[0] || null,
                                field2: parts[1] || null,
                                field3: parts[2] || null,
                                field4: parts[3] || null,
                                field5: parts[4] || null,
                                field6: parts[5] || null
                            },
                            display: `${parts.slice(0, 3).join(' • ')}...`,
                            parts_count: parts.length
                        };
                    }
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
            console.warn('Fehler beim Parsen der PayloadJson:', error);
            return { type: 'error', raw: payloadJson, display: 'Parse Error' };
        }
    }

    // ===== ERWEITERTE QR-SCAN METHODEN =====
    async getQRScansBySession(sessionId, limit = 50) {
        try {
            const result = await this.query(`
                SELECT
                    ID,
                    SessionID,
                    RawPayload,
                    PayloadJson,
                    JSON_VALUE(PayloadJson, '$.type') as PayloadType,
                    CapturedTS,
                    Valid
                FROM dbo.QrScans
                WHERE SessionID = ?
                ORDER BY CapturedTS DESC
                    ${limit > 0 ? `OFFSET 0 ROWS FETCH NEXT ${limit} ROWS ONLY` : ''}
            `, [sessionId]);

            // Erweitere jeden Scan mit geparsten Daten
            const enhancedScans = result.recordset.map(scan => ({
                ...scan,
                CapturedTS: this.normalizeTimestamp(scan.CapturedTS),
                ParsedPayload: this.parsePayloadJson(scan.PayloadJson),
                FormattedTime: this.formatRelativeTime(scan.CapturedTS)
            }));

            return enhancedScans;
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der QR-Scans:', error);
            throw error;
        }
    }

    async getQRScanById(scanId) {
        try {
            const result = await this.query(`
                SELECT
                    ID,
                    SessionID,
                    RawPayload,
                    PayloadJson,
                    JSON_VALUE(PayloadJson, '$.type') as PayloadType,
                    CapturedTS,
                    Valid
                FROM dbo.QrScans
                WHERE ID = ?
            `, [scanId]);

            if (result.recordset.length === 0) {
                return null;
            }

            const scan = result.recordset[0];
            return {
                ...scan,
                CapturedTS: this.normalizeTimestamp(scan.CapturedTS),
                ParsedPayload: this.parsePayloadJson(scan.PayloadJson),
                FormattedTime: this.formatRelativeTime(scan.CapturedTS)
            };
        } catch (error) {
            customConsole.error('Fehler beim Abrufen des QR-Scans:', error);
            throw error;
        }
    }

    async getRecentQRScans(limit = 20) {
        try {
            const result = await this.query(`
                SELECT TOP(${limit})
                    q.ID,
                    q.SessionID,
                       q.RawPayload,
                       q.PayloadJson,
                       JSON_VALUE(q.PayloadJson, '$.type') as PayloadType,
                       q.CapturedTS,
                       q.Valid,
                       u.BenutzerName
                FROM dbo.QrScans q
                         INNER JOIN dbo.Sessions s ON q.SessionID = s.ID
                         INNER JOIN dbo.ScannBenutzer u ON s.UserID = u.ID
                WHERE q.Valid = 1
                ORDER BY q.CapturedTS DESC
            `);

            return result.recordset.map(scan => ({
                ...scan,
                CapturedTS: this.normalizeTimestamp(scan.CapturedTS),
                ParsedPayload: this.parsePayloadJson(scan.PayloadJson),
                FormattedTime: this.formatRelativeTime(scan.CapturedTS)
            }));
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der letzten QR-Scans:', error);
            throw error;
        }
    }

    // ===== QR-SCAN STATISTIKEN =====
    async getQRScanStats(sessionId = null) {
        try {
            const whereClause = sessionId ? 'WHERE SessionID = ?' : '';
            const params = sessionId ? [sessionId] : [];

            const result = await this.query(`
                SELECT
                    COUNT(*) as TotalScans,
                    COUNT(CASE WHEN JSON_VALUE(PayloadJson, '$.type') = 'star_separated' THEN 1 END) as StarSeparated,
                    COUNT(CASE WHEN JSON_VALUE(PayloadJson, '$.type') = 'caret_separated' THEN 1 END) as CaretSeparated,
                    COUNT(CASE WHEN JSON_VALUE(PayloadJson, '$.type') = 'alphanumeric' THEN 1 END) as Alphanumeric,
                    COUNT(CASE WHEN JSON_VALUE(PayloadJson, '$.type') = 'barcode' THEN 1 END) as Barcodes,
                    COUNT(CASE WHEN JSON_VALUE(PayloadJson, '$.type') = 'url' THEN 1 END) as URLs,
                    COUNT(CASE WHEN JSON_VALUE(PayloadJson, '$.type') = 'text' THEN 1 END) as TextCodes,
                    MIN(CapturedTS) as FirstScan,
                    MAX(CapturedTS) as LastScan
                FROM dbo.QrScans
                         ${whereClause}
            `, params);

            const stats = result.recordset[0];
            return {
                ...stats,
                FirstScan: stats.FirstScan ? this.normalizeTimestamp(stats.FirstScan) : null,
                LastScan: stats.LastScan ? this.normalizeTimestamp(stats.LastScan) : null
            };
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der QR-Scan-Statistiken:', error);
            throw error;
        }
    }

    // ===== QR-CODE FORMAT-ERKENNUNG =====
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

    // ===== SUCHFUNKTION =====
    async searchQRScans(searchTerm, sessionId = null, limit = 20) {
        try {
            const whereConditions = [
                "RawPayload LIKE ?",
                "JSON_VALUE(PayloadJson, '$.type') LIKE ?",
                // Suche in strukturierten Daten
                "JSON_QUERY(PayloadJson, '$.parts') LIKE ?",
                "JSON_VALUE(PayloadJson, '$.code') LIKE ?"
            ];

            let whereClause = `WHERE (${whereConditions.join(' OR ')})`;
            let params = [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`];

            if (sessionId) {
                whereClause += " AND SessionID = ?";
                params.push(sessionId);
            }

            const result = await this.query(`
                SELECT TOP ${limit}
                    ID,
                    SessionID,
                       RawPayload,
                       PayloadJson,
                       JSON_VALUE(PayloadJson, '$.type') as PayloadType,
                       CapturedTS
                FROM dbo.QrScans
                         ${whereClause}
                ORDER BY CapturedTS DESC
            `, params);

            return result.recordset.map(scan => ({
                ...scan,
                CapturedTS: this.normalizeTimestamp(scan.CapturedTS),
                ParsedPayload: this.parsePayloadJson(scan.PayloadJson),
                Format: this.getQRCodeFormat(scan.PayloadJson),
                FormattedTime: this.formatRelativeTime(scan.CapturedTS)
            }));
        } catch (error) {
            customConsole.error('Fehler bei QR-Code-Suche:', error);
            throw error;
        }
    }

    // ===== FORMATIERUNGSHILFEN =====
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

    // ===== DUPLIKAT-PRÜFUNG MIT JSON-STRUKTUR =====
    async checkForDuplicates(rawPayload, sessionId, minutesBack = 10) {
        try {
            const result = await this.query(`
                SELECT TOP 1
                    ID,
                    SessionID,
                       RawPayload,
                       PayloadJson,
                       CapturedTS,
                       DATEDIFF(MINUTE, CapturedTS, SYSDATETIME()) as MinutesAgo
                FROM dbo.QrScans
                WHERE RawPayload = ?
                  AND CapturedTS > DATEADD(MINUTE, -?, SYSDATETIME())
                  AND SessionID = ?
                ORDER BY CapturedTS DESC
            `, [rawPayload, minutesBack, sessionId]);

            if (result.recordset.length > 0) {
                const duplicate = result.recordset[0];
                return {
                    isDuplicate: true,
                    previousScan: {
                        ...duplicate,
                        CapturedTS: this.normalizeTimestamp(duplicate.CapturedTS),
                        ParsedPayload: this.parsePayloadJson(duplicate.PayloadJson)
                    }
                };
            }

            return { isDuplicate: false };
        } catch (error) {
            customConsole.error('Fehler bei Duplikat-Prüfung:', error);
            return { isDuplicate: false };
        }
    }

    async checkQRDuplicate(payload, timeWindowHours = 0.17) { // Default: 10 Minuten
        try {
            // Prüfe auf Duplikate in den letzten X Stunden
            const result = await this.query(`
                SELECT COUNT(*) as duplicateCount,
                       MAX(CapturedTS) as lastScanTime
                FROM dbo.QrScans
                WHERE RawPayload = ?
                  AND CapturedTS >= DATEADD(MINUTE, -?, SYSDATETIME())
                  AND Valid = 1
            `, [payload, Math.round(timeWindowHours * 60)]); // Minuten statt Stunden

            const count = result.recordset[0].duplicateCount;
            const lastScanTime = result.recordset[0].lastScanTime;

            if (count > 0) {
                const minutesAgo = lastScanTime ?
                    Math.floor((Date.now() - new Date(lastScanTime).getTime()) / (1000 * 60)) : 0;

                console.log(`[WARN] QR-Code Duplikat erkannt: ${count} mal in den letzten ${Math.round(timeWindowHours * 60)} Minuten`);
                return {
                    isDuplicate: true,
                    count: count,
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
            customConsole.error('Fehler bei Duplikat-Prüfung:', error);
            // Bei Fehler: Als neu behandeln (sicherer Fallback)
            return {
                isDuplicate: false,
                count: 0,
                minutesAgo: 0,
                lastScanTime: null
            };
        }
    }

    async getSessionScans(sessionId, limit = 50) {
        try {
            const result = await this.query(`
                SELECT TOP(?) ID, RawPayload, PayloadJson, CapturedTS, Valid
                FROM dbo.QrScans
                WHERE SessionID = ?
                ORDER BY CapturedTS DESC
            `, [limit, sessionId]);

            // Zeitstempel in allen Scan-Ergebnissen normalisieren
            return result.recordset.map(scan => ({
                ...scan,
                CapturedTS: this.normalizeTimestamp(scan.CapturedTS),
                ParsedPayload: this.parsePayloadJson(scan.PayloadJson)
            })) || [];
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der Session-Scans:', error);
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
            customConsole.error('Fehler beim Abrufen der Tagesstatistiken:', error);
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

            // Zeitstempel in Aktivitäten normalisieren
            return result.recordset.map(activity => ({
                ...activity,
                EventTime: this.normalizeTimestamp(activity.EventTime)
            })) || [];
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der letzten Aktivitäten:', error);
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

            // Zeitstempel in Server-Info normalisieren
            const normalizedServerInfo = {
                ...serverInfo.recordset[0],
                ServerTime: this.normalizeTimestamp(serverInfo.recordset[0].ServerTime)
            };

            return {
                connected: true,
                connectionTime: connectionTime,
                server: normalizedServerInfo,
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
                customConsole.error('Fehler beim Rollback der Transaktion:', rollbackError);
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
                port: this.config.port,
                useUTC: this.config.options.useUTC
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
                serverTime: this.normalizeTimestamp(result.recordset[0].currentTime),
                version: result.recordset[0].version.split('\n')[0] // Nur erste Zeile
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== DEBUGGING METHODS =====
    async debugInfo() {
        try {
            const health = await this.healthCheck();
            const connectionStatus = this.getConnectionStatus();

            console.log('[INFO] === DATABASE DEBUG INFO ===');
            console.log('[INFO] Connection Status:', connectionStatus);
            console.log('[INFO] Health Check:', health);
            console.log('[INFO] ============================');

            return { connectionStatus, health };
        } catch (error) {
            customConsole.error('Debug Info Fehler:', error);
            return { error: error.message };
        }
    }

    // ===== CACHE MANAGEMENT =====
    clearDuplicateCache() {
        const oldSize = this.duplicateCache.size;
        this.duplicateCache.clear();
        console.log(`[CLEAN] Duplikat-Cache geleert: ${oldSize} Einträge entfernt`);
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

// ===== SESSIONTYPE CONSTANTS & UTILITY FUNCTIONS =====

/**
 * Standard SessionTypes für die Anwendung
 */
const SESSION_TYPES = {
    WARENEINGANG: 'Wareneingang',
    QUALITAETSKONTROLLE: 'Qualitätskontrolle',
    KOMMISSIONIERUNG: 'Kommissionierung',
    INVENTUR: 'Inventur',
    WARTUNG: 'Wartung'
};

/**
 * Helper-Funktion zum Erstellen einer Wareneingang-Session
 * @param {DatabaseClient} dbClient - Datenbankverbindung
 * @param {number} userId - Benutzer-ID
 * @returns {Object|null} - Neue Session oder null
 */
async function createWareneingangSession(dbClient, userId) {
    return await dbClient.createSession(userId, SESSION_TYPES.WARENEINGANG);
}

/**
 * Helper-Funktion zum Abrufen der SessionType-ID für Wareneingang
 * @param {DatabaseClient} dbClient - Datenbankverbindung
 * @returns {number|null} - SessionType ID oder null
 */
async function getWareneingangSessionTypeId(dbClient) {
    try {
        const types = await dbClient.getSessionTypes();
        const wareneingang = types.find(type => type.TypeName === SESSION_TYPES.WARENEINGANG);
        return wareneingang ? wareneingang.ID : null;
    } catch (error) {
        console.error('Fehler beim Abrufen der Wareneingang SessionType ID:', error);
        return null;
    }
}

// ===== EXPORT FÜR RÜCKWÄRTSKOMPATIBILITÄT =====

// Standard-Export bleibt DatabaseClient (für bestehenden Code)
module.exports = DatabaseClient;

// Zusätzliche Named Exports als Properties
module.exports.DatabaseClient = DatabaseClient;
module.exports.SESSION_TYPES = SESSION_TYPES;
module.exports.createWareneingangSession = createWareneingangSession;
module.exports.getWareneingangSessionTypeId = getWareneingangSessionTypeId;