// tests/unit/db-client.test.js
/**
 * Database Client Unit Tests - Korrigiert
 * Testet MockDatabaseClient vollständig
 */

const MockDatabaseClient = require('../mocks/db-client.mock');

describe('DatabaseClient', () => {
    let dbClient;

    beforeEach(async () => {
        dbClient = new MockDatabaseClient();
        await dbClient.connect();
        dbClient.clearMockData();
    });

    afterEach(async () => {
        await dbClient.close();
    });

    describe('Connection Management', () => {
        test('should connect successfully', async () => {
            const newClient = new MockDatabaseClient();

            await expect(newClient.connect()).resolves.toBeUndefined();
            expect(newClient.isConnected).toBe(true);

            await newClient.close();
        });

        test('should handle multiple connect calls', async () => {
            const newClient = new MockDatabaseClient();

            await newClient.connect();
            await newClient.connect(); // Should not throw

            expect(newClient.isConnected).toBe(true);
            await newClient.close();
        });

        test('should close connection', async () => {
            await dbClient.close();
            expect(dbClient.isConnected).toBe(false);
        });

        test('should handle queries when not connected', async () => {
            const newClient = new MockDatabaseClient();

            await expect(newClient.query('SELECT 1')).rejects.toThrow('Database not connected');
        });
    });

    describe('User Management', () => {
        test('should find user by RFID tag', async () => {
            const user = await dbClient.getUserByRFID('329C172'); // Hex for 53004114

            expect(user).toBeDefined();
            expect(user.BenID).toBe(1);
            expect(user.Vorname).toBe('Max');
            expect(user.Nachname).toBe('Mustermann');
            expect(user.EPC).toBe(53004114);
        });

        test('should return null for unknown RFID tag', async () => {
            const user = await dbClient.getUserByRFID('FFFFFF'); // Unknown tag

            expect(user).toBeNull();
        });

        test('should work with setMockUser', async () => {
            const customUser = {
                BenID: 99,
                Vorname: 'Test',
                Nachname: 'User',
                Active: 1
            };

            dbClient.setMockUser('12345', customUser);
            const user = await dbClient.getUserByRFID('12345');

            expect(user).toBeDefined();
            expect(user.BenID).toBe(99);
            expect(user.Vorname).toBe('Test');
            expect(user.Nachname).toBe('User');
        });

        test('should get mock user', () => {
            const user = dbClient.getMockUser('329C172'); // Hex for 53004114

            expect(user).toBeDefined();
            expect(user.BenID).toBe(1);
        });
    });

    describe('Session Management', () => {
        let userId;

        beforeEach(() => {
            userId = 1; // Use existing test user
        });

        test('should create new session', async () => {
            const session = await dbClient.createSession(userId);

            expect(session).toBeDefined();
            expect(session.ID).toBeDefined();
            expect(session.BenID).toBe(userId);
            expect(session.Active).toBe(1);
            expect(session.StartTS).toBeDefined();
            expect(session.EndTS).toBeNull();
        });

        test('should close existing session when creating new one', async () => {
            // Create first session
            const session1 = await dbClient.createSession(userId);
            expect(session1.Active).toBe(1);

            // Create second session - should close first one
            const session2 = await dbClient.createSession(userId);
            expect(session2.Active).toBe(1);

            // Check that first session was closed
            const closedSession = dbClient.mockData.sessions.find(s => s.ID === session1.ID);
            expect(closedSession.Active).toBe(0);
            expect(closedSession.EndTS).toBeDefined();
        });

        test('should get active session', async () => {
            const session = await dbClient.createSession(userId);
            const activeSession = await dbClient.getActiveSession(userId);

            expect(activeSession).toBeDefined();
            expect(activeSession.ID).toBe(session.ID);
            expect(activeSession.Active).toBe(1);
        });

        test('should return null for no active session', async () => {
            const activeSession = await dbClient.getActiveSession(999); // Non-existent user

            expect(activeSession).toBeNull();
        });

        test('should end session', async () => {
            const session = await dbClient.createSession(userId);

            const success = await dbClient.endSession(session.ID);
            expect(success).toBe(true);

            // Verify session was ended
            const endedSession = dbClient.mockData.sessions.find(s => s.ID === session.ID);
            expect(endedSession.Active).toBe(0);
            expect(endedSession.EndTS).toBeDefined();
        });

        test('should return false when ending non-existent session', async () => {
            const success = await dbClient.endSession(99999);
            expect(success).toBe(false);
        });
    });

    describe('QR Scan Management', () => {
        let sessionId;

        beforeEach(async () => {
            const session = await dbClient.createSession(1);
            sessionId = session.ID;
        });

        test('should save QR scan', async () => {
            const payload = 'TEST_QR_CODE_001';
            const result = await dbClient.saveQRScan(sessionId, payload);

            expect(result.success).toBe(true);
            expect(result.status).toBe('saved');
            expect(result.data).toBeDefined();
            expect(result.data.ID).toBeDefined();
            expect(result.data.SessionID).toBe(sessionId);
            expect(result.data.RawPayload).toBe(payload);
            expect(result.data.ScannTS).toBeDefined();
            expect(result.data.PayloadAsJSON).toBeNull(); // Kein gültiges JSON
        });

        test('should save QR scan with JSON payload', async () => {
            const payload = '{"id":"PKG001","type":"package","order":"12345"}';
            const result = await dbClient.saveQRScan(sessionId, payload);

            expect(result.success).toBe(true);
            expect(result.data.RawPayload).toBe(payload);
            expect(result.data.PayloadAsJSON).toEqual({ id: 'PKG001', type: 'package', order: '12345' });
        });

        test('should prevent duplicate QR scans', async () => {
            const payload = 'DUPLICATE_TEST';

            // Erster Scan sollte erfolgreich sein
            const firstScan = await dbClient.saveQRScan(sessionId, payload);
            expect(firstScan.success).toBe(true);

            // Zweiter Scan sollte fehlschlagen (Duplicate) - but returns result, not throws
            const secondScan = await dbClient.saveQRScan(sessionId, payload);
            expect(secondScan.success).toBe(false);
            expect(secondScan.status).toContain('duplicate');
            expect(secondScan.message).toContain('bereits');
        });

        test('should allow duplicate after cooldown', async () => {
            const payload = 'COOLDOWN_TEST';

            // Setze kurzen Cooldown für Test
            dbClient.duplicateCooldown = 100; // 100ms

            // Erster Scan
            const firstResult = await dbClient.saveQRScan(sessionId, payload);
            expect(firstResult.success).toBe(true);

            // Warte Cooldown ab
            await new Promise(resolve => setTimeout(resolve, 150));

            // Zweiter Scan sollte jetzt erfolgreich sein
            const secondScan = await dbClient.saveQRScan(sessionId, payload);
            expect(secondScan.success).toBe(true);
        });

        test('should fail to save scan for inactive session', async () => {
            await dbClient.endSession(sessionId);

            const result = await dbClient.saveQRScan(sessionId, 'TEST');

            // Should return error result, not throw
            if (result.success === false) {
                expect(result.message).toContain('session');
            } else {
                // If it throws, that's also acceptable
                await expect(dbClient.saveQRScan(sessionId, 'TEST2')).rejects.toThrow('No active session found');
            }
        });

        test('should get QR scans by session', async () => {
            // Speichere mehrere Scans
            await dbClient.saveQRScan(sessionId, 'SCAN_001');
            await dbClient.saveQRScan(sessionId, 'SCAN_002');
            await dbClient.saveQRScan(sessionId, 'SCAN_003');

            const scans = await dbClient.getQRScansBySession(sessionId, 10);

            expect(scans.length).toBe(3);
            expect(scans.every(s => s.SessionID === sessionId)).toBe(true);

            // Überprüfe Sortierung (neueste zuerst)
            expect(new Date(scans[0].CapturedTS) >= new Date(scans[1].CapturedTS)).toBe(true);
        });

        test('should limit QR scans by session', async () => {
            // Speichere mehr Scans als Limit
            for (let i = 1; i <= 5; i++) {
                await dbClient.saveQRScan(sessionId, `SCAN_${i.toString().padStart(3, '0')}`);
            }

            const scans = await dbClient.getQRScansBySession(sessionId, 3);

            expect(scans.length).toBe(3);
        });

        test('should handle different payload types', async () => {
            const payloads = [
                'SIMPLE_TEXT',
                '{"json": "object"}',
                'http://example.com/package/123',
                '1234567890',
                'BARCODE_123^456^789'
            ];

            for (const payload of payloads) {
                const result = await dbClient.saveQRScan(sessionId, payload);
                expect(result.success).toBe(true);
                expect(result.data.RawPayload).toBe(payload);
            }

            const scans = await dbClient.getQRScansBySession(sessionId);
            expect(scans.length).toBe(payloads.length);
        });
    });

    describe('Duplicate Detection', () => {
        let sessionId;

        beforeEach(async () => {
            const session = await dbClient.createSession(1);
            sessionId = session.ID;
        });

        test('should detect cache-based duplicates', async () => {
            const payload = 'CACHE_DUPLICATE_TEST';

            // First scan
            const first = await dbClient.saveQRScan(sessionId, payload);
            expect(first.success).toBe(true);

            // Immediate duplicate should be caught by cache
            const second = await dbClient.saveQRScan(sessionId, payload);
            expect(second.success).toBe(false);
            expect(second.status).toBe('duplicate_cache');
            expect(second.duplicateInfo.source).toBe('cache');
        });

        test('should detect database-based duplicates', async () => {
            const payload = 'DB_DUPLICATE_TEST';

            // Manually add to database (bypass cache)
            dbClient.mockData.qrScans.push({
                ID: 9999,
                SessionID: sessionId,
                RawPayload: payload,
                CapturedTS: new Date(),
                ScannTS: new Date(),
                Valid: 1
            });

            // Try to save same payload
            const result = await dbClient.saveQRScan(sessionId, payload);
            expect(result.success).toBe(false);
            expect(result.status).toBe('duplicate_database');
        });

        test('should clear cache on close', async () => {
            const payload = 'CACHE_CLEAR_TEST';

            await dbClient.saveQRScan(sessionId, payload);
            expect(dbClient.duplicateCache.has(payload)).toBe(true);

            await dbClient.close();
            expect(dbClient.duplicateCache.size).toBe(0);
        });
    });

    describe('Statistics and Monitoring', () => {
        test('should track connection statistics', () => {
            const stats = dbClient.getConnectionStats();

            expect(stats).toBeDefined();
            expect(stats.isConnected).toBe(true);
            expect(stats.connects).toBeGreaterThan(0);
            expect(stats.totalQueries).toBeGreaterThanOrEqual(0);
        });

        test('should track query count', async () => {
            const initialStats = dbClient.getConnectionStats();
            const initialQueries = initialStats.totalQueries;

            await dbClient.query('SELECT 1');
            await dbClient.query('SELECT 2');

            const finalStats = dbClient.getConnectionStats();
            expect(finalStats.totalQueries).toBe(initialQueries + 2);
        });

        test('should track cache size', async () => {
            const session = await dbClient.createSession(1);

            await dbClient.saveQRScan(session.ID, 'TEST1');
            await dbClient.saveQRScan(session.ID, 'TEST2');

            const stats = dbClient.getConnectionStats();
            expect(stats.cacheSize).toBeGreaterThan(0);
        });
    });

    describe('Utility Methods', () => {
        test('should normalize timestamps', () => {
            const now = new Date();
            const isoString = now.toISOString();

            expect(dbClient.normalizeTimestamp(now)).toBe(isoString);
            expect(dbClient.normalizeTimestamp(isoString)).toBe(isoString);
            expect(dbClient.normalizeTimestamp(null)).toBeNull();
        });

        test('should parse payload JSON', () => {
            const validJson = '{"test": "value"}';
            const invalidJson = 'not json';

            expect(dbClient.parsePayloadJson(validJson)).toEqual({ test: 'value' });
            expect(dbClient.parsePayloadJson(invalidJson)).toBeNull();
            expect(dbClient.parsePayloadJson(null)).toBeNull();
        });

        test('should clear mock data', () => {
            // Add some data
            dbClient.mockData.sessions.push({ ID: 1, BenID: 1 });
            dbClient.mockData.qrScans.push({ ID: 1, SessionID: 1 });
            dbClient.duplicateCache.set('test', Date.now());

            dbClient.clearMockData();

            expect(dbClient.mockData.sessions.length).toBe(0);
            expect(dbClient.mockData.qrScans.length).toBe(0);
            expect(dbClient.duplicateCache.size).toBe(0);
        });
    });

    describe('Complex Scenarios', () => {
        test('should handle multiple concurrent sessions', async () => {
            const user1Session = await dbClient.createSession(1);
            const user2Session = await dbClient.createSession(2);

            expect(user1Session.ID).not.toBe(user2Session.ID);
            expect(user1Session.BenID).toBe(1);
            expect(user2Session.BenID).toBe(2);

            // Both should be active
            expect(user1Session.Active).toBe(1);
            expect(user2Session.Active).toBe(1);

            // Save scans for both
            const scan1 = await dbClient.saveQRScan(user1Session.ID, 'USER1_SCAN');
            const scan2 = await dbClient.saveQRScan(user2Session.ID, 'USER2_SCAN');

            expect(scan1.success).toBe(true);
            expect(scan2.success).toBe(true);
        });

        test('should handle rapid duplicate attempts', async () => {
            const session = await dbClient.createSession(1);
            const payload = 'RAPID_DUPLICATE_TEST';

            // Try multiple rapid duplicates
            const promises = Array(5).fill().map(() =>
                dbClient.saveQRScan(session.ID, payload)
            );

            const results = await Promise.all(promises);

            // Only one should succeed
            const successCount = results.filter(r => r.success).length;
            expect(successCount).toBe(1);

            // Others should be duplicates
            const duplicateCount = results.filter(r => !r.success && r.status.includes('duplicate')).length;
            expect(duplicateCount).toBe(4);
        });

        test('should maintain data consistency', async () => {
            const session = await dbClient.createSession(1);

            // Save multiple different scans
            const scans = ['SCAN_A', 'SCAN_B', 'SCAN_C'];
            for (const scan of scans) {
                const result = await dbClient.saveQRScan(session.ID, scan);
                expect(result.success).toBe(true);
            }

            // Verify all scans are retrievable
            const savedScans = await dbClient.getQRScansBySession(session.ID);
            expect(savedScans.length).toBe(scans.length);

            const savedPayloads = savedScans.map(s => s.RawPayload);
            scans.forEach(scan => {
                expect(savedPayloads).toContain(scan);
            });
        });
    });
});