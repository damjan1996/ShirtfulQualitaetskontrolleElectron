#!/usr/bin/env node
/**
 * RFID-Tags Import Script
 * Liest authorized_tags.json und fügt alle Tags in die ScannBenutzer-Tabelle ein
 */

const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Datenbank-Konfiguration aus .env
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

/**
 * Konvertiert Hex-String zu Dezimalzahl
 * @param {string} hexString - Hex-String (z.B. "53004ECD68")
 * @returns {string} - Dezimalzahl als String für SQL decimal(38,0)
 */
function hexToDecimal(hexString) {
    // Entferne potentielle Präfixe und mache uppercase
    const cleanHex = hexString.replace(/^0x/i, '').toUpperCase();

    // Konvertiere zu BigInt für große Zahlen
    const decimal = BigInt('0x' + cleanHex);

    return decimal.toString();
}

/**
 * Prüft ob ein RFID-Tag bereits in der Datenbank existiert
 * @param {object} pool - SQL Pool
 * @param {string} epcDecimal - EPC als Dezimalstring
 * @returns {boolean} - true wenn Tag existiert
 */
async function tagExists(pool, epcDecimal) {
    try {
        const result = await pool.request()
            .input('epc', sql.Decimal(38, 0), epcDecimal)
            .query('SELECT COUNT(*) as count FROM dbo.ScannBenutzer WHERE EPC = @epc');

        return result.recordset[0].count > 0;
    } catch (error) {
        console.error(`❌ Fehler beim Prüfen von EPC ${epcDecimal}:`, error.message);
        return false;
    }
}

/**
 * Fügt einen RFID-Tag in die Datenbank ein
 * @param {object} pool - SQL Pool
 * @param {string} tagId - Hex Tag-ID
 * @param {object} tagData - Tag-Informationen aus JSON
 * @returns {boolean} - Erfolg
 */
async function insertTag(pool, tagId, tagData) {
    try {
        const epcDecimal = hexToDecimal(tagId);

        // Prüfen ob Tag bereits existiert
        if (await tagExists(pool, epcDecimal)) {
            console.log(`⚠️  Tag ${tagId} (${tagData.name}) existiert bereits - überspringe`);
            return true;
        }

        // Zerlege Namen falls möglich
        const nameParts = tagData.name.split('-');
        let vorname = 'Test';
        let nachname = nameParts.length > 1 ? nameParts.slice(1).join('-') : tagData.name;

        // Generiere Benutzername und Email
        const benutzerName = `${vorname} ${nachname}`;
        const benutzer = benutzerName.toLowerCase().replace(/\s+/g, '.');
        const email = `${benutzer}@company.local`;

        // Tag in Datenbank einfügen
        const result = await pool.request()
            .input('vorname', sql.VarChar(255), vorname)
            .input('nachname', sql.VarChar(255), nachname)
            .input('benutzer', sql.VarChar(255), benutzer)
            .input('benutzerName', sql.VarChar(255), benutzerName)
            .input('email', sql.VarChar(255), email)
            .input('epc', sql.Decimal(38, 0), epcDecimal)
            .input('status', sql.Int, 0)
            .query(`
                INSERT INTO dbo.ScannBenutzer 
                (Vorname, Nachname, Benutzer, BenutzerName, Email, EPC, xStatus, xDatum, xBenutzer)
                OUTPUT INSERTED.ID
                VALUES 
                (@vorname, @nachname, @benutzer, @benutzerName, @email, @epc, @status, GETDATE(), 'Import-Script')
            `);

        const insertedId = result.recordset[0].ID;
        console.log(`✅ Tag ${tagId} → ${benutzerName} (ID: ${insertedId}, EPC: ${epcDecimal})`);

        return true;

    } catch (error) {
        console.error(`❌ Fehler beim Einfügen von Tag ${tagId}:`, error.message);
        return false;
    }
}

/**
 * Hauptfunktion - Import aller Tags
 */
