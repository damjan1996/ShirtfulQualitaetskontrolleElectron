#!/usr/bin/env node
/**
 * Erweiterte Datenbank-Verbindungstest
 * Testet verschiedene Authentifizierungsmethoden
 */

const sql = require('mssql');
const path = require('path');
const fs = require('fs');

// Console für Windows korrigieren
if (process.platform === 'win32') {
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args) => {
        const message = args.join(' ').replace(/[^\x00-\x7F]/g, '?');
        originalLog(message);
    };

    console.error = (...args) => {
        const message = args.join(' ').replace(/[^\x00-\x7F]/g, '?');
        originalError(message);
    };
}

console.log('=== ERWEITERTE DATENBANK-VERBINDUNG TEST ===');

// .env laden
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config();
    console.log('✓ .env Datei gefunden und geladen');
} else {
    console.log('⚠ .env Datei nicht gefunden');
}

console.log('\n1. UMGEBUNGSVARIABLEN:');
console.log(`   MSSQL_SERVER: ${process.env.MSSQL_SERVER || 'NICHT GESETZT'}`);
console.log(`   MSSQL_DATABASE: ${process.env.MSSQL_DATABASE || 'NICHT GESETZT'}`);
console.log(`   MSSQL_USER: ${process.env.MSSQL_USER || 'NICHT GESETZT'}`);
console.log(`   MSSQL_PASSWORD: ${process.env.MSSQL_PASSWORD ? '***' + process.env.MSSQL_PASSWORD.slice(-4) : 'NICHT GESETZT'}`);
console.log(`   MSSQL_PORT: ${process.env.MSSQL_PORT || 'NICHT GESETZT'}`);

async function testDatabaseConnection() {
    const server = process.env.MSSQL_SERVER || '116.202.224.248';
    const database = process.env.MSSQL_DATABASE || 'RdScanner';
    const user = process.env.MSSQL_USER || 'sa';
    const password = process.env.MSSQL_PASSWORD || '';
    const port = parseInt(process.env.MSSQL_PORT) || 1433;

    console.log('\n2. VERBINDUNGS-TESTS:');

    // Test 1: SQL Server Authentication (Standard)
    console.log('\nTest 1: SQL Server Authentication');
    const config1 = {
        server: server,
        database: database,
        user: user,
        password: password,
        port: port,
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true,
            requestTimeout: 30000,
            connectionTimeout: 15000,
        }
    };

    let pool1 = null;
    try {
        console.log(`   Verbinde zu: ${server}:${port}`);
        console.log(`   Datenbank: ${database}`);
        console.log(`   Benutzer: ${user}`);

        pool1 = await sql.connect(config1);
        const result = await pool1.request().query('SELECT @@VERSION as version, SUSER_NAME() as currentUser');

        console.log('   ✓ VERBINDUNG ERFOLGREICH!');
        console.log(`   Server-Version: ${result.recordset[0].version.split('\n')[0]}`);
        console.log(`   Angemeldeter Benutzer: ${result.recordset[0].currentUser}`);

        await pool1.close();
        return true;

    } catch (error) {
        console.log(`   ✗ FEHLGESCHLAGEN: ${error.message}`);

        if (pool1) {
            try { await pool1.close(); } catch (e) {}
        }
    }

    // Test 2: Mit Verschlüsselung
    console.log('\nTest 2: Mit TLS-Verschlüsselung');
    const config2 = {
        ...config1,
        options: {
            ...config1.options,
            encrypt: true,
            trustServerCertificate: false
        }
    };

    let pool2 = null;
    try {
        pool2 = await sql.connect(config2);
        const result = await pool2.request().query('SELECT 1 as test');

        console.log('   ✓ TLS-Verbindung erfolgreich!');
        await pool2.close();
        return true;

    } catch (error) {
        console.log(`   ✗ TLS-Verbindung fehlgeschlagen: ${error.message}`);

        if (pool2) {
            try { await pool2.close(); } catch (e) {}
        }
    }

    // Test 3: Windows Authentication (falls verfügbar)
    console.log('\nTest 3: Windows Authentication');
    const config3 = {
        server: server,
        database: database,
        port: port,
        options: {
            encrypt: false,
            trustServerCertificate: true,
            enableArithAbort: true,
            useUTC: false,
            trustedConnection: true
        }
    };

    let pool3 = null;
    try {
        pool3 = await sql.connect(config3);
        const result = await pool3.request().query('SELECT SUSER_NAME() as currentUser');

        console.log('   ✓ Windows Authentication erfolgreich!');
        console.log(`   Windows-Benutzer: ${result.recordset[0].currentUser}`);
        await pool3.close();
        return true;

    } catch (error) {
        console.log(`   ✗ Windows Authentication fehlgeschlagen: ${error.message}`);

        if (pool3) {
            try { await pool3.close(); } catch (e) {}
        }
    }

    // Test 4: Connection String direkt
    console.log('\nTest 4: Direkte Connection String');
    const connectionString = `Server=${server},${port};Database=${database};User Id=${user};Password=${password};Encrypt=false;TrustServerCertificate=true;`;

    let pool4 = null;
    try {
        pool4 = await sql.connect(connectionString);
        const result = await pool4.request().query('SELECT 1 as test');

        console.log('   ✓ Connection String erfolgreich!');
        await pool4.close();
        return true;

    } catch (error) {
        console.log(`   ✗ Connection String fehlgeschlagen: ${error.message}`);

        if (pool4) {
            try { await pool4.close(); } catch (e) {}
        }
    }

    return false;
}

