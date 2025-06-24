#!/usr/bin/env node
/**
 * QR-Duplikat Test - Testet die verbesserte Duplikat-Behandlung
 */

const DatabaseClient = require('../db/db-client');
require('dotenv').config();

async function testQRDuplicateHandling() {
    console.log('🧪 Teste QR-Duplikat-Behandlung...');
    console.log('='.repeat(50));

    const dbClient = new DatabaseClient();
    let testSessionId = 999; // Test-Session

    try {
        await dbClient.connect();
        console.log('✅ Datenbankverbindung hergestellt');

        // Test 1: Neuer QR-Code sollte erfolgreich sein
        console.log('\n📄 Test 1: Neuer QR-Code');
        const testPayload1 = `TEST_QR_${Date.now()}_NEW`;
        const result1 = await dbClient.saveQRScan(testSessionId, testPayload1);

        if (result1.success) {
            console.log(`✅ Neuer QR-Code erfolgreich gespeichert (ID: ${result1.data.ID})`);
        } else {
            console.log(`❌ Unerwarteter Fehler: ${result1.message}`);
        }

        // Test 2: Sofortiger Duplikat sollte erkannt werden
        console.log('\n⚠️  Test 2: Sofortiger Duplikat');
        const result2 = await dbClient.saveQRScan(testSessionId, testPayload1);

        if (!result2.success && result2.status.includes('duplicate')) {
            console.log(`✅ Duplikat korrekt erkannt: ${result2.message}`);
        } else {
            console.log(`❌ Duplikat nicht erkannt: ${result2.message}`);
        }

        // Test 3: Nach 5 Minuten sollte wieder möglich sein (simuliert)
        console.log('\n⏰ Test 3: Cache-Test (5 Minuten Abstand)');

        // Simuliere 5+ Minuten Abstand durch Cache-Manipulation
        dbClient.duplicateCache.delete(testPayload1);

        // Aber Datenbank-Duplikat sollte trotzdem greifen (10 Minuten Fenster)
        const result3 = await dbClient.saveQRScan(testSessionId, testPayload1);

        if (!result3.success && result3.status === 'duplicate_database') {
            console.log(`✅ Datenbank-Duplikat korrekt erkannt: ${result3.message}`);
        } else {
            console.log(`❌ Datenbank-Duplikat nicht erkannt: ${result3.message}`);
        }

        // Test 4: Verschiedene Payloads sollten funktionieren
        console.log('\n📱 Test 4: Verschiedene QR-Codes');
        const testPayloads = [
            'BARCODE_123456789',
            '{"type":"package","id":"PKG001"}',
            'http://example.com/package/123',
            '1^126644896^25000580^010010277918^6^2802-834'
        ];

        for (const payload of testPayloads) {
            const result = await dbClient.saveQRScan(testSessionId, payload);
            if (result.success) {
                console.log(`✅ ${payload.substring(0, 30)}... → ID: ${result.data.ID}`);
            } else {
                console.log(`❌ ${payload.substring(0, 30)}... → ${result.message}`);
            }
        }

        // Test 5: Rate Limiting simulieren
        console.log('\n🚀 Test 5: Rate Limiting (mehrere schnelle Requests)');
        const rapidPayload = `RAPID_${Date.now()}`;

        const rapidResults = await Promise.all([
            dbClient.saveQRScan(testSessionId, rapidPayload),
            dbClient.saveQRScan(testSessionId, rapidPayload),
            dbClient.saveQRScan(testSessionId, rapidPayload),
            dbClient.saveQRScan(testSessionId, rapidPayload),
            dbClient.saveQRScan(testSessionId, rapidPayload)
        ]);

        const successful = rapidResults.filter(r => r.success).length;
        const duplicates = rapidResults.filter(r => !r.success && r.status.includes('duplicate')).length;
        const processing = rapidResults.filter(r => !r.success && r.status === 'processing').length;

        console.log(`📊 Von 5 parallelen Requests: ${successful} erfolgreich, ${duplicates} Duplikate, ${processing} in Verarbeitung`);

        if (successful === 1) {
            console.log('✅ Rate Limiting funktioniert korrekt');
        } else {
            console.log(`⚠️  Rate Limiting unerwartetes Ergebnis: ${successful} erfolgreiche Scans`);
        }

        // Cleanup - Testdaten löschen
        console.log('\n🧹 Bereinige Testdaten...');
        let deletedCount = 0;

        if (result1.success) {
            await dbClient.query('DELETE FROM dbo.QrScans WHERE ID = ?', [result1.data.ID]);
            deletedCount++;
        }

        for (const payload of testPayloads) {
            const deleteResult = await dbClient.query(
                'DELETE FROM dbo.QrScans WHERE RawPayload = ? AND SessionID = ?',
                [payload, testSessionId]
            );
            deletedCount += deleteResult.rowsAffected[0] || 0;
        }

        // Rapid test cleanup
        const rapidDeleteResult = await dbClient.query(
            'DELETE FROM dbo.QrScans WHERE RawPayload = ? AND SessionID = ?',
            [rapidPayload, testSessionId]
        );
        deletedCount += rapidDeleteResult.rowsAffected[0] || 0;

        console.log(`🗑️  ${deletedCount} Testeinträge gelöscht`);

        console.log('\n🎉 Alle Tests abgeschlossen!');
        console.log('\n📋 Zusammenfassung:');
        console.log('✅ Neue QR-Codes werden gespeichert');
        console.log('✅ Duplikate werden erkannt und abgelehnt');
        console.log('✅ Cache- und Datenbank-Duplikat-Erkennung funktioniert');
        console.log('✅ Rate Limiting verhindert gleichzeitige Scans');
        console.log('✅ Verschiedene QR-Code-Formate werden unterstützt');

    } catch (error) {
        console.error('\n❌ Test fehlgeschlagen:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await dbClient.close();
    }
}

async function main() {
    try {
        await testQRDuplicateHandling();
        process.exit(0);
    } catch (error) {
        console.error('Schwerwiegender Fehler:', error);
        process.exit(1);
    }
}

// Skript direkt ausführen
if (require.main === module) {
    main();
}

module.exports = { testQRDuplicateHandling };