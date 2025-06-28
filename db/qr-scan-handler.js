// ===== db/qr-scan-handler.js =====
// Spezialisierte Datenbankoperationen für QR-Code-Scans

const mssql = require('mssql');

class QRScanHandler {
    constructor(dbClient) {
        this.db = dbClient;
        this.sessionScans = new Map(); // Session-basierte Duplikatprüfung
        this.globalScans = new Set(); // Globale Duplikatprüfung
    }

    // Initialisierung - lädt bereits gescannte Codes
    async initialize() {
        try {
            console.log('🔧 QR-Scan-Handler wird initialisiert...');

            // Bereits gescannte Codes laden (letzten 24h)
            const result = await this.db.query(`
                SELECT DISTINCT RawPayload 
                FROM QrScans 
                WHERE CapturedTS >= DATEADD(day, -1, SYSDATETIME())
            `);

            // Globale Duplikatprüfung füllen
            this.globalScans.clear();
            if (result.recordset) {
                result.recordset.forEach(row => {
                    this.globalScans.add(row.RawPayload);
                });
            }

            console.log(`✅ ${this.globalScans.size} bereits gescannte Codes geladen`);
            return true;

        } catch (error) {
            console.error('❌ QR-Scan-Handler Initialisierung fehlgeschlagen:', error);
            return false;
        }
    }

    // Prüft ob QR-Code bereits gescannt wurde
    async isDuplicateCode(qrData, sessionId = null) {
        try {
            // 1. Globale Duplikatprüfung (Memory)
            if (this.globalScans.has(qrData)) {
                return { isDuplicate: true, reason: 'global' };
            }

            // 2. Session-basierte Duplikatprüfung (Memory)
            if (sessionId && this.sessionScans.has(sessionId)) {
                const sessionSet = this.sessionScans.get(sessionId);
                if (sessionSet.has(qrData)) {
                    return { isDuplicate: true, reason: 'session' };
                }
            }

            // 3. Datenbankprüfung (falls Memory unvollständig)
            const dbResult = await this.db.query(`
                SELECT TOP 1 ID 
                FROM QrScans 
                WHERE RawPayload = @qrData
                AND CapturedTS >= DATEADD(day, -1, SYSDATETIME())
            `, [
                { name: 'qrData', type: mssql.NVarChar, value: qrData }
            ]);

            if (dbResult.recordset && dbResult.recordset.length > 0) {
                // In Memory-Cache aufnehmen
                this.globalScans.add(qrData);
                return { isDuplicate: true, reason: 'database' };
            }

            return { isDuplicate: false };

        } catch (error) {
            console.error('❌ Duplikatprüfung fehlgeschlagen:', error);
            // Im Fehlerfall als nicht-Duplikat behandeln
            return { isDuplicate: false, error: error.message };
        }
    }

    // QR-Code-Daten dekodieren
    decodeQRData(rawData) {
        try {
            // Format 1: "126644896^25000580^010010277918^6^2802-834"
            if (rawData.includes('^')) {
                const parts = rawData.split('^');
                if (parts.length >= 3) {
                    return {
                        success: true,
                        auftrag: parts[0]?.trim() || null,
                        kunde: parts[1]?.trim() || null,
                        paket: parts[2]?.trim() || null,
                        additional: parts.slice(3) // Weitere Felder
                    };
                }
            }

            // Format 2: JSON
            if (rawData.startsWith('{') && rawData.endsWith('}')) {
                const jsonData = JSON.parse(rawData);
                return {
                    success: true,
                    auftrag: jsonData.auftrag || jsonData.order || jsonData.auftragsId || null,
                    kunde: jsonData.kunde || jsonData.customer || jsonData.kundenId || null,
                    paket: jsonData.paket || jsonData.package || jsonData.paketId || null,
                    additional: jsonData
                };
            }

            // Format 3: Einfacher Text mit Pattern-Matching
            const patterns = {
                auftrag: /(?:auftrag|order|auf)[:\s]*([A-Z0-9]+)/i,
                kunde: /(?:kunde|customer|kun)[:\s]*([A-Z0-9]+)/i,
                paket: /(?:paket|package|pak)[:\s]*([A-Z0-9]+)/i
            };

            const extracted = {};
            let hasData = false;

            for (const [key, pattern] of Object.entries(patterns)) {
                const match = rawData.match(pattern);
                if (match && match[1]) {
                    extracted[key] = match[1].trim();
                    hasData = true;
                }
            }

            if (hasData) {
                return {
                    success: true,
                    ...extracted,
                    additional: { rawData }
                };
            }

            // Fallback: Rohdaten als Auftrag behandeln
            return {
                success: false,
                reason: 'Unbekanntes Format',
                auftrag: rawData.substring(0, 50), // Erste 50 Zeichen
                kunde: null,
                paket: null,
                additional: { rawData }
            };

        } catch (error) {
            console.error('❌ QR-Dekodierung fehlgeschlagen:', error);
            return {
                success: false,
                reason: 'Dekodierungsfehler: ' + error.message,
                error: error.message,
                additional: { rawData }
            };
        }
    }

