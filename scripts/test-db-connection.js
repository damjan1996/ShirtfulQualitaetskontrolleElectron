#!/usr/bin/env node
/**
 * Test der Datenbankverbindung
 * Überprüft Verbindung und zeigt Tabelleninhalte an
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

async function testConnection() {
    console.log('🔍 Teste Datenbankverbindung...');
    console.log(`   Server: ${config.server}:${config.port}`);
    console.log(`   Datenbank: ${config.database}`);
    console.log(`   Benutzer: ${config.user}`);
    console.log('-'.repeat(50));

    let pool = null;

    try {
        // Verbindung herstellen
        console.log('📡 Stelle Verbindung her...');
        pool = await sql.connect(config);

        // Einfachen Test ausführen
        const testResult = await pool.request().query('SELECT 1 as test');
        if (testResult.recordset[0].test !== 1) {
            throw new Error('Verbindungstest fehlgeschlagen');
        }

        console.log('✅ Verbindung erfolgreich!');
        console.log('');

        // Tabellen testen
        const tables = ['ScannBenutzer', 'Sessions', 'QrScans', 'ScannTyp', 'ScannKopf', 'ScannPosition'];

        console.log('📊 Überprüfe Tabellen:');
        console.log('-'.repeat(30));

        for (const tableName of tables) {
            try {
                // Prüfe ob Tabelle existiert
                const existsResult = await pool.request().query(`
                    SELECT COUNT(*) as count 
                    FROM INFORMATION_SCHEMA.TABLES 
                    WHERE TABLE_NAME = '${tableName}' AND TABLE_SCHEMA = 'dbo'
                `);

                if (existsResult.recordset[0].count > 0) {
                    // Zeile Anzahl abrufen
                    const countResult = await pool.request().query(`SELECT COUNT(*) as count FROM dbo.[${tableName}]`);
                    const rowCount = countResult.recordset[0].count;
                    console.log(`   ✅ ${tableName}: ${rowCount} Einträge`);
                } else {
                    console.log(`   ❌ ${tableName}: Tabelle nicht gefunden`);
                }
            } catch (error) {
                console.log(`   ❌ ${tableName}: Fehler - ${error.message}`);
            }
        }

        console.log('');

        // Zusätzliche Informationen
        const serverInfo = await pool.request().query(`
            SELECT 
                @@VERSION as ServerVersion,
                DB_NAME() as DatabaseName,
                SUSER_NAME() as CurrentUser,
                GETDATE() as ServerTime
        `);

        const info = serverInfo.recordset[0];
        console.log('🔍 Server-Informationen:');
        console.log('-'.repeat(30));
        console.log(`   Datenbank: ${info.DatabaseName}`);
        console.log(`   Benutzer: ${info.CurrentUser}`);
        console.log(`   Server-Zeit: ${info.ServerTime}`);
        console.log(`   Version: ${info.ServerVersion.split('\n')[0]}`);

        console.log('');
        console.log('🎉 Alle Tests erfolgreich!');
        return true;

    } catch (error) {
        console.error('❌ Fehler bei Datenbankverbindung:', error.message);

        // Hilfreiche Fehlermeldungen
        if (error.code === 'ELOGIN') {
            console.error('💡 Login fehlgeschlagen - überprüfen Sie Benutzername/Passwort in .env');
        } else if (error.code === 'ETIMEOUT') {
            console.error('💡 Verbindungs-Timeout - überprüfen Sie Server-Adresse und Firewall');
        } else if (error.code === 'ENOTFOUND') {
            console.error('💡 Server nicht gefunden - überprüfen Sie MSSQL_SERVER in .env');
        }

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

async function main() {
    console.log('🔷 RdScanner Datenbankverbindung Test');
    console.log('='.repeat(50));

    try {
        const success = await testConnection();
        process.exit(success ? 0 : 1);
    } catch (error) {
        console.error('❌ Unerwarteter Fehler:', error.message);
        process.exit(1);
    }
}

// Skript ausführen
if (require.main === module) {
    main();
}

module.exports = { testConnection };