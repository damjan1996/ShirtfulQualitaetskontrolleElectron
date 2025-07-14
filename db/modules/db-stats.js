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
 * Statistics Module
 * Handles statistical queries, reports, and analytics
 */
class StatsModule {
    constructor(dbConnection, utils) {
        this.db = dbConnection;
        this.utils = utils;
    }

    // ===== DAILY STATISTICS =====
    async getDailyStats(date = null) {
        try {
            const targetDate = date || new Date().toISOString().split('T')[0];

            const result = await this.db.query(`
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

    // ===== RECENT ACTIVITY =====
    async getRecentActivity(hours = 8) {
        try {
            const result = await this.db.query(`
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
                EventTime: this.utils.normalizeTimestamp(activity.EventTime)
            })) || [];
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der letzten Aktivitäten:', error);
            return [];
        }
    }

    // ===== USER STATISTICS =====
    async getUserStats(userId = null, startDate = null, endDate = null) {
        try {
            let whereClause = '';
            let params = [];

            if (userId) {
                whereClause = 'WHERE s.UserID = ?';
                params.push(userId);
            }

            if (startDate && endDate) {
                whereClause += whereClause ? ' AND ' : 'WHERE ';
                whereClause += 's.StartTS >= ? AND s.StartTS <= ?';
                params.push(startDate, endDate);
            }

            const result = await this.db.query(`
                SELECT
                    u.ID as UserID,
                    u.BenutzerName,
                    u.Vorname,
                    u.Nachname,
                    COUNT(s.ID) as TotalSessions,
                    COUNT(CASE WHEN s.Active = 1 THEN 1 END) as ActiveSessions,
                    AVG(CASE WHEN s.EndTS IS NOT NULL 
                        THEN DATEDIFF(MINUTE, s.StartTS, s.EndTS) 
                        ELSE NULL END) as AvgSessionMinutes,
                    SUM(CASE WHEN s.EndTS IS NOT NULL 
                        THEN DATEDIFF(MINUTE, s.StartTS, s.EndTS) 
                        ELSE 0 END) as TotalSessionMinutes,
                    (SELECT COUNT(*) FROM dbo.QrScans q 
                     INNER JOIN dbo.Sessions s2 ON q.SessionID = s2.ID 
                     WHERE s2.UserID = u.ID AND q.Valid = 1
                     ${startDate && endDate ? 'AND q.CapturedTS >= ? AND q.CapturedTS <= ?' : ''}) as TotalScans,
                    MIN(s.StartTS) as FirstSession,
                    MAX(s.StartTS) as LastSession
                FROM dbo.ScannBenutzer u
                LEFT JOIN dbo.Sessions s ON u.ID = s.UserID ${whereClause}
                WHERE u.xStatus = 0
                GROUP BY u.ID, u.BenutzerName, u.Vorname, u.Nachname
                ORDER BY TotalSessions DESC
            `, startDate && endDate ? [...params, startDate, endDate] : params);

            return result.recordset.map(user => ({
                ...user,
                FullName: `${user.Vorname || ''} ${user.Nachname || ''}`.trim(),
                FirstSession: user.FirstSession ? this.utils.normalizeTimestamp(user.FirstSession) : null,
                LastSession: user.LastSession ? this.utils.normalizeTimestamp(user.LastSession) : null,
                AvgSessionHours: user.AvgSessionMinutes ? Math.round(user.AvgSessionMinutes / 60 * 100) / 100 : 0,
                TotalSessionHours: Math.round(user.TotalSessionMinutes / 60 * 100) / 100
            }));
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der Benutzer-Statistiken:', error);
            return [];
        }
    }

    // ===== SESSION TYPE STATISTICS =====
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
                             ELSE 0 END) as TotalDurationSeconds,
                    (SELECT COUNT(*) FROM dbo.QrScans q 
                     INNER JOIN dbo.Sessions s2 ON q.SessionID = s2.ID 
                     WHERE s2.SessionTypeID = st.ID AND q.Valid = 1
                     ${startDate && endDate ? 'AND q.CapturedTS >= ? AND q.CapturedTS <= ?' : ''}) as TotalScans
                FROM dbo.SessionTypes st
                         LEFT JOIN dbo.Sessions s ON st.ID = s.SessionTypeID ${whereClause}
                GROUP BY st.ID, st.TypeName, st.Description
                ORDER BY TotalSessions DESC
            `, startDate && endDate ? [...params, startDate, endDate] : params);

            return result.recordset.map(stat => ({
                ...stat,
                AvgDurationMinutes: stat.AvgDurationSeconds ? Math.round(stat.AvgDurationSeconds / 60) : 0,
                TotalDurationHours: Math.round(stat.TotalDurationSeconds / 3600 * 100) / 100,
                ScansPerSession: stat.TotalSessions > 0 ? Math.round(stat.TotalScans / stat.TotalSessions * 100) / 100 : 0
            }));
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der SessionType-Statistiken:', error);
            return [];
        }
    }

    // ===== TIME-BASED ANALYTICS =====
    async getHourlyActivity(date = null) {
        try {
            const targetDate = date || new Date().toISOString().split('T')[0];

            const result = await this.db.query(`
                SELECT
                    DATEPART(HOUR, CapturedTS) as Hour,
                    COUNT(*) as ScanCount,
                    COUNT(DISTINCT SessionID) as UniqueSessions
                FROM dbo.QrScans
                WHERE CAST(CapturedTS AS DATE) = ? AND Valid = 1
                GROUP BY DATEPART(HOUR, CapturedTS)
                ORDER BY Hour
            `, [targetDate]);

            // Erstelle vollständige 24-Stunden-Übersicht
            const hourlyStats = Array.from({ length: 24 }, (_, hour) => {
                const existingData = result.recordset.find(r => r.Hour === hour);
                return {
                    Hour: hour,
                    ScanCount: existingData ? existingData.ScanCount : 0,
                    UniqueSessions: existingData ? existingData.UniqueSessions : 0,
                    FormattedHour: `${hour.toString().padStart(2, '0')}:00`
                };
            });

            return hourlyStats;
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der stündlichen Aktivität:', error);
            return [];
        }
    }

    async getWeeklyTrends(weeks = 4) {
        try {
            const result = await this.db.query(`
                SELECT
                    DATEPART(WEEK, CapturedTS) as WeekNumber,
                    DATEPART(YEAR, CapturedTS) as Year,
                    CAST(MIN(CapturedTS) AS DATE) as WeekStart,
                    COUNT(*) as TotalScans,
                    COUNT(DISTINCT SessionID) as TotalSessions,
                    COUNT(DISTINCT s.UserID) as UniqueUsers
                FROM dbo.QrScans q
                INNER JOIN dbo.Sessions s ON q.SessionID = s.ID
                WHERE q.CapturedTS >= DATEADD(WEEK, -?, SYSDATETIME()) AND q.Valid = 1
                GROUP BY DATEPART(WEEK, CapturedTS), DATEPART(YEAR, CapturedTS)
                ORDER BY Year DESC, WeekNumber DESC
            `, [weeks]);

            return result.recordset.map(week => ({
                ...week,
                WeekStart: this.utils.normalizeTimestamp(week.WeekStart),
                AvgScansPerSession: week.TotalSessions > 0 ?
                    Math.round(week.TotalScans / week.TotalSessions * 100) / 100 : 0,
                AvgScansPerUser: week.UniqueUsers > 0 ?
                    Math.round(week.TotalScans / week.UniqueUsers * 100) / 100 : 0
            }));
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der wöchentlichen Trends:', error);
            return [];
        }
    }

    // ===== PERFORMANCE ANALYTICS =====
    async getPerformanceMetrics(startDate = null, endDate = null) {
        try {
            let whereClause = '';
            let params = [];

            if (startDate && endDate) {
                whereClause = 'WHERE q.CapturedTS >= ? AND q.CapturedTS <= ?';
                params = [startDate, endDate];
            }

            const result = await this.db.query(`
                SELECT
                    COUNT(*) as TotalScans,
                    COUNT(DISTINCT q.SessionID) as TotalSessions,
                    COUNT(DISTINCT s.UserID) as TotalUsers,
                    AVG(CAST(DATEDIFF(SECOND, s.StartTS, ISNULL(s.EndTS, SYSDATETIME())) AS FLOAT)) as AvgSessionDuration,
                    COUNT(*) / NULLIF(COUNT(DISTINCT q.SessionID), 0) as AvgScansPerSession,
                    COUNT(*) / NULLIF(COUNT(DISTINCT s.UserID), 0) as AvgScansPerUser,
                    COUNT(CASE WHEN q.RawPayload LIKE '%^%' THEN 1 END) as StructuredScans,
                    COUNT(CASE WHEN q.RawPayload LIKE '%[A-Z][A-Z]-%' THEN 1 END) as OrderScans,
                    COUNT(CASE WHEN q.RawPayload LIKE '%[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]%' THEN 1 END) as PackageScans
                FROM dbo.QrScans q
                INNER JOIN dbo.Sessions s ON q.SessionID = s.ID
                ${whereClause} AND q.Valid = 1
            `, params);

            const metrics = result.recordset[0];

            return {
                ...metrics,
                AvgSessionDurationMinutes: metrics.AvgSessionDuration ? Math.round(metrics.AvgSessionDuration / 60 * 100) / 100 : 0,
                StructuredScanRate: metrics.TotalScans > 0 ? Math.round(metrics.StructuredScans / metrics.TotalScans * 100) : 0,
                OrderScanRate: metrics.TotalScans > 0 ? Math.round(metrics.OrderScans / metrics.TotalScans * 100) : 0,
                PackageScanRate: metrics.TotalScans > 0 ? Math.round(metrics.PackageScans / metrics.TotalScans * 100) : 0
            };
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der Performance-Metriken:', error);
            return null;
        }
    }

    // ===== TOP PERFORMERS =====
    async getTopPerformers(metric = 'scans', limit = 10, startDate = null, endDate = null) {
        try {
            let orderBy = 'TotalScans DESC';

            switch (metric) {
                case 'sessions':
                    orderBy = 'TotalSessions DESC';
                    break;
                case 'time':
                    orderBy = 'TotalSessionMinutes DESC';
                    break;
                case 'efficiency':
                    orderBy = 'ScansPerMinute DESC';
                    break;
                default:
                    orderBy = 'TotalScans DESC';
            }

            let whereClause = '';
            let params = [];

            if (startDate && endDate) {
                whereClause = 'AND s.StartTS >= ? AND s.StartTS <= ?';
                params = [startDate, endDate];
            }

            const result = await this.db.query(`
                SELECT TOP ${limit}
                    u.ID,
                    u.BenutzerName,
                    u.Vorname,
                    u.Nachname,
                    COUNT(DISTINCT s.ID) as TotalSessions,
                    COUNT(q.ID) as TotalScans,
                    SUM(DATEDIFF(MINUTE, s.StartTS, ISNULL(s.EndTS, SYSDATETIME()))) as TotalSessionMinutes,
                    CASE WHEN SUM(DATEDIFF(MINUTE, s.StartTS, ISNULL(s.EndTS, SYSDATETIME()))) > 0 
                         THEN CAST(COUNT(q.ID) AS FLOAT) / SUM(DATEDIFF(MINUTE, s.StartTS, ISNULL(s.EndTS, SYSDATETIME())))
                         ELSE 0 END as ScansPerMinute
                FROM dbo.ScannBenutzer u
                INNER JOIN dbo.Sessions s ON u.ID = s.UserID
                LEFT JOIN dbo.QrScans q ON s.ID = q.SessionID AND q.Valid = 1
                WHERE u.xStatus = 0 ${whereClause}
                GROUP BY u.ID, u.BenutzerName, u.Vorname, u.Nachname
                HAVING COUNT(DISTINCT s.ID) > 0
                ORDER BY ${orderBy}
            `, params);

            return result.recordset.map((user, index) => ({
                ...user,
                Rank: index + 1,
                FullName: `${user.Vorname || ''} ${user.Nachname || ''}`.trim(),
                TotalSessionHours: Math.round(user.TotalSessionMinutes / 60 * 100) / 100,
                AvgScansPerSession: user.TotalSessions > 0 ? Math.round(user.TotalScans / user.TotalSessions * 100) / 100 : 0,
                ScansPerMinute: Math.round(user.ScansPerMinute * 100) / 100
            }));
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der Top-Performer:', error);
            return [];
        }
    }

    // ===== COMPREHENSIVE DASHBOARD DATA =====
    async getDashboardData(timeframe = 'today') {
        try {
            let startDate, endDate;
            const now = new Date();

            switch (timeframe) {
                case 'today':
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
                    break;
                case 'week':
                    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
                    startDate = new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate());
                    endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
                    break;
                case 'month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                    break;
                default:
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                    endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000);
            }

            const [
                dailyStats,
                recentActivity,
                performanceMetrics,
                topPerformers,
                sessionTypeStats
            ] = await Promise.all([
                this.getDailyStats(startDate.toISOString().split('T')[0]),
                this.getRecentActivity(8),
                this.getPerformanceMetrics(startDate, endDate),
                this.getTopPerformers('scans', 5, startDate, endDate),
                this.getSessionTypeStats(startDate, endDate)
            ]);

            return {
                timeframe,
                period: {
                    start: startDate.toISOString(),
                    end: endDate.toISOString()
                },
                summary: dailyStats,
                performance: performanceMetrics,
                recentActivity: recentActivity.slice(0, 20),
                topPerformers,
                sessionTypes: sessionTypeStats,
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            customConsole.error('Fehler beim Erstellen der Dashboard-Daten:', error);
            return null;
        }
    }
}

module.exports = StatsModule;