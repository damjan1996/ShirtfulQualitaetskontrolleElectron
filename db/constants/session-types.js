/**
 * Session Types Constants für Qualitätskontrolle
 * Definiert verschiedene Session-Typen und deren Konfiguration
 * Spezialisiert für Doppel-Scan-System und automatische Session-Verwaltung
 */

// ===== QUALITÄTSKONTROLLE SESSION TYPES =====
const SESSION_TYPES = {
    // Haupttyp: Qualitätskontrolle mit Doppel-Scan-System
    QUALITAETSKONTROLLE: {
        name: 'Qualitaetskontrolle',
        displayName: 'Qualitätskontrolle',
        description: 'Doppel-Scan-System für präzise Karton-Bearbeitung',
        color: '#2563eb',
        icon: '🔍',

        // Qualitätskontrolle-spezifische Konfiguration
        features: {
            doubleScanRequired: true,           // Doppel-Scan ist Pflicht
            autoSessionEnd: true,               // Session endet automatisch nach 2. Scan
            autoSessionRestart: true,           // Neue Session startet automatisch
            duplicateDetection: true,           // Duplikat-Erkennung aktiviert
            processingTimeTracking: true,       // Bearbeitungszeit-Tracking
            parallelSessions: true              // Mehrere parallele Sessions erlaubt
        },

        // QR-Scan-Konfiguration
        qrScanConfig: {
            maxScansPerCode: 2,                 // Maximal 2 Scans pro QR-Code
            duplicateErrorOnThird: true,        // Duplikatfehler bei 3. Scan
            scanStates: ['not_scanned', 'in_progress', 'completed'],
            statusTransitions: {
                'not_scanned': 'in_progress',   // 1. Scan
                'in_progress': 'completed'      // 2. Scan
            }
        },

        // Session-Management
        sessionConfig: {
            autoEndTrigger: 'second_scan',      // Session endet nach 2. Scan
            restartDelay: 500,                  // 500ms Verzögerung vor Neustart
            maxDuration: 28800000,              // 8 Stunden maximale Session-Dauer
            inactivityTimeout: null,            // Kein Inaktivitäts-Timeout
            parallelLimit: 15                   // Maximal 15 parallele Sessions
        },

        // Validierung und Regeln
        validation: {
            requireSecondScanSameSession: true, // 2. Scan muss von gleicher Session kommen
            allowCrossSessionScanning: false,   // Kein sessionübergreifendes Scannen
            enforceSequentialScanning: true,    // Sequenzielles Scannen erzwingen
            preventDuplicateProcessing: true    // Doppelte Bearbeitung verhindern
        },

        // Metriken und Statistiken
        metrics: {
            trackProcessingTime: true,          // Bearbeitungszeit tracken
            trackCompletionRate: true,          // Abschlussrate tracken
            trackDuplicateAttempts: true,       // Duplikat-Versuche tracken
            trackSessionEfficiency: true       // Session-Effizienz tracken
        }
    },

    // Fallback: Standard Qualitätskontrolle ohne spezielle Features
    QUALITAETSKONTROLLE_BASIC: {
        name: 'QualitaetskontrolleBasic',
        displayName: 'Qualitätskontrolle (Basic)',
        description: 'Vereinfachte Qualitätskontrolle ohne Doppel-Scan',
        color: '#64748b',
        icon: '📋',

        features: {
            doubleScanRequired: false,
            autoSessionEnd: false,
            autoSessionRestart: false,
            duplicateDetection: true,
            processingTimeTracking: false,
            parallelSessions: true
        },

        qrScanConfig: {
            maxScansPerCode: 1,
            duplicateErrorOnThird: false,
            scanStates: ['not_scanned', 'scanned'],
            statusTransitions: {
                'not_scanned': 'scanned'
            }
        },

        sessionConfig: {
            autoEndTrigger: null,
            restartDelay: 0,
            maxDuration: 28800000,
            inactivityTimeout: 3600000,         // 1 Stunde Inaktivitäts-Timeout
            parallelLimit: 10
        }
    },

    // Development/Test: Qualitätskontrolle mit erweiterten Debug-Features
    QUALITAETSKONTROLLE_DEBUG: {
        name: 'QualitaetskontrolleDebug',
        displayName: 'Qualitätskontrolle (Debug)',
        description: 'Qualitätskontrolle mit erweiterten Debug-Features',
        color: '#f59e0b',
        icon: '🐛',

        features: {
            doubleScanRequired: true,
            autoSessionEnd: true,
            autoSessionRestart: true,
            duplicateDetection: true,
            processingTimeTracking: true,
            parallelSessions: true,
            debugLogging: true,                 // Erweiterte Debug-Logs
            simulationMode: true,               // Simulation-Modus
            testDataGeneration: true            // Test-Daten-Generierung
        },

        qrScanConfig: {
            maxScansPerCode: 2,
            duplicateErrorOnThird: true,
            scanStates: ['not_scanned', 'in_progress', 'completed'],
            statusTransitions: {
                'not_scanned': 'in_progress',
                'in_progress': 'completed'
            },
            allowTestCodes: true,               // Test-QR-Codes erlauben
            debugValidation: false              // Debug-Modus: Weniger strenge Validierung
        },

        sessionConfig: {
            autoEndTrigger: 'second_scan',
            restartDelay: 100,                  // Schnellerer Restart für Tests
            maxDuration: 7200000,               // 2 Stunden für Tests
            inactivityTimeout: null,
            parallelLimit: 20                   // Mehr parallele Sessions für Tests
        }
    }
};