    // QR-Scan in Datenbank speichern
    async saveScan(sessionId, qrData, decodedData = null) {
        const transaction = new mssql.Transaction(this.db.pool);

        try {
            await transaction.begin();

            // 1. Duplikatprüfung
            const duplicateCheck = await this.isDuplicateCode(qrData, sessionId);
            if (duplicateCheck.isDuplicate) {
                await transaction.rollback();
                return {
                    success: false,
                    error: 'QR-Code bereits gescannt',
                    reason: duplicateCheck.reason,
                    qrData
                };
            }

            // 2. QR-Daten dekodieren falls nicht vorhanden
            if (!decodedData) {
                decodedData = this.decodeQRData(qrData);
            }

            // 3. JSON-Payload für berechnete Spalte erstellen
            const jsonPayload = {
                auftrag: decodedData.auftrag,
                kunde: decodedData.kunde,
                paket: decodedData.paket,
                ...decodedData.additional
            };

            // 4. In QrScans-Tabelle einfügen
            const request = new mssql.Request(transaction);
            const result = await request
                .input('sessionId', mssql.Int, sessionId)
                .input('rawPayload', mssql.NVarChar, qrData)
                .input('jsonPayload', mssql.NVarChar, JSON.stringify(jsonPayload))
                .input('capturedTS', mssql.DateTime2, new Date())
                .query(`
                    INSERT INTO QrScans (SessionID, RawPayload, JsonPayload, CapturedTS)
                    OUTPUT INSERTED.ID, INSERTED.CapturedTS
                    VALUES (@sessionId, @rawPayload, @jsonPayload, @capturedTS)
                `);

            const scanRecord = result.recordset[0];

            // 5. Session-Statistiken aktualisieren
            await request
                .input('scanId', mssql.Int, scanRecord.ID)
                .query(`
                    UPDATE Sessions 
                    SET 
                        LastActivity = SYSDATETIME(),
                        ScanCount = ISNULL(ScanCount, 0) + 1
                    WHERE ID = @sessionId
                `);

            await transaction.commit();

            // 6. Memory-Caches aktualisieren
            this.globalScans.add(qrData);

            if (!this.sessionScans.has(sessionId)) {
                this.sessionScans.set(sessionId, new Set());
            }
            this.sessionScans.get(sessionId).add(qrData);

            console.log(`✅ QR-Scan gespeichert: ${decodedData.auftrag || 'N/A'} (ID: ${scanRecord.ID})`);

            return {
                success: true,
                scanId: scanRecord.ID,
                timestamp: scanRecord.CapturedTS,
                decodedData,
                qrData
            };

        } catch (error) {
            await transaction.rollback();
            console.error('❌ QR-Scan speichern fehlgeschlagen:', error);

            return {
                success: false,
                error: 'Datenbankfehler: ' + error.message,
                qrData,
                decodedData
            };
        }
    }

