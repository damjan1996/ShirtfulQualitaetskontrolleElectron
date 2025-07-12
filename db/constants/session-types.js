/**
 * SessionType Constants and Setup Functions für Qualitätskontrolle
 * Definiert SessionTypes und stellt Setup-Funktionen bereit
 */

// ===== SESSIONTYPE CONSTANTS =====

/**
 * Standard SessionTypes für die Qualitätskontrolle-Anwendung
 */
const SESSION_TYPES = {
    QUALITAETSKONTROLLE: 'Qualitätskontrolle',
    WARENEINLAGERUNG: 'Wareneinlagerung',
    KOMMISSIONIERUNG: 'Kommissionierung',
    INVENTUR: 'Inventur',
    WARTUNG: 'Wartung'
};

/**
 * SessionType Konfigurationen mit Metadaten für Qualitätskontrolle
 */
const SESSION_TYPE_CONFIG = {
    [SESSION_TYPES.QUALITAETSKONTROLLE]: {
        id: SESSION_TYPES.QUALITAETSKONTROLLE,
        name: 'Qualitätskontrolle',
        description: 'Qualitätsprüfung und -kontrolle',
        icon: '🔍',
        color: 'orange',
        defaultDuration: 240, // 4 Stunden in Minuten
        allowedQRTypes: ['decoded_qr', 'barcode', 'alphanumeric'],
        priority: 1, // Höchste Priorität für Qualitätskontrolle
        scanLogic: 'dual_scan' // Zweimaliges Scannen
    },
    [SESSION_TYPES.WARENEINLAGERUNG]: {
        id: SESSION_TYPES.WARENEINLAGERUNG,
        name: 'Wareneinlagerung',
        description: 'Eingehende Waren scannen und einlagern - Hauptfunktion',
        icon: '📦',
        color: 'blue',
        defaultDuration: 480, // 8 Stunden in Minuten
        allowedQRTypes: ['decoded_qr', 'caret_separated', 'star_separated'],
        priority: 2
    },
    [SESSION_TYPES.KOMMISSIONIERUNG]: {
        id: SESSION_TYPES.KOMMISSIONIERUNG,
        name: 'Kommissionierung',
        description: 'Warenzusammenstellung und Versand',
        icon: '📋',
        color: 'green',
        defaultDuration: 480, // 8 Stunden in Minuten
        allowedQRTypes: ['decoded_qr', 'caret_separated'],
        priority: 3
    },
    [SESSION_TYPES.INVENTUR]: {
        id: SESSION_TYPES.INVENTUR,
        name: 'Inventur',
        description: 'Bestandserfassung und Inventur',
        icon: '📊',
        color: 'purple',
        defaultDuration: 360, // 6 Stunden in Minuten
        allowedQRTypes: ['decoded_qr', 'barcode', 'alphanumeric'],
        priority: 4
    },
    [SESSION_TYPES.WARTUNG]: {
        id: SESSION_TYPES.WARTUNG,
        name: 'Wartung',
        description: 'Wartungsarbeiten und Instandhaltung',
        icon: '🔧',
        color: 'red',
        defaultDuration: 120, // 2 Stunden in Minuten
        allowedQRTypes: ['alphanumeric', 'barcode'],
        priority: 5
    }
};

// ===== HELPER FUNCTIONS =====

/**
 * Gibt SessionType-Konfiguration zurück
 */
function getSessionTypeConfig(typeName) {
    return SESSION_TYPE_CONFIG[typeName] || null;
}

/**
 * Gibt alle verfügbaren SessionTypes zurück, sortiert nach Priorität
 */
function getAllSessionTypes() {
    return Object.values(SESSION_TYPE_CONFIG)
        .sort((a, b) => a.priority - b.priority);
}

/**
 * Gibt SessionTypes für Qualitätskontrolle zurück (priorisiert)
 */
function getQualityControlSessionTypes() {
    return [
        SESSION_TYPE_CONFIG[SESSION_TYPES.QUALITAETSKONTROLLE],
        SESSION_TYPE_CONFIG[SESSION_TYPES.WARENEINLAGERUNG],
        SESSION_TYPE_CONFIG[SESSION_TYPES.INVENTUR]
    ].filter(Boolean);
}

/**
 * Prüft ob ein SessionType für zweimaliges Scannen konfiguriert ist
 */
function isDualScanType(typeName) {
    const config = getSessionTypeConfig(typeName);
    return config && config.scanLogic === 'dual_scan';
}

// ===== DATABASE SETUP FUNCTIONS =====

/**
 * Hauptfunktion: SessionTypes für Qualitätskontrolle einrichten
 */
async function setupSessionTypes(dbClient) {
    try {
        console.log('🔧 Richte SessionTypes für Qualitätskontrolle ein...');

        let createdCount = 0;
        const sessionTypes = getAllSessionTypes();

        // Einzelne SessionTypes einrichten
        for (const sessionType of sessionTypes) {
            try {
                const typeId = await dbClient.ensureScannerType(sessionType.name);

                if (typeId) {
                    // Priorität setzen (falls unterstützt)
                    await dbClient.setScannerTypePriority(sessionType.name, sessionType.priority);
                    createdCount++;
                } else {
                    console.warn(`⚠️ SessionType '${sessionType.name}' konnte nicht erstellt werden`);
                }
            } catch (error) {
                console.error(`❌ Fehler beim Einrichten von SessionType '${sessionType.name}':`, error);
            }
        }

        console.log(`✅ SessionTypes Setup abgeschlossen. ${createdCount} neue SessionTypes erstellt.`);

        // Priorität für Qualitätskontrolle setzen
        await setPriorityForQualityControl(dbClient);

        return createdCount > 0;

    } catch (error) {
        console.error('❌ SessionTypes Setup fehlgeschlagen:', error);
        return false;
    }
}

/**
 * Setzt Priorität für Qualitätskontrolle-SessionType
 */
async function setPriorityForQualityControl(dbClient) {
    try {
        const qualityControlConfig = SESSION_TYPE_CONFIG[SESSION_TYPES.QUALITAETSKONTROLLE];
        const success = await dbClient.setScannerTypePriority(
            qualityControlConfig.name,
            qualityControlConfig.priority
        );

        if (success) {
            console.log(`📊 Priorität für '${qualityControlConfig.name}' auf ${qualityControlConfig.priority} gesetzt`);
        }

        return success;
    } catch (error) {
        console.error('❌ Priorität für Qualitätskontrolle setzen fehlgeschlagen:', error);
        return false;
    }
}

/**
 * Erstellt SessionTypes-View in der Datenbank (falls nicht vorhanden)
 */
async function createSessionTypesView(dbClient) {
    try {
        console.log('🗄️ Prüfe SessionTypes-View...');

        // Zuerst prüfen ob View bereits existiert
        const checkResult = await dbClient.query(`
            SELECT COUNT(*) as viewExists
            FROM sys.views 
            WHERE name = 'SessionTypes'
        `);

        if (checkResult.recordset[0].viewExists > 0) {
            console.log('✅ SessionTypes-View bereits vorhanden');
            return true;
        }

        console.log('🗄️ Erstelle SessionTypes-View...');

        const createViewSQL = `
            CREATE VIEW SessionTypes AS
            SELECT 
                ID,
                Bezeichnung as TypeName,
                CASE Bezeichnung
                    WHEN 'Qualitätskontrolle' THEN 'Qualitätsprüfung und -kontrolle'
                    WHEN 'Wareneinlagerung' THEN 'Eingehende Waren scannen und einlagern - Hauptfunktion'
                    WHEN 'Kommissionierung' THEN 'Warenzusammenstellung und Versand'
                    WHEN 'Inventur' THEN 'Bestandserfassung und Inventur'
                    WHEN 'Wartung' THEN 'Wartungsarbeiten und Instandhaltung'
                    ELSE 'Scan-Typ: ' + Bezeichnung
                END as Description,
                CASE 
                    WHEN xStatus = 0 THEN 1 
                    ELSE 0 
                END as IsActive,
                xStatus as Priority,
                xDatum as CreatedAt
            FROM ScannTyp
        `;

        await dbClient.query(createViewSQL);
        console.log('✅ SessionTypes-View erfolgreich erstellt');
        return true;

    } catch (error) {
        console.warn('⚠️ SessionTypes-View erstellen fehlgeschlagen (nicht kritisch):', error.message);
        return false;
    }
}

/**
 * Validiert vorhandene SessionTypes
 */
async function validateSessionTypes(dbClient) {
    try {
        const sessionTypes = await dbClient.getSessionTypes();

        console.log(`📋 Verfügbare SessionTypes (${sessionTypes.length}):`);
        sessionTypes.forEach(type => {
            const config = getSessionTypeConfig(type.TypeName);
            const icon = config ? config.icon : '📄';
            console.log(`   - ${type.TypeName}: ${type.Description}`);
        });

        // Prüfen ob Qualitätskontrolle verfügbar
        const hasQualityControl = sessionTypes.some(type =>
            type.TypeName.includes('Qualitätskontrolle') ||
            type.TypeName.includes('QUALITAETSKONTROLLE')
        );

        if (!hasQualityControl) {
            console.warn('⚠️ Qualitätskontrolle-SessionType nicht gefunden');
        }

        return sessionTypes;

    } catch (error) {
        console.error('❌ SessionTypes validieren fehlgeschlagen:', error);
        return [];
    }
}

/**
 * Führt komplettes SessionTypes-Setup durch
 */
async function initializeSessionTypesForQualityControl(dbClient) {
    try {
        console.log('🚀 Initialisiere SessionTypes für Qualitätskontrolle...');

        // 1. SessionTypes-View erstellen
        await createSessionTypesView(dbClient);

        // 2. SessionTypes einrichten
        const setupSuccess = await setupSessionTypes(dbClient);

        // 3. SessionTypes validieren
        const sessionTypes = await validateSessionTypes(dbClient);

        // 4. Qualitätskontrolle-spezifische Konfiguration
        if (sessionTypes.length > 0) {
            await setPriorityForQualityControl(dbClient);
        }

        console.log('✅ SessionTypes für Qualitätskontrolle initialisiert');
        return {
            success: setupSuccess,
            sessionTypes: sessionTypes,
            qualityControlAvailable: sessionTypes.some(type =>
                type.TypeName.includes('Qualitätskontrolle')
            )
        };

    } catch (error) {
        console.error('❌ SessionTypes-Initialisierung fehlgeschlagen:', error);
        return {
            success: false,
            sessionTypes: [],
            qualityControlAvailable: false,
            error: error.message
        };
    }
}

// ===== EXPORTS =====
module.exports = {
    // Constants
    SESSION_TYPES,
    SESSION_TYPE_CONFIG,

    // Helper Functions
    getSessionTypeConfig,
    getAllSessionTypes,
    getQualityControlSessionTypes,
    isDualScanType,

    // Setup Functions
    setupSessionTypes,
    createSessionTypesView,
    validateSessionTypes,
    initializeSessionTypesForQualityControl,
    setPriorityForQualityControl,

    // Main Export
    setupSessionTypes: initializeSessionTypesForQualityControl
};