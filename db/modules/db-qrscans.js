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
 * QR-Scan Management Module
 * Handles QR code scanning, storage, retrieval, and duplicate checking
 */
class QRScanModule {
    constructor(dbConnection, utils) {
        this.db = dbConnection;
        this.utils = utils;
    }

    // ===== QR-SCAN OPERATIONEN MIT STRUKTURIERTEN RETURN-VALUES =====
    async saveQRScan(sessionId, payload) {
        const cacheKey = `${sessionId}_${payload}`;
        const now = Date.now();

        try {
            console.log(`[INFO] Speichere QR-Scan für Session ${sessionId}`);

            // 1. Prüfe ob bereits in Verarbeitung
            if (this.utils.pendingScans.has(cacheKey)) {
                return {
                    success: false,
                    status: 'processing',
                    message: 'QR-Code wird bereits verarbeitet',
                    data: null,
                    timestamp: new Date().toISOString()
                };
            }

            // 2. Markiere als in Verarbeitung
            this.utils.pendingScans.set(cacheKey, now);

            // 3. Prüfe Cache - REDUZIERTES ZEITFENSTER AUF 10 MINUTEN
            const cachedTime = this.utils.duplicateCache.get(payload);
            if (cachedTime) {
                const minutesAgo = Math.floor((now - cachedTime) / (1000 * 60));
                if (minutesAgo < 10) { // 10 Minuten statt 24 Stunden
                    this.utils.duplicateCache.set(payload, now); // Cache aktualisieren
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
                this.utils.duplicateCache.set(payload, now);
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

            // 5. QR-Code dekodieren (NUR im Code, nicht in DB)
            const decodedData = this.utils.parseQRCodeData(payload);

            // 6. QR-Scan speichern - NUR RawPayload (NIEMALS PayloadJson schreiben!)
            try {
                // Nochmalige Duplikat-Prüfung direkt vor Insert
                const finalDupCheck = await this.db.query(`
                        SELECT COUNT(*) as duplicateCount,
                               MAX(CapturedTS) as lastScanTime
                        FROM dbo.QrScans
                        WHERE RawPayload = ?
                          AND CapturedTS >= DATEADD(MINUTE, -10, SYSDATETIME())
                          AND Valid = 1
                    `, [payload]);

                if (finalDupCheck.recordset[0].duplicateCount > 0) {
                    const lastScanTime = finalDupCheck.recordset[0].lastScanTime;
                    const minutesAgo = lastScanTime ?
                        Math.floor((now - new Date(lastScanTime).getTime()) / (1000 * 60)) : 0;

                    return {
                        success: false,
                        status: 'duplicate_transaction',
                        message: `QR-Code bereits vor ${minutesAgo} Minuten gescannt`,
                        data: null,
                        duplicateInfo: { minutesAgo, source: 'transaction' },
                        timestamp: new Date().toISOString()
                    };
                }

                // SICHERES INSERT - NUR RawPayload (PayloadJson wird NICHT gesetzt!)
                const insertResult = await this.db.query(`
                        INSERT INTO dbo.QrScans (SessionID, RawPayload, Valid, CapturedTS)
                            OUTPUT INSERTED.ID, INSERTED.CapturedTS
                        VALUES (?, ?, 1, SYSDATETIME())
                    `, [sessionId, payload]);

                const rawResult = insertResult.recordset[0];

                // Erstelle virtuelles PayloadJson für die Antwort (NUR im Code!)
                const virtualPayloadJson = JSON.stringify({
                    type: 'decoded_qr',
                    raw: payload,
                    decoded: decodedData,
                    parsed_at: new Date().toISOString(),
                    has_auftrag: !!decodedData.auftrags_nr,
                    has_paket: !!decodedData.paket_nr,
                    has_kunde: !!decodedData.kunden_name
                });

                // Erfolgreich gespeichert - Cache aktualisieren
                this.utils.duplicateCache.set(payload, now);
                customConsole.success(`QR-Scan gespeichert und dekodiert: ID ${rawResult.ID}, Auftrag: ${decodedData.auftrags_nr}, Paket: ${decodedData.paket_nr}`);

                return {
                    success: true,
                    status: 'saved',
                    message: 'QR-Code erfolgreich gespeichert und dekodiert',
                    data: {
                        ID: rawResult.ID,
                        CapturedTS: this.utils.normalizeTimestamp(rawResult.CapturedTS),
                        RawPayload: payload,
                        PayloadJson: virtualPayloadJson, // Virtual PayloadJson nur für Kompatibilität
                        ParsedPayload: JSON.parse(virtualPayloadJson),
                        DecodedData: decodedData
                    },
                    timestamp: new Date().toISOString()
                };

            } catch (insertError) {
                customConsole.error('Insert-Fehler:', insertError);
                return {
                    success: false,
                    status: 'error',
                    message: `Datenbankfehler: ${insertError.message}`,
                    data: null,
                    timestamp: new Date().toISOString()
                };
            }

        } catch (error) {
            customConsole.error('Fehler beim Speichern des QR-Scans:', error);
            return {
                success: false,
                status: 'error',
                message: `Unerwarteter Fehler: ${error.message}`,
                data: null,
                timestamp: new Date().toISOString()
            };
        } finally {
            // Immer aus Pending-Set entfernen
            this.utils.pendingScans.delete(cacheKey);
        }
    }

    // ===== QR-SCAN RETRIEVAL METHODS =====
    async getQRScansBySession(sessionId, limit = 50) {
        try {
            const result = await this.db.query(`
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
                CapturedTS: this.utils.normalizeTimestamp(scan.CapturedTS),
                ParsedPayload: this.utils.parsePayloadJson(scan.PayloadJson),
                DecodedData: this.utils.extractDecodedData(scan.PayloadJson, scan.RawPayload),
                FormattedTime: this.utils.formatRelativeTime(scan.CapturedTS)
            }));

            return enhancedScans;
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der QR-Scans:', error);
            throw error;
        }
    }

    async getQRScanById(scanId) {
        try {
            const result = await this.db.query(`
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
                CapturedTS: this.utils.normalizeTimestamp(scan.CapturedTS),
                ParsedPayload: this.utils.parsePayloadJson(scan.PayloadJson),
                DecodedData: this.utils.extractDecodedData(scan.PayloadJson, scan.RawPayload),
                FormattedTime: this.utils.formatRelativeTime(scan.CapturedTS)
            };
        } catch (error) {
            customConsole.error('Fehler beim Abrufen des QR-Scans:', error);
            throw error;
        }
    }

    async getRecentQRScans(limit = 20) {
        try {
            const result = await this.db.query(`
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
                CapturedTS: this.utils.normalizeTimestamp(scan.CapturedTS),
                ParsedPayload: this.utils.parsePayloadJson(scan.PayloadJson),
                DecodedData: this.utils.extractDecodedData(scan.PayloadJson, scan.RawPayload),
                FormattedTime: this.utils.formatRelativeTime(scan.CapturedTS)
            }));
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der letzten QR-Scans:', error);
            throw error;
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

            const result = await this.db.query(`
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
                CapturedTS: this.utils.normalizeTimestamp(scan.CapturedTS),
                UserFullName: `${scan.Vorname || ''} ${scan.Nachname || ''}`.trim()
            }));
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der QR-Scans:', error);
            return [];
        }
    }

