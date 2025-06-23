const sql = require('mssql');
require('dotenv').config();

class DatabaseClient {
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
            },
            pool: {
                max: parseInt(process.env.MSSQL_POOL_MAX) || 10,
                min: parseInt(process.env.MSSQL_POOL_MIN) || 0,
                idleTimeoutMillis: parseInt(process.env.MSSQL_POOL_IDLE_TIMEOUT) || 30000,
            }
        };

        console.log('Database client initialized with config:', {
            server: this.config.server,
            database: this.config.database,
            user: this.config.user,
            port: this.config.port,
            encrypt: this.config.options.encrypt,
            trustServerCertificate: this.config.options.trustServerCertificate
        });
    }

    async connect() {
        if (this.isConnected && this.pool) {
            console.log('Database already connected');
            return true;
        }

        try {
            console.log('Connecting to SQL Server...');
            console.log(`Server: ${this.config.server}:${this.config.port}`);
            console.log(`Database: ${this.config.database}`);
            console.log(`User: ${this.config.user}`);

            // Create connection pool
            this.pool = await sql.connect(this.config);

            // Test connection
            const result = await this.pool.request().query('SELECT 1 as test');

            if (result.recordset && result.recordset[0].test === 1) {
                this.isConnected = true;
                console.log('✅ Database connected successfully');

                // Test table existence
                await this.validateTables();

                return true;
            } else {
                throw new Error('Connection test failed');
            }

        } catch (error) {
            console.error('❌ Database connection failed:', error.message);

            // Provide helpful error messages
            if (error.code === 'ELOGIN') {
                console.error('💡 Login failed - check username/password in .env file');
            } else if (error.code === 'ETIMEOUT') {
                console.error('💡 Connection timeout - check server address and firewall');
            } else if (error.code === 'ENOTFOUND') {
                console.error('💡 Server not found - check MSSQL_SERVER in .env file');
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
                        SELECT COUNT(*) as [count] 
                        FROM INFORMATION_SCHEMA.TABLES 
                        WHERE TABLE_NAME = ? AND TABLE_SCHEMA = 'dbo'
                    `, [tableName]);

                    if (result.recordset[0].count > 0) {
                        existingTables.push(tableName);

                        // Get row count for info - FIXED: SQL Server compatible alias
                        const countResult = await this.query(`SELECT COUNT(*) as TableRowCount FROM dbo.[${tableName}]`);
                        console.log(`✅ Table ${tableName}: ${countResult.recordset[0].TableRowCount} rows`);
                    } else {
                        missingTables.push(tableName);
                    }
                } catch (error) {
                    console.error(`❌ Error checking table ${tableName}:`, error.message);
                    missingTables.push(tableName);
                }
            }

            if (missingTables.length > 0) {
                console.warn(`⚠️ Missing tables: ${missingTables.join(', ')}`);
                console.warn('💡 Run database setup script to create missing tables');
            }

            return { existingTables, missingTables };

        } catch (error) {
            console.error('Error validating tables:', error);
            return { existingTables: [], missingTables: [] };
        }
    }

    async query(queryString, parameters = []) {
        if (!this.isConnected || !this.pool) {
            throw new Error('Database not connected');
        }

        try {
            const request = this.pool.request();

            // Add parameters
            parameters.forEach((param, index) => {
                // Determine SQL type based on JavaScript type
                let sqlType = sql.NVarChar;

                if (typeof param === 'number') {
                    if (Number.isInteger(param)) {
                        sqlType = sql.Int;
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

            // Replace ? placeholders with @param0, @param1, etc.
            let processedQuery = queryString;
            let paramIndex = 0;
            processedQuery = processedQuery.replace(/\?/g, () => `@param${paramIndex++}`);

            console.log('Executing query:', processedQuery);
            console.log('Parameters:', parameters);

            const result = await request.query(processedQuery);

            console.log(`Query executed successfully. Rows affected: ${result.rowsAffected}, Records: ${result.recordset?.length || 0}`);

            return result;

        } catch (error) {
            console.error('Database query error:', error.message);
            console.error('Query:', queryString);
            console.error('Parameters:', parameters);
            throw error;
        }
    }

    async close() {
        if (this.pool) {
            try {
                await this.pool.close();
                this.pool = null;
                this.isConnected = false;
                console.log('✅ Database connection closed');
            } catch (error) {
                console.error('Error closing database connection:', error);
            }
        }
    }

    // Convenience methods for common operations

    async getUserByEPC(epcHex) {
        try {
            const epcDecimal = parseInt(epcHex, 16);
            const result = await this.query(`
                SELECT ID, Vorname, Nachname, BenutzerName, Email, EPC
                FROM dbo.ScannBenutzer
                WHERE EPC = ? AND xStatus = 0
            `, [epcDecimal]);

            return result.recordset.length > 0 ? result.recordset[0] : null;
        } catch (error) {
            console.error('Error getting user by EPC:', error);
            return null;
        }
    }

    async createSession(userId) {
        try {
            // First, end any existing active sessions for this user
            await this.query(`
                UPDATE dbo.Sessions
                SET EndTS = SYSDATETIME(), Active = 0
                WHERE UserID = ? AND Active = 1
            `, [userId]);

            // Create new session
            const result = await this.query(`
                INSERT INTO dbo.Sessions (UserID, StartTS, Active)
                OUTPUT INSERTED.ID, INSERTED.StartTS
                VALUES (?, SYSDATETIME(), 1)
            `, [userId]);

            return result.recordset.length > 0 ? result.recordset[0] : null;
        } catch (error) {
            console.error('Error creating session:', error);
            return null;
        }
    }

    async endSession(sessionId) {
        try {
            const result = await this.query(`
                UPDATE dbo.Sessions
                SET EndTS = SYSDATETIME(), Active = 0
                WHERE ID = ? AND Active = 1
            `, [sessionId]);

            return result.rowsAffected && result.rowsAffected[0] > 0;
        } catch (error) {
            console.error('Error ending session:', error);
            return false;
        }
    }

    async saveQRScan(sessionId, payload) {
        try {
            const result = await this.query(`
                INSERT INTO dbo.QrScans (SessionID, RawPayload, Valid)
                OUTPUT INSERTED.ID, INSERTED.CapturedTS
                VALUES (?, ?, 1)
            `, [sessionId, payload]);

            return result.recordset.length > 0 ? result.recordset[0] : null;
        } catch (error) {
            console.error('Error saving QR scan:', error);
            return null;
        }
    }

    async getActiveSessions() {
        try {
            const result = await this.query(`
                SELECT s.ID, s.UserID, s.StartTS, u.BenutzerName, u.Email,
                       DATEDIFF(SECOND, s.StartTS, SYSDATETIME()) as DurationSeconds,
                       (SELECT COUNT(*) FROM dbo.QrScans WHERE SessionID = s.ID) as ScanCount
                FROM dbo.Sessions s
                INNER JOIN dbo.ScannBenutzer u ON s.UserID = u.ID
                WHERE s.Active = 1
                ORDER BY s.StartTS DESC
            `);

            return result.recordset || [];
        } catch (error) {
            console.error('Error getting active sessions:', error);
            return [];
        }
    }

    async getRecentQRScans(limit = 20) {
        try {
            const result = await this.query(`
                SELECT TOP(?) 
                       q.ID, q.SessionID, q.RawPayload, q.PayloadJson, q.CapturedTS,
                       u.BenutzerName as UserName
                FROM dbo.QrScans q
                INNER JOIN dbo.Sessions s ON q.SessionID = s.ID
                INNER JOIN dbo.ScannBenutzer u ON s.UserID = u.ID
                ORDER BY q.CapturedTS DESC
            `, [limit]);

            return result.recordset || [];
        } catch (error) {
            console.error('Error getting recent QR scans:', error);
            return [];
        }
    }

    async getSessionScans(sessionId, limit = 100) {
        try {
            const result = await this.query(`
                SELECT TOP(?) ID, RawPayload, PayloadJson, CapturedTS, Valid
                FROM dbo.QrScans
                WHERE SessionID = ?
                ORDER BY CapturedTS DESC
            `, [limit, sessionId]);

            return result.recordset || [];
        } catch (error) {
            console.error('Error getting session scans:', error);
            return [];
        }
    }

    async getDailyStats(date = null) {
        try {
            const targetDate = date || new Date().toISOString().split('T')[0];

            const result = await this.query(`
                SELECT 
                    (SELECT COUNT(*) FROM dbo.Sessions WHERE CAST(StartTS AS DATE) = ?) as TotalSessions,
                    (SELECT COUNT(*) FROM dbo.QrScans WHERE CAST(CapturedTS AS DATE) = ?) as TotalScans,
                    (SELECT COUNT(DISTINCT s.UserID) FROM dbo.Sessions s WHERE CAST(s.StartTS AS DATE) = ?) as UniqueUsers,
                    (SELECT AVG(DATEDIFF(MINUTE, StartTS, ISNULL(EndTS, SYSDATETIME()))) 
                     FROM dbo.Sessions WHERE CAST(StartTS AS DATE) = ?) as AvgSessionMinutes
            `, [targetDate, targetDate, targetDate, targetDate]);

            return result.recordset.length > 0 ? result.recordset[0] : null;
        } catch (error) {
            console.error('Error getting daily stats:', error);
            return null;
        }
    }

    // Health check and diagnostics
    async healthCheck() {
        try {
            const startTime = Date.now();

            // Test basic connectivity
            await this.query('SELECT 1 as test');

            const connectionTime = Date.now() - startTime;

            // Get database info
            const serverInfo = await this.query(`
                SELECT 
                    @@VERSION as ServerVersion,
                    DB_NAME() as DatabaseName,
                    SUSER_NAME() as CurrentUser,
                    GETDATE() as ServerTime
            `);

            // Get table stats - FIXED: Use proper aliases
            const tableStats = await this.query(`
                SELECT 
                    TABLE_NAME,
                    (SELECT COUNT(*) FROM dbo.ScannBenutzer) as Users,
                    (SELECT COUNT(*) FROM dbo.Sessions) as TotalSessions,
                    (SELECT COUNT(*) FROM dbo.Sessions WHERE Active = 1) as ActiveSessions,
                    (SELECT COUNT(*) FROM dbo.QrScans) as TotalScans
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'ScannBenutzer'
            `);

            return {
                connected: true,
                connectionTime: connectionTime,
                server: serverInfo.recordset[0],
                stats: tableStats.recordset[0],
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                connected: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Transaction support
    async transaction(callback) {
        const transaction = new sql.Transaction(this.pool);

        try {
            await transaction.begin();

            const request = new sql.Request(transaction);
            const result = await callback(request);

            await transaction.commit();
            return result;

        } catch (error) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error('Error rolling back transaction:', rollbackError);
            }
            throw error;
        }
    }

    // Utility methods
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            pool: !!this.pool,
            config: {
                server: this.config.server,
                database: this.config.database,
                user: this.config.user,
                port: this.config.port
            }
        };
    }

    async testConnection() {
        try {
            const result = await this.query('SELECT GETDATE() as currentTime, @@VERSION as version');
            return {
                success: true,
                serverTime: result.recordset[0].currentTime,
                version: result.recordset[0].version
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = DatabaseClient;