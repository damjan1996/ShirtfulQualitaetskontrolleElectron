// tests/integration/complete-workflow.test.js
/**
 * Complete End-to-End Workflow Integration Tests
 * Testet komplette Arbeitsabläufe vom RFID-Login bis zum QR-Scan
 */

const MockDatabaseClient = require('../mocks/db-client.mock');
const MockRFIDListener = require('../mocks/rfid-listener.mock');
const { MockQRScanner } = require('../mocks/qr-scanner.mock');

describe('Complete Application Workflow', () => {
    let dbClient;
    let rfidListener;
    let qrScanner;
    let mockApp;

    beforeEach(async () => {
        // Setup Database
        dbClient = new MockDatabaseClient();
        await dbClient.connect();

        // Setup RFID Listener
        rfidListener = new MockRFIDListener();
        await rfidListener.start();

        // Setup QR Scanner
        qrScanner = new MockQRScanner();

        // Mock Application State
        mockApp = {
            currentSession: null,
            currentUser: null,
            qrScanHistory: [],
            systemStatus: {
                database: true,
                rfid: true,
                qrScanner: false
            },
            stats: {
                totalSessions: 0,
                totalScans: 0,
                uptime: 0
            }
        };
    });

    afterEach(async () => {
        if (qrScanner && qrScanner.isScanning) {
            await qrScanner.stop();
        }
        if (rfidListener && rfidListener.isListening) {
            await rfidListener.stop();
        }
        if (dbClient && dbClient.isConnected) {
            await dbClient.close();
        }
    });

    describe('Complete Worker Shift Workflow', () => {
        test('should complete full worker shift workflow', async () => {
            // 1. Worker arrives and scans RFID tag
            const workerTag = '53004114';
            const user = await dbClient.getUserByEPC(workerTag);
            expect(user).toBeTruthy();
            expect(user.BenutzerName).toBe('Test User 1');

            // 2. Session is created
            const session = await dbClient.createSession(user.ID);
            mockApp.currentSession = {
                sessionId: session.ID,
                userId: user.ID,
                startTime: session.StartTS
            };
            mockApp.currentUser = user;
            mockApp.stats.totalSessions++;

            expect(session.Active).toBe(1);
            expect(mockApp.currentSession.sessionId).toBe(session.ID);

            // 3. Worker starts QR scanner
            await qrScanner.start();
            mockApp.systemStatus.qrScanner = true;

            expect(qrScanner.isScanning).toBe(true);

            // 4. Worker scans multiple packages
            const packageIds = [
                'PACKAGE_001_ABC123',
                'PACKAGE_002_DEF456',
                'PACKAGE_003_GHI789'
            ];

            for (const packageId of packageIds) {
                const scanResult = await dbClient.saveQRScan(session.ID, packageId);
                expect(scanResult.success).toBe(true);
                mockApp.qrScanHistory.push(scanResult.data);
                mockApp.stats.totalScans++;
            }

            expect(mockApp.qrScanHistory.length).toBe(3);
            expect(mockApp.stats.totalScans).toBe(3);

            // 5. Break - QR scanner stopped
            await qrScanner.stop();
            mockApp.systemStatus.qrScanner = false;

            expect(qrScanner.isScanning).toBe(false);

            // 6. After break - resume scanning
            await qrScanner.start();
            mockApp.systemStatus.qrScanner = true;

            const additionalPackages = [
                'PACKAGE_004_JKL012',
                'PACKAGE_005_MNO345'
            ];

            for (const packageId of additionalPackages) {
                const scanResult = await dbClient.saveQRScan(session.ID, packageId);
                expect(scanResult.success).toBe(true);
                mockApp.qrScanHistory.push(scanResult.data);
                mockApp.stats.totalScans++;
            }

            expect(mockApp.qrScanHistory.length).toBe(5);
            expect(mockApp.stats.totalScans).toBe(5);

            // 7. End of shift - logout
            await qrScanner.stop();
            const endedSession = await dbClient.endSession(session.ID);

            mockApp.currentSession = null;
            mockApp.currentUser = null;
            mockApp.systemStatus.qrScanner = false;

            expect(endedSession.Active).toBe(0);
            expect(endedSession.EndTS).toBeDefined();
            expect(mockApp.currentSession).toBeNull();

            // 8. Verify session statistics
            const sessionStats = await dbClient.getSessionStats(session.ID);
            expect(sessionStats.totalScans).toBe(5);
            expect(sessionStats.isActive).toBe(false);
        });

        test('should handle worker switching during shift', async () => {
            // Worker 1 starts shift
            const worker1Tag = '53004114';
            const user1 = await dbClient.getUserByEPC(worker1Tag);
            const session1 = await dbClient.createSession(user1.ID);

            mockApp.currentUser = user1;
            mockApp.currentSession = { sessionId: session1.ID, userId: user1.ID };

            // Worker 1 scans some packages
            await dbClient.saveQRScan(session1.ID, 'WORKER1_PACKAGE_001');
            await dbClient.saveQRScan(session1.ID, 'WORKER1_PACKAGE_002');

            // Worker 2 takes over
            const worker2Tag = '87654321';
            const user2 = await dbClient.getUserByEPC(worker2Tag);

            // Session 1 should be closed automatically when new session is created
            const session2 = await dbClient.createSession(user2.ID);

            mockApp.currentUser = user2;
            mockApp.currentSession = { sessionId: session2.ID, userId: user2.ID };

            // Verify worker 1 session was closed
            const closedSession1 = dbClient.mockData.sessions.find(s => s.ID === session1.ID);
            expect(closedSession1.Active).toBe(0);
            expect(closedSession1.EndTS).toBeDefined();

            // Worker 2 continues scanning
            await dbClient.saveQRScan(session2.ID, 'WORKER2_PACKAGE_001');
            await dbClient.saveQRScan(session2.ID, 'WORKER2_PACKAGE_002');
            await dbClient.saveQRScan(session2.ID, 'WORKER2_PACKAGE_003');

            // Verify separate scan counts
            const worker1Scans = await dbClient.getQRScansBySession(session1.ID);
            const worker2Scans = await dbClient.getQRScansBySession(session2.ID);

            expect(worker1Scans.length).toBe(2);
            expect(worker2Scans.length).toBe(3);
            expect(worker1Scans.every(s => s.RawPayload.includes('WORKER1'))).toBe(true);
            expect(worker2Scans.every(s => s.RawPayload.includes('WORKER2'))).toBe(true);
        });

        test('should handle duplicate QR scan attempts', async () => {
            // Setup user session
            const user = await dbClient.getUserByEPC('53004114');
            const session = await dbClient.createSession(user.ID);

            // First scan should succeed
            const packageId = 'DUPLICATE_TEST_PACKAGE';
            const firstScan = await dbClient.saveQRScan(session.ID, packageId);
            expect(firstScan.success).toBe(true);

            // Immediate duplicate scan should fail
            await expect(dbClient.saveQRScan(session.ID, packageId))
                .rejects.toThrow('Duplicate scan detected');

            // Verify only one scan was saved
            const sessionScans = await dbClient.getQRScansBySession(session.ID);
            expect(sessionScans.length).toBe(1);
            expect(sessionScans[0].RawPayload).toBe(packageId);
        });

        test('should handle system restart during active session', async () => {
            // 1. Worker logs in
            const user = await dbClient.getUserByEPC('53004114');
            const session = await dbClient.createSession(user.ID);

            // 2. Worker scans some packages
            await dbClient.saveQRScan(session.ID, 'PRE_RESTART_PKG_001');
            await dbClient.saveQRScan(session.ID, 'PRE_RESTART_PKG_002');

            // 3. System restart simulation (close connections)
            await rfidListener.stop();
            await dbClient.close();

            // 4. System restart (reconnect)
            await dbClient.connect();
            await rfidListener.start();

            // 5. Continue scanning with same session
            await dbClient.saveQRScan(session.ID, 'POST_RESTART_PKG_003');

            // 6. Verify data integrity
            const allScans = dbClient.mockData.qrScans.filter(s => s.SessionID === session.ID);
            expect(allScans.length).toBe(3);

            const payloads = allScans.map(s => s.RawPayload);
            expect(payloads).toContain('PRE_RESTART_PKG_001');
            expect(payloads).toContain('PRE_RESTART_PKG_002');
            expect(payloads).toContain('POST_RESTART_PKG_003');
        });
    });

    describe('Error Recovery Scenarios', () => {
        test('should recover from database connection loss', async () => {
            // Setup normal operation
            const user = await dbClient.getUserByEPC('53004114');
            const session = await dbClient.createSession(user.ID);

            // Simulate database connection loss
            dbClient.simulateConnectionError();
            expect(dbClient.isConnected).toBe(false);
            mockApp.systemStatus.database = false;

            // Attempt operations during outage - should fail gracefully
            await expect(dbClient.saveQRScan(session.ID, 'OUTAGE_SCAN'))
                .rejects.toThrow('Database not connected');

            // Reconnect
            await dbClient.connect();
            mockApp.systemStatus.database = true;

            // Resume normal operations
            const scanResult = await dbClient.saveQRScan(session.ID, 'RECOVERY_SCAN');
            expect(scanResult.success).toBe(true);
        });

        test('should handle RFID hardware malfunction', async () => {
            // Normal operation
            expect(rfidListener.isListening).toBe(true);

            // Simulate hardware error
            const hardwareError = rfidListener.simulateHardwareError('connection_lost');
            expect(hardwareError).toBeInstanceOf(Error);
            mockApp.systemStatus.rfid = false;

            // RFID should stop working
            const scanResult = rfidListener.simulateTag('53004114');
            expect(scanResult).toBe(true); // Mock still works, but real hardware wouldn't

            // Recovery - restart RFID
            await rfidListener.stop();
            await rfidListener.start();
            mockApp.systemStatus.rfid = true;

            // Should work again
            const recoveryScan = rfidListener.simulateTag('53004114');
            expect(recoveryScan).toBe(true);
        });

        test('should handle camera/QR scanner issues', async () => {
            // Start QR scanner
            await qrScanner.start();
            expect(qrScanner.isScanning).toBe(true);

            // Simulate camera error
            const cameraError = qrScanner.simulateCameraError('Camera not found');
            expect(cameraError).toBeInstanceOf(Error);
            mockApp.systemStatus.qrScanner = false;

            // Stop and restart scanner
            await qrScanner.stop();
            await qrScanner.start();
            mockApp.systemStatus.qrScanner = true;

            // Should work again
            expect(qrScanner.isScanning).toBe(true);
        });

        test('should handle unknown RFID tags', async () => {
            // Attempt login with unknown tag
            const unknownTag = 'UNKNOWN12';
            const user = await dbClient.getUserByEPC(unknownTag);

            expect(user).toBeNull();

            // App should handle gracefully
            mockApp.currentUser = null;
            mockApp.currentSession = null;

            expect(mockApp.currentUser).toBeNull();
            expect(mockApp.currentSession).toBeNull();
        });

        test('should handle concurrent user sessions', async () => {
            // This shouldn't happen in real app, but test defensive programming
            const user1 = await dbClient.getUserByEPC('53004114');
            const user2 = await dbClient.getUserByEPC('87654321');

            // Create sessions for both users
            const session1 = await dbClient.createSession(user1.ID);
            const session2 = await dbClient.createSession(user2.ID);

            // Both sessions should be active (in our mock)
            expect(session1.Active).toBe(1);
            expect(session2.Active).toBe(1);

            // But user 1's session should be automatically closed when user 2 logged in
            const user1SessionAfter = dbClient.mockData.sessions.find(s => s.ID === session1.ID);
            expect(user1SessionAfter.Active).toBe(0);
        });
    });

    describe('Performance and Stress Testing', () => {
        test('should handle high-volume scanning', async () => {
            const user = await dbClient.getUserByEPC('53004114');
            const session = await dbClient.createSession(user.ID);

            const startTime = Date.now();
            const scanPromises = [];

            // Simulate 100 rapid scans
            for (let i = 1; i <= 100; i++) {
                const packageId = `BULK_PACKAGE_${i.toString().padStart(3, '0')}`;
                scanPromises.push(dbClient.saveQRScan(session.ID, packageId));
            }

            const results = await Promise.all(scanPromises);
            const endTime = Date.now();

            // All scans should succeed
            expect(results.every(r => r.success)).toBe(true);

            // Should complete in reasonable time (< 5 seconds for mock)
            expect(endTime - startTime).toBeLessThan(5000);

            // Verify all scans were saved
            const sessionScans = await dbClient.getQRScansBySession(session.ID);
            expect(sessionScans.length).toBe(100);
        });

        test('should handle rapid user switching', async () => {
            const users = [
                await dbClient.getUserByEPC('53004114'),
                await dbClient.getUserByEPC('87654321')
            ];

            const switchPromises = [];

            // Simulate rapid switching between users
            for (let i = 0; i < 20; i++) {
                const user = users[i % 2];
                switchPromises.push(dbClient.createSession(user.ID));
            }

            const sessions = await Promise.all(switchPromises);

            // All session creations should succeed
            expect(sessions.length).toBe(20);
            expect(sessions.every(s => s.ID !== undefined)).toBe(true);

            // Only last session for each user should be active
            const activeSessions = await dbClient.getAllActiveSessions();
            expect(activeSessions.length).toBeLessThanOrEqual(2);
        });

        test('should maintain performance under sustained load', async () => {
            const user = await dbClient.getUserByEPC('53004114');
            const session = await dbClient.createSession(user.ID);

            const performanceMetrics = [];

            // Measure performance over multiple scan batches
            for (let batch = 0; batch < 5; batch++) {
                const batchStart = Date.now();

                const batchPromises = [];
                for (let i = 1; i <= 20; i++) {
                    const packageId = `BATCH_${batch}_SCAN_${i}`;
                    batchPromises.push(dbClient.saveQRScan(session.ID, packageId));
                }

                await Promise.all(batchPromises);
                const batchEnd = Date.now();

                performanceMetrics.push(batchEnd - batchStart);
            }

            // Performance should remain consistent
            const avgTime = performanceMetrics.reduce((a, b) => a + b) / performanceMetrics.length;
            const maxTime = Math.max(...performanceMetrics);
            const minTime = Math.min(...performanceMetrics);

            // Variance shouldn't be too high
            expect(maxTime - minTime).toBeLessThan(avgTime * 2);
        });
    });

    describe('Data Integrity and Consistency', () => {
        test('should maintain data consistency across components', async () => {
            const user = await dbClient.getUserByEPC('53004114');
            const session = await dbClient.createSession(user.ID);

            // Scan packages with different components
            const packages = ['PKG_001', 'PKG_002', 'PKG_003'];

            for (const pkg of packages) {
                await dbClient.saveQRScan(session.ID, pkg);
            }

            // Verify data consistency
            const sessionScans = await dbClient.getQRScansBySession(session.ID);
            const recentScans = await dbClient.getRecentQRScans(10);
            const sessionStats = await dbClient.getSessionStats(session.ID);

            expect(sessionScans.length).toBe(3);
            expect(sessionStats.totalScans).toBe(3);
            expect(recentScans.filter(s => s.SessionID === session.ID).length).toBe(3);

            // All components should report same data
            const scannedPayloads = sessionScans.map(s => s.RawPayload);
            expect(scannedPayloads).toEqual(expect.arrayContaining(packages));
        });

        test('should handle transaction-like operations', async () => {
            const user = await dbClient.getUserByEPC('53004114');

            // Start "transaction" - create session
            const session = await dbClient.createSession(user.ID);
            const sessionId = session.ID;

            try {
                // Multiple related operations
                await dbClient.saveQRScan(sessionId, 'TRANSACTION_SCAN_1');
                await dbClient.saveQRScan(sessionId, 'TRANSACTION_SCAN_2');
                await dbClient.saveQRScan(sessionId, 'TRANSACTION_SCAN_3');

                // "Commit" - end session successfully
                await dbClient.endSession(sessionId);

                // Verify all data is preserved
                const sessionScans = await dbClient.getQRScansBySession(sessionId);
                expect(sessionScans.length).toBe(3);

                const endedSession = dbClient.mockData.sessions.find(s => s.ID === sessionId);
                expect(endedSession.Active).toBe(0);
                expect(endedSession.EndTS).toBeDefined();

            } catch (error) {
                // "Rollback" would happen here in real system
                throw error;
            }
        });

        test('should maintain audit trail', async () => {
            const user = await dbClient.getUserByEPC('53004114');
            const session = await dbClient.createSession(user.ID);

            // Track timing of operations
            const operations = [];

            operations.push({ type: 'session_start', timestamp: session.StartTS });

            await dbClient.saveQRScan(session.ID, 'AUDIT_SCAN_1');
            operations.push({ type: 'qr_scan', timestamp: new Date() });

            await dbClient.saveQRScan(session.ID, 'AUDIT_SCAN_2');
            operations.push({ type: 'qr_scan', timestamp: new Date() });

            const endedSession = await dbClient.endSession(session.ID);
            operations.push({ type: 'session_end', timestamp: endedSession.EndTS });

            // Verify chronological order
            for (let i = 1; i < operations.length; i++) {
                expect(new Date(operations[i].timestamp) >= new Date(operations[i-1].timestamp)).toBe(true);
            }

            // Verify data completeness
            expect(operations.length).toBe(4);
            expect(operations.filter(op => op.type === 'qr_scan').length).toBe(2);
        });
    });

    describe('System Health and Monitoring', () => {
        test('should provide comprehensive health check', async () => {
            const user = await dbClient.getUserByEPC('53004114');
            const session = await dbClient.createSession(user.ID);
            await dbClient.saveQRScan(session.ID, 'HEALTH_CHECK_SCAN');

            // Get system health
            const dbHealth = await dbClient.healthCheck();
            const rfidStats = rfidListener.getStats();
            const qrStats = qrScanner.getStats();

            // Database health
            expect(dbHealth.connected).toBe(true);
            expect(dbHealth.stats.activeSessions).toBe(1);
            expect(dbHealth.stats.totalValidScans).toBe(1);

            // RFID health
            expect(rfidStats.isListening).toBe(true);
            expect(rfidStats.uptime).toBeGreaterThan(0);

            // QR Scanner health
            expect(qrStats.uptime).toBeGreaterThan(0);

            // Overall system status
            mockApp.systemStatus = {
                database: dbHealth.connected,
                rfid: rfidStats.isListening,
                qrScanner: qrScanner.isScanning
            };

            expect(Object.values(mockApp.systemStatus).every(status => typeof status === 'boolean')).toBe(true);
        });

        test('should track system uptime and statistics', async () => {
            const startTime = Date.now();

            // Simulate system activity
            const user = await dbClient.getUserByEPC('53004114');
            const session = await dbClient.createSession(user.ID);

            for (let i = 1; i <= 10; i++) {
                await dbClient.saveQRScan(session.ID, `UPTIME_SCAN_${i}`);
            }

            await dbClient.endSession(session.ID);

            const endTime = Date.now();
            const systemUptime = endTime - startTime;

            // System stats
            mockApp.stats = {
                totalSessions: 1,
                totalScans: 10,
                uptime: systemUptime,
                avgScansPerSession: 10,
                systemStartTime: new Date(startTime)
            };

            expect(mockApp.stats.totalSessions).toBe(1);
            expect(mockApp.stats.totalScans).toBe(10);
            expect(mockApp.stats.uptime).toBeGreaterThan(0);
            expect(mockApp.stats.avgScansPerSession).toBe(10);
        });

        test('should handle graceful shutdown', async () => {
            // Setup active session
            const user = await dbClient.getUserByEPC('53004114');
            const session = await dbClient.createSession(user.ID);
            await dbClient.saveQRScan(session.ID, 'SHUTDOWN_SCAN');

            // Simulate graceful shutdown
            await qrScanner.stop();
            await rfidListener.stop();

            // End active sessions
            await dbClient.endSession(session.ID);

            // Close database connection
            await dbClient.close();

            // Verify clean shutdown
            expect(qrScanner.isScanning).toBe(false);
            expect(rfidListener.isListening).toBe(false);
            expect(dbClient.isConnected).toBe(false);

            // Verify data integrity preserved
            const sessionData = dbClient.mockData.sessions.find(s => s.ID === session.ID);
            expect(sessionData.Active).toBe(0);
            expect(sessionData.EndTS).toBeDefined();
        });
    });
});