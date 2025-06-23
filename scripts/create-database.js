#!/usr/bin/env node
/**
 * Datenbank-Setup für RdScanner
 * Erstellt alle notwendigen Tabellen, Indizes und Constraints
 */

const sql = require('mssql');
require('dotenv').config();

// Datenbank-Konfiguration aus .env
const config = {
    server: process.env.MSSQL_SERVER || 'localhost',
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

const databaseName = process.env.MSSQL_DATABASE || 'RdScanner';

async function createDatabaseStructure() {
    console.log('🔄 Stelle Verbindung zum Server her...');

    let pool = null;

    try {
        // Verbindung zum Server (ohne spezifische Datenbank)
        pool = await sql.connect(config);

        console.log(`📦 Erstelle Datenbank '${databaseName}' falls nicht vorhanden...`);

        // Datenbank erstellen falls nicht vorhanden
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = '${databaseName}')
            CREATE DATABASE [${databaseName}]
        `);

        // Zur Datenbank wechseln
        await pool.request().query(`USE [${databaseName}]`);

        console.log('📋 Erstelle Tabellen...');

        // ScannBenutzer Tabelle
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ScannBenutzer')
            CREATE TABLE dbo.ScannBenutzer (
                ID decimal(18,0) IDENTITY(1,1) NOT NULL PRIMARY KEY,
                Vorname varchar(255) NULL,
                Nachname varchar(255) NULL,
                Benutzer varchar(255) NULL,
                BenutzerName varchar(255) NULL,
                BenutzerPasswort varchar(255) NULL,
                Email varchar(255) NULL,
                EPC decimal(38,0) NULL,
                xStatus int NULL DEFAULT 0,
                xDatum datetime NULL DEFAULT GETDATE(),
                xDatumINT decimal(18,0) NULL,
                xBenutzer varchar(255) NULL,
                xVersion timestamp NOT NULL
            )
        `);
        console.log('   ✅ ScannBenutzer erstellt');

        // Sessions Tabelle
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Sessions')
            CREATE TABLE dbo.Sessions (
                ID bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
                UserID decimal(18,0) NOT NULL,
                StartTS datetime2 NOT NULL DEFAULT SYSDATETIME(),
                EndTS datetime2 NULL,
                DurationSec AS DATEDIFF(SECOND, StartTS, ISNULL(EndTS, SYSDATETIME())),
                Active bit NOT NULL DEFAULT 1
            )
        `);
        console.log('   ✅ Sessions erstellt');

        // QrScans Tabelle
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'QrScans')
            CREATE TABLE dbo.QrScans (
                ID bigint IDENTITY(1,1) NOT NULL PRIMARY KEY,
                SessionID bigint NOT NULL,
                RawPayload nvarchar(MAX) NOT NULL,
                PayloadJson AS (
                    CASE 
                        WHEN ISJSON(RawPayload) = 1 THEN RawPayload
                        ELSE NULL
                    END
                ),
                CapturedTS datetime2 NOT NULL DEFAULT SYSDATETIME(),
                Valid bit NOT NULL DEFAULT 1
            )
        `);
        console.log('   ✅ QrScans erstellt');

        // ScannTyp Tabelle (optional)
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ScannTyp')
            CREATE TABLE dbo.ScannTyp (
                ID decimal(18,0) IDENTITY(1,1) NOT NULL PRIMARY KEY,
                Bezeichnung varchar(255) NULL,
                xStatus int NULL DEFAULT 0,
                xDatum datetime NULL DEFAULT GETDATE(),
                xDatumINT decimal(18,0) NULL,
                xBenutzer varchar(255) NULL,
                xVersion timestamp NOT NULL
            )
        `);
        console.log('   ✅ ScannTyp erstellt');

        // ScannKopf Tabelle (optional)
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ScannKopf')
            CREATE TABLE dbo.ScannKopf (
                ID decimal(18,0) IDENTITY(1,1) NOT NULL PRIMARY KEY,
                TagesDatum date NULL DEFAULT CAST(GETDATE() AS DATE),
                TagesDatumINT int NULL,
                Datum datetime NULL DEFAULT GETDATE(),
                DatumINT decimal(18,0) NULL,
                EPC decimal(38,0) NULL,
                Arbeitsplatz varchar(255) NULL,
                ScannTyp_ID decimal(18,0) NULL,
                xStatus int NULL DEFAULT 0,
                xDatum datetime NULL DEFAULT GETDATE(),
                xDatumINT decimal(18,0) NULL,
                xBenutzer varchar(255) NULL,
                xVersion timestamp NOT NULL
            )
        `);
        console.log('   ✅ ScannKopf erstellt');

        // ScannPosition Tabelle (optional)
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ScannPosition')
            CREATE TABLE dbo.ScannPosition (
                ID decimal(18,0) IDENTITY(1,1) NOT NULL PRIMARY KEY,
                ScannKopf_ID decimal(18,0) NOT NULL,
                TagesDatum date NULL DEFAULT CAST(GETDATE() AS DATE),
                TagesDatumINT int NULL,
                Datum datetime NULL DEFAULT GETDATE(),
                DatumINT decimal(18,0) NULL,
                Kunde varchar(255) NULL,
                Auftragsnummer varchar(255) NULL,
                Paketnummer varchar(255) NULL,
                Zusatzinformtion varchar(255) NULL,
                xStatus int NULL DEFAULT 0,
                xDatum datetime NULL DEFAULT GETDATE(),
                xDatumINT decimal(18,0) NULL,
                xBenutzer varchar(255) NULL,
                xVersion timestamp NOT NULL
            )
        `);
        console.log('   ✅ ScannPosition erstellt');

        console.log('\n🔍 Erstelle Indizes...');

        // Unique Index für aktive Sessions
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_Sessions_ActiveUser')
                CREATE UNIQUE INDEX UQ_Sessions_ActiveUser 
                ON dbo.Sessions(UserID) 
                WHERE Active = 1
            `);
            console.log('   ✅ Unique Index für aktive Sessions');
        } catch (error) {
            console.log('   ⚠️  Index UQ_Sessions_ActiveUser bereits vorhanden oder Fehler');
        }

        // Index für EPC
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ScannBenutzer_EPC')
                CREATE INDEX IX_ScannBenutzer_EPC 
                ON dbo.ScannBenutzer(EPC)
            `);
            console.log('   ✅ Index für EPC');
        } catch (error) {
            console.log('   ⚠️  Index IX_ScannBenutzer_EPC bereits vorhanden oder Fehler');
        }

        // Weitere Indizes
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_QrScans_SessionID')
                CREATE INDEX IX_QrScans_SessionID ON dbo.QrScans(SessionID)
            `);
            console.log('   ✅ Index für QrScans SessionID');
        } catch (error) {
            console.log('   ⚠️  Index IX_QrScans_SessionID bereits vorhanden oder Fehler');
        }

        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_QrScans_CapturedTS')
                CREATE INDEX IX_QrScans_CapturedTS ON dbo.QrScans(CapturedTS)
            `);
            console.log('   ✅ Index für QrScans CapturedTS');
        } catch (error) {
            console.log('   ⚠️  Index IX_QrScans_CapturedTS bereits vorhanden oder Fehler');
        }

        console.log('\n🔗 Erstelle Foreign Keys...');

        // Foreign Key: Sessions -> ScannBenutzer
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Sessions_Users')
                ALTER TABLE dbo.Sessions
                ADD CONSTRAINT FK_Sessions_Users 
                FOREIGN KEY (UserID) REFERENCES dbo.ScannBenutzer(ID)
            `);
            console.log('   ✅ FK Sessions -> ScannBenutzer');
        } catch (error) {
            console.log('   ⚠️  FK_Sessions_Users bereits vorhanden oder Fehler');
        }

        // Foreign Key: QrScans -> Sessions
        try {
            await pool.request().query(`
                IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_QrScans_Sessions')
                ALTER TABLE dbo.QrScans
                ADD CONSTRAINT FK_QrScans_Sessions 
                FOREIGN KEY (SessionID) REFERENCES dbo.Sessions(ID)
            `);
            console.log('   ✅ FK QrScans -> Sessions');
        } catch (error) {
            console.log('   ⚠️  FK_QrScans_Sessions bereits vorhanden oder Fehler');
        }

        console.log('\n🌱 Erstelle Grund-Daten...');

        // ScannTyp Grund-Daten
        try {
            const scanTypesCount = await pool.request().query(`SELECT COUNT(*) as count FROM dbo.ScannTyp`);

            if (scanTypesCount.recordset[0].count === 0) {
                await pool.request().query(`
                    INSERT INTO dbo.ScannTyp (Bezeichnung, xBenutzer) VALUES
                    ('Wareneingang', 'System'),
                    ('Qualitätskontrolle', 'System'),
                    ('Versand', 'System')
                `);
                console.log('   ✅ ScannTyp Grund-Daten erstellt');
            } else {
                console.log('   ⚠️  ScannTyp Daten bereits vorhanden');
            }
        } catch (error) {
            console.log('   ⚠️  Fehler bei ScannTyp Grund-Daten:', error.message);
        }

        console.log('\n✅ Datenbankstruktur erfolgreich erstellt!');
        return true;

    } catch (error) {
        console.error('\n❌ Fehler beim Erstellen der Datenbankstruktur:', error.message);
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
    console.log('🔷 RdScanner Datenbank-Setup');
    console.log('='.repeat(50));
    console.log(`Server: ${config.server}:${config.port}`);
    console.log(`Datenbank: ${databaseName}`);
    console.log(`Benutzer: ${config.user}`);
    console.log('='.repeat(50));

    try {
        const success = await createDatabaseStructure();

        if (success) {
            console.log('\n🎉 Setup abgeschlossen!');
            console.log('\nNächste Schritte:');
            console.log('1. Testbenutzer anlegen: node create-test-users.js');
            console.log('2. Verbindung testen: node test-db-connection.js');
            console.log('3. Anwendung starten: pnpm start');
        } else {
            console.log('\n❌ Setup fehlgeschlagen!');
            process.exit(1);
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

module.exports = { createDatabaseStructure };