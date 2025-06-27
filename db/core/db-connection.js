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
 * Core Database Connection Management
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

                        // Zeilen zählen für Info
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

    // ===== STATUS & DIAGNOSTICS =====
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
}

module.exports = DatabaseConnection;