// ===== SESSION TYPE UTILITIES =====
class SessionTypeConstants {

    /**
     * Alle verfügbaren Session-Typen abrufen
     */
    static getAllSessionTypes() {
        return Object.values(SESSION_TYPES);
    }

    /**
     * Session-Typ nach Name abrufen
     */
    static getSessionType(name) {
        const sessionType = Object.values(SESSION_TYPES).find(type => type.name === name);
        if (!sessionType) {
            console.warn(`Session-Typ '${name}' nicht gefunden, verwende Fallback`);
            return SESSION_TYPES.QUALITAETSKONTROLLE_BASIC;
        }
        return sessionType;
    }

    /**
     * Standard-Session-Typ für Qualitätskontrolle
     */
    static getDefaultSessionType() {
        return SESSION_TYPES.QUALITAETSKONTROLLE;
    }

    /**
     * Session-Typ-Konfiguration abrufen
     */
    static getSessionTypeConfig(sessionTypeName) {
        const sessionType = this.getSessionType(sessionTypeName);
        return sessionType || SESSION_TYPES.QUALITAETSKONTROLLE;
    }

    /**
     * Validiert QR-Code für spezifischen Session-Typ
     */
    static validateQRForSessionType(sessionTypeName, qrData) {
        const sessionType = this.getSessionType(sessionTypeName);

        if (!sessionType) {
            return {
                isValid: false,
                message: 'Unbekannter Session-Typ',
                sessionType: null
            };
        }

        // Qualitätskontrolle-spezifische Validierung
        if (sessionType.name === 'Qualitaetskontrolle') {
            return this.validateQualityControlQR(qrData, sessionType);
        }

        // Basic-Validierung für andere Typen
        return this.validateBasicQR(qrData, sessionType);
    }

    /**
     * Qualitätskontrolle-spezifische QR-Validierung
     */
    static validateQualityControlQR(qrData, sessionType) {
        const validation = {
            isValid: true,
            message: 'QR-Code gültig für Qualitätskontrolle',
            sessionType: sessionType.name,
            scanType: 'quality_control',
            features: sessionType.features
        };

        // QR-Code-Format prüfen
        if (!qrData || typeof qrData !== 'object') {
            validation.isValid = false;
            validation.message = 'Ungültiges QR-Code-Format';
            return validation;
        }

        // Doppel-Scan-Anforderungen prüfen
        if (sessionType.features.doubleScanRequired) {
            validation.doubleScanRequired = true;
            validation.maxScansPerCode = sessionType.qrScanConfig.maxScansPerCode;
        }

        // Test-Codes nur im Debug-Modus
        if (qrData.type === 'test' && !sessionType.features?.allowTestCodes) {
            validation.isValid = false;
            validation.message = 'Test-QR-Codes nicht erlaubt in diesem Session-Typ';
            return validation;
        }

        return validation;
    }

    /**
     * Basic QR-Validierung
     */
    static validateBasicQR(qrData, sessionType) {
        return {
            isValid: true,
            message: 'QR-Code gültig',
            sessionType: sessionType.name,
            scanType: 'basic'
        };
    }

    /**
     * Session-Typen in Datenbank einrichten - Angepasst an ScannTyp-Schema
     */
    static async setupSessionTypes(dbConnection) {
        try {
            console.log('🔧 Prüfe ScannTyp für Qualitätskontrolle...');

            const pool = dbConnection.pool;
            if (!pool) {
                throw new Error('Keine Datenbankverbindung verfügbar');
            }

            // Prüfen ob "Qualitätskontrolle" bereits in ScannTyp existiert
            const existingResult = await pool.request().query(`
                SELECT COUNT(*) as count
                FROM ScannTyp
                WHERE Bezeichnung = 'Qualitätskontrolle' AND xStatus = 0
            `);

            if (existingResult.recordset[0].count > 0) {
                console.log('✅ ScannTyp "Qualitätskontrolle" bereits vorhanden (ID: 5.0)');
                return true;
            } else {
                console.log('⚠️ ScannTyp "Qualitätskontrolle" nicht gefunden');
                // In diesem Fall sollte der Scan-Typ bereits existieren
                // Aber wir können ihn nicht erstellen, da das Schema IDs verwendet
                return false;
            }

        } catch (error) {
            console.error('❌ Fehler beim Prüfen der ScannTyp-Einträge:', error);
            // Nicht kritisch - Anwendung kann trotzdem funktionieren
            return false;
        }
    }

