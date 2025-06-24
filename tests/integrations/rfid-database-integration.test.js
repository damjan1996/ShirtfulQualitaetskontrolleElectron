// tests/integration/rfid-database-integration.test.js
/**
 * Integration Tests für RFID-Database Workflow
 */

const MockDatabaseClient = require('../mocks/db-client.mock');
const MockRFIDListener = require('../mocks/rfid-listener.mock');

describe('RFID-Database Integration', () => {
    let dbClient;
    let rfidListener;
    let mockMainApp;

    beforeEach(async () => {
        dbClient = new MockDatabaseClient();
        await dbClient.connect();

        mockMainApp = {
            currentSession: null,
            handleRFIDScan: jest.fn(),
            sendToRenderer: jest.fn()
        };

        rfidListener = new MockRFIDListener((tagId) => {
            mockMainApp.handleRFIDScan(tagId);
        });

        await rfidListener.start();
    });

    afterEach(async () => {
        if (rfidListener) await rfidListener.stop();
        if (dbClient) await dbClient.close();
    });

    describe('Complete Login Workflow', () => {
        test('should handle complete user login flow', async () => {
            const tagId = '53004114';

            // 1. RFID-Tag wird gescannt
            rfidListener.simulateTag(tagId);

            // 2. Main App verarbeitet den Scan
            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(tagId);

            // 3. Benutzer wird in DB gesucht
            const user = await dbClient.getUserByEPC(tagId);
            expect(user).toBeTruthy();
            expect(user.EPC).toBe(parseInt(tagId, 16));

            // 4. Session wird erstellt
            const session = await dbClient.createSession(user.ID);
            expect(session).toBeTruthy();
            expect(session.UserID).toBe(user.ID);
            expect(session.Active).toBe(1);

            // 5. Session wird im Main App gespeichert
            mockMainApp.currentSession = {
                sessionId: session.ID,
                userId: user.ID,
                startTime: session.StartTS
            };

            expect(mockMainApp.currentSession.userId).toBe(user.ID);
        });

        test('should handle user logout flow', async () => {
            const tagId = '53004114';
            const user = await dbClient.getUserByEPC(tagId);
            const session = await dbClient.createSession(user.ID);

            mockMainApp.currentSession = {
                sessionId: session.ID,
                userId: user.ID,
                startTime: session.StartTS
            };

            // Benutzer scannt Tag erneut für Logout
            rfidListener.simulateTag(tagId);
            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(tagId);

            // Session wird beendet
            const endResult = await dbClient.endSession(session.ID);
            expect(endResult).toBe(true);

            // Session wird aus Main App entfernt
            mockMainApp.currentSession = null;
            expect(mockMainApp.currentSession).toBeNull();
        });
    });

    describe('QR-Code Integration Workflow', () => {
        let sessionId;

        beforeEach(async () => {
            const user = await dbClient.getUserByEPC('53004114');
            const session = await dbClient.createSession(user.ID);
            sessionId = session.ID;
        });

        test('should handle complete QR scanning flow', async () => {
            const qrPayload = 'TEST_QR_PACKAGE_001';

            // 1. QR-Code wird gescannt
            const scanResult = await dbClient.saveQRScan(sessionId, qrPayload);

            // 2. Erfolgreich gespeichert
            expect(scanResult.success).toBe(true);
            expect(scanResult.status).toBe('saved');
            expect(scanResult.data.RawPayload).toBe(qrPayload);

            // 3. UI-Update simulieren
            mockMainApp.sendToRenderer('qr-scan-result', scanResult);
            expect(mockMainApp.sendToRenderer).toHaveBeenCalledWith('qr-scan-result', scanResult);
        });

        test('should handle QR duplicate detection workflow', async () => {
            const qrPayload = 'DUPLICATE_TEST_QR';

            // 1. Ersten QR-Code scannen
            const firstScan = await dbClient.saveQRScan(sessionId, qrPayload);
            expect(firstScan.success).toBe(true);

            // 2. Gleichen QR-Code erneut scannen
            const secondScan = await dbClient.saveQRScan(sessionId, qrPayload);
            expect(secondScan.success).toBe(false);
            expect(secondScan.status).toBe('duplicate_cache');

            // 3. UI zeigt Duplikat-Warnung
            mockMainApp.sendToRenderer('qr-scan-result', secondScan);
            expect(mockMainApp.sendToRenderer).toHaveBeenLastCalledWith('qr-scan-result', secondScan);
        });
    });

    describe('Session Management Integration', () => {
        test('should handle multiple users correctly', async () => {
            const user1TagId = '53004114';
            const user2TagId = '87654321';

            // User 1 login
            rfidListener.simulateTag(user1TagId);
            const user1 = await dbClient.getUserByEPC(user1TagId);
            const session1 = await dbClient.createSession(user1.ID);

            // User 2 login
            rfidListener.simulateTag(user2TagId);
            const user2 = await dbClient.getUserByEPC(user2TagId);
            const session2 = await dbClient.createSession(user2.ID);

            expect(user1.ID).not.toBe(user2.ID);
            expect(session1.ID).not.toBe(session2.ID);
            expect(session1.UserID).toBe(user1.ID);
            expect(session2.UserID).toBe(user2.ID);
        });

        test('should prevent multiple active sessions per user', async () => {
            const tagId = '53004114';
            const user = await dbClient.getUserByEPC(tagId);

            // Erste Session
            const session1 = await dbClient.createSession(user.ID);
            expect(session1.Active).toBe(1);

            // Zweite Session für gleichen User
            const session2 = await dbClient.createSession(user.ID);
            expect(session2.Active).toBe(1);

            // Erste Session sollte beendet werden (in echter App)
            await dbClient.endSession(session1.ID);

            // Nur eine aktive Session sollte existieren
            const activeSessions = dbClient.mockData.sessions.filter(s =>
                s.UserID === user.ID && s.Active === 1
            );
            expect(activeSessions.length).toBe(1);
        });
    });

    describe('Error Recovery Integration', () => {
        test('should handle database disconnection during scan', async () => {
            const tagId = '53004114';

            // Simuliere DB-Disconnection
            dbClient.isConnected = false;

            // RFID-Scan sollte weiterhin funktionieren
            rfidListener.simulateTag(tagId);
            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(tagId);

            // DB-Operation schlägt fehl
            await expect(dbClient.getUserByEPC(tagId)).rejects.toThrow();

            // Reconnection simulieren
            dbClient.isConnected = true;
            const user = await dbClient.getUserByEPC(tagId);
            expect(user).toBeTruthy();
        });

        test('should handle RFID listener restart', async () => {
            const tagId = '53004114';

            // Stoppe RFID Listener
            await rfidListener.stop();
            expect(rfidListener.isListening).toBe(false);

            // Restart
            await rfidListener.start();
            expect(rfidListener.isListening).toBe(true);

            // Scan sollte wieder funktionieren
            rfidListener.simulateTag(tagId);
            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(tagId);
        });
    });

    describe('Performance Integration', () => {
        test('should handle high-frequency scanning', async () => {
            const user = await dbClient.getUserByEPC('53004114');
            const session = await dbClient.createSession(user.ID);

            const scanPromises = [];
            const startTime = Date.now();

            // 50 QR-Codes in kurzer Zeit
            for (let i = 0; i < 50; i++) {
                scanPromises.push(
                    dbClient.saveQRScan(session.ID, `QR_CODE_${i}`)
                );
            }

            const results = await Promise.all(scanPromises);
            const endTime = Date.now();

            const successfulScans = results.filter(r => r.success);
            const duplicateScans = results.filter(r => !r.success);

            expect(successfulScans.length).toBe(50);
            expect(endTime - startTime).toBeLessThan(5000); // Under 5 seconds
        });

        test('should handle rapid RFID tag switches', async () => {
            const tags = ['53004114', '87654321'];
            const rapidSwitches = 20;

            for (let i = 0; i < rapidSwitches; i++) {
                const tagId = tags[i % 2];
                rfidListener.simulateTag(tagId);

                // Small delay to prevent overlap
                await waitFor(10);
            }

            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledTimes(rapidSwitches);
        });
    });

    describe('Data Consistency Integration', () => {
        test('should maintain data consistency across operations', async () => {
            const tagId = '53004114';
            const user = await dbClient.getUserByEPC(tagId);
            const session = await dbClient.createSession(user.ID);

            // Multiple QR scans
            const qrCodes = ['QR001', 'QR002', 'QR003'];
            const scanResults = [];

            for (const qr of qrCodes) {
                const result = await dbClient.saveQRScan(session.ID, qr);
                scanResults.push(result);
            }

            // All should be successful
            expect(scanResults.every(r => r.success)).toBe(true);

            // Session should have all scans
            const sessionScans = dbClient.mockData.qrScans.filter(s =>
                s.SessionID === session.ID
            );
            expect(sessionScans.length).toBe(3);

            // End session
            await dbClient.endSession(session.ID);

            // Session should be inactive but data preserved
            const endedSession = dbClient.mockData.sessions.find(s =>
                s.ID === session.ID
            );
            expect(endedSession.Active).toBe(0);
            expect(sessionScans.length).toBe(3); // Data still there
        });
    });
});

