/**
 * Database Client für Qualitätskontrolle RFID QR Scanner
 * Erweiterte Version mit allen notwendigen Methoden für zweimaliges Scannen
 */

const DatabaseConnection = require('./core/db-connection');
const DatabaseUtils = require('./utils/db-utils');

class DatabaseClient {
    constructor() {
        this.connection = new DatabaseConnection();
        this.utils = new DatabaseUtils();
        this.isConnected = false;
    }

    // ===== CONNECTION MANAGEMENT =====
    async connect() {
        try {
            const result = await this.connection.connect();
            this.isConnected = result;

            if (this.isConnected) {
                console.log('✅ DatabaseClient Module initialisiert');

                // Tabellen-Struktur validieren
                await this.validateTables();
            }

            return this.isConnected;
        } catch (error) {
            console.error('❌ DatabaseClient Verbindung fehlgeschlagen:', error);
            this.isConnected = false;
            throw error;
        }
    }

    async close() {
        try {
            if (this.connection) {
                await this.connection.close();
                this.isConnected = false;
                console.log('✅ DatabaseClient Verbindung geschlossen');
            }
        } catch (error) {
            console.error('❌ DatabaseClient schließen fehlgeschlagen:', error);
        }
    }

    // ===== TABLE VALIDATION =====
    async validateTables() {
        const requiredTables = ['ScannBenutzer', 'Sessions', 'QrScans'];

        for (const tableName of requiredTables) {
            try {
                const exists = await this.connection.query(`
                        SELECT COUNT(*) as tableCount
                        FROM INFORMATION_SCHEMA.TABLES
                        WHERE TABLE_NAME = @param0 AND TABLE_SCHEMA = 'dbo'
                `, [tableName]);

                if (exists.recordset[0].tableCount === 0) {
                    console.warn(`⚠️ Tabelle ${tableName} nicht gefunden`);
                } else {
                    // Anzahl Einträge prüfen
                    const count = await this.connection.query(`SELECT COUNT(*) as [record_count] FROM dbo.[${tableName}]`);
                    console.log(`✅ Tabelle ${tableName}: ${count.recordset[0].record_count} Einträge`);
                }
            } catch (error) {
                console.error(`❌ Tabellen-Validierung für ${tableName} fehlgeschlagen:`, error);
            }
        }
    }

    // ===== USER MANAGEMENT =====
    async getUserByEPC(epc) {
        try {
            const result = await this.connection.query(`
                SELECT ID, Vorname, Nachname, Benutzer, Email, EPC
                FROM ScannBenutzer 
                WHERE EPC = @param0 AND xStatus = 0
            `, [epc]);

            if (result.recordset.length > 0) {
                const user = result.recordset[0];
                return {
                    ID: user.ID,
                    Name: user.Vorname && user.Nachname ?
                        `${user.Vorname} ${user.Nachname}` :
                        (user.Benutzer || `User-${user.ID}`),
                    FirstName: user.Vorname,
                    LastName: user.Nachname,
                    Username: user.Benutzer,
                    Email: user.Email,
                    EPC: user.EPC
                };
            }

            return null;
        } catch (error) {
            console.error('❌ Benutzer per EPC suchen fehlgeschlagen:', error);
            throw error;
        }
    }

    async getUserByID(userId) {
        try {
            const result = await this.connection.query(`
                SELECT ID, Vorname, Nachname, Benutzer, Email, EPC
                FROM ScannBenutzer 
                WHERE ID = @param0 AND xStatus = 0
            `, [userId]);

            if (result.recordset.length > 0) {
                const user = result.recordset[0];
                return {
                    ID: user.ID,
                    Name: user.Vorname && user.Nachname ?
                        `${user.Vorname} ${user.Nachname}` :
                        (user.Benutzer || `User-${user.ID}`),
                    FirstName: user.Vorname,
                    LastName: user.Nachname,
                    Username: user.Benutzer,
                    Email: user.Email,
                    EPC: user.EPC
                };
            }

            return null;
        } catch (error) {
            console.error('❌ Benutzer per ID suchen fehlgeschlagen:', error);
            throw error;
        }
    }

