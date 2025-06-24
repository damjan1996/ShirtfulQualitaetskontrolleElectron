#!/usr/bin/env node
/**
 * QR-Duplikat-Test Script
 * Testet die verbesserte Duplikat-Vermeidung
 */

const DatabaseClient = require('./db/db-client');
require('dotenv').config();

class QRDuplicateTest {
    constructor() {
        this.dbClient = new DatabaseClient();
        this.testResults = [];
    }

    async runTests() {
        console.log('🧪 QR-Duplikat-Test wird gestartet...');
        console.log('='.repeat(50));

        try {
            await this.dbClient.connect();

            console.log('✅ Datenbankverbindung hergestellt');
            console.log();

            // Test 1: Neuer QR-Code
            await this.testNewQRCode();

            // Test 2: Sofortiger Duplikat
            await this.testImmediateDuplicate();

            // Test 3: Cache-Duplikat
            await this.testCacheDuplicate();

            // Test 4: Datenbankbasiertes Duplikat
            await this.testDatabaseDuplicate();

            // Test 5: Concurrent Requests
            await this.testConcurrentRequests();

            // Test 6: Cache-Bereinigung
            await this.testCacheCleanup();

            this.printResults();

        } catch (error) {
            console.error('❌ Test-Setup fehlgeschlagen:', error);
        } finally {
            await this.dbClient.close();
        }
    }

    async testNewQRCode() {
        console.log('🔍 Test 1: Neuer QR-Code');

        const testPayload = `TEST_QR_${Date.now()}_NEW`;
        const testSessionId = 999; // Test-Session

        try {
            const result = await this.dbClient.saveQRScan(testSessionId, testPayload);

            if (result && result.ID) {
                this.addResult('PASS', 'Neuer QR-Code', `Erfolgreich gespeichert (ID: ${result.ID})`);

                // Cleanup
                await this.dbClient.query('DELETE FROM dbo.QrScans WHERE ID = ?', [result.ID]);
            } else {
                this.addResult('FAIL', 'Neuer QR-Code', 'Speicherung fehlgeschlagen');
            }
        } catch (error) {
            this.addResult('FAIL', 'Neuer QR-Code', error.message);
        }
    }

    async testImmediateDuplicate() {
        console.log('🔍 Test 2: Sofortiger Duplikat');

        const testPayload = `TEST_QR_${Date.now()}_IMMEDIATE`;
        const testSessionId = 999;

        try {
            // Ersten Scan speichern
            const result1 = await this.dbClient.saveQRScan(testSessionId, testPayload);

            if (!result1) {
                this.addResult('FAIL', 'Sofortiger Duplikat', 'Erster Scan fehlgeschlagen');
                return;
            }

            // Sofort den gleichen Scan versuchen
            try {
                const result2 = await this.dbClient.saveQRScan(testSessionId, testPayload);
                this.addResult('FAIL', 'Sofortiger Duplikat', 'Duplikat wurde nicht erkannt');
            } catch (dupError) {
                if (dupError.message.includes('bereits gescannt') || dupError.message.includes('Duplikat')) {
                    this.addResult('PASS', 'Sofortiger Duplikat', 'Duplikat korrekt erkannt');
                } else {
                    this.addResult('FAIL', 'Sofortiger Duplikat', `Unerwarteter Fehler: ${dupError.message}`);
                }
            }

            // Cleanup
            await this.dbClient.query('DELETE FROM dbo.QrScans WHERE ID = ?', [result1.ID]);

        } catch (error) {
            this.addResult('FAIL', 'Sofortiger Duplikat', error.message);
        }
    }

    async testCacheDuplicate() {
        console.log('🔍 Test 3: Cache-Duplikat');

        const testPayload = `TEST_QR_${Date.now()}_CACHE`;
        const testSessionId = 999;

        try {
            // QR-Code in Cache setzen
            this.dbClient.duplicateCache.set(testPayload, Date.now());

            // Scan versuchen
            try {
                const result = await this.dbClient.saveQRScan(testSessionId, testPayload);
                this.addResult('FAIL', 'Cache-Duplikat', 'Cache-Duplikat wurde nicht erkannt');
            } catch (dupError) {
                if (dupError.message.includes('Cache-Duplikat')) {
                    this.addResult('PASS', 'Cache-Duplikat', 'Cache-Duplikat korrekt erkannt');
                } else {
                    this.addResult('FAIL', 'Cache-Duplikat', `Unerwarteter Fehler: ${dupError.message}`);
                }
            }

            // Cache bereinigen
            this.dbClient.duplicateCache.delete(testPayload);

        } catch (error) {
            this.addResult('FAIL', 'Cache-Duplikat', error.message);
        }
    }

    async testDatabaseDuplicate() {
        console.log('🔍 Test 4: Datenbank-Duplikat');

        const testPayload = `TEST_QR_${Date.now()}_DB`;
        const testSessionId = 999;

        try {
            // Ersten Scan direkt in DB einfügen
            const insertResult = await this.dbClient.query(`
                INSERT INTO dbo.QrScans (SessionID, RawPayload, Valid, CapturedTS)
                OUTPUT INSERTED.ID
                VALUES (?, ?, 1, SYSDATETIME())
            `, [testSessionId, testPayload]);

            const firstScanId = insertResult.recordset[0].ID;

            // Warten (für verschiedene Zeitstempel)
            await new Promise(resolve => setTimeout(resolve, 100));

            // Duplikat über API versuchen
            try {
                const result = await this.dbClient.saveQRScan(testSessionId, testPayload);
                this.addResult('FAIL', 'Datenbank-Duplikat', 'DB-Duplikat wurde nicht erkannt');
            } catch (dupError) {
                if (dupError.message.includes('bereits gescannt') || dupError.message.includes('Duplikat')) {
                    this.addResult('PASS', 'Datenbank-Duplikat', 'DB-Duplikat korrekt erkannt');
                } else {
                    this.addResult('FAIL', 'Datenbank-Duplikat', `Unerwarteter Fehler: ${dupError.message}`);
                }
            }

            // Cleanup
            await this.dbClient.query('DELETE FROM dbo.QrScans WHERE ID = ?', [firstScanId]);

        } catch (error) {
            this.addResult('FAIL', 'Datenbank-Duplikat', error.message);
        }
    }