async function testServerReachability() {
    console.log('\n3. SERVER-ERREICHBARKEIT:');

    const server = process.env.MSSQL_SERVER || '116.202.224.248';
    const port = parseInt(process.env.MSSQL_PORT) || 1433;

    return new Promise((resolve) => {
        const net = require('net');
        const socket = new net.Socket();

        const timeout = setTimeout(() => {
            socket.destroy();
            console.log(`   ✗ Server ${server}:${port} nicht erreichbar (Timeout)`);
            resolve(false);
        }, 5000);

        socket.connect(port, server, () => {
            clearTimeout(timeout);
            socket.destroy();
            console.log(`   ✓ Server ${server}:${port} ist erreichbar`);
            resolve(true);
        });

        socket.on('error', (error) => {
            clearTimeout(timeout);
            console.log(`   ✗ Verbindung zu ${server}:${port} fehlgeschlagen: ${error.message}`);
            resolve(false);
        });
    });
}

async function checkSQLServerServices() {
    console.log('\n4. TROUBLESHOOTING-TIPPS:');

    console.log('\nÜberprüfen Sie auf dem SQL Server:');
    console.log('   1. SQL Server Authentication aktiviert?');
    console.log('      - SQL Server Management Studio → Eigenschaften → Sicherheit');
    console.log('      - "SQL Server- und Windows-Authentifizierungsmodus" wählen');
    console.log('');
    console.log('   2. sa-Account aktiviert?');
    console.log('      - Sicherheit → Anmeldungen → sa → Eigenschaften');
    console.log('      - "Anmeldung ist aktiviert" markieren');
    console.log('');
    console.log('   3. TCP/IP-Protokoll aktiviert?');
    console.log('      - SQL Server-Konfigurationsmanager');
    console.log('      - SQL Server-Netzwerkkonfiguration → TCP/IP aktivieren');
    console.log('');
    console.log('   4. Firewall-Regeln:');
    console.log('      - Port 1433 eingehend erlauben');
    console.log('      - SQL Server Browser Service starten');
    console.log('');
    console.log('   5. Remote-Verbindungen erlauben:');
    console.log('      - Servereigenschaften → Verbindungen');
    console.log('      - "Remoteverbindungen mit diesem Server zulassen"');
}

async function suggestFixes() {
    console.log('\n5. LÖSUNGSVORSCHLÄGE:');

    const password = process.env.MSSQL_PASSWORD;

    if (!password) {
        console.log('   ✗ MSSQL_PASSWORD ist leer!');
        console.log('     Lösung: .env Datei erstellen mit korrektem Passwort');
        return;
    }

    console.log('\nVersuchen Sie folgende .env Konfigurationen:');

    console.log('\nOption 1 - Standard (aktuell):');
    console.log('MSSQL_SERVER=116.202.224.248');
    console.log('MSSQL_DATABASE=RdScanner');
    console.log('MSSQL_USER=sa');
    console.log('MSSQL_PASSWORD=IhrPasswort');
    console.log('MSSQL_PORT=1433');
    console.log('MSSQL_ENCRYPT=false');
    console.log('MSSQL_TRUST_CERT=true');

    console.log('\nOption 2 - Mit Verschlüsselung:');
    console.log('MSSQL_ENCRYPT=true');
    console.log('MSSQL_TRUST_CERT=true');

    console.log('\nOption 3 - Erweiterte Einstellungen:');
    console.log('MSSQL_CONNECTION_TIMEOUT=30000');
    console.log('MSSQL_REQUEST_TIMEOUT=60000');
    console.log('MSSQL_POOL_MAX=5');

    console.log('\nOption 4 - Debug-Modus:');
    console.log('NODE_TLS_REJECT_UNAUTHORIZED=0');
    console.log('DEBUG=mssql*');
}

async function main() {
    try {
        // Server-Erreichbarkeit testen
        const serverReachable = await testServerReachability();

        if (!serverReachable) {
            console.log('\n⚠ Server ist nicht erreichbar - Netzwerk/Firewall prüfen');
        }

        // Datenbankverbindung testen
        const dbConnected = await testDatabaseConnection();

        if (!dbConnected) {
            await checkSQLServerServices();
            await suggestFixes();

            console.log('\n❌ ALLE VERBINDUNGSVERSUCHE FEHLGESCHLAGEN');
            console.log('\nNächste Schritte:');
            console.log('1. Passwort in .env überprüfen');
            console.log('2. SQL Server Authentication aktivieren');
            console.log('3. sa-Account freischalten');
            console.log('4. TCP/IP-Protokoll aktivieren');
            console.log('5. Firewall-Regeln prüfen');

            process.exit(1);
        } else {
            console.log('\n✓ DATENBANK-VERBINDUNG ERFOLGREICH!');
            console.log('Sie können nun die Hauptanwendung starten: pnpm start');
        }

    } catch (error) {
        console.error('\n❌ Unerwarteter Fehler:', error.message);
        process.exit(1);
    }
}

// Script ausführen
if (require.main === module) {
    main();
}

module.exports = { testDatabaseConnection };