    // ===== SESSION MANAGEMENT =====
    async startSession(userId, sessionTypeId) {
        try {
            const result = await this.connection.query(`
                INSERT INTO ScannKopf (TagesDatum, TagesDatumINT, Datum, DatumINT, EPC, ScannTyp_ID, xStatus, xDatum, xBenutzer)
                OUTPUT INSERTED.ID
                SELECT 
                    CAST(GETDATE() AS DATE) as TagesDatum,
                    CAST(FORMAT(GETDATE(), 'yyyyMMdd') AS INT) as TagesDatumINT,
                    GETDATE() as Datum,
                    CAST(FORMAT(GETDATE(), 'yyyyMMddHHmmss') AS DECIMAL(18,0)) as DatumINT,
                    sb.EPC,
                    @param1 as ScannTyp_ID,
                    0 as xStatus,
                    GETDATE() as xDatum,
                    'QualityControl' as xBenutzer
                FROM ScannBenutzer sb 
                WHERE sb.ID = @param0
            `, [userId, sessionTypeId]);

            if (result.recordset.length > 0) {
                const sessionId = result.recordset[0].ID;
                console.log(`✅ Session ${sessionId} gestartet für Benutzer ${userId}`);
                return sessionId;
            }

            throw new Error('Session konnte nicht erstellt werden');
        } catch (error) {
            console.error('❌ Session starten fehlgeschlagen:', error);
            throw error;
        }
    }

    async endSession(sessionId) {
        try {
            const result = await this.connection.query(`
                UPDATE ScannKopf 
                SET xStatus = 1, xDatum = GETDATE()
                WHERE ID = @param0 AND xStatus = 0
            `, [sessionId]);

            const success = result.rowsAffected && result.rowsAffected[0] > 0;

            if (success) {
                console.log(`✅ Session ${sessionId} beendet`);
            } else {
                console.warn(`⚠️ Session ${sessionId} war bereits beendet oder nicht gefunden`);
            }

            return success;
        } catch (error) {
            console.error('❌ Session beenden fehlgeschlagen:', error);
            throw error;
        }
    }

    async getActiveSessions() {
        try {
            const result = await this.connection.query(`
                SELECT 
                    sk.ID as SessionID,
                    sk.Datum as StartTime,
                    sb.ID as UserID,
                    COALESCE(sb.Vorname + ' ' + sb.Nachname, sb.Benutzer, 'User-' + CAST(sb.ID AS VARCHAR)) as UserName,
                    st.Bezeichnung as SessionType,
                    COUNT(sp.ID) as ScanCount
                FROM ScannKopf sk
                LEFT JOIN ScannBenutzer sb ON sk.EPC = sb.EPC
                LEFT JOIN ScannTyp st ON sk.ScannTyp_ID = st.ID
                LEFT JOIN ScannPosition sp ON sk.ID = sp.ScannKopf_ID
                WHERE sk.xStatus = 0
                GROUP BY sk.ID, sk.Datum, sb.ID, sb.Vorname, sb.Nachname, sb.Benutzer, st.Bezeichnung
                ORDER BY sk.Datum DESC
            `);

            return result.recordset.map(row => ({
                sessionId: row.SessionID,
                userId: row.UserID,
                userName: row.UserName,
                startTime: row.StartTime.getTime(),
                sessionType: row.SessionType,
                scanCount: row.ScanCount || 0,
                duration: Date.now() - row.StartTime.getTime()
            }));
        } catch (error) {
            console.error('❌ Aktive Sessions abrufen fehlgeschlagen:', error);
            return [];
        }
    }

    // ===== SESSION TYPES =====
    async getSessionTypes() {
        try {
            const result = await this.connection.query(`
                SELECT ID, TypeName, Description
                FROM dbo.SessionTypes
                WHERE IsActive = 1
                ORDER BY TypeName
            `);

            return result.recordset.map(row => ({
                ID: row.ID,
                TypeName: row.TypeName,
                Description: row.Description
            }));
        } catch (error) {
            console.warn('⚠️ SessionTypes aus dbo.SessionTypes nicht verfügbar, verwende ScannTyp:', error);

            // Fallback auf ScannTyp-Tabelle
            try {
                const fallbackResult = await this.connection.query(`
                    SELECT ID, Bezeichnung as TypeName, 
                           'Scan-Typ: ' + Bezeichnung as Description
                    FROM ScannTyp
                    WHERE xStatus = 0
                    ORDER BY Bezeichnung
                `);

                return fallbackResult.recordset.map(row => ({
                    ID: row.ID,
                    TypeName: row.TypeName,
                    Description: row.Description
                }));
            } catch (fallbackError) {
                console.error('❌ SessionTypes Fallback fehlgeschlagen:', fallbackError);
                return [];
            }
        }
    }

