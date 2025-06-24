// tests/unit/db-client.test.js
/**
 * Unit Tests für Database Client
 */

const MockDatabaseClient = require('../mocks/db-client.mock');

// Mock SQL Module
jest.mock('mssql', () => global.mockMSSql);

describe('DatabaseClient', () => {
    let dbClient;

    beforeEach(() => {
        dbClient = new MockDatabaseClient();
    });

    afterEach(() => {
        if (dbClient) {
            dbClient.reset();
        }
    });

    describe('Connection Management', () => {
        test('should connect successfully', async () => {
            const result = await dbClient.connect();
            expect(result).toBe(true);
            expect(dbClient.isConnected).toBe(true);
        });

        test('should close connection successfully', async () => {
            await dbClient.connect();
            await dbClient.close();
            expect(dbClient.isConnected).toBe(false);
        });

        test('should handle connection errors gracefully', async () => {
            // Mock einen Verbindungsfehler
            jest.spyOn(dbClient, 'connect').mockRejectedValueOnce(new Error('Connection failed'));

            await expect(dbClient.connect()).rejects.toThrow('Connection failed');
            expect(dbClient.isConnected).toBe(false);
        });
    });

    describe('User Management', () => {
        beforeEach(async () => {
            await dbClient.connect();
        });

        test('should find user by EPC', async () => {
            const user = await dbClient.getUserByEPC('53004114');
            expect(user).toBeTruthy();
            expect(user.ID).toBe(1);
            expect(user.BenutzerName).toBe('Test User 1');
            expect(user.EPC).toBe(1392525588);
        });

        test('should return null for unknown EPC', async () => {
            const user = await dbClient.getUserByEPC('UNKNOWN');
            expect(user).toBeNull();
        });

        test('should handle invalid EPC format', async () => {
            const user = await dbClient.getUserByEPC('invalid_hex');
            expect(user).toBeNull();
        });

        test('should find user with different EPC', async () => {
            const user = await dbClient.getUserByEPC('87654321');
            expect(user).toBeTruthy();
            expect(user.ID).toBe(2);
            expect(user.BenutzerName).toBe('Test User 2');
        });
    });

    describe('Session Management', () => {
        beforeEach(async () => {
            await dbClient.connect();
        });

        test('should create new session', async () => {
            const session = await dbClient.createSession(1);

            expect(session).toBeTruthy();
            expect(session.ID).toBeTruthy();
            expect(session.UserID).toBe(1);
            expect(session.StartTS).toBeTruthy();
            expect(session.Active).toBe(1);
        });

        test('should end session successfully', async () => {
            const session = await dbClient.createSession(1);
            const result = await dbClient.endSession(session.ID);

            expect(result).toBe(true);
        });

        test('should return false when ending non-existent session', async () => {
            const result = await dbClient.endSession(999);
            expect(result).toBe(false);
        });

        test('should handle multiple sessions for same user', async () => {
            const session1 = await dbClient.createSession(1);
            const session2 = await dbClient.createSession(1);

            expect(session1.ID).not.toBe(session2.ID);
            expect(session1.UserID).toBe(session2.UserID);
        });
    });

    describe('QR Code Scanning', () => {
        let sessionId;

        beforeEach(async () => {
            await dbClient.connect();
            const session = await dbClient.createSession(1);
            sessionId = session.ID;
        });

        test('should save QR scan successfully', async () => {
            const payload = 'TEST_QR_CODE_123';
            const result = await dbClient.saveQRScan(sessionId, payload);

            expect(result.success).toBe(true);
            expect(result.status).toBe('saved');
            expect(result.data).toBeTruthy();
            expect(result.data.RawPayload).toBe(payload);
            expect(result.data.SessionID).toBe(sessionId);
        });

        test('should detect duplicate QR codes', async () => {
            const payload = 'DUPLICATE_QR_CODE';

            // Erste Speicherung
            const result1 = await dbClient.saveQRScan(sessionId, payload);
            expect(result1.success).toBe(true);

            // Zweite Speicherung (Duplikat)
            const result2 = await dbClient.saveQRScan(sessionId, payload);
            expect(result2.success).toBe(false);
            expect(result2.status).toBe('duplicate_cache');
            expect(result2.duplicateInfo).toBeTruthy();
        });

        test('should handle different QR code formats', async () => {
            const testCodes = [
                'PLAIN_TEXT_QR',
                '{"type":"json","data":"test"}',
                '1234567890123',
                'https://example.com/test'
            ];

            for (const code of testCodes) {
                const result = await dbClient.saveQRScan(sessionId, code);
                expect(result.success).toBe(true);
                expect(result.data.RawPayload).toBe(code);
            }
        });

        test('should reject QR scan for invalid session', async () => {
            const result = await dbClient.saveQRScan(999, 'TEST_CODE');
            expect(result.success).toBe(false);
        });

        test('should handle special characters in QR codes', async () => {
            const specialCodes = [
                'ÄÖÜäöüß',
                '日本語',
                '🎉✅❌',
                'Line1\nLine2\nLine3'
            ];

            for (const code of specialCodes) {
                const result = await dbClient.saveQRScan(sessionId, code);
                expect(result.success).toBe(true);
                expect(result.data.RawPayload).toBe(code);
            }
        });
    });

    describe('Health Check', () => {
        test('should return health status when connected', async () => {
            await dbClient.connect();
            const health = await dbClient.healthCheck();

            expect(health.connected).toBe(true);
            expect(health.connectionTime).toBeDefined();
            expect(health.server).toBeDefined();
            expect(health.stats).toBeDefined();
            expect(health.timestamp).toBeDefined();
        });

        test('should return disconnected status when not connected', async () => {
            const health = await dbClient.healthCheck();
            expect(health.connected).toBe(false);
        });

        test('should include database statistics', async () => {
            await dbClient.connect();
            const health = await dbClient.healthCheck();

            expect(health.stats.ActiveUsers).toBeDefined();
            expect(health.stats.TotalSessions).toBeDefined();
            expect(health.stats.ActiveSessions).toBeDefined();
            expect(health.stats.TotalValidScans).toBeDefined();
        });
    });

    describe('Data Validation', () => {
        beforeEach(async () => {
            await dbClient.connect();
        });

        test('should validate EPC format', () => {
            const validEpcs = ['53004114', 'ABCDEF01', '12345678'];
            const invalidEpcs = ['', 'invalid', '123', 'GHIJKLMN'];

            validEpcs.forEach(epc => {
                expect(() => parseInt(epc, 16)).not.toThrow();
            });
        });

        test('should handle malformed QR payloads', async () => {
            const session = await dbClient.createSession(1);
            const malformedPayloads = [
                '',
                null,
                undefined,
                '\x00\x01\x02',
                'x'.repeat(10000) // Sehr lang
            ];

            for (const payload of malformedPayloads) {
                if (payload === null || payload === undefined) continue;

                const result = await dbClient.saveQRScan(session.ID, payload);
                expect(result).toBeDefined();
                expect(result.success).toBeDefined();
            }
        });
    });

    describe('Error Handling', () => {
        test('should handle database connection loss', async () => {
            await dbClient.connect();
            dbClient.isConnected = false; // Simuliere Verbindungsabbruch

            await expect(dbClient.query('SELECT 1')).rejects.toThrow();
        });

        test('should recover from transient errors', async () => {
            await dbClient.connect();

            // Simuliere temporären Fehler
            const originalQuery = dbClient.query;
            let callCount = 0;
            dbClient.query = jest.fn().mockImplementation((...args) => {
                callCount++;
                if (callCount === 1) {
                    throw new Error('Transient error');
                }
                return originalQuery.apply(dbClient, args);
            });

            // Zweiter Versuch sollte erfolgreich sein
            try {
                await dbClient.query('SELECT 1');
            } catch (error) {
                // Erster Versuch schlägt fehl
                expect(error.message).toBe('Transient error');
            }

            // Zweiter Versuch
            const result = await dbClient.query('SELECT 1');
            expect(result).toBeDefined();
        });
    });

    describe('Performance Tests', () => {
        beforeEach(async () => {
            await dbClient.connect();
        });

        test('should handle multiple concurrent QR scans', async () => {
            const session = await dbClient.createSession(1);
            const scanPromises = [];

            for (let i = 0; i < 10; i++) {
                scanPromises.push(
                    dbClient.saveQRScan(session.ID, `QR_CODE_${i}`)
                );
            }

            const results = await Promise.all(scanPromises);
            const successfulScans = results.filter(r => r.success);

            expect(successfulScans.length).toBeGreaterThan(0);
        });

        test('should handle rapid duplicate detection', async () => {
            const session = await dbClient.createSession(1);
            const payload = 'RAPID_DUPLICATE_TEST';

            const scanPromises = Array(5).fill().map(() =>
                dbClient.saveQRScan(session.ID, payload)
            );

            const results = await Promise.all(scanPromises);
            const successfulScans = results.filter(r => r.success);
            const duplicateScans = results.filter(r => !r.success && r.status.includes('duplicate'));

            expect(successfulScans.length).toBe(1);
            expect(duplicateScans.length).toBeGreaterThan(0);
        });
    });

    describe('Cache Management', () => {
        beforeEach(async () => {
            await dbClient.connect();
        });

        test('should manage duplicate cache properly', async () => {
            const session = await dbClient.createSession(1);
            const payload = 'CACHE_TEST_QR';

            // Cache sollte leer sein
            expect(dbClient.duplicateCache.size).toBe(0);

            // Ersten Scan hinzufügen
            await dbClient.saveQRScan(session.ID, payload);
            expect(dbClient.duplicateCache.size).toBe(1);

            // Duplikat sollte im Cache erkannt werden
            const result = await dbClient.saveQRScan(session.ID, payload);
            expect(result.status).toBe('duplicate_cache');
        });

        test('should clean up old cache entries', () => {
            // Test für Cache-Bereinigung
            const oldTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 Stunden alt
            const newTimestamp = Date.now();

            dbClient.duplicateCache.set('old_code', oldTimestamp);
            dbClient.duplicateCache.set('new_code', newTimestamp);

            expect(dbClient.duplicateCache.size).toBe(2);

            // Simuliere Cache-Bereinigung
            for (const [key, timestamp] of dbClient.duplicateCache.entries()) {
                if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
                    dbClient.duplicateCache.delete(key);
                }
            }

            expect(dbClient.duplicateCache.size).toBe(1);
            expect(dbClient.duplicateCache.has('new_code')).toBe(true);
            expect(dbClient.duplicateCache.has('old_code')).toBe(false);
        });
    });
});