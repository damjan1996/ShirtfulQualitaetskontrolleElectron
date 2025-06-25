// tests/integrations/complete-workflow.test.js
/**
 * Complete Application Workflow Tests - Korrigiert
 * End-to-End Tests für den gesamten Anwendungsablauf
 */

const MockRFIDListener = require('../mocks/rfid-listener.mock');
const MockDatabaseClient = require('../mocks/db-client.mock');

describe('Complete Application Workflow', () => {
    let rfidListener;
    let dbClient;
    let mockCamera;

    beforeEach(async () => {
        // Setup global mocks
        global.mockElectron = {
            globalShortcut: {
                shortcuts: new Map(),
                register: jest.fn(() => true),
                unregister: jest.fn(() => true),
                unregisterAll: jest.fn()
            }
        };

        // Mock camera/QR scanner
        mockCamera = {
            isActive: false,
            scanning: false,

            start: jest.fn(async () => {
                mockCamera.isActive = true;
                return Promise.resolve();
            }),

            stop: jest.fn(async () => {
                mockCamera.isActive = false;
                mockCamera.scanning = false;
                return Promise.resolve();
            }),

            startScanning: jest.fn(() => {
                if (!mockCamera.isActive) throw new Error('Camera not active');
                mockCamera.scanning = true;
            }),

            stopScanning: jest.fn(() => {
                mockCamera.scanning = false;
            }),

            simulateScan: jest.fn((qrCode) => {
                if (!mockCamera.scanning) throw new Error('Scanner not active');
                return Promise.resolve(qrCode);
            })
        };

        rfidListener = new MockRFIDListener();
        rfidListener.updateConfig({ debugMode: false });
        rfidListener.disableHardwareError();

        dbClient = new MockDatabaseClient();
        await dbClient.connect();
        dbClient.clearMockData();
    });

    afterEach(async () => {
        if (rfidListener && rfidListener.isRunning) {
            await rfidListener.destroy();
        }
        if (dbClient && dbClient.isConnected) {
            await dbClient.close();
        }
        if (mockCamera.isActive) {
            await mockCamera.stop();
        }
        jest.clearAllMocks();
    });

    describe('Single Worker Workflow', () => {
        test('should complete full workflow: login -> scan -> logout', async () => {
            // 1. Start systems
            await rfidListener.start();
            await mockCamera.start();

            // 2. Worker scans RFID for login
            const loginDetected = new Promise((resolve) => {
                rfidListener.on('tag-detected', resolve);
            });

            await rfidListener.simulateTag('329C172'); // User 1
            const loginData = await loginDetected;

            expect(loginData.tagId).toBe('329C172');

            // 3. System looks up user and creates session
            const user = await dbClient.getUserByRFID(loginData.tagId);
            expect(user).toBeDefined();
            expect(user.BenID).toBe(1);

            const session = await dbClient.createSession(user.BenID);
            expect(session).toBeDefined();
            expect(session.Active).toBe(1);

            // 4. Worker scans QR codes
            mockCamera.startScanning();

            const packageIds = ['PKG001', 'PKG002', 'PKG003'];
            const scanResults = [];

            for (const packageId of packageIds) {
                const qrCode = await mockCamera.simulateScan(packageId);
                const scanResult = await dbClient.saveQRScan(session.ID, qrCode);
                scanResults.push(scanResult);
            }

            // Verify all scans successful
            expect(scanResults.every(r => r.success)).toBe(true);

            // 5. Verify scans in database
            const scans = await dbClient.getQRScansBySession(session.ID);
            expect(scans.length).toBe(3);

            const scannedPackages = scans.map(s => s.RawPayload);
            packageIds.forEach(pkg => {
                expect(scannedPackages).toContain(pkg);
            });

            // 6. Worker scans RFID again to logout
            const logoutSession = await dbClient.createSession(user.BenID); // This closes previous session

            // Verify old session was closed
            const closedSession = dbClient.mockData.sessions.find(s => s.ID === session.ID);
            expect(closedSession.Active).toBe(0);
            expect(closedSession.EndTS).toBeDefined();

            // Verify new session is active
            expect(logoutSession.Active).toBe(1);
            expect(logoutSession.ID).not.toBe(session.ID);
        });

        test('should handle QR scanning session', async () => {
            await rfidListener.start();
            await mockCamera.start();

            // Login
            await rfidListener.simulateTag('329C172');
            const user = await dbClient.getUserByRFID('329C172');
            const session = await dbClient.createSession(user.BenID);

            // Start QR scanning
            mockCamera.startScanning();

            // Scan multiple QR codes with different formats
            const qrCodes = [
                'SIMPLE_BARCODE_123',
                '{"type":"package","id":"PKG001","weight":2.5}',
                'http://track.example.com/package/ABC123',
                '1^126644896^25000580^010010277918^6^2802-834'
            ];

            const results = [];
            for (const qrCode of qrCodes) {
                const scanned = await mockCamera.simulateScan(qrCode);
                const result = await dbClient.saveQRScan(session.ID, scanned);
                results.push(result);
            }

            // Verify all successful
            expect(results.every(r => r.success)).toBe(true);

            // Verify different payload types handled correctly
            const scans = await dbClient.getQRScansBySession(session.ID);
            expect(scans.length).toBe(4);

            // Check JSON payload was parsed
            const jsonScan = scans.find(s => s.RawPayload.includes('package'));
            expect(jsonScan.PayloadAsJSON).toBeDefined();
            expect(jsonScan.PayloadAsJSON.type).toBe('package');

            // Check non-JSON payload
            const simpleScan = scans.find(s => s.RawPayload === 'SIMPLE_BARCODE_123');
            expect(simpleScan.PayloadAsJSON).toBeNull();
        });
    });

    describe('Multi-Worker Scenarios', () => {
        test('should handle multiple workers simultaneously', async () => {
            await rfidListener.start();
            await mockCamera.start();

            // Worker 1 login
            await rfidListener.simulateTag('329C172'); // User 1
            const user1 = await dbClient.getUserByRFID('329C172');
            const session1 = await dbClient.createSession(user1.BenID);

            // Worker 2 login
            await rfidListener.simulateTag('329C173'); // User 2
            const user2 = await dbClient.getUserByRFID('329C173');
            const session2 = await dbClient.createSession(user2.BenID);

            // Both sessions should be active
            expect(session1.Active).toBe(1);
            expect(session2.Active).toBe(1);

            // Start scanning
            mockCamera.startScanning();

            // Both workers scan packages
            const worker1Packages = ['W1_PKG001', 'W1_PKG002'];
            const worker2Packages = ['W2_PKG001', 'W2_PKG002'];

            // Worker 1 scans
            for (const pkg of worker1Packages) {
                const qrCode = await mockCamera.simulateScan(pkg);
                const result = await dbClient.saveQRScan(session1.ID, qrCode);
                expect(result.success).toBe(true);
            }

            // Worker 2 scans
            for (const pkg of worker2Packages) {
                const qrCode = await mockCamera.simulateScan(pkg);
                const result = await dbClient.saveQRScan(session2.ID, qrCode);
                expect(result.success).toBe(true);
            }

            // Verify scans are properly separated
            const scans1 = await dbClient.getQRScansBySession(session1.ID);
            const scans2 = await dbClient.getQRScansBySession(session2.ID);

            expect(scans1.length).toBe(2);
            expect(scans2.length).toBe(2);

            expect(scans1.every(s => s.RawPayload.startsWith('W1_'))).toBe(true);
            expect(scans2.every(s => s.RawPayload.startsWith('W2_'))).toBe(true);
        });

        test('should handle worker switching during shift', async () => {
            await rfidListener.start();
            await mockCamera.start();

            // Worker 1 starts shift
            await rfidListener.simulateTag('329C172');
            const user1 = await dbClient.getUserByRFID('329C172');
            const session1 = await dbClient.createSession(user1.BenID);

            // Worker 1 scans some packages
            mockCamera.startScanning();
            await mockCamera.simulateScan('BEFORE_SWITCH_001');
            await dbClient.saveQRScan(session1.ID, 'BEFORE_SWITCH_001');

            // Worker 2 takes over (Worker 1 scans out, Worker 2 scans in)
            const newSession1 = await dbClient.createSession(user1.BenID); // Worker 1 logout

            // Verify worker 1 session was closed
            const closedSession1 = dbClient.mockData.sessions.find(s => s.ID === session1.ID);
            expect(closedSession1.Active).toBe(0);
            expect(closedSession1.EndTS).toBeDefined();

            // Worker 2 continues scanning
            await rfidListener.simulateTag('329C173');
            const user2 = await dbClient.getUserByRFID('329C173');
            const session2 = await dbClient.createSession(user2.BenID);

            await mockCamera.simulateScan('AFTER_SWITCH_001');
            const result = await dbClient.saveQRScan(session2.ID, 'AFTER_SWITCH_001');
            expect(result.success).toBe(true);

            // Verify data integrity
            const scans1 = await dbClient.getQRScansBySession(session1.ID);
            const scans2 = await dbClient.getQRScansBySession(session2.ID);

            expect(scans1.length).toBe(1);
            expect(scans1[0].RawPayload).toBe('BEFORE_SWITCH_001');

            expect(scans2.length).toBe(1);
            expect(scans2[0].RawPayload).toBe('AFTER_SWITCH_001');
        });
    });

    describe('Complete Worker Shift Workflow', () => {
        test('should handle full 8-hour shift simulation', async () => {
            await rfidListener.start();
            await mockCamera.start();

            // Start of shift - worker login
            await rfidListener.simulateTag('329C172');
            const user = await dbClient.getUserByRFID('329C172');
            const session = await dbClient.createSession(user.BenID);

            const startTime = new Date(session.StartTS);

            // Simulate continuous work throughout shift
            mockCamera.startScanning();

            const packagesPerHour = 50;
            const hours = 3; // Simulate 3 hours for faster test
            const totalPackages = packagesPerHour * hours;

            const scanResults = [];

            for (let i = 1; i <= totalPackages; i++) {
                const packageId = `SHIFT_PKG_${i.toString().padStart(4, '0')}`;
                const qrCode = await mockCamera.simulateScan(packageId);
                const result = await dbClient.saveQRScan(session.ID, qrCode);
                scanResults.push(result);

                // Simulate some processing time
                if (i % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }

            // Verify all scans successful
            const successfulScans = scanResults.filter(r => r.success);
            expect(successfulScans.length).toBe(totalPackages);

            // End of shift - worker logout
            await dbClient.endSession(session.ID);

            // Verify session data
            const finalSession = dbClient.mockData.sessions.find(s => s.ID === session.ID);
            expect(finalSession.Active).toBe(0);
            expect(finalSession.EndTS).toBeDefined();

            const endTime = new Date(finalSession.EndTS);
            const shiftDuration = endTime - startTime;
            expect(shiftDuration).toBeGreaterThan(0);

            // Verify all scans recorded
            const allScans = await dbClient.getQRScansBySession(session.ID);
            expect(allScans.length).toBe(totalPackages);
        });

        test('should handle duplicate QR scan attempts', async () => {
            await rfidListener.start();
            await mockCamera.start();

            // Setup session
            await rfidListener.simulateTag('329C172');
            const user = await dbClient.getUserByRFID('329C172');
            const session = await dbClient.createSession(user.BenID);

            mockCamera.startScanning();

            // First scan should succeed
            const packageId = 'DUPLICATE_TEST_PKG_001';
            await mockCamera.simulateScan(packageId);
            const firstScan = await dbClient.saveQRScan(session.ID, packageId);
            expect(firstScan.success).toBe(true);

            // Immediate duplicate scan should fail - returns result, doesn't throw
            const duplicateScan = await dbClient.saveQRScan(session.ID, packageId);
            expect(duplicateScan.success).toBe(false);
            expect(duplicateScan.status).toContain('duplicate');

            // Verify only one scan was saved
            const scans = await dbClient.getQRScansBySession(session.ID);
            expect(scans.length).toBe(1);
        });
    });

    describe('Error Recovery Scenarios', () => {
        test('should handle RFID hardware malfunction', (done) => {
            rfidListener.start().then(() => {
                // Setup error handler
                rfidListener.on('error', (error) => {
                    expect(error).toBeInstanceOf(Error);
                    expect(error.type).toBe('connection_lost');

                    // System should still be running but in error state
                    expect(rfidListener.isRunning).toBe(true);
                    done();
                });

                // Simulate hardware error
                rfidListener.simulateHardwareError('connection_lost');
            });
        });

        test('should handle camera/QR scanner issues', async () => {
            await rfidListener.start();

            // Setup session
            await rfidListener.simulateTag('329C172');
            const user = await dbClient.getUserByRFID('329C172');
            const session = await dbClient.createSession(user.BenID);

            // Camera fails to start
            mockCamera.start = jest.fn().mockRejectedValue(new Error('Camera hardware error'));

            await expect(mockCamera.start()).rejects.toThrow('Camera hardware error');

            // But RFID and database should still work
            expect(rfidListener.isRunning).toBe(true);
            expect(dbClient.isConnected).toBe(true);

            // Manual QR entry should still work
            const manualResult = await dbClient.saveQRScan(session.ID, 'MANUAL_ENTRY_001');
            expect(manualResult.success).toBe(true);
        });

        test('should handle database connection loss', async () => {
            await rfidListener.start();
            await mockCamera.start();

            // Setup initial state
            await rfidListener.simulateTag('329C172');
            const user = await dbClient.getUserByRFID('329C172');
            const session = await dbClient.createSession(user.BenID);

            // Simulate database disconnection
            await dbClient.close();

            // RFID should still work
            expect(rfidListener.isRunning).toBe(true);

            // But database operations should fail
            await expect(dbClient.saveQRScan(session.ID, 'AFTER_DB_LOSS')).rejects.toThrow('Database not connected');

            // Reconnection should work
            await dbClient.connect();
            const reconnectResult = await dbClient.saveQRScan(session.ID, 'AFTER_RECONNECT');
            expect(reconnectResult.success).toBe(true);
        });

        test('should handle system restart scenario', async () => {
            // Initial system state
            await rfidListener.start();
            await mockCamera.start();

            await rfidListener.simulateTag('329C172');
            const user = await dbClient.getUserByRFID('329C172');
            const session = await dbClient.createSession(user.BenID);

            // Save some data
            await dbClient.saveQRScan(session.ID, 'BEFORE_RESTART');

            // Simulate system shutdown
            await rfidListener.destroy();
            await mockCamera.stop();
            await dbClient.close();

            // Simulate system restart
            rfidListener = new MockRFIDListener();
            rfidListener.updateConfig({ debugMode: false });
            rfidListener.disableHardwareError();

            dbClient = new MockDatabaseClient();
            await dbClient.connect();

            await rfidListener.start();
            await mockCamera.start();

            // Data should be preserved (in real app, would be in persistent database)
            // For mock, we simulate data recovery
            dbClient.mockData.sessions = [session];
            dbClient.mockData.qrScans = [{
                ID: 1,
                SessionID: session.ID,
                RawPayload: 'BEFORE_RESTART',
                CapturedTS: new Date()
            }];

            // System should be operational
            const scans = await dbClient.getQRScansBySession(session.ID);
            expect(scans.length).toBe(1);
            expect(scans[0].RawPayload).toBe('BEFORE_RESTART');

            // New operations should work
            const newResult = await dbClient.saveQRScan(session.ID, 'AFTER_RESTART');
            expect(newResult.success).toBe(true);
        });
    });

    describe('Performance Under Load', () => {
        test('should handle high-frequency RFID scans', async () => {
            await rfidListener.start();

            const scanCount = 100;
            const scanPromises = [];

            const startTime = Date.now();

            for (let i = 0; i < scanCount; i++) {
                const tag = (i % 3 === 0) ? '329C172' : (i % 3 === 1) ? '329C173' : '329C174';
                scanPromises.push(rfidListener.simulateTag(tag));
            }

            await Promise.all(scanPromises);

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(rfidListener.stats.totalScans).toBe(scanCount);
            expect(rfidListener.stats.validScans).toBe(scanCount);
            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

            // Performance should be acceptable
            const avgTime = duration / scanCount;
            expect(avgTime).toBeLessThan(50); // Less than 50ms per scan on average
        });

        test('should handle concurrent QR scanning', async () => {
            await rfidListener.start();
            await mockCamera.start();

            // Setup multiple sessions
            const sessions = [];
            for (let i = 1; i <= 3; i++) {
                const tagId = `329C17${i}`;
                await rfidListener.simulateTag(tagId);
                const user = await dbClient.getUserByRFID(tagId);
                const session = await dbClient.createSession(user.BenID);
                sessions.push(session);
            }

            mockCamera.startScanning();

            // Concurrent scanning across all sessions
            const allScanPromises = [];

            for (let i = 0; i < 50; i++) {
                const sessionIndex = i % sessions.length;
                const session = sessions[sessionIndex];
                const packageId = `CONCURRENT_${sessionIndex}_${i}`;

                const promise = mockCamera.simulateScan(packageId)
                    .then(qrCode => dbClient.saveQRScan(session.ID, qrCode));

                allScanPromises.push(promise);
            }

            const results = await Promise.all(allScanPromises);

            // All scans should succeed
            expect(results.every(r => r.success)).toBe(true);

            // Verify proper distribution
            for (const session of sessions) {
                const scans = await dbClient.getQRScansBySession(session.ID);
                expect(scans.length).toBeGreaterThan(15); // Roughly 50/3
            }
        });
    });
});