    // ===== QR-CODE MANAGEMENT =====
    async saveQRScan(sessionId, qrData, metadata = {}) {
        try {
            // QR-Code dekodieren
            const decoded = await this.decodeQRCode(qrData);

            const result = await this.connection.query(`
                INSERT INTO ScannPosition (
                    ScannKopf_ID, TagesDatum, TagesDatumINT, Datum, DatumINT,
                    Kunde, Auftragsnummer, Paketnummer, Zusatzinformtion,
                    xStatus, xDatum, xBenutzer
                )
                OUTPUT INSERTED.ID
                VALUES (
                    @param0,  -- ScannKopf_ID
                    CAST(GETDATE() AS DATE),  -- TagesDatum
                    CAST(FORMAT(GETDATE(), 'yyyyMMdd') AS INT),  -- TagesDatumINT
                    GETDATE(),  -- Datum
                    CAST(FORMAT(GETDATE(), 'yyyyMMddHHmmss') AS DECIMAL(18,0)),  -- DatumINT
                    @param1,  -- Kunde
                    @param2,  -- Auftragsnummer
                    @param3,  -- Paketnummer
                    @param4,  -- Zusatzinformation (JSON)
                    0,        -- xStatus
                    GETDATE(), -- xDatum
                    'QualityControl' -- xBenutzer
                )
            `, [
                sessionId,
                this.extractField(decoded, 'kunde') || '',
                this.extractField(decoded, 'auftrag') || '',
                this.extractField(decoded, 'paket') || '',
                JSON.stringify({
                    scanType: metadata.scanType || 'quality_scan',
                    rawData: qrData.substring(0, 500), // Begrenzt auf 500 Zeichen
                    decoded: decoded.success ? decoded : null,
                    processingTime: metadata.processingTime || null,
                    timestamp: new Date().toISOString()
                })
            ]);

            const scanId = result.recordset[0].ID;
            console.log(`✅ QR-Scan ${scanId} gespeichert für Session ${sessionId}`);
            return scanId;
        } catch (error) {
            console.error('❌ QR-Scan speichern fehlgeschlagen:', error);
            throw error;
        }
    }

    extractField(decoded, fieldType) {
        if (!decoded || !decoded.fields) return null;

        const field = decoded.fields.find(f => f.type === fieldType);
        return field ? field.value : null;
    }

    // ===== QR-CODE DECODING =====
    async decodeQRCode(qrData) {
        try {
            return this.utils.decodeQRCode(qrData);
        } catch (error) {
            console.warn('⚠️ QR-Code Dekodierung fehlgeschlagen:', error);
            return {
                success: false,
                error: error.message,
                raw: qrData,
                fields: [],
                summary: 'Rohdaten',
                type: 'raw'
            };
        }
    }

    // ===== STATISTICS =====
    async getDecodingStats() {
        try {
            const result = await this.connection.query(`
                SELECT 
                    COUNT(*) as totalScans,
                    SUM(CASE WHEN sp.Zusatzinformtion IS NOT NULL 
                             AND sp.Zusatzinformtion != '' 
                             AND ISJSON(sp.Zusatzinformtion) = 1 THEN 1 ELSE 0 END) as successfulDecodes,
                    SUM(CASE WHEN sp.Auftragsnummer IS NOT NULL 
                             AND sp.Auftragsnummer != '' THEN 1 ELSE 0 END) as withAuftrag,
                    SUM(CASE WHEN sp.Paketnummer IS NOT NULL 
                             AND sp.Paketnummer != '' THEN 1 ELSE 0 END) as withPaket,
                    SUM(CASE WHEN sp.Kunde IS NOT NULL 
                             AND sp.Kunde != '' THEN 1 ELSE 0 END) as withKunde
                FROM ScannPosition sp
                WHERE sp.xStatus = 0
                  AND sp.xDatum >= DATEADD(day, -30, GETDATE())
            `);

            if (result.recordset.length > 0) {
                const stats = result.recordset[0];
                return {
                    totalScans: stats.totalScans || 0,
                    successfulDecodes: stats.successfulDecodes || 0,
                    withAuftrag: stats.withAuftrag || 0,
                    withPaket: stats.withPaket || 0,
                    withKunde: stats.withKunde || 0
                };
            }

            return {
                totalScans: 0,
                successfulDecodes: 0,
                withAuftrag: 0,
                withPaket: 0,
                withKunde: 0
            };
        } catch (error) {
            console.warn('⚠️ Dekodierung-Statistiken abrufen fehlgeschlagen:', error);
            return null;
        }
    }