// tests/integration/frontend-backend-integration.test.js
/**
 * Integration Tests für Frontend-Backend Kommunikation
 */

const { mockElectron } = require('../mocks/electron.mock');

describe('Frontend-Backend Integration', () => {
    let mockMainProcess;
    let mockRenderer;

    beforeEach(() => {
        mockMainProcess = {
            ipcHandlers: new Map(),
            dbClient: new MockDatabaseClient(),
            rfidListener: new MockRFIDListener(),
            currentSession: null
        };

        mockRenderer = {
            electronAPI: {
                db: {},
                session: {},
                qr: {},
                rfid: {},
                on: jest.fn(),
                off: jest.fn()
            }
        };

        // Setup IPC mocking
        mockMainProcess.ipcHandlers.set('db-get-user-by-epc', async (tagId) => {
            return await mockMainProcess.dbClient.getUserByEPC(tagId);
        });

        mockMainProcess.ipcHandlers.set('session-create', async (userId) => {
            return await mockMainProcess.dbClient.createSession(userId);
        });

        mockMainProcess.ipcHandlers.set('qr-scan-save', async (sessionId, payload) => {
            return await mockMainProcess.dbClient.saveQRScan(sessionId, payload);
        });

        // Mock electron IPC
        mockElectron.ipcMain.handle.mockImplementation((channel, handler) => {
            mockMainProcess.ipcHandlers.set(channel, handler);
        });
    });

    describe('IPC Communication', () => {
        test('should handle user lookup via IPC', async () => {
            await mockMainProcess.dbClient.connect();
            const tagId = '53004114';

            const handler = mockMainProcess.ipcHandlers.get('db-get-user-by-epc');
            const user = await handler(tagId);

            expect(user).toBeTruthy();
            expect(user.EPC).toBe(parseInt(tagId, 16));
        });

        test('should handle session creation via IPC', async () => {
            await mockMainProcess.dbClient.connect();
            const userId = 1;

            const handler = mockMainProcess.ipcHandlers.get('session-create');
            const session = await handler(userId);

            expect(session).toBeTruthy();
            expect(session.UserID).toBe(userId);
            expect(session.Active).toBe(1);
        });

        test('should handle QR scan via IPC', async () => {
            await mockMainProcess.dbClient.connect();
            const sessionId = 1;
            const payload = 'TEST_QR_IPC';

            const handler = mockMainProcess.ipcHandlers.get('qr-scan-save');
            const result = await handler(sessionId, payload);

            expect(result.success).toBe(true);
            expect(result.data.RawPayload).toBe(payload);
        });
    });

    describe('Event Communication', () => {
        test('should send user login event to renderer', () => {
            const mockWebContents = {
                send: jest.fn()
            };

            const userData = {
                user: { ID: 1, BenutzerName: 'Test User' },
                session: { ID: 1, StartTS: new Date().toISOString() }
            };

            mockWebContents.send('user-login', userData);
            expect(mockWebContents.send).toHaveBeenCalledWith('user-login', userData);
        });

        test('should send QR scan result to renderer', () => {
            const mockWebContents = {
                send: jest.fn()
            };

            const scanResult = {
                success: true,
                status: 'saved',
                data: { ID: 1, RawPayload: 'TEST_QR' }
            };

            mockWebContents.send('qr-scan-result', scanResult);
            expect(mockWebContents.send).toHaveBeenCalledWith('qr-scan-result', scanResult);
        });
    });

    describe('Error Handling Integration', () => {
        test('should handle IPC errors gracefully', async () => {
            const errorHandler = jest.fn().mockRejectedValue(new Error('IPC Error'));
            mockMainProcess.ipcHandlers.set('test-error', errorHandler);

            try {
                await errorHandler();
            } catch (error) {
                expect(error.message).toBe('IPC Error');
            }
        });

        test('should send error events to renderer', () => {
            const mockWebContents = {
                send: jest.fn()
            };

            const errorData = {
                error: 'Database connection failed',
                timestamp: new Date().toISOString()
            };

            mockWebContents.send('system-error', errorData);
            expect(mockWebContents.send).toHaveBeenCalledWith('system-error', errorData);
        });
    });
});

