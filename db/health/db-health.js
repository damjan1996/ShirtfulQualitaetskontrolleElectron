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
 * Health Check and Diagnostics Module
 * Handles database health monitoring, performance checks, and diagnostics
 */
class HealthModule {
    constructor(dbConnection, utils) {
        this.db = dbConnection;
        this.utils = utils;
    }

    // ===== HEALTH CHECK & DIAGNOSTICS =====
    async healthCheck() {
        try {
            const startTime = Date.now();

            // Basis-Konnektivitätstest
            const connectTest = await this.db.query('SELECT 1 as test, SYSDATETIME() as currentTime');
            const connectionTime = Date.now() - startTime;

            // Server-Informationen
            const serverInfo = await this.db.query(`
                SELECT 
                    @@VERSION as ServerVersion,
                    DB_NAME() as DatabaseName,
                    SUSER_NAME() as CurrentUser,
                    SYSDATETIME() as ServerTime,
                    @@SERVERNAME as ServerName
            `);

            // Tabellen-Statistiken
            const tableStats = await this.db.query(`
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
                ServerTime: this.utils.normalizeTimestamp(serverInfo.recordset[0].ServerTime)
            };

            return {
                connected: true,
                connectionTime: connectionTime,
                server: normalizedServerInfo,
                stats: tableStats.recordset[0],
                timestamp: new Date().toISOString(),
                duplicateCache: {
                    size: this.utils.duplicateCache.size,
                    pendingScans: this.utils.pendingScans.size
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

    async testConnection() {
        try {
            const result = await this.db.query('SELECT SYSDATETIME() as currentTime, @@VERSION as version');
            return {
                success: true,
                serverTime: this.utils.normalizeTimestamp(result.recordset[0].currentTime),
                version: result.recordset[0].version.split('\n')[0] // Nur erste Zeile
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getConnectionStatus() {
        return {
            connected: this.db.isConnected,
            pool: !!this.db.pool,
            config: {
                server: this.db.config.server,
                database: this.db.config.database,
                user: this.db.config.user,
                port: this.db.config.port,
                useUTC: this.db.config.options.useUTC
            },
            cache: {
                duplicates: this.utils.duplicateCache.size,
                pending: this.utils.pendingScans.size
            }
        };
    }

    async debugInfo() {
        try {
            const health = await this.healthCheck();
            const connectionStatus = await this.getConnectionStatus();

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

    // ===== PERFORMANCE MONITORING =====
    async getPerformanceStats() {
        try {
            const result = await this.db.query(`
                SELECT
                    -- Verbindungs-Info
                    @@CONNECTIONS as TotalConnections,
                    
                    -- Memory Info
                    (SELECT cntr_value FROM sys.dm_os_performance_counters 
                     WHERE counter_name = 'Total Server Memory (KB)') as TotalServerMemory,
                    
                    -- Query Performance
                    (SELECT AVG(total_elapsed_time / execution_count) 
                     FROM sys.dm_exec_query_stats) as AvgQueryTime,
                    
                    -- Current Activity
                    (SELECT COUNT(*) FROM sys.dm_exec_requests) as ActiveRequests,
                    
                    -- Server Info
                    SYSDATETIME() as CurrentTime,
                    @@SERVERNAME as ServerName,
                    @@VERSION as Version
            `);

            const stats = result.recordset[0];

            return {
                ...stats,
                CurrentTime: this.utils.normalizeTimestamp(stats.CurrentTime),
                TotalServerMemoryMB: Math.round(stats.TotalServerMemory / 1024),
                AvgQueryTimeMs: stats.AvgQueryTime ? Math.round(stats.AvgQueryTime / 1000) : 0,
                Version: stats.Version.split('\n')[0]
            };
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der Performance-Statistiken:', error);
            return null;
        }
    }

    async getDatabaseSize() {
        try {
            const result = await this.db.query(`
                SELECT
                    SUM(CASE WHEN type_desc = 'ROWS' THEN size * 8.0 / 1024 ELSE 0 END) as DataSizeMB,
                    SUM(CASE WHEN type_desc = 'LOG' THEN size * 8.0 / 1024 ELSE 0 END) as LogSizeMB,
                    SUM(size * 8.0 / 1024) as TotalSizeMB
                FROM sys.master_files
                WHERE database_id = DB_ID()
            `);

            const size = result.recordset[0];

            return {
                ...size,
                DataSizeGB: Math.round(size.DataSizeMB / 1024 * 100) / 100,
                LogSizeGB: Math.round(size.LogSizeMB / 1024 * 100) / 100,
                TotalSizeGB: Math.round(size.TotalSizeMB / 1024 * 100) / 100
            };
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der Datenbankgröße:', error);
            return null;
        }
    }

    async getTableSizes() {
        try {
            const result = await this.db.query(`
                SELECT 
                    t.NAME AS TableName,
                    s.Name AS SchemaName,
                    p.rows AS RowCounts,
                    SUM(a.total_pages) * 8 AS TotalSpaceKB, 
                    CAST(ROUND(((SUM(a.total_pages) * 8) / 1024.00), 2) AS NUMERIC(36, 2)) AS TotalSpaceMB,
                    SUM(a.used_pages) * 8 AS UsedSpaceKB, 
                    CAST(ROUND(((SUM(a.used_pages) * 8) / 1024.00), 2) AS NUMERIC(36, 2)) AS UsedSpaceMB, 
                    (SUM(a.total_pages) - SUM(a.used_pages)) * 8 AS UnusedSpaceKB,
                    CAST(ROUND(((SUM(a.total_pages) - SUM(a.used_pages)) * 8) / 1024.00, 2) AS NUMERIC(36, 2)) AS UnusedSpaceMB
                FROM 
                    sys.tables t
                INNER JOIN      
                    sys.indexes i ON t.OBJECT_ID = i.object_id
                INNER JOIN 
                    sys.partitions p ON i.object_id = p.OBJECT_ID AND i.index_id = p.index_id
                INNER JOIN 
                    sys.allocation_units a ON p.partition_id = a.container_id
                LEFT OUTER JOIN 
                    sys.schemas s ON t.schema_id = s.schema_id
                WHERE 
                    t.NAME NOT LIKE 'dt%' 
                    AND t.is_ms_shipped = 0
                    AND i.OBJECT_ID > 255 
                GROUP BY 
                    t.Name, s.Name, p.Rows
                ORDER BY 
                    TotalSpaceMB DESC
            `);

            return result.recordset;
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der Tabellengrößen:', error);
            return [];
        }
    }

    // ===== MONITORING ALERTS =====
    async checkSystemHealth() {
        try {
            const alerts = [];

            // Performance Check
            const performance = await this.getPerformanceStats();
            if (performance) {
                if (performance.ActiveRequests > 10) {
                    alerts.push({
                        level: 'warning',
                        type: 'performance',
                        message: `Hohe Anzahl aktiver Requests: ${performance.ActiveRequests}`,
                        value: performance.ActiveRequests
                    });
                }

                if (performance.AvgQueryTimeMs > 1000) {
                    alerts.push({
                        level: 'warning',
                        type: 'performance',
                        message: `Hohe durchschnittliche Query-Zeit: ${performance.AvgQueryTimeMs}ms`,
                        value: performance.AvgQueryTimeMs
                    });
                }
            }

            // Database Size Check
            const dbSize = await this.getDatabaseSize();
            if (dbSize && dbSize.TotalSizeGB > 5) {
                alerts.push({
                    level: 'info',
                    type: 'storage',
                    message: `Datenbankgröße: ${dbSize.TotalSizeGB}GB`,
                    value: dbSize.TotalSizeGB
                });
            }

            // Cache Check
            const cacheStats = this.utils.getDuplicateCacheStats();
            if (cacheStats.size > 10000) {
                alerts.push({
                    level: 'warning',
                    type: 'cache',
                    message: `Großer Duplikat-Cache: ${cacheStats.size} Einträge`,
                    value: cacheStats.size
                });
            }

            // Connection Check
            const connectionStatus = await this.getConnectionStatus();
            if (!connectionStatus.connected) {
                alerts.push({
                    level: 'error',
                    type: 'connection',
                    message: 'Keine Datenbankverbindung',
                    value: false
                });
            }

            return {
                timestamp: new Date().toISOString(),
                alertCount: alerts.length,
                alerts: alerts,
                status: alerts.some(a => a.level === 'error') ? 'error' :
                    alerts.some(a => a.level === 'warning') ? 'warning' : 'healthy'
            };
        } catch (error) {
            customConsole.error('Fehler bei der System-Gesundheitsprüfung:', error);
            return {
                timestamp: new Date().toISOString(),
                alertCount: 1,
                alerts: [{
                    level: 'error',
                    type: 'system',
                    message: `Gesundheitsprüfung fehlgeschlagen: ${error.message}`,
                    value: error.message
                }],
                status: 'error'
            };
        }
    }

    // ===== COMPREHENSIVE SYSTEM REPORT =====
    async getSystemReport() {
        try {
            const [
                health,
                performance,
                dbSize,
                tableSizes,
                systemHealth
            ] = await Promise.all([
                this.healthCheck(),
                this.getPerformanceStats(),
                this.getDatabaseSize(),
                this.getTableSizes(),
                this.checkSystemHealth()
            ]);

            return {
                timestamp: new Date().toISOString(),
                health,
                performance,
                database: {
                    size: dbSize,
                    tables: tableSizes
                },
                alerts: systemHealth,
                cache: this.utils.getDuplicateCacheStats()
            };
        } catch (error) {
            customConsole.error('Fehler beim Erstellen des System-Reports:', error);
            return {
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }
}

module.exports = HealthModule;