    async getSessionStats(sessionId) {
        try {
            const result = await this.connection.query(`
                SELECT 
                    COUNT(*) as totalScans,
                    MIN(sp.Datum) as firstScan,
                    MAX(sp.Datum) as lastScan,
                    COUNT(DISTINCT sp.Paketnummer) as uniquePackages
                FROM ScannPosition sp
                WHERE sp.ScannKopf_ID = @param0
                  AND sp.xStatus = 0
            `, [sessionId]);

            if (result.recordset.length > 0) {
                const stats = result.recordset[0];
                return {
                    sessionId: sessionId,
                    totalScans: stats.totalScans || 0,
                    uniquePackages: stats.uniquePackages || 0,
                    firstScan: stats.firstScan,
                    lastScan: stats.lastScan,
                    duration: stats.firstScan && stats.lastScan ?
                        stats.lastScan.getTime() - stats.firstScan.getTime() : 0
                };
            }

            return null;
        } catch (error) {
            console.error('❌ Session-Statistiken abrufen fehlgeschlagen:', error);
            return null;
        }
    }

    // ===== SCANNER TYPE MANAGEMENT =====
    async ensureScannerType(typeName) {
        try {
            // Prüfen ob Type bereits existiert
            const existing = await this.connection.query(`
                SELECT ID FROM ScannTyp WHERE Bezeichnung = @param0
            `, [typeName]);

            if (existing.recordset.length > 0) {
                return existing.recordset[0].ID;
            }

            // Neuen Type erstellen
            const result = await this.connection.query(`
                INSERT INTO ScannTyp (Bezeichnung, xStatus, xDatum, xBenutzer)
                OUTPUT INSERTED.ID
                VALUES (@param0, 0, GETDATE(), 'QualityControlSetup')
            `, [typeName]);

            if (result.recordset.length > 0) {
                const typeId = result.recordset[0].ID;
                console.log(`✅ Scanner-Type '${typeName}' erstellt mit ID ${typeId}`);
                return typeId;
            }

            throw new Error(`Scanner-Type '${typeName}' konnte nicht erstellt werden`);
        } catch (error) {
            console.error(`❌ Scanner-Type '${typeName}' konnte nicht erstellt werden:`, error);
            return null;
        }
    }

    async setScannerTypePriority(typeName, priority) {
        try {
            const result = await this.connection.query(`
                UPDATE ScannTyp
                SET xStatus = @param0
                WHERE Bezeichnung = @param1
            `, [priority, typeName]);

            const success = result.rowsAffected && result.rowsAffected[0] > 0;

            if (success) {
                console.log(`📊 Priorität für '${typeName}' auf ${priority} gesetzt`);
            }

            return success;
        } catch (error) {
            console.error(`❌ Priorität für '${typeName}' setzen fehlgeschlagen:`, error);
            return false;
        }
    }

    // ===== UTILITY METHODS =====
    async query(sql, params = []) {
        return this.connection.query(sql, params);
    }

    async executeTransaction(queries) {
        return this.connection.executeTransaction(queries);
    }

    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            server: this.connection.config?.server,
            database: this.connection.config?.database,
            connectionTime: this.connection.connectionTime
        };
    }

    // ===== HEALTH CHECK =====
    async healthCheck() {
        try {
            const result = await this.connection.query('SELECT 1 as health, GETDATE() as serverTime');
            return {
                healthy: true,
                serverTime: result.recordset[0].serverTime,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // ===== CLEANUP =====
    async cleanup() {
        try {
            if (this.utils) {
                this.utils.cleanup();
            }

            await this.close();
            console.log('✅ DatabaseClient Cleanup abgeschlossen');
        } catch (error) {
            console.error('❌ DatabaseClient Cleanup Fehler:', error);
        }
    }
}

module.exports = DatabaseClient;