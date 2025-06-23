#!/usr/bin/env node
/**
 * Erstellt Testbenutzer für RFID-Tags
 * Legt verschiedene Benutzer für das Testing an
 */

const sql = require('mssql');
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
        requestTimeout: 30000,
        connectionTimeout: 15000,
    }
};

// Testbenutzer-Daten
const testUsers = [
    {
        tagHex: '53004114',  // Ihr bereits gescannter Tag
        tagDecimal: 1392525588,
        vorname: 'Test',
        nachname: 'Benutzer',
        benutzer: 'tbenutzer',
        benutzerName: 'Test Benutzer',
        email: 'test.benutzer@shirtful.com',
        department: 'Wareneingang',
        notes: 'Haupt-Test-Tag für Entwicklung'
    },
    {
        tagHex: '12345678',
        tagDecimal: 305419896,
        vorname: 'Max',
        nachname: 'Mustermann',
        benutzer: 'mmustermann',
        benutzerName: 'Max Mustermann',
        email: 'max.mustermann@shirtful.com',
        department: 'Wareneingang',
        notes: 'Beispiel-Tag Wareneingang'
    },
    {
        tagHex: '87654321',
        tagDecimal: 2271560481,
        vorname: 'Anna',
        nachname: 'Schmidt',
        benutzer: 'aschmidt',
        benutzerName: 'Anna Schmidt',
        email: 'anna.schmidt@shirtful.com',
        department: 'Qualitätskontrolle',
        notes: 'Beispiel-Tag QK'
    },
    {
        tagHex: 'ABCDEF01',
        tagDecimal: 2882400001,
        vorname: 'Peter',
        nachname: 'Mueller',
        benutzer: 'pmueller',
        benutzerName: 'Peter Mueller',
        email: 'peter.mueller@shirtful.com',
        department: 'Versand',
        notes: 'Beispiel-Tag Versand'
    },
    {
        tagHex: 'DEADBEEF',
        tagDecimal: 3735928559,
        vorname: 'Admin',
        nachname: 'User',
        benutzer: 'admin',
        benutzerName: 'Admin User',
        email: 'admin@shirtful.com',
        department: 'Administration',
        notes: 'Administrator-Tag'
    }
];

async function createTestUsers() {
    console.log('🔄 Stelle Verbindung zur Datenbank her...');

    let pool = null;
    let imported = 0;
    let skipped = 0;
    let errors = 0;

    try {
        pool = await sql.connect(config);

        console.log(`📋 Erstelle ${testUsers.length} Testbenutzer...`);
        console.log('-'.repeat(50));

        for (const user of testUsers) {
            try {
                // Prüfen ob Benutzer bereits existiert
                const existsResult = await pool.request()
                    .input('epc', sql.Decimal(38, 0), user.tagDecimal)
                    .query('SELECT ID, BenutzerName FROM dbo.ScannBenutzer WHERE EPC = @epc');

                if (existsResult.recordset.length > 0) {
                    console.log(`⏭️  Tag ${user.tagHex} bereits vorhanden (${existsResult.recordset[0].BenutzerName})`);
                    skipped++;
                    continue;
                }

                // Aktueller Zeitstempel
                const now = new Date();
                const datumInt = parseInt(now.toISOString().replace(/[-:T.Z]/g, '').substring(0, 14));

                // Benutzer einfügen
                await pool.request()
                    .input('vorname', sql.VarChar(255), user.vorname)
                    .input('nachname', sql.VarChar(255), user.nachname)
                    .input('benutzer', sql.VarChar(255), user.benutzer)
                    .input('benutzerName', sql.VarChar(255), user.benutzerName)
                    .input('benutzerPasswort', sql.VarChar(255), 'rfid')
                    .input('email', sql.VarChar(255), user.email)
                    .input('epc', sql.Decimal(38, 0), user.tagDecimal)
                    .input('xStatus', sql.Int, 0)
                    .input('xDatum', sql.DateTime, now)
                    .input('xDatumINT', sql.Decimal(18, 0), datumInt)
                    .input('xBenutzer', sql.VarChar(255), 'TestSetup')
                    .query(`
                        INSERT INTO dbo.ScannBenutzer
                        (Vorname, Nachname, Benutzer, BenutzerName, BenutzerPasswort,
                         Email, EPC, xStatus, xDatum, xDatumINT, xBenutzer)
                        VALUES (@vorname, @nachname, @benutzer, @benutzerName, @benutzerPasswort,
                                @email, @epc, @xStatus, @xDatum, @xDatumINT, @xBenutzer)
                    `);

                console.log(`✅ Tag ${user.tagHex} erstellt: ${user.benutzerName} (${user.department})`);
                imported++;

            } catch (error) {
                console.log(`❌ Fehler bei Tag ${user.tagHex}: ${error.message}`);
                errors++;
            }
        }

        console.log('');
        console.log('📊 Import abgeschlossen:');
        console.log(`   ✅ Erstellt: ${imported}`);
        console.log(`   ⏭️  Übersprungen: ${skipped}`);
        console.log(`   ❌ Fehler: ${errors}`);

        if (imported > 0) {
            console.log('');
            console.log('📋 Erstellte Benutzer:');
            console.log('-'.repeat(50));

            // Alle Testbenutzer anzeigen
            const usersResult = await pool.request().query(`
                SELECT ID, Vorname, Nachname, BenutzerName, Email, EPC, xStatus
                FROM dbo.ScannBenutzer
                WHERE EPC IN (${testUsers.map(u => u.tagDecimal).join(', ')})
                ORDER BY ID
            `);

            usersResult.recordset.forEach(user => {
                const hexEPC = user.EPC.toString(16).toUpperCase();
                console.log(`   ID ${user.ID}: ${user.BenutzerName} (Tag: ${hexEPC})`);
            });
        }

        console.log('');
        console.log('🎯 Test-Anweisungen:');
        console.log('-'.repeat(30));
        console.log('1. Starten Sie die Anwendung: pnpm start');
        console.log(`2. Scannen Sie Tag ${testUsers[0].tagHex} für An-/Abmeldung`);
        console.log('3. Öffnen Sie die Electron-App für die Benutzeroberfläche');
        console.log('4. Testen Sie QR-Code Scanning über die Webcam');

        return imported > 0;

    } catch (error) {
        console.error('❌ Fehler beim Erstellen der Testbenutzer:', error.message);
        return false;

    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.warn('Warnung beim Schließen der Verbindung:', closeError.message);
            }
        }
    }
}

async function showExistingUsers() {
    console.log('🔍 Zeige vorhandene Benutzer...');

    let pool = null;

    try {
        pool = await sql.connect(config);

        const result = await pool.request().query(`
            SELECT ID, Vorname, Nachname, BenutzerName, Email, EPC, xStatus, xDatum
            FROM dbo.ScannBenutzer
            WHERE xStatus = 0
            ORDER BY ID
        `);

        if (result.recordset.length === 0) {
            console.log('   📭 Keine aktiven Benutzer gefunden');
            return;
        }

        console.log(`   📋 ${result.recordset.length} aktive Benutzer gefunden:`);
        console.log('-'.repeat(70));

        result.recordset.forEach(user => {
            const hexEPC = user.EPC ? user.EPC.toString(16).toUpperCase().padStart(8, '0') : 'KEIN_TAG';
            const datum = user.xDatum ? user.xDatum.toISOString().split('T')[0] : 'unbekannt';
            console.log(`   ID ${user.ID.toString().padStart(3)}: ${user.BenutzerName.padEnd(20)} | Tag: ${hexEPC} | ${datum}`);
        });

    } catch (error) {
        console.error('❌ Fehler beim Abrufen der Benutzer:', error.message);

    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                console.warn('Warnung beim Schließen der Verbindung:', closeError.message);
            }
        }
    }
}

async function main() {
    console.log('🔷 RdScanner Testbenutzer Setup');
    console.log('='.repeat(50));
    console.log(`Server: ${config.server}:${config.port}`);
    console.log(`Datenbank: ${config.database}`);
    console.log(`Benutzer: ${config.user}`);
    console.log('='.repeat(50));

    try {
        // Vorhandene Benutzer anzeigen
        await showExistingUsers();
        console.log('');

        // Testbenutzer erstellen
        const success = await createTestUsers();

        if (success) {
            console.log('\n🎉 Testbenutzer-Setup abgeschlossen!');
        } else {
            console.log('\n⚠️  Keine neuen Benutzer erstellt');
        }

    } catch (error) {
        console.error('❌ Unerwarteter Fehler:', error.message);
        process.exit(1);
    }
}

// Skript ausführen
if (require.main === module) {
    main();
}

module.exports = { createTestUsers, testUsers };