    // ===== QR-SCAN STATISTICS =====
    async getQRScanStats(sessionId = null) {
        try {
            const whereClause = sessionId ? 'WHERE SessionID = ?' : '';
            const params = sessionId ? [sessionId] : [];

            // Einfache robuste Query ohne JSON-Funktionen
            const result = await this.db.query(`
                SELECT
                    COUNT(*) as TotalScans,
                    COUNT(CASE WHEN RawPayload LIKE '%^%' AND LEN(RawPayload) - LEN(REPLACE(RawPayload, '^', '')) >= 3 THEN 1 END) as CaretSeparated,
                    COUNT(CASE WHEN RawPayload LIKE '%[A-Z][A-Z]-%' THEN 1 END) as ScansWithAuftrag,
                    COUNT(CASE WHEN RawPayload LIKE '%[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]%' THEN 1 END) as ScansWithPaket,
                    COUNT(CASE WHEN RawPayload LIKE '%KUNDENNAME:%' OR RawPayload LIKE '%Kunden-ID:%' THEN 1 END) as ScansWithKunde,
                    COUNT(CASE WHEN RawPayload LIKE 'http%' THEN 1 END) as URLs,
                    COUNT(CASE WHEN RawPayload NOT LIKE '%^%' AND RawPayload NOT LIKE 'http%' AND LEN(RawPayload) < 50 THEN 1 END) as TextCodes,
                    MIN(CapturedTS) as FirstScan,
                    MAX(CapturedTS) as LastScan
                FROM dbo.QrScans
                WHERE Valid = 1 ${sessionId ? 'AND SessionID = ?' : ''}
            `, params);

            const stats = result.recordset[0];

            // Berechne DecodedScans basierend auf Pattern-Matching
            const decodedScans = (stats.ScansWithAuftrag || 0) + (stats.ScansWithPaket || 0) + (stats.CaretSeparated || 0);

            return {
                TotalScans: stats.TotalScans || 0,
                DecodedScans: Math.min(decodedScans, stats.TotalScans), // Kann nicht mehr als Total sein
                ScansWithAuftrag: stats.ScansWithAuftrag || 0,
                ScansWithPaket: stats.ScansWithPaket || 0,
                ScansWithKunde: stats.ScansWithKunde || 0,
                CaretSeparated: stats.CaretSeparated || 0,
                StarSeparated: 0, // Kann ohne PayloadJson nicht erkannt werden
                Alphanumeric: 0,
                Barcodes: 0,
                URLs: stats.URLs || 0,
                TextCodes: stats.TextCodes || 0,
                FirstScan: stats.FirstScan ? this.utils.normalizeTimestamp(stats.FirstScan) : null,
                LastScan: stats.LastScan ? this.utils.normalizeTimestamp(stats.LastScan) : null,
                DecodingSuccessRate: stats.TotalScans > 0 ?
                    Math.round((Math.min(decodedScans, stats.TotalScans) / stats.TotalScans) * 100) : 0
            };
        } catch (error) {
            customConsole.error('Fehler beim Abrufen der QR-Scan-Statistiken:', error);

            // Minimaler Fallback
            return {
                TotalScans: 0,
                DecodedScans: 0,
                ScansWithAuftrag: 0,
                ScansWithPaket: 0,
                ScansWithKunde: 0,
                CaretSeparated: 0,
                StarSeparated: 0,
                Alphanumeric: 0,
                Barcodes: 0,
                URLs: 0,
                TextCodes: 0,
                FirstScan: null,
                LastScan: null,
                DecodingSuccessRate: 0
            };
        }
    }

    // ===== SEARCH FUNCTIONALITY =====
    async searchQRScans(searchTerm, sessionId = null, limit = 20) {
        try {
            // Vereinfachte Suche nur in RawPayload (da PayloadJson computed column sein kann)
            let whereClause = "WHERE RawPayload LIKE ?";
            let params = [`%${searchTerm}%`];

            if (sessionId) {
                whereClause += " AND SessionID = ?";
                params.push(sessionId);
            }

            const result = await this.db.query(`
                SELECT TOP ${limit}
                    ID,
                    SessionID,
                       RawPayload,
                       PayloadJson,
                       CapturedTS
                FROM dbo.QrScans
                         ${whereClause}
                ORDER BY CapturedTS DESC
            `, params);

            return result.recordset.map(scan => ({
                ...scan,
                CapturedTS: this.utils.normalizeTimestamp(scan.CapturedTS),
                ParsedPayload: this.utils.parsePayloadJson(scan.PayloadJson),
                DecodedData: this.utils.extractDecodedData(scan.PayloadJson, scan.RawPayload),
                Format: this.utils.getQRCodeFormat(scan.PayloadJson, scan.RawPayload),
                FormattedTime: this.utils.formatRelativeTime(scan.CapturedTS)
            }));
        } catch (error) {
            customConsole.error('Fehler bei QR-Code-Suche:', error);
            throw error;
        }
    }

    // ===== DUPLICATE CHECKING =====
    async checkQRDuplicate(payload, timeWindowHours = 0.17) { // Default: 10 Minuten
        try {
            // Prüfe auf Duplikate in den letzten X Stunden
            const result = await this.db.query(`
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

    async checkForDuplicates(rawPayload, sessionId, minutesBack = 10) {
        try {
            const result = await this.db.query(`
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
                        CapturedTS: this.utils.normalizeTimestamp(duplicate.CapturedTS),
                        ParsedPayload: this.utils.parsePayloadJson(duplicate.PayloadJson),
                        DecodedData: this.utils.extractDecodedData(duplicate.PayloadJson, duplicate.RawPayload)
                    }
                };
            }

            return { isDuplicate: false };
        } catch (error) {
            customConsole.error('Fehler bei Duplikat-Prüfung:', error);
            return { isDuplicate: false };
        }
    }

    // ===== COMPATIBILITY METHODS =====
    async getSessionScans(sessionId, limit = 50) {
        return await this.getQRScansBySession(sessionId, limit);
    }
}

module.exports = QRScanModule;