    /**
     * Prüft ob SessionTypes-Tabelle existiert
     */
    static async checkSessionTypesTable(pool) {
        try {
            const result = await pool.request().query(`
                SELECT COUNT(*) as count
                FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_NAME = 'SessionTypes'
            `);
            return result.recordset[0].count > 0;
        } catch (error) {
            console.log('SessionTypes-Tabelle existiert nicht, wird erstellt...');
            return false;
        }
    }

    /**
     * Erstellt SessionTypes-Tabelle
     */
    static async createSessionTypesTable(pool) {
        const createTableSQL = `
            CREATE TABLE SessionTypes (
                                          ID int IDENTITY(1,1) PRIMARY KEY,
                                          TypeName nvarchar(100) NOT NULL UNIQUE,
                                          DisplayName nvarchar(255) NOT NULL,
                                          Description nvarchar(500),
                                          Color nvarchar(20),
                                          Icon nvarchar(10),
                                          ConfigJSON nvarchar(MAX),
                                          IsActive bit DEFAULT 1,
                                          CreatedAt datetime2 DEFAULT SYSDATETIME(),
                                          UpdatedAt datetime2 DEFAULT SYSDATETIME()
            )
        `;

        await pool.request().query(createTableSQL);
        console.log('✅ SessionTypes-Tabelle erstellt');
    }

    /**
     * Fügt Session-Typ ein oder aktualisiert ihn
     */
    static async insertOrUpdateSessionType(pool, sessionType) {
        try {
            // Prüfen ob bereits vorhanden
            const existingResult = await pool.request()
                .input('name', sessionType.name)
                .query('SELECT ID FROM SessionTypes WHERE TypeName = @name');

            const configJSON = JSON.stringify({
                features: sessionType.features,
                qrScanConfig: sessionType.qrScanConfig,
                sessionConfig: sessionType.sessionConfig,
                validation: sessionType.validation,
                metrics: sessionType.metrics
            });

            if (existingResult.recordset.length > 0) {
                // Aktualisieren
                await pool.request()
                    .input('name', sessionType.name)
                    .input('displayName', sessionType.displayName)
                    .input('description', sessionType.description)
                    .input('color', sessionType.color)
                    .input('icon', sessionType.icon)
                    .input('configJSON', configJSON)
                    .query(`
                        UPDATE SessionTypes
                        SET DisplayName = @displayName,
                            Description = @description,
                            Color = @color,
                            Icon = @icon,
                            ConfigJSON = @configJSON,
                            UpdatedAt = SYSDATETIME()
                        WHERE TypeName = @name
                    `);

                console.log(`🔄 Session-Typ '${sessionType.name}' aktualisiert`);
                return false;
            } else {
                // Einfügen
                await pool.request()
                    .input('name', sessionType.name)
                    .input('displayName', sessionType.displayName)
                    .input('description', sessionType.description)
                    .input('color', sessionType.color)
                    .input('icon', sessionType.icon)
                    .input('configJSON', configJSON)
                    .query(`
                        INSERT INTO SessionTypes (TypeName, DisplayName, Description, Color, Icon, ConfigJSON)
                        VALUES (@name, @displayName, @description, @color, @icon, @configJSON)
                    `);

                console.log(`✅ Session-Typ '${sessionType.name}' erstellt`);
                return true;
            }

        } catch (error) {
            console.error(`❌ Fehler bei Session-Typ '${sessionType.name}':`, error);
            return false;
        }
    }

    /**
     * Session-Typ-Statistiken abrufen
     */
    static async getSessionTypeStats(dbConnection, startDate = null, endDate = null) {
        try {
            const pool = dbConnection.pool;
            if (!pool) {
                return null;
            }

            let dateFilter = '';
            if (startDate && endDate) {
                dateFilter = `AND s.StartTS BETWEEN '${startDate}' AND '${endDate}'`;
            } else if (startDate) {
                dateFilter = `AND s.StartTS >= '${startDate}'`;
            }

            const result = await pool.request().query(`
                SELECT
                    ISNULL(s.SessionType, 'Qualitaetskontrolle') as SessionType,
                    COUNT(*) as TotalSessions,
                    COUNT(CASE WHEN s.Active = 0 THEN 1 END) as CompletedSessions,
                    COUNT(CASE WHEN s.Active = 1 THEN 1 END) as ActiveSessions,
                    AVG(CASE WHEN s.EndTS IS NOT NULL
                                 THEN DATEDIFF(second, s.StartTS, s.EndTS)
                             ELSE NULL END) as AvgDurationSeconds,
                    COUNT(DISTINCT s.UserID) as UniqueUsers,
                    COUNT(qs.ID) as TotalQRScans
                FROM Sessions s
                         LEFT JOIN QrScans qs ON s.ID = qs.SessionID
                WHERE 1=1 ${dateFilter}
                GROUP BY ISNULL(s.SessionType, 'Qualitaetskontrolle')
                ORDER BY TotalSessions DESC
            `);

            return result.recordset;

        } catch (error) {
            console.error('Fehler beim Abrufen der Session-Typ-Statistiken:', error);
            return null;
        }
    }

