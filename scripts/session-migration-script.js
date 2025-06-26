#!/usr/bin/env node
/**
 * SessionType Migration Script
 * Fügt SessionType-Feld zur Sessions-Tabelle hinzu und implementiert "Wareneingang"
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
        requestTimeout: 60000,
        connectionTimeout: 15000,
    }
};

async function addSessionType() {
    console.log('🔄 SessionType Migration gestartet...');
    console.log('=' .repeat(50));

    let pool = null;

    try {
        // Verbindung herstellen
        console.log('📡 Stelle Datenbankverbindung her...');
        pool = await sql.connect(config);
        console.log('✅ Verbindung erfolgreich');

        // 1. SessionTypes Lookup-Tabelle erstellen
        console.log('\n📋 Erstelle SessionTypes Lookup-Tabelle...');
        await pool.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SessionTypes')
            BEGIN
                CREATE TABLE dbo.SessionTypes (
                    ID int IDENTITY(1,1) NOT NULL PRIMARY KEY,
                    TypeName nvarchar(50) NOT NULL UNIQUE,
                    Description nvarchar(255) NULL,
                    IsActive bit NOT NULL DEFAULT 1,
                    CreatedTS datetime2 NOT NULL DEFAULT SYSDATETIME()
                )
                
                -- Standard SessionTypes einfügen
                INSERT INTO dbo.SessionTypes (TypeName, Description) VALUES 
                ('Wareneingang', 'Wareneingang und Paketverarbeitung'),
                ('Qualitätskontrolle', 'Qualitätsprüfung und -kontrolle'),
                ('Kommissionierung', 'Warenzusammenstellung und Versand'),
                ('Inventur', 'Bestandserfassung und Inventur'),
                ('Wartung', 'Wartungsarbeiten und Instandhaltung')
                
                PRINT '✅ SessionTypes Tabelle erstellt und befüllt'
            END
            ELSE
            BEGIN
                PRINT '✅ SessionTypes Tabelle existiert bereits'
            END
        `);

        // 2. Prüfen ob SessionTypeID Spalte bereits existiert
        console.log('\n🔍 Prüfe bestehende Sessions-Tabelle...');
        const columnCheck = await pool.request().query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Sessions' 
            AND TABLE_SCHEMA = 'dbo' 
            AND COLUMN_NAME = 'SessionTypeID'
        `);

        if (columnCheck.recordset.length === 0) {
            // 3. SessionTypeID Spalte zur Sessions-Tabelle hinzufügen
            console.log('\n➕ Füge SessionTypeID Spalte zur Sessions-Tabelle hinzu...');
            await pool.request().query(`
                ALTER TABLE dbo.Sessions 
                ADD SessionTypeID int NULL
            `);

            // 4. Foreign Key Constraint hinzufügen
            console.log('🔗 Erstelle Foreign Key Constraint...');
            await pool.request().query(`
                ALTER TABLE dbo.Sessions 
                ADD CONSTRAINT FK_Sessions_SessionTypes 
                FOREIGN KEY (SessionTypeID) REFERENCES dbo.SessionTypes(ID)
            `);

            // 5. Default-Wert für bestehende Sessions setzen (Wareneingang)
            console.log('📝 Setze Default SessionType für bestehende Sessions...');
            await pool.request().query(`
                UPDATE dbo.Sessions 
                SET SessionTypeID = (SELECT ID FROM dbo.SessionTypes WHERE TypeName = 'Wareneingang')
                WHERE SessionTypeID IS NULL
            `);

            console.log('✅ SessionTypeID Spalte erfolgreich hinzugefügt');
        } else {
            console.log('✅ SessionTypeID Spalte existiert bereits');
        }

        // 6. ScannBenutzer Tabellen-Struktur prüfen
        console.log('\n🔍 Prüfe ScannBenutzer Tabellen-Struktur...');
        const columnInfo = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'ScannBenutzer' AND TABLE_SCHEMA = 'dbo'
            ORDER BY ORDINAL_POSITION
        `);

        console.log('📋 Gefundene Spalten in ScannBenutzer:');
        const columns = columnInfo.recordset;
        columns.forEach(col => {
            console.log(`   ${col.COLUMN_NAME} (${col.DATA_TYPE})`);
        });

        // Erweiterte View für Sessions mit SessionType-Info erstellen
        console.log('\n👁️ Erstelle SessionsWithType View...');

        // Erst prüfen und ggf. löschen
        await pool.request().query(`
            IF EXISTS (SELECT * FROM sys.views WHERE name = 'SessionsWithType')
                DROP VIEW dbo.SessionsWithType
        `);

        // Spalten dynamisch ermitteln für JOIN
        const hasUserColumns = columns.some(col => col.COLUMN_NAME.toLowerCase().includes('ben'));
        const userIdColumn = columns.find(col =>
            col.COLUMN_NAME.toLowerCase().includes('benid') ||
            col.COLUMN_NAME.toLowerCase() === 'id'
        );

        let viewQuery = `
            CREATE VIEW dbo.SessionsWithType AS
            SELECT 
                s.ID,
                s.UserID,
                s.StartTS,
                s.EndTS,
                s.DurationSec,
                s.Active,
                s.SessionTypeID,
                st.TypeName as SessionTypeName,
                st.Description as SessionTypeDescription`;

        // Nur User-Spalten hinzufügen wenn ScannBenutzer-Tabelle richtige Struktur hat
        if (hasUserColumns && userIdColumn) {
            console.log(`   Verwende UserID-Spalte: ${userIdColumn.COLUMN_NAME}`);

            // Verfügbare Benutzerspalten hinzufügen
            const nameColumns = columns.filter(col =>
                col.COLUMN_NAME.toLowerCase().includes('name') ||
                col.COLUMN_NAME.toLowerCase().includes('nr') ||
                col.COLUMN_NAME.toLowerCase().includes('bezeichnung')
            );

            nameColumns.forEach(col => {
                viewQuery += `,\n                sb.${col.COLUMN_NAME}`;
            });

            viewQuery += `
            FROM dbo.Sessions s
            LEFT JOIN dbo.SessionTypes st ON s.SessionTypeID = st.ID
            LEFT JOIN dbo.ScannBenutzer sb ON s.UserID = sb.${userIdColumn.COLUMN_NAME}`;
        } else {
            console.log('   ⚠️  ScannBenutzer JOIN wird übersprungen (unbekannte Struktur)');
            viewQuery += `
            FROM dbo.Sessions s
            LEFT JOIN dbo.SessionTypes st ON s.SessionTypeID = st.ID`;
        }

        // Dann View erstellen (muss separater Query sein)
        await pool.request().query(viewQuery);

        // 7. Statistiken anzeigen
        console.log('\n📊 Migration Statistiken:');

        const sessionTypeStats = await pool.request().query(`
            SELECT 
                st.TypeName,
                COUNT(s.ID) as SessionCount,
                COUNT(CASE WHEN s.Active = 1 THEN 1 END) as ActiveCount
            FROM dbo.SessionTypes st
            LEFT JOIN dbo.Sessions s ON st.ID = s.SessionTypeID
            GROUP BY st.ID, st.TypeName
            ORDER BY SessionCount DESC
        `);

        sessionTypeStats.recordset.forEach(stat => {
            console.log(`   ${stat.TypeName}: ${stat.SessionCount} Sessions (${stat.ActiveCount} aktiv)`);
        });

        // 8. Test-Funktionen definieren
        console.log('\n🧪 Test-Funktionen:');

        const wareneingangTypeId = await pool.request().query(`
            SELECT ID FROM dbo.SessionTypes WHERE TypeName = 'Wareneingang'
        `);

        if (wareneingangTypeId.recordset.length > 0) {
            const typeId = wareneingangTypeId.recordset[0].ID;
            console.log(`   Wareneingang SessionType ID: ${typeId}`);
            console.log(`   Verwendung in Code: await createSession(userId, ${typeId})`);
        }

        console.log('\n✅ SessionType Migration erfolgreich abgeschlossen!');
        console.log('\n📋 Nächste Schritte:');
        console.log('   1. db-client.js Datei aktualisieren (createSession Methode)');
        console.log('   2. Renderer Code anpassen (SessionType Parameter)');
        console.log('   3. UI erweitern für SessionType-Auswahl (optional)');

    } catch (error) {
        console.error('❌ Fehler bei SessionType Migration:', error.message);
        console.error('Details:', error);
        process.exit(1);
    } finally {
        if (pool) {
            await pool.close();
            console.log('🔌 Datenbankverbindung geschlossen');
        }
    }
}

// Script ausführen
if (require.main === module) {
    addSessionType()
        .then(() => {
            console.log('\n🎉 Migration abgeschlossen');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Migration fehlgeschlagen:', error);
            process.exit(1);
        });
}

module.exports = { addSessionType };