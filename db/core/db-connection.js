const sql = require('mssql');
require('dotenv').config();

// Console-Utils für bessere Ausgabe - mit Fallback
let customConsole;
try {
    customConsole = require('../../utils/console-utils');
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

/**
 * Core Database Connection Management für Qualitätskontrolle
 * Handles basic database operations, connection pooling, and configuration
 */
class DatabaseConnection {
    constructor() {
        this.pool = null;
        this.isConnected = false;

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

        customConsole.database('Database connection initialisiert mit Konfiguration:', {
            server: this.config.server,
            database: this.config.database,
            user: this.config.user,
            port: this.config.port,
            encrypt: this.config.options.encrypt,
            useUTC: this.config.options.useUTC
        });
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
                this.connectionTime = new Date();

                customConsole.success('Datenbank erfolgreich verbunden');
                customConsole.info(`Server-Zeit: ${result.recordset[0].serverTime}`);

                return true;
            } else {
                throw new Error('Verbindungstest fehlgeschlagen');
            }

        } catch (error) {
            this.isConnected = false;
            customConsole.error('Datenbankverbindung fehlgeschlagen:', error.message);

            // Detaillierte Fehlerbehandlung
            if (error.code === 'ELOGIN') {
                throw new Error('Anmeldung fehlgeschlagen - Benutzername oder Passwort falsch');
            } else if (error.code === 'ECONNREFUSED') {
                throw new Error('Verbindung verweigert - Server nicht erreichbar');
            } else if (error.code === 'ETIMEOUT') {
                throw new Error('Verbindungs-Timeout - Server antwortet nicht');
            } else if (error.code === 'ENOTFOUND') {
                throw new Error('Server nicht gefunden - Hostname falsch');
            } else {
                throw new Error(`Datenbankfehler: ${error.message}`);
            }
        }
    }

    async close() {
        try {
            if (this.pool) {
                await this.pool.close();
                this.pool = null;
            }
            this.isConnected = false;
            customConsole.success('Datenbankverbindung geschlossen');
        } catch (error) {
            customConsole.error('Fehler beim Schließen der Datenbankverbindung:', error);
        }
    }

    async query(sql, params = []) {
        if (!this.isConnected || !this.pool) {
            throw new Error('Keine Datenbankverbindung verfügbar');
        }

        try {
            // Query für Debugging loggen (gekürzt)
            const truncatedSQL = sql.length > 100 ?
                sql.substring(0, 100) + '\n              ...' :
                sql;

            customConsole.database('Führe Query aus:', truncatedSQL);

            if (params && params.length > 0) {
                customConsole.info('Parameter:', params);
            }

            const request = this.pool.request();

            // Parameter hinzufügen
            params.forEach((param, index) => {
                const paramName = `param${index}`;
                request.input(paramName, param);
            });

            const result = await request.query(sql);

            // Erfolgs-Log
            const rowsAffected = result.rowsAffected ? result.rowsAffected.reduce((a, b) => a + b, 0) : 0;
            const recordCount = result.recordset ? result.recordset.length : 0;

            customConsole.success(`Query erfolgreich. Betroffene Zeilen: ${rowsAffected}, Datensätze: ${recordCount}`);

            return result;

        } catch (error) {
            customConsole.error('Query-Fehler:', error.message);
            customConsole.error('SQL:', sql);
            customConsole.error('Parameter:', params);

            // Spezielle SQL-Fehlerbehandlung
            if (error.number) {
                switch (error.number) {
                    case 2: // Invalid object name
                        throw new Error(`Tabelle oder Spalte nicht gefunden: ${error.message}`);
                    case 207: // Invalid column name
                        throw new Error(`Spalte nicht gefunden: ${error.message}`);
                    case 515: // Cannot insert NULL
                        throw new Error(`Pflichtfeld darf nicht leer sein: ${error.message}`);
                    case 547: // Foreign key constraint
                        throw new Error(`Referenz-Fehler: ${error.message}`);
                    case 2627: // Primary key violation
                        throw new Error(`Duplikat-Fehler: ${error.message}`);
                    case 8152: // String truncation
                        throw new Error(`Daten zu lang für Feld: ${error.message}`);
                    default:
                        throw new Error(`SQL-Fehler (${error.number}): ${error.message}`);
                }
            }

            throw error;
        }
    }

    async executeTransaction(queries) {
        if (!this.isConnected || !this.pool) {
            throw new Error('Keine Datenbankverbindung verfügbar');
        }

        const transaction = new sql.Transaction(this.pool);

        try {
            customConsole.database(`Starte Transaktion mit ${queries.length} Queries`);

            await transaction.begin();
            const results = [];

            for (let i = 0; i < queries.length; i++) {
                const { sql: querySQL, params = [] } = queries[i];

                const request = new sql.Request(transaction);

                // Parameter hinzufügen
                params.forEach((param, index) => {
                    request.input(`param${index}`, param);
                });

                const result = await request.query(querySQL);
                results.push(result);
            }

            await transaction.commit();
            customConsole.success('Transaktion erfolgreich abgeschlossen');

            return results;

        } catch (error) {
            try {
                await transaction.rollback();
                customConsole.warning('Transaktion zurückgerollt');
            } catch (rollbackError) {
                customConsole.error('Rollback fehlgeschlagen:', rollbackError);
            }

            customConsole.error('Transaktion fehlgeschlagen:', error);
            throw error;
        }
    }

    // ===== UTILITY METHODS =====

    async testConnection() {
        try {
            const result = await this.query('SELECT 1 as test, GETDATE() as currentTime');
            return {
                success: true,
                serverTime: result.recordset[0].currentTime,
                connectionTime: this.connectionTime
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getDatabaseInfo() {
        try {
            const result = await this.query(`
                SELECT 
                    DB_NAME() as DatabaseName,
                    @@VERSION as ServerVersion,
                    @@SERVERNAME as ServerName,
                    GETDATE() as CurrentTime
            `);

            return result.recordset[0];
        } catch (error) {
            customConsole.error('Datenbank-Info abrufen fehlgeschlagen:', error);
            return null;
        }
    }

    async getTableList() {
        try {
            const result = await this.query(`
                SELECT 
                    TABLE_NAME,
                    TABLE_TYPE
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = 'dbo'
                ORDER BY TABLE_NAME
            `);

            return result.recordset;
        } catch (error) {
            customConsole.error('Tabellen-Liste abrufen fehlgeschlagen:', error);
            return [];
        }
    }

    async getTableRowCount(tableName) {
        try {
            const result = await this.query(`SELECT COUNT(*) as rowCount FROM [${tableName}]`);
            return result.recordset[0].rowCount;
        } catch (error) {
            customConsole.warning(`Zeilen-Anzahl für Tabelle '${tableName}' nicht verfügbar:`, error.message);
            return 0;
        }
    }

    // ===== CONNECTION MANAGEMENT =====

    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            server: this.config.server,
            database: this.config.database,
            connectionTime: this.connectionTime,
            config: {
                encrypt: this.config.options.encrypt,
                trustServerCertificate: this.config.options.trustServerCertificate,
                requestTimeout: this.config.options.requestTimeout,
                connectionTimeout: this.config.options.connectionTimeout
            }
        };
    }

    async reconnect() {
        customConsole.warning('Führe Reconnect durch...');

        try {
            await this.close();
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 Sekunde warten
            return await this.connect();
        } catch (error) {
            customConsole.error('Reconnect fehlgeschlagen:', error);
            throw error;
        }
    }

    // ===== HEALTH CHECK =====

    async healthCheck() {
        try {
            const start = Date.now();
            const result = await this.query('SELECT 1 as health, GETDATE() as serverTime');
            const responseTime = Date.now() - start;

            return {
                healthy: true,
                responseTime: responseTime,
                serverTime: result.recordset[0].serverTime,
                connectionStatus: this.getConnectionStatus()
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                connectionStatus: this.getConnectionStatus()
            };
        }
    }

    // ===== ERROR HANDLING =====

    isConnectionError(error) {
        const connectionErrorCodes = ['ECONNREFUSED', 'ETIMEOUT', 'ENOTFOUND', 'ELOGIN'];
        return connectionErrorCodes.includes(error.code);
    }

    async handleConnectionError(error) {
        customConsole.error('Verbindungsfehler erkannt:', error.code, error.message);

        if (this.isConnectionError(error)) {
            this.isConnected = false;

            // Automatischer Reconnect-Versuch
            try {
                customConsole.warning('Versuche automatischen Reconnect...');
                await this.reconnect();
                customConsole.success('Automatischer Reconnect erfolgreich');
                return true;
            } catch (reconnectError) {
                customConsole.error('Automatischer Reconnect fehlgeschlagen:', reconnectError.message);
                return false;
            }
        }

        return false;
    }
}

module.exports = DatabaseConnection;