// tests/integration/complete-workflow.test.js
/**
 * Complete End-to-End Workflow Tests
 */

describe('Complete Application Workflow', () => {
    let dbClient;
    let rfidListener;
    let mockApp;

    beforeEach(async () => {
        dbClient = new MockDatabaseClient();
        await dbClient.connect();

        rfidListener = new MockRFIDListener();
        await rfidListener.start();

        mockApp = {
            currentSession: null,
            qrScanHistory: [],
            systemStatus: {
                database: true,
                rfid: true
            }
        };
    });

    afterEach(async () => {
        if (rfidListener) await rfidListener.stop();
        if (dbClient) await dbClient.close();
    });

    test('should complete full worker shift workflow', async () => {
        // 1. Worker arrives and scans RFID tag
        const workerTag = '53004114';
        const user = await dbClient.getUserByEPC(workerTag);
        expect(user).toBeTruthy();

        // 2. Session is created
        const session = await dbClient.createSession(user.ID);
        mockApp.currentSession = {
            sessionId: session.ID,
            userId: user.ID,
            startTime: session.StartTS
        };

        // 3. Worker scans multiple packages during shift
        const packages = [
            'PKG001_Morning',
            'PKG002_Morning',
            'PKG003_Afternoon',
            'PKG004_Afternoon',
            'PKG005_Evening'
        ];

        for (const pkg of packages) {
            const scanResult = await dbClient.saveQRScan(session.ID, pkg);
            expect(scanResult.success).toBe(true);
            mockApp.qrScanHistory.push(scanResult);
        }

        expect(mockApp.qrScanHistory.length).toBe(5);

        // 4. Worker scans same package again (duplicate detection)
        const duplicateScan = await dbClient.saveQRScan(session.ID, 'PKG001_Morning');
        expect(duplicateScan.success).toBe(false);
        expect(duplicateScan.status).toBe('duplicate_cache');

        // 5. Worker finishes shift and scans RFID tag to logout
        const endResult = await dbClient.endSession(session.ID);
        expect(endResult).toBe(true);
        mockApp.currentSession = null;

        // 6. Verify session data integrity
        const sessionData = dbClient.mockData.sessions.find(s => s.ID === session.ID);
        expect(sessionData.Active).toBe(0);
        expect(sessionData.EndTS).toBeTruthy();

        const sessionScans = dbClient.mockData.qrScans.filter(s => s.SessionID === session.ID);
        expect(sessionScans.length).toBe(5); // Only successful scans
    });

    test('should handle multiple workers on same shift', async () => {
        const workers = [
            { tag: '53004114', name: 'Worker A' },
            { tag: '87654321', name: 'Worker B' }
        ];

        const sessions = [];

        // Both workers login
        for (const worker of workers) {
            const user = await dbClient.getUserByEPC(worker.tag);
            const session = await dbClient.createSession(user.ID);
            sessions.push({ ...session, workerName: worker.name });
        }

        // Workers scan different packages
        await dbClient.saveQRScan(sessions[0].ID, 'WORKER_A_PKG_001');
        await dbClient.saveQRScan(sessions[1].ID, 'WORKER_B_PKG_001');
        await dbClient.saveQRScan(sessions[0].ID, 'WORKER_A_PKG_002');

        // Verify correct attribution
        const workerAScans = dbClient.mockData.qrScans.filter(s => s.SessionID === sessions[0].ID);
        const workerBScans = dbClient.mockData.qrScans.filter(s => s.SessionID === sessions[1].ID);

        expect(workerAScans.length).toBe(2);
        expect(workerBScans.length).toBe(1);
        expect(workerAScans[0].RawPayload).toBe('WORKER_A_PKG_001');
        expect(workerBScans[0].RawPayload).toBe('WORKER_B_PKG_001');

        // Both workers logout
        for (const session of sessions) {
            await dbClient.endSession(session.ID);
        }
    });

    test('should handle system restart mid-session', async () => {
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