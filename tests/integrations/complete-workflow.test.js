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
            },
            ipcMain: {
                handlers: new Map(),
                handle: jest.fn(),
                removeHandler: jest.fn()
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

        // Sicherstellen, dass Test-User in der Mock-DB existieren
        dbClient.mockData.users = [
            {
                BenID: 1,
                EPC: '329C172',
                BenutzerName: 'Test User 1',
                Email: 'user1@test.com',
                Active: 1
            },
            {
                BenID: 2,
                EPC: '329C173',
                BenutzerName: 'Test User 2',
                Email: 'user2@test.com',
                Active: 1
            },
            {
                BenID: 3,
                EPC: '329C174',
                BenutzerName: 'Test User 3',
                Email: 'user3@test.com',
                Active: 1
            },
            {
                BenID: 4,
                EPC: '329C175',
                BenutzerName: 'Test User 4',
                Email: 'user4@test.com',
                Active: 1
            }
        ];
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

            // 3. Database: Find user
            const user = await dbClient.getUserByRFID(loginData.tagId);
            expect(user).toBeDefined();
            expect(user).not.toBeNull();
            expect(user.BenID).toBe(1);

            const session = await dbClient.createSession(user.BenID);
            expect(session).toBeDefined();
            expect(session.UserID).toBe(user.BenID);
            expect(session.Active).toBe(1);

            // 4. Worker scans QR codes
            mockCamera.startScanning();

            const qrCodes = [
                'PKG_001_2024',
                'PKG_002_2024',
                'PKG_003_2024'
            ];

            for (const qrCode of qrCodes) {
                const scanResult = await mockCamera.simulateScan(qrCode);
                expect(scanResult).toBe(qrCode);

                const saveResult = await dbClient.saveQRScan(session.ID, qrCode);
                expect(saveResult.success).toBe(true);
            }

            // 5. Verify scans were saved
            const savedScans = await dbClient.getQRScansBySession(session.ID);
            expect(savedScans.length).toBe(3);
            expect(savedScans.map(s => s.RawPayload)).toEqual(qrCodes);

            // 6. Worker logs out
            await rfidListener.simulateTag('329C172'); // Same tag = logout
            const updatedSession = await dbClient.createSession(user.BenID); // This closes previous session

            // Verify previous session was closed
            const closedSession = dbClient.mockData.sessions.find(s => s.ID === session.ID);
            expect(closedSession.Active).toBe(0);
            expect(closedSession.EndTS).toBeDefined();

            // 7. Stop systems
            mockCamera.stopScanning();
            await mockCamera.stop();
            await rfidListener.stop();
        });

        test('should handle invalid RFID tag', async () => {
            await rfidListener.start();

            const loginDetected = new Promise((resolve) => {
                rfidListener.on('tag-detected', resolve);
            });

            await rfidListener.simulateTag('INVALID_TAG');
            const loginData = await loginDetected;

            const user = await dbClient.getUserByRFID(loginData.tagId);
            expect(user).toBeNull();
        });

        test('should prevent duplicate QR scans', async () => {
            // Setup user and session
            await rfidListener.start();
            await rfidListener.simulateTag('329C172');
            const user = await dbClient.getUserByRFID('329C172');
            expect(user).not.toBeNull();
            const session = await dbClient.createSession(user.BenID);

            // Try to scan same QR code twice
            const qrCode = 'DUPLICATE_TEST_001';

            const result1 = await dbClient.saveQRScan(session.ID, qrCode);
            expect(result1.success).toBe(true);

            const result2 = await dbClient.saveQRScan(session.ID, qrCode);
            expect(result2.success).toBe(false);
            expect(result2.error).toContain('bereits gescannt');
        });
    });

    describe('Multi-Worker Workflow', () => {
        test('should handle multiple workers simultaneously', async () => {
            await rfidListener.start();
            await mockCamera.start();

            // Worker 1 logs in
            await rfidListener.simulateTag('329C172');
            const user1 = await dbClient.getUserByRFID('329C172');
            expect(user1).not.toBeNull();
            const session1 = await dbClient.createSession(user1.BenID);

            // Worker 2 logs in
            await rfidListener.simulateTag('329C173');
            const user2 = await dbClient.getUserByRFID('329C173');
            expect(user2).not.toBeNull();
            const session2 = await dbClient.createSession(user2.BenID);

            // Both workers are active
            expect(session1.Active).toBe(1);
            expect(session2.Active).toBe(1);

            // Each worker scans different packages
            mockCamera.startScanning();

            await dbClient.saveQRScan(session1.ID, 'WORKER1_PKG_001');
            await dbClient.saveQRScan(session2.ID, 'WORKER2_PKG_001');
            await dbClient.saveQRScan(session1.ID, 'WORKER1_PKG_002');
            await dbClient.saveQRScan(session2.ID, 'WORKER2_PKG_002');

            // Verify separate tracking
            const scans1 = await dbClient.getQRScansBySession(session1.ID);
            const scans2 = await dbClient.getQRScansBySession(session2.ID);

            expect(scans1.length).toBe(2);
            expect(scans2.length).toBe(2);
            expect(scans1.every(s => s.RawPayload.includes('WORKER1'))).toBe(true);
            expect(scans2.every(s => s.RawPayload.includes('WORKER2'))).toBe(true);
        });

        test('should handle worker shift changes', async () => {
            await rfidListener.start();
            await mockCamera.start();

            // Worker 1 starts shift
            await rfidListener.simulateTag('329C172');
            const user1 = await dbClient.getUserByRFID('329C172');
            expect(user1).not.toBeNull();
            const session1 = await dbClient.createSession(user1.BenID);

            // Worker 1 scans some packages
            mockCamera.startScanning();
            await mockCamera.simulateScan('BEFORE_SWITCH_001');
            await dbClient.saveQRScan(session1.ID, 'BEFORE_SWITCH_001');

            // Worker 2 takes over (Worker 1 scans out, Worker 2 scans in)
            await rfidListener.simulateTag('329C172'); // Worker 1 logout

            // Verify worker 1 session was closed
            const closedSession1 = dbClient.mockData.sessions.find(s => s.ID === session1.ID);
            expect(closedSession1.Active).toBe(0);
            expect(closedSession1.EndTS).toBeDefined();

            // Worker 2 continues scanning
            await rfidListener.simulateTag('329C173');
            const user2 = await dbClient.getUserByRFID('329C173');
            expect(user2).not.toBeNull();
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
            expect(user).not.toBeNull();
            const session = await dbClient.createSession(user.BenID);

            const startTime = new Date(session.StartTS);

            // Simulate continuous work throughout shift
            mockCamera.startScanning();

            const packagesPerHour = 50;
            const hours = 3; // Simulate 3 hours for faster test
            const totalPackages = packagesPerHour * hours;

            const scanResults = [];

            for (let i = 1; i <= totalPackages; i++) {
                const packageId = `SHIFT_PKG_${String(i).padStart(4, '0')}`;
                await mockCamera.simulateScan(packageId);
                const result = await dbClient.saveQRScan(session.ID, packageId);
                scanResults.push(result);

                // Small delay to simulate realistic scanning
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Verify all scans were recorded
            expect(scanResults.every(r => r.success)).toBe(true);

            const allScans = await dbClient.getQRScansBySession(session.ID);
            expect(allScans.length).toBe(totalPackages);

            // End of shift - worker logout
            await rfidListener.simulateTag('329C172');

            // Verify session was closed
            const finalSession = dbClient.mockData.sessions.find(s => s.ID === session.ID);
            expect(finalSession.Active).toBe(0);
            expect(finalSession.EndTS).toBeDefined();

            const endTime = new Date(finalSession.EndTS);
            const shiftDuration = endTime - startTime;
            expect(shiftDuration).toBeGreaterThan(0);
        });

        test('should handle duplicate QR scan attempts', async () => {
            await rfidListener.start();
            await mockCamera.start();

            // Worker login
            await rfidListener.simulateTag('329C172');
            const user = await dbClient.getUserByRFID('329C172');
            expect(user).not.toBeNull();
            const session = await dbClient.createSession(user.BenID);

            mockCamera.startScanning();

            // Test duplicate prevention
            const testQR = 'DUPLICATE_TEST_QR_001';

            // First scan should succeed
            const result1 = await dbClient.saveQRScan(session.ID, testQR);
            expect(result1.success).toBe(true);

            // Immediate duplicate should fail
            const result2 = await dbClient.saveQRScan(session.ID, testQR);
            expect(result2.success).toBe(false);
            expect(result2.error).toContain('bereits gescannt');

            // Even after some time, duplicate should still fail
            await new Promise(resolve => setTimeout(resolve, 100));
            const result3 = await dbClient.saveQRScan(session.ID, testQR);
            expect(result3.success).toBe(false);

            // Different QR code should succeed
            const result4 = await dbClient.saveQRScan(session.ID, 'DIFFERENT_QR_001');
            expect(result4.success).toBe(true);
        });

        test('should handle system errors gracefully', async () => {
            await rfidListener.start();

            // Simulate database connection error
            dbClient.simulateError('connection', true);

            try {
                await dbClient.query('SELECT 1');
                fail('Should have thrown error');
            } catch (error) {
                expect(error.message).toContain('connection');
            }

            // Restore connection
            dbClient.simulateError('connection', false);

            // System should recover
            const healthCheck = await dbClient.healthCheck();
            expect(healthCheck).toBe(true);

            // Normal operations should resume
            await rfidListener.simulateTag('329C172');
            const user = await dbClient.getUserByRFID('329C172');
            expect(user).not.toBeNull();
            const session = await dbClient.createSession(user.BenID);
            expect(session).toBeDefined();
        });
    });

    describe('Error Recovery Scenarios', () => {
        test('should handle RFID reader disconnect and reconnect', async () => {
            await rfidListener.start();
            expect(rfidListener.isRunning).toBe(true);

            // Simulate hardware disconnect
            rfidListener.simulateHardwareError('disconnect');

            // Listener should handle error
            expect(rfidListener.stats.errors).toBeGreaterThan(0);

            // Disable error for recovery
            rfidListener.disableHardwareError();

            // Should be able to read tags again
            const tagDetected = new Promise(resolve => {
                rfidListener.once('tag-detected', resolve);
            });

            await rfidListener.simulateTag('329C172');
            const data = await tagDetected;
            expect(data.tagId).toBe('329C172');
        });

        test('should handle camera/scanner failures', async () => {
            await mockCamera.start();
            mockCamera.startScanning();

            // Simulate scanner error
            mockCamera.simulateScan = jest.fn(() => {
                throw new Error('Scanner hardware error');
            });

            // Should handle error gracefully
            await expect(mockCamera.simulateScan('TEST')).rejects.toThrow('Scanner hardware error');

            // Restore scanner
            mockCamera.simulateScan = jest.fn((qrCode) => Promise.resolve(qrCode));

            // Should work again
            const result = await mockCamera.simulateScan('RECOVERY_TEST');
            expect(result).toBe('RECOVERY_TEST');
        });

        test('should handle network/database interruptions', async () => {
            await dbClient.connect();

            // Start a session
            await rfidListener.start();
            await rfidListener.simulateTag('329C172');
            const user = await dbClient.getUserByRFID('329C172');
            expect(user).not.toBeNull();
            const session = await dbClient.createSession(user.BenID);

            // Simulate network error
            dbClient.simulateError('network', true);

            // Operations should fail
            const saveResult = await dbClient.saveQRScan(session.ID, 'TEST_QR');
            expect(saveResult.success).toBe(false);

            // Restore network
            dbClient.simulateError('network', false);

            // Operations should work again
            const retryResult = await dbClient.saveQRScan(session.ID, 'TEST_QR_RETRY');
            expect(retryResult.success).toBe(true);
        });
    });
});