    // Session-Scans abrufen
    async getSessionScans(sessionId, limit = 50) {
        try {
            const result = await this.db.query(`
                SELECT TOP (@limit)
                    ID,
                    RawPayload,
                    JsonPayload,
                    CapturedTS,
                    ISNULL(JSON_VALUE(JsonPayload, '$.auftrag'), 'N/A') AS Auftrag,
                    ISNULL(JSON_VALUE(JsonPayload, '$.kunde'), 'N/A') AS Kunde,
                    ISNULL(JSON_VALUE(JsonPayload, '$.paket'), 'N/A') AS Paket
                FROM QrScans
                WHERE SessionID = @sessionId
                ORDER BY CapturedTS DESC
            `, [
                { name: 'sessionId', type: mssql.Int, value: sessionId },
                { name: 'limit', type: mssql.Int, value: limit }
            ]);

            return result.recordset || [];

        } catch (error) {
            console.error('❌ Session-Scans abrufen fehlgeschlagen:', error);
            return [];
        }
    }

    // Tagesstatistiken
    async getDailyStats(date = new Date()) {
        try {
            const dateStr = date.toISOString().split('T')[0];

            const result = await this.db.query(`
                SELECT 
                    COUNT(*) AS TotalScans,
                    COUNT(DISTINCT SessionID) AS ActiveSessions,
                    COUNT(DISTINCT JSON_VALUE(JsonPayload, '$.auftrag')) AS UniqueAuftraege,
                    COUNT(DISTINCT JSON_VALUE(JsonPayload, '$.kunde')) AS UniqueKunden,
                    MIN(CapturedTS) AS FirstScan,
                    MAX(CapturedTS) AS LastScan
                FROM QrScans 
                WHERE CAST(CapturedTS AS DATE) = @date
            `, [
                { name: 'date', type: mssql.Date, value: dateStr }
            ]);

            return result.recordset[0] || {
                TotalScans: 0,
                ActiveSessions: 0,
                UniqueAuftraege: 0,
                UniqueKunden: 0,
                FirstScan: null,
                LastScan: null
            };

        } catch (error) {
            console.error('❌ Tagesstatistiken abrufen fehlgeschlagen:', error);
            return null;
        }
    }

    // Session-Cleanup beim Logout
    async cleanupSession(sessionId) {
        try {
            // Session-spezifische Duplikatprüfung entfernen
            if (this.sessionScans.has(sessionId)) {
                this.sessionScans.delete(sessionId);
                console.log(`🧹 Session ${sessionId} aus Memory-Cache entfernt`);
            }

            // Optional: Alte globale Caches bereinigen (alle 24h)
            const now = Date.now();
            if (!this.lastCleanup || now - this.lastCleanup > 24 * 60 * 60 * 1000) {
                await this.cleanupGlobalCache();
                this.lastCleanup = now;
            }

        } catch (error) {
            console.error('❌ Session-Cleanup fehlgeschlagen:', error);
        }
    }

    // Globalen Cache bereinigen
    async cleanupGlobalCache() {
        try {
            console.log('🧹 Globaler QR-Cache wird bereinigt...');

            // Nur Codes der letzten 24h behalten
            const result = await this.db.query(`
                SELECT DISTINCT RawPayload 
                FROM QrScans 
                WHERE CapturedTS >= DATEADD(day, -1, SYSDATETIME())
            `);

            const recentCodes = new Set();
            if (result.recordset) {
                result.recordset.forEach(row => {
                    recentCodes.add(row.RawPayload);
                });
            }

            this.globalScans = recentCodes;
            console.log(`✅ Globaler Cache bereinigt: ${this.globalScans.size} aktuelle Codes`);

        } catch (error) {
            console.error('❌ Globaler Cache-Cleanup fehlgeschlagen:', error);
        }
    }

    // QR-Scan-Handler-Status
    getStatus() {
        return {
            globalCacheSize: this.globalScans.size,
            activeSessions: this.sessionScans.size,
            memoryUsage: process.memoryUsage(),
            lastCleanup: this.lastCleanup || null
        };
    }
}

module.exports = QRScanHandler;