    async testConcurrentRequests() {
        console.log('🔍 Test 5: Concurrent Requests');

        const testPayload = `TEST_QR_${Date.now()}_CONCURRENT`;
        const testSessionId = 999;

        try {
            // Mehrere gleichzeitige Requests
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(
                    this.dbClient.saveQRScan(testSessionId, testPayload)
                        .catch(error => ({ error: error.message }))
                );
            }

            const results = await Promise.all(promises);

            // Zähle erfolgreiche und fehlgeschlagene Requests
            const successful = results.filter(r => r && r.ID && !r.error);
            const failed = results.filter(r => r && r.error);

            if (successful.length === 1 && failed.length === 4) {
                this.addResult('PASS', 'Concurrent Requests',
                    `1 erfolgreich, 4 als Duplikat abgelehnt`);

                // Cleanup
                if (successful[0]) {
                    await this.dbClient.query('DELETE FROM dbo.QrScans WHERE ID = ?', [successful[0].ID]);
                }
            } else {
                this.addResult('FAIL', 'Concurrent Requests',
                    `${successful.length} erfolgreich, ${failed.length} fehlgeschlagen`);
            }

        } catch (error) {
            this.addResult('FAIL', 'Concurrent Requests', error.message);
        }
    }

    async testCacheCleanup() {
        console.log('🔍 Test 6: Cache-Bereinigung');

        try {
            // Alte Einträge in Cache setzen
            const oldPayload = 'OLD_TEST_QR';
            const newPayload = 'NEW_TEST_QR';

            const oldTime = Date.now() - (25 * 60 * 60 * 1000); // 25 Stunden alt
            const newTime = Date.now();

            this.dbClient.duplicateCache.set(oldPayload, oldTime);
            this.dbClient.duplicateCache.set(newPayload, newTime);

            const sizeBefore = this.dbClient.duplicateCache.size;

            // Cache-Bereinigung ausführen
            this.dbClient.cleanupDuplicateCache();

            const sizeAfter = this.dbClient.duplicateCache.size;

            // Prüfen ob alter Eintrag entfernt wurde
            const hasOld = this.dbClient.duplicateCache.has(oldPayload);
            const hasNew = this.dbClient.duplicateCache.has(newPayload);

            if (!hasOld && hasNew && sizeAfter < sizeBefore) {
                this.addResult('PASS', 'Cache-Bereinigung',
                    `Alte Einträge entfernt (${sizeBefore} → ${sizeAfter})`);
            } else {
                this.addResult('FAIL', 'Cache-Bereinigung',
                    `Bereinigung fehlerhaft (old: ${hasOld}, new: ${hasNew})`);
            }

            // Cleanup
            this.dbClient.duplicateCache.delete(newPayload);

        } catch (error) {
            this.addResult('FAIL', 'Cache-Bereinigung', error.message);
        }
    }

    addResult(status, testName, details) {
        this.testResults.push({ status, testName, details });

        const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
        console.log(`   ${icon} ${testName}: ${details}`);
    }

    printResults() {
        console.log();
        console.log('='.repeat(50));
        console.log('📊 TEST-ERGEBNISSE');
        console.log('='.repeat(50));

        const passed = this.testResults.filter(r => r.status === 'PASS').length;
        const failed = this.testResults.filter(r => r.status === 'FAIL').length;
        const warned = this.testResults.filter(r => r.status === 'WARN').length;

        console.log(`Gesamt: ${this.testResults.length} Tests`);
        console.log(`✅ Bestanden: ${passed}`);
        console.log(`❌ Fehlgeschlagen: ${failed}`);
        console.log(`⚠️ Warnungen: ${warned}`);

        const successRate = Math.round((passed / this.testResults.length) * 100);
        console.log(`📈 Erfolgsrate: ${successRate}%`);

        if (failed === 0) {
            console.log();
            console.log('🎉 ALLE TESTS BESTANDEN!');
            console.log('✅ QR-Duplikat-Vermeidung funktioniert korrekt');
        } else {
            console.log();
            console.log('❌ EINIGE TESTS FEHLGESCHLAGEN');
            console.log('🔧 Bitte überprüfen Sie die Implementierung');

            console.log();
            console.log('Fehlgeschlagene Tests:');
            this.testResults
                .filter(r => r.status === 'FAIL')
                .forEach(r => console.log(`   • ${r.testName}: ${r.details}`));
        }

        console.log('='.repeat(50));
    }
}

// Test starten wenn direkt ausgeführt
if (require.main === module) {
    const tester = new QRDuplicateTest();
    tester.runTests()
        .then(() => {
            console.log('🏁 Test abgeschlossen');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Test-Fehler:', error);
            process.exit(1);
        });
}

module.exports = QRDuplicateTest;