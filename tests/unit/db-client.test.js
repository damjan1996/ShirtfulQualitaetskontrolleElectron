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

        test('should not connect twice', async () => {
            await dbClient.connect();
            const secondConnect = await dbClient.connect();

            expect(secondConnect).toBe(true);
            expect(dbClient.isConnected).toBe(true);
        });

        test('should handle close when not connected', async () => {
            const result = await dbClient.close();
            expect(result).toBe(true);
        });

        test('should test connection successfully', async () => {
            await dbClient.connect();
            const testResult = await dbClient.testConnection();

            expect(testResult.success).toBe(true);
            expect(testResult.server).toBe('localhost');
            expect(testResult.database).toBe('RdScanner_Test');
            expect(testResult.connectionTime).toBeGreaterThan(0);
        });

        test('should fail test connection when not connected', async () => {
            await expect(dbClient.testConnection())
                .rejects.toThrow('Not connected to database');
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

        test('should not find inactive user', async () => {
            const user = await dbClient.getUserByEPC('DEADBEEF');
            expect(user).toBeNull();
        });

        test('should find user by ID', async () => {
            const user = await dbClient.getUserById(1);
            expect(user).toBeTruthy();
            expect(user.ID).toBe(1);
            expect(user.BenutzerName).toBe('Test User 1');
        });

        test('should return null for unknown user ID', async () => {
            const user = await dbClient.getUserById(999);
            expect(user).toBeNull();
        });

        test('should get all active users', async () => {
            const users = await dbClient.getAllActiveUsers();
            expect(users.length).toBe(2);
            expect(users.every(u => u.xStatus === 0)).toBe(true);
        });

        test('should create new user', async () => {
            const userData = {
                BenutzerName: 'New Test User',
                EPC: 0x12345678,
                Email: 'newuser@example.com',
                Rolle: 'Mitarbeiter'
            };

            const newUser = await dbClient.createUser(userData);

            expect(newUser.ID).toBeDefined();
            expect(newUser.BenutzerName).toBe(userData.BenutzerName);
            expect(newUser.EPC).toBe(userData.EPC);
            expect(newUser.Email).toBe(userData.Email);
            expect(newUser.xStatus).toBe(0);
            expect(newUser.ErstelltAm).toBeDefined();
        });

        test('should update existing user', async () => {
            const updateData = {
                BenutzerName: 'Updated Name',
                Email: 'updated@example.com'
            };

            const updatedUser = await dbClient.updateUser(1, updateData);

            expect(updatedUser.ID).toBe(1);
            expect(updatedUser.BenutzerName).toBe(updateData.BenutzerName);
            expect(updatedUser.Email).toBe(updateData.Email);
        });

        test('should fail to update non-existent user', async () => {
            await expect(dbClient.updateUser(999, { BenutzerName: 'Test' }))
                .rejects.toThrow('User with ID 999 not found');
        });

        test('should deactivate user', async () => {
            const deactivatedUser = await dbClient.deactivateUser(1);

            expect(deactivatedUser.ID).toBe(1);
            expect(deactivatedUser.xStatus).toBe(1);
        });

        test('should fail to deactivate non-existent user', async () => {
            await expect(dbClient.deactivateUser(999))
                .rejects.toThrow('User with ID 999 not found');
        });
    });

    describe('Session Management', () => {
        beforeEach(async () => {
            await dbClient.connect();
        });

        test('should create new session', async () => {
            const userId = 1;
            const session = await dbClient.createSession(userId);

            expect(session.ID).toBeDefined();
            expect(session.UserID).toBe(userId);
            expect(session.StartTS).toBeDefined();
            expect(session.EndTS).toBeNull();
            expect(session.Active).toBe(1);
        });

        test('should close existing session when creating new one', async () => {
            const userId = 1;

            // Erstelle erste Session
            const session1 = await dbClient.createSession(userId);
            expect(session1.Active).toBe(1);

            // Erstelle zweite Session - sollte erste schließen
            const session2 = await dbClient.createSession(userId);
            expect(session2.Active).toBe(1);

            // Überprüfe dass erste Session geschlossen wurde
            const closedSession = dbClient.mockData.sessions.find(s => s.ID === session1.ID);
            expect(closedSession.Active).toBe(0);
            expect(closedSession.EndTS).toBeDefined();
        });

        test('should end session', async () => {
            const userId = 1;
            const session = await dbClient.createSession(userId);

            const endedSession = await dbClient.endSession(session.ID);

            expect(endedSession.ID).toBe(session.ID);
            expect(endedSession.EndTS).toBeDefined();
            expect(endedSession.Active).toBe(0);
        });

        test('should fail to end non-existent session', async () => {
            await expect(dbClient.endSession(999))
                .rejects.toThrow('Session with ID 999 not found');
        });

        test('should fail to end already closed session', async () => {
            const userId = 1;
            const session = await dbClient.createSession(userId);
            await dbClient.endSession(session.ID);

            await expect(dbClient.endSession(session.ID))
                .rejects.toThrow('Session 1 is already closed');
        });

        test('should get active session for user', async () => {
            const userId = 1;
            const session = await dbClient.createSession(userId);

            const activeSession = await dbClient.getActiveSession(userId);

            expect(activeSession).toBeTruthy();
            expect(activeSession.ID).toBe(session.ID);
            expect(activeSession.Active).toBe(1);
        });

        test('should return null when no active session exists', async () => {
            const activeSession = await dbClient.getActiveSession(1);
            expect(activeSession).toBeNull();
        });

        test('should get all active sessions', async () => {
            await dbClient.createSession(1);
            await dbClient.createSession(2);

            const activeSessions = await dbClient.getAllActiveSessions();

            expect(activeSessions.length).toBe(2);
            expect(activeSessions.every(s => s.Active === 1)).toBe(true);
        });

        test('should get sessions by user', async () => {
            const userId = 1;

            // Erstelle und schließe mehrere Sessions
            const session1 = await dbClient.createSession(userId);
            await dbClient.endSession(session1.ID);

            const session2 = await dbClient.createSession(userId);
            await dbClient.endSession(session2.ID);

            const userSessions = await dbClient.getSessionsByUser(userId, 10);

            expect(userSessions.length).toBe(2);
            expect(userSessions.every(s => s.UserID === userId)).toBe(true);

            // Überprüfe Sortierung (neueste zuerst)
            expect(new Date(userSessions[0].StartTS) >= new Date(userSessions[1].StartTS)).toBe(true);
        });

        test('should calculate session duration', async () => {
            const userId = 1;
            const session = await dbClient.createSession(userId);

            // Warte kurz und beende Session
            await new Promise(resolve => setTimeout(resolve, 50));
            await dbClient.endSession(session.ID);

            const duration = await dbClient.getSessionDuration(session.ID);

            expect(duration).toBeTruthy();
            expect(duration.sessionId).toBe(session.ID);
            expect(duration.startTime).toBeDefined();
            expect(duration.endTime).toBeDefined();
            expect(duration.duration).toBeGreaterThan(0);
            expect(duration.isActive).toBe(false);
            expect(duration.formattedDuration).toContain('s');
        });

        test('should calculate duration for active session', async () => {
            const userId = 1;
            const session = await dbClient.createSession(userId);

            const duration = await dbClient.getSessionDuration(session.ID);

            expect(duration.isActive).toBe(true);
            expect(duration.endTime).toBeNull();
            expect(duration.duration).toBeGreaterThan(0);
        });
    });

    describe('QR Scan Management', () => {
        let userId, sessionId;

        beforeEach(async () => {
            await dbClient.connect();
            userId = 1;
            const session = await dbClient.createSession(userId);
            sessionId = session.ID;
        });

        test('should save QR scan', async () => {
            const payload = 'TEST_QR_CODE_001';
            const result = await dbClient.saveQRScan(sessionId, payload);

            expect(result.success).toBe(true);
            expect(result.data.SessionID).toBe(sessionId);
            expect(result.data.RawPayload).toBe(payload);
            expect(result.data.ScannTS).toBeDefined();
            expect(result.data.PayloadAsJSON).toBeNull(); // Kein gültiges JSON
        });

        test('should save QR scan with JSON payload', async () => {
            const jsonPayload = JSON.stringify({ id: 'PKG001', type: 'package', order: '12345' });
            const result = await dbClient.saveQRScan(sessionId, jsonPayload);

            expect(result.success).toBe(true);
            expect(result.data.RawPayload).toBe(jsonPayload);
            expect(result.data.PayloadAsJSON).toEqual({ id: 'PKG001', type: 'package', order: '12345' });
        });

        test('should prevent duplicate QR scans', async () => {
            const payload = 'DUPLICATE_TEST';

            // Erster Scan sollte erfolgreich sein
            const firstScan = await dbClient.saveQRScan(sessionId, payload);
            expect(firstScan.success).toBe(true);

            // Zweiter Scan sollte fehlschlagen (Duplicate)
            await expect(dbClient.saveQRScan(sessionId, payload))
                .rejects.toThrow('Duplicate scan detected');
        });

        test('should allow duplicate after cooldown', async () => {
            const payload = 'COOLDOWN_TEST';

            // Setze kurzen Cooldown für Test
            dbClient.duplicateCooldown = 100; // 100ms

            // Erster Scan
            await dbClient.saveQRScan(sessionId, payload);

            // Warte Cooldown ab
            await new Promise(resolve => setTimeout(resolve, 150));

            // Zweiter Scan sollte jetzt erfolgreich sein
            const secondScan = await dbClient.saveQRScan(sessionId, payload);
            expect(secondScan.success).toBe(true);
        });

        test('should fail to save scan for inactive session', async () => {
            await dbClient.endSession(sessionId);

            await expect(dbClient.saveQRScan(sessionId, 'TEST'))
                .rejects.toThrow('No active session found');
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
            expect(new Date(scans[0].ScannTS) >= new Date(scans[1].ScannTS)).toBe(true);
        });

        test('should limit QR scans by session', async () => {
            // Speichere mehr Scans als Limit
            for (let i = 1; i <= 5; i++) {
                await dbClient.saveQRScan(sessionId, `SCAN_${i.toString().padStart(3, '0')}`);
            }

            const scans = await dbClient.getQRScansBySession(sessionId, 3);

            expect(scans.length).toBe(3);
        });

        test('should get recent QR scans', async () => {
            // Erstelle zweite Session
            const session2 = await dbClient.createSession(2);

            // Speichere Scans in beiden Sessions
            await dbClient.saveQRScan(sessionId, 'SESSION1_SCAN');
            await dbClient.saveQRScan(session2.ID, 'SESSION2_SCAN');

            const recentScans = await dbClient.getRecentQRScans(10);

            expect(recentScans.length).toBe(2);
            expect(recentScans.some(s => s.RawPayload === 'SESSION1_SCAN')).toBe(true);
            expect(recentScans.some(s => s.RawPayload === 'SESSION2_SCAN')).toBe(true);
        });

        test('should get QR scan by ID', async () => {
            const result = await dbClient.saveQRScan(sessionId, 'FIND_BY_ID_TEST');
            const scanId = result.data.ID;

            const foundScan = await dbClient.getQRScanById(scanId);

            expect(foundScan).toBeTruthy();
            expect(foundScan.ID).toBe(scanId);
            expect(foundScan.RawPayload).toBe('FIND_BY_ID_TEST');
        });

        test('should return null for non-existent scan ID', async () => {
            const scan = await dbClient.getQRScanById(999);
            expect(scan).toBeNull();
        });

        test('should delete QR scan', async () => {
            const result = await dbClient.saveQRScan(sessionId, 'DELETE_TEST');
            const scanId = result.data.ID;

            const deletedScan = await dbClient.deleteQRScan(scanId);

            expect(deletedScan.ID).toBe(scanId);
            expect(deletedScan.RawPayload).toBe('DELETE_TEST');

            // Überprüfe dass Scan entfernt wurde
            const remainingScans = await dbClient.getQRScansBySession(sessionId);
            expect(remainingScans.some(s => s.ID === scanId)).toBe(false);
        });

        test('should fail to delete non-existent scan', async () => {
            await expect(dbClient.deleteQRScan(999))
                .rejects.toThrow('QR scan with ID 999 not found');
        });
    });

    describe('Statistics and Reporting', () => {
        let userId, sessionId;

        beforeEach(async () => {
            await dbClient.connect();
            userId = 1;
            const session = await dbClient.createSession(userId);
            sessionId = session.ID;
        });

        test('should get session statistics', async () => {
            // Füge einige QR-Scans hinzu
            await dbClient.saveQRScan(sessionId, 'STATS_SCAN_001');
            await dbClient.saveQRScan(sessionId, 'STATS_SCAN_002');
            await dbClient.saveQRScan(sessionId, 'STATS_SCAN_003');

            const stats = await dbClient.getSessionStats(sessionId);

            expect(stats).toBeTruthy();
            expect(stats.sessionId).toBe(sessionId);
            expect(stats.userId).toBe(userId);
            expect(stats.totalScans).toBe(3);
            expect(stats.isActive).toBe(true);
            expect(stats.startTime).toBeDefined();
        });

        test('should return null for non-existent session stats', async () => {
            const stats = await dbClient.getSessionStats(999);
            expect(stats).toBeNull();
        });

        test('should get user statistics', async () => {
            // Erstelle mehrere Sessions und Scans
            await dbClient.saveQRScan(sessionId, 'USER_STATS_SCAN_1');
            await dbClient.endSession(sessionId);

            const session2 = await dbClient.createSession(userId);
            await dbClient.saveQRScan(session2.ID, 'USER_STATS_SCAN_2');
            await dbClient.saveQRScan(session2.ID, 'USER_STATS_SCAN_3');

            const userStats = await dbClient.getUserStats(userId, 30);

            expect(userStats.userId).toBe(userId);
            expect(userStats.totalSessions).toBe(2);
            expect(userStats.activeSessions).toBe(1);
            expect(userStats.totalScans).toBe(3);
            expect(userStats.avgScansPerSession).toBe(1.5);
            expect(userStats.formattedWorkTime).toBeDefined();
        });

        test('should get daily statistics', async () => {
            const today = new Date();

            // Füge einige Daten für heute hinzu
            await dbClient.saveQRScan(sessionId, 'DAILY_SCAN_1');
            await dbClient.saveQRScan(sessionId, 'DAILY_SCAN_2');

            const dailyStats = await dbClient.getDailyStats(today);

            expect(dailyStats.date).toBe(today.toDateString());
            expect(dailyStats.totalUsers).toBe(1);
            expect(dailyStats.totalSessions).toBe(1);
            expect(dailyStats.activeSessions).toBe(1);
            expect(dailyStats.totalScans).toBe(2);
            expect(dailyStats.hourlyDistribution).toBeDefined();
            expect(dailyStats.hourlyDistribution.length).toBe(24);
        });

        test('should perform health check', async () => {
            const health = await dbClient.healthCheck();

            expect(health.connected).toBe(true);
            expect(health.connectionTime).toBeGreaterThan(0);
            expect(health.server.name).toBe('localhost');
            expect(health.server.database).toBe('RdScanner_Test');
            expect(health.stats.activeUsers).toBe(2);
            expect(health.performance).toBeDefined();
            expect(health.timestamp).toBeDefined();
        });
    });

    describe('Performance Tracking', () => {
        beforeEach(async () => {
            await dbClient.connect();
        });

        test('should track query performance', async () => {
            // Führe mehrere Queries aus
            await dbClient.getUserByEPC('53004114');
            await dbClient.getAllActiveUsers();
            await dbClient.healthCheck();

            const stats = dbClient.getPerformanceStats();

            expect(stats.queries.total).toBeGreaterThanOrEqual(3);
            expect(stats.queries.successful).toBeGreaterThan(0);
            expect(stats.queries.avgDuration).toBeGreaterThan(0);
        });

        test('should track failed queries', async () => {
            // Simuliere Query-Fehler
            jest.spyOn(dbClient, '_executeQuery').mockRejectedValueOnce(new Error('Query failed'));

            try {
                await dbClient.getUserByEPC('53004114');
            } catch (error) {
                // Fehler erwartet
            }

            const stats = dbClient.getPerformanceStats();
            expect(stats.queries.failed).toBeGreaterThan(0);
        });

        test('should calculate average query duration', async () => {
            const initialStats = dbClient.getPerformanceStats();

            // Führe einige Queries aus
            await dbClient.getUserByEPC('53004114');
            await dbClient.getUserByEPC('87654321');

            const finalStats = dbClient.getPerformanceStats();

            expect(finalStats.queries.avgDuration).toBeGreaterThanOrEqual(initialStats.queries.avgDuration);
            expect(finalStats.queries.total).toBeGreaterThan(initialStats.queries.total);
        });
    });

    describe('Test Helper Methods', () => {
        test('should reset mock data', () => {
            // Ändere Mock-Daten
            dbClient.mockData.users.push({ ID: 999, BenutzerName: 'Temp User' });

            // Reset
            dbClient.reset();

            expect(dbClient.mockData.users.length).toBe(2); // Zurück zu ursprünglichen Test-Usern
            expect(dbClient.mockData.sessions.length).toBe(0);
            expect(dbClient.mockData.qrScans.length).toBe(0);
        });

        test('should add test user', () => {
            const testUser = {
                BenutzerName: 'Additional Test User',
                EPC: 0xABCDEF12,
                Email: 'additional@test.com'
            };

            const addedUser = dbClient.addTestUser(testUser);

            expect(addedUser.ID).toBe(3); // Nach den 2 Standard-Test-Usern
            expect(addedUser.BenutzerName).toBe(testUser.BenutzerName);
            expect(addedUser.EPC).toBe(testUser.EPC);
            expect(addedUser.xStatus).toBe(0);
        });

        test('should simulate connection error', () => {
            const errorHandler = jest.fn();
            dbClient.on('connection-lost', errorHandler);

            dbClient.simulateConnectionError();

            expect(dbClient.isConnected).toBe(false);
            expect(errorHandler).toHaveBeenCalled();
        });

        test('should get mock data copy', () => {
            const mockData = dbClient.getMockData();

            expect(mockData).toEqual(dbClient.mockData);
            expect(mockData).not.toBe(dbClient.mockData); // Sollte Kopie sein, nicht Referenz
        });

        test('should set network delay', () => {
            dbClient.setNetworkDelay(50, 200);

            expect(dbClient._networkDelayMin).toBe(50);
            expect(dbClient._networkDelayMax).toBe(200);
        });
    });

    describe('Edge Cases and Error Conditions', () => {
        beforeEach(async () => {
            await dbClient.connect();
        });

        test('should handle null and undefined inputs gracefully', async () => {
            expect(await dbClient.getUserByEPC(null)).toBeNull();
            expect(await dbClient.getUserByEPC(undefined)).toBeNull();
            expect(await dbClient.getUserByEPC('')).toBeNull();

            expect(await dbClient.getUserById(null)).toBeNull();
            expect(await dbClient.getUserById(undefined)).toBeNull();
        });

        test('should handle concurrent operations', async () => {
            const userId = 1;

            // Starte mehrere Session-Operationen gleichzeitig
            const promises = [
                dbClient.createSession(userId),
                dbClient.getActiveSession(userId),
                dbClient.getAllActiveSessions()
            ];

            const results = await Promise.all(promises);

            expect(results[0]).toBeDefined(); // createSession
            expect(results[1]).toBeDefined(); // getActiveSession (sollte neue Session finden)
            expect(results[2]).toBeDefined(); // getAllActiveSessions
        });

        test('should handle large datasets efficiently', async () => {
            const userId = 1;
            const session = await dbClient.createSession(userId);

            // Erstelle viele QR-Scans
            const scanPromises = [];
            for (let i = 0; i < 100; i++) {
                scanPromises.push(dbClient.saveQRScan(session.ID, `BULK_SCAN_${i.toString().padStart(3, '0')}`));
            }

            const startTime = Date.now();
            await Promise.all(scanPromises);
            const endTime = Date.now();

            // Performance-Check: Sollte nicht länger als 5 Sekunden dauern
            expect(endTime - startTime).toBeLessThan(5000);

            const allScans = await dbClient.getQRScansBySession(session.ID, 200);
            expect(allScans.length).toBe(100);
        });

        test('should maintain data integrity under stress', async () => {
            const user1 = 1;
            const user2 = 2;

            // Simuliere gleichzeitige Benutzeraktivitäten
            const activities = [];

            for (let i = 0; i < 10; i++) {
                activities.push(async () => {
                    const session1 = await dbClient.createSession(user1);
                    const session2 = await dbClient.createSession(user2);

                    await dbClient.saveQRScan(session1.ID, `USER1_SCAN_${i}`);
                    await dbClient.saveQRScan(session2.ID, `USER2_SCAN_${i}`);

                    await dbClient.endSession(session1.ID);
                    await dbClient.endSession(session2.ID);
                });
            }

            await Promise.all(activities.map(activity => activity()));

            // Überprüfe Datenintegrität
            const user1Sessions = await dbClient.getSessionsByUser(user1);
            const user2Sessions = await dbClient.getSessionsByUser(user2);

            expect(user1Sessions.length).toBe(10);
            expect(user2Sessions.length).toBe(10);
            expect(user1Sessions.every(s => s.Active === 0)).toBe(true);
            expect(user2Sessions.every(s => s.Active === 0)).toBe(true);
        });
    });
});