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
                Email: 'test@example.com',
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

        test('should get user by ID', async () => {
            const user = await dbClient.getUserByID(1);

            expect(user).toBeDefined();
            expect(user.BenID).toBe(1);
            expect(user.Vorname).toBe('Max');
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

            // Verify session is closed
            const closedSession = dbClient.mockData.sessions.find(s => s.ID === session.ID);
            expect(closedSession.Active).toBe(0);
            expect(closedSession.EndTS).toBeDefined();
        });

        test('should get sessions by user', async () => {
            // Create multiple sessions
            const session1 = await dbClient.createSession(userId);
            await dbClient.endSession(session1.ID);

            const session2 = await dbClient.createSession(userId);

            const sessions = await dbClient.getSessionsByUser(userId);

            expect(sessions.length).toBe(2);
            expect(sessions.every(s => s.BenID === userId)).toBe(true);
        });
    });

    describe('QR Scan Management', () => {
        let sessionId;

        beforeEach(async () => {
            const session = await dbClient.createSession(1);
            sessionId = session.ID;
        });

        test('should save QR scan', async () => {
            const payload = 'TEST_QR_CODE_123';
            const result = await dbClient.saveQRScan(sessionId, payload);

            expect(result.success).toBe(true);
            expect(result.scanId).toBeDefined();
            expect(result.payload).toBe(payload);
        });

        test('should prevent duplicate scans', async () => {
            const payload = 'DUPLICATE_TEST';

            // First scan should succeed
            const firstScan = await dbClient.saveQRScan(sessionId, payload);
            expect(firstScan.success).toBe(true);

            // Immediate duplicate should fail
            const duplicateScan = await dbClient.saveQRScan(sessionId, payload);
            expect(duplicateScan.success).toBe(false);
            expect(duplicateScan.reason).toBe('duplicate');
        });

        test('should allow duplicate after cooldown', async () => {
            const payload = 'COOLDOWN_TEST';

            // First scan
            const firstScan = await dbClient.saveQRScan(sessionId, payload);
            expect(firstScan.success).toBe(true);

            // Set very short cooldown for test
            dbClient.setQRCooldown(100);

            // Wait for cooldown
            await new Promise(resolve => setTimeout(resolve, 150));

            // Second scan should now succeed
            const secondScan = await dbClient.saveQRScan(sessionId, payload);
            expect(secondScan.success).toBe(true);
        });

        test('should fail to save scan for inactive session', async () => {
            await dbClient.endSession(sessionId);

            await expect(dbClient.saveQRScan(sessionId, 'TEST')).rejects.toThrow('No active session found');
        });

        test('should get QR scans by session', async () => {
            // Create multiple scans
            const payloads = ['SCAN1', 'SCAN2', 'SCAN3'];

            for (const payload of payloads) {
                await dbClient.saveQRScan(sessionId, payload);
                // Small delay to ensure different timestamps
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            const scans = await dbClient.getQRScansBySession(sessionId, 10);

            expect(scans.length).toBe(3);
            expect(scans.every(s => s.SessionID === sessionId)).toBe(true);

            // Verify sorting (newest first)
            expect(scans[0].RawPayload).toBe('SCAN3');
            expect(scans[2].RawPayload).toBe('SCAN1');
        });

        test('should limit QR scans by session', async () => {
            // Create more scans than limit
            for (let i = 0; i < 5; i++) {
                await dbClient.saveQRScan(sessionId, `SCAN_${i}`);
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            const scans = await dbClient.getQRScansBySession(sessionId, 3);

            expect(scans.length).toBe(3);
        });

        test('should handle different payload types', async () => {
            const payloads = [
                'SIMPLE_TEXT',
                '{"json": "payload", "value": 123}',
                'http://example.com/product/123',
                'ORDER_2024_001_BATCH_A',
                '1234567890'
            ];

            for (const payload of payloads) {
                const result = await dbClient.saveQRScan(sessionId, payload);
                expect(result.success).toBe(true);
            }

            const scans = await dbClient.getQRScansBySession(sessionId);
            expect(scans.length).toBe(payloads.length);
        });

        test('should delete QR scan', async () => {
            const result = await dbClient.saveQRScan(sessionId, 'DELETE_TEST');
            const scanId = result.scanId;

            const deleteSuccess = await dbClient.deleteQRScan(scanId);
            expect(deleteSuccess).toBe(true);

            // Verify scan is deleted
            const remainingScans = await dbClient.getQRScansBySession(sessionId);
            expect(remainingScans.some(s => s.ID === scanId)).toBe(false);
        });
    });

    describe('Statistics and Health', () => {
        test('should track query statistics', async () => {
            const initialStats = dbClient.getStatistics();

            await dbClient.getUserByRFID('329C172');
            await dbClient.createSession(1);

            const finalStats = dbClient.getStatistics();
            expect(finalStats.queries).toBeGreaterThan(initialStats.queries);
            expect(finalStats.successfulQueries).toBeGreaterThan(initialStats.successfulQueries);
        });

        test('should perform health check', async () => {
            const health = await dbClient.healthCheck();

            expect(health.status).toBe('healthy');
            expect(health.timestamp).toBeDefined();
            expect(health.connectionState).toBe('connected');
        });

        test('should reset statistics', () => {
            // Generate some stats
            dbClient.stats.queries = 10;
            dbClient.stats.successfulQueries = 8;

            dbClient.resetStatistics();

            expect(dbClient.stats.queries).toBe(0);
            expect(dbClient.stats.successfulQueries).toBe(0);
        });
    });

    describe('Error Simulation', () => {
        test('should handle simulated errors', async () => {
            dbClient.enableErrorSimulation(1.0); // 100% error rate

            await expect(dbClient.getUserByRFID('329C172')).rejects.toThrow('Simulated database error');
        });

        test('should disable error simulation', async () => {
            dbClient.enableErrorSimulation(1.0);
            dbClient.disableErrorSimulation();

            // Should not throw
            const user = await dbClient.getUserByRFID('329C172');
            expect(user).toBeDefined();
        });
    });

    describe('Complex Scenarios', () => {
        test('should maintain data consistency', async () => {
            // Multi-user scenario
            const user1 = await dbClient.getUserByRFID('329C172');
            const user2 = await dbClient.getUserByRFID('329C173');

            // Create sessions
            const session1 = await dbClient.createSession(user1.BenID);
            const session2 = await dbClient.createSession(user2.BenID);

            // Add scans
            const scans = [
                { sessionId: session1.ID, payload: 'USER1_SCAN1' },
                { sessionId: session2.ID, payload: 'USER2_SCAN1' },
                { sessionId: session1.ID, payload: 'USER1_SCAN2' }
            ];

            for (const scan of scans) {
                await dbClient.saveQRScan(scan.sessionId, scan.payload);
            }

            // Verify all scans are retrievable
            const savedScans = await dbClient.getQRScansBySession(session1.ID);
            expect(savedScans.length).toBe(2); // Only scans for session1

            const savedPayloads = savedScans.map(s => s.RawPayload);
            expect(savedPayloads).toContain('USER1_SCAN1');
            expect(savedPayloads).toContain('USER1_SCAN2');
        });

        test('should handle concurrent operations', async () => {
            const promises = [];

            // Simulate concurrent user lookups
            for (let i = 0; i < 10; i++) {
                promises.push(dbClient.getUserByRFID('329C172'));
            }

            const results = await Promise.all(promises);

            // All should return the same user
            expect(results.every(user => user && user.BenID === 1)).toBe(true);
        });
    });
});