    /**
     * Qualitätskontrolle-spezifische Metriken
     */
    static async getQualityControlMetrics(dbConnection, sessionTypeName = 'Qualitaetskontrolle') {
        try {
            const pool = dbConnection.pool;
            if (!pool) {
                return null;
            }

            const result = await pool.request()
                .input('sessionType', sessionTypeName)
                .query(`
                    WITH QualityMetrics AS (
                        SELECT
                            s.ID as SessionID,
                            s.UserID,
                            u.Name as UserName,
                            COUNT(qs.ID) as QRScans,
                            COUNT(DISTINCT qs.RawPayload) as UniqueQRCodes,
                            MIN(qs.CapturedTS) as FirstScan,
                            MAX(qs.CapturedTS) as LastScan,
                            CASE
                                WHEN COUNT(DISTINCT qs.RawPayload) > 0
                                    THEN DATEDIFF(second, MIN(qs.CapturedTS), MAX(qs.CapturedTS)) / COUNT(DISTINCT qs.RawPayload)
                                ELSE 0
                                END as AvgProcessingTimePerCode
                        FROM Sessions s
                                 LEFT JOIN QrScans qs ON s.ID = qs.SessionID
                                 LEFT JOIN ScannBenutzer u ON s.UserID = u.ID
                        WHERE s.SessionType = @sessionType
                          AND s.StartTS >= DATEADD(day, -1, SYSDATETIME())
                        GROUP BY s.ID, s.UserID, u.Name
                    )
                    SELECT
                        COUNT(*) as TotalQCSessions,
                        SUM(QRScans) as TotalQRScans,
                        SUM(UniqueQRCodes) as TotalProcessedCodes,
                        AVG(AvgProcessingTimePerCode) as OverallAvgProcessingTime,
                        COUNT(DISTINCT UserID) as ActiveQCUsers
                    FROM QualityMetrics
                `);

            return result.recordset[0] || null;

        } catch (error) {
            console.error('Fehler beim Abrufen der Qualitätskontrolle-Metriken:', error);
            return null;
        }
    }
}

// ===== QUALITÄTSKONTROLLE-SPEZIFISCHE HILFSFUNKTIONEN =====

/**
 * Prüft ob Session-Typ Doppel-Scan unterstützt
 */
function supportsDoubleScan(sessionTypeName) {
    const sessionType = SessionTypeConstants.getSessionType(sessionTypeName);
    return sessionType?.features?.doubleScanRequired || false;
}

/**
 * Prüft ob Session-Typ automatisches Session-Ende unterstützt
 */
function supportsAutoSessionEnd(sessionTypeName) {
    const sessionType = SessionTypeConstants.getSessionType(sessionTypeName);
    return sessionType?.features?.autoSessionEnd || false;
}

/**
 * Gibt die maximale Anzahl Scans pro QR-Code zurück
 */
function getMaxScansPerCode(sessionTypeName) {
    const sessionType = SessionTypeConstants.getSessionType(sessionTypeName);
    return sessionType?.qrScanConfig?.maxScansPerCode || 1;
}

/**
 * Gibt die erlaubten Scan-Status zurück
 */
function getAllowedScanStates(sessionTypeName) {
    const sessionType = SessionTypeConstants.getSessionType(sessionTypeName);
    return sessionType?.qrScanConfig?.scanStates || ['not_scanned', 'scanned'];
}

/**
 * Gibt die Status-Übergänge zurück
 */
function getStatusTransitions(sessionTypeName) {
    const sessionType = SessionTypeConstants.getSessionType(sessionTypeName);
    return sessionType?.qrScanConfig?.statusTransitions || {};
}

// ===== EXPORT =====
module.exports = {
    SESSION_TYPES,
    SessionTypeConstants,

    // Utility Functions
    supportsDoubleScan,
    supportsAutoSessionEnd,
    getMaxScansPerCode,
    getAllowedScanStates,
    getStatusTransitions,

    // Setup Function
    setupSessionTypes: SessionTypeConstants.setupSessionTypes.bind(SessionTypeConstants)
};