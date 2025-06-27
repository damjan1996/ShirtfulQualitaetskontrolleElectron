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
 * User Management Module
 * Handles user-related database operations
 */
class UserModule {
    constructor(dbConnection, utils) {
        this.db = dbConnection;
        this.utils = utils;
    }

    // ===== BENUTZER-OPERATIONEN =====
    async getUserByEPC(epcHex) {
        try {
            const epcDecimal = parseInt(epcHex, 16);
            console.log(`[INFO] Suche Benutzer für EPC: ${epcHex} (${epcDecimal})`);

            const result = await this.db.query(`
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

    async getUserById(userId) {
        try {
            const result = await this.db.query(`
                SELECT ID, Vorname, Nachname, BenutzerName, Email, EPC, xStatus
                FROM dbo.ScannBenutzer
                WHERE ID = ?
            `, [userId]);

            if (result.recordset.length > 0) {
                const user = result.recordset[0];
                return {
                    ...user,
                    FullName: `${user.Vorname || ''} ${user.Nachname || ''}`.trim(),
                    IsActive: user.xStatus === 0
                };
            }
            return null;
        } catch (error) {
            customConsole.error('Fehler beim Abrufen des Benutzers nach ID:', error);
            return null;
        }
    }

    async getAllActiveUsers() {
        try {
            const result = await this.db.query(`
                SELECT ID, Vorname, Nachname, BenutzerName, Email, EPC
                FROM dbo.ScannBenutzer
                WHERE xStatus = 0
                ORDER BY BenutzerName
            `);

            return result.recordset.map(user => ({
                ...user,
                FullName: `${user.Vorname || ''} ${user.Nachname || ''}`.trim()
            }));
        } catch (error) {
            customConsole.error('Fehler beim Abrufen aller aktiven Benutzer:', error);
            return [];
        }
    }

    async searchUsers(searchTerm) {
        try {
            const result = await this.db.query(`
                SELECT ID, Vorname, Nachname, BenutzerName, Email, EPC
                FROM dbo.ScannBenutzer
                WHERE xStatus = 0 
                  AND (BenutzerName LIKE ? 
                       OR Vorname LIKE ? 
                       OR Nachname LIKE ? 
                       OR Email LIKE ?)
                ORDER BY BenutzerName
            `, [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]);

            return result.recordset.map(user => ({
                ...user,
                FullName: `${user.Vorname || ''} ${user.Nachname || ''}`.trim()
            }));
        } catch (error) {
            customConsole.error('Fehler bei der Benutzer-Suche:', error);
            return [];
        }
    }

    async getUserStats(userId) {
        try {
            const result = await this.db.query(`
                SELECT
                    u.ID,
                    u.BenutzerName,
                    u.Vorname,
                    u.Nachname,
                    COUNT(DISTINCT s.ID) as TotalSessions,
                    COUNT(CASE WHEN s.Active = 1 THEN 1 END) as ActiveSessions,
                    COUNT(q.ID) as TotalScans,
                    AVG(CASE WHEN s.EndTS IS NOT NULL 
                        THEN DATEDIFF(MINUTE, s.StartTS, s.EndTS) 
                        ELSE NULL END) as AvgSessionMinutes,
                    SUM(CASE WHEN s.EndTS IS NOT NULL 
                        THEN DATEDIFF(MINUTE, s.StartTS, s.EndTS) 
                        ELSE 0 END) as TotalSessionMinutes,
                    MIN(s.StartTS) as FirstSession,
                    MAX(s.StartTS) as LastSession,
                    MAX(q.CapturedTS) as LastScan
                FROM dbo.ScannBenutzer u
                LEFT JOIN dbo.Sessions s ON u.ID = s.UserID
                LEFT JOIN dbo.QrScans q ON s.ID = q.SessionID AND q.Valid = 1
                WHERE u.ID = ? AND u.xStatus = 0
                GROUP BY u.ID, u.BenutzerName, u.Vorname, u.Nachname
            `, [userId]);

            if (result.recordset.length > 0) {
                const stats = result.recordset[0];
                return {
                    ...stats,
                    FullName: `${stats.Vorname || ''} ${stats.Nachname || ''}`.trim(),
                    FirstSession: stats.FirstSession ? this.utils.normalizeTimestamp(stats.FirstSession) : null,
                    LastSession: stats.LastSession ? this.utils.normalizeTimestamp(stats.LastSession) : null,
                    LastScan: stats.LastScan ? this.utils.normalizeTimestamp(stats.LastScan) : null,
                    TotalSessionHours: Math.round(stats.TotalSessionMinutes / 60 * 100) / 100,
                    AvgSessionHours: stats.AvgSessionMinutes ? Math.round(stats.AvgSessionMinutes / 60 * 100) / 100 : 0,
                    AvgScansPerSession: stats.TotalSessions > 0 ? Math.round(stats.TotalScans / stats.TotalSessions * 100) / 100 : 0
                };
            }
            return null;
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der Benutzer-Statistiken:', error);
            return null;
        }
    }

    async validateUser(userId) {
        try {
            const user = await this.getUserById(userId);

            if (!user) {
                return { isValid: false, reason: 'Benutzer nicht gefunden' };
            }

            if (!user.IsActive) {
                return { isValid: false, reason: 'Benutzer ist nicht aktiv' };
            }

            return { isValid: true, user };
        } catch (error) {
            customConsole.error('Fehler bei der Benutzer-Validierung:', error);
            return { isValid: false, reason: 'Validierungsfehler' };
        }
    }

    async getUserActivity(userId, limit = 50) {
        try {
            const result = await this.db.query(`
                SELECT
                    'session_start' as ActivityType,
                    s.StartTS as ActivityTime,
                    'Session gestartet' as Description,
                    st.TypeName as SessionType,
                    s.ID as SessionID,
                    NULL as ScanID
                FROM dbo.Sessions s
                LEFT JOIN dbo.SessionTypes st ON s.SessionTypeID = st.ID
                WHERE s.UserID = ?

                UNION ALL

                SELECT
                    'session_end' as ActivityType,
                    s.EndTS as ActivityTime,
                    'Session beendet' as Description,
                    st.TypeName as SessionType,
                    s.ID as SessionID,
                    NULL as ScanID
                FROM dbo.Sessions s
                LEFT JOIN dbo.SessionTypes st ON s.SessionTypeID = st.ID
                WHERE s.UserID = ? AND s.EndTS IS NOT NULL

                UNION ALL

                SELECT
                    'qr_scan' as ActivityType,
                    q.CapturedTS as ActivityTime,
                    'QR-Code gescannt' as Description,
                    st.TypeName as SessionType,
                    s.ID as SessionID,
                    q.ID as ScanID
                FROM dbo.QrScans q
                INNER JOIN dbo.Sessions s ON q.SessionID = s.ID
                LEFT JOIN dbo.SessionTypes st ON s.SessionTypeID = st.ID
                WHERE s.UserID = ? AND q.Valid = 1

                ORDER BY ActivityTime DESC
                OFFSET 0 ROWS FETCH NEXT ${limit} ROWS ONLY
            `, [userId, userId, userId]);

            return result.recordset.map(activity => ({
                ...activity,
                ActivityTime: this.utils.normalizeTimestamp(activity.ActivityTime),
                FormattedTime: this.utils.formatRelativeTime(activity.ActivityTime)
            }));
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der Benutzer-Aktivität:', error);
            return [];
        }
    }
}

module.exports = UserModule;