async function importTags() {
    console.log('🔷 RFID-Tags Import gestartet');
    console.log('='.repeat(60));
    console.log(`Server: ${config.server}:${config.port}`);
    console.log(`Datenbank: ${config.database}`);
    console.log(`Benutzer: ${config.user}`);
    console.log('='.repeat(60));

    let pool = null;
    let successCount = 0;
    let errorCount = 0;

    try {
        // JSON-Datei lesen
        console.log('\n📁 Lade authorized_tags.json...');
        const tagsFilePath = path.join(__dirname, 'authorized_tags.json');

        if (!fs.existsSync(tagsFilePath)) {
            throw new Error(`Datei nicht gefunden: ${tagsFilePath}`);
        }

        const tagsData = JSON.parse(fs.readFileSync(tagsFilePath, 'utf8'));
        const tagIds = Object.keys(tagsData);

        console.log(`📋 ${tagIds.length} Tags gefunden`);

        // Datenbank-Verbindung herstellen
        console.log('\n📡 Stelle Datenbankverbindung her...');
        pool = await sql.connect(config);
        console.log('✅ Verbindung erfolgreich');

        // Prüfe ob ScannBenutzer-Tabelle existiert
        console.log('\n🔍 Prüfe Datenbankstruktur...');
        const tableCheck = await pool.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'ScannBenutzer' AND TABLE_SCHEMA = 'dbo'
        `);

        if (tableCheck.recordset.length === 0) {
            throw new Error('ScannBenutzer-Tabelle nicht gefunden. Bitte erst Datenbank-Schema erstellen.');
        }

        console.log('✅ ScannBenutzer-Tabelle gefunden');

        // Tags importieren
        console.log('\n🚀 Beginne Import...');
        console.log('-'.repeat(60));

        for (const [tagId, tagData] of Object.entries(tagsData)) {
            const success = await insertTag(pool, tagId, tagData);
            if (success) {
                successCount++;
            } else {
                errorCount++;
            }
        }

        // Zusammenfassung
        console.log('\n' + '='.repeat(60));
        console.log('📊 Import-Zusammenfassung:');
        console.log(`✅ Erfolgreich importiert: ${successCount}`);
        console.log(`❌ Fehler: ${errorCount}`);
        console.log(`📋 Gesamt verarbeitet: ${successCount + errorCount}`);

        if (errorCount === 0) {
            console.log('\n🎉 Alle Tags erfolgreich importiert!');
        } else {
            console.log('\n⚠️  Import mit Fehlern abgeschlossen. Prüfen Sie die Logs oben.');
        }

        // Abschließende Datenbankprüfung
        console.log('\n🔍 Datenbankstand nach Import:');
        const totalUsers = await pool.request().query('SELECT COUNT(*) as count FROM dbo.ScannBenutzer');
        console.log(`👥 Gesamt Benutzer in Datenbank: ${totalUsers.recordset[0].count}`);

        const activeUsers = await pool.request().query('SELECT COUNT(*) as count FROM dbo.ScannBenutzer WHERE xStatus = 0');
        console.log(`✅ Aktive Benutzer: ${activeUsers.recordset[0].count}`);

    } catch (error) {
        console.error('\n❌ Kritischer Fehler:', error.message);
        console.error('\nMögliche Lösungen:');
        console.error('1. .env-Datei prüfen (Datenbankverbindung)');
        console.error('2. Datenbank-Schema mit create-database.js erstellen');
        console.error('3. Berechtigung für ScannBenutzer-Tabelle prüfen');
        console.error('4. Netzwerkverbindung und Firewall prüfen');

        process.exit(1);

    } finally {
        if (pool) {
            try {
                await pool.close();
                console.log('\n🔌 Datenbankverbindung geschlossen');
            } catch (closeError) {
                console.warn('⚠️  Fehler beim Schließen der Verbindung:', closeError.message);
            }
        }
    }
}

/**
 * Zeigt alle importierten Tags an
 */
async function showImportedTags() {
    console.log('\n📋 Importierte RFID-Tags:');
    console.log('-'.repeat(80));

    let pool = null;

    try {
        pool = await sql.connect(config);

        const result = await pool.request().query(`
            SELECT 
                ID,
                BenutzerName,
                Email,
                EPC,
                xDatum as ImportDatum
            FROM dbo.ScannBenutzer 
            WHERE xBenutzer = 'Import-Script'
            ORDER BY ID DESC
        `);

        if (result.recordset.length === 0) {
            console.log('🚫 Keine durch Import-Script erstellten Benutzer gefunden');
            return;
        }

        result.recordset.forEach((user, index) => {
            const hexId = BigInt(user.EPC).toString(16).toUpperCase();
            console.log(`${(index + 1).toString().padStart(2, '0')}. ${user.BenutzerName.padEnd(20)} | EPC: ${user.EPC.toString().padEnd(15)} | Hex: ${hexId} | ID: ${user.ID}`);
        });

        console.log(`\n✅ ${result.recordset.length} importierte Tags gefunden`);

    } catch (error) {
        console.error('❌ Fehler beim Anzeigen der Tags:', error.message);
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

// Hauptprogramm
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--show') || args.includes('-s')) {
        await showImportedTags();
    } else {
        await importTags();

        // Nach erfolgreichem Import optional Tags anzeigen
        if (args.includes('--list') || args.includes('-l')) {
            await showImportedTags();
        }
    }
}

// Ausführung starten
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Unbehandelter Fehler:', error);
        process.exit(1);
    });
}

module.exports = { importTags, showImportedTags, hexToDecimal };