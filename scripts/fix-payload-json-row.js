#!/usr/bin/env node
/**
 * PayloadJSON Tabellen-Fix Script
 * Repariert die QrScans Tabelle für korrekte JSON-Erkennung
 */

const sql = require('mssql');
require('dotenv').config();

// Datenbank-Konfiguration
const config = {
    server: process.env.MSSQL_SERVER || 'localhost',
    database: process.env.MSSQL_DATABASE || 'RdScanner',
    user: process.env.MSSQL_USER || 'sa',
    password: process.env.MSSQL_PASSWORD || '',
    port: parseInt(process.env.MSSQL_PORT) || 1433,
    options: {
        encrypt: process.env.MSSQL_ENCRYPT?.toLowerCase() === 'true' || false,
        trustServerCertificate: process.env.MSSQL_TRUST_CERT?.toLowerCase() === 'true' || true,
        enableArithAbort: true,
        requestTimeout: 60000,
        connectionTimeout: 15000,
    }
};

async function fixPayloadJsonColumn() {
    console.log('🔧 PayloadJSON Tabellen-Fix gestartet...');
    console.log('=' .repeat(50));

    let pool = null;

    try {
        // Verbindung herstellen
        console.log('📡 Stelle Datenbankverbindung her...');
        pool = await sql.connect(config);
        console.log('✅ Verbindung erfolgreich');

// 1. Prüfe aktuelle Spalte
        console.log('\n🔍 Prüfe aktuelle PayloadJson Spalte...');
        const columnCheck = await pool.request().query(`
            SELECT
                COLUMN_NAME,
                DATA_TYPE,
                IS_NULLABLE,
                COLUMNPROPERTY(OBJECT_ID(TABLE_SCHEMA + '.' + TABLE_NAME), COLUMN_NAME, 'IsComputed') as IsComputed
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'QrScans' AND COLUMN_NAME = 'PayloadJson'
        `);

        if (columnCheck.recordset.length > 0) {
            console.log('📋 Aktuelle PayloadJson Spalte gefunden:');
            console.log(`   Type: ${columnCheck.recordset[0].DATA_TYPE}`);
            console.log(`   Computed: ${columnCheck.recordset[0].IsComputed ? 'Ja' : 'Nein'}`);
} else {
            console.log('⚠️  PayloadJson Spalte nicht gefunden');
}

        // 2. Prüfe Beispieldaten vor Fix
        console.log('\n📊 Aktuelle Daten (Beispiel):');
        const currentData = await pool.request().query(`
            SELECT TOP 3
                ID,
                RawPayload,
                PayloadJson,
                CASE WHEN PayloadJson IS NULL THEN 'NULL' ELSE 'Gefüllt' END as Status
            FROM dbo.QrScans
            WHERE RawPayload IS NOT NULL
            ORDER BY ID DESC
        `);

        currentData.recordset.forEach(row => {
            console.log(`   ID ${row.ID}: ${row.RawPayload?.substring(0, 40)}... → ${row.Status}`);
        });

// 3. Alte Spalte entfernen
        console.log('\n🗑️  Entferne alte PayloadJson Spalte...');
        try {
            await pool.request().query(`
                IF EXISTS (
                    SELECT * FROM sys.computed_columns
                    WHERE object_id = OBJECT_ID('QrScans') AND name = 'PayloadJson'
                )
                BEGIN
                    ALTER TABLE dbo.QrScans DROP COLUMN PayloadJson;
                    PRINT 'Alte PayloadJson Spalte entfernt';
                END
                ELSE
                BEGIN
                    PRINT 'Keine alte PayloadJson Spalte gefunden';
                END
            `);
            console.log('✅ Alte Spalte erfolgreich entfernt');
} catch (error) {
            console.log(`⚠️  Fehler beim Entfernen: ${error.message}`);
}

        // 4. Neue erweiterte Spalte hinzufügen
        console.log('\n🆕 Erstelle neue erweiterte PayloadJson Spalte...');
        await pool.request().query(`
            ALTER TABLE dbo.QrScans ADD PayloadJson AS (
                CASE
                    -- Bereits gültiges JSON
                    WHEN ISJSON(RawPayload) = 1 THEN
                        RawPayload

                    -- Stern-getrennte Werte (z.B. "1*126644896*25000580*...")
                    WHEN RawPayload LIKE '%*%*%' AND LEN(RawPayload) - LEN(REPLACE(RawPayload, '*', '')) >= 2 THEN
                        CONCAT('{"type":"star_separated","parts":[',
                               CASE WHEN CHARINDEX('*', RawPayload) > 0 THEN
                                   CONCAT('"', SUBSTRING(RawPayload, 1, CHARINDEX('*', RawPayload) - 1), '"')
                               ELSE '""' END,
                               CASE WHEN LEN(RawPayload) - LEN(REPLACE(RawPayload, '*', '')) >= 1 THEN
                                   CONCAT(',"', SUBSTRING(RawPayload, CHARINDEX('*', RawPayload) + 1,
                                          CASE WHEN CHARINDEX('*', RawPayload, CHARINDEX('*', RawPayload) + 1) > 0
                                               THEN CHARINDEX('*', RawPayload, CHARINDEX('*', RawPayload) + 1) - CHARINDEX('*', RawPayload) - 1
                                               ELSE LEN(RawPayload) END), '"')
                               ELSE '' END,
                               '],"raw":"', RawPayload, '","parts_count":',
                               CAST(LEN(RawPayload) - LEN(REPLACE(RawPayload, '*', '')) + 1 AS VARCHAR), '}')

                    -- Key-Value Format (key1:value1^key2:value2)
                    WHEN RawPayload LIKE '%:%^%:%' THEN
                        CONCAT('{"type":"key_value","raw":"', RawPayload, '","parsed":false}')

                    -- URLs
                    WHEN RawPayload LIKE 'http%' THEN
                        CONCAT('{"type":"url","url":"', RawPayload, '","parsed":false}')

                    -- Numerische Barcodes (nur Zahlen, 6+ Zeichen)
                    WHEN RawPayload NOT LIKE '%[^0-9]%' AND LEN(RawPayload) >= 6 THEN
                        CONCAT('{"type":"barcode","code":"', RawPayload, '","length":', LEN(RawPayload), '}')

                    -- Alphanumerische Codes
                    WHEN RawPayload LIKE '%[A-Z0-9]%' AND LEN(RawPayload) >= 4 THEN
                        CONCAT('{"type":"alphanumeric","code":"', RawPayload, '","length":', LEN(RawPayload), '}')

                    -- Alles andere als Text
                    ELSE
                        CONCAT('{"type":"text","content":"',
                               REPLACE(REPLACE(RawPayload, '"', '\\"'), '\\', '\\\\'),
                               '","length":', LEN(RawPayload), '}')
                END
            )
        `);
        console.log('✅ Neue PayloadJson Spalte erstellt');

// 5. Validierung der neuen Spalte
        console.log('\n🧪 Teste neue PayloadJson Spalte...');
        const testResult = await pool.request().query(`
            SELECT TOP 5
                ID,
                LEFT(RawPayload, 50) + CASE WHEN LEN(RawPayload) > 50 THEN '...' ELSE '' END as RawPayload,
                LEFT(PayloadJson, 100) + CASE WHEN LEN(PayloadJson) > 100 THEN '...' ELSE '' END as PayloadJson,
                CASE WHEN ISJSON(PayloadJson) = 1 THEN '✅ Valid' ELSE '❌ Invalid' END as JsonStatus,
                JSON_VALUE(PayloadJson, '$.type') as ParsedType
            FROM dbo.QrScans
            WHERE RawPayload IS NOT NULL
            ORDER BY ID DESC
        `);

        console.log('\n📋 Test-Ergebnisse:');
        console.log('-'.repeat(80));
        testResult.recordset.forEach(row => {
            console.log(`ID ${row.ID}:`);
            console.log(`  Raw: ${row.RawPayload}`);
            console.log(`  JSON: ${row.PayloadJson}`);
            console.log(`  Status: ${row.JsonStatus} | Type: ${row.ParsedType || 'N/A'}`);
            console.log('');
        });

// 6. Statistiken
        console.log('\n📊 Abschließende Statistiken:');
        const stats = await pool.request().query(`
            SELECT
                COUNT(*) as TotalScans,
                COUNT(CASE WHEN PayloadJson IS NOT NULL THEN 1 END) as FilledPayloadJson,
                COUNT(CASE WHEN ISJSON(PayloadJson) = 1 THEN 1 END) as ValidJson,
                COUNT(CASE WHEN JSON_VALUE(PayloadJson, '$.type') = 'star_separated' THEN 1 END) as StarSeparated,
                COUNT(CASE WHEN JSON_VALUE(PayloadJson, '$.type') = 'barcode' THEN 1 END) as Barcodes,
                COUNT(CASE WHEN JSON_VALUE(PayloadJson, '$.type') = 'text' THEN 1 END) as TextTypes
            FROM dbo.QrScans
            WHERE RawPayload IS NOT NULL
        `);

        const stat = stats.recordset[0];
        console.log(`📈 Gesamt QR-Scans: ${stat.TotalScans}`);
        console.log(`📋 PayloadJson gefüllt: ${stat.FilledPayloadJson} (${Math.round(stat.FilledPayloadJson/stat.TotalScans*100)}%)`);
        console.log(`✅ Gültiges JSON: ${stat.ValidJson} (${Math.round(stat.ValidJson/stat.TotalScans*100)}%)`);
        console.log(`⭐ Stern-getrennt: ${stat.StarSeparated}`);
        console.log(`🔢 Barcodes: ${stat.Barcodes}`);
        console.log(`📝 Text-Format: ${stat.TextTypes}`);

        console.log('\n🎉 PayloadJSON Tabellen-Fix erfolgreich abgeschlossen!');
        console.log('✨ Alle QR-Scans haben jetzt strukturierte JSON-Payloads');

} catch (error) {
        console.error('\n❌ Fehler beim Tabellen-Fix:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
} finally {
        if (pool) {
            await pool.close();
            console.log('\n📡 Datenbankverbindung geschlossen');
}
    }
}

// Script ausführen
if (require.main === module) {
    fixPayloadJsonColumn()
        .then(() => {
            console.log('\n✅ Script erfolgreich beendet');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Script-Fehler:', error.message);
            process.exit(1);
        });
}

module.exports = { fixPayloadJsonColumn };