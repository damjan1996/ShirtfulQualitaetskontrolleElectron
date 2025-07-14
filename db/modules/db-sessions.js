// Console-Utils für bessere Ausgabe - mit Fallback
let customConsole;
try {
    customConsole = require('../../utils/console-utils');
} catch (error) {
    customConsole = {
        success: (msg, ...args) => console.log('[OK]', msg, ...args),
        error: (msg, ...args) => console.error('[ERROR]', msg, ...args),
        warning: (msg, ...args) => console.warn('[WARN]', msg, ...args),
        info: (msg, ...args) => console.log('[INFO]', msg, ...args),
        database: (msg, ...args) => console.log('[DB]', msg, ...args),
        log: (level, msg, ...args) => console.log(`[${level.toUpperCase()}]`, msg, ...args)
    };
}

/**
 * Session Management Module
 * Handles session creation, management, and SessionType operations
 */
class SessionModule {
    constructor(dbConnection, utils) {
        this.db = dbConnection;
        this.utils = utils;
    }

    // ===== SESSION MANAGEMENT MIT SESSIONTYPE-UNTERSTÜTZUNG =====

    /**
     * Erweiterte createSession Methode mit SessionType-Unterstützung
     * @param {number} userId - Benutzer-ID
     * @param {number|string} sessionType - SessionType ID oder Name (default: 'Qualitätskontrolle')
     * @returns {Object|null} - Neue Session oder null bei Fehler
     */
    async createSession(userId, sessionType = 'Qualitätskontrolle') {
        try {
            customConsole.info(`Session wird erstellt für User ${userId}, SessionType: ${sessionType}`);

            // Bestehende aktive Sessions für diesen User beenden
            await this.db.query(`
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
                const typeResult = await this.db.query(`
                    SELECT ID FROM dbo.SessionTypes
                    WHERE TypeName = ? AND IsActive = 1
                `, [sessionType]);

                if (typeResult.recordset.length === 0) {
                    throw new Error(`SessionType '${sessionType}' nicht gefunden`);
                }

                sessionTypeId = typeResult.recordset[0].ID;
            }

            // Neue Session erstellen mit SessionType
            const result = await this.db.query(`
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
     * ===== NEUE METHODE: ALLE AKTIVEN SESSIONS BEENDEN =====
     * Beendet alle aktiven Sessions - verwendet für Single-User-Mode
     * @returns {Object} - Anzahl beendeter Sessions und Liste der betroffenen Benutzer
     */
    async endAllActiveSessions() {
        try {
            customConsole.info('Beende alle aktiven Sessions...');

            // Erst die aktuell aktiven Sessions abrufen (für Logging/Events)
            const activeSessionsResult = await this.db.query(`
                SELECT 
                    s.ID as SessionID,
                    s.UserID,
                    u.BenutzerName,
                    s.StartTS
                FROM dbo.Sessions s
                INNER JOIN dbo.ScannBenutzer u ON s.UserID = u.ID
                WHERE s.Active = 1
            `);

            const activeSessions = activeSessionsResult.recordset;

            if (activeSessions.length === 0) {
                customConsole.info('Keine aktiven Sessions gefunden');
                return {
                    success: true,
                    endedCount: 0,
                    endedUsers: []
                };
            }

            // Alle aktiven Sessions beenden
            const endResult = await this.db.query(`
                UPDATE dbo.Sessions
                SET EndTS = SYSDATETIME(), Active = 0
                WHERE Active = 1
            `);

            const endedCount = endResult.rowsAffected && endResult.rowsAffected[0] || 0;

            customConsole.success(`${endedCount} aktive Session(s) beendet`);

            // Return-Objekt mit Details für Event-Handling
            return {
                success: true,
                endedCount: endedCount,
                endedUsers: activeSessions.map(session => ({
                    sessionId: session.SessionID,
                    userId: session.UserID,
                    userName: session.BenutzerName,
                    startTime: this.utils.normalizeTimestamp(session.StartTS)
                }))
            };

        } catch (error) {
            customConsole.error('Fehler beim Beenden aller aktiven Sessions:', error);
            return {
                success: false,
                endedCount: 0,
                endedUsers: [],
                error: error.message
            };
        }
    }

    /**
     * Session mit SessionType-Informationen abrufen
     * @param {number} sessionId - Session ID
     * @returns {Object|null} - Session mit SessionType-Details
     */
    async getSessionWithType(sessionId) {
        try {
            const result = await this.db.query(`
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
                    StartTS: this.utils.normalizeTimestamp(session.StartTS),
                    EndTS: session.EndTS ? this.utils.normalizeTimestamp(session.EndTS) : null
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
            const result = await this.db.query(`
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
                StartTS: this.utils.normalizeTimestamp(session.StartTS),
                FullName: `${session.Vorname || ''} ${session.Nachname || ''}`.trim()
            }));
        } catch (error) {
            customConsole.error('Fehler beim Abrufen aktiver Sessions:', error);
            return [];
        }
    }

    async endSession(sessionId) {
        try {
            console.log(`[INFO] Beende Session: ${sessionId}`);

            const result = await this.db.query(`
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
            const result = await this.db.query(`
                SELECT ID, StartTS,
                       DATEDIFF(SECOND, StartTS, SYSDATETIME()) as DurationSeconds
                FROM dbo.Sessions
                WHERE UserID = ? AND Active = 1
            `, [userId]);

            if (result.recordset.length > 0) {
                const session = result.recordset[0];
                return {
                    ...session,
                    StartTS: this.utils.normalizeTimestamp(session.StartTS)
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
            const result = await this.db.query(`
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
                startTime: this.utils.normalizeTimestamp(session.StartTS),
                endTime: session.EndTS ? this.utils.normalizeTimestamp(session.EndTS) : null,
                duration: session.DurationSeconds * 1000, // in Millisekunden
                isActive: session.Active === 1,
                formattedDuration: this.utils.formatSessionDuration(session.DurationSeconds)
            };
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der Session-Dauer:', error);
            return null;
        }
    }

    // ===== SESSIONTYPE OPERATIONS =====

    /**
     * Alle verfügbaren SessionTypes abrufen
     * @returns {Array} - Array von verfügbaren SessionTypes
     */
    async getSessionTypes() {
        try {
            const result = await this.db.query(`
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

            const result = await this.db.query(`
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
}

module.exports = SessionModule;