#!/usr/bin/env node
/**
 * Debug-Test - zeigt geladene .env Werte und testet Verbindung
 */

const sql = require('mssql');
const path = require('path');

console.log('🔍 Debug: .env Datei laden...');
require('dotenv').config();

console.log('📋 Geladene Umgebungsvariablen:');
console.log(`   MSSQL_SERVER: ${process.env.MSSQL_SERVER || 'NICHT GESETZT'}`);
console.log(`   MSSQL_DATABASE: ${process.env.MSSQL_DATABASE || 'NICHT GESETZT'}`);
console.log(`   MSSQL_USER: ${process.env.MSSQL_USER || 'NICHT GESETZT'}`);
console.log(`   MSSQL_PASSWORD: ${process.env.MSSQL_PASSWORD ? '***' + process.env.MSSQL_PASSWORD.slice(-4) : 'NICHT GESETZT'}`);
console.log(`   .env Pfad: ${path.resolve('.env')}`);

// Konfiguration mit Fallbacks (wie in der Electron-App)
const config = {
    server: process.env.MSSQL_SERVER || '116.202.224.248',
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

console.log('\n🔧 Finale Konfiguration:');
console.log(`   Server: ${config.server}:${config.port}`);
console.log(`   Database: ${config.database}`);
console.log(`   User: ${config.user}`);
console.log(`   Password: ${config.password ? '***' + config.password.slice(-4) : 'LEER!'}`);

async function debugTest() {
    console.log('\n' + '='.repeat(50));
    console.log('🔷 Debug Datenbank-Test');
    console.log('='.repeat(50));

    let pool = null;

    try {
        console.log('📡 Verbindungsversuch...');
        pool = await sql.connect(config);

        console.log('✅ Verbindung erfolgreich!');

        // Server-Info abrufen
        const serverInfo = await pool.request().query(`
            SELECT 
                @@VERSION as ServerVersion,
                DB_NAME() as CurrentDatabase,
                SUSER_NAME() as CurrentUser,
                GETDATE() as ServerTime
        `);

        const info = serverInfo.recordset[0];
        console.log('\n📊 Server-Informationen:');
        console.log(`   Datenbank: ${info.CurrentDatabase}`);
        console.log(`   Benutzer: ${info.CurrentUser}`);
        console.log(`   Server-Zeit: ${info.ServerTime}`);

        // Test RFID-Tag verarbeiten
        console.log('\n🏷️ RFID-Tag 53004114 verarbeiten:');
        const tagDecimal = parseInt('53004114', 16);

        // Prüfen ob Benutzer existiert
        const userCheck = await pool.request().query(`
            SELECT ID, BenutzerName, EPC FROM dbo.ScannBenutzer 
            WHERE EPC = ${tagDecimal} AND xStatus = 0
        `);

        if (userCheck.recordset.length > 0) {
            const user = userCheck.recordset[0];
            console.log(`   ✅ Benutzer bereits vorhanden: ${user.BenutzerName}`);
        } else {
            console.log(`   ⚠️  Benutzer nicht vorhanden - erstelle Testbenutzer...`);

            try {
                const insertResult = await pool.request().query(`
                    INSERT INTO dbo.ScannBenutzer
                    (Vorname, Nachname, Benutzer, BenutzerName, BenutzerPasswort, Email, EPC, xStatus, xDatum, xDatumINT, xBenutzer)
                    OUTPUT INSERTED.ID, INSERTED.BenutzerName
                    VALUES
                    ('Test', 'Benutzer', 'tbenutzer', 'Test Benutzer', 'rfid', 'test.benutzer@shirtful.com', ${tagDecimal}, 0, GETDATE(), CONVERT(decimal(18,0), FORMAT(GETDATE(), 'yyyyMMddHHmmss')), 'DebugSetup')
                `);

                if (insertResult.recordset.length > 0) {
                    const newUser = insertResult.recordset[0];
                    console.log(`   ✅ Testbenutzer erstellt: ${newUser.BenutzerName} (ID: ${newUser.ID})`);
                }
            } catch (insertError) {
                if (insertError.message.includes('duplicate') || insertError.message.includes('UNIQUE')) {
                    console.log('   ⚠️  Benutzer bereits vorhanden (Constraint-Fehler)');
                } else {
                    console.log(`   ❌ Fehler beim Erstellen: ${insertError.message}`);
                }
            }
        }

        // Finale Benutzerliste
        console.log('\n👥 Alle RFID-Benutzer:');
        const allUsers = await pool.request().query(`
            SELECT ID, BenutzerName, EPC 
            FROM dbo.ScannBenutzer 
            WHERE xStatus = 0 AND EPC IS NOT NULL 
            ORDER BY ID DESC
        `);

        if (allUsers.recordset.length === 0) {
            console.log('   📭 Keine RFID-Benutzer gefunden');
        } else {
            allUsers.recordset.forEach(user => {
                const hexEPC = user.EPC.toString(16).toUpperCase();
                console.log(`   ID ${user.ID}: ${user.BenutzerName} (Tag: ${hexEPC})`);
            });
        }

        console.log('\n🎯 System bereit zum Testen!');
        console.log('=' * 30);
        console.log('1. Terminal: pnpm start');
        console.log('2. RFID-Tag 53004114 scannen');
        console.log('3. Erwarten: "✅ Benutzer angemeldet: Test Benutzer"');

        return true;

    } catch (error) {
        console.error('\n❌ Verbindungsfehler:', error.message);

        if (error.message.includes('Fehler bei der Anmeldung')) {
            console.error('\n💡 Anmelde-Problem:');
            console.error('   - Passwort in .env überprüfen');
            console.error('   - SQL Server Authentication aktiviert?');
            console.error('   - sa-Account freigeschalten?');
        }

        return false;

    } finally {
        if (pool) {
            try {
                await pool.close();
            } catch (closeError) {
                // Ignorieren
            }
        }
    }
}

debugTest().then(success => {
    console.log('\n' + '='.repeat(50));
    console.log(success ? '🎉 Debug-Test erfolgreich!' : '❌ Debug-Test fehlgeschlagen!');
    process.exit(success